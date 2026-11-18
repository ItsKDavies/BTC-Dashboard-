/* DEMO MODE: no network. Exchange requests and live sockets are answered with generated sample data. */
(function () {
  "use strict";
  const now = () => Math.floor(Date.now() / 1000);
  const SEC = { "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400 };
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const S = {};
  function series(iv) {
    const sec = SEC[iv];
    if (!S[iv]) {
      const n = 1000, out = []; let p = 80200 - (iv === "1d" ? 9000 : iv === "4h" ? 4000 : 1500), t = (Math.floor(now() / sec) - n + 1) * sec;
      const vol = { "5m": 45, "15m": 80, "30m": 110, "1h": 160, "4h": 330, "1d": 900 }[iv] || 60;
      for (let i = 0; i < n; i++) { const o = p, c = o + (rnd() - 0.5) * vol * 2 + Math.sin(i / 23) * vol * 0.35; const h = Math.max(o, c) + rnd() * vol * 0.7, l = Math.min(o, c) - rnd() * vol * 0.7, v = 20 + rnd() * 120 * (iv === "1d" ? 30 : 1); out.push({ t: t + i * sec, o, h, l, c, v, tb: v * (0.38 + rnd() * 0.24) }); p = c; }
      if (iv === "30m") { // sample ascending triangle so the Patterns tab has something to show
        const base = out[n - 71].c, m = 70; for (let j = 0; j < m; j++) { const i = n - m + j, lowL = base + j * 8, top = base + 640, ph = (Math.sin(j / 2.6) + 1) / 2, c = lowL + (top - lowL) * ph + (rnd() - 0.5) * 30, o = out[i - 1].c; out[i] = { ...out[i], o, c, h: Math.max(o, c) + rnd() * 25, l: Math.min(o, c) - rnd() * 25 }; } }
      if (iv === "1h") { // sample bear flag
        const base = out[n - 17].c; for (let j = 0; j < 16; j++) { const i = n - 16 + j, c = j < 5 ? base - j * 380 : base - 1520 + (j - 5) * 45 + (j % 2 ? 60 : -60), o = out[i - 1].c; out[i] = { ...out[i], o, c, h: Math.max(o, c) + 40 + rnd() * 30, l: Math.min(o, c) - 40 - rnd() * 30 }; } }
      const shift = 80283 - out[n - 1].c; out.forEach((b) => { b.o += shift; b.h += shift; b.l += shift; b.c += shift; });
      S[iv] = out;
    }
    const a = S[iv]; let last = a[a.length - 1];
    while (last.t + sec <= now()) { const c = last.c; last = { t: last.t + sec, o: c, h: c, l: c, c, v: 0.5, tb: 0.25 }; a.push(last); }
    const d = (rnd() - 0.5) * 18; last.c += d; last.h = Math.max(last.h, last.c); last.l = Math.min(last.l, last.c); last.v += rnd() * 2; last.tb += rnd();
    return a;
  }
  const px = () => series("5m").at(-1).c;
  const kl = (iv, lim) => series(iv).slice(-lim).map((b) => [b.t * 1000, b.o.toFixed(2), b.h.toFixed(2), b.l.toFixed(2), b.c.toFixed(2), b.v.toFixed(4), (b.t + SEC[iv]) * 1000 - 1, (b.v * b.c).toFixed(2), 1000, b.tb.toFixed(4), "0", "0"]);
  const rub = (n, f, sec = 300) => Array.from({ length: n }, (_, i) => [String((Math.floor(now() / sec) * sec - i * sec) * 1000), ...f(i)]);
  const P = (o) => (+px() + o).toFixed(1);
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
  function answer(url) {
    const u = new URL(url, "https://demo.local"), q = Object.fromEntries(u.searchParams), h = u.host, path = u.pathname;
    if (h === "data-api.binance.vision") {
      const am = altAnswer(u, q); if (am !== undefined) return am;
      if (path.endsWith("/ticker/24hr")) { const s = series("1h"), o = s.at(-25).c; return { lastPrice: P(0), priceChangePercent: (((px() - o) / o) * 100).toFixed(2), highPrice: String(Math.max(...s.slice(-24).map((b) => b.h))), lowPrice: String(Math.min(...s.slice(-24).map((b) => b.l))), volume: "11000", quoteVolume: "889222877" }; }
      if (path.endsWith("/klines")) return kl(q.interval, +q.limit);
    }
    if (h === "api.exchange.coinbase.com") {
      if (path.endsWith("/stats")) return { last: P(-32), open: "80800", volume: "9100", high: "81500", low: "79200" };
      if (path.endsWith("/trades")) return Array.from({ length: 200 }, (_, i) => ({ trade_id: 9e6 - i - Math.floor(Date.now() / 1000), time: new Date(Date.now() - i * 3000).toISOString(), size: String(rnd() * 0.6), side: rnd() > 0.5 ? "buy" : "sell", price: P(-30) }));
      return { price: P(-33) };
    }
    { const va = venueAnswer(h, path, q, px()); if (va !== undefined) return va; }
    if (h === "www.okx.com") {
      if (path.includes("market/ticker")) return { code: "0", data: [{ last: P(-12), open24h: "80900", vol24h: "5200", high24h: "81600", low24h: "79300" }] };
      if (path.includes("liquidation-orders")) return { code: "0", data: [{ instFamily: q.instFamily, instId: q.instFamily + "-SWAP", details: Array.from({ length: 30 }, (_, i) => ({ side: i % 3 ? "sell" : "buy", posSide: i % 3 ? "long" : "short", bkPx: P(-200 + i * 25), sz: String(Math.round(20 + rnd() * 300)), ts: String(Date.now() - i * 1700000) })) }] };
      if (path.includes("funding-rate")) return { code: "0", data: [{ fundingRate: "0.0000361" }] };
      if (path.includes("public/open-interest")) return { code: "0", data: [{ oiCcy: q.instType === "FUTURES" ? "3100.2" : q.instId === "BTC-USDC-SWAP" ? "1850.7" : "25000.5" }] };
      if (path.includes("open-interest-volume")) { const sec = q.period === "1H" ? 3600 : q.period === "1D" ? 86400 : 300; return { code: "0", data: rub(q.period === "1D" ? 120 : 300, (i) => [String(2.05e9 - i * (sec / 1500) * 1e3 + Math.sin(i / 7) * 2.5e7 + Math.sin(i / 2.3) * 4e6), "1e9"], sec) }; }
      if (path.includes("taker-volume")) { const sec = q.period === "1H" ? 3600 : q.period === "1D" ? 86400 : 300; return { code: "0", data: rub(q.period === "1D" ? 120 : 300, (i) => { const tilt = Math.sin(i / 9) * 25; return [String(100 - tilt + rnd() * 40), String(100 + tilt + rnd() * 40)]; }, sec) }; }
      if (path.includes("long-short")) { const sec = q.period === "1H" ? 3600 : q.period === "1D" ? 86400 : 300; return { code: "0", data: rub(q.period === "1D" ? 120 : 300, (i) => [String(1.6 + Math.sin(i / 40) * 0.2 + Math.sin(i / 3) * 0.03)], sec) }; }
    }
    if (h === "api.hyperliquid.xyz") { const nm = ["BTC", "ETH", "SOL", "DOGE", "kPEPE", "SUI"], f = [0.0000125, 0.00007, -0.00004, 0.00009, 0.0001, 0.00002]; return [{ universe: nm.map((name) => ({ name })) }, nm.map((x, i) => ({ markPx: i ? String(ALTB[x.replace(/^k/, "")] || 1) : P(-2), funding: String(f[i]), openInterest: i ? "100000" : "31000", prevDayPx: "1", dayNtlVlm: "1" }))]; }
    if (h === "api.bitget.com") return path.includes("/spot/") ? { code: "00000", data: [{ lastPr: P(-15), open: "80850", baseVolume: "3100", high24h: "81580", low24h: "79230" }] } : { code: "00000", data: [{ lastPr: P(-8), fundingRate: "0.00005", holdingAmount: q.productType === "usdc-futures" ? "2400" : "42000" }] };
    if (h === "www.deribit.com") {
      if (path.includes("book_summary") && q.kind === "future") return { result: [{ instrument_name: "BTC-PERPETUAL", mark_price: px(), open_interest: 9e8, volume_usd: 1e9 }, { instrument_name: "BTC-27NOV26", mark_price: px() * 1.004, open_interest: 1e8, volume_usd: 2e7 }, { instrument_name: "BTC-25DEC26", mark_price: px() * 1.011, open_interest: 3e8, volume_usd: 5e7 }, { instrument_name: "BTC-26MAR27", mark_price: px() * 1.027, open_interest: 2e8, volume_usd: 3e7 }] };
      if (path.includes("book_summary")) { const r = []; const E = [1, 3, 8, 29, 57].map((d) => { const x = new Date(Date.now() + d * 864e5); return x.getUTCDate() + ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][x.getUTCMonth()] + String(x.getUTCFullYear()).slice(2); }); for (const e of E) for (let k = 64000; k <= 100000; k += 1000) for (const cp of ["C", "P"]) r.push({ instrument_name: `BTC-${e}-${k}-${cp}`, open_interest: Math.max(0, 900 - Math.abs(k - (cp === "C" ? 86000 : 76000)) / 30) * (e === E[3] ? 3 : 1) * (k % 2000 ? 0.4 : 1) * (k === 80000 ? 2.2 : 1), volume: 10, mark_iv: 42 + Math.abs(k - 80000) / 1500, underlying_price: px() }); return { result: r }; }
      return { result: { mark_price: px() + 7, funding_8h: 0.00002, open_interest: 9e8 } };
    }
    if (h === "futures.kraken.com") return { result: "success", ticker: { markPrice: px() - 3, last: px() - 3, fundingRate: 0.8, openInterest: 3000 } };
    if (h === "contract.mexc.com") return { success: true, data: { lastPrice: P(-4), fundingRate: 0.0001, holdVol: 120000000 } };
    if (h === "open-api.bingx.com") return { code: 0, data: { markPrice: P(-1), lastFundingRate: "0.00008" } };
    if (h === "api.kraken.com") return { error: [], result: { XXBTZUSD: { c: [P(-28), "0.01"], o: "80700", v: ["900", "2100"], h: ["81000", "81500"], l: ["79500", "79200"] } } };
    if (h === "www.bitstamp.net") return { last: P(-34), open: "80790", volume: "1500", high: "81480", low: "79210" };
    if (h === "api.gemini.com") return { last: P(-21), volume: { BTC: "700" } };
    if (h === "api.mexc.com") return { lastPrice: P(-5), openPrice: "80880", volume: "4000", highPrice: "81590", lowPrice: "79250" };
    if (h === "nfs.faireconomy.media") { const d0 = new Date(); d0.setHours(0, 0, 0, 0); const day = (n, hh, mm) => new Date(d0.getTime() + n * 864e5 + (hh * 60 + mm) * 6e4).toISOString();
      return [{ title: "CB Consumer Confidence", country: "USD", date: day(-1, 10, 0), impact: "High", forecast: "99.2", previous: "98.7" }, { title: "JOLTS Job Openings", country: "USD", date: day(0, 10, 0), impact: "Medium", forecast: "7.40M", previous: "7.23M" },
        { title: "ADP Non-Farm Employment Change", country: "USD", date: day(1, 8, 15), impact: "High", forecast: "112K", previous: "98K" }, { title: "Federal Funds Rate", country: "USD", date: day(1, 14, 0), impact: "High", forecast: "3.75%", previous: "4.00%" },
        { title: "FOMC Press Conference", country: "USD", date: day(1, 14, 30), impact: "High" }, { title: "Advance GDP q/q", country: "USD", date: day(2, 8, 30), impact: "High", forecast: "2.1%", previous: "3.0%" },
        { title: "Core PCE Price Index m/m", country: "USD", date: day(3, 8, 30), impact: "High", forecast: "0.2%", previous: "0.2%" }, { title: "German Prelim CPI", country: "EUR", date: day(2, 8, 0), impact: "High" }]; }
    if (h === "api.alternative.me") return { data: [{ value: "38", value_classification: "Fear" }, { value: "44", value_classification: "Fear" }] };
    if (h === "api.bybit.com") return { __status: 403 };
    if (h === "fapi.binance.com") return { __status: 451 };
    return null;
  }
  const PXMAP = { gate: "https://api.gateio.ws", htx: "https://api.hbdm.com", bitmex: "https://www.bitmex.com", cz: "https://api.coinalyze.net", okx: "https://www.okx.com", kraken: "https://futures.kraken.com", mexc: "https://contract.mexc.com", bingx: "https://open-api.bingx.com", bybit: "https://api.bybit.com", bnf: "https://fapi.binance.com", krakens: "https://api.kraken.com", bitstamp: "https://www.bitstamp.net", gemini: "https://api.gemini.com", mexcs: "https://api.mexc.com", fng: "https://api.alternative.me", ff: "https://nfs.faireconomy.media", coindesk: "https://www.coindesk.com", ctg: "https://cointelegraph.com", theblock: "https://www.theblock.co", decrypt: "https://decrypt.co", btcmag: "https://bitcoinmagazine.com", gnews: "https://news.google.com" };
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
  window.fetch = async function (input, opt) {
    let url = typeof input === "string" ? input : input.url; const m = /^\/px\/(\w+)(\/.*)$/.exec(url); if (m) url = PXMAP[m[1]] + m[2];
    await new Promise((r) => setTimeout(r, 60 + rnd() * 120));
    if (/rss\/search/.test(url) && /when%3A7d|when:7d/.test(url)) return new Response(voicesRss(decodeURIComponent(url)), { status: 200, headers: { "content-type": "application/rss+xml" } });
    if (NEWS_HOSTS.includes(new URL(url).host)) return new Response(sampleRss(new URL(url).host), { status: 200, headers: { "content-type": "application/rss+xml" } });
    const d = answer(url); if (d === null) throw new TypeError("Failed to fetch");
    if (d && d.__status) return new Response("{}", { status: d.__status });
    return new Response(JSON.stringify(d), { status: d.__status || 200, headers: { "content-type": "application/json" } });
  };
  class FakeWS {
    constructor(url) {
      this.url = url; this.readyState = 0; this.timers = [];
      if (/fstream\.binance\.com|bybit\.com/.test(url)) { setTimeout(() => { this.readyState = 3; this.onerror && this.onerror({}); this.onclose && this.onclose({}); }, 400); return; }
      setTimeout(() => { this.readyState = 1; this.onopen && this.onopen({}); if (/binance\.vision/.test(url)) this.every(140, () => ({ e: "aggTrade", p: P((rnd() - 0.5) * 40), q: String(rnd() < 0.03 ? 4 + rnd() * 10 : rnd() * 0.3), T: Date.now(), m: rnd() > 0.5 })); }, 300);
    }
    every(ms, f) { this.timers.push(setInterval(() => { if (this.readyState === 1 && this.onmessage) this.onmessage({ data: JSON.stringify(f()) }); }, ms)); }
    send(msg) {
      if (msg === "ping" || /"ping"/.test(msg)) return;
      if (/liquidation-orders/.test(msg)) this.every(2500, () => ({ arg: { channel: "liquidation-orders", instType: "SWAP" }, data: [{ instId: "BTC-USDT-SWAP", details: [{ side: rnd() > 0.5 ? "buy" : "sell", posSide: rnd() > 0.5 ? "short" : "long", bkPx: P((rnd() - 0.5) * 300), sz: String(Math.round(20 + rnd() * 400)), ts: String(Date.now()) }] }] }));
      if (/"trades"/.test(msg)) this.every(150, () => ({ arg: { channel: "trades", instId: "BTC-USDT-SWAP" }, data: [{ px: P((rnd() - 0.5) * 40), sz: String(rnd() < 0.03 ? 600 + rnd() * 2000 : rnd() * 40), side: rnd() > 0.5 ? "buy" : "sell", ts: String(Date.now()) }] }));
      if (/matches/.test(msg)) this.every(220, () => ({ type: "match", trade_id: Math.floor(Math.random() * 1e12), side: rnd() > 0.5 ? "buy" : "sell", size: String(rnd() < 0.02 ? 3 + rnd() * 5 : rnd() * 0.4), price: P(-30), time: new Date().toISOString() }));
    }
    close() { this.timers.forEach(clearInterval); this.readyState = 3; }
  }
  FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;
  window.WebSocket = FakeWS;
  try { ["v2.liqEvents", "v2.bigTrades"].forEach((k) => localStorage.removeItem(k)); } catch (e) {}
})();
