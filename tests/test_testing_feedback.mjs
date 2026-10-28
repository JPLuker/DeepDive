// Run the real genre browser against a small DOM adapter: search must
// find a low-ranked subgenre and open its mix, with no input replacement.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
let pass=0, fail=0;
function check(label, ok) { if (ok) pass++; else { fail++; console.log('FAIL:', label); } }
const source=readFileSync(new URL('../docs/js/app.js', import.meta.url),'utf8');
const html=readFileSync(new URL('../docs/app/index.html', import.meta.url),'utf8');
const fn=source.slice(source.indexOf('function renderGenreBrowser('), source.indexOf('/** Draws the genre cards',source.indexOf('function renderGenreBrowser(')));
const input={value:'',addEventListener(name,cb){this[name]=cb}};
const list={innerHTML:'',buttons:[],querySelectorAll(){this.buttons=[...this.innerHTML.matchAll(/data-genre-index="(\d+)"/g)].map(m=>({dataset:{genreIndex:m[1]},addEventListener(name,cb){this[name]=cb}}));return this.buttons;}};
let opened, scrolled=0;
const ctx={root:{innerHTML:''},document:{getElementById:id=>id==='genre-search'?input:list},window:{scrollTo:()=>scrolled++},setTitle:()=>{},setActiveTab:()=>{},_genreQuery:'',cardArtBlock:()=>'<span>art</span>',esc:s=>String(s).replaceAll('<','&lt;'),openCardModal:g=>opened=g};
const genres=[...Array.from({length:30},(_,i)=>({title:'Rock '+i,subtitle:'20 tracks'})),{title:'Shoegaze',subtitle:'12 tracks'}];
vm.createContext(ctx);
try {
 vm.runInContext(fn+'\nrenderGenreBrowser(genres)',Object.assign(ctx,{genres}));
 check('browser includes genres below the shelf cutoff',list.innerHTML.includes('Shoegaze'));
 check('browser resets previous page scroll',scrolled===1);
 input.value='shoe';input.input();
 check('search matches the complete genre collection',list.buttons.length===1&&list.innerHTML.includes('Shoegaze')&&!list.innerHTML.includes('Rock'));
 list.buttons[0].click();check('genre opens its actual mix',opened===genres.at(-1));
 check('search keeps the same field and query',input.value==='shoe'&&ctx._genreQuery==='shoe');
 input.value='no such genre';input.input();check('empty search gives an accessible result',/role="status">No genres found/.test(list.innerHTML));
 input.value='';input.input();check('clearing search restores every genre',list.buttons.length===genres.length);
} catch(e){fail++;console.log('FAIL: genre browser executes',e.message)}
check('no editable playlist names remain', !/id="(?:playlist-name|card-name)"/.test(source+html));
check('background reassurance removed',!source.includes('You can switch apps or lock your phone.'));
check('results header resets scroll before fading photo',/function renderResults\(r\) \{\s*window.scrollTo\?\.\(0, 0\)/.test(source));
check('missing artwork has a compact header',html.includes('.results-hero.no-art { height:auto; min-height:0;'));
check('chooser footer stays transparent',html.includes('#intent-modal .modal-actions { position:static; background:transparent;'));
check('results action clearance uses measured dock height',source.includes('new ResizeObserver')&&html.includes('var(--results-action-height, 144px)'));
check('genre wall removed from mixes',!source.includes('Show all ${allGenres.length} genres'));
console.log(`\n${pass} passed, ${fail} failed`);process.exitCode=fail?1:0;
