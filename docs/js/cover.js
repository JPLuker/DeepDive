/**
 * cover.js — build a playlist cover from the album art inside it.
 *
 * Confirmed possible before this was written: Spotify's image CDN sends
 * permissive CORS headers, so a cross-origin album image can be drawn
 * and the canvas read back. Without that the picture would appear on
 * screen and the export would throw, which is exactly the sort of thing
 * worth testing before building on it.
 *
 * Uploading needs the `ugc-image-upload` scope. DeepDive doesn't ask
 * for it up front — that would make every existing user reconnect for
 * something most will never use — so the caller has to check.
 */

// Spotify rejects anything over 256KB, and rejects it after the upload
// rather than before, so aim well under and step the quality down until
// it fits.
const MAX_BYTES = 256 * 1024;
const SIZE = 640;

/** Distinct album images from a track list, biggest first. */
export function albumImages(tracks, limit = 4) {
  const seen = new Set();
  const out = [];
  for (const t of tracks || []) {
    const al = t && t.album;
    // Two shapes reach here. Library tracks arrive from Spotify whole
    // and carry `album.images[]`. Catalogue tracks are trimmed during
    // the release read and carry a single `album.image_url`. Reading
    // only the first meant a Multi-Dip found no art at all, and the
    // cover was skipped without a word.
    const url = al
      ? (al.image_url
        || (al.images && al.images.length ? (al.images[0] && al.images[0].url) : null))
      : null;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= limit) break;
  }
  return out;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Without this the image loads but taints the canvas, and the
    // failure only appears at export.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load ${url}`));
    img.src = url;
  });
}

/**
 * A cover from up to four album images.
 *
 * One image fills the square; two split it; three or four make a grid.
 * Fewer than one is not an error — the caller simply doesn't get a
 * cover, which is better than a blank square.
 */
export async function buildCover(urls, { title = "" } = {}) {
  const list = (urls || []).slice(0, 4);
  if (!list.length) return null;

  const images = [];
  for (const url of list) {
    try { images.push(await loadImage(url)); } catch (e) { /* skip it */ }
  }
  if (!images.length) return null;

  const cv = document.createElement("canvas");
  cv.width = SIZE;
  cv.height = SIZE;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#0b0b0f";
  ctx.fillRect(0, 0, SIZE, SIZE);

  const half = SIZE / 2;
  if (images.length === 1) {
    ctx.drawImage(images[0], 0, 0, SIZE, SIZE);
  } else if (images.length === 2) {
    ctx.drawImage(images[0], 0, 0, half, SIZE);
    ctx.drawImage(images[1], half, 0, half, SIZE);
  } else {
    // Three images leave a quarter empty, so the first one takes two
    // cells rather than leaving a hole.
    const cells = images.length === 3
      ? [[0, 0, SIZE, half], [0, half, half, half], [half, half, half, half]]
      : [[0, 0, half, half], [half, 0, half, half], [0, half, half, half], [half, half, half, half]];
    images.forEach((img, i) => {
      const [x, y, w, h] = cells[i];
      ctx.drawImage(img, x, y, w, h);
    });
  }

  // A dark band along the bottom so a title stays readable over
  // whatever the artwork happens to be.
  if (title) {
    const grad = ctx.createLinearGradient(0, SIZE * 0.62, 0, SIZE);
    grad.addColorStop(0, "rgba(8,8,10,0)");
    grad.addColorStop(1, "rgba(8,8,10,0.92)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, SIZE * 0.62, SIZE, SIZE * 0.38);

    ctx.fillStyle = "#fff";
    ctx.font = "600 44px Inter, system-ui, sans-serif";
    ctx.textBaseline = "alphabetic";
    // Truncated rather than shrunk: a long name at a smaller size next
    // to a short one at full size looks like a mistake.
    let text = title;
    while (ctx.measureText(text).width > SIZE - 56 && text.length > 4) {
      text = text.slice(0, -1);
    }
    if (text !== title) text = text.slice(0, -1) + "…";
    ctx.fillText(text, 28, SIZE - 34);
  }

  return toJpeg(cv);
}

/** Step quality down until it fits Spotify's limit. */
function toJpeg(cv) {
  for (const q of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4]) {
    const data = cv.toDataURL("image/jpeg", q);
    const bytes = data.length - "data:image/jpeg;base64,".length;
    if (bytes <= MAX_BYTES) return data;
  }
  return null;
}

export const _internals = { MAX_BYTES, SIZE };
