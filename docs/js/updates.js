// Android downloads and validates the APK; this module only owns UI state.
let sequence = 0, listening = false;
const pending = new Map(), subscribers = new Set();
let state = { phase: 'idle', candidate: null, ready: false, current: 0, total: 0, error: '' };
const KEY = 'deepdive.updates';
export function supportsUpdates() { return typeof globalThis.window?.DeepDiveUpdates?.postMessage === 'function'; }
export function updatePreferences() {
  try { const p = JSON.parse(localStorage.getItem(KEY) || '{}'); return { automatic: p.automatic !== false, channel: p.channel === 'stable' ? 'stable' : 'testing' }; }
  catch { return { automatic: true, channel: 'testing' }; }
}
export function saveUpdatePreferences(p) { localStorage.setItem(KEY, JSON.stringify({ automatic: !!p.automatic, channel: p.channel === 'stable' ? 'stable' : 'testing' })); }
function publish(patch) { state = { ...state, ...patch }; for (const fn of subscribers) fn(state); }
function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('deepdive-update-response', ({ detail }) => {
    const task = pending.get(detail?.id); if (!task) return;
    pending.delete(detail.id); clearTimeout(task.timeout);
    detail.error ? task.reject(new Error(detail.error)) : task.resolve(detail.result);
  });
  window.addEventListener('deepdive-update-progress', ({ detail }) => {
    if (!['downloading', 'verifying', 'ready'].includes(detail?.state)) return;
    publish({ phase: detail.state, current: Math.max(0, Number(detail.current) || 0), total: Math.max(0, Number(detail.total) || 0) });
  });
}
function request(op, args = {}) {
  if (!supportsUpdates()) return Promise.reject(new Error('Updates are available in the Android app.'));
  listen(); const id = String(++sequence);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Update operation timed out. Try again.')); }, op === 'download' ? 12 * 60 * 1000 : 120000);
    pending.set(id, { resolve, reject, timeout });
    try { window.DeepDiveUpdates.postMessage(JSON.stringify({ id, op, ...args })); }
    catch (e) { clearTimeout(timeout); pending.delete(id); reject(e); }
  });
}
export async function checkForUpdates() {
  if (['checking', 'downloading', 'verifying', 'installing'].includes(state.phase)) return;
  publish({ phase: 'checking', error: '', candidate: null, ready: false });
  try {
    const result = await request('check', { channel: updatePreferences().channel });
    publish({ ...result, phase: result.ready ? 'ready' : result.candidate ? 'available' : 'current', error: '' });
    return result;
  } catch (e) { publish({ phase: 'error', error: e.message }); }
}
export async function downloadUpdate() {
  if (!state.candidate || ['checking', 'downloading', 'verifying', 'installing'].includes(state.phase)) return;
  publish({ phase: 'downloading', error: '', current: 0, total: state.candidate.size });
  try { await request('download'); publish({ phase: 'ready', ready: true }); }
  catch (e) { publish({ phase: 'error', ready: false, error: e.message }); }
}
export async function installUpdate(isWorking = () => false) {
  if (isWorking()) { publish({ error: 'Finish or cancel the current dive or scan before installing.' }); return; }
  if (!state.ready || state.phase === 'installing') return;
  publish({ phase: 'installing', error: '' });
  try {
    const r = await request('install');
    publish({ phase: 'ready', error: r.permissionRequired ? 'Allow installs from DeepDive, return here, then tap Install update again.' : '' });
  } catch (e) { publish({ phase: 'ready', error: e.message }); }
}
export async function cancelUpdate() { try { await request('cancel'); } catch (e) { publish({ error: e.message }); } }
export function observeUpdates(fn) { subscribers.add(fn); fn(state); return () => subscribers.delete(fn); }
export function mountUpdates(host, isWorking) {
  const pref = updatePreferences();
  host.innerHTML = `<div class="set-group-label">Updates</div>
    <div class="set-row"><div class="set-row-text"><label class="set-row-title" for="update-auto">Check automatically</label></div>
      <label class="set-switch"><input type="checkbox" id="update-auto" ${pref.automatic ? 'checked' : ''}><span class="switch-track"><span class="switch-thumb"></span></span></label></div>
    <div class="set-row"><div class="set-row-text"><label class="set-row-title" for="update-channel">Channel</label></div>
      <select id="update-channel" class="sort-select"><option value="stable">Stable</option><option value="testing">Testing</option></select></div>
    <div class="set-row set-row-block"><div class="set-row-title" id="update-title">App updates</div>
      <p id="update-status" role="status" aria-live="polite"></p>
      <progress id="update-progress" max="100" hidden aria-label="Update download"></progress>
      <details id="update-notes-wrap" hidden><summary>Release notes</summary><p id="update-notes" class="update-notes"></p></details>
      <div class="backup-buttons"><button class="btn btn-ghost" id="update-check">Check for updates</button>
      <button class="btn btn-primary" id="update-download" hidden>Download update</button>
      <button class="btn btn-primary" id="update-install" hidden>Install update</button>
      <button class="btn btn-ghost" id="update-cancel" hidden>Cancel download</button></div></div>`;
  const el = id => host.querySelector('#update-' + id);
  el('channel').value = pref.channel;
  const save = () => saveUpdatePreferences({ automatic: el('auto').checked, channel: el('channel').value });
  el('auto').addEventListener('change', save);
  el('channel').addEventListener('change', () => { save(); checkForUpdates(); });
  el('check').addEventListener('click', checkForUpdates);
  el('download').addEventListener('click', downloadUpdate);
  el('install').addEventListener('click', () => installUpdate(isWorking));
  el('cancel').addEventListener('click', cancelUpdate);
  let unsubscribe;
  unsubscribe = observeUpdates(s => {
    if (host.isConnected === false) { unsubscribe?.(); return; }
    const downloading = s.phase === 'downloading', busy = ['checking', 'downloading', 'verifying', 'installing'].includes(s.phase);
    const percent = s.total ? Math.min(100, Math.floor(s.current / s.total * 100)) : 0;
    el('title').textContent = s.candidate ? `DeepDive ${s.candidate.version}${s.candidate.testing ? ' · Testing' : ''}` : 'App updates';
    const status = { checking: 'Checking…', downloading: `${percent}% · ${(s.current / 1048576).toFixed(1)} / ${(s.total / 1048576).toFixed(1)} MB`, verifying: 'Verifying update…', installing: 'Opening Android installer…', ready: 'Ready to install', current: 'Up to date', available: 'Update available' };
    el('status').textContent = s.error || status[s.phase] || 'Check for a newer version.';
    el('check').disabled = busy; el('auto').disabled = busy; el('channel').disabled = busy;
    el('download').hidden = !s.candidate || s.ready || busy;
    el('install').hidden = !s.ready || busy;
    el('cancel').hidden = !downloading;
    el('progress').hidden = !downloading && s.phase !== 'verifying'; el('progress').value = percent;
    el('notes-wrap').hidden = !s.candidate?.notes; el('notes').textContent = s.candidate?.notes || '';
  });
}
export function autoCheckUpdates(onAvailable) {
  if (!supportsUpdates() || !updatePreferences().automatic) return;
  checkForUpdates().then(r => { if (r?.candidate) onAvailable(r.candidate); });
}
