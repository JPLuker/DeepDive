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
// Backup came out of Advanced in 2.9.110: it is the only copy that
// outlives this browser, so it can't sit behind a disclosure triangle.
check('backup is not buried in advanced', !/id="set-export"/.test(adv));
check('pacing reset is advanced', /id="set-reset-pacing"/.test(adv));

// What must stay in front.
check('theme stays visible', /data-theme-choice/.test(plain));
check('support link switch stays visible', /id="set-show-bmc"/.test(plain));
// Moved to Dives in 2.8.24. Settings listing them too was duplication
// across two destinations; Settings holds settings.
check('library scan is not duplicated here', !/id="go-scrub"/.test(fn));
check('playlist cleanup stays visible', /id="find-playlists"/.test(plain));
check('pins are not duplicated here', !/id="go-pins"/.test(fn));
check('history is not duplicated here', !/id="go-history"/.test(fn));
check('disconnect stays visible', /id="set-disconnect"/.test(plain));

// Grouping fixes.
check('theme and support link are one section', plain.indexOf('Appearance') < plain.indexOf('data-theme-choice') && plain.indexOf('data-theme-choice') < plain.indexOf('set-show-bmc'));
// Settings is now grouped rows rather than headings above loose
// buttons, so there is no pins heading here at all — Dives owns it.
check('settings uses grouped rows', /class="set-group-label"/.test(fn) && /function settingRow/.test(src));
check('no meaningless Manage heading', !/<span class="label">Manage<\/span>/.test(fn));

// Required by the Developer Terms and previously absent everywhere.
check('spotify is attributed', /provided by Spotify/.test(fn));
check('and affiliation disclaimed', /not affiliated with Spotify/.test(fn));

// The summary should read as one row, not a section with hidden
// contents — a casual user should be able to stop reading at it.
check('advanced summary is styled', /\.advanced > summary \{/.test(css));
check('default disclosure marker is hidden', /details-marker \{ display:none; \}/.test(css));

// The rebuild: grouped rows on filled surfaces, matching tiles and
// track rows, rather than headings above loose buttons.
check('rows are a shared shape', /function settingRow\(\{ title, detail = "", control = "", id = "", block = false \}\)/.test(src));
check('rows are filled surfaces', /\.set-row \{[\s\S]{0,160}background:var\(--tile\)/.test(css));
check('groups are labelled', /\.set-group-label \{/.test(css));
check('controls that need a line get one', /\.set-row-block \{ flex-direction:column/.test(css));
check('no card wrapper around the page', !/<div class="card">\s*\n\s*<h1>Settings<\/h1>/.test(src));

// Ids stay literal so the orphan audit can still see them. Building
// them from arguments hid every one and blinded the check that has
// caught two real bugs.
for (const id of ['set-refresh','find-playlists','set-disconnect','set-reset-pacing','set-show-build','set-test-endpoints','set-export','set-import','set-save-id','set-show-bmc']) {
  check(`${id} is a literal id`, src.includes(`id="${id}"`));
}

// Joseph's note: credit at the bottom of settings.
check('credited', /Made by Joseph Luker/.test(src));
// The credit links to Joseph, not the repository — it credits a person,
// and the repo is linked separately as Source. Scoped to the credit
// line, which since 2.9.110 is a .set-note rather than its own footer.
{
  const i = src.indexOf('Made by Joseph Luker');
  const credit = src.slice(i, src.indexOf('</p>', i));
  check('github links to the profile', /github\.com\/JPLuker"/.test(credit));
  check('not the repo', !/github\.com\/JPLuker\/DeepDive/.test(credit));
  check('linkedin linked', /linkedin\.com\/in\//.test(credit));
}

// Data and storage is a top-level group, not buried in Advanced: a
// backup is the only copy that outlives the browser, so it can't be
// behind a disclosure triangle.
{
  const i = src.indexOf('<div class="set-group-label">Data and storage</div>');
  check('data and storage is its own group', i > -1);
  const advAt = src.indexOf('<details class="advanced"');
  check('and sits above Advanced', i > -1 && advAt > -1 && i < advAt);
  const grp = src.slice(i, src.indexOf('</div>`', i));
  check('export and import are both offered', /id="set-export"/.test(grp) && /id="set-import"/.test(grp));
  check('it says where the data lives', /Everything stays in this browser/.test(grp));
  check('and surfaces whether storage actually works', /id="set-storage-kind"/.test(grp));
}

// The version is in About (VERSIONING.md 4), and the opt-in build tag
// is a separate thing: off by default, so users don't see it, and
// there for checking which build actually loaded on a real device.
check('version is in About', /title: "Version"/.test(src));
check('the build toggle is back', /id="set-show-build"/.test(src));
check('and the tag it controls exists', /id="build-tag"/.test(css));
// It was in Diagnostics before About existed; it belongs with the
// version now. Advanced is still collapsed, and burying a switch for
// an on-screen element behind a triangle is why it was easy to lose.
check('the toggle is not buried in advanced', !/id="set-show-build"/.test(adv));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
