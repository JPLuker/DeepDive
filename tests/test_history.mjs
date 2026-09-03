const store=new Map();
globalThis.localStorage={getItem:(k)=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:(k)=>store.delete(k)};
const h = await import('/home/claude/dd/js/history.js');
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}

// dives
h.recordDive({artistName:'GRLwood', duplicates:2, newTracks:5, alreadyLiked:10});
h.recordDive({artistName:'DURRY', duplicates:1, newTracks:3, alreadyLiked:57});
check('dives recorded newest first', h.listDives()[0].artistName==='DURRY');
check('dive counts kept', h.listDives()[1].duplicates===2);
h.recordDive({artistName:'grlwood', duplicates:9, newTracks:9, alreadyLiked:9});
check('re-diving replaces rather than duplicating', h.listDives().filter(d=>/grlwood/i.test(d.artistName)).length===1);
check('replacement moves it to the top with new figures', h.listDives()[0].duplicates===9);

// actions
h.recordAction({type:'like', label:'Liked 3 tracks by DURRY', trackIds:['a','b','c']});
check('action recorded', h.listActions().length===1);
check('last undoable found', h.lastUndoable().trackIds.length===3);
h.recordAction({type:'playlist', label:'Created a playlist', trackIds:['x'], undoable:false});
check('non-undoable skipped by lastUndoable', h.lastUndoable().type==='like');
const id=h.lastUndoable().id;
h.markUndone(id);
check('undone actions are not offered again', h.lastUndoable()===null);
check('undone action still listed', h.listActions().some(a=>a.undone));

// export
const dump = h.exportData();
check('export is labelled', dump.format==='deepdive-backup' && dump.version===1);
check('export carries pins/dives', 'deepdive_dives' in dump.data);
check('export excludes the library cache', !('deepdive_library_v1' in dump.data));
check('export excludes tokens', !Object.keys(dump.data).some(k=>/token/i.test(k)));

// import — merge
{
  const other = {format:'deepdive-backup', version:1, data:{
    deepdive_watchlist: JSON.stringify([{id:'1',name:'Big Thief',status:'pending'},{id:'2',name:'Wednesday',status:'pending'}]),
  }};
  store.set('deepdive_watchlist', JSON.stringify([{id:'9',name:'Big Thief',status:'pending'}]));
  const sum = h.importData(other,{mode:'merge'});
  const pins = JSON.parse(store.get('deepdive_watchlist'));
  check('merge adds only what is missing', sum.pins===1 && pins.length===2);
  check('merge keeps existing entries', pins.some(p=>p.id==='9'));
}
// import — replace
{
  const other = {format:'deepdive-backup', version:1, data:{
    deepdive_watchlist: JSON.stringify([{id:'z',name:'Alvvays',status:'pending'}]),
  }};
  h.importData(other,{mode:'replace'});
  const pins = JSON.parse(store.get('deepdive_watchlist'));
  check('replace overwrites', pins.length===1 && pins[0].name==='Alvvays');
}
// import — rejects nonsense
{
  let threw=null;
  try { h.importData({hello:'world'}); } catch(e){ threw=e; }
  check('rejects a non-backup file', threw && /DeepDive backup/.test(threw.message));
}
// corrupted storage tolerated
store.set('deepdive_dives','{not json');
check('corrupt log reads as empty', h.listDives().length===0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
