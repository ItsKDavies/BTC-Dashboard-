// viewport (not full-page) screenshots of a few tabs, to check fixed bottom nav + header: node vpshot.js out-prefix [dark|light]
const { chromium } = require('playwright'); const fs = require('fs'); const mock = require('./mock.js');
const PX = { okx:'https://www.okx.com', kraken:'https://futures.kraken.com', mexc:'https://contract.mexc.com', bingx:'https://open-api.bingx.com', bybit:'https://api.bybit.com', bnf:'https://fapi.binance.com', krakens:'https://api.kraken.com', bitstamp:'https://www.bitstamp.net', gemini:'https://api.gemini.com', mexcs:'https://api.mexc.com' };
(async () => {
  const out = process.argv[2], scheme = process.argv[3] || 'dark', tabs = (process.argv[4] || 'overview,setups').split(',');
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:390,height:844}, colorScheme:scheme, deviceScaleFactor:2, isMobile:true, hasTouch:true });
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.routeWebSocket(/./, ws => ws.close());
  await p.route('**/*', async r => { const u=r.request().url();
    if (u==='http://dash.test/') return r.fulfill({ body: fs.readFileSync('../site/index.html'), contentType:'text/html' });
    const sf = u.match(/^http:\/\/dash\.test\/(\w+\.js)(?:\?.*)?$/); if (sf) return r.fulfill({ body: fs.readFileSync('../site/'+sf[1]), contentType:'text/javascript' });
    let target=u; const m=u.match(/^http:\/\/dash\.test\/px\/(\w+)(\/.*)$/); if (m) { if (!PX[m[1]]) return r.abort(); target = PX[m[1]] + m[2]; }
    const res = mock(target); if (res && res.__status) return r.fulfill({ status: res.__status, body:'{}' });
    if (res) return r.fulfill({ body: JSON.stringify(res), contentType:'application/json', headers:{'access-control-allow-origin':'*'} });
    return r.abort(); });
  if (process.argv[5]) await p.addInitScript((v) => localStorage.setItem('v2.cstyle', JSON.stringify(v)), process.argv[5]); await p.goto('http://dash.test/'); await p.waitForTimeout(5000);
  for (const t of tabs) { await p.evaluate((x) => setTab(x), t); await p.waitForTimeout(900); await p.screenshot({ path: `${out}-${t}.png` }); }
  console.log(errs.length ? errs.slice(0,5) : 'no errors'); await b.close();
})();
