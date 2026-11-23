// Saving a file the user asked for: a backup, a mix's CSV, Liked Songs.
//
// On the web this is the usual blob link with a download attribute. In
// the Android app that link does nothing at all: a WebView only
// downloads through a DownloadListener, and none can fetch a blob: URL.
// So every export there "succeeded" without writing anything. The app
// exposes DeepDiveFiles (MainActivity.kt), which writes the text into
// Downloads through MediaStore and answers with an event.
//
// In the app the user picks where it goes (Android's Save dialog, 2.9.158:
// Joseph "would have preferred to pick"); Downloads is the fallback when
// no picker is available.
//
// Result: { ok, place } where place is "picked" or "downloads" from the
// native side, "browser" when the browser took the download, or null.
// A dismissed picker is { ok: false, cancelled: true }.

const NAME_OK = /^[A-Za-z0-9 ._-]{1,120}\.(csv|json)$/;
const NATIVE_MIME = { csv: "text/csv", json: "application/json" };
const REPLY = "deepdive-file-saved";

/** Keep a filename to what the native side accepts. */
export function safeFileName(name, fallback = "deepdive") {
  const m = String(name || "").match(/^(.*?)(\.(csv|json))$/i);
  const ext = m ? m[3].toLowerCase() : "";
  const stem = (m ? m[1] : String(name || "")).replace(/[^A-Za-z0-9 ._-]+/g, "").replace(/\s+/g, " ").trim().slice(0, 100)
    || fallback;
  return ext ? `${stem}.${ext}` : stem;
}

export function nativeFilesAvailable(w = globalThis.window) {
  return typeof w?.DeepDiveFiles?.postMessage === "function";
}

function saveNative(w, filename, contents) {
  const ext = filename.split(".").pop().toLowerCase();
  return new Promise((resolve) => {
    const id = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    // Long enough to browse folders in the picker.
    const timer = setTimeout(() => { w.removeEventListener(REPLY, onReply); resolve({ ok: false, place: null, error: "Android didn't answer." }); }, 10 * 60 * 1000);
    function onReply(e) {
      const d = e.detail || {};
      if (d.id !== id) return;
      clearTimeout(timer);
      w.removeEventListener(REPLY, onReply);
      if (d.result) resolve({ ok: true, place: d.place === "picked" ? "picked" : "downloads" });
      else if (d.place === "cancelled") resolve({ ok: false, place: null, cancelled: true });
      else resolve({ ok: false, place: null, error: d.error || "" });
    }
    w.addEventListener(REPLY, onReply);
    try {
      w.DeepDiveFiles.postMessage(JSON.stringify({ id, name: filename, mime: NATIVE_MIME[ext], content: contents, pick: true }));
    } catch (e) {
      clearTimeout(timer);
      w.removeEventListener(REPLY, onReply);
      resolve({ ok: false, place: null, error: e.message || String(e) });
    }
  });
}

function saveBrowser(doc, filename, contents, mime) {
  try {
    const blob = new Blob([contents], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = doc.createElement("a");
    a.href = url;
    a.download = filename;
    doc.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke on the next tick; revoking immediately can cancel the
    // download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { ok: true, place: "browser" };
  } catch (e) {
    return { ok: false, place: null, error: e.message || String(e) };
  }
}

/** Save text as a file. Always resolves; check `ok`. */
export async function saveFile(filename, contents, mime, { w = globalThis.window, doc = globalThis.document } = {}) {
  const name = safeFileName(filename);
  if (nativeFilesAvailable(w) && NAME_OK.test(name)) return saveNative(w, name, contents);
  return saveBrowser(doc, name, contents, mime);
}

/** "Backup saved." / "Backup saved to Downloads." / failure line. */
export function savedLine(result, what) {
  if (result && result.cancelled) return "Not saved.";
  if (!result || !result.ok) return `Couldn't save the file.${result && result.error ? ` ${result.error}` : ""}`;
  return result.place === "downloads" ? `${what} saved to Downloads.` : `${what} saved.`;
}
