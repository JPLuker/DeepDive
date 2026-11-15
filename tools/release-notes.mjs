// The notes for one version, taken from CHANGELOG.md.
//
// publish-android.sh used to carry its notes inline. They were written
// for 2.9.143 and every later APK went out describing 2.9.143, which
// the in-app updater then shows as "what's new" (15 Nov). The changelog
// is the one place a version's changes are written (VERSIONING.md 5.2).
//
//   node tools/release-notes.mjs 2.9.146   → prints the section
//
// Exits non-zero when the version has no section, so a build can't
// publish without one.
import { readFileSync } from 'node:fs';

export function notesFor(changelog, version) {
  const lines = changelog.split('\n');
  const head = new RegExp(`^## \\[?${version.replace(/\./g, '\\.')}\\]?(\\s|$)`);
  const start = lines.findIndex((l) => head.test(l));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  const body = lines.slice(start + 1, end).join('\n').trim();
  return body || null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const version = process.argv[2];
  const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  const notes = version && notesFor(changelog, version);
  if (!notes) {
    console.error(`CHANGELOG.md has no section for ${version || '(no version given)'}. Add one before publishing.`);
    process.exit(1);
  }
  process.stdout.write(notes + '\n');
}
