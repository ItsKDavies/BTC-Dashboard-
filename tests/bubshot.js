// Screenshot of the main chart with seeded big-trade bubbles: node bubshot.js out.png [dark|light] [w] [h]
const { chromium } = require('playwright'); const fs = require('fs'); const mock = require('./mock.js');
const PX = { okx:'https://www.okx.com', kraken:'https://futures.kraken.com', mexc:'https://contract.mexc.com', bingx:'https://open-api.bingx.com', bybit:'https://api.bybit.com', bnf:'https://fapi.binance.com', krakens:'https://api.kraken.com', bitstamp:'https://www.bitstamp.net', gemini:'https://api.gemini.com', mexcs:'https://api.mexc.com', fng:'https://api.alternative.me' };
(async () => {
  const out = process.argv[2], scheme = process.argv[3] || 'dark', w = +(process.argv[4] || 430), h = +(process.argv[5] || 900);
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:w,height:h}, colorScheme:scheme, deviceScaleFactor:2 });
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
  await p.evaluate(() => { let s = 7; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const k = CC.k; for (let i = Math.max(0, k.length - 70); i < k.length; i++) { if (rnd() > 0.55) continue; const x = k[i], n = 1 + Math.floor(rnd() * 2);
      for (let j = 0; j < n; j++) { const usd = 1.5e5 + Math.pow(rnd(), 2) * 3e6; BIG.set('s' + i + j, { k: 's' + i + j, t: x.t + 30, side: rnd() > 0.5 ? 'buy' : 'sell', venue: 'Binance', usd, p: x.l + (x.h - x.l) * rnd() }); } }
    CH.xKey = null; chartExtras(); CC.dirty(); });
  await p.waitForTimeout(600);
  const c = p.locator('canvas.cc'); await c.scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await c.screenshot({ path: out });
  console.log(out, errs.length ? errs : 'no errors'); await b.close();
})();
