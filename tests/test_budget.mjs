// The duplicate scan on a budget.
//
// The scan is one request per release across every artist in the
// library — thousands for a large one, against a budget Spotify counts
// per developer account and never reports the remaining size of. So it
// either finished or died, and on a spent quota it always died. That is
// what made dropping duplicate search a live question.
//
// Bounding it turns an all-or-nothing job into an incremental one. The
// checkpoint machinery already existed; this makes it reachable on
// purpose rather than only after a failure.
//
// Run against the real runFullScrub with a fake client, so the budget
// is proven to stop a run rather than merely to be passed in.
import { readFileSync } from 'fs';
import * as search from '../docs/js/search.js';

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

// A library of 6 artists, each with a different number of liked tracks,
// so the most-liked-first ordering is observable.
const liked = [];
const mk = (artistId, name, n) => {
  for (let i = 0; i < n; i++) {
    liked.push({
      id: `${artistId}-t${i}`, name: `${name} song ${i}`, duration_ms: 200000,
      artists: [{ id: artistId, name }],
      album: { id: `${artistId}-alb`, name: 'A', images: [], release_date: '2020-01-01' },
      external_ids: { isrc: `X${artistId}${i}` },
    });
  }
};
mk('a1', 'One', 1); mk('a2', 'Two', 9); mk('a3', 'Three', 4);
mk('a4', 'Four', 7); mk('a5', 'Five', 2); mk('a6', 'Six', 5);

function fakeClient({ perArtistRequests = 10 } = {}) {
  const order = [];
  const c = {
    log: { total: 0, counts: {} },
    setMinimumPacing() {},
    async getArtistCatalogTracks(artistId) {
      order.push(artistId);
      // Each catalogue read costs several requests, as a real one does.
      c.log.total += perArtistRequests;
      return [];
    },
    async getTracksWithIsrc() { return []; },
    async getAllLikedTracks() { c.log.total += 1; return liked; },
  };
  c.order = order;
  return c;
}

// --- the budget stops the run ---------------------------------------
{
  const c = fakeClient();
  const r = await search.runFullScrub(c, { requestBudget: 25 });
  check('it stops before the library is finished', r.artists_scanned < r.artists_total);
  check('and says it stopped on the budget', r.stopped_on_budget === true);
  // Checked between artists, so it overshoots by at most one catalogue
  // rather than abandoning one half-read.
  check('it overshoots by at most one artist', r.requests_spent <= 25 + 10);
  check('it reports what it spent', r.requests_spent > 0);
  check('and what finishing would cost', r.estimated_remaining_requests > 0);
  check('the estimate is measured, not guessed', r.requests_per_artist > 0);
}

// --- no budget means no change --------------------------------------
{
  const c = fakeClient();
  const r = await search.runFullScrub(c, {});
  check('without a budget it finishes the library', r.artists_scanned === r.artists_total);
  check('and does not claim to have paused', r.stopped_on_budget === false);
  check('6 artists, all scanned', r.artists_total === 6);
}

// --- the productive half first ---------------------------------------
// A duplicate is a catalogue track matching something already liked, so
// an artist with nine liked songs has nine chances and an artist with
// one has one. A partial run should spend on the former.
{
  const c = fakeClient();
  await search.runFullScrub(c, { requestBudget: 25 });
  check('most-liked artist is checked first', c.order[0] === 'a2');
  check('least-liked is not', !c.order.includes('a1'));
}

// --- the UI tells the truth about it ---------------------------------
{
  const app = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');
  check('the scan screen offers a budget', /id="scrub-budget"/.test(app));
  check('and passes the choice through', /requestBudget: _scrubBudget/.test(app));
  // "cancelled" reads as something going wrong; the scan did what it
  // was asked.
  check('a budget stop reads as paused, not cancelled', /if \(r\.stopped_on_budget\) return "paused"/.test(app));
  check('the cost is reported when work remains', /function scanCostNote/.test(app));
  check('and suppressed when none does', /r\.artists_remaining <= 0\) return ""/.test(app));
}

// --- hidden, not removed (2.9.130) ----------------------------------
//
// Joseph's call, 23 Oct: the whole-library scan is off by default. It
// is the one feature Spotify's quota could never reliably pay for, and
// 2.9.127's instalments are the best the API allows without being
// something you hand a stranger.
//
// Everything above this comment still runs, which is the point: the
// code, the budget, the checkpoint and these tests all stay, because
// the rule that killed it is Spotify's and could change.
{
  const app = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');
  check('the scan is still built and routable', /renderScrubForm/.test(app) && /runFullScrub/.test(app));
  check('its row is behind the flag', /\$\{showIncomplete\(\) \? `/.test(app));
  check('the flag is off unless explicitly set', /getItem\(INCOMPLETE_KEY\) === "1"/.test(app));
  check('and there is a switch for it', /id="set-show-incomplete"/.test(app));
  check('which lives in Advanced', app.indexOf('set-show-incomplete') > app.indexOf('<details class="advanced"'));

  // The thing DeepDive was built for is a dive finding another release
  // of a song you already own. That is runSearch's own matching and is
  // untouched by any of this — worth pinning, because "we hid
  // duplicate search" could very easily have meant losing it.
  const search = readFileSync(new URL('../docs/js/search.js', import.meta.url), 'utf8');
  const dive = search.slice(search.indexOf('export async function runSearch'), search.indexOf('export async function runFullScrub'));
  check('dives still detect duplicates', /matching\.findCandidates/.test(dive) && /matching\.confirmCandidates/.test(dive));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
