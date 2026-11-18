const SG = require('../site/sigta.js');
let seed=3; const rnd=()=>((seed=(seed*16807)%2147483647)/2147483647);
function gen(n, drift){ const k=[]; let p=80000; for(let i=0;i<n;i++){ const d = drift(i); const o=p; const c=o*(1+d+(rnd()-0.5)*0.006); const h=Math.max(o,c)*(1+rnd()*0.002), l=Math.min(o,c)*(1-rnd()*0.002); k.push({t:1e9+i*3600,o,h,l,c,v:100+rnd()*50}); p=c; } return k; }
const up = gen(300, i=> i<200? 0.0012 : -0.0015);
const s = SG.structure(up,'1h'); console.log('trend',s.trend,'last',s.lastEv, 'bos',s.bosLv,'choch',s.chochLv,'seq',s.seq,'run',s.run,'ev#',s.ev.length,'pools',s.pools.length,'fvg',s.fvg.length,'ob',s.ob.length);
console.log(s.ev.filter(e=>e.type==='CHoCH').map(e=>[e.i,e.dir]));
const r = SG.regime(up,'1h'); console.log(r.label, r.adx.toFixed(1), r.er.toFixed(2), r.bwPct.toFixed(0), r.atrPct.toFixed(0));
const flat = gen(300, i=>0); console.log(SG.regime(flat,'1h').label, SG.structure(flat,'1h').trend);
const sq = gen(300, i=> 0); for (let i=250;i<300;i++){ const m=sq[i].o; sq[i].h=m*1.0003; sq[i].l=m*0.9997; sq[i].c=m*(1+(rnd()-.5)*0.0002);} console.log('squeeze?', SG.regime(sq,'1h').label);
console.log('odds 1% 24h', SG.touchOdds(1, 0.4, 24).toFixed(1), 'odds -3% 24h', SG.touchOdds(-3,0.4,24).toFixed(1), 'drift', SG.touchOdds(1,0.4,24,0.02).toFixed(1));
const cl = SG.cluster([{p:80000,kind:'a',label:'A',w:1},{p:80050,kind:'b',label:'B',w:2},{p:82000,kind:'a',label:'C',w:1}], 81000); console.log(cl.map(z=>[Math.round(z.p),z.kinds.length,z.stars]));
console.log(SG.vprofile(up.slice(-100)));
