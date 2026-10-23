// CI failure reporting.
//
// This project is developed from an environment that cannot reach the
// hosts Actions keeps step logs on: both productionresultssa*.blob
// .core.windows.net and results-receiver.actions.githubusercontent.com
// refuse the connection, so `gh run view --log` returns Forbidden and
// a failed build arrives as "exit code 1" with no cause.
//
// Annotations come back from api.github.com, which does work, so
// tools/ci-capture.sh turns a failure into one. That makes the
// annotation the only diagnostic channel there is — which means an
// unwrapped step is a step whose failure cannot be investigated at
// all. The first run of this workflow had three such failures and two
// of them produced no readable cause.
//
// So these checks are not about style. Every step that runs a command
// has to go through the wrapper, and the escaping has to survive the
// characters compiler output actually contains.
import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const at = (p) => new URL('../' + p, import.meta.url);
const read = (p) => (existsSync(at(p)) ? readFileSync(at(p), 'utf8') : '');
const script = fileURLToPath(at('tools/ci-capture.sh'));

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

const wf = read('.github/workflows/native.yml');

// --- the script exists and behaves ----------------------------------
{
  check('ci-capture.sh exists', existsSync(at('tools/ci-capture.sh')));

  // Success has to be transparent: zero exit, no annotation. A wrapper
  // that annotated on success would bury the real failure among noise.
  let okOut = '', okStatus = 0;
  try {
    okOut = execFileSync('bash', [script, 'ok', 'bash', '-c', 'echo fine; exit 0'], { encoding: 'utf8' });
  } catch (e) { okStatus = e.status || 1; okOut = String(e.stdout || ''); }
  check('a passing command exits zero', okStatus === 0);
  check('and emits no annotation', !okOut.includes('::error'));
  check('while still showing its output', okOut.includes('fine'));

  // Failure has to keep the exit code, or the step passes and CI lies.
  let badOut = '', badStatus = 0;
  try {
    execFileSync('bash', [script, 'boom', 'bash', '-c', 'echo trouble; exit 7'], { encoding: 'utf8' });
  } catch (e) { badStatus = e.status || 0; badOut = String(e.stdout || ''); }
  check('a failing command keeps its exit code', badStatus === 7);
  check('and emits exactly one annotation', (badOut.match(/::error/g) || []).length === 1);
  check('titled with the label it was given', /::error title=boom failed::/.test(badOut));
  check('carrying the output', badOut.includes('trouble'));

  // Escaping. Compiler and Gradle output contains all of these, and a
  // mis-escaped annotation is a truncated or mangled one.
  let escOut = '';
  try {
    execFileSync('bash', [script, 'esc', 'bash', '-c',
      'printf "a%%b\\nc::d\\ne\\r\\n"; exit 1'], { encoding: 'utf8' });
  } catch (e) { escOut = String(e.stdout || ''); }
  const ann = (escOut.split('\n').find((l) => l.startsWith('::error')) || '');
  check('percent signs are escaped', ann.includes('a%25b'));
  check('newlines become %0A', ann.includes('%0A'));
  check('the annotation is a single line', ann.length > 0 && !ann.slice(8).includes('\n'));
  check('carriage returns are stripped, not doubled', !ann.includes('%0D'));
  // A literal :: inside the message must not be escaped away — it is
  // legal in the message body and appears in Rust paths and Gradle
  // task names constantly.
  check('double colons in the message survive', ann.includes('c::d'));
}

// --- every command step is wrapped ----------------------------------
//
// Parsed rather than grepped: a `run:` step that quietly bypasses the
// wrapper is exactly the regression this guards against, and counting
// occurrences of a string would not notice a new one.
{
  const steps = [];
  let current = null;
  for (const raw of wf.split('\n')) {
    const m = raw.match(/^      - (?:name: (.*)|uses: (.*))$/);
    if (m) {
      current = { name: (m[1] || m[2] || '').trim(), body: '', isUses: !!m[2] };
      steps.push(current);
      continue;
    }
    if (current && /^      - /.test(raw)) { current = null; continue; }
    if (current) current.body += raw + '\n';
  }

  check('the workflow parsed into steps', steps.length > 10);

  // Steps that legitimately do not wrap: they run no build command.
  // Named explicitly so adding a step cannot silently join the list.
  const exempt = new Set([
    'Stamp the version',   // inline python, its own traceback is the error
    'Rename for release',  // shell bookkeeping over already-built files
  ]);

  const runSteps = steps.filter((s) => !s.isUses && /^\s*run:/m.test(s.body));
  check('there are run steps to check', runSteps.length >= 5);

  for (const s of runSteps) {
    if (exempt.has(s.name)) continue;
    check(`"${s.name}" routes through ci-capture.sh`, s.body.includes('tools/ci-capture.sh'));
    // Without `shell: bash` a Windows runner uses pwsh and the script
    // never runs at all — this is the quiet way to break the wrapper.
    check(`"${s.name}" declares shell: bash`, /shell: bash/.test(s.body));
  }
}

// --- the opaque action is gone --------------------------------------
{
  // It failed in 14s with no annotation and no reachable log, which is
  // the one failure mode this project cannot debug. Replaced with
  // explicit steps. If it returns, so does the blind spot.
  check('setup-android action is no longer used', !/android-actions\/setup-android/.test(wf.replace(/^\s*#.*$/gm, '')));
  check('tauri-action is no longer used', !/tauri-apps\/tauri-action/.test(wf.replace(/^\s*#.*$/gm, '')));
  // The replacement must still build the same bundles, or "it runs now"
  // would just mean it does less.
  check('desktop bundles are still deb,rpm,appimage on Linux', /deb,rpm,appimage/.test(wf));
  check('and msi,nsis on Windows', /msi,nsis/.test(wf));
  check('the APK is still a debug build', /android build --apk --debug/.test(wf));
}

console.log(`\n  ci-capture: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
