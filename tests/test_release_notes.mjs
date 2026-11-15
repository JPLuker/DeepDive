// Android release notes come from CHANGELOG.md, and CI refuses to
// rebuild a published number (VERSIONING.md 4.2, 5.2).
//
// publish-android.sh carried inline notes written for 2.9.143, so the
// 2.9.145 APK went out describing 2.9.143's changes, and the in-app
// updater showed them as what's new. It also uploaded with --clobber,
// which silently replaces an APK already published under that number.
import { readFileSync } from 'node:fs';
import { notesFor } from '../tools/release-notes.mjs';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let pass = 0, fail = 0;
const check = (l, c) => { if (c) pass++; else { fail++; console.log('FAIL:', l); } };

const log = '# Changelog\n\n## 2.9.146\n- New thing.\n\n## 2.9.145\n- Fixed thing.\n  More.\n\n## [3.0.0] — 2026-12-01\n### Added\n- Big.\n';
check('a version gets its own section', notesFor(log, '2.9.146') === '- New thing.');
check('not the next one', notesFor(log, '2.9.145') === '- Fixed thing.\n  More.');
check('bracketed headings work too', /Big/.test(notesFor(log, '3.0.0')));
check('a version without a section has no notes', notesFor(log, '2.9.14') === null && notesFor(log, '9.9.9') === null);
const BUILD = read('docs/js/app.js').match(/export const BUILD = "([^"]+)"/)[1];
check(`the current build ${BUILD} has changelog notes`, !!notesFor(read('CHANGELOG.md'), BUILD));

// 2.9.149: Android publishes through tools/publish-untested.sh, shared
// with desktop; test_publish_untested.mjs drives it end to end.
const pub = read('tools/publish-untested.sh');
check('publishing takes its notes from the changelog', /node tools\/release-notes\.mjs "\$V"/.test(pub));
check('no hard-coded description of one build', !/genre shelf|in-app updater, a/.test(pub + read('tools/publish-android.sh')));
check('an APK is never replaced in place', !/--clobber/.test(pub + read('tools/publish-android.sh')));
check('the untested warning stays first', /^\s*echo "> ⚠️ \*\*UNTESTED BUILD\.\*\*/m.test(pub));

const wf = read('.github/workflows/native.yml');
const guard = wf.indexOf('tools/version-guard.sh');
check('the version guard runs before the SDK, NDK and Rust', guard > 0 && guard < wf.indexOf('setup-java') && guard < wf.indexOf('Install the NDK'));
const vg = read('tools/version-guard.sh');
check('a published APK name fails the guard', /grep -qx "\$ASSET"/.test(vg) && /exit 1/.test(vg));
check('only a 404 counts as unpublished', /HTTP 404/.test(vg) && /Couldn't check whether/.test(vg));
check('the guard uses REST, not gh release view', /gh api "repos\//.test(vg) && !/gh release view/.test(vg));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
