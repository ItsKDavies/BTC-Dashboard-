// Full-page screenshot of every tab: node tabshots.js outdir [dark|light] [width]
const { chromium } = require('playwright'); const fs = require('fs'); const mock = require('./mock.js');
const PX = { okx:'https://www.okx.com', kraken:'https://futures.kraken.com', mexc:'https://contract.mexc.com', bingx:'https://open-api.bingx.com', bybit:'https://api.bybit.com', bnf:'https://fapi.binance.com', krakens:'https://api.kraken.com', bitstamp:'https://www.bitstamp.net', gemini:'https://api.gemini.com', mexcs:'https://api.mexc.com' };
(async () => {
  const out = process.argv[2], scheme = process.argv[3] || 'dark', w = +(process.argv[4] || 430); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:w,height:900}, colorScheme:scheme, deviceScaleFactor:1 });
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.routeWebSocket(/./, ws => ws.close());
  await p.route('**/*', async r => { const u=r.request().url();
    if (u==='http://dash.test/') return r.fulfill({ body: fs.readFileSync('../site/index.html'), contentType:'text/html' });
    const sf = u.match(/^http:\/\/dash\.test\/(\w+\.js)(?:\?.*)?$/); if (sf) return r.fulfill({ body: fs.readFileSync('../site/'+sf[1]), contentType:'text/javascript' });
    let target=u; const m=u.match(/^http:\/\/dash\.test\/px\/(\w+)(\/.*)$/); if (m) { if (!PX[m[1]]) return r.abort(); target = PX[m[1]] + m[2]; }
    const res = mock(target); if (res && res.__status) return r.fulfill({ status: res.__status, body:'{}' });
    if (res) return r.fulfill({ body: JSON.stringify(res), contentType:'application/json', headers:{'access-control-allow-origin':'*'} });
    return r.abort(); });
  await p.goto('http://dash.test/'); await p.waitForTimeout(5000);
  const tabs = await p.$$eval('[data-tab]', bs => bs.map(b => b.dataset.tab));
  for (const t of tabs) { await p.evaluate((x) => setTab(x), t); await p.waitForTimeout(900); await p.screenshot({ path: `${out}/${t}.png`, fullPage: true }); }
  console.log(tabs.join(','), errs.length ? errs.slice(0,5) : 'no errors'); await b.close();
})();
