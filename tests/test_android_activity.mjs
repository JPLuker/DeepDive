import { installActivity } from '../tools/android-activity.mjs';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) pass++;
  else { fail++; console.log('FAIL:', label); }
}
const source = readFileSync(new URL('../src-tauri/android/MainActivity.kt', import.meta.url), 'utf8');
const root = mkdtempSync(join(tmpdir(), 'deepdive-activity-'));
try {
  const dir = join(root, 'java/io/github/jpluker/deepdive');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'MainActivity.kt');
  const generated = 'package io.github.jpluker.deepdive\nclass MainActivity : TauriActivity() {}\n';
  writeFileSync(file, generated);
  check('finds the generated activity under its package directories', installActivity(root, source) === file);
  check('installs the project activity intact', readFileSync(file, 'utf8') === source);
  installActivity(root, source);
  check('safe to run again', readFileSync(file, 'utf8') === source);

  writeFileSync(file, 'package another.app\nclass MainActivity {}');
  let rejected = false;
  try { installActivity(root, source); } catch { rejected = true; }
  check('refuses a mismatched application package', rejected);
  check('does not overwrite the mismatched file', readFileSync(file, 'utf8').startsWith('package another.app'));
  writeFileSync(file, generated);
  writeFileSync(join(root, 'MainActivity.kt'), generated);
  rejected = false;
  try { installActivity(root, source); } catch { rejected = true; }
  check('refuses an ambiguous generated project', rejected);
  const empty = join(root, 'empty');
  mkdirSync(empty);
  rejected = false;
  try { installActivity(empty, source); } catch { rejected = true; }
  check('fails if init produced no activity', rejected);
} finally {
  rmSync(root, { recursive: true, force: true });
}

const wf = readFileSync(new URL('../.github/workflows/native.yml', import.meta.url), 'utf8');
const commands = wf.replace(/^\s*#.*$/gm, '');
check('CI installs the activity after init and before the APK build',
  commands.indexOf('cargo tauri android init') < commands.indexOf('node tools/android-activity.mjs')
  && commands.indexOf('node tools/android-activity.mjs') < commands.indexOf('cargo tauri android build'));
check('automatic APK builds require an explicit commit marker',
  /if: github.event_name == 'workflow_dispatch' \|\| contains\(github.event.head_commit.message, '\[native-build\]'\)/.test(wf));
check('desktop remains a manual build', /build:\s*\n\s*if: github.event_name == 'workflow_dispatch'/.test(wf));
check('automatic builds get the application version', /match = re.search\(r'export const BUILD/.test(wf));
check('artifact name uses the stamped version', /V="\$BUILD_VERSION"/.test(wf));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
