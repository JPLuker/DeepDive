// The repo tree (2.9.89).
//
// DeepDive was a Flask app until v2.0, and the Python was still sitting
// in the root at 2.9.88: anyone opening the repo met a server app that
// hadn't run in a year. It is in git history, at 80d4a54 and the v1.x
// tags, which is where it belongs.
import { readdirSync, existsSync, readFileSync } from 'fs';
const root = new URL('../', import.meta.url);
const names = readdirSync(root);
let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

for (const gone of ['app.py', 'matching.py', 'progress.py', 'spotify_client.py',
                    'watchlist.py', 'requirements.txt', 'templates', 'static',
                    'PWA_MIGRATION_PLAN.md', 'SETLISTFM_SURFACE.md'])
  check(`${gone} is out of the tree`, !names.includes(gone));
check('no Python is left anywhere', !names.some((n) => n.endsWith('.py')));
// run.sh was the Flask launcher; tests/run.sh is the suite and stays.
check('the Flask launcher is gone', !names.includes('run.sh'));
check('the test runner is not', existsSync(new URL('../tests/run.sh', import.meta.url)));
check('regen-app.sh stays: it is live tooling', names.includes('regen-app.sh'));
for (const keep of ['docs', 'tests', 'README.md', 'LICENSE', 'CLAUDE.md',
                    'ROADMAP.md', 'TESTING.md', 'CHANGELOG.md'])
  check(`${keep} is still here`, names.includes(keep));

// The comments that say "port of matching.py" only make sense if the
// reader is told where the original went.
{
  const claude = readFileSync(new URL('../CLAUDE.md', import.meta.url), 'utf8');
  check('CLAUDE.md says where the Flask app went', /80d4a54/.test(claude) && /Flask app is gone from the tree/.test(claude));
}

// The README (2.9.89). It sold v1 until then, and told people to
// register the wrong redirect address, which fails at login.
{
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8');
  check('the redirect address includes /app/', /https:\/\/jpluker\.github\.io\/DeepDive\/app\/\n```/.test(readme));
  check('and the old one is gone', !/```\nhttps:\/\/jpluker\.github\.io\/DeepDive\/\n```/.test(readme));
  // The app derives it from its own location, so /app/ is what it sends.
  check('which is where the app is served from', /<title>DeepDive/.test(shell));
  for (const feature of ['Dip', 'Dive', 'Multi-Dip'])
    check(`the README covers ${feature}`, readme.includes(`**${feature}**`));
  // Mixes by their parts, since the section is named for what it does.
  check('the README covers Mixes', /Sampler/.test(readme) && /Build your own/.test(readme));
  // 2.9.91: it follows the landing page's sections, in its words.
  for (const section of ['How far in?', 'See the Dive happen', 'Know what you missed',
                         'Mixes with a reason', 'Keep a crate',
                         'One playlist for the whole bill', 'DeepDive cannot collect your data'])
    check(`the README has the landing page's "${section}"`, readme.includes(`## ${section}`));
  check('and no screenshots at all', !/img\/shots\//.test(readme));
  // The photography hold: only the landing page may carry artist shots.
  check('no artist photography in the README', !/(app-(home|dive|vial|results|crate|multidip|chooser)[^)"']*\.(jpg|png|svg))/.test(readme));
  check('the README covers Last.fm', /Last\.fm API key/.test(readme) && /need a Last\.fm key/.test(readme));
  check('Premium is stated before the steps', readme.indexOf("You'll need Spotify Premium") < readme.indexOf('Create app'));
  check('it no longer opens on the v1 pitch', !/You've liked the album version/.test(readme));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
