// Copy rules — DESIGN.md Part 10, "say less".
//
// Part 10 opens with "this is the most commonly violated rule in
// AI-built UI. Treat it as a hard constraint." It is, and this file
// exists because the violations come back: CLAUDE.md counted sixteen
// em dashes in user-facing strings at 2.8.65, and there were twenty by
// 2.9.120.
//
// These check what source text can see. The rest of Part 10 — whether
// a string earns its place at all — has to be read on a rendered
// screen, which is what tools/copy-dump.mjs is for.
import { readFileSync } from 'fs';
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

// Strings only: comments are prose and may say whatever they like.
const userText = src.split('\n')
  .filter((ln) => { const t = ln.trim(); return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); })
  .map((ln) => ln.replace(/\/\/.*$/, ''))
  .map((ln) => [...ln.matchAll(/["'`]([^"'`]{4,})["'`]/g)].map((m) => m[1]).join(' ␟ '))
  .filter(Boolean)
  .join('\n');

// 10.2 bans both outright in UI chrome.
check('no exclamation marks in UI text', !/\w!(\s|$|["'`])/.test(userText));
check('no emoji in UI chrome', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]/u.test(userText));

// 10.4: "No first-person app voice (I, we) inside the tool." The app
// is a page in a browser, not a service with staff.
check('no first-person app voice', !/\b(we['’]re|we['’]ll|we['’]ve|\bwe |\bus\b|\bour )\b/i.test(
  userText.replace(/your|yours/gi, '')));

// 10.2: "Redundant action words" — the control is the instruction.
check('no "click here"', !/click here/i.test(userText));

// 10.4: numbers over adjectives, and hedging in an error leaves the
// reader no better off. "usually" in a rate-limit message was the app
// guessing out loud.
check('no hedged advice in errors', !/usually clears it|should probably|might want to/i.test(userText));

// The em-dash habit. Separators are fine — "Artist · 2 of 4" and
// "Album tracklist — the bulk of a dive" both label rather than join —
// so this pins the count rather than banning the character, and names
// what the budget is for.
{
  const dashes = (userText.match(/—/g) || []).length;
  check(`em dashes held at or under 8 (found ${dashes})`, dashes <= 8);
}

// Specific rewrites worth keeping rewritten.
check('the empty scan does not say it twice', !/No duplicate recordings found/.test(src));
check('home empty state does not explain the cache', !/suggestions are built from your library/.test(src));
check('the Last.fm note is not hedged', !/Optional but recommended/.test(src));
check('and does not say "simply"', !/simply don['’]t appear/.test(src));
check('the crate empty state lost its filler', !/they['’]ll wait here/.test(src));

// 9.3: sentence case for buttons, titles and menu items. Proper nouns
// stay capitalised, so this looks for a capitalised second word that
// isn't one — "Create Playlist" beside the sampler's own "Create
// playlist" was the same action under two capitalisations.
{
  const PROPER = /Spotify|Last\.fm|DeepDive|Client ID|Multi-Dip|Dip|Dive|API|URI|ID|Up next|Home|Mixes|Settings|Crate/;
  const labels = new Set();
  for (const m of src.matchAll(/(?:confirmLabel|cancelLabel):\s*"([^"]+)"/g)) labels.add(m[1]);
  for (const m of src.matchAll(/<button[^>]*>([A-Za-z][^<${}]*)</g)) labels.add(m[1].trim());
  const titled = [...labels].filter((s) => /[a-z] [A-Z]/.test(s) && !PROPER.test(s));
  check(`buttons are sentence case (${titled.slice(0, 3).join(', ') || 'all clear'})`, titled.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
