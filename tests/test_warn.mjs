// Mirror the visibility rule and verify it fires in exactly the right cases.
function shouldWarn(selected, appearsOnChecked){
  return selected === "everything" || (selected === "custom" && !!appearsOnChecked);
}
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}
check('standard: no warning', shouldWarn('standard',false)===false);
check('studio: no warning', shouldWarn('studio',false)===false);
check('everything: warns', shouldWarn('everything',false)===true);
check('custom without appeared-on: no warning', shouldWarn('custom',false)===false);
check('custom WITH appeared-on: warns', shouldWarn('custom',true)===true);
check('standard ignores a stale checkbox state', shouldWarn('standard',true)===false);
check('studio ignores a stale checkbox state', shouldWarn('studio',true)===false);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
