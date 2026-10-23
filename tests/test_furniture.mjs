// Repo furniture — MAINTENANCE.md 1.1-1.2, SECURITY-BASELINE.md 7,
// PRIVACY.md 9.
//
// These are the things a project is supposed to have before 1.0 that
// nobody notices are missing, because nothing breaks without them. The
// first person to find a security hole in DeepDive should not have to
// decide where to put it.
import { readFileSync, existsSync } from 'fs';
const at = (p) => new URL('../' + p, import.meta.url);
const read = (p) => (existsSync(at(p)) ? readFileSync(at(p), 'utf8') : '');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

// --- SECURITY.md (SECURITY-BASELINE.md Part 7) ----------------------
{
  const s = read('SECURITY.md');
  check('SECURITY.md exists', !!s);
  check('it states which versions are supported', /latest release only/i.test(s));
  check('it routes reports privately', /security\/advisories\/new/.test(s));
  check('and says not to use a public issue', /public issue/i.test(s));
  check('it promises an acknowledgement window', /7 days/.test(s));
  // A report form with no scope wastes everyone's time. DeepDive has
  // no server, so what matters is credentials leaving the browser.
  check('it says what is worth reporting', /access token|Client ID|Last\.fm API key/.test(s));
  // The Client ID is public by design — PKCE exists so a public client
  // needs no secret — and saying so avoids a recurring false report.
  check('and what is not', /not a vulnerability/i.test(s) && /PKCE/.test(s));
}

// --- issue templates (MAINTENANCE.md Part 3) ------------------------
{
  const bug = read('.github/ISSUE_TEMPLATE/bug_report.yml');
  const feat = read('.github/ISSUE_TEMPLATE/feature_request.yml');
  const cfg = read('.github/ISSUE_TEMPLATE/config.yml');
  check('bug report template exists', !!bug && /labels: \[bug\]/.test(bug));
  check('it asks for the version', /App version and OS/.test(bug));
  check('and points at Copy diagnostic info', /Copy diagnostic info/.test(bug));
  // That blob is pasted into public issues.
  check('and says it carries no credentials', /no credentials/i.test(bug));
  check('feature template exists', !!feat && /labels: \[enhancement\]/.test(feat));
  // Part 3 keeps blank issues on for Joseph's own handoff notes.
  check('blank issues stay enabled', /blank_issues_enabled: true/.test(cfg));
  check('security is offered as a contact link', /security\/advisories\/new/.test(cfg));
}

// --- README (PRIVACY.md Part 9, MAINTENANCE.md 1.2) -----------------
{
  const r = read('README.md');
  check('README has a Support section', /## Support/.test(r));
  check('it says issues are monitored', /Issues are monitored/.test(r));
  check('it carries the no-telemetry line', /No telemetry\. No accounts required\. Nothing is sold or shared\./.test(r));
  check('it says what is stored and where', /Clearing site data removes all of it/.test(r));

  // Part 3: every host the app can contact, or it does not contact it.
  // Checked against the code rather than taken on trust.
  const table = r.slice(r.indexOf('| Host |'), r.indexOf('Fonts and icons are bundled'));
  for (const host of ['accounts.spotify.com', 'api.spotify.com', 'scdn.co', 'ws.audioscrobbler.com']) {
    check(`the table lists ${host}`, table.includes(host));
  }
  check('the table says what is sent, not just when', /PKCE challenge/.test(table) && /access token/.test(table));
  check('and that nothing else is contacted', /If a connection is not in this\s*\ntable, the app does not make it/.test(r));
  // Self-hosted fonts are the reason there is no Google row.
  check('it notes fonts are bundled', /Fonts and icons are bundled/.test(r));
}

// --- saved data has a migration path (DATA-AND-UPDATES.md Part 4) ---
// A 1.0 criterion (VERSIONING.md 2.1), and it was half-built: every
// export has carried a version since the format was written, and
// import never read it. A future format change would have been merged
// field by field into an app that could not understand it.
{
  const h = await import('../docs/js/history.js');
  check('exports carry a format version', h.exportData().version === h.BACKUP_VERSION);
  check('and name the format', h.exportData().format === 'deepdive-backup');

  const refuse = (payload) => {
    try { h.importData(payload); return null; } catch (e) { return e.message; }
  };
  check('a backup from a newer version is refused',
    /newer version/.test(refuse({ format: 'deepdive-backup', version: h.BACKUP_VERSION + 1, data: {} }) || ''));
  check('and the message says what to do', /Update DeepDive/.test(refuse({ format: 'deepdive-backup', version: 99, data: {} }) || ''));
  check('the current version still imports', refuse({ format: 'deepdive-backup', version: h.BACKUP_VERSION, data: {} }) === null);
  // Older files must keep working; that is the point of a migration
  // path rather than a version wall.
  check('and so does a file with no version at all', refuse({ format: 'deepdive-backup', data: {} }) === null);
  check('something that is not a backup is still refused', /doesn't look like/.test(refuse({ nope: true }) || ''));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
