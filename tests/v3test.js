// v3 smoke test against site/ with mocked exchanges: every tab, errors, overflow, key elements filled.
const { chromium } = require('playwright'); const fs = require('fs'); const mock = require('./mock.js');
const PX = { okx:'https://www.okx.com', kraken:'https://futures.kraken.com', mexc:'https://contract.mexc.com', bingx:'https://open-api.bingx.com', bybit:'https://api.bybit.com', bnf:'https://fapi.binance.com', krakens:'https://api.kraken.com', bitstamp:'https://www.bitstamp.net', gemini:'https://api.gemini.com', mexcs:'https://api.mexc.com', fng:'https://api.alternative.me', ff:'https://nfs.faireconomy.media', coindesk:'https://www.coindesk.com', ctg:'https://cointelegraph.com', theblock:'https://www.theblock.co', decrypt:'https://decrypt.co', btcmag:'https://bitcoinmagazine.com', gnews:'https://news.google.com' };
(async () => {
  const w = +(process.argv[2] || 390), out = process.argv[3]; if (out) fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:w,height:844}, colorScheme:'dark', hasTouch:w<600, isMobile:w<600 });
  const p = await ctx.newPage(); const errs=[]; const reqs = {};
  p.on('pageerror', e=>errs.push('PAGEERR '+e.message)); p.on('console', m=>{ if(m.type()==='error' && !/Failed to load resource/.test(m.text())) errs.push('CONSOLE '+m.text().slice(0,200)); });
  await p.routeWebSocket(/./, ws => ws.close());
  await p.route('**/*', async r => { const u=r.request().url();
    if (u==='http://dash.test/') return r.fulfill({ body: fs.readFileSync('../site/index.html'), contentType:'text/html' });
    const sf = u.match(/^http:\/\/dash\.test\/([\w.]+\.(js|webmanifest|png))(?:\?.*)?$/); if (sf) return r.fulfill({ body: fs.readFileSync('../site/'+sf[1]), contentType: sf[2]==='js'?'text/javascript':'application/octet-stream' });
    let target=u; const m=u.match(/^http:\/\/dash\.test\/px\/(\w+)(\/.*)$/); if (m) { if (!PX[m[1]]) return r.abort(); target = PX[m[1]] + m[2]; }
    const host = new URL(target).host + new URL(target).pathname.split('/').slice(0,4).join('/'); reqs[host] = (reqs[host]||0)+1;
    let res = null; try { res = mock(target); } catch (e) {}
    if (res && res.__xml) return r.fulfill({ body: res.__xml, contentType:'application/rss+xml' });
    if (res && res.__status) return r.fulfill({ status: res.__status, body:'{}', headers:{'access-control-allow-origin':'*'} });
    if (res) return r.fulfill({ body: JSON.stringify(res), contentType:'application/json', headers:{'access-control-allow-origin':'*'} });
    return r.abort(); });
  await p.goto('http://dash.test/'); await p.waitForTimeout(5000);
  const tabs = await p.$$eval('.tab[data-tab]', bs => bs.map(b => b.dataset.tab)); const res = {};
  for (const t of tabs) { await p.evaluate((x) => setTab(x), t); await p.waitForTimeout(['alts','voices'].includes(t)?3000:1000);
    res[t] = await p.evaluate(()=>{ const v=document.querySelector('.view:not([hidden])'); return { sw: document.documentElement.scrollWidth, len: v.innerText.length }; });
    if (out) await p.screenshot({ path: `${out}/${t}.png`, fullPage: true }); }
  const checks = await p.evaluate(() => ({ hero: !!document.querySelector('#sigHero .gauge'), moves: document.querySelectorAll('#lvMoves .mvc').length, cf: document.querySelectorAll('#cfGrid td').length, alts: document.querySelectorAll('#altBody .acard').length, voices: document.querySelectorAll('#voBody .vcard').length, strip: document.querySelector('#briefStrip').innerText.length, log: SIGLOG.length, chartBars: CC && CC.bars, chartK: CC && CC.k.length }));
  const bad = Object.entries(res).filter(([t, r]) => r.sw > w + 1 || r.len < 40);
  console.log(JSON.stringify(checks)); console.log('bad tabs', JSON.stringify(bad)); console.log(errs.length ? [...new Set(errs)].slice(0, 10) : 'no errors');
  // requests per minute while idle on the Signals tab
  await p.evaluate(() => setTab('now')); for (const k in reqs) delete reqs[k]; await p.waitForTimeout(60000);
  console.log('requests in 60s on Signals → Now:', Object.values(reqs).reduce((a, x) => a + x, 0), JSON.stringify(reqs).slice(0, 600));
  await b.close();
})();
