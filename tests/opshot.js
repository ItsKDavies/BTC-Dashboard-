// node opshot.js : opens Layers, sets candle 50% / bubbles 35%, screenshots panel + chart
const { chromium } = require('playwright'); const fs = require('fs'); const mock = require('./mock.js');
const PX = { okx:'https://www.okx.com', kraken:'https://futures.kraken.com', mexc:'https://contract.mexc.com', bingx:'https://open-api.bingx.com', bybit:'https://api.bybit.com', bnf:'https://fapi.binance.com', krakens:'https://api.kraken.com', bitstamp:'https://www.bitstamp.net', gemini:'https://api.gemini.com', mexcs:'https://api.mexc.com' };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:430,height:1100}, colorScheme:'dark', deviceScaleFactor:2, hasTouch:true, isMobile:true });
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.addInitScript(() => { try { localStorage.setItem('v2.tab','"overview"'); localStorage.setItem('v2.heat','false'); } catch(e){} });
  await p.routeWebSocket(/./, ws => ws.close());
  await p.route('**/*', async r => { const u=r.request().url();
    if (u==='http://dash.test/') return r.fulfill({ body: fs.readFileSync('../site/index.html'), contentType:'text/html' });
    const sf = u.match(/^http:\/\/dash\.test\/(\w+\.js)$/); if (sf) return r.fulfill({ body: fs.readFileSync('../site/'+sf[1]), contentType:'text/javascript' });
    let target=u; const m=u.match(/^http:\/\/dash\.test\/px\/(\w+)(\/.*)$/); if (m) { if (!PX[m[1]]) return r.abort(); target = PX[m[1]] + m[2]; }
    const res = mock(target); if (res && res.__status) return r.fulfill({ status: res.__status, body:'{}' });
    if (res) return r.fulfill({ body: JSON.stringify(res), contentType:'application/json', headers:{'access-control-allow-origin':'*'} });
    return r.abort(); });
  await p.goto('http://dash.test/'); await p.waitForTimeout(4000);
  await p.evaluate(() => { let s = 7; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280); const k = CC.k;
    for (let i = k.length - 70; i < k.length; i++) { if (rnd() > 0.55) continue; const x = k[i]; BIG.set('s'+i, { k:'s'+i, t:x.t+30, side: rnd()>0.5?'buy':'sell', venue:'Binance', usd:1.5e5+Math.pow(rnd(),2)*3e6, p:x.l+(x.h-x.l)*rnd() }); }
    CH.xKey = null; chartExtras(); CC.dirty(); });
  await p.click('#bLayers'); await p.waitForTimeout(300);
  await p.$eval('#opCdl', el => { el.value = 50; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); });
  await p.$eval('#opBub', el => { el.value = 35; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(400);
  await p.locator('#layers').screenshot({ path: '/tmp/op-panel.png' });
  await p.locator('canvas.cc').screenshot({ path: '/tmp/op-chart.png' });
  console.log(await p.evaluate(() => [ST.opCdl, ST.opBub, localStorage.getItem('v2.opCdl'), localStorage.getItem('v2.opBub')]), errs.length ? errs : 'no errors');
  await b.close();
})();
