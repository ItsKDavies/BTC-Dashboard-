require('../site/ta.js'); const TA = globalThis.TA;
function gen(n, sec, p0=80000){ const k=[]; let p=p0; const t0=Math.floor(Date.now()/1000/sec)*sec-(n-1)*sec; for(let i=0;i<n;i++){ const o=p, c=p+Math.sin(i/9)*120+(Math.random()-0.5)*160; const h=Math.max(o,c)+Math.random()*60, l=Math.min(o,c)-Math.random()*60, v=40+Math.random()*80; k.push({t:t0+i*sec,o,h,l,c,v,tb:v*(0.4+Math.random()*0.2)}); p=c; } return k; }
const k30=gen(300,1800), k4=gen(300,14400), k1=gen(300,3600), k15=gen(300,900), kd=gen(250,86400);
const map={ '15m':TA.analyze(k15,'15m'), '30m':TA.analyze(k30,'30m'), '1h':TA.analyze(k1,'1h'), '4h':TA.analyze(k4,'4h'), '1d':TA.analyze(kd,'1d') };
console.log('30m', map['30m'].score, map['30m'].verdict, map['30m'].votes.map(v=>v.key+':'+v.v).join(' '), 'rsi', map['30m'].rsi.toFixed(1), 'cross', JSON.stringify(map['30m'].cross));
console.log('multi', TA.multiTF(map));
const px=k30[k30.length-1].c;
const raw=[...TA.swingLevels(k30,'30m',1),...TA.swingLevels(k4,'4h',2),{p:px*1.01,name:'PDH',w:2},{p:px*0.99,name:'PDL',w:2}];
const Z=TA.zones(px,raw); console.log('zones', Z.length, Z.slice(0,3).map(z=>Math.round(z.c)+' w'+z.w.toFixed(1)).join(', '));
const cp=TA.candlePatterns(k30,[{p:px*0.99,name:'PDL'}]); console.log('candle patterns', cp.length, cp.slice(0,4).map(p=>p.name+'/'+p.dir+'/s'+p.strength+'/ago'+p.ago).join(' | '));
console.log('chart patterns', JSON.stringify(TA.chartPatterns(k30,'30m').map(p=>p.name+' '+p.status)));
const S=TA.setups(px,Z,map['30m'].atr,TA.multiTF(map)); console.log('setups L', S.longs.map(s=>[Math.round(s.entry),Math.round(s.stop),Math.round(s.tp1),s.rr.toFixed(2),s.score].join('/')).join(' ; '), 'S', S.shorts.map(s=>[Math.round(s.entry),Math.round(s.stop),Math.round(s.tp1),s.rr.toFixed(2),s.score].join('/')).join(' ; '));
if (S.longs[0]) { const r=TA.risk(S.longs[0],25,100); console.log('risk', Math.round(r.liq), r.liqFirst, r.maxLev, r.sl.roe.toFixed(1), r.tp1.roe.toFixed(1)); }
const oi=k1.map((x,i)=>({t:x.t, v:25000+Math.sin(i/15)*800+i*3}));
const L=TA.liqMap(k1,oi,px,4); console.log('liq', L.bins.length, 'longs', L.longs.map(x=>Math.round(x.p)+':'+(x.usd/1e6).toFixed(1)+'M').join(','), 'shorts', L.shorts.map(x=>Math.round(x.p)+':'+(x.usd/1e6).toFixed(1)+'M').join(','));
console.log('maxpain', TA.maxPain([{k:78000,cp:'P',oi:100},{k:80000,cp:'C',oi:50},{k:82000,cp:'C',oi:200},{k:80000,cp:'P',oi:80}]));
