// Execute the sign-in flow with the Tauri core/event interfaces, rather
// than asserting that an uncallable plugin namespace appears in source.
import * as auth from '../docs/js/auth.js';
import { openNativeUrl, watchNativeCallbacks } from '../docs/js/native.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) pass++;
  else { fail++; console.log('FAIL:', label); }
}
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
globalThis.document = { title: 'DeepDive' };
let opens = [], eventHandler, current = null, unlistened = 0;
globalThis.window = {
  location: { origin: 'http://tauri.localhost', pathname: '/app/index.html', search: '', href: 'bundled-page' },
  history: { replaceState() { throw new DOMException('cross-origin URL', 'SecurityError'); } },
  __TAURI__: {
    core: { invoke: async (command, args) => {
      if (command === 'plugin:opener|open_url') { opens.push(args.url); return; }
      if (command === 'plugin:deep-link|get_current') return current;
      throw new Error('Unknown command: ' + command);
    } },
    event: { listen: async (name, handler) => {
      check('subscribe to the plugin event', name === 'deep-link://new-url');
      eventHandler = handler;
      return () => { unlistened++; };
    } },
  },
};
auth.setClientId('test-client');
await auth.beginLogin();
const login = new URL(opens[0]);
check('system browser receives Spotify authorize URL', login.origin === 'https://accounts.spotify.com');
check('native redirect sent to Spotify', login.searchParams.get('redirect_uri') === 'deepdive://callback');
check('PKCE challenge is present', login.searchParams.get('code_challenge')?.length === 43);
check('native webview stays on its page', window.location.href === 'bundled-page');
const state = login.searchParams.get('state');
const callback = `deepdive://callback?code=test-code&state=${state}`;

for (const bad of [
  `https://example.com/?code=test-code&state=${state}`,
  `deepdive://other?code=test-code&state=${state}`,
  `deepdive://callback/other?code=test-code&state=${state}`,
  `deepdive://user@callback?code=test-code&state=${state}`,
  'not a URL', 'deepdive://callback?unrelated=true',
]) check('unrelated callback rejected: ' + bad.split('?')[0], !auth.acceptNativeCallback(bad));

// Android supplies the cold-start URL from get_current. Also deliver
// it as an event during that read to reproduce the startup race.
current = [callback];
const invoke = window.__TAURI__.core.invoke;
window.__TAURI__.core.invoke = async (command, args) => {
  if (command === 'plugin:deep-link|get_current') eventHandler({ payload: [callback] });
  return invoke(command, args);
};
let delivered = 0;
const stop = await watchNativeCallbacks((url) => {
  delivered++;
  auth.acceptNativeCallback(url);
});
check('cold-start and simultaneous event delivered once', delivered === 1);

let exchanges = 0, exchangeBody;
globalThis.fetch = async (url, options) => {
  check('token exchange goes to Spotify', url === 'https://accounts.spotify.com/api/token');
  exchanges++;
  exchangeBody = options.body;
  return { ok: true, json: async () => ({ access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600 }) };
};
const result = await auth.handleRedirectCallback();
check('native exchange completes despite cross-origin history restriction', result.ok === true);
check('exchange uses the original verifier', exchangeBody.get('code_verifier')?.length === 64);
check('exchange uses native redirect', exchangeBody.get('redirect_uri') === 'deepdive://callback');
check('tokens saved', auth.isLoggedIn());
check('pending login cleared', !store.has('deepdive_pkce_state') && !store.has('deepdive_pkce_verifier'));
eventHandler({ payload: [callback] });
check('repeat intent ignored', delivered === 1);
check('consumed callback is not exchanged again', (await auth.handleRedirectCallback()).ok === null && exchanges === 1);
check('stale cold-start intent ignored after login', !auth.acceptNativeCallback(callback));
stop();
check('listener can be removed', unlistened === 1);

// Warm return on a new login still arrives without restarting the app.
await auth.beginLogin();
const nextState = new URL(opens.at(-1)).searchParams.get('state');
eventHandler({ payload: [`deepdive://callback?code=next-code&state=${nextState}`] });
check('warm callback completes', (await auth.handleRedirectCallback()).ok === true);
await auth.beginLogin();
auth.acceptNativeCallback('deepdive://callback?code=forged&state=wrong');
check('wrong state refused without token exchange', (await auth.handleRedirectCallback()).error === 'state_mismatch' && exchanges === 2);
auth.acceptNativeCallback(`deepdive://callback?error=access_denied&state=${store.get('deepdive_pkce_state')}`);
check('denied permission returns an error without history failure', (await auth.handleRedirectCallback()).error === 'access_denied');

const capabilities = JSON.parse(readFileSync(new URL('../src-tauri/capabilities/default.json', import.meta.url)));
check('URL command has a URL scope as well as permission', capabilities.permissions.includes('opener:allow-default-urls'));

// A broken native opener must leave the shell intact so the existing
// Connect button's catch can show its error and allow a retry.
window.__TAURI__.core.invoke = async () => { throw new Error('opener denied'); };
let rejected = false;
try { await auth.beginLogin(); } catch { rejected = true; }
check('opener failure propagates to UI', rejected);
check('opener failure never navigates the webview', window.location.href === 'bundled-page');
delete window.__TAURI__.core;
rejected = false;
try { await openNativeUrl('https://open.spotify.com/'); } catch { rejected = true; }
check('missing core bridge fails explicitly', rejected);

// Web PKCE still navigates and strips auth params from its own URL.
delete window.__TAURI__;
window.location = { origin: 'https://jpluker.github.io', pathname: '/DeepDive/app/', search: '' };
let cleaned = null;
window.history.replaceState = (_state, _title, url) => { cleaned = url; };
await auth.beginLogin();
const webLogin = new URL(window.location.href);
check('web uses its page redirect', webLogin.searchParams.get('redirect_uri') === 'https://jpluker.github.io/DeepDive/app/');
window.location.search = `?code=web-code&state=${webLogin.searchParams.get('state')}`;
check('web exchange still completes', (await auth.handleRedirectCallback()).ok === true);
check('web callback URL is cleaned', cleaned === 'https://jpluker.github.io/DeepDive/app/');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
