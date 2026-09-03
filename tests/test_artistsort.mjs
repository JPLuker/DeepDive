import { readFileSync } from 'fs';
const src = readFileSync('/home/claude/dd/js/app.js','utf8');
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}
check('artist option offered', /\{ id: "artist", label: "By artist" \}/.test(src));
check('artist mode implemented', /if \(mode === "artist"\)/.test(src));

// mirror the comparator
function sortTracks(tracks, mode){
  const withIdx=tracks.map((t,i)=>({t,i}));
  const rd=t=>(t.album&&t.album.release_date)||"";
  const artist=t=>(((t.artists||[])[0]||{}).name||"").toLowerCase();
  withIdx.sort((a,b)=>{
    if(mode==="artist"){
      const byArtist=artist(a.t).localeCompare(artist(b.t)); if(byArtist)return byArtist;
      const byDate=rd(a.t).localeCompare(rd(b.t)); if(byDate)return byDate;
      const byAlbum=((a.t.album&&a.t.album.name)||"").localeCompare((b.t.album&&b.t.album.name)||""); if(byAlbum)return byAlbum;
      const byTrack=(a.t.track_number||0)-(b.t.track_number||0); if(byTrack)return byTrack;
      return a.i-b.i;
    }
    return a.i-b.i;
  });
  return withIdx.map(x=>x.t);
}
const t=(n,ar,rel,tn)=>({name:n,artists:[{name:ar}],album:{name:'Al'+rel,release_date:rel},track_number:tn});
const mixed=[t('z','Beta','2020',2),t('a','Alpha','2021',1),t('y','Beta','2020',1),t('b','Alpha','2019',3)];
const out=sortTracks(mixed,'artist');
check('artists grouped', out.map(x=>x.artists[0].name).join(',')==='Alpha,Alpha,Beta,Beta');
check('earlier release first within an artist', out[0].album.release_date==='2019');
check('track order within an album', out[2].track_number===1 && out[3].track_number===2);
check('case-insensitive grouping', sortTracks([t('a','beta','2020',1),t('b','Alpha','2020',1)],'artist')[0].artists[0].name==='Alpha');
check('missing artist safe', sortTracks([{name:'x',album:{}},t('a','Alpha','2020',1)],'artist').length===2);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
