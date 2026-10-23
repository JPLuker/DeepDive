// Android owns the foreground-service lifetime and timer clock. The web
// app keeps its existing screen-awake fallback; it cannot promise OS work.
let sequence = 0;
const pending = new Map();
const leases = new Set();
let failure = null;
let listening = false;
function bridge() { return globalThis.window?.DeepDiveBackground; }
export function supportsBackgroundWork() { return typeof bridge()?.postMessage === 'function'; }
function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('deepdive-background-response', ({ detail }) => {
    const call = pending.get(detail?.id);
    if (!call) return;
    pending.delete(detail.id);
    clearTimeout(call.timeout);
    detail.error ? call.reject(new Error(detail.error)) : call.resolve(detail.result);
  });
  window.addEventListener('deepdive-background-stopped', () => {
    failure = new Error('Android stopped background work. Reopen DeepDive to continue.');
    for (const call of pending.values()) { clearTimeout(call.timeout); call.reject(failure); }
    pending.clear();
  });
}
function request(op, args = {}) {
  listen();
  const id = String(++sequence);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Background service did not respond. Keep DeepDive open.'));
    }, op === 'delay' ? Math.max(0, args.ms) + 15000 : 10000);
    pending.set(id, { resolve, reject, timeout });
    try { bridge().postMessage(JSON.stringify({ id, op, ...args })); }
    catch (error) { clearTimeout(timeout); pending.delete(id); reject(error); }
  });
}
export function checkBackgroundWork() { if (failure && leases.size) throw failure; }
export async function beginBackgroundWork(label) {
  if (!supportsBackgroundWork()) return { active: false, release: async () => {} };
  const token = `work-${Date.now()}-${++sequence}`;
  // Only clear a timeout when starting a new run, not a nested library read.
  if (!leases.size) failure = null;
  await request('begin', { token, label });
  leases.add(token);
  let released = false;
  return { active: true, release: async () => {
    if (released) return;
    released = true;
    leases.delete(token);
    await request('end', { token });
  } };
}
export async function withBackgroundWork(label, run) {
  // A denied/unsupported service should not prevent foreground use.
  let lease;
  try { lease = await beginBackgroundWork(label); }
  catch (error) { console.warn('[DeepDive] background work unavailable:', error.message); }
  try { return await run(); }
  finally { if (lease) await lease.release().catch(() => {}); }
}
export function backgroundDelay(ms) {
  checkBackgroundWork();
  if (leases.size && supportsBackgroundWork()) return request('delay', { ms: Math.max(0, ms) });
  return new Promise(resolve => setTimeout(resolve, ms));
}
