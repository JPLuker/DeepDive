// Mirror optionsForIntent to verify preset mapping.
const INTENTS = [
  { id:"standard", opts:{} },
  { id:"studio", opts:{excludeLive:true,excludeCensored:true,excludeInstrumental:true,excludeAcappella:true} },
  { id:"everything", opts:{includeAppearsOn:true} },
  { id:"custom", opts:null },
];
function optionsForIntent(id, customOpts){
  const intent = INTENTS.find(i=>i.id===id) || INTENTS[0];
  const base = {excludeLive:false,excludeCensored:false,excludeInstrumental:false,excludeAcappella:false,matchRemasters:false,includeAppearsOn:false};
  if(intent.id==="custom") return {...base, ...(customOpts||{})};
  return {...base, ...intent.opts};
}
let pass=0,fail=0; const j=x=>JSON.stringify(x);
function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}

// CRITICAL: standard must equal the previous default (all false)
const std = optionsForIntent('standard');
check('standard = previous default behaviour (nothing enabled)',
  Object.values(std).every(v=>v===false));

// studio
const studio = optionsForIntent('studio');
check('studio excludes live', studio.excludeLive===true);
check('studio excludes censored', studio.excludeCensored===true);
check('studio excludes instrumental', studio.excludeInstrumental===true);
check('studio excludes acappella', studio.excludeAcappella===true);
check('studio does NOT include appeared-on', studio.includeAppearsOn===false);
check('studio does NOT force remaster matching', studio.matchRemasters===false);

// everything
const every = optionsForIntent('everything');
check('everything includes appeared-on', every.includeAppearsOn===true);
check('everything filters nothing out', every.excludeLive===false && every.excludeCensored===false);

// custom
const cust = optionsForIntent('custom', {excludeLive:true, matchRemasters:true});
check('custom honours supplied flags', cust.excludeLive===true && cust.matchRemasters===true);
check('custom defaults the rest to false', cust.includeAppearsOn===false && cust.excludeAcappella===false);
check('custom with nothing set = all false', Object.values(optionsForIntent('custom',{})).every(v=>v===false));

// unknown id falls back safely
check('unknown intent falls back to standard', j(optionsForIntent('nonsense'))===j(std));

// every intent returns a complete option set (no undefined leaking into search)
for(const i of INTENTS){
  const o=optionsForIntent(i.id,{});
  check(`${i.id} returns all 6 flags defined`, Object.values(o).length===6 && Object.values(o).every(v=>typeof v==='boolean'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
