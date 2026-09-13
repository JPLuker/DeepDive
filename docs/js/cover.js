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
 * A cover for a built playlist.
 *
 * One artist gets their photograph, whole. Album art in a grid is what
 * every playlist tool does and it says nothing about which playlist
 * this is — the face does, at a glance, in a list of forty.
 *
 * A Multi-Dip is the exception: several artists, so the square splits
 * between them. That split is the signal that it's a bill rather than
 * one artist, which is worth more than a tidier picture.
 *
 * @param urls   artist photographs, one per artist
 * @param kind   "Dip", "Dive", "Multi-Dip", "Mix" — set top right
 * @param title  set bottom left, usually the artist
 * @param split  divide the square between the images
 */
export async function buildCover(urls, { title = "", kind = "", split = false } = {}) {
  const list = (urls || []).filter(Boolean).slice(0, 4);
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

  // `drawImage` stretches to the box it's given, which distorts a
  // portrait photograph in a square. Crop to fill instead.
  const cover = (img, x, y, w, h) => {
    const scale = Math.max(w / img.width, h / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    ctx.restore();
  };

  const half = SIZE / 2;
  if (!split || images.length === 1) {
    cover(images[0], 0, 0, SIZE, SIZE);
  } else if (images.length === 2) {
    cover(images[0], 0, 0, half, SIZE);
    cover(images[1], half, 0, half, SIZE);
  } else {
    // Three leaves a quarter empty, so the first takes the top half.
    const cells = images.length === 3
      ? [[0, 0, SIZE, half], [0, half, half, half], [half, half, half, half]]
      : [[0, 0, half, half], [half, 0, half, half], [0, half, half, half], [half, half, half, half]];
    images.forEach((img, i) => cover(img, ...cells[i]));
  }

  // A band along the bottom so the title stays readable over whatever
  // the photograph happens to be.
  const grad = ctx.createLinearGradient(0, SIZE * 0.55, 0, SIZE);
  grad.addColorStop(0, "rgba(8,8,10,0)");
  grad.addColorStop(1, "rgba(8,8,10,0.94)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, SIZE * 0.55, SIZE, SIZE * 0.45);

  if (kind) drawKind(ctx, kind);
  if (title) drawTitle(ctx, title);
  await drawLogo(ctx);

  return toJpeg(cv);
}

/** What kind of thing this is, top right. */
function drawKind(ctx, kind) {
  ctx.font = "600 26px Inter, system-ui, sans-serif";
  const text = kind.toUpperCase();
  const w = ctx.measureText(text).width;
  const padX = 18, h = 46;
  const x = SIZE - w - padX * 2 - 24, y = 24;
  ctx.fillStyle = "rgba(8,8,10,0.62)";
  roundRect(ctx, x, y, w + padX * 2, h, h / 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padX, y + h / 2 + 1);
}

/** The name, bottom left, truncated rather than shrunk. */
function drawTitle(ctx, title) {
  ctx.fillStyle = "#fff";
  ctx.font = "700 46px Inter, system-ui, sans-serif";
  ctx.textBaseline = "alphabetic";
  // Room left for the logo in the corner.
  const room = SIZE - 56 - 86;
  let text = title;
  while (ctx.measureText(text).width > room && text.length > 4) text = text.slice(0, -1);
  if (text !== title) text = text.slice(0, -1) + "…";
  ctx.fillText(text, 28, SIZE - 36);
}

/**
 * The DeepDive mark, bottom right.
 *
 * Same origin as the page, so unlike the album art this never had a
 * CORS question hanging over it.
 */
function drawLogo(ctx) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const h = 54;
      const w = img.width * (h / img.height);
      ctx.globalAlpha = 0.92;
      ctx.drawImage(img, SIZE - w - 26, SIZE - h - 26, w, h);
      ctx.globalAlpha = 1;
      resolve();
    };
    // A missing logo is not a reason to lose the cover.
    img.onerror = () => resolve();
    img.src = "assets/dd-logo.png";
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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
