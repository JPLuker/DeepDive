import { runSearch } from '/home/claude/dd/js/search.js';
let pass=0, fail=0; function check(l,c){ if(c)pass++; else{fail++;console.log('FAIL:',l);} }

function t(id,name,album,albumType='album',dur=214000,date='2024-01-01'){
  return {id,name,artists:[{id:'durry',name:'DURRY'}],duration_ms:dur,
    album:{id:album,name:album,album_type:albumType,release_date:date},external_ids:{}};
}
const client = {
  async findArtist(){ return {id:'durry',name:'DURRY'}; },
  async getAllLikedTracks(){ return []; },
  async getArtistCatalogTracks(){
    return [
      t('single-wln',"Who's Laughing Now - Audiotree Live","WLN Single",'single',214000,'2024-03-01'),
      t('ep-wln',    "Who's Laughing Now - Audiotree Live","Audiotree EP",'album',214000,'2024-01-15'),
      t('ep-coa',    "Coming of Age - Audiotree Live",     "Audiotree EP",'album',190000,'2024-01-15'),
      t('teen',      "Teenagers Forever",                  "Suburban Legend",'album',200000,'2023-01-01'),
    ];
  },
  async getTracksWithIsrc(){ return []; },
};
const r = await runSearch(client,'DURRY',{});
const names = r.new_tracks.map(x=>x.name);
check('no duplicate titles in result', names.length === new Set(names).size);
check('3 tracks not 4', r.new_tracks.length===3);
check('reports collapsed_count=1', r.collapsed_count===1);
check('kept the EP (album) version', r.new_tracks.some(x=>x.id==='ep-wln'));
check('dropped the single', !r.new_tracks.some(x=>x.id==='single-wln'));
check('unrelated tracks survive', r.new_tracks.some(x=>x.id==='teen') && r.new_tracks.some(x=>x.id==='ep-coa'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
