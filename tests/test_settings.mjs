// Settings.
//
// Nine sections, most of them a heading above a single button, ordered
// by nothing in particular: Appearance and Theme were separated by
// Playlists, and "Manage" said nothing about the pins inside it.
// Credentials, backups and pacing sat in the same flat run as the theme
// picker.
//
// Regrouped, and anything irreversible, credential-bearing, or only
// meaningful when something has gone wrong is now behind a collapsed
// Advanced section.
import { readFileSync } from 'fs';
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

const fn = src.slice(src.indexOf('function renderSettings'), src.indexOf('const msg = document.getElementById("settings-msg")'));
const adv = fn.slice(fn.indexOf('<details class="advanced"'), fn.indexOf('</details>'));
const plain = fn.slice(0, fn.indexOf('<details class="advanced"'));

check('advanced section exists', adv.length > 0);
check('and is collapsed by default', !/<details class="advanced"[^>]*\sopen/.test(fn));

// What belongs behind it.
check('credentials are advanced', /id="set-client-id"/.test(adv));
check('redirect uri is advanced', /id="set-redirect-uri"/.test(adv));
check('backup import/export is advanced', /id="set-export"/.test(adv) && /id="set-import"/.test(adv));
check('pacing reset is advanced', /id="set-reset-pacing"/.test(adv));
check('build toggle is advanced', /id="set-show-build"/.test(adv));

// What must stay in front.
check('theme stays visible', /data-theme-choice/.test(plain));
check('support link switch stays visible', /id="set-show-bmc"/.test(plain));
check('library scan stays visible', /id="go-scrub"/.test(plain));
check('playlist cleanup stays visible', /id="find-playlists"/.test(plain));
check('pins stay visible', /id="go-pins"/.test(plain));
check('history stays visible', /id="go-history"/.test(plain));
check('disconnect stays visible', /id="set-disconnect"/.test(plain));

// Grouping fixes.
check('theme and support link are one section', plain.indexOf('Appearance') < plain.indexOf('data-theme-choice') && plain.indexOf('data-theme-choice') < plain.indexOf('set-show-bmc'));
check('pins section named for its contents', /<span class="label">Pins &amp; blocked<\/span>/.test(plain));
check('no meaningless Manage heading', !/<span class="label">Manage<\/span>/.test(fn));

// Required by the Developer Terms and previously absent everywhere.
check('spotify is attributed', /provided by Spotify/.test(fn));
check('and affiliation disclaimed', /not affiliated with Spotify/.test(fn));

// The summary should read as one row, not a section with hidden
// contents — a casual user should be able to stop reading at it.
check('advanced summary is styled', /\.advanced > summary \{/.test(css));
check('default disclosure marker is hidden', /details-marker \{ display:none; \}/.test(css));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
