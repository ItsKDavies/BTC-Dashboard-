require('../site/ta.js'); const TA = globalThis.TA;
function mk(fn, n=200){ const k=[]; for(let i=0;i<n;i++){ const c=fn(i), o=fn(i-1); k.push({t:i*1800,o,h:Math.max(o,c)+15,l:Math.min(o,c)-15,c,v:50,tb:25}); } return k; }
// ascending triangle: ceiling 81000, lows rising; oscillation shrinking
const asc = mk(i=> i<100? 79000+i*5 : (()=>{ const j=i-100, lowLine=79800+j*9, top=81000; const ph=Math.sin(j/4); return ph>0? lowLine+(top-lowLine)*ph : lowLine+(top-lowLine)*0.02; })());
console.log('asc', JSON.stringify(TA.geoPatterns(asc,'30m').map(p=>p.name+'|'+p.status)));
const wedge = mk(i=> { const j=i; const mid=78000+j*12; const w=600-j*2.4; return mid + Math.sin(j/3)*w/2; });
console.log('wedge', JSON.stringify(TA.geoPatterns(wedge,'30m').map(p=>p.name+'|'+p.status)));
const flag = mk(i=> i<180? 79000+Math.sin(i/5)*40 : i<186? 79000+(i-180)*250 : 80500-(i-186)*20+Math.sin(i)*30);
console.log('flag', JSON.stringify(TA.geoPatterns(flag,'30m').map(p=>p.name+'|'+p.status)));
let rnd=1; const r=()=>((rnd=rnd*16807%2147483647)/2147483647);
let p=80000; const rand = mk(i=> (p+= (r()-0.5)*120));
console.log('random', JSON.stringify(TA.geoPatterns(rand,'30m').map(p=>p.name+'|'+p.status)));
