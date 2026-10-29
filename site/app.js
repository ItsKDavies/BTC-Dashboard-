"use strict";
/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const ok = (v) => typeof v === "number" && Number.isFinite(v);
const LS = {
  get(k, d) { try { const v = localStorage.getItem("v2." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("v2." + k, JSON.stringify(v)); } catch (e) {} },
};
const ST = {
  tf: LS.get("tf", "30m"), auto: LS.get("auto", true), tab: LS.get("tab", "overview"),
  ema: LS.get("ema", true), vwap: LS.get("vwap", true), lv: LS.get("lv", true), cvd: LS.get("cvd", true), oi: LS.get("oi", true),
  off: LS.get("off", {}),
};
const n0 = (v) => (ok(v) ? Math.round(v).toLocaleString("en-US") : "–");
const nd = (v, d) => (ok(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "–");
const pct = (v, d = 2) => (ok(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(d)}%` : "–");
const sgn = (v, d = 1) => (ok(v) ? `${v >= 0 ? "+" : ""}${nd(v, d)}` : "–");
const usd = (v) => { if (!ok(v)) return "–"; const a = Math.abs(v), s = v < 0 ? "-" : ""; if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`; if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`; if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`; return `${s}$${a.toFixed(0)}`; };
const kfmt = (v) => (ok(v) ? (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : nd(v, 0)) : "–");
const cls = (v) => (!ok(v) || v === 0 ? "mut" : v > 0 ? "up" : "dn");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ago = (ms) => { if (!ms) return "never"; const s = Math.max(0, Math.round((Date.now() - ms) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`; };
const every = (ms) => (ms < 60000 ? `${ms / 1000}s` : `${ms / 60000}m`);
const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

class HttpErr extends Error { constructor(status) { super("HTTP " + status); this.status = status; } }
async function getJSON(url, opt = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(url, { ...opt, signal: ctl.signal, cache: "no-store" });
    if (!r.ok) throw new HttpErr(r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
function why(e, optional) {
  if (e && e.blocked) return { txt: e.message, blocked: true };
  if (e && e.ws) return { txt: e.message + " · reconnecting" }; // live socket dropped (common when the phone sleeps or switches apps)
  if (e && e.status) {
    if (e.status === 451 || e.status === 403) return { txt: `Refused in your region (HTTP ${e.status})`, blocked: true };
    if (e.status === 429) return { txt: "Rate limited (HTTP 429), backing off" };
    return { txt: `Server error (HTTP ${e.status})` };
  }
  if (e && e.name === "AbortError") return { txt: "Timed out after 9s" };
  if (e instanceof TypeError && /fetch|network|load/i.test(e.message || "")) return { txt: "Blocked by the browser or network (CORS or region)", blocked: optional };
  return { txt: "Unexpected data: " + ((e && e.message) || e) };
}
// Exchanges that refuse direct browser requests go through this site's own /px/ pass-through (see _redirects).
const PROXY = { "www.okx.com": "/px/okx", "futures.kraken.com": "/px/kraken", "contract.mexc.com": "/px/mexc", "open-api.bingx.com": "/px/bingx", "api.bybit.com": "/px/bybit", "fapi.binance.com": "/px/bnf",
  "api.kraken.com": "/px/krakens", "www.bitstamp.net": "/px/bitstamp", "api.gemini.com": "/px/gemini", "api.mexc.com": "/px/mexcs" };
const canProxy = /^https?:$/.test(location.protocol);
async function getJSONp(url, opt) {
  const u = new URL(url), pre = PROXY[u.host];
  if (pre && canProxy) {
    try { return await getJSON(pre + u.pathname + u.search, opt); }
    catch (e) { if (!(e.status === 404 || e instanceof SyntaxError)) throw e; } // pass-through missing: try direct
  }
  return getJSON(url, opt);
}
const okxR0 = async (path) => { const j = await getJSONp("https://www.okx.com" + path); if (j.code !== "0") throw new Error("OKX " + j.code + " " + (j.msg || "")); return j.data; };
// OKX's stats endpoints (rubik) allow ~5 calls per 2s. Several panels ask for the same series, so: share identical
// requests, reuse answers for 50s, space calls 450ms apart, and retry once after a pause if OKX says 429.
const RUB = { last: 0, chain: Promise.resolve(), memo: new Map() };
const okxR = (path) => {
  if (!path.includes("/rubik/")) return okxR0(path);
  const hit = RUB.memo.get(path); if (hit && (hit.p || Date.now() - hit.at < 50000)) return hit.p || Promise.resolve(hit.v);
  const run = async () => { const wait = Math.max(0, RUB.last + 450 - Date.now()); RUB.last = Date.now() + wait; if (wait) await new Promise((r) => setTimeout(r, wait)); return okxR0(path); };
  const go = async () => { try { return await run(); } catch (e) { if (e.status !== 429) throw e; await new Promise((r) => setTimeout(r, 2500 + Math.random() * 1500)); return run(); } };
  const p = (RUB.chain = RUB.chain.catch(() => {}).then(go));
  RUB.memo.set(path, { p });
  p.then((v) => RUB.memo.set(path, { v, at: Date.now() }), () => RUB.memo.delete(path));
  return p;
};
const okx = async (path) => { const j = await getJSON("https://www.okx.com" + path); if (j.code !== "0") throw new Error("OKX " + j.code + " " + (j.msg || "")); return j.data; };

/* ---------- data sources: each one independent ---------- */
const D = {};          // latest data per source id
const SRC = {};        // registry
function def(id, name, feeds, ms, run, optional = false) {
  SRC[id] = { id, name, feeds, ms, run, optional, busy: false, st: { s: "wait", err: "", okAt: 0, fails: 0, next: 0, lat: 0 } };
}
const BN = "https://data-api.binance.vision/api/v3";
const pk = (r) => ({ t: Math.floor(r[0] / 1000), o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5], tb: +r[9] });

def("spot", "Binance spot ticker", "Header price, 24h stats", 5000, async () => {
  const j = await getJSON(`${BN}/ticker/24hr?symbol=BTCUSDT`);
  const o = { px: +j.lastPrice, chg: +j.priceChangePercent, hi: +j.highPrice, lo: +j.lowPrice, vol: +j.volume, qv: +j.quoteVolume };
  if (!ok(o.px)) throw new Error("no lastPrice"); return o;
});
def("kl", "Binance spot candles", "Main chart, CVD pane", 5000, async (prev) => {
  const tf = ST.tf, full = !prev || prev.tf !== tf || Date.now() - prev.fullAt > 5 * 60000;
  const rows = (await getJSON(`${BN}/klines?symbol=BTCUSDT&interval=${tf}&limit=${full ? 1000 : 3}`)).map(pk);
  if (!rows.length) throw new Error("no candles");
  if (full) return { tf, k: rows, fullAt: Date.now(), ver: (prev ? prev.ver : 0) + 1 };
  const k = prev.k.slice();
  for (const r of rows) { let i = k.length - 1; while (i >= 0 && k[i].t > r.t) i--; if (i >= 0 && k[i].t === r.t) k[i] = r; else if (!k.length || r.t > k[k.length - 1].t) k.push(r); }
  return { tf, k, fullAt: prev.fullAt, ver: prev.ver };
});
def("k5", "Binance spot 5m", "Flow read, CVD KPIs", 30000, async () => {
  const k = (await getJSON(`${BN}/klines?symbol=BTCUSDT&interval=5m&limit=288`)).map(pk);
  if (k.length < 50) throw new Error("too few 5m candles"); return { k };
});
def("kd", "Binance spot daily", "Levels (PDH/PDL, opens)", 300000, async () => {
  const k = (await getJSON(`${BN}/klines?symbol=BTCUSDT&interval=1d&limit=40`)).map(pk);
  if (k.length < 2) throw new Error("too few daily candles"); return { k };
});
def("cb", "Coinbase spot", "Coinbase premium", 10000, async () => {
  const j = await getJSON("https://api.exchange.coinbase.com/products/BTC-USD/ticker");
  const px = +j.price; if (!ok(px)) throw new Error("no price"); return { px };
});
def("okx", "OKX perp", "Venue: price, funding, OI", 30000, async () => {
  const [tk, fr, oi] = await Promise.all([
    okx("/api/v5/market/ticker?instId=BTC-USDT-SWAP"),
    okx("/api/v5/public/funding-rate?instId=BTC-USDT-SWAP"),
    okx("/api/v5/public/open-interest?instType=SWAP&instId=BTC-USDT-SWAP"),
  ]);
  return { px: +tk[0].last, f8: +fr[0].fundingRate, oi: +oi[0].oiCcy };
});
def("okxOI", "OKX OI history", "OI pane, OI change", 60000, async () => {
  const d = await okxR("/api/v5/rubik/stat/contracts/open-interest-volume?ccy=BTC&period=5m");
  const s = d.map((r) => ({ t: Math.floor(+r[0] / 1000), v: +r[1] })).filter((x) => ok(x.v)).sort((a, b) => a.t - b.t);
  if (s.length < 3) throw new Error("no OI history"); return { s };
});
def("okxTk", "OKX taker volume", "Perp taker flow", 60000, async () => {
  const d = await okxR("/api/v5/rubik/stat/taker-volume?ccy=BTC&instType=CONTRACTS&period=5m");
  const s = d.map((r) => ({ t: Math.floor(+r[0] / 1000), sell: +r[1], buy: +r[2] })).sort((a, b) => a.t - b.t);
  if (!s.length) throw new Error("no taker data"); return { s };
});
def("okxLS", "OKX long/short ratio", "Long/short accounts", 60000, async () => {
  const d = await okxR("/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=BTC&period=5m");
  const s = d.map((r) => ({ t: Math.floor(+r[0] / 1000), v: +r[1] })).sort((a, b) => a.t - b.t);
  if (!s.length) throw new Error("no ratio data"); return { s };
});
def("hl", "Hyperliquid", "Venue: price, funding, OI", 30000, async () => {
  const j = await getJSON("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "metaAndAssetCtxs" }) });
  const i = j[0].universe.findIndex((u) => u.name === "BTC"); const c = j[1][i];
  if (!c) throw new Error("BTC not listed"); return { px: +c.markPx, f8: +c.funding * 8, oi: +c.openInterest };
});
def("bitget", "Bitget perp", "Venue: price, funding, OI", 30000, async () => {
  const j = await getJSON("https://api.bitget.com/api/v2/mix/market/ticker?symbol=BTCUSDT&productType=usdt-futures");
  const t = j.data && j.data[0]; if (!t) throw new Error(j.msg || "no ticker");
  return { px: +t.lastPr, f8: +t.fundingRate, oi: +t.holdingAmount };
});
def("okxInv", "OKX coin-margined perp (BTC-USD)", "Venue: funding, OI", 30000, async () => {
  const [tk, fr, oi] = await Promise.all([okx("/api/v5/market/ticker?instId=BTC-USD-SWAP"), okx("/api/v5/public/funding-rate?instId=BTC-USD-SWAP"), okx("/api/v5/public/open-interest?instType=SWAP&instId=BTC-USD-SWAP")]);
  return { px: +tk[0].last, f8: +fr[0].fundingRate, oi: +oi[0].oiCcy };
});
def("bitgetInv", "Bitget coin-margined perp (BTCUSD)", "Venue: funding, OI", 30000, async () => {
  const j = await getJSON("https://api.bitget.com/api/v2/mix/market/ticker?symbol=BTCUSD&productType=coin-futures");
  const t = j.data && j.data[0]; if (!t) throw new Error(j.msg || "no ticker");
  return { px: +t.lastPr, f8: +t.fundingRate, oi: +t.holdingAmount };
});
def("deribit", "Deribit perp", "Venue: price, funding, OI", 30000, async () => {
  const j = await getJSON("https://www.deribit.com/api/v2/public/ticker?instrument_name=BTC-PERPETUAL");
  const r = j.result; if (!r) throw new Error("no result");
  const px = +r.mark_price; return { px, f8: +r.funding_8h, oi: ok(+r.open_interest) && px ? +r.open_interest / px : NaN };
});
def("kraken", "Kraken Futures", "Venue: price, funding, OI", 30000, async () => {
  const j = await getJSONp("https://futures.kraken.com/derivatives/api/v3/tickers/PF_XBTUSD");
  const t = j.ticker; if (!t) throw new Error(j.error || "no ticker");
  const px = +t.markPrice || +t.last; let f8 = (+t.fundingRate / px) * 8;
  if (ok(f8) && Math.abs(f8) < 1e-7) f8 = +t.fundingRate * 8; // already relative
  return { px, f8: ok(f8) && Math.abs(f8) < 0.01 ? f8 : NaN, oi: +t.openInterest };
});
def("mexc", "MEXC perp", "Venue: price, funding, OI", 60000, async () => {
  const j = await getJSONp("https://contract.mexc.com/api/v1/contract/ticker?symbol=BTC_USDT");
  const t = j.data; if (!t) throw new Error("no ticker");
  return { px: +t.lastPrice, f8: +t.fundingRate, oi: +t.holdVol * 0.0001 };
});
def("bingx", "BingX perp", "Venue: price, funding", 60000, async () => {
  const j = await getJSONp("https://open-api.bingx.com/openApi/swap/v2/quote/premiumIndex?symbol=BTC-USDT");
  const t = Array.isArray(j.data) ? j.data[0] : j.data; if (!t) throw new Error(j.msg || "no data");
  return { px: +t.markPrice, f8: +t.lastFundingRate, oi: NaN };
});
def("bybit", "Bybit perp", "Venue: price, funding, OI", 30000, async () => {
  const j = await getJSONp("https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT");
  const t = j.result && j.result.list && j.result.list[0]; if (!t) throw new Error(j.retMsg || "no ticker");
  return { px: +t.lastPrice, f8: +t.fundingRate, oi: +t.openInterest };
}, true);
def("bnf", "Binance futures", "Venue: price, funding, OI", 30000, async () => {
  const [pi, oi] = await Promise.all([getJSONp("https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT"), getJSONp("https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT")]);
  return { px: +pi.markPrice, f8: +pi.lastFundingRate, oi: +oi.openInterest };
}, true);
const VENUES = [["okx", "OKX"], ["okxInv", "OKX coin-m"], ["bnf", "Binance"], ["bybit", "Bybit"], ["bitget", "Bitget"], ["bitgetInv", "Bitget coin-m"], ["hl", "Hyperliquid"], ["deribit", "Deribit"], ["kraken", "Kraken"], ["mexc", "MEXC"], ["bingx", "BingX"]];

/* ---------- scheduler ---------- */
function status(id) {
  const s = SRC[id]; if (ST.off[id]) return "off";
  if (s.st.s === "ok" && Date.now() - s.st.okAt > Math.max(3 * s.ms, 90000)) return "stale";
  return s.st.s;
}
const live = (id) => { const x = status(id); return (x === "ok" || x === "stale") && D[id]; };
async function tick(id) {
  const s = SRC[id]; if (s.busy || ST.off[id]) return;
  s.busy = true; const t0 = performance.now();
  try {
    D[id] = await s.run(D[id]);
    Object.assign(s.st, { s: "ok", err: "", okAt: Date.now(), fails: 0, lat: Math.round(performance.now() - t0) });
  } catch (e) {
    if (e && e.soft) { s.st.s = s.st.okAt ? "down" : "wait"; s.st.err = e.message; s.busy = false; s.st.next = Date.now() + s.ms; render(); return; }
    const w = why(e, s.optional); s.st.fails++; s.st.err = w.txt; s.st.s = w.blocked ? "blocked" : "down";
    if (window.console) console.warn("[source]", id, e);
  } finally {
    s.busy = false;
    const back = s.st.s === "ok" ? s.ms : s.st.s === "blocked" ? 30 * 60000 : Math.min(s.ms * 2 ** s.st.fails, 5 * 60000);
    s.st.next = Date.now() + back; render();
  }
}
function tickAll() { for (const id in SRC) tick(id); }
setInterval(() => {
  if (!ST.auto || document.hidden) return;
  const now = Date.now(); for (const id in SRC) if (!SRC[id].busy && SRC[id].st.next <= now) tick(id);
}, 1000);
setInterval(() => render(), 5000); // keep "ago" labels and stale states fresh
document.addEventListener("visibilitychange", () => { if (!document.hidden && ST.auto) for (const id in SRC) if (Date.now() - SRC[id].st.okAt > SRC[id].ms) tick(id); });

/* ---------- derived numbers ---------- */
function win(k, bars) { if (!k || k.length <= bars) return null; const a = k[k.length - 1 - bars], b = k[k.length - 1]; let cvd = 0; for (let i = k.length - bars; i < k.length; i++) cvd += 2 * k[i].tb - k[i].v; return { pChg: ((b.c - a.c) / a.c) * 100, cvd }; }
function seriesChg(s, sec) { if (!s || s.length < 2) return null; const last = s[s.length - 1]; let base = null; for (let i = s.length - 1; i >= 0; i--) if (s[i].t <= last.t - sec) { base = s[i]; break; } return base && base.v ? ((last.v - base.v) / base.v) * 100 : null; }
function takerImb(s, sec) { if (!s || !s.length) return null; const t0 = s[s.length - 1].t - sec; let b = 0, x = 0; for (const r of s) if (r.t > t0) { b += r.buy; x += r.sell; } return b + x ? ((b - x) / (b + x)) * 100 : null; }
function venues() {
  return VENUES.map(([id, name]) => ({ id, name, st: status(id), d: live(id) ? D[id] : null }));
}
// OKX history stats (rubik, ccy=BTC) cover every OKX BTC contract, so scale them by all-venue OI over OKX's own total
function okxScale(dflt) { const A = aggr(), o = (live("okx") ? D.okx.oi : 0) + (live("okxInv") ? D.okxInv.oi : 0); return A.oi && o ? A.oi / o : dflt; }
function aggr() {
  const vs = venues().filter((v) => v.d); let oi = 0, wf = 0, w = 0, n = 0, fmin = Infinity, fmax = -Infinity;
  for (const v of vs) { if (ok(v.d.oi)) { oi += v.d.oi; n++; if (ok(v.d.f8)) { wf += v.d.f8 * v.d.oi; w += v.d.oi; } } if (ok(v.d.f8)) { fmin = Math.min(fmin, v.d.f8); fmax = Math.max(fmax, v.d.f8); } }
  return { oi: n ? oi : null, n, f8: w ? wf / w : null, fmin: ok(fmin) ? fmin : null, fmax: ok(fmax) ? fmax : null, nf: vs.filter((v) => ok(v.d.f8)).length };
}
function levels() {
  if (!live("kd")) return [];
  const k = D.kd.k, out = [], now = new Date(), day = k[k.length - 1], prev = k[k.length - 2];
  out.push({ p: prev.h, t: "PDH" }, { p: prev.l, t: "PDL" }, { p: day.o, t: "Day open" });
  const dow = (now.getUTCDay() + 6) % 7; const wk = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow) / 1000;
  const w = k.find((x) => x.t === wk); if (w) out.push({ p: w.o, t: "Week open" });
  const mo = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000; const m = k.find((x) => x.t === mo); if (m) out.push({ p: m.o, t: "Month open" });
  return out;
}

/* ---------- small SVG charts ---------- */
function spark(vals, w = 96, h = 30, color) {
  const v = vals.filter(ok); if (v.length < 2) return "";
  const lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1;
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * (w - 4) + 2).toFixed(1)},${(2 + (1 - (x - lo) / r) * (h - 4)).toFixed(1)}`).join(" ");
  const last = pts.split(" ").pop().split(",");
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline fill="none" stroke="${color}" stroke-width="1.5" points="${pts}"/><circle cx="${last[0]}" cy="${last[1]}" r="2.5" fill="${color}"/></svg>`;
}
function lineChart(s, fmt, color, h = 150) {
  if (!s || s.length < 2) return `<div class="unavail">Waiting for data…</div>`;
  const W = 600, pl = 6, pr = 92, pt = 12, pb = 26, v = s.map((x) => x.v), lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1, t0 = s[0].t, t1 = s[s.length - 1].t;
  const X = (t) => pl + ((t - t0) / (t1 - t0 || 1)) * (W - pl - pr), Y = (x) => pt + (1 - (x - lo) / r) * (h - pt - pb);
  const pts = s.map((p) => `${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ");
  const tl = (t) => new Date(t * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const g = cssv("--weak"), f3 = cssv("--fg3");
  return `<svg width="100%" viewBox="0 0 ${W} ${h}" style="display:block;max-height:${h + 20}px" aria-hidden="true">
    <line x1="${pl}" x2="${W - pr}" y1="${Y(hi)}" y2="${Y(hi)}" stroke="${g}"/><line x1="${pl}" x2="${W - pr}" y1="${Y(lo)}" y2="${Y(lo)}" stroke="${g}"/>
    <text x="${W - pr + 6}" y="${Y(hi) + 4}" fill="${f3}" font-size="16">${fmt(hi)}</text><text x="${W - pr + 6}" y="${Y(lo) + 4}" fill="${f3}" font-size="16">${fmt(lo)}</text>
    <polyline fill="none" stroke="${color}" stroke-width="1.8" points="${pts}"/>
    <circle cx="${X(t1)}" cy="${Y(v[v.length - 1])}" r="3.5" fill="${color}"/>
    <text x="${W - pr + 6}" y="${Math.min(h - pb, Math.max(pt + 14, Y(v[v.length - 1]) + 4))}" fill="${color}" font-size="17" font-weight="600">${fmt(v[v.length - 1])}</text>
    <text x="${pl}" y="${h - 5}" fill="${f3}" font-size="15">${tl(t0)}</text><text x="${W - pr}" y="${h - 5}" fill="${f3}" font-size="15" text-anchor="end">${tl(t1)}</text></svg>`;
}
function takerChart(s) {
  if (!s || s.length < 2) return `<div class="unavail">Waiting for data…</div>`;
  const W = 600, H = 150, pl = 6, pr = 70, mid = 70, z = s.slice(-72), m = Math.max(...z.map((r) => Math.max(r.buy, r.sell))) || 1, bw = (W - pl - pr) / z.length;
  const up = cssv("--up"), dn = cssv("--dn"), f3 = cssv("--fg3");
  let bars = ""; z.forEach((r, i) => { const x = pl + i * bw, hb = (r.buy / m) * 58, hs = (r.sell / m) * 58; bars += `<rect x="${x.toFixed(1)}" y="${(mid - hb).toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${hb.toFixed(1)}" fill="${up}"/><rect x="${x.toFixed(1)}" y="${mid}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${hs.toFixed(1)}" fill="${dn}"/>`; });
  const i1 = takerImb(s, 3600), i4 = takerImb(s, 4 * 3600);
  return `<svg width="100%" viewBox="0 0 ${W} ${H}" style="display:block;max-height:170px" aria-hidden="true">${bars}
    <text x="${W - pr + 6}" y="30" fill="${up}" font-size="16">buys</text><text x="${W - pr + 6}" y="${mid + 30}" fill="${dn}" font-size="16">sells</text>
    <text x="${pl}" y="${H - 6}" fill="${f3}" font-size="15">last 6h · 5m bars</text></svg>
    <div class="sub">Imbalance 1h <b class="${cls(i1)}">${pct(i1, 1)}</b> · 4h <b class="${cls(i4)}">${pct(i4, 1)}</b></div>`;
}
const STL = { ok: "live", stale: "stale", down: "down", blocked: "blocked", wait: "loading", off: "off" };
const stPill = (id) => { const s = status(id); return `<span class="st ${s}">${STL[s]}</span>`; };

/* ---------- main chart (TradingView Lightweight Charts) ---------- */
const CH = { ready: false };
const TFS = ["5m", "15m", "30m", "1h", "4h", "1d"];
function rgba(hex, a) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return hex; const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function chartColors() { return { bg: cssv("--panel"), fg: cssv("--fg2"), fg2: cssv("--fg2"), grid: cssv("--weak"), line: cssv("--line"), up: cssv("--up"), dn: cssv("--dn"), acc: cssv("--acc"), warn: cssv("--warn"), purple: cssv("--purple"), fg3: cssv("--fg3") }; }
function baseOpts(c, h) {
  return {
    autoSize: true, height: h,
    layout: { background: { type: "solid", color: c.bg }, textColor: c.fg, fontFamily: "IBM Plex Sans, system-ui, sans-serif", fontSize: 12 },
    grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
    rightPriceScale: { borderColor: c.line, minimumWidth: 72 },
    timeScale: { borderColor: c.line, timeVisible: true, secondsVisible: false, rightOffset: 6 },
    crosshair: { mode: 0 },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: { time: true, price: true }, mouseWheel: true, pinch: true },
    kineticScroll: { touch: true, mouse: false },
    localization: { timeFormatter: (t) => new Date(t * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) },
  };
}
function initChart() {
  const LW = window.LightweightCharts;
  if (!LW) { $("#cMain").innerHTML = `<div class="chart-msg">The chart library didn't load (unpkg and jsdelivr both failed). Everything else still updates.</div>`; return; }
  const c = chartColors();
  CH.main = LW.createChart($("#cMain"), baseOpts(c));
  CH.cvdC = LW.createChart($("#cCvd"), { ...baseOpts(c), timeScale: { ...baseOpts(c).timeScale, visible: false } });
  CH.oiC = LW.createChart($("#cOi"), baseOpts(c));
  CH.candle = CH.main.addCandlestickSeries({ upColor: c.up, downColor: c.dn, wickUpColor: c.up, wickDownColor: c.dn, borderVisible: false });
  CH.vol = CH.main.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
  CH.main.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
  const ln = (col, extra = {}) => CH.main.addLineSeries({ color: col, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...extra });
  CH.e21 = ln(c.warn); CH.e50 = ln(c.acc); CH.e200 = ln(c.purple); CH.vw = ln(c.fg3, { lineStyle: 2 });
  CH.cvd = CH.cvdC.addLineSeries({ color: c.acc, lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
  CH.oi = CH.oiC.addLineSeries({ color: c.warn, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, priceFormat: { type: "custom", formatter: (v) => kfmt(v) } });
  CH.lines = [];
  const all = [CH.main, CH.cvdC, CH.oiC]; let sync = false;
  all.forEach((ch) => ch.timeScale().subscribeVisibleTimeRangeChange((r) => { if (sync || !r) return; sync = true; all.forEach((o) => { if (o !== ch) { try { o.timeScale().setVisibleRange(r); } catch (e) {} } }); sync = false; }));
  CH.main.subscribeCrosshairMove((p) => { const d = p && p.seriesData ? p.seriesData.get(CH.candle) : null; showOhlc(d); });
  CH.ready = true;
}
function showOhlc(d) {
  if (!d) { const k = D.kl && D.kl.k; d = k && k[k.length - 1]; if (!d) { $("#ohlc").textContent = ""; return; } }
  const ch = ((d.close ?? d.c) - (d.open ?? d.o)) / (d.open ?? d.o) * 100;
  $("#ohlc").innerHTML = `O ${n0(d.open ?? d.o)} H ${n0(d.high ?? d.h)} L ${n0(d.low ?? d.l)} C <span class="${cls(ch)}">${n0(d.close ?? d.c)} ${pct(ch)}</span>`;
}
function barsToShow() { const w = ($("#cMain") && $("#cMain").clientWidth) || 800; return Math.round(Math.min(160, Math.max(40, w / 7))); }
function resetView() {
  if (!CH.ready || !D.kl) return; const n = D.kl.k.length;
  CH.main.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - barsToShow()), to: n + 4 });
  CH.main.priceScale("right").applyOptions({ autoScale: true });
}
function zoom(f) {
  if (!CH.ready) return; const ts = CH.main.timeScale(), r = ts.getVisibleLogicalRange(); if (!r) return;
  const span = Math.max(12, Math.min(1000, (r.to - r.from) * f)); ts.setVisibleLogicalRange({ from: r.to - span, to: r.to });
}
function setFull(on) {
  const p = $("#chartPanel"); if (!p) return;
  if (on) { CH.scrollY = window.scrollY; document.body.style.top = `-${CH.scrollY}px`; document.body.classList.add("locked"); p.classList.add("full"); }
  else { p.classList.remove("full"); document.body.classList.remove("locked"); document.body.style.top = ""; window.scrollTo(0, CH.scrollY || 0); }
  $("#bFull").textContent = on ? "✕ Close" : "⤢ Expand"; $("#bFull").setAttribute("aria-pressed", on);
  setTimeout(resetView, 60);
}
function ema(k, n) { const a = 2 / (n + 1); let e = null; return k.map((r) => { e = e === null ? r.c : r.c * a + e * (1 - a); return { time: r.t, value: e }; }).slice(Math.min(n, k.length)); }
function vwap(k) { let pv = 0, vv = 0, day = -1; return k.map((r) => { const d = Math.floor(r.t / 86400); if (d !== day) { day = d; pv = 0; vv = 0; } pv += ((r.h + r.l + r.c) / 3) * r.v; vv += r.v; return { time: r.t, value: vv ? pv / vv : r.c }; }); }
function updateChart() {
  if (!CH.ready) return;
  const c = chartColors();
  $("#cCvd").hidden = !ST.cvd; $("#cOi").hidden = !ST.oi;
  if (live("kl") && D.kl.tf === ST.tf) {
    const k = D.kl.k, intra = ["5m", "15m", "30m", "1h"].includes(ST.tf);
    const cnd = k.map((r) => ({ time: r.t, open: r.o, high: r.h, low: r.l, close: r.c }));
    const vu = rgba(c.up, 0.4), vd = rgba(c.dn, 0.4);
    const vol = k.map((r) => ({ time: r.t, value: r.v, color: r.c >= r.o ? vu : vd }));
    let cum = 0; const cv = k.map((r) => ({ time: r.t, value: (cum += 2 * r.tb - r.v) }));
    const sig = D.kl.tf + ":" + D.kl.ver;
    if (CH.sig !== sig) {
      CH.candle.setData(cnd); CH.vol.setData(vol); CH.cvd.setData(cv);
      resetView();
      CH.sig = sig;
    } else {
      const lt = CH.lastT || 0; // the library only accepts the last bar or newer
      for (const p of cnd.slice(-3)) if (p.time >= lt) CH.candle.update(p);
      for (const p of vol.slice(-3)) if (p.time >= lt) CH.vol.update(p);
      for (const p of cv.slice(-3)) if (p.time >= lt) CH.cvd.update(p);
    }
    CH.lastT = cnd[cnd.length - 1].time;
    CH.e21.setData(ST.ema ? ema(k, 21) : []); CH.e50.setData(ST.ema ? ema(k, 50) : []); CH.e200.setData(ST.ema ? ema(k, 200) : []);
    CH.vw.setData(ST.vwap && intra ? vwap(k) : []);
    showOhlc();
  }
  const want = ST.lv ? levels() : [], key = want.map((l) => l.t + l.p).join("|");
  if (CH.lvKey !== key) {
    CH.lines.forEach((pl) => CH.candle.removePriceLine(pl));
    CH.lines = want.map((l) => CH.candle.createPriceLine({ price: l.p, color: l.t.startsWith("PD") ? c.fg3 : c.acc, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: l.t }));
    CH.lvKey = key;
  }
  if (live("okxOI")) { const s = D.okxOI.s; const px = (live("spot") && D.spot.px) || 1; const conv = s[s.length - 1].v > 1e7 ? 1 / px : 1; CH.oi.setData(s.map((x) => ({ time: x.t, value: x.v * conv }))); }
  if (typeof chartExtras === "function") chartExtras();
}
function recolorCharts() {
  if (!CH.ready) return; const c = chartColors();
  [CH.main, CH.cvdC, CH.oiC].forEach((ch) => ch.applyOptions({ layout: { background: { type: "solid", color: c.bg }, textColor: c.fg }, grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } } }));
  CH.candle.applyOptions({ upColor: c.up, downColor: c.dn, wickUpColor: c.up, wickDownColor: c.dn });
  CH.e21.applyOptions({ color: c.warn }); CH.e50.applyOptions({ color: c.acc }); CH.e200.applyOptions({ color: c.purple }); CH.vw.applyOptions({ color: c.fg3 });
  CH.cvd.applyOptions({ color: c.acc }); CH.oi.applyOptions({ color: c.warn }); CH.sig = null; CH.lvKey = null; updateChart();
}

/* ---------- rendering ---------- */
let rq = false;
function render() { if (rq) return; rq = true; requestAnimationFrame(() => { rq = false; try { draw(); } catch (e) { console.error(e); } }); }
function draw() {
  const C = chartColors();
  // header
  const sp = live("spot") ? D.spot : null, alt = live("okx") ? D.okx : null;
  const px = sp ? sp.px : alt ? alt.px : null;
  $("#hPx").textContent = n0(px); $("#hSrc").textContent = sp ? "Binance spot" : alt ? "OKX perp (spot unavailable)" : "waiting for price";
  const hc = $("#hChg"); hc.textContent = sp ? `${sp.chg >= 0 ? "▲" : "▼"} ${pct(sp.chg)} 24h` : "–"; hc.className = "chg " + (sp ? (sp.chg >= 0 ? "up" : "dn") : "");
  document.title = px ? `${n0(px)} · BTC Dashboard v2` : "BTC Market Dashboard v2";
  $("#hStats").innerHTML = sp ? `<span>24h range <b>${n0(sp.lo)}–${n0(sp.hi)}</b></span><span>Vol <b>${usd(sp.qv)}</b></span>` : "";
  const ids = Object.keys(SRC).filter((id) => !ST.off[id]), counted = ids.filter((id) => status(id) !== "blocked"), nLive = counted.filter((id) => ["ok", "stale"].includes(status(id))).length;
  const last = Math.max(0, ...ids.map((id) => SRC[id].st.okAt));
  $("#hLive").innerHTML = `<span class="dot ${ST.auto && !document.hidden ? "live" : ""}"></span><span>${nLive} of ${counted.length} sources live · ${ST.auto ? "updated " + ago(last) : "paused"}</span>`;
  $("#bAuto").setAttribute("aria-pressed", ST.auto); $("#bAuto").textContent = ST.auto ? "Auto-refresh on" : "Auto-refresh off";
  if (ST.tab === "overview") { drawKpis(C); drawFlow(); const ks = status("kl"); $("#chartSt").className = "st " + ks; $("#chartSt").textContent = STL[ks]; updateChart(); }
  if (ST.tab === "derivs") drawDerivs(C);
  if (ST.tab === "sources") drawSources();
  if (typeof drawStage2 === "function") drawStage2(ST.tab);
}
function kpi(title, ids, body) {
  const s = ids.map(status), worst = s.includes("ok") || s.includes("stale") ? (s.includes("stale") ? "stale" : "ok") : s.includes("wait") ? "wait" : s[0];
  const pill = `<span class="st ${worst}">${{ ok: "live", stale: "stale", down: "down", blocked: "blocked", wait: "loading", off: "off" }[worst]}</span>`;
  return `<div class="panel"><div class="ph"><span class="pt">${title}</span>${pill}</div>${body}</div>`;
}
function drawKpis(C) {
  const A = aggr(), out = [];
  const oi1 = live("okxOI") ? seriesChg(D.okxOI.s, 3600) : null, oi4 = live("okxOI") ? seriesChg(D.okxOI.s, 4 * 3600) : null;
  out.push(kpi("Aggregate OI", VENUES.map((v) => v[0]), A.oi ? `<div class="kpi-row"><div><div class="big">${kfmt(A.oi)} BTC</div><div class="sub">${A.n} venues · ${usd(A.oi * (live("spot") ? D.spot.px : 0))}</div></div>${live("okxOI") ? spark(D.okxOI.s.slice(-96).map((x) => x.v), 90, 30, C.warn) : ""}</div><div class="sub">OKX OI 1h <b class="${cls(oi1)}">${pct(oi1)}</b> · 4h <b class="${cls(oi4)}">${pct(oi4)}</b></div>` : `<div class="unavail">No venue answered yet</div>`));
  out.push(kpi("Funding · OI-weighted", VENUES.map((v) => v[0]), ok(A.f8) ? `<div class="big ${cls(A.f8)}">${(A.f8 * 100).toFixed(4)}%</div><div class="sub">per 8h · APR ${pct(A.f8 * 3 * 365 * 100, 1)}</div><div class="sub">range ${(A.fmin * 100).toFixed(4)}% to ${(A.fmax * 100).toFixed(4)}% · ${A.nf} venues</div>` : `<div class="unavail">No funding yet</div>`));
  const w1 = live("k5") ? win(D.k5.k, 12) : null, w4 = live("k5") ? win(D.k5.k, 48) : null;
  let cum = 0; const cvdS = live("k5") ? D.k5.k.map((r) => (cum += 2 * r.tb - r.v)) : [];
  out.push(kpi("Spot CVD · Binance", ["k5"], w1 ? `<div class="kpi-row"><div><div class="big ${cls(w1.cvd)}">${sgn(w1.cvd, 0)} BTC</div><div class="sub">last 1h</div></div>${spark(cvdS, 90, 30, C.acc)}</div><div class="sub">4h <b class="${cls(w4 && w4.cvd)}">${sgn(w4 && w4.cvd, 0)} BTC</b> · 24h <b class="${cls(cvdS[cvdS.length - 1])}">${sgn(cvdS[cvdS.length - 1], 0)}</b></div>` : `<div class="unavail">Waiting for 5m candles</div>`));
  const i1 = live("okxTk") ? takerImb(D.okxTk.s, 3600) : null, i4 = live("okxTk") ? takerImb(D.okxTk.s, 4 * 3600) : null;
  out.push(kpi("Perp taker flow · OKX", ["okxTk"], ok(i1) ? `<div class="big ${cls(i1)}">${pct(i1, 1)}</div><div class="sub">1h buy/sell imbalance</div><div class="sub">4h <b class="${cls(i4)}">${pct(i4, 1)}</b></div>` : `<div class="unavail">Waiting for taker data</div>`));
  const prem = live("cb") && live("spot") ? ((D.cb.px - D.spot.px) / D.spot.px) * 100 : null;
  out.push(kpi("Coinbase premium", ["cb", "spot"], ok(prem) ? `<div class="big ${cls(prem)}">${pct(prem, 3)}</div><div class="sub">Coinbase BTC-USD vs Binance BTC-USDT</div><div class="sub">${prem > 0.03 ? "US spot bid stronger" : prem < -0.03 ? "US spot weaker" : "Roughly flat"}</div>` : `<div class="unavail">Needs Coinbase and Binance</div>`));
  const ls = live("okxLS") ? D.okxLS.s : null, lsNow = ls ? ls[ls.length - 1].v : null, ls4 = ls ? seriesChg(ls, 4 * 3600) : null;
  out.push(kpi("Long/short accounts · OKX", ["okxLS"], ok(lsNow) ? `<div class="kpi-row"><div><div class="big">${nd(lsNow, 2)}</div><div class="sub">longs per short account</div></div>${spark(ls.slice(-96).map((x) => x.v), 90, 30, C.purple)}</div><div class="sub">4h change <b class="${cls(ls4)}">${pct(ls4, 1)}</b></div>` : `<div class="unavail">Waiting for ratio</div>`));
  $("#kpis").innerHTML = out.join("");
}
function drawFlow() {
  const rows = [];
  for (const [lab, bars, sec] of [["1h", 12, 3600], ["4h", 48, 14400]]) {
    const w = live("k5") ? win(D.k5.k, bars) : null, oi = live("okxOI") ? seriesChg(D.okxOI.s, sec) : null, ti = live("okxTk") ? takerImb(D.okxTk.s, sec) : null;
    if (!w) { rows.push(`<div class="frow"><div class="fwin">${lab}</div><div class="unavail">Waiting for price data</div></div>`); continue; }
    let tag = "Price only", tc = "mut", why = "";
    if (ok(oi)) {
      const pu = w.pChg >= 0, ou = oi >= 0, flat = Math.abs(oi) < 0.15;
      if (flat) { tag = "OI flat"; tc = "mut"; why = "Positioning barely changed; the move is mostly spot or closing/opening in balance."; }
      else if (pu && ou) { tag = "Longs opening"; tc = "up"; why = "Price up with OI up: new longs are driving it."; }
      else if (!pu && ou) { tag = "Shorts opening"; tc = "dn"; why = "Price down with OI up: new shorts are pressing."; }
      else if (pu && !ou) { tag = "Shorts closing"; tc = "wn"; why = "Price up with OI down: short covering, often weaker follow-through."; }
      else { tag = "Longs closing"; tc = "wn"; why = "Price down with OI down: longs exiting or getting liquidated."; }
    }
    const notes = [];
    if (w.pChg > 0.15 && w.cvd < 0) notes.push(`<span class="dn">Bearish CVD divergence</span>: price up but spot sellers dominate`);
    if (w.pChg < -0.15 && w.cvd > 0) notes.push(`<span class="up">Bullish CVD divergence</span>: price down but spot buyers absorb`);
    if (ok(ti) && Math.abs(ti) > 8) notes.push(`Perp takers lean <b class="${cls(ti)}">${ti > 0 ? "buy" : "sell"} ${pct(ti, 1)}</b>`);
    rows.push(`<div class="frow"><div class="fwin">${lab}</div><div><span class="ftag ${tc}" style="background:color-mix(in srgb,currentColor 12%,transparent)">${tag}</span><span class="mut" style="font-size:13px">price <b class="${cls(w.pChg)}">${pct(w.pChg)}</b> · OI <b class="${cls(oi)}">${pct(oi)}</b> · spot CVD <b class="${cls(w.cvd)}">${sgn(w.cvd, 0)} BTC</b></span>${why ? `<div class="fnote">${why}</div>` : ""}${notes.length ? `<div class="fnote">${notes.join(" · ")}</div>` : ""}</div></div>`);
  }
  $("#flow").innerHTML = rows.join("");
  const s = ["k5", "okxOI", "okxTk"].map(status); $("#flowSt").className = "st " + (s.every((x) => x === "ok") ? "ok" : s.includes("ok") ? "stale" : "wait"); $("#flowSt").textContent = s.every((x) => x === "ok") ? "live" : s.includes("ok") ? "partial" : "loading";
}
function drawDerivs(C) {
  const vs = venues(), A = aggr(), px = live("spot") ? D.spot.px : null;
  const rows = vs.slice().sort((a, b) => ((b.d && b.d.oi) || 0) - ((a.d && a.d.oi) || 0)).map((v) => {
    const d = v.d; const s = status(v.id);
    if (!d) return `<tr><td>${v.name}</td><td colspan="6" class="l mut">${s === "blocked" ? "Blocked in your region" : s === "off" ? "Turned off" : s === "wait" ? "Loading…" : esc(SRC[v.id].st.err || "Unavailable")}</td><td>${stPill(v.id)}</td></tr>`;
    const share = A.oi && ok(d.oi) ? (d.oi / A.oi) * 100 : null;
    return `<tr><td>${v.name}</td><td>${n0(d.px)}</td><td class="${cls(d.f8)}">${ok(d.f8) ? (d.f8 * 100).toFixed(4) + "%" : "–"}</td><td class="${cls(d.f8)}">${ok(d.f8) ? pct(d.f8 * 3 * 365 * 100, 1) : "–"}</td><td>${ok(d.oi) ? kfmt(d.oi) : "–"}</td><td>${ok(d.oi) && px ? usd(d.oi * px) : "–"}</td><td>${ok(share) ? share.toFixed(1) + "%" : "–"}</td><td>${stPill(v.id)}</td></tr>`;
  }).join("");
  $("#venTbl").innerHTML = `<thead><tr><th>Venue</th><th>Price</th><th>Funding/8h</th><th>APR</th><th>OI (BTC)</th><th>OI ($)</th><th>Share</th><th>Status</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td><b>All live</b></td><td></td><td class="${cls(A.f8)}"><b>${ok(A.f8) ? (A.f8 * 100).toFixed(4) + "%" : "–"}</b></td><td></td><td><b>${kfmt(A.oi)}</b></td><td><b>${A.oi && px ? usd(A.oi * px) : "–"}</b></td><td></td><td></td></tr></tfoot>`;
  const nl = vs.filter((v) => v.d).length; $("#venSt").className = "st " + (nl ? "ok" : "wait"); $("#venSt").textContent = `${nl} of ${vs.filter((v) => status(v.id) !== "blocked" && status(v.id) !== "off").length} live`;
  const fv = vs.filter((v) => v.d && ok(v.d.f8)), fm = Math.max(0.0001, ...fv.map((v) => Math.abs(v.d.f8)));
  $("#fBars").innerHTML = fv.length ? fv.map((v) => { const w = (Math.abs(v.d.f8) / fm) * 50; return `<div class="fbar"><span>${v.name}</span><span class="track"><b></b><i style="${v.d.f8 >= 0 ? `left:50%;width:${w}%;background:${C.up}` : `right:50%;width:${w}%;background:${C.dn}`}"></i></span><span class="${cls(v.d.f8)}" style="text-align:right">${(v.d.f8 * 100).toFixed(4)}%</span></div>`; }).join("") : `<div class="unavail">Waiting for venues</div>`;
  const ov = vs.filter((v) => v.d && ok(v.d.oi)).sort((a, b) => b.d.oi - a.d.oi);
  $("#oiBars").innerHTML = ov.length ? ov.map((v) => { const s = (v.d.oi / A.oi) * 100; return `<div class="fbar"><span>${v.name}</span><span class="track"><i style="left:0;width:${s}%;background:${C.acc}"></i></span><span style="text-align:right">${s.toFixed(1)}%</span></div>`; }).join("") : `<div class="unavail">Waiting for venues</div>`;
  const spx = px || 1;
  $("#oiChart").innerHTML = live("okxOI") ? lineChart(D.okxOI.s.map((x) => ({ t: x.t, v: x.v > 1e7 ? x.v / spx : x.v })), (v) => kfmt(v) + " BTC", C.warn) : `<div class="unavail">${esc(SRC.okxOI.st.err || "Loading…")}</div>`;
  $("#lsChart").innerHTML = live("okxLS") ? lineChart(D.okxLS.s, (v) => nd(v, 2), C.purple) : `<div class="unavail">${esc(SRC.okxLS.st.err || "Loading…")}</div>`;
  $("#tkChart").innerHTML = live("okxTk") ? takerChart(D.okxTk.s) : `<div class="unavail">${esc(SRC.okxTk.st.err || "Loading…")}</div>`;
  for (const [el, id] of [["#oiSt", "okxOI"], ["#lsSt", "okxLS"], ["#tkSt", "okxTk"]]) { const s = status(id); $(el).className = "st " + s; $(el).textContent = { ok: "live", stale: "stale", down: "down", blocked: "blocked", wait: "loading", off: "off" }[s]; }
}
function drawSources() {
  const rows = Object.values(SRC).map((s) => {
    const st = status(s.id);
    return `<tr><td>${s.name}${s.optional ? ' <span class="mut">(optional)</span>' : ""}</td><td class="l mut">${s.feeds}</td><td>${every(s.ms)}</td><td>${stPill(s.id)}</td><td>${ago(s.st.okAt)}</td><td>${s.st.lat ? s.st.lat + " ms" : "–"}</td><td class="wrap">${esc(s.st.err || (st === "ok" ? "OK" : ""))}</td><td><button class="btn" data-src="${s.id}" style="min-height:28px;padding:2px 9px">${ST.off[s.id] ? "Turn on" : "Turn off"}</button></td></tr>`;
  }).join("");
  $("#srcTbl").innerHTML = `<thead><tr><th>Source</th><th class="l">Feeds</th><th>Every</th><th>Status</th><th>Last OK</th><th>Latency</th><th class="l">Detail</th><th></th></tr></thead><tbody>${rows}</tbody>`;
}
function report() {
  const lines = [`BTC Dashboard v2.0 stage 4 status · ${new Date().toString()}`, `Browser: ${navigator.userAgent}`, `Page: ${location.href}`, ""];
  for (const s of Object.values(SRC)) lines.push(`${s.id.padEnd(8)} ${status(s.id).padEnd(8)} lastOK=${ago(s.st.okAt)} fails=${s.st.fails} ${s.st.err}`);
  return lines.join("\n");
}

/* ---------- controls ---------- */
function setTab(t) {
  ST.tab = t; LS.set("tab", t);
  document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === t));
  document.querySelectorAll(".view").forEach((v) => (v.hidden = v.dataset.view !== t));
  render();
}
document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
$("#tfSeg").innerHTML = TFS.map((t) => `<button data-tf="${t}">${t}</button>`).join("");
function syncCtl() {
  document.querySelectorAll("[data-tf]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.tf === ST.tf));
  document.querySelectorAll("[data-tog]").forEach((b) => b.setAttribute("aria-pressed", !!ST[b.dataset.tog]));
}
$("#tfSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-tf]"); if (!b || b.dataset.tf === ST.tf) return; ST.tf = b.dataset.tf; LS.set("tf", ST.tf); syncCtl(); CH.sig = null; tick("kl"); });
document.querySelectorAll("[data-tog]").forEach((b) => b.addEventListener("click", () => { const k = b.dataset.tog; ST[k] = !ST[k]; LS.set(k, ST[k]); syncCtl(); render(); }));
$("#bZin").addEventListener("click", () => zoom(0.6));
$("#bZout").addEventListener("click", () => zoom(1.6));
$("#bRst").addEventListener("click", () => resetView());
$("#bFull").addEventListener("click", () => setFull(!$("#chartPanel").classList.contains("full")));
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#chartPanel").classList.contains("full")) setFull(false); });
// Keep iOS Safari from zooming the whole page when you pinch the chart
document.querySelectorAll(".chartbox").forEach((el) => ["gesturestart", "gesturechange", "gestureend"].forEach((ev) => el.addEventListener(ev, (e) => e.preventDefault(), { passive: false })));
$("#bAuto").addEventListener("click", () => { ST.auto = !ST.auto; LS.set("auto", ST.auto); if (ST.auto) tickAll(); render(); });
$("#bNow").addEventListener("click", () => tickAll());
$("#srcTbl").addEventListener("click", (e) => { const b = e.target.closest("[data-src]"); if (!b) return; const id = b.dataset.src; if (ST.off[id]) { delete ST.off[id]; SRC[id].st.s = "wait"; tick(id); } else { ST.off[id] = true; delete D[id]; } LS.set("off", ST.off); render(); });
$("#bCopy").addEventListener("click", () => {
  const txt = report(), box = $("#copyBox"), msg = $("#copyMsg");
  const fallback = () => { box.hidden = false; box.value = txt; box.focus(); box.select(); msg.textContent = "Copying isn't allowed here. The report is selected below; copy it by hand."; };
  try { navigator.clipboard.writeText(txt).then(() => { msg.textContent = "Copied. Paste it to Claude."; }, fallback); } catch (e) { fallback(); }
});
if (window.matchMedia) { const mq = window.matchMedia("(prefers-color-scheme: dark)"); const f = () => { recolorCharts(); render(); }; mq.addEventListener ? mq.addEventListener("change", f) : mq.addListener(f); }

/* ---------- start ---------- */
syncCtl(); initChart(); setTab(ST.tab); tickAll();
