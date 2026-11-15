// Restoring a backup skips setup (Joseph, 15 Nov: "why can't I use my
// export import tool first thing to not set everything up?").
//
// Before 2.9.155 a backup held no Client ID or Last.fm key, merge mode
// dropped every setting, the playlist record was exported and never read
// back, and the setup screens offered no way to import at all.
import { readFileSync } from 'node:fs';
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const h = await import('../docs/js/history.js');
const { importMessage } = await import('../docs/js/backup-import.js');
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const check = (l, c) => { if (c) pass++; else { fail++; console.log('FAIL:', l); } };
const ID = '0123456789abcdef0123456789abcdef', KEY = 'fedcba9876543210fedcba9876543210';

// --- export -------------------------------------------------------------
store.set('deepdive_client_id', ID);
store.set('deepdive_lastfm_key', KEY);
store.set('deepdive_access_token', 'secret-token');
store.set('deepdive_refresh_token', 'secret-refresh');
store.set('deepdive_theme', 'dark');
store.set('deepdive_actions', JSON.stringify([{ id: 'a1', type: 'playlist', playlistId: 'p1' }]));
const backup = h.exportData();
check('a backup carries the Spotify Client ID', backup.data.deepdive_client_id === ID);
check('and the Last.fm key', backup.data.deepdive_lastfm_key === KEY);
check('but never the Spotify sign-in', !Object.keys(backup.data).some((k) => /token|verifier|state/.test(k)));
check('the backup format number is unchanged, so older builds still read it', backup.version === 1);

// --- restore on a fresh install ------------------------------------------
store.clear();
const sum = h.importData(JSON.parse(JSON.stringify(backup)), { mode: 'merge' });
check('a fresh install gets the Client ID', store.get('deepdive_client_id') === ID && sum.clientId);
check('and the Last.fm key', store.get('deepdive_lastfm_key') === KEY && sum.lastfmKey);
check('and settings it has none of yet', store.get('deepdive_theme') === 'dark' && sum.settings >= 1);
check('and the record of playlists DeepDive made', JSON.parse(store.get('deepdive_actions')).length === 1 && sum.actions === 1);
check('no sign-in arrives with it', !store.has('deepdive_access_token'));

// --- restore over a set-up device ----------------------------------------
store.set('deepdive_client_id', 'ffffffffffffffffffffffffffffffff');
store.set('deepdive_theme', 'light');
const again = h.importData(JSON.parse(JSON.stringify(backup)), { mode: 'merge' });
check('merge keeps this device\'s own Client ID', store.get('deepdive_client_id') === 'ffffffffffffffffffffffffffffffff' && !again.clientId);
check('and its own settings', store.get('deepdive_theme') === 'light');
check('and does not duplicate the playlist record', JSON.parse(store.get('deepdive_actions')).length === 1);
h.importData(JSON.parse(JSON.stringify(backup)), { mode: 'replace' });
check('replace takes the backup\'s', store.get('deepdive_client_id') === ID && store.get('deepdive_theme') === 'dark');

// --- nonsense stays out ---------------------------------------------------
store.clear();
h.importData({ format: 'deepdive-backup', version: 1, data: { deepdive_client_id: '<script>', deepdive_lastfm_key: 'short' } });
check('a malformed Client ID or key is not planted', !store.has('deepdive_client_id') && !store.has('deepdive_lastfm_key'));
store.set('deepdive_client_id', '');
h.importData(JSON.parse(JSON.stringify(backup)), { mode: 'merge' });
check('an empty stored Client ID counts as none', store.get('deepdive_client_id') === ID);

// --- what it says -------------------------------------------------------
check('the message names what was restored', /Restored your Spotify Client ID and Last\.fm key\./.test(importMessage({ pins: 0, blocked: 0, dives: 0, clientId: true, lastfmKey: true })));
check('and still counts items', /Added 2 pins/.test(importMessage({ pins: 2, blocked: 0, dives: 0 })));
check('an empty restore says so', importMessage({ pins: 0, blocked: 0, dives: 0 }) === 'Backup imported. No new items to add.');

// --- the setup screens ----------------------------------------------------
const landing = src.slice(src.indexOf('function renderLanding()'), src.indexOf('// ---- demo screens ----'));
const setup = src.slice(src.indexOf('function renderSetup()'), src.indexOf('function renderClientStep()'));
const wire = src.slice(src.indexOf('function wireRestore()'), src.indexOf('/** Step 1: create the Spotify app. */'));
check('the first screen offers Restore from a backup', /\$\{restoreBlockHtml\(\)\}/.test(landing) && /wireRestore\(\);/.test(landing));
check('and so does step 1', /\$\{restoreBlockHtml\(\)\}/.test(setup) && /wireRestore\(\);/.test(setup));
check('the button and file input are there', /id="onboard-restore">Restore from a backup</.test(src) && /id="onboard-restore-file"/.test(src));
check('through the same import as Settings', /wireBackupImport\(document\.getElementById\("onboard-restore-file"\), document\.getElementById\("onboard-restore"\)/.test(wire));
check('a restored Client ID skips to Connect, or Last.fm when there\'s no key', /if \(lastfm\.getKey\(\)\) renderConnect\(\); else renderLastfmStep\(\);/.test(wire));
check('an older backup without one keeps its data and carries on with setup', /if \(!auth\.getClientId\(\)\) \{[\s\S]*?renderSetup\(\);/.test(wire));
check('Settings says what a backup holds', /Spotify Client ID and Last\.fm key, as a plain JSON file\. Not your Spotify sign-in\./.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
