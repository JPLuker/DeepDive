#!/usr/bin/env bash
# Run every test suite and the boot check.
#
# The suites are plain node scripts that assert against the source files;
# there's no framework and no install step. Each prints "N passed, M
# failed" and exits non-zero on failure.
#
#   ./tests/run.sh
set -u
cd "$(dirname "$0")/.."

fail=0

echo "── syntax ─────────────────────────────────────────"
for f in js/*.js app/sw.js; do
  if node --check "$f" 2>/dev/null; then
    printf '  ✓ %s\n' "$f"
  else
    printf '  ✗ %s\n' "$f"; fail=1
  fi
done

echo
echo "── boot ───────────────────────────────────────────"
# app.js is a module that touches the DOM at import time, so it needs a
# stub environment. This catches ReferenceErrors that `node --check`
# cannot: a deleted function with a live call site is still valid syntax.
node --input-type=module -e "
const store=new Map(), sess=new Map();
function fakeEl(tag){return new Proxy({tagName:tag,style:{},classList:{_c:new Set(),add(...x){x.forEach(v=>this._c.add(v))},remove(...x){x.forEach(v=>this._c.delete(v))},toggle(x,on){on?this._c.add(x):this._c.delete(x)},contains(x){return this._c.has(x)}},dataset:{},children:[],childElementCount:0,innerHTML:'',checked:false,textContent:'',value:'',files:[],hidden:false},{get(t,p){if(p in t)return t[p];if(['addEventListener','removeEventListener','appendChild','setAttribute','removeAttribute','remove','focus','closest','replaceWith','click','getAttribute'].includes(p))return ()=>null;if(p==='cloneNode')return ()=>fakeEl(tag);if(p==='querySelectorAll')return ()=>[];if(p==='querySelector')return ()=>fakeEl('div');return undefined;},set(t,p,v){t[p]=v;return true;}});}
globalThis.Image=function(){return fakeEl('img');};
globalThis.indexedDB=undefined;
globalThis.localStorage={getItem:(k)=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:(k)=>store.delete(k)};
globalThis.sessionStorage={getItem:(k)=>sess.get(k)||null,setItem:(k,v)=>sess.set(k,v),removeItem:(k)=>sess.delete(k)};
globalThis.document={documentElement:{setAttribute:()=>{},removeAttribute:()=>{}},getElementById:()=>fakeEl('div'),querySelector:()=>fakeEl('div'),querySelectorAll:()=>[],addEventListener:()=>{},removeEventListener:()=>{},title:'',createElement:(t)=>fakeEl(t),body:fakeEl('body'),hidden:false};
globalThis.window={location:{origin:'http://x',pathname:'/app/',search:''},history:{replaceState:()=>{}},addEventListener:()=>{},matchMedia:()=>({matches:false,addEventListener:()=>{}}),confirm:()=>true,open:()=>{}};
import('./js/app.js').then(m=>setTimeout(()=>console.log('  ✓ boots, BUILD='+m.BUILD),80)).catch(e=>{console.log('  ✗ '+e.message);process.exit(1);});
" || fail=1

echo
echo "── suites ─────────────────────────────────────────"
total_p=0; total_f=0
for f in tests/test_*.mjs; do
  out=$(timeout 60 node "$f" 2>/dev/null | grep -oE '[0-9]+ passed, [0-9]+ failed' | tail -1)
  if [ -z "$out" ]; then
    printf '  ✗ %-28s (no output)\n' "$(basename "$f")"; fail=1; continue
  fi
  p=${out%% *}; fpart=${out##*, }; fcount=${fpart%% *}
  total_p=$((total_p + p)); total_f=$((total_f + fcount))
  if [ "$fcount" = "0" ]; then printf '  ✓ %-28s %s\n' "$(basename "$f")" "$out"
  else printf '  ✗ %-28s %s\n' "$(basename "$f")" "$out"; fail=1; fi
done

echo
echo "───────────────────────────────────────────────────"
echo "  $total_p passed, $total_f failed across $(ls tests/test_*.mjs | wc -l) suites"
[ "$fail" = "0" ] && echo "  all green" || echo "  FAILURES — read them before pushing"
exit $fail
