// Fixed/unfixed price scale: drag on the right strip unfixes; then a chart drag moves price; Auto button re-fixes.
const { chromium } = require('playwright'); const fs = require('fs'); const mock = require('./mock.js');
const PX = { okx:'https://www.okx.com', kraken:'https://futures.kraken.com', mexc:'https://contract.mexc.com', bingx:'https://open-api.bingx.com', bybit:'https://api.bybit.com', bnf:'https://fapi.binance.com', krakens:'https://api.kraken.com', bitstamp:'https://www.bitstamp.net', gemini:'https://api.gemini.com', mexcs:'https://api.mexc.com' };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:390,height:844}, colorScheme:'dark', deviceScaleFactor:2, hasTouch:true, isMobile:true });
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.addInitScript(() => { try { localStorage.setItem('v2.tab','"overview"'); } catch(e){} });
  await p.routeWebSocket(/./, ws => ws.close());
  await p.route('**/*', async r => { const u=r.request().url();
    if (u==='http://dash.test/') return r.fulfill({ body: fs.readFileSync('../site/index.html'), contentType:'text/html' });
    const sf = u.match(/^http:\/\/dash\.test\/(\w+\.js)(?:\?.*)?$/); if (sf) return r.fulfill({ body: fs.readFileSync('../site/'+sf[1]), contentType:'text/javascript' });
    let target=u; const m=u.match(/^http:\/\/dash\.test\/px\/(\w+)(\/.*)$/); if (m) { if (!PX[m[1]]) return r.abort(); target = PX[m[1]] + m[2]; }
    const res = mock(target); if (res && res.__status) return r.fulfill({ status: res.__status, body:'{}' });
    if (res) return r.fulfill({ body: JSON.stringify(res), contentType:'application/json', headers:{'access-control-allow-origin':'*'} });
    return r.abort(); });
  await p.goto('http://dash.test/'); await p.waitForTimeout(4000);
  await p.locator('canvas.cc').scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
  const box = await p.locator('#cMain').boundingBox(); const cdp = await ctx.newCDPSession(p);
  const st = () => p.evaluate(() => ({ auto: CC.auto, yLo: Math.round(CC.yLo), yHi: Math.round(CC.yHi), x0: +CC.x0.toFixed(1), btn: !CC.autoBtn.hidden, ta: getComputedStyle(CC.cv).touchAction, axTa: getComputedStyle(CC.axEl).touchAction, scrollY: Math.round(scrollY), W: CC.W }));
  const swipe = async (x, y, dx, dy) => { await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]}); for (let i=1;i<=10;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/10,y:y+dy*i/10}]}); await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await p.waitForTimeout(400); };
  console.log('start      ', JSON.stringify(await st()), 'chart box x/w', box.x, box.width);
  await swipe(box.x + box.width - 25, box.y + 200, 0, 80); console.log('axis drag  ', JSON.stringify(await st()));
  await swipe(box.x + 150, box.y + 250, 40, 60); console.log('chart drag ', JSON.stringify(await st()));
  await p.locator('#cMain .cauto').screenshot({ path: '/tmp/ax-btn.png' }).catch(()=>{});
  await p.locator('canvas.cc').screenshot({ path: '/tmp/ax-unfixed.png' });
  await p.click('#cMain .cauto'); await p.waitForTimeout(300); console.log('after Auto ', JSON.stringify(await st()));
  console.log(errs.length ? errs : 'no errors'); await b.close();
})();
