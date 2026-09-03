import { runSearch } from '../docs/js/search.js';
import { findCandidates, confirmCandidates, buildLikedIndexes, collapseDuplicateRecordings } from '../docs/js/matching.js';
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}
function t(id,name,{album='Al',albumType='album',dur=200000,isrc=null,artist='A',artistId='a1',date='2020-01-01'}={}){
  const o={id,name,artists:[{id:artistId,name:artist}],duration_ms:dur,
    album:{id:album,name:album,album_type:albumType,release_date:date},external_ids:{}};
  if(isrc)o.external_ids.isrc=isrc; return o;
}

// REGRESSION 1: cross-release duplicate detection (the Leisure Hour case)
// Liked the album cut; the single of the SAME recording must still be
// surfaced as a duplicate — collapse must not interfere with this.
{
  const liked=[t('album-liked','Not Done Begging',{isrc:'ISRC-ORIG'})];
  const li=buildLikedIndexes(liked);
  const catalog=[
    t('album-liked','Not Done Begging',{isrc:null}),
    t('single','Not Done Begging',{album:'Jenny',albumType:'single'}),
  ];
  const p1=findCandidates(catalog,li);
  check('R1: single flagged as candidate', p1.candidates.some(c=>c.track.id==='single'));
  const full=[t('single','Not Done Begging',{album:'Jenny',albumType:'single',isrc:'ISRC-ORIG'})];
  const p2=confirmCandidates(full,p1.candidates,li);
  check('R1: confirmed as ISRC duplicate', p2.duplicate_candidates.length===1 && p2.duplicate_candidates[0].match_basis==='isrc');
  check('R1: already-liked still counted', p1.already_liked.length===1);
}

// REGRESSION 2: remaster with different ISRC stays NEW (not collapsed away)
{
  const r=collapseDuplicateRecordings([
    t('orig','Old Song',{isrc:'ISRC-A',date:'1975-01-01'}),
    t('remaster','Old Song - 2015 Remaster',{isrc:'ISRC-B',date:'2015-01-01'}),
  ]);
  check('R2: remaster not collapsed into original', r.tracks.length===2);
}

// REGRESSION 3: feat.-credit re-release still matches library
{
  const liked=[t('l1','Good Song',{isrc:'ISRC1'})];
  const li=buildLikedIndexes(liked);
  const p1=findCandidates([t('c1','Good Song (feat. Other)',{dur:200300})],li);
  check('R3: feat. version flagged as candidate', p1.candidates.length===1);
}

// REGRESSION 4: filters still drop tracks pre-classification
{
  const li=buildLikedIndexes([]);
  const p1=findCandidates([
    t('live1','Song (Live)'), t('radio1','Song (Radio Edit)'), t('n1','Normal Song'),
  ],li,{excludeLive:true,excludeCensored:true});
  check('R4: 2 excluded by filters', p1.excluded_count===2);
  check('R4: only normal track remains', p1.new_tracks.length===1 && p1.new_tracks[0].id==='n1');
}

// REGRESSION 5: full search still returns the right shape + new field
{
  const client={
    async findArtist(){return {id:'a1',name:'A'};},
    async getAllLikedTracks(){return [];},
    async getArtistCatalogTracks(){return [t('x','Song X'),t('y','Song Y',{dur:300000})];},
    async getTracksWithIsrc(){return [];},
  };
  const r=await runSearch(client,'A',{});
  check('R5: result shape intact', r.mode==='search' && Array.isArray(r.new_tracks) && typeof r.already_liked_count==='number');
  check('R5: collapsed_count present', typeof r.collapsed_count==='number');
  check('R5: no false collapsing of distinct songs', r.new_tracks.length===2);
}

// REGRESSION 6: progress still reaches 100
{
  const client={
    async findArtist(){return {id:'a1',name:'A'};},
    async getAllLikedTracks(){return [];},
    async getArtistCatalogTracks(){return [];},
    async getTracksWithIsrc(){return [];},
  };
  const seen=[]; await runSearch(client,'A',{onProgress:(p)=>seen.push(p)});
  check('R6: progress ends at 100', seen[seen.length-1]===100);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
