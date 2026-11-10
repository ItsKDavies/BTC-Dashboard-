// quick bar + settings sheet: toggle a chip, open sheet, pin a layer, close
const { chromium } = require('playwright'); const fs = require('fs'); const mock = require('./mock.js');
const PX = { okx:'https://www.okx.com', kraken:'https://futures.kraken.com', mexc:'https://contract.mexc.com', bingx:'https://open-api.bingx.com', bybit:'https://api.bybit.com', bnf:'https://fapi.binance.com', krakens:'https://api.kraken.com', bitstamp:'https://www.bitstamp.net', gemini:'https://api.gemini.com', mexcs:'https://api.mexc.com' };
(async () => {
  const scheme = process.argv[2] || 'dark';
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:390,height:844}, colorScheme:scheme, deviceScaleFactor:2, isMobile:true, hasTouch:true });
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.addInitScript(() => { try { localStorage.setItem('v2.briefOpen','false'); localStorage.setItem('v2.fibPlan','false'); localStorage.setItem('v2.heat','false'); } catch(e){} });
  await p.routeWebSocket(/./, ws => ws.close());
  await p.route('**/*', async r => { const u=r.request().url();
    if (u==='http://dash.test/') return r.fulfill({ body: fs.readFileSync('../site/index.html'), contentType:'text/html' });
    const sf = u.match(/^http:\/\/dash\.test\/(\w+\.js)(?:\?.*)?$/); if (sf) return r.fulfill({ body: fs.readFileSync('../site/'+sf[1]), contentType:'text/javascript' });
    let target=u; const m=u.match(/^http:\/\/dash\.test\/px\/(\w+)(\/.*)$/); if (m) { if (!PX[m[1]]) return r.abort(); target = PX[m[1]] + m[2]; }
    const res = mock(target); if (res && res.__status) return r.fulfill({ status: res.__status, body:'{}' });
    if (res) return r.fulfill({ body: JSON.stringify(res), contentType:'application/json', headers:{'access-control-allow-origin':'*'} });
    return r.abort(); });
  await p.goto('http://dash.test/'); await p.waitForTimeout(5000);
  await p.evaluate(() => { const el = document.querySelector('#chartPanel'); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 4); }); await p.waitForTimeout(400);
  await p.screenshot({ path: '/tmp/qb-1.png' });
  const st = () => p.evaluate(() => ({ ema: ST.ema, watch: ST.watchLv, quick: ST.quick.join(','), open: ST.layersOpen, wl: CC.L.hlines.filter(h => /Trigger|^R\d|^S\d/.test(h.tag || '')).map(h => h.tag).join(' | ') }));
  console.log('start', JSON.stringify(await st()));
  await p.tap('[data-qt="ema"]'); await p.waitForTimeout(300); console.log('ema chip', JSON.stringify(await st()));
  await p.tap('#bLayers'); await p.waitForTimeout(500); await p.screenshot({ path: '/tmp/qb-2.png' }); console.log('sheet', JSON.stringify(await st()));
  await p.tap('#layers .srow[data-tog="cdl"] .pin'); await p.waitForTimeout(300); console.log('pin cdl', JSON.stringify(await st()));
  await p.tap('#bLayersX'); await p.waitForTimeout(300); console.log('closed', JSON.stringify(await st()), await p.$$eval('[data-qt]', (b) => b.map((x) => x.dataset.qt).join(',')));
  console.log(errs.length ? errs : 'no errors'); await b.close();
})();
