// Mock exchange API responses in the shapes the page expects
const now = Math.floor(Date.now()/1000);
function kl(interval, limit){ const sec={ '5m':300,'15m':900,'30m':1800,'1h':3600,'4h':14400,'8h':28800,'1d':86400 }[interval]; const out=[]; let p=80000; const start=(Math.floor(now/sec)-limit+1)*sec;
  for(let i=0;i<limit;i++){ const o=p, c=p+(Math.sin(i/7)*60)+(Math.random()-0.5)*80; const h=Math.max(o,c)+30, l=Math.min(o,c)-30, v=50+Math.random()*100; out.push([ (start+i*sec)*1000, o.toFixed(2), h.toFixed(2), l.toFixed(2), c.toFixed(2), v.toFixed(4), (start+i*sec+sec)*1000-1, (v*c).toFixed(2), 1000, (v*(0.4+Math.random()*0.2)).toFixed(4), '0','0']); p=c; } return out; }
const rub = (n, f, sec=300) => Array.from({length:n}, (_,i)=>[String((Math.floor(now/sec)*sec - i*sec)*1000), ...f(i)]);
function sampleRss(host) {
  const H = [["Sample: Spot bitcoin ETFs log $480M net inflows as BTC holds near $78K", 0.4], ["Sample: SEC delays decision on staking in ether ETFs", 2.2], ["Sample: Fed's Powell signals patience on rate cuts after hot CPI print", 1.1],
    ["Sample: DeFi lender drained of $40M in bridge exploit", 3.5], ["Sample: Bitcoin options worth $5B expire Friday; max pain near $80K", 5], ["Sample: Bitcoin slides as $300M in longs liquidated", 0.9],
    ["Sample: Strategy buys another 2,000 BTC", 7], ["Sample: Senate committee advances crypto market structure bill", 9], ["Sample: Top 5 altcoins to watch this week", 4], ["Sample: Solana memecoin volume jumps", 12], ["Sample: Ethereum developers set date for next upgrade", 20]];
  const n = { "www.coindesk.com": "CoinDesk", "cointelegraph.com": "Cointelegraph", "www.theblock.co": "The Block", "decrypt.co": "Decrypt", "bitcoinmagazine.com": "Bitcoin Magazine", "news.google.com": "Google News" }[host];
  const k = Object.keys({ "www.coindesk.com": 0, "cointelegraph.com": 1, "www.theblock.co": 2, "decrypt.co": 3, "bitcoinmagazine.com": 4, "news.google.com": 5 }).indexOf(host);
  const items = H.filter((_, i) => (i + k) % 3 !== 0).map(([t, h], i) => `<item><title>${t}${host === "news.google.com" ? " - Reuters" : ""}</title><link>https://example.com/${k}/${i}</link><pubDate>${new Date(Date.now() - (h + k * 0.1) * 36e5).toUTCString()}</pubDate><description>Sample article text for the preview. Real headlines load on the live site.</description>${host === "news.google.com" ? "<source>Reuters</source>" : ""}</item>`).join("");
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>${n}</title>${items}</channel></rss>`;
}
const NEWS_HOSTS = ["www.coindesk.com", "cointelegraph.com", "www.theblock.co", "decrypt.co", "bitcoinmagazine.com", "news.google.com"];
  // ---- sample alts + voices (v3) ----
  const ALTB = { ETH: 3150, SOL: 182, XRP: 2.31, BNB: 905, DOGE: 0.172, ADA: 0.61, AVAX: 19.4, LINK: 15.2, SUI: 2.4, TON: 2.9, DOT: 3.6, LTC: 92, BCH: 480, NEAR: 2.7, APT: 4.6, ARB: 0.31, OP: 0.52, INJ: 8.9, TIA: 1.4, SEI: 0.21, RENDER: 2.9, FET: 0.33, TAO: 340, ENA: 0.34, ONDO: 0.66, AAVE: 205, UNI: 7.6, PEPE: 0.0000081, WIF: 0.55, HBAR: 0.17, TRX: 0.29, XLM: 0.27 };
  const AS = {};
  function altSeries(b, iv) {
    const key = b + iv; if (AS[key]) return AS[key];
    let sd = [...b].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 2147483647 || 11; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const n = iv === "1d" ? 400 : 150, sec = iv === "1d" ? 86400 : 14400, base = ALTB[b] || 1, trend = (r() - 0.45) * (iv === "1d" ? 0.004 : 0.003), vol = iv === "1d" ? 0.035 : 0.012, out = [];
    let p = base * (1 - trend * n * 0.9), t = (Math.floor(Date.now() / 1000 / sec) - n + 1) * sec;
    for (let i = 0; i < n; i++) { const o = p, c = o * (1 + trend + (r() - 0.5) * vol * 2 + Math.sin(i / (9 + r() * 6)) * vol * 0.3); const h = Math.max(o, c) * (1 + r() * vol * 0.5), l = Math.min(o, c) * (1 - r() * vol * 0.5), v = (1e6 / base) * (0.5 + r()) * (i > n - 4 && r() > 0.6 ? 3 : 1); out.push([(t + i * sec) * 1000, o, h, l, c, v]); p = c; }
    const k = base / out[n - 1][4]; out.forEach((x) => { for (let j = 1; j <= 4; j++) x[j] *= k; });
    return (AS[key] = out);
  }
  function altAnswer(u, q) {
    if (u.pathname.endsWith("/ticker/24hr") && (q.symbols || (q.symbol && q.symbol !== "BTCUSDT"))) {
      const list = q.symbols ? JSON.parse(q.symbols) : [q.symbol];
      const one = (s) => { const b = s.replace(/USDT$/, ""); if (!ALTB[b]) return null; const k = altSeries(b, "4h"), lst = k[k.length - 1], o = k[k.length - 7][4]; return { symbol: s, lastPrice: String(lst[4]), priceChangePercent: (((lst[4] - o) / o) * 100).toFixed(2), quoteVolume: String(lst[5] * lst[4] * 6 * 50), highPrice: String(lst[2]), lowPrice: String(lst[3]) }; };
      if (q.symbols) { const r = list.map(one); if (r.some((x) => !x)) return { __status: 400 }; return r; }
      return one(q.symbol) || { __status: 400 };
    }
    if (u.pathname.endsWith("/klines") && q.symbol && q.symbol !== "BTCUSDT") {
      const b = q.symbol.replace(/USDT$/, ""); if (!ALTB[b]) return { __status: 400 };
      return altSeries(b, q.interval === "1d" ? "1d" : "4h").slice(-(+q.limit || 150)).map((x) => [x[0], x[1].toPrecision(8), x[2].toPrecision(8), x[3].toPrecision(8), x[4].toPrecision(8), x[5].toFixed(2), x[0] + 1, (x[5] * x[4]).toFixed(2), 100, (x[5] * 0.5).toFixed(2), "0", "0"]);
    }
    return undefined;
  }
  function voicesRss(q) {
    const T = [["Michael Saylor says Strategy will keep buying bitcoin, sees $1 million BTC by 2030", 3], ["Arthur Hayes warns bitcoin could drop to $70K before Fed liquidity returns", 9], ["Tom Lee predicts bitcoin at $200,000 by year-end despite pullback", 20],
      ["Peter Schiff calls bitcoin rally a bubble as gold hits record", 30], ["Standard Chartered's Kendrick cuts bitcoin target to $150K", 40], ["Cathie Wood: ARK still bullish, sees bitcoin at $1.5 million in bull case", 50],
      ["Willy Woo: on-chain data shows long-term holders distributing", 60], ["Raoul Pal says liquidity cycle points higher for crypto into 2026", 70], ["Peter Brandt flags possible bearish bitcoin chart pattern", 80],
      ["Brian Armstrong says Coinbase will expand bitcoin lending", 90], ["Matt Hougan: ETF inflows to accelerate as advisers buy bitcoin", 100], ["Jamie Dimon repeats bitcoin skepticism at JPMorgan event", 120],
      ["Lyn Alden explains why bitcoin is undervalued against the money supply", 130], ["Ki Young Ju: CryptoQuant data shows whales accumulating bitcoin", 140]];
    const g = /Hayes|Pal/.test(q) ? 1 : /Zhao|Schiff/.test(q) ? 2 : 0;
    const items = T.filter((_, i) => i % 3 === g).map(([t, h], i) => `<item><title>Sample: ${t} - CoinDesk</title><link>https://example.com/v${g}/${i}</link><pubDate>${new Date(Date.now() - h * 36e5).toUTCString()}</pubDate><source>CoinDesk</source></item>`).join("");
    return `<?xml version="1.0"?><rss version="2.0"><channel><title>Google News</title>${items}</channel></rss>`;
  }
  // ---- v3.1 venues: Gate, HTX, BitMEX, Coinalyze (Binance + Bybit) ----
  function venueAnswer(h, path, q, pxNow) {
    if (h === "api.gateio.ws") return [{ contract: "BTC_USDT", last: String(pxNow - 6), mark_price: String(pxNow - 5), funding_rate: "0.000061", total_size: "565931200", quanto_multiplier: "0.0001" }];
    if (h === "api.hbdm.com") { if (path.includes("open_interest")) return { status: "ok", data: [{ amount: 21500.4, contract_code: "BTC-USDT" }] }; if (path.includes("funding_rate")) return { status: "ok", data: { funding_rate: "0.000045" } }; return { status: "ok", tick: { close: pxNow - 9 } }; }
    if (h === "www.bitmex.com") return [{ markPrice: pxNow + 4, fundingRate: 0.0001, openInterest: Math.round(pxNow * 5200) }];
    if (h === "api.coinalyze.net") {
      if (path.endsWith("/exchanges")) return [{ name: "Binance", code: "A" }, { name: "Bybit", code: "6" }, { name: "OKX", code: "3" }];
      if (path.endsWith("/future-markets")) return [["BTCUSDT_PERP.A", "A", "BTCUSDT", "USDT", "STABLE"], ["BTCUSDC_PERP.A", "A", "BTCUSDC", "USDC", "STABLE"], ["BTCUSD_PERP.A", "A", "BTCUSD_PERP", "USD", "COIN"], ["BTCUSDT.6", "6", "BTCUSDT", "USDT", "STABLE"], ["BTCUSD.6", "6", "BTCUSD", "USD", "COIN"], ["BTCPERP.6", "6", "BTCPERP", "USDC", "STABLE"], ["ETHUSDT_PERP.A", "A", "ETHUSDT", "USDT", "STABLE"], ["BTCUSDT_PERP.3", "3", "BTC-USDT-SWAP", "USDT", "STABLE"]]
        .map(([symbol, exchange, symbol_on_exchange, quote_asset, margined]) => ({ symbol, exchange, symbol_on_exchange, base_asset: symbol.slice(0, 3), quote_asset, is_perpetual: true, margined }));
      const S = (q.symbols || "").split(","), OI = { "BTCUSDT_PERP.A": 6.2e9, "BTCUSDC_PERP.A": 6.5e8, "BTCUSD_PERP.A": 1.1e9, "BTCUSDT.6": 4.3e9, "BTCUSD.6": 9.5e8, "BTCPERP.6": 2.1e8 }, FR = { "BTCUSDT_PERP.A": 0.0062, "BTCUSDC_PERP.A": 0.0041, "BTCUSD_PERP.A": 0.0078, "BTCUSDT.6": 0.0055, "BTCUSD.6": 0.0049, "BTCPERP.6": 0.0035 };
      if (path.endsWith("/open-interest")) return S.map((s) => ({ symbol: s, value: OI[s] || 0, update: Date.now() }));
      if (path.endsWith("/funding-rate")) return S.map((s) => ({ symbol: s, value: FR[s] || 0, update: Date.now() }));
    }
    return undefined;
  }
module.exports = function(url, method){
  const u = new URL(url); const q = Object.fromEntries(u.searchParams);
  if (u.host==='data-api.binance.vision'){
    const am = altAnswer(u, q); if (am !== undefined) return am;
    if (u.pathname.endsWith('/ticker/24hr')) return {lastPrice:'80283.10',priceChangePercent:'-1.60',highPrice:'81682',lowPrice:'79221',volume:'11000',quoteVolume:'889222877'};
    if (u.pathname.endsWith('/klines')) return kl(q.interval, +q.limit);
  }
  if (u.host==='api.exchange.coinbase.com') { if (u.pathname.endsWith('/stats')) return {last:'80250.5',open:'80800',volume:'9100',high:'81500',low:'79200'};
    if (u.pathname.endsWith('/trades')) return Array.from({length:300},(_,i)=>({trade_id:900000-i, time:new Date(Date.now()-i*2000).toISOString(), size:String(Math.random()*0.5), side:Math.random()>0.5?'buy':'sell', price:'80250'}));
    return {price:'80250.5'}; }
  if (u.host==='api.kraken.com') return {error:[],result:{XXBTZUSD:{c:['80255.1','0.01'],o:'80700',v:['900','2100'],h:['81000','81500'],l:['79500','79200']}}};
  if (u.host==='www.bitstamp.net') return {last:'80249',open:'80790',volume:'1500',high:'81480',low:'79210'};
  if (u.host==='api.gemini.com') return {last:'80262',volume:{BTC:'700'}};
  if (u.host==='api.mexc.com') return {lastPrice:'80278',openPrice:'80880',volume:'4000',highPrice:'81590',lowPrice:'79250'};
  if (u.host==='api.coinalyze.net' && process.env.NOCZ) return {__status:503};
  { const va = venueAnswer(u.host, u.pathname, q, 80270); if (va !== undefined) return va; }
  if (u.host==='www.okx.com'){
    if (u.pathname.includes('market/ticker')) return {code:'0',data:[{last:'80270.1',open24h:'80900',vol24h:'5200',high24h:'81600',low24h:'79300'}]};
    if (u.pathname.includes('liquidation-orders')) return {code:'0',data:[{instFamily:q.instFamily, instId:q.instFamily+'-SWAP', details:Array.from({length:30},(_,i)=>({side:i%3?'sell':'buy',posSide:i%3?'long':'short',bkPx:String(80000+i*20),sz:String(20+i*7),ts:String(Date.now()-i*240000)}))}]};
    if (u.pathname.includes('funding-rate')) return {code:'0',data:[{fundingRate:'0.0000361'}]};
    if (u.pathname.includes('public/open-interest')) return {code:'0',data:[{oiCcy:'25000.5'}]};
    if (u.pathname.includes('open-interest-volume')) return q.period==='1H' ? {code:'0',data:rub(200,i=>[String(2.0e9 - i*3e6 + Math.sin(i/5)*2e7), '1e9'],3600)} : {code:'0',data:rub(288,i=>[String(2.0e9+ i*1e6), '1e9'])};
    if (u.pathname.includes('taker-volume')) return q.period==='1H' ? {code:'0',data:rub(200,i=>[String(100+Math.random()*50), String(100+Math.random()*50)],3600)} : {code:'0',data:rub(288,i=>[String(100+Math.random()*50), String(100+Math.random()*50)])};
    if (u.pathname.includes('long-short')) return {code:'0',data:rub(288,i=>[String(1.6+Math.sin(i/20)*0.2)])};
  }
  if (u.host==='api.hyperliquid.xyz') return [{universe:[{name:'BTC'},{name:'ETH'}]},[{markPx:'80281',funding:'0.0000125',openInterest:'31000'},{markPx:'3000',funding:'0',openInterest:'1'}]];
  if (u.host==='api.bitget.com') return u.pathname.includes('/spot/') ? {code:'00000',data:[{lastPr:'80268',open:'80850',baseVolume:'3100',high24h:'81580',low24h:'79230'}]} : {code:'00000',data:[{lastPr:'80275',fundingRate:'0.00005',holdingAmount:'42000'}]};
  if (u.host==='www.deribit.com') {
    if (u.pathname.includes('book_summary') && q.kind==='future') return {result:[{instrument_name:'BTC-PERPETUAL',mark_price:80290,open_interest:9e8,volume_usd:1e9},{instrument_name:'BTC-31OCT26',mark_price:80330,open_interest:1e8,volume_usd:2e7},{instrument_name:'BTC-25DEC26',mark_price:81200,open_interest:3e8,volume_usd:5e7},{instrument_name:'BTC-26MAR27',mark_price:82400,open_interest:2e8,volume_usd:3e7}]};
    if (u.pathname.includes('book_summary')) { const r=[]; const E = [1, 3, 8, 29, 57].map((d) => { const x = new Date(Date.now() + d * 864e5); return x.getUTCDate() + ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][x.getUTCMonth()] + String(x.getUTCFullYear()).slice(2); }); for (const e of E) for (let k=64000;k<=100000;k+=1000) for (const cp of ['C','P']) r.push({instrument_name:`BTC-${e}-${k}-${cp}`, open_interest: Math.max(0, 900-Math.abs(k-(cp==='C'?86000:76000))/30)*(e===E[3]?3:1)*(k%2000?0.4:1), volume: 10, mark_iv: 42+Math.abs(k-80000)/1500, underlying_price: 80250}); return {result:r}; }
    return {result:{mark_price:80290,funding_8h:0.00002,open_interest:900000000}}; }
  if (u.host==='futures.kraken.com') return {result:'success',ticker:{markPrice:80280,last:80280,fundingRate:0.8,openInterest:3000}};
  if (u.host==='contract.mexc.com') return {success:true,data:{lastPrice:80279,fundingRate:0.0001,holdVol:120000000}};
  if (u.host==='open-api.bingx.com') return {code:0,data:{markPrice:'80282',lastFundingRate:'0.00008'}};
  if (u.host==='api.alternative.me') return {data:[{value:'38',value_classification:'Fear'},{value:'44',value_classification:'Fear'}]};
  if (u.host==='nfs.faireconomy.media') return [{title:'Federal Funds Rate',country:'USD',date:new Date(Date.now()+864e5).toISOString(),impact:'High',forecast:'3.75%',previous:'4.00%'},{title:'JOLTS Job Openings',country:'USD',date:new Date(Date.now()-36e5).toISOString(),impact:'Medium'}];
  if (/rss\/search/.test(url) && /when%3A7d|when:7d/.test(url)) return { __xml: voicesRss(decodeURIComponent(url)) };
  if (NEWS_HOSTS.includes(u.host)) return { __xml: sampleRss(u.host) };
  if (u.host==='api.bybit.com') return {__status:403};
  if (u.host==='fapi.binance.com') return {__status:451};
  return null;
};

module.exports.voicesRss = voicesRss;
