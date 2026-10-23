// Plain-module equivalents of the Tauri plugin wrappers. withGlobalTauri
// exposes core.invoke and event.listen; it does not expose plugin-opener
// as __TAURI__.opener. Command names follow the plugins' guest-js APIs.
export async function openNativeUrl(url) {
  const invoke = window.__TAURI__?.core?.invoke;
  if (typeof invoke !== "function") {
    throw new Error("Couldn't open your browser. Close DeepDive and try again.");
  }
  await invoke("plugin:opener|open_url", { url });
}

// Subscribe before reading get_current: Android can deliver the intent
// before the webview loads, or while this call is pending. Both paths
// can report the same URL, so deliver it only once per page lifetime.
export async function watchNativeCallbacks(onUrl) {
  const listen = window.__TAURI__?.event?.listen;
  const invoke = window.__TAURI__?.core?.invoke;
  if (typeof listen !== "function" || typeof invoke !== "function") {
    throw new Error("Native sign-in is unavailable. Close DeepDive and try again.");
  }
  const seen = new Set();
  const deliver = (urls) => {
    if (!Array.isArray(urls)) return;
    for (const url of urls) {
      if (typeof url !== "string" || seen.has(url)) continue;
      seen.add(url);
      onUrl(url);
    }
  };
  const unlisten = await listen("deep-link://new-url", (event) => deliver(event.payload));
  try {
    deliver(await invoke("plugin:deep-link|get_current"));
  } catch (error) {
    unlisten();
    throw error;
  }
  return unlisten;
}
