const { chromium } = require('playwright'); const fs = require('fs'); const mock = require('./mock.js');
const PX = { okx:'https://www.okx.com', kraken:'https://futures.kraken.com', mexc:'https://contract.mexc.com', bingx:'https://open-api.bingx.com', bybit:'https://api.bybit.com', bnf:'https://fapi.binance.com', krakens:'https://api.kraken.com', bitstamp:'https://www.bitstamp.net', gemini:'https://api.gemini.com', mexcs:'https://api.mexc.com', fng:'https://api.alternative.me', ff:'https://nfs.faireconomy.media', coindesk: 'https://www.coindesk.com', ctg: 'https://cointelegraph.com', theblock: 'https://www.theblock.co', decrypt: 'https://decrypt.co', btcmag: 'https://bitcoinmagazine.com', gnews: 'https://news.google.com' };
const CORS_BLOCK = [/futures\.kraken\.com/, /contract\.mexc\.com/, /open-api\.bingx\.com/, /okx\.com\/api\/v5\/rubik/];
(async () => {
  const [w,h,scheme,out] = [+process.argv[2], +process.argv[3], process.argv[4], process.argv[5]];
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:w,height:h}, colorScheme:scheme, hasTouch: w<600, isMobile: w<600 });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000); const errs=[]; const proxied=new Set();
  p.on('pageerror', e=>errs.push('PAGEERR '+e.message)); p.on('console', m=>{ if(m.type()==='error' && !/Failed to load resource/.test(m.text())) errs.push('CONSOLE '+m.text()); });
  await p.route('**/*', async r => { const u=r.request().url();
    if (u.includes('lightweight-charts')) return r.fulfill({ body: fs.readFileSync('lwstub.js'), contentType:'text/javascript' });
    if (u==='http://dash.test/' ) return r.fulfill({ body: fs.readFileSync('../site/index.html'), contentType:'text/html' });
    const sf = u.match(/^http:\/\/dash\.test\/(\w+\.js)$/); if (sf) return r.fulfill({ body: fs.readFileSync('../site/'+sf[1]), contentType:'text/javascript' });
    let target=u; const m=u.match(/^http:\/\/dash\.test\/px\/(\w+)(\/.*)$/); if (m) { target = PX[m[1]] + m[2]; proxied.add(m[1]); }
    else if (CORS_BLOCK.some(rx=>rx.test(u))) return r.abort();
    let res = null; try { res = mock(target); } catch (e) {}
    if (res && res.__xml) return r.fulfill({ body: res.__xml, contentType:'application/rss+xml' });
    if (res && res.__status) return r.fulfill({ status: res.__status, body:'{}', headers:{'access-control-allow-origin':'*'} });
    if (res) return r.fulfill({ body: JSON.stringify(res), contentType:'application/json', headers:{'access-control-allow-origin':'*','access-control-allow-headers':'content-type'} });
    return r.abort(); });
  await p.routeWebSocket(/okx\.com/, ws => { ws.onMessage(m => { if (String(m).includes('subscribe')) { let i=0; const iv=setInterval(()=>{ try{ ws.send(JSON.stringify({arg:{channel:'liquidation-orders',instType:'SWAP'},data:[{instId:'BTC-USDT-SWAP',details:[{side:'buy',posSide:'short',bkPx:String(80500+i),sz:'120',ts:String(Date.now())}]}]})); }catch(e){ clearInterval(iv);} i++; }, 400); } }); });
  await p.routeWebSocket(/coinbase\.com/, ws => { ws.onMessage(m => { let id=1e7; const iv=setInterval(()=>{ try{ ws.send(JSON.stringify({type:'match',trade_id:id++,side:Math.random()>0.5?'buy':'sell',size:'0.2',price:'80250',time:new Date().toISOString()})); }catch(e){clearInterval(iv);} }, 150); }); });
  await p.routeWebSocket(/binance\.com|bybit\.com/, ws => { ws.close(); });
  await p.goto('http://dash.test/'); await p.waitForTimeout(4000);
  const full = {};
  await p.click('#bLayers');
  for (const sel of ['[data-tog="fib"]','[data-tog="avwap"]','[data-tog="sma"]','[data-tog="zones"]','[data-tog="liq"]']) { await p.click(sel); await p.waitForTimeout(150); }
  await p.waitForTimeout(400); await p.screenshot({ path: out.replace('.png','-over.png'), fullPage: true });
  for (const t of ['news','gex','ta','pat','setups','flow','liq','mkts','derivs','sources']) { await p.click(`[data-tab="${t}"]`); await p.waitForTimeout(900);
    const ov = await p.evaluate(()=>{ const v=document.querySelector('.view:not([hidden])'); return { sw: document.documentElement.scrollWidth, txt: v.innerText.length, unav: [...v.querySelectorAll('.unavail')].map(x=>x.innerText.slice(0,60)) }; });
    full[t]=ov; await p.screenshot({ path: out.replace('.png',`-${t}.png`), fullPage: true }); }
  await p.click('[data-tab="overview"]');
  const info = await p.evaluate(() => ({ live: document.querySelector('#hLive').innerText, sw: document.documentElement.scrollWidth, st: Object.values(SRC).map(s=>s.id+':'+status(s.id)).join(' ') }));
  console.log(JSON.stringify(info), JSON.stringify(full), 'proxied:', [...proxied].join(',')); console.log(errs.join('\n'));
  await p.screenshot({ path: out }); await b.close(); process.exit(0);
})();
