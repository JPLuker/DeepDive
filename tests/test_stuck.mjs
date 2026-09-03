import { readFileSync } from 'fs';
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url),'utf8');
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}
// openCardModal sits after samplerSourceArtists in the file, so slicing
// between them gave an empty string and every assertion failed on
// nothing rather than on the code.
const start = src.indexOf('function openCardModal');
const modal = src.slice(start, src.indexOf('\nfunction ', start + 10));
check('go button label reset', /freshGo\.textContent = "Create playlist";/.test(modal));
check('go button re-enabled', /freshGo\.disabled = false;/.test(modal));
check('cancel label reset', /freshCancel\.textContent = "Cancel";/.test(modal));
check('reset happens after cloning', modal.indexOf('cloneNode(true)') < modal.indexOf('freshGo.textContent = "Create playlist"'));

// simulate: a disabled "Building…" button cloned then reset
const btn={textContent:'Building…',disabled:true,cloneNode(){return {textContent:this.textContent,disabled:this.disabled};}};
const clone=btn.cloneNode(true);
check('cloneNode does copy the stuck state', clone.textContent==='Building…' && clone.disabled===true);
clone.textContent='Create playlist'; clone.disabled=false;
check('explicit reset clears it', clone.textContent==='Create playlist' && clone.disabled===false);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
