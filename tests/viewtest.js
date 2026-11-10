// The view must stay where the user put it while live data keeps arriving.
const { chromium } = require('playwright'); const fs = require('fs'); const mock = require('./mock.js');
const PX = { okx:'https://www.okx.com', kraken:'https://futures.kraken.com', mexc:'https://contract.mexc.com', bingx:'https://open-api.bingx.com', bybit:'https://api.bybit.com', bnf:'https://fapi.binance.com', krakens:'https://api.kraken.com', bitstamp:'https://www.bitstamp.net', gemini:'https://api.gemini.com', mexcs:'https://api.mexc.com' };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true, colorScheme:'dark' });
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.addInitScript(() => { try { localStorage.setItem('v2.briefOpen','false'); localStorage.setItem('v2.fibPlan','true'); } catch(e){} });
  await p.routeWebSocket(/./, ws => ws.close());
  await p.route('**/*', async r => { const u=r.request().url();
    if (u==='http://dash.test/') return r.fulfill({ body: fs.readFileSync('../site/index.html'), contentType:'text/html' });
    const sf = u.match(/^http:\/\/dash\.test\/(\w+\.js)(?:\?.*)?$/); if (sf) return r.fulfill({ body: fs.readFileSync('../site/'+sf[1]), contentType:'text/javascript' });
    let target=u; const m=u.match(/^http:\/\/dash\.test\/px\/(\w+)(\/.*)$/); if (m) { if (!PX[m[1]]) return r.abort(); target = PX[m[1]] + m[2]; }
    const res = mock(target); if (res && res.__status) return r.fulfill({ status: res.__status, body:'{}' });
    if (res) return r.fulfill({ body: JSON.stringify(res), contentType:'application/json', headers:{'access-control-allow-origin':'*'} });
    return r.abort(); });
  await p.goto('http://dash.test/'); await p.waitForTimeout(5000);
  await p.locator('canvas.cc').scrollIntoViewIfNeeded(); const box = await p.locator('#cMain').boundingBox(); const cdp = await ctx.newCDPSession(p);
  const st = () => p.evaluate(() => ({ x0: +CC.x0.toFixed(2), bars: +CC.bars.toFixed(1), follow: CC.follow, auto: CC.auto, n: CC.k.length }));
  const touch = async (pts) => { for (const [type, tp] of pts) await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: tp }); };
  // small drag right (last candle still on screen) — this used to spring back
  const x = box.x + 200, y = box.y + 200; await touch([['touchStart', [{ x, y }]], ...[1,2,3,4,5,6].map(i => ['touchMove', [{ x: x + i * 6, y }]]), ['touchEnd', []]]);
  await p.waitForTimeout(300); const a1 = await st(); console.log('after drag', JSON.stringify(a1));
  // pinch zoom in
  await touch([['touchStart', [{ x: x - 60, y, id: 0 }, { x: x + 60, y, id: 1 }]], ...[1,2,3,4,5].map(i => ['touchMove', [{ x: x - 60 - i * 12, y, id: 0 }, { x: x + 60 + i * 12, y, id: 1 }]]), ['touchEnd', []]]);
  await p.waitForTimeout(300); const a2 = await st(); console.log('after pinch', JSON.stringify(a2));
  // force live data refreshes, like the auto-refresh does
  for (let i = 0; i < 4; i++) { await p.evaluate(() => { D.kl.k = D.kl.k.map((x, j, arr) => j === arr.length - 1 ? { ...x, c: x.c + 5, h: x.h + 5 } : x); updateChart(); render(); }); await p.waitForTimeout(700); }
  const a3 = await st(); console.log('after 4 refreshes', JSON.stringify(a3), a3.x0 === a2.x0 && a3.bars === a2.bars ? 'VIEW KEPT' : 'VIEW MOVED');
  // new candle arrives while parked away: still kept
  await p.evaluate(() => { const k = D.kl.k, l = k[k.length - 1]; D.kl.k = [...k, { ...l, t: l.t + 1800 }]; updateChart(); }); await p.waitForTimeout(400);
  const a4 = await st(); console.log('new candle', JSON.stringify(a4), a4.x0 === a2.x0 ? 'VIEW KEPT' : 'VIEW MOVED');
  // reset → follow again, and a new candle then scrolls with it
  await p.evaluate(() => resetView()); const r0 = await st();
  await p.evaluate(() => { const k = D.kl.k, l = k[k.length - 1]; D.kl.k = [...k, { ...l, t: l.t + 1800 }]; updateChart(); }); await p.waitForTimeout(300);
  const r1 = await st(); console.log('reset then new candle', JSON.stringify(r0), JSON.stringify(r1), r1.x0 === r0.x0 + 1 ? 'FOLLOWS' : 'NOT FOLLOWING');
  console.log(errs.length ? errs : 'no errors'); await b.close();
})();
