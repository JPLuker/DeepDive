// The shared untested publisher (RELEASES.md Part 2 and Part 6), run
// against a stub `gh` so every branch can be driven without GitHub.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const repo = new URL('..', import.meta.url).pathname;
let pass = 0, fail = 0;
const check = (l, c) => { if (c) pass++; else { fail++; console.log('FAIL:', l); } };
const V = readFileSync(join(repo, 'docs/js/app.js'), 'utf8').match(/BUILD = "([^"]+)"/)[1];

// The stub: `gh api .../releases/tags/X` 404s until `gh release create`
// has run, then reports the uploaded files with their real sizes (or a
// short one, when SHORT is set, to prove the after-check reads sizes).
const stub = `#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
if [ "$1" = "release" ] && [ "$2" = "create" ]; then
  shift 2; : >> "$STUB_STATE"
  for a in "$@"; do case "$a" in --notes-file) n=1;; *) [ "\${n:-}" = 1 ] && cp "$a" "$STUB_NOTES"; n=;; esac; done
  exit 0
fi
if [ "$1" = "release" ] && [ "$2" = "upload" ]; then
  shift 2; for a in "$@"; do [ -f "$a" ] && echo "$(basename "$a") $(stat -c %s "$a") uploaded" >> "$STUB_STATE"; done
  exit 0
fi
if [ "$1" = "api" ]; then
  [ -f "$STUB_STATE" ] || { echo "gh: Not Found (HTTP 404)" >&2; exit 1; }
  echo "prerelease=\${STUB_PRERELEASE:-true}"
  if [ -n "\${SHORT:-}" ]; then sed 's/ [0-9]* uploaded$/ 1 uploaded/' "$STUB_STATE"; else cat "$STUB_STATE"; fi
  exit 0
fi
exit 0`;

function run(files, required, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pub-'));
  const bin = join(dir, 'bin'); mkdirSync(bin);
  writeFileSync(join(bin, 'gh'), stub); chmodSync(join(bin, 'gh'), 0o755);
  const out = join(dir, 'dist'); mkdirSync(out);
  for (const [n, body] of Object.entries(files)) writeFileSync(join(out, n), body);
  const e = { ...process.env, PATH: `${bin}:${process.env.PATH}`, BUILD_VERSION: V, GITHUB_REPOSITORY: 'x/y', GITHUB_SHA: 'abc',
    STUB_LOG: join(dir, 'log'), STUB_STATE: join(dir, 'state'), STUB_NOTES: join(dir, 'notes'), ...env };
  let code = 0, text = '';
  try { text = execFileSync('bash', ['tools/publish-untested.sh', 'Linux', 'linux', out, ...required], { cwd: repo, env: e, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (err) { code = err.status; text = String(err.stdout) + String(err.stderr); }
  const read = (n) => { try { return readFileSync(join(dir, n), 'utf8'); } catch { return ''; } };
  const result = { code, text, log: read('log'), notes: read('notes'), sums: read('dist/SHA256SUMS.txt') };
  rmSync(dir, { recursive: true, force: true });
  return result;
}
const A = `DeepDive-${V}-Linux-x64-UNTESTED.AppImage`, D = `DeepDive-${V}-Linux-x64-UNTESTED.deb`;

const ok = run({ [A]: 'aaaa', [D]: 'dddddd' }, [A, D]);
check(`a complete set publishes (${ok.text.trim().split('\n').pop()})`, ok.code === 0);
// 2.9.152: --latest=false dropped with the one-call create; GitHub never
// marks a pre-release Latest, and the after-check reads the flag back.
check('as a pre-release', /release create .*--prerelease/.test(ok.log));
check('created first, files uploaded after (the sequence CI accepts)', /release create(?!.*\.AppImage)/.test(ok.log) && /release upload .*\.AppImage/.test(ok.log));
check('titled UNTESTED first', /--title UNTESTED — Linux build for DeepDive/.test(ok.log));
check('notes open with the warning block', ok.notes.startsWith('> ⚠️ **UNTESTED BUILD.** These Linux builds'));
check('notes carry this version\'s changelog', /## What changed/.test(ok.notes) && ok.notes.length > 200);
check('notes say what unsigned means for the user', /chmod \+x/.test(ok.notes));
check('checksums cover every listed file', ok.sums.includes(A) && ok.sums.includes(D) && ok.sums.trim().split('\n').length === 2);

const missing = run({ [A]: 'aaaa' }, [A, D]);
check('a missing required file stops it before anything is created', missing.code !== 0 && !/release create/.test(missing.log));
const empty = run({ [A]: 'aaaa', [D]: '' }, [A, D]);
check('an empty file stops it', empty.code !== 0 && !/release create/.test(empty.log));
const extra = run({ [A]: 'aaaa', [D]: 'dd', 'debug.log': 'x' }, [A, D]);
check('an unlisted file stops it', extra.code !== 0 && /Unlisted file/.test(extra.text));
const short = run({ [A]: 'aaaa', [D]: 'dddddd' }, [A, D], { SHORT: '1' });
check('a published file of the wrong size fails the after-check', short.code !== 0 && /different size/.test(short.text));
const notPre = run({ [A]: 'aaaa', [D]: 'dd' }, [A, D], { STUB_PRERELEASE: 'false' });
check('a release not marked pre-release fails the after-check', notPre.code !== 0);
const old = run({ [A]: 'aaaa', [D]: 'dd' }, [A, D], { BUILD_VERSION: '9.9.9' });
check('a version without changelog notes is refused', old.code !== 0 && /no section for 9\.9\.9/.test(old.text));

const pa = readFileSync(join(repo, 'tools/publish-android.sh'), 'utf8');
check('Android uses the shared publisher with the name the updater expects',
  /publish-untested\.sh Android android dist "DeepDive-\$\{BUILD_VERSION\}-Android-universal-UNTESTED\.apk"/.test(pa));
const wf = readFileSync(join(repo, '.github/workflows/native.yml'), 'utf8');
check('desktop builds publish their own Linux and Windows releases', /publish-untested\.sh Linux linux/.test(wf) && /publish-untested\.sh Windows windows/.test(wf));
check('Windows ships installer, MSI and portable', /Windows-x64-Setup-UNTESTED\.exe/.test(wf) && /Windows-x64-UNTESTED\.msi/.test(wf) && /Windows-x64-portable-UNTESTED\.exe/.test(wf));

// 2.9.151's Windows build failed in the version stamp: app.js holds
// UTF-8 that Windows' default cp1252 can't decode.
const stamps = wf.match(/read_text\([^)]*\)/g) || [];
check('every file the stamp reads is read as UTF-8', stamps.length >= 6 && stamps.every((m) => /encoding="utf-8"/.test(m)));
check('the stamp runs whichever Python actually works', (wf.match(/PY=python3; "\$PY" -c 1 2>\/dev\/null \|\| PY=python/g) || []).length === 2);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
