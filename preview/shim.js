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
  function answer(url) {
    const u = new URL(url, "https://demo.local"), q = Object.fromEntries(u.searchParams), h = u.host, path = u.pathname;
    if (h === "data-api.binance.vision") {
      if (path.endsWith("/ticker/24hr")) { const s = series("1h"), o = s.at(-25).c; return { lastPrice: P(0), priceChangePercent: (((px() - o) / o) * 100).toFixed(2), highPrice: String(Math.max(...s.slice(-24).map((b) => b.h))), lowPrice: String(Math.min(...s.slice(-24).map((b) => b.l))), volume: "11000", quoteVolume: "889222877" }; }
      if (path.endsWith("/klines")) return kl(q.interval, +q.limit);
    }
    if (h === "api.exchange.coinbase.com") {
      if (path.endsWith("/stats")) return { last: P(-32), open: "80800", volume: "9100", high: "81500", low: "79200" };
      if (path.endsWith("/trades")) return Array.from({ length: 200 }, (_, i) => ({ trade_id: 9e6 - i - Math.floor(Date.now() / 1000), time: new Date(Date.now() - i * 3000).toISOString(), size: String(rnd() * 0.6), side: rnd() > 0.5 ? "buy" : "sell", price: P(-30) }));
      return { price: P(-33) };
    }
    if (h === "www.okx.com") {
      if (path.includes("market/ticker")) return { code: "0", data: [{ last: P(-12), open24h: "80900", vol24h: "5200", high24h: "81600", low24h: "79300" }] };
      if (path.includes("liquidation-orders")) return { code: "0", data: [{ instFamily: q.instFamily, instId: q.instFamily + "-SWAP", details: Array.from({ length: 30 }, (_, i) => ({ side: i % 3 ? "sell" : "buy", posSide: i % 3 ? "long" : "short", bkPx: P(-200 + i * 25), sz: String(Math.round(20 + rnd() * 300)), ts: String(Date.now() - i * 1700000) })) }] };
      if (path.includes("funding-rate")) return { code: "0", data: [{ fundingRate: "0.0000361" }] };
      if (path.includes("public/open-interest")) return { code: "0", data: [{ oiCcy: "25000.5" }] };
      if (path.includes("open-interest-volume")) { const sec = q.period === "1H" ? 3600 : q.period === "1D" ? 86400 : 300; return { code: "0", data: rub(q.period === "1D" ? 120 : 300, (i) => [String(2.05e9 - i * (sec / 1500) * 1e3 + Math.sin(i / 7) * 2.5e7 + Math.sin(i / 2.3) * 4e6), "1e9"], sec) }; }
      if (path.includes("taker-volume")) { const sec = q.period === "1H" ? 3600 : q.period === "1D" ? 86400 : 300; return { code: "0", data: rub(q.period === "1D" ? 120 : 300, (i) => { const tilt = Math.sin(i / 9) * 25; return [String(100 - tilt + rnd() * 40), String(100 + tilt + rnd() * 40)]; }, sec) }; }
      if (path.includes("long-short")) { const sec = q.period === "1H" ? 3600 : q.period === "1D" ? 86400 : 300; return { code: "0", data: rub(q.period === "1D" ? 120 : 300, (i) => [String(1.6 + Math.sin(i / 40) * 0.2 + Math.sin(i / 3) * 0.03)], sec) }; }
    }
    if (h === "api.hyperliquid.xyz") return [{ universe: [{ name: "BTC" }] }, [{ markPx: P(-2), funding: "0.0000125", openInterest: "31000" }]];
    if (h === "api.bitget.com") return path.includes("/spot/") ? { code: "00000", data: [{ lastPr: P(-15), open: "80850", baseVolume: "3100", high24h: "81580", low24h: "79230" }] } : { code: "00000", data: [{ lastPr: P(-8), fundingRate: "0.00005", holdingAmount: "42000" }] };
    if (h === "www.deribit.com") {
      if (path.includes("book_summary") && q.kind === "future") return { result: [{ instrument_name: "BTC-PERPETUAL", mark_price: px(), open_interest: 9e8, volume_usd: 1e9 }, { instrument_name: "BTC-27NOV26", mark_price: px() * 1.004, open_interest: 1e8, volume_usd: 2e7 }, { instrument_name: "BTC-25DEC26", mark_price: px() * 1.011, open_interest: 3e8, volume_usd: 5e7 }, { instrument_name: "BTC-26MAR27", mark_price: px() * 1.027, open_interest: 2e8, volume_usd: 3e7 }] };
      if (path.includes("book_summary")) { const r = []; for (const e of ["30OCT26", "27NOV26", "25DEC26"]) for (let k = 64000; k <= 100000; k += 2000) for (const cp of ["C", "P"]) r.push({ instrument_name: `BTC-${e}-${k}-${cp}`, open_interest: Math.max(0, 900 - Math.abs(k - (cp === "C" ? 86000 : 76000)) / 30) * (e === "25DEC26" ? 3 : 1), volume: 10 }); return { result: r }; }
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
  const PXMAP = { okx: "https://www.okx.com", kraken: "https://futures.kraken.com", mexc: "https://contract.mexc.com", bingx: "https://open-api.bingx.com", bybit: "https://api.bybit.com", bnf: "https://fapi.binance.com", krakens: "https://api.kraken.com", bitstamp: "https://www.bitstamp.net", gemini: "https://api.gemini.com", mexcs: "https://api.mexc.com", fng: "https://api.alternative.me", ff: "https://nfs.faireconomy.media" };
  window.fetch = async function (input, opt) {
    let url = typeof input === "string" ? input : input.url; const m = /^\/px\/(\w+)(\/.*)$/.exec(url); if (m) url = PXMAP[m[1]] + m[2];
    await new Promise((r) => setTimeout(r, 60 + rnd() * 120));
    const d = answer(url); if (d === null) throw new TypeError("Failed to fetch");
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
