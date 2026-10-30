"use strict";
/* ===================== Stage 2: more sources, analysis tabs, chart extras ===================== */
Object.assign(ST, {
  mono: LS.get("mono", true), fib: LS.get("fib", false), prof: LS.get("prof", true), avwap: LS.get("avwap", false), sma: LS.get("sma", false),
  zones: LS.get("zones", false), liq: LS.get("liq", false), lev: LS.get("lev", 25), margin: LS.get("margin", 100),
  liqRange: LS.get("liqRange", 6), liqSide: LS.get("liqSide", "both"),
  tpo: LS.get("tpo", true), fibOff: LS.get("fibOff", {}), fibOpen: LS.get("fibOpen", true), fibSrc: LS.get("fibAutoV1", false) ? LS.get("fibSrc", "auto") : "auto", fibLock: LS.get("fibLock", true), cvdOff: LS.get("cvdOff", {}),
});
const lastOf = (a) => a[a.length - 1];
const ATFS = ["15m", "30m", "1h", "4h", "1d"];
const blockedErr = (msg) => { const e = new Error(msg); e.blocked = true; return e; };

/* ---------- more polled sources ---------- */
def("taK", "Binance spot 5m–1D", "TA, patterns, setups, liquidation model", 60000, async () => {
  const lim = { "15m": 300, "30m": 300, "1h": 300, "4h": 300, "1d": 250 }, out = {};
  await Promise.all([...ATFS, "5m"].map(async (tf) => { out[tf] = (await getJSON(`${BN}/klines?symbol=BTCUSDT&interval=${tf}&limit=${lim[tf] || 300}`)).map(pk); })); // 5m is for patterns and fib only, not the TA score
  return out;
});
def("okxOI1h", "OKX OI hourly", "Liquidation map model", 300000, async () => {
  const d = await okxR("/api/v5/rubik/stat/contracts/open-interest-volume?ccy=BTC&period=1H");
  const s = d.map((r) => ({ t: Math.floor(+r[0] / 1000), v: +r[1] })).filter((x) => ok(x.v)).sort((a, b) => a.t - b.t);
  if (s.length < 6) throw new Error("no hourly OI"); return { s };
});
def("okxSpTk", "OKX spot taker volume", "CVD by exchange", 60000, async () => {
  const d = await okxR("/api/v5/rubik/stat/taker-volume?ccy=BTC&instType=SPOT&period=5m");
  const s = d.map((r) => ({ t: Math.floor(+r[0] / 1000), sell: +r[1], buy: +r[2] })).sort((a, b) => a.t - b.t);
  if (!s.length) throw new Error("no spot taker data"); return { s };
});

/* ---------- liquidation events (OKX REST + live sockets) ---------- */
const LIQ = new Map();
(LS.get("liqEvents", []) || []).forEach((e) => LIQ.set(e.k, e));
function addLiq(e) { if (!ok(e.usd) || !ok(e.px) || !ok(e.t) || e.usd <= 0) return; e.k = `${e.src}|${e.t}|${e.px}|${Math.round(e.usd)}`; if (!LIQ.has(e.k)) LIQ.set(e.k, e); }
function pruneLiq() { const cut = Date.now() - 24 * 3600e3; for (const [k, e] of LIQ) if (e.t < cut) LIQ.delete(k); }
setInterval(() => { pruneLiq(); LS.set("liqEvents", [...LIQ.values()].sort((a, b) => a.t - b.t).slice(-1500)); }, 30000);
function okxLiqRows(rows) {
  for (const r of rows || []) {
    const id = r.instId || r.instFamily || r.uly || ""; if (!id.startsWith("BTC-USD")) continue; const lin = id.includes("USDT");
    for (const d of r.details || []) {
      const sz = +d.sz, px = +d.bkPx; const side = d.posSide === "long" ? "long" : d.posSide === "short" ? "short" : d.side === "sell" ? "long" : "short";
      addLiq({ t: +d.ts, side, px, usd: lin ? sz * 0.01 * px : sz * 100, src: "OKX" });
    }
  }
}
def("okxLiq", "OKX liquidations", "Liquidations feed (recent history)", 60000, async () => {
  const [a, b] = await Promise.all(["BTC-USDT", "BTC-USD"].map((f) => okxR(`/api/v5/public/liquidation-orders?instType=SWAP&instFamily=${f}&state=filled&limit=100`)));
  okxLiqRows(a); okxLiqRows(b); pruneLiq(); return { n: LIQ.size };
});

/* ---------- live sockets (show up in Sources like any other feed) ---------- */
function wsDef(id, name, feeds, url, onOpen, onMsg, opt = {}) {
  const W = { sock: null, err: "", n: 0 };
  const connect = () => {
    W.err = ""; let ws; try { ws = new WebSocket(url); } catch (e) { W.err = e.message; return; }
    W.sock = ws; W.n = 0;
    ws.onopen = () => { W.since = Date.now(); try { onOpen(ws); } catch (e) {} if (opt.ping) { clearInterval(W.pt); W.pt = setInterval(() => { try { ws.send(opt.ping); } catch (e) {} }, 20000); } };
    ws.onmessage = (e) => { if (e.data === "pong") return; W.n++; try { onMsg(JSON.parse(e.data)); } catch (err) {} };
    ws.onerror = () => { W.err = opt.optional ? "Connection refused (likely blocked in your region)" : "Connection dropped or refused"; };
    ws.onclose = () => { clearInterval(W.pt); if (!W.err) W.err = "Disconnected, reconnecting"; };
  };
  def(id, name, feeds, 5000, async () => {
    if (W.sock && W.sock.readyState === 1) return { since: W.since, n: W.n };
    if (W.sock && W.sock.readyState === 3) { // report the failure once, reconnect on the next try
      const err = W.err || "Disconnected"; W.sock = null;
      if (opt.optional && !W.since) throw blockedErr(err);
      const e = new Error(err); e.ws = true; throw e;
    }
    if (!W.sock) connect();
    const e = new Error("Connecting…"); e.soft = true; throw e;
  }, !!opt.optional);
}
const OKXWS = "wss://ws.okx.com:8443/ws/v5/public";
wsDef("wsOkxLiq", "OKX live liquidations", "Liquidations feed (live)", OKXWS,
  (ws) => ws.send(JSON.stringify({ op: "subscribe", args: [{ channel: "liquidation-orders", instType: "SWAP" }] })),
  (m) => { if (m.arg && m.arg.channel === "liquidation-orders" && m.data) okxLiqRows(m.data); }, { ping: "ping" });
wsDef("wsBnLiq", "Binance live liquidations", "Liquidations feed (live)", "wss://fstream.binance.com/ws/btcusdt@forceOrder", () => {},
  (m) => { const o = m.o; if (!o) return; const px = +o.ap || +o.p; addLiq({ t: +o.T, side: o.S === "SELL" ? "long" : "short", px, usd: +o.q * px, src: "Binance" }); }, { optional: true });
wsDef("wsByLiq", "Bybit live liquidations", "Liquidations feed (live)", "wss://stream.bybit.com/v5/public/linear",
  (ws) => ws.send(JSON.stringify({ op: "subscribe", args: ["allLiquidation.BTCUSDT"] })),
  (m) => { if (!m.topic || !m.topic.startsWith("allLiquidation")) return; for (const d of m.data || []) addLiq({ t: +d.T, side: d.S === "Buy" ? "long" : "short", px: +d.p, usd: +d.v * +d.p, src: "Bybit" }); },
  { optional: true, ping: JSON.stringify({ op: "ping" }) });

/* ---------- Coinbase spot CVD (trades REST + live matches) ---------- */
const CBT = { seen: new Set(), min: new Map() }; // minute -> {buy, sell}
function cbTrade(id, t, size, makerSide, price) {
  if (CBT.seen.has(id)) return; CBT.seen.add(id);
  if (typeof bigAdd === "function" && ok(price)) bigAdd("Coinbase", makerSide === "sell" ? "buy" : "sell", price, size, t); if (CBT.seen.size > 20000) CBT.seen = new Set([...CBT.seen].slice(-10000));
  const m = Math.floor(t / 60000) * 60, o = CBT.min.get(m) || { t: m, buy: 0, sell: 0 };
  if (makerSide === "sell") o.buy += size; else o.sell += size; CBT.min.set(m, o); // maker sell = taker buy
}
def("cbTr", "Coinbase trades", "CVD by exchange (Coinbase)", 60000, async () => {
  const j = await getJSON("https://api.exchange.coinbase.com/products/BTC-USD/trades?limit=1000");
  for (const x of j) cbTrade(x.trade_id, Date.parse(x.time), +x.size, x.side, +x.price);
  const cut = Date.now() / 1000 - 86400; for (const k of CBT.min.keys()) if (k < cut) CBT.min.delete(k);
  return { n: CBT.min.size };
});
wsDef("wsCb", "Coinbase live trades", "CVD by exchange (Coinbase, live)", "wss://ws-feed.exchange.coinbase.com",
  (ws) => ws.send(JSON.stringify({ type: "subscribe", product_ids: ["BTC-USD"], channels: ["matches"] })),
  (m) => { if (m.type === "match" || m.type === "last_match") cbTrade(m.trade_id, Date.parse(m.time), +m.size, m.side, +m.price); });

/* ---------- spot venues ---------- */
const SPOTS = [["spot", "Binance", "BTC/USDT"]];
function spotDef(id, name, pair, fn) { SPOTS.push([id, name, pair]); def(id, name + " spot", "Markets: spot price, 24h", 30000, fn); }
spotDef("cbS", "Coinbase", "BTC-USD", async () => { const j = await getJSON("https://api.exchange.coinbase.com/products/BTC-USD/stats"); return { px: +j.last, open: +j.open, vol: +j.volume, hi: +j.high, lo: +j.low }; });
spotDef("krS", "Kraken", "XBT/USD", async () => { const j = await getJSONp("https://api.kraken.com/0/public/Ticker?pair=XBTUSD"); const r = j.result && Object.values(j.result)[0]; if (!r) throw new Error((j.error || []).join(" ") || "no ticker"); return { px: +r.c[0], open: +r.o, vol: +r.v[1], hi: +r.h[1], lo: +r.l[1] }; });
spotDef("bsS", "Bitstamp", "BTC/USD", async () => { const j = await getJSONp("https://www.bitstamp.net/api/v2/ticker/btcusd/"); return { px: +j.last, open: +j.open, vol: +j.volume, hi: +j.high, lo: +j.low }; });
spotDef("okS", "OKX", "BTC-USDT", async () => { const t = (await okx("/api/v5/market/ticker?instId=BTC-USDT"))[0]; return { px: +t.last, open: +t.open24h, vol: +t.vol24h, hi: +t.high24h, lo: +t.low24h }; });
spotDef("bgS", "Bitget", "BTC/USDT", async () => { const j = await getJSON("https://api.bitget.com/api/v2/spot/market/tickers?symbol=BTCUSDT"); const t = j.data && j.data[0]; if (!t) throw new Error(j.msg || "no ticker"); return { px: +t.lastPr, open: +t.open, vol: +t.baseVolume, hi: +t.high24h, lo: +t.low24h }; });
spotDef("gmS", "Gemini", "BTC/USD", async () => { const j = await getJSONp("https://api.gemini.com/v1/pubticker/btcusd"); return { px: +j.last, open: NaN, vol: +(j.volume && j.volume.BTC), hi: NaN, lo: NaN }; });
spotDef("mxS", "MEXC", "BTC/USDT", async () => { const j = await getJSONp("https://api.mexc.com/api/v3/ticker/24hr?symbol=BTCUSDT"); return { px: +j.lastPrice, open: +j.openPrice, vol: +j.volume, hi: +j.highPrice, lo: +j.lowPrice }; });

/* ---------- Deribit futures and options ---------- */
const MON = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
const expMs = (s) => { const m = /^(\d{1,2})([A-Z]{3})(\d{2})$/.exec(s); return m ? Date.UTC(2000 + +m[3], MON[m[2]], +m[1], 8) : null; };
def("dbFut", "Deribit futures", "Basis term structure", 60000, async () => {
  const j = await getJSON("https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=future");
  return { rows: (j.result || []).map((r) => ({ name: r.instrument_name, exp: expMs(r.instrument_name.split("-")[1]), mark: +r.mark_price, oi: +r.open_interest, vol: +r.volume_usd })) };
});
def("dbOpt", "Deribit options", "Put/call, max pain, OI by strike, GEX", 300000, async () => {
  const j = await getJSON("https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option");
  const rows = (j.result || []).map((r) => { const p = r.instrument_name.split("-"); return { exp: p[1], ms: expMs(p[1]), k: +p[2], cp: p[3], oi: +r.open_interest, vol: +r.volume, iv: +r.mark_iv, u: +r.underlying_price }; }).filter((r) => ok(r.k) && r.ms);
  if (!rows.length) throw new Error("no options"); return { rows };
});

/* ===================== analysis (memoised) ===================== */
let AN = { key: "" };
function curPx() { return live("spot") ? D.spot.px : live("taK") ? lastOf(D.taK["30m"]).c : null; }
function analysis() {
  if (!live("taK")) return null;
  const key = [SRC.taK.st.okAt, SRC.kd.st.okAt, SRC.okxOI1h.st.okAt, SRC.okx.st.okAt, Math.floor(Date.now() / 20000)].join(":");
  if (AN.key === key) return AN;
  const K = D.taK, px = curPx(), tfm = {};
  ATFS.forEach((tf) => (tfm[tf] = K[tf] && K[tf].length > 60 ? TA.analyze(K[tf], tf) : null));
  const mtf = TA.multiTF(tfm);
  // liquidation map model from hourly OI, scaled from OKX to the whole market
  let L = null;
  if (live("okxOI1h")) {
    const k1 = K["1h"], byT = new Map(k1.map((x) => [x.t, x.c]));
    const oi = D.okxOI1h.s.map((x) => ({ t: x.t, v: x.v > 1e7 ? x.v / (byT.get(x.t) || px) : x.v }));
    const A = aggr(), scale = okxScale(4);
    L = TA.liqMap(k1, oi, px, scale);
  }
  // levels → zones
  const raw = [...TA.swingLevels(K["30m"], "30m", 1), ...TA.swingLevels(K["4h"], "4h", 2)];
  levels().forEach((l) => raw.push({ p: l.p, name: l.t, w: l.t.startsWith("PD") ? 2 : 1.5 }));
  const vw = TA.vwapDaily(K["30m"]); raw.push({ p: lastOf(vw), name: "Daily VWAP", w: 1 });
  if (L) [...L.longs.slice(0, 2), ...L.shorts.slice(0, 2)].forEach((c) => raw.push({ p: c.p, name: c.dist < 0 ? "Long liq cluster" : "Short liq cluster", w: 1.5 }));
  const Z = TA.zones(px, raw);
  // flow score
  const reasons = [], R = (txt, v) => reasons.push({ txt, v });
  let flow = 0;
  const w1 = live("k5") ? win(D.k5.k, 12) : null, oi1 = live("okxOI") ? seriesChg(D.okxOI.s, 3600) : null;
  if (w1 && ok(oi1) && Math.abs(oi1) >= 0.15) {
    const q = w1.pChg >= 0 ? (oi1 >= 0 ? ["Longs opening (1h)", 40] : ["Shorts closing (1h)", 15]) : oi1 >= 0 ? ["Shorts opening (1h)", -40] : ["Longs closing (1h)", -15];
    flow += q[1]; R(`${q[0]}: price ${pct(w1.pChg)} with OI ${pct(oi1)}`, Math.sign(q[1]));
  }
  if (w1) { const c = Math.max(-1, Math.min(1, w1.cvd / 250)); flow += 30 * c; R(`Spot CVD 1h ${sgn(w1.cvd, 0)} BTC (Binance)`, Math.sign(w1.cvd)); }
  const ti = live("okxTk") ? takerImb(D.okxTk.s, 3600) : null;
  if (ok(ti)) { flow += 20 * Math.max(-1, Math.min(1, ti / 10)); if (Math.abs(ti) > 3) R(`Perp takers ${ti > 0 ? "buying" : "selling"} ${pct(ti, 1)} (OKX 1h)`, Math.sign(ti)); }
  const prem = live("cb") && live("spot") ? ((D.cb.px - D.spot.px) / D.spot.px) * 100 : null;
  if (ok(prem)) { flow += 10 * Math.max(-1, Math.min(1, prem / 0.05)); if (Math.abs(prem) > 0.02) R(`Coinbase premium ${pct(prem, 3)}`, Math.sign(prem)); }
  const A = aggr();
  if (ok(A.f8)) { if (A.f8 > 0.0003) { flow -= 10; R(`Funding ${(A.f8 * 100).toFixed(4)}%: longs crowded`, -1); } else if (A.f8 < -0.0001) { flow += 10; R(`Funding ${(A.f8 * 100).toFixed(4)}%: shorts paying`, 1); } }
  flow = Math.max(-100, Math.min(100, Math.round(flow)));
  ["30m", "4h", "1d"].forEach((tf) => { const t = tfm[tf]; if (t) R(`${tf} technicals ${t.verdict.toLowerCase()} (${t.score > 0 ? "+" : ""}${t.score})`, Math.sign(t.score) * (Math.abs(t.score) >= 30 ? 1 : 0)); });
  const bias = ok(mtf) ? Math.round(0.7 * mtf + 0.3 * flow) : flow;
  const at = tfm["30m"] ? tfm["30m"].atr : null, S = TA.setups(px, Z, at, bias);
  const lv = Z.map((z) => ({ p: z.c, name: z.names[0] }));
  const pats = { "5m": K["5m"] && K["5m"].length > 30 ? TA.candlePatterns(K["5m"], lv) : [], "30m": TA.candlePatterns(K["30m"], lv), "4h": TA.candlePatterns(K["4h"], lv) };
  const cps = [...TA.chartPatterns(K["30m"], "30m"), ...TA.chartPatterns(K["1h"], "1h"), ...TA.chartPatterns(K["4h"], "4h")];
  ["30m", "4h"].forEach((tf) => { const f = pats[tf].find((p) => p.ago === 0 && p.dir); if (f) R(`${tf} ${f.name} on the last closed candle`, f.dir); });
  cps.filter((p) => p.name.startsWith("Double")).forEach((p) => R(`${p.tf} ${p.name.toLowerCase()} ${p.status}`, p.dir));
  if (L && L.shorts[0] && L.longs[0]) R(`Biggest liquidity: shorts ${kfmt(L.shorts[0].p)} (${usd(L.shorts[0].usd)}) · longs ${kfmt(L.longs[0].p)} (${usd(L.longs[0].usd)})`, 0);
  AN = { key, px, tfm, mtf, flow, bias, L, Z, S, pats, cps, reasons, verdict: bias >= 25 ? "Bullish" : bias <= -25 ? "Bearish" : bias > 5 ? "Neutral, leaning up" : bias < -5 ? "Neutral, leaning down" : "Neutral" };
  return AN;
}

/* ===================== small drawing helpers ===================== */
const vcls = (v) => (v > 0 ? "up" : v < 0 ? "dn" : "mut");
const tag = (txt, v) => `<span class="ftag ${vcls(v)}" style="background:color-mix(in srgb,currentColor 12%,transparent)">${esc(txt)}</span>`;
const cw = (sel, pad = 0) => { const el = $(sel); const w = el ? el.clientWidth - pad : 0; return Math.max(300, w || 640); };
const fmtT = (t, o) => new Date(t * 1000).toLocaleString([], o || { hour: "numeric", minute: "2-digit" });
const unavail = (id, msg) => `<div class="unavail">${esc((SRC[id] && SRC[id].st.err) || msg || "Loading…")}</div>`;
function scoreBar(v) {
  const p = Math.max(0, Math.min(100, (v + 100) / 2));
  return `<div style="position:relative;height:10px;border-radius:5px;background:linear-gradient(90deg,var(--dn),var(--weak) 50%,var(--up));margin:8px 0 4px">
    <i style="position:absolute;left:calc(${p}% - 2px);top:-4px;width:4px;height:18px;border-radius:2px;background:var(--fg)"></i></div>
    <div class="mut" style="display:flex;justify-content:space-between;font-size:11px"><span>Bearish −100</span><span>0</span><span>+100 Bullish</span></div>`;
}
/* candles + lines SVG used by Patterns and Setups */
function candleSVG(k, o = {}) {
  const W = o.W || 640, H = o.h || 240, pr = 74, pt = 10, pb = 22, n = k.length; if (n < 3) return "";
  const prices = [...k.flatMap((x) => [x.h, x.l]), ...(o.lines || []).map((l) => l.p).filter(ok)];
  let lo = Math.min(...prices), hi = Math.max(...prices); const pad = (hi - lo) * 0.06 || 10; lo -= pad; hi += pad;
  const cw = (W - pr - 4) / n, X = (i) => 2 + i * cw + cw / 2, Y = (p) => pt + (1 - (p - lo) / (hi - lo)) * (H - pt - pb);
  const C = chartColors(), up = ST.mono ? C.fg : C.up, dn = ST.mono ? C.fg3 : C.dn;
  let s = `<svg width="100%" viewBox="0 0 ${W} ${H}" style="display:block;max-height:${H + 30}px" aria-hidden="true">`;
  for (const z of o.zones || []) s += `<rect x="0" y="${Math.min(Y(z.hi), Y(z.lo)) - 1}" width="${W - pr}" height="${Math.max(3, Math.abs(Y(z.lo) - Y(z.hi)) + 2)}" fill="${z.color}" opacity=".16"/>`;
  k.forEach((x, i) => {
    const col = x.c >= x.o ? up : dn, y1 = Y(Math.max(x.o, x.c)), y2 = Y(Math.min(x.o, x.c)), bw = Math.max(1.5, cw * 0.62);
    s += `<line x1="${X(i)}" x2="${X(i)}" y1="${Y(x.h)}" y2="${Y(x.l)}" stroke="${col}" stroke-width="1.2"/>`;
    s += `<rect x="${X(i) - bw / 2}" y="${y1}" width="${bw}" height="${Math.max(1, y2 - y1)}" fill="${x.c >= x.o && ST.mono ? C.bg : col}" stroke="${col}" stroke-width="1"/>`;
  });
  for (const m of o.marks || []) {
    const x = X(m.i), b = k[m.i]; if (!b) continue; const y = m.dir < 0 ? Y(b.h) - 8 : Y(b.l) + 8, col = m.dir > 0 ? C.up : m.dir < 0 ? C.dn : C.warn;
    s += m.dir < 0 ? `<path d="M${x - 6},${y - 10} L${x + 6},${y - 10} L${x},${y}Z" fill="${col}"/>` : `<path d="M${x - 6},${y + 10} L${x + 6},${y + 10} L${x},${y}Z" fill="${col}"/>`;
    if (m.label) s += `<text x="${x}" y="${m.dir < 0 ? y - 14 : y + 26}" font-size="12.5" text-anchor="middle" fill="${col}" font-weight="600">${esc(m.label)}</text>`;
  }
  for (const l of o.lines || []) {
    if (!ok(l.p)) continue; const y = Y(l.p);
    s += `<line x1="0" x2="${W - pr}" y1="${y}" y2="${y}" stroke="${l.color}" stroke-width="${l.w || 1.4}" stroke-dasharray="${l.dash || "5 4"}"/>`;
    s += `<text x="${W - pr + 4}" y="${y + 5}" font-size="12.5" fill="${l.color}" font-weight="600">${esc(l.label)}</text>`;
  }
  s += `<text x="2" y="${H - 5}" font-size="11.5" fill="${C.fg3}">${fmtT(k[0].t, { month: "short", day: "numeric", hour: "numeric" })}</text><text x="${W - pr}" y="${H - 5}" font-size="11.5" fill="${C.fg3}" text-anchor="end">${fmtT(lastOf(k).t)}</text>`;
  return s + "</svg>";
}
/* stacked line panes sharing one time axis (CVD views) */
function panes(rows, o = {}) {
  const W = o.W || 640, ph = o.ph || 86, gap = 8, pr = 90, pt = 4, H = rows.length * (ph + gap) + 18, C = chartColors();
  const all = rows.flatMap((r) => r.pts.map((p) => p.t)); if (!all.length) return `<div class="unavail">Waiting for data…</div>`;
  const t0 = Math.min(...all), t1 = Math.max(...all), X = (t) => 2 + ((t - t0) / (t1 - t0 || 1)) * (W - pr - 4);
  let s = `<svg width="100%" viewBox="0 0 ${W} ${H}" style="display:block" aria-hidden="true">`;
  rows.forEach((r, j) => {
    const y0 = pt + j * (ph + gap), v = r.pts.map((p) => p.v); if (v.length < 2) { s += `<text x="4" y="${y0 + 20}" font-size="11.5" fill="${C.fg3}">${esc(r.name)}: ${esc(r.empty || "waiting for data")}</text>`; return; }
    const ma = r.ma ? TA.ema(v, 20) : null; let lo = Math.min(...v), hi = Math.max(...v); if (r.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    const Y = (x) => y0 + 4 + (1 - (x - lo) / (hi - lo || 1)) * (ph - 8);
    s += `<rect x="0" y="${y0}" width="${W - pr}" height="${ph}" fill="none" stroke="${C.grid}"/>`;
    if (r.zero && lo < 0 && hi > 0) s += `<line x1="0" x2="${W - pr}" y1="${Y(0)}" y2="${Y(0)}" stroke="${C.fg3}" stroke-dasharray="2 3"/>`;
    if (ma) s += `<polyline fill="none" stroke="${(lastOf(v) >= lastOf(ma.filter(ok)) ? C.up : C.dn)}" stroke-width="1.3" opacity=".8" points="${r.pts.map((p, i) => (ok(ma[i]) ? `${X(p.t).toFixed(1)},${Y(ma[i]).toFixed(1)}` : "")).filter(Boolean).join(" ")}"/>`;
    s += `<polyline fill="none" stroke="${r.color}" stroke-width="1.7" points="${r.pts.map((p) => `${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ")}"/>`;
    s += `<text x="6" y="${y0 + 17}" font-size="12" fill="${C.fg2}" font-weight="600">${esc(r.name)}</text>`;
    s += `<text x="${W - pr + 6}" y="${Y(lastOf(v)) + 5}" font-size="12.5" fill="${r.color}" font-weight="600">${esc(r.fmt(lastOf(v)))}</text>`;
    if (r.note) s += `<text x="${W - pr - 4}" y="${y0 + 17}" font-size="11" fill="${C.fg3}" text-anchor="end">${esc(r.note)}</text>`;
  });
  s += `<text x="2" y="${H - 3}" font-size="11" fill="${C.fg3}">${fmtT(t0)}</text><text x="${W - pr}" y="${H - 3}" font-size="11" fill="${C.fg3}" text-anchor="end">${fmtT(t1)}</text>`;
  return s + "</svg>";
}
function updown(rows, o = {}) { // rows: {t, up, dn} → bars up (green) and down (red) from a midline
  const W = o.W || 640, H = o.h || 170, pr = 70, mid = H / 2 - 6, C = chartColors(); if (!rows.length) return `<div class="unavail">${esc(o.empty || "Waiting for data…")}</div>`;
  const m = Math.max(...rows.map((r) => Math.max(r.up, r.dn))) || 1, bw = (W - pr - 4) / rows.length;
  let s = `<svg width="100%" viewBox="0 0 ${W} ${H}" style="display:block;max-height:${H + 20}px" aria-hidden="true"><line x1="0" x2="${W - pr}" y1="${mid}" y2="${mid}" stroke="${C.fg3}"/>`;
  rows.forEach((r, i) => { const x = 2 + i * bw, hu = (r.up / m) * (mid - 6), hd = (r.dn / m) * (mid - 6); s += `<rect x="${x.toFixed(1)}" y="${(mid - hu).toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${hu.toFixed(1)}" fill="${o.upColor || C.up}"/><rect x="${x.toFixed(1)}" y="${mid}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${hd.toFixed(1)}" fill="${o.dnColor || C.dn}"/>`; });
  s += `<text x="${W - pr + 6}" y="22" font-size="11.5" fill="${o.upColor || C.up}">${esc(o.upLabel || "up")}</text><text x="${W - pr + 6}" y="${H - 28}" font-size="11.5" fill="${o.dnColor || C.dn}">${esc(o.dnLabel || "down")}</text>`;
  s += `<text x="${W - pr + 6}" y="${mid + 5}" font-size="11" fill="${C.fg3}">${esc(o.fmt ? o.fmt(m) : kfmt(m))} max</text>`;
  s += `<text x="2" y="${H - 3}" font-size="11" fill="${C.fg3}">${fmtT(rows[0].t)}</text><text x="${W - pr}" y="${H - 3}" font-size="11" fill="${C.fg3}" text-anchor="end">${fmtT(lastOf(rows).t)}</text>`;
  return s + "</svg>";
}

/* ===================== Overview: assessment ===================== */
function assessHTML(a, full) {
  const rs = full ? a.reasons : a.reasons.filter((r) => r.v).slice(0, 5);
  const best = (arr) => arr[0] ? `${arr[0].side > 0 ? "Long" : "Short"} ${n0(arr[0].entry)} · SL ${n0(arr[0].stop)} · TP ${n0(arr[0].tp1)} / ${n0(arr[0].tp2)} · R:R ${arr[0].rr.toFixed(1)} · ${arr[0].conf}` : "None qualifies right now";
  return `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">${tag(a.verdict, a.bias)}<span class="big ${vcls(a.bias)}">${a.bias > 0 ? "+" : ""}${a.bias}</span><span class="mut" style="font-size:13px">technicals ${a.mtf > 0 ? "+" : ""}${a.mtf} (70%) · flow ${a.flow > 0 ? "+" : ""}${a.flow} (30%)</span></div>
    ${scoreBar(a.bias)}
    <ul style="margin:8px 0 6px;padding-left:18px;font-size:13.5px;line-height:1.6">${rs.map((r) => `<li><span class="${vcls(r.v)}">${r.v > 0 ? "▲" : r.v < 0 ? "▼" : "•"}</span> ${esc(r.txt)}</li>`).join("")}</ul>
    <div class="sub"><b class="up">Best long</b> ${best(a.S.longs)}</div><div class="sub"><b class="dn">Best short</b> ${best(a.S.shorts)}</div>`;
}

/* ===================== TA tab ===================== */
function drawTA(a) {
  $("#taAssess").innerHTML = assessHTML(a, true);
  const tfs = ATFS.filter((tf) => a.tfm[tf]), T = a.tfm, cell = (txt, v) => `<td class="${vcls(v)}">${esc(txt)}</td>`;
  const vote = (t, key) => t.votes.find((x) => x.key === key);
  const row = (label, f) => `<tr><td>${label}</td>${tfs.map((tf) => f(T[tf])).join("")}</tr>`;
  $("#taTbl").innerHTML = `<thead><tr><th>Signal</th>${tfs.map((t) => `<th>${t}</th>`).join("")}</tr></thead><tbody>
    ${row("<b>Verdict</b>", (t) => `<td class="${vcls(t.score >= 30 ? 1 : t.score <= -30 ? -1 : 0)}"><b>${t.verdict}</b></td>`)}
    ${row("Score", (t) => cell(`${t.score > 0 ? "+" : ""}${t.score}`, Math.sign(t.score)))}
    ${row("Structure", (t) => cell(t.st.dir > 0 ? "HH + HL" : t.st.dir < 0 ? "LH + LL" : "Mixed", t.st.dir))}
    ${row("EMA 9/21/50", (t) => { const v = vote(t, "ema"); return v ? cell(v.txt, v.v) : "<td>–</td>"; })}
    ${row("vs EMA 200", (t) => { const v = vote(t, "e200"); return v ? cell(v.txt, v.v) : "<td>–</td>"; })}
    ${row("RSI 14", (t) => cell(`${nd(t.rsi, 1)} ${t.rsi > t.rsiPrev ? "↑" : "↓"}${t.rsi >= 70 ? " OB" : t.rsi <= 30 ? " OS" : ""}`, t.rsi > 55 ? 1 : t.rsi < 45 ? -1 : 0))}
    ${row("MACD hist", (t) => { const v = vote(t, "macd"); return v ? cell(v.txt, v.v) : "<td>–</td>"; })}
    ${row("Stoch RSI", (t) => { const v = vote(t, "stoch"); return v ? cell(v.txt, v.v) : "<td>–</td>"; })}
    ${row("VWAP / BB", (t) => { const v = vote(t, "vwap") || vote(t, "bb"); return v ? cell(v.txt, v.v) : "<td>–</td>"; })}
    ${row("Bollinger width", (t) => cell(t.bb ? `${t.bb.w.toFixed(2)}%` : "–", 0))}
    ${row("ATR 14", (t) => cell(`${n0(t.atr)} (${nd(t.atrPct, 2)}%)`, 0))}
    ${row("Volume vs avg", (t) => cell(ok(t.vr) ? `×${t.vr.toFixed(2)}` : "–", 0))}
    ${row("EMA 50/200 cross", (t) => cell(t.cross ? `${t.cross.dir > 0 ? "Golden" : "Death"} cross ${t.cross.ago} bars ago` : "none recent", t.cross ? t.cross.dir : 0))}
  </tbody>`;
  const px = a.px, ma = (v) => (ok(v) ? `<td class="${px >= v ? "up" : "dn"}">${n0(v)} ${px >= v ? "▲" : "▼"}</td>` : "<td>–</td>");
  const KEY = [["EMA 21", "ema", 21], ["EMA 50", "ema", 50], ["EMA 200", "ema", 200], ["SMA 200", "sma", 200]];
  const dcell = (v) => (ok(v) ? `<td class="${px >= v ? "up" : "dn"}">${px >= v ? "▲" : "▼"} ${pct(((px - v) / v) * 100, 1)}</td>` : "<td>–</td>");
  $("#maTbl").innerHTML = `<thead><tr><th>Price vs</th>${tfs.map((t) => `<th>${t}</th>`).join("")}</tr></thead><tbody>
    ${KEY.map(([n, k, p]) => `<tr><td>${n}</td>${tfs.map((tf) => dcell(T[tf][k][p])).join("")}</tr>`).join("")}
    <tr><td><b>Trend</b></td>${tfs.map((tf) => { const v = KEY.map(([, k, p]) => T[tf][k][p]).filter(ok), up = v.filter((x) => px >= x).length; return `<td class="${up >= 3 ? "up" : up <= 1 ? "dn" : "mut"}"><b>${up >= 3 ? "Up" : up <= 1 ? "Down" : "Mixed"}</b></td>`; }).join("")}</tr></tbody>`;
  if ($("#maAll")) $("#maAll").innerHTML = `<thead><tr><th>Average</th>${tfs.map((t) => `<th>${t}</th>`).join("")}</tr></thead><tbody>
    ${TA.MA_E.map((p) => `<tr><td>EMA ${p}</td>${tfs.map((tf) => ma(T[tf].ema[p])).join("")}</tr>`).join("")}
    ${TA.MA_S.map((p) => `<tr><td>SMA ${p}</td>${tfs.map((tf) => ma(T[tf].sma[p])).join("")}</tr>`).join("")}</tbody>`;
  $("#zoneTbl").innerHTML = `<thead><tr><th>Zone</th><th>Dist</th><th>Strength</th><th class="l">Made of</th></tr></thead><tbody>${a.Z.slice().sort((x, y) => Math.abs(x.dist) - Math.abs(y.dist)).slice(0, 14).sort((x, y) => y.c - x.c).map((z) => `<tr><td class="${z.c > px ? "dn" : "up"}">${z.lo === z.hi ? n0(z.c) : `${n0(z.lo)}–${n0(z.hi)}`}</td><td>${pct(z.dist)}</td><td>${"●".repeat(Math.min(5, Math.round(z.w)))}</td><td class="wrap">${esc(z.names.join(", "))}</td></tr>`).join("")}</tbody>`;
}

/* ===================== Patterns tab ===================== */
function drawPatterns(a) {
  ["30m", "4h"].forEach((tf) => {
    const k = D.taK[tf].slice(-49), off = D.taK[tf].length - 1 - 48, ps = a.pats[tf];
    const marks = ps.filter((p) => p.i - off >= 0 && p.i - off < 48).map((p) => ({ i: p.i - off, dir: p.dir, label: p.name.split(" ").map((w) => w[0].toUpperCase()).join("").slice(0, 3) }));
    const fresh = ps.filter((p) => p.ago <= 1);
    $(`#pat${tf}`).innerHTML = `${candleSVG(k, { marks, h: 230, W: cw(`#pat${tf}`) })}
      <div class="sub" style="margin:6px 0">${fresh.length ? `<b>On the latest closed candle${fresh.some((p) => p.ago === 1) ? "s" : ""}:</b> ${fresh.map((p) => `<span class="${vcls(p.dir)}">${p.name}</span>`).join(", ")}` : "No pattern on the last two closed candles."}</div>
      <div class="tw"><table><thead><tr><th>Pattern</th><th class="l">Bias</th><th class="l">When</th><th class="l">Strength</th><th>Confirm</th><th>Invalid</th><th class="l">What it means</th></tr></thead><tbody>
      ${ps.slice(0, 12).map((p) => `<tr><td><b>${p.name}</b></td><td class="l">${tag(p.dir > 0 ? "Bullish" : p.dir < 0 ? "Bearish" : "Neutral", p.dir)}</td><td class="l">${p.ago === 0 ? "<b>last closed</b>" : `${p.ago} bars ago`}<div class="mut" style="font-size:11.5px">${fmtT(p.t, { weekday: "short", hour: "numeric", minute: "2-digit" })}</div></td><td class="l">${"●".repeat(p.strength)}${"○".repeat(3 - p.strength)}${p.why.length ? `<div class="mut" style="font-size:11.5px">${esc(p.why.join(", "))}</div>` : ""}</td><td>${p.confirm ? `${p.dir > 0 ? "close >" : "close <"} ${n0(p.confirm)}` : "breakout"}</td><td>${p.invalid ? n0(p.invalid) : "–"}</td><td class="wrap">${esc(p.note)}</td></tr>`).join("") || `<tr><td colspan="7" class="l mut">No patterns in the last 24 closed candles.</td></tr>`}
      </tbody></table></div>`;
  });
  $("#chartPats").innerHTML = a.cps.length ? `<div class="tw"><table><thead><tr><th>Pattern</th><th class="l">TF</th><th class="l">Bias</th><th class="l">Status</th><th>Level</th><th>Neckline</th><th>Target</th></tr></thead><tbody>${a.cps.map((p) => `<tr><td><b>${p.name}</b></td><td class="l">${p.tf}</td><td class="l">${tag(p.dir > 0 ? "Bullish" : "Bearish", p.dir)}</td><td class="wrap">${esc(p.status)}</td><td>${n0(p.level)}</td><td>${p.neck ? n0(p.neck) : "–"}</td><td>${p.target ? n0(p.target) : "–"}</td></tr>`).join("")}</tbody></table></div>` : `<div class="unavail">No double tops/bottoms or RSI/CVD divergences on 30m, 1h or 4h right now.</div>`;
}

/* ===================== Setups tab ===================== */
const LEVS = [5, 10, 20, 25, 50, 75, 100];
function ladder(s, r, px, W = 640) {
  const H = 104, pl = 34, pr = 34, y = 54, C = chartColors(), pts = [s.stop, s.entry, s.tp1, s.tp2, px].filter(ok);
  const lo = Math.min(...pts), hi = Math.max(...pts), X0 = (v) => pl + ((v - lo) / (hi - lo || 1)) * (W - pl - pr), X = (v) => Math.max(pl - 20, Math.min(W - pr + 20, X0(v)));
  const mk = (v, label, col, top) => `<line x1="${X(v)}" x2="${X(v)}" y1="${y - 12}" y2="${y + 12}" stroke="${col}" stroke-width="3"/><text x="${X(v)}" y="${top ? y - 20 : y + 32}" font-size="12.5" fill="${col}" text-anchor="middle" font-weight="600">${label}</text><text x="${X(v)}" y="${top ? y - 36 : y + 48}" font-size="11" fill="${C.fg3}" text-anchor="middle">${kfmt(v)}</text>`;
  return `<svg width="100%" viewBox="0 0 ${W} ${H}" style="display:block" aria-hidden="true">
    <rect x="${Math.min(X(s.entry), X(s.stop))}" y="${y - 5}" width="${Math.abs(X(s.entry) - X(s.stop))}" height="10" fill="${C.dn}" opacity=".35"/>
    <rect x="${Math.min(X(s.entry), X(s.tp2))}" y="${y - 5}" width="${Math.abs(X(s.tp2) - X(s.entry))}" height="10" fill="${C.up}" opacity=".3"/>
    ${mk(s.stop, "SL", C.dn, false)}${mk(s.entry, "Entry", C.fg, true)}${mk(s.tp1, "TP1", C.up, false)}${mk(s.tp2, "TP2", C.up, true)}${X0(r.liq) >= pl && X0(r.liq) <= W - pr ? mk(r.liq, "Liq", C.purple, false) : ""}
    <path d="M${X(px) - 6},${y - 22} L${X(px) + 6},${y - 22} L${X(px)},${y - 13}Z" fill="${C.acc}"/></svg>`;
}
// remember which setup charts are open, so the auto-refresh doesn't fold them shut
const SETOPEN = LS.get("setOpen", {});
document.addEventListener("toggle", (e) => { const d = e.target; if (!d.dataset || !d.dataset.setid) return; if (d.open) SETOPEN[d.dataset.setid] = 1; else delete SETOPEN[d.dataset.setid]; LS.set("setOpen", SETOPEN); }, true);
function setupCard(s, i, a) {
  const r = TA.risk(s, ST.lev, ST.margin), px = a.px, C = chartColors(), side = s.side > 0 ? "Long" : "Short", id = `${side[0]}${i + 1}`;
  const k = D.taK["30m"].slice(-60), W = cw(s.side > 0 ? "#setL" : "#setS", 30);
  const chart = candleSVG(k, { h: 220, W, zones: [{ lo: s.zone.lo, hi: s.zone.hi, color: s.side > 0 ? C.up : C.dn }], lines: [
    { p: s.entry, label: "Entry", color: C.fg, dash: "6 3" }, { p: s.stop, label: "SL", color: C.dn }, { p: s.tp1, label: "TP1", color: C.up }, { p: s.tp2, label: "TP2", color: C.up, dash: "2 3" }] });
  const pnl = (o) => `<b class="${vcls(o.pnl)}">${o.pnl >= 0 ? "+" : "−"}$${Math.abs(o.pnl).toFixed(2)}</b> <span class="mut">(${o.roe >= 0 ? "+" : ""}${o.roe.toFixed(1)}%)</span>`;
  return `<div class="panel" style="border-left:3px solid ${s.side > 0 ? "var(--up)" : "var(--dn)"};border-radius:0 12px 12px 0">
    <div class="ph"><span class="pt" style="color:${s.side > 0 ? "var(--up)" : "var(--dn)"}">${id} · ${side} from ${s.side > 0 ? "support" : "resistance"} ${n0(s.zone.lo)}${s.zone.hi !== s.zone.lo ? "–" + n0(s.zone.hi) : ""}</span><span class="st ${s.conf === "High" ? "ok" : s.conf === "Medium" ? "stale" : "wait"}">${s.conf} · ${s.score}</span></div>
    <div class="sub" style="margin-bottom:6px">${esc(s.zone.names.join(", "))} · ${s.dist < 0.05 ? "at price now" : `${s.dist.toFixed(2)}% away`}</div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-bottom:8px">
      <div><div class="mut" style="font-size:12px">Entry</div><div class="big" style="font-size:18px">${n0(s.entry)}</div></div>
      <div><div class="mut" style="font-size:12px">Stop loss</div><div class="big dn" style="font-size:18px">${n0(s.stop)}</div></div>
      <div><div class="mut" style="font-size:12px">TP1 / TP2</div><div class="big up" style="font-size:18px">${n0(s.tp1)} / ${kfmt(s.tp2)}</div></div>
      <div><div class="mut" style="font-size:12px">Reward : risk</div><div class="big" style="font-size:18px">${s.rr.toFixed(2)}</div></div>
    </div>
    ${ladder(s, r, px, W)}
    <div class="tw"><table class="rt"><tbody>
      <tr><td>Position at ${ST.lev}×</td><td>$${n0(ST.margin)} margin → <b>${usd(r.notional)}</b> · ${r.qty.toFixed(4)} BTC</td></tr>
      <tr><td>Liquidation (est.)</td><td class="${r.liqFirst ? "dn" : ""}"><b>${n0(r.liq)}</b>${r.liqFirst ? " · <b>liquidates before your stop, lower the leverage</b>" : ""}</td></tr>
      <tr><td>Max leverage for this stop</td><td>${r.maxLev}×</td></tr>
      <tr><td>Stop loss hit</td><td>${pnl(r.sl)}</td></tr>
      <tr><td>TP1 hit</td><td>${pnl(r.tp1)}</td></tr>
      <tr><td>TP2 hit</td><td>${pnl(r.tp2)}</td></tr>
    </tbody></table></div>
    <details data-setid="${id}" ${SETOPEN[id] ? "open" : ""} style="margin-top:8px"><summary class="mut" style="cursor:pointer;font-size:13px">Chart with levels</summary>${chart}</details>
  </div>`;
}
function drawSetups(a) {
  $("#levSeg").innerHTML = LEVS.map((l) => `<button data-lev="${l}" aria-pressed="${ST.lev === l}">${l}×</button>`).join("");
  if (document.activeElement !== $("#marginIn")) $("#marginIn").value = ST.margin;
  $("#setL").innerHTML = a.S.longs.length ? a.S.longs.map((s, i) => setupCard(s, i, a)).join("") : `<div class="panel unavail">No long setup qualifies (needs a support zone within 4.5% and a target giving at least 0.8 R:R).</div>`;
  $("#setS").innerHTML = a.S.shorts.length ? a.S.shorts.map((s, i) => setupCard(s, i, a)).join("") : `<div class="panel unavail">No short setup qualifies right now.</div>`;
  $("#setBias").innerHTML = `${tag(a.verdict, a.bias)} <span class="mut" style="font-size:13px">Setups are scored on zone strength (35), agreement with the overall lean (30), reward:risk (20) and distance (15). Fees and slippage not included.</span>`;
}

/* ===================== Flow / CVD tab ===================== */
function cumul(s, f) { let c = 0; return s.map((r) => ({ t: r.t, v: (c += f(r)) })); }
function drawFlowTab() {
  const C = chartColors(), rows1 = [];
  const k5 = live("k5") ? D.k5.k : [];
  rows1.push({ name: "Price · Binance spot 5m", color: C.fg, pts: k5.map((r) => ({ t: r.t, v: r.c })), fmt: (v) => n0(v) });
  rows1.push({ name: "Spot CVD · Binance", color: C.acc, pts: cumul(k5, (r) => 2 * r.tb - r.v), fmt: (v) => sgn(v, 0), zero: true, ma: true });
  rows1.push({ name: "Perp CVD · OKX", color: C.warn, pts: live("okxTk") ? cumul(D.okxTk.s, (r) => r.buy - r.sell) : [], fmt: (v) => kfmt(v), zero: true, ma: true, empty: SRC.okxTk.st.err || "loading" });
  $("#cvdMain").innerHTML = panes(rows1, { ph: 96, W: cw("#cvdMain") });
  const cb = [...CBT.min.values()].sort((x, y) => x.t - y.t);
  const ex = [
    { name: "Binance spot", color: C.acc, pts: cumul(k5, (r) => 2 * r.tb - r.v), fmt: (v) => sgn(v, 0), zero: true, ma: true },
    { name: "Coinbase spot", color: C.up, pts: cumul(cb, (r) => r.buy - r.sell), fmt: (v) => sgn(v, 1), zero: true, ma: true, note: cb.length ? `since ${fmtT(cb[0].t)}` : "", empty: "collecting trades (builds up while open)" },
    { name: "OKX spot", color: C.purple, pts: live("okxSpTk") ? cumul(D.okxSpTk.s, (r) => r.buy - r.sell) : [], fmt: (v) => kfmt(v), zero: true, ma: true, empty: SRC.okxSpTk.st.err || "loading" },
    { name: "OKX perp", color: C.warn, pts: live("okxTk") ? cumul(D.okxTk.s, (r) => r.buy - r.sell) : [], fmt: (v) => kfmt(v), zero: true, ma: true, empty: SRC.okxTk.st.err || "loading" },
  ];
  $("#cvdSel").innerHTML = ex.map((r) => `<button class="chip" data-cvdx="${r.name}" aria-pressed="${!ST.cvdOff[r.name]}">${r.name}</button>`).join("");
  const exOn = ex.filter((r) => !ST.cvdOff[r.name]);
  $("#cvdEx").innerHTML = exOn.length ? panes(exOn, { ph: 80, W: cw("#cvdEx") }) : `<div class="unavail">All exchanges are turned off. Tap one above to show it.</div>`;
  const byH = new Map(); k5.forEach((r) => { const h = Math.floor(r.t / 3600) * 3600, o = byH.get(h) || { t: h, up: 0, dn: 0 }; o.up += r.tb; o.dn += r.v - r.tb; byH.set(h, o); });
  $("#deltaBars").innerHTML = updown([...byH.values()].sort((x, y) => x.t - y.t), { W: cw("#deltaBars"), upLabel: "buys", dnLabel: "sells", fmt: (v) => `${kfmt(v)} BTC` });
  const a = analysis(), dv = a ? a.cps.filter((p) => p.name.includes("divergence")) : [];
  const w = (b) => (live("k5") ? win(D.k5.k, b) : null), line = (lab, b) => { const x = w(b); if (!x) return ""; const d = x.pChg > 0.1 && x.cvd < 0 ? ["Bearish divergence: price up, spot sellers", -1] : x.pChg < -0.1 && x.cvd > 0 ? ["Bullish divergence: price down, spot buyers", 1] : [x.cvd >= 0 === x.pChg >= 0 ? "Aligned: CVD confirms price" : "Flat", 0]; return `<tr><td>${lab}</td><td class="${cls(x.pChg)}">${pct(x.pChg)}</td><td class="${cls(x.cvd)}">${sgn(x.cvd, 0)} BTC</td><td class="l">${tag(d[0], d[1])}</td></tr>`; };
  $("#cvdDiv").innerHTML = `<div class="tw"><table><thead><tr><th>Window</th><th>Price</th><th>Spot CVD</th><th class="l">Read</th></tr></thead><tbody>${line("1h", 12)}${line("4h", 48)}${line("12h", 144)}${line("24h", 286)}</tbody></table></div>
    ${dv.length ? `<div class="sub" style="margin-top:8px"><b>Swing divergences:</b> ${dv.map((p) => `<span class="${vcls(p.dir)}">${p.tf} ${p.name}</span>`).join(" · ")}</div>` : `<div class="sub" style="margin-top:8px">No swing-based RSI/CVD divergence on 30m–4h.</div>`}`;
}

/* ===================== Liquidations tab ===================== */
function drawLiq(a) {
  const C = chartColors(), now = Date.now(), ev = [...LIQ.values()].sort((x, y) => x.t - y.t);
  const sum = (ms, side) => ev.filter((e) => e.t >= now - ms && e.side === side).reduce((s, e) => s + e.usd, 0);
  const srcs = [...new Set(ev.map((e) => e.src))], since = ev.length ? ev[0].t : null;
  $("#liqK").innerHTML = [["1h", 3600e3], ["4h", 4 * 3600e3], ["24h", 86400e3]].map(([l, ms]) => { const L = sum(ms, "long"), S = sum(ms, "short"); return `<div class="panel"><div class="ph"><span class="pt">Liquidated · ${l}</span></div><div class="big"><span class="dn">${usd(L)}</span> <span class="mut" style="font-size:14px">longs</span></div><div class="big" style="font-size:18px"><span class="up">${usd(S)}</span> <span class="mut" style="font-size:14px">shorts</span></div><div class="sub">${L + S ? `${Math.round((L / (L + S)) * 100)}% longs` : "none recorded"}</div></div>`; }).join("")
    + `<div class="panel"><div class="ph"><span class="pt">Coverage</span></div><div class="sub">${srcs.length ? `From ${srcs.join(", ")}` : "Waiting for events"}${since ? ` since ${fmtT(since / 1000, { weekday: "short", hour: "numeric", minute: "2-digit" })}` : ""}</div><div class="sub">${ev.length} events kept on this device (24h). Binance and Bybit only appear if they aren't blocked where you are.</div></div>`;
  const b = new Map(); ev.forEach((e) => { const t = Math.floor(e.t / 900e3) * 900, o = b.get(t) || { t, up: 0, dn: 0 }; if (e.side === "short") o.up += e.usd; else o.dn += e.usd; b.set(t, o); });
  $("#liqBars").innerHTML = updown([...b.values()].sort((x, y) => x.t - y.t), { W: cw("#liqBars"), upLabel: "shorts", dnLabel: "longs", fmt: usd, empty: "No liquidations recorded yet" });
  const L = a && a.L;
  if (!L) { LKEY = ""; $("#liqMap").innerHTML = unavail("okxOI1h", "Needs OKX hourly OI and 1h candles"); }
  else if (LKEY !== [a.key, ST.liqRange, ST.liqSide, cw("#liqMap"), document.documentElement.dataset.theme, chartColors().bg].join("|")) {
    LKEY = [a.key, ST.liqRange, ST.liqSide, cw("#liqMap"), document.documentElement.dataset.theme, chartColors().bg].join("|");
    const px = a.px, rng = ST.liqRange / 100;
    const bins = L.bins.filter((x) => Math.abs(x.p - px) / px <= rng).sort((x, y) => y.p - x.p).map((x) => ({ ...x, v: ST.liqSide === "long" ? x.long : ST.liqSide === "short" ? x.short : Math.max(x.long, x.short) }));
    const W = cw("#liqMap"), rh = Math.max(6, Math.min(14, Math.floor(560 / Math.max(1, bins.length)))), H = bins.length * rh + 12, m = Math.max(...bins.map((x) => x.v)) || 1, lw = 70;
    LMAP = { bins, px };
    let s = `<svg width="100%" viewBox="0 0 ${W} ${H}" style="display:block;touch-action:pan-y;cursor:crosshair" role="img" aria-label="Estimated liquidation levels by price">`, pyDone = false;
    bins.forEach((x, i) => {
      const y = 6 + i * rh, v = x.v, w = (v / m) * (W - lw - 10), col = x.short >= x.long ? C.up : C.dn;
      if (!pyDone && x.p < px) { s += `<line x1="0" x2="${W}" y1="${y - 1}" y2="${y - 1}" stroke="${C.acc}" stroke-width="2"/><text x="${W - 4}" y="${y - 4}" font-size="12" fill="${C.acc}" text-anchor="end" font-weight="700">now ${n0(px)}</text>`; pyDone = true; }
      s += `<rect data-i="${i}" x="0" y="${y}" width="${W}" height="${rh}" fill="transparent"/>`;
      if (v > 0) s += `<rect data-i="${i}" x="${lw}" y="${y}" width="${Math.max(0.5, w)}" height="${rh - 1.5}" fill="${col}" opacity="${0.35 + 0.65 * (v / m)}"/>`;
      if (i % Math.max(1, Math.round(36 / rh)) === 0) s += `<text x="${lw - 6}" y="${y + rh - 2}" font-size="11" fill="${C.fg3}" text-anchor="end">${n0(x.p)}</text>`;
      if (v / m > 0.6) s += `<text x="${lw + w + 4}" y="${y + rh - 2}" font-size="11" fill="${col}" font-weight="600" pointer-events="none">${usd(v)}</text>`;
    });
    s += `<line id="liqHl" x1="${lw}" x2="${W}" y1="-10" y2="-10" stroke="${C.fg}" stroke-width="1" stroke-dasharray="3 3" pointer-events="none"/>`;
    $("#liqCtl").innerHTML = `<span class="seg">${[3, 6, 10].map((r) => `<button data-lrng="${r}" aria-pressed="${ST.liqRange === r}">±${r}%</button>`).join("")}</span>
      <span class="seg">${[["both", "Both"], ["short", "Shorts"], ["long", "Longs"]].map(([k, l]) => `<button data-lside="${k}" aria-pressed="${ST.liqSide === k}">${l}</button>`).join("")}</span>
      <span class="mut" style="font-size:12px">Tap or hover a level for details</span>`;
    $("#liqMap").innerHTML = s + `</svg><div class="sub" style="margin-top:6px"><b class="up">Short liquidations above</b> (fuel if price rises) · <b class="dn">Long liquidations below</b> (fuel if price drops). Within ±3%: shorts ${usd(L.short3)} · longs ${usd(L.long3)}.</div>
      <div class="tw" style="margin-top:6px"><table><thead><tr><th class="l">Biggest pools</th><th>Price</th><th>Distance</th><th>Est. size</th></tr></thead><tbody>${[...L.shorts.slice(0, 3).map((c) => [c, "Shorts", 1]), ...L.longs.slice(0, 3).map((c) => [c, "Longs", -1])].map(([c, n, d]) => `<tr><td class="l ${vcls(d)}">${n}</td><td>${n0(c.p)}</td><td>${pct(c.dist)}</td><td>${usd(c.usd)}</td></tr>`).join("")}</tbody></table></div>`;
  }
  if (L && !$("#liqTip").hidden && LSEL !== null) liqTip(LSEL);
  drawLiqBig(ev, now, C);
}

/* ---------- Biggest liquidations: hero, price-and-bubbles map, price clusters, ranked list ---------- */
ST.lbSide = LS.get("lbSide", "all"); ST.lbWin = LS.get("lbWin", 24);
function drawLiqBig(ev, now, C) {
  const box = $("#liqList"); if (!box) return;
  const ms = ST.lbWin * 3600e3, inWin = ev.filter((e) => e.t >= now - ms), pick = inWin.filter((e) => ST.lbSide === "all" || e.side === ST.lbSide), px = curPx() || (inWin.length ? inWin[inWin.length - 1].px : 0);
  const ctl = `<div class="ctl" style="margin:0 0 8px"><span class="seg">${[1, 4, 24].map((h) => `<button data-lbw="${h}" aria-pressed="${ST.lbWin === h}">${h}h</button>`).join("")}</span><span class="seg">${[["all", "All"], ["long", "Longs rekt"], ["short", "Shorts rekt"]].map(([k, l]) => `<button data-lbs="${k}" aria-pressed="${ST.lbSide === k}">${l}</button>`).join("")}</span></div>`;
  if (!pick.length) { box.innerHTML = ctl + `<div class="unavail">No liquidations recorded in this window yet. Keep the page open; the live feed fills this in.</div>`; return; }
  const top = pick.slice().sort((x, y) => y.usd - x.usd), big = top[0], col = (e) => (e.side === "long" ? C.dn : C.up), ago = (t) => { const m = Math.round((now - t) / 60000); return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`; };
  const tot = pick.reduce((a2, e) => a2 + e.usd, 0), L = pick.filter((e) => e.side === "long").reduce((a2, e) => a2 + e.usd, 0), S2 = tot - L;
  // hero: the single biggest one
  const hero = `<div class="lhero" style="background:linear-gradient(135deg,${rgba(col(big), 0.22)},${rgba(col(big), 0.04)});border-color:${rgba(col(big), 0.45)}">
    <div class="mut" style="font-size:11.5px;letter-spacing:.06em;text-transform:uppercase">Biggest in ${ST.lbWin}h</div>
    <div class="lhb"><b style="color:${col(big)}">${usd(big.usd)}</b><span>${big.side === "long" ? "long" : "short"} wiped at <b>${n0(big.px)}</b></span></div>
    <div class="mut" style="font-size:12.5px">${big.src} · ${ago(big.t)} · ${px ? `${pct(((px - big.px) / big.px) * 100)} from here` : ""}</div></div>`;
  // split bar
  const split = `<div class="lsplit"><div style="width:${((L / tot) * 100).toFixed(1)}%;background:linear-gradient(90deg,${rgba(C.dn, 0.9)},${rgba(C.dn, 0.55)})"></div><div style="width:${((S2 / tot) * 100).toFixed(1)}%;background:linear-gradient(90deg,${rgba(C.up, 0.55)},${rgba(C.up, 0.9)})"></div></div>
    <div class="lsplitl"><span class="dn">Longs ${usd(L)}</span><span class="mut">${pick.length} liquidations · ${usd(tot)}</span><span class="up">Shorts ${usd(S2)}</span></div>`;
  // map: price line with a bubble at every liquidation (time × price, size = $)
  const W = cw("#liqList"), H = 170, pr = 58, k5 = live("k5") ? D.k5.k.filter((x) => x.t * 1000 >= now - ms) : [], t0 = now - ms, X = (t) => ((t - t0) / ms) * (W - pr);
  const ps = [...k5.map((x) => x.h), ...k5.map((x) => x.l), ...pick.map((e) => e.px)], lo = Math.min(...ps), hi = Math.max(...ps), pad = (hi - lo) * 0.08 || 50, Y = (p) => 8 + (1 - (p - lo + pad) / (hi - lo + 2 * pad)) * (H - 16);
  const mx = big.usd;
  let svg = `<svg viewBox="0 0 ${W} ${H + 14}" width="100%" style="display:block;margin:10px 0 4px"><defs><radialGradient id="lbG"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`;
  [lo, (lo + hi) / 2, hi].forEach((p) => (svg += `<line x1="0" x2="${W - pr}" y1="${Y(p)}" y2="${Y(p)}" stroke="${C.grid}"/><text x="${W - pr + 6}" y="${Y(p) + 4}" font-size="10.5" fill="${C.fg3}">${n0(p)}</text>`));
  if (k5.length > 1) svg += `<polyline fill="none" stroke="${C.fg3}" stroke-width="1.4" points="${k5.map((x) => `${X(x.t * 1000 + 150000).toFixed(1)},${Y(x.c).toFixed(1)}`).join(" ")}"/>`;
  pick.slice().sort((x, y) => x.usd - y.usd).forEach((e) => { const r = Math.max(2.5, Math.sqrt(e.usd / mx) * 16), c = col(e);
    svg += `<circle cx="${X(e.t).toFixed(1)}" cy="${Y(e.px).toFixed(1)}" r="${r.toFixed(1)}" fill="${rgba(c, 0.35)}" stroke="${c}" stroke-width="1.2"/>`; if (r > 9) svg += `<circle cx="${X(e.t).toFixed(1)}" cy="${Y(e.px).toFixed(1)}" r="${(r * 0.6).toFixed(1)}" fill="url(#lbG)"/>`; });
  if (px) svg += `<line x1="0" x2="${W - pr}" y1="${Y(px)}" y2="${Y(px)}" stroke="${C.acc}" stroke-dasharray="3 3"/><text x="${W - pr + 6}" y="${Y(px) + 4}" font-size="10.5" font-weight="700" fill="${C.acc}">now</text>`;
  svg += `<text x="2" y="${H + 12}" font-size="10" fill="${C.fg3}">${ST.lbWin}h ago</text><text x="${W - pr}" y="${H + 12}" font-size="10" fill="${C.fg3}" text-anchor="end">now</text></svg>`;
  // hot zones: where the most got liquidated (price buckets)
  const step = px > 0 ? (ST.lbWin <= 1 ? 50 : ST.lbWin <= 4 ? 100 : 250) : 100, zb = new Map();
  pick.forEach((e) => { const b = Math.floor(e.px / step) * step, o = zb.get(b) || { p: b, L: 0, S: 0, n: 0 }; if (e.side === "long") o.L += e.usd; else o.S += e.usd; o.n++; zb.set(b, o); });
  const zones = [...zb.values()].sort((x, y) => y.L + y.S - (x.L + x.S)).slice(0, 3);
  const zhtml = `<div class="lzones">${zones.map((z) => `<div><b>${n0(z.p)}–${n0(z.p + step)}</b><span>${usd(z.L + z.S)} · ${z.n} hits</span><span><i class="dn">${usd(z.L)}</i> / <i class="up">${usd(z.S)}</i></span></div>`).join("")}</div>`;
  // ranked list with size bars
  const list = `<div class="lrank">${top.slice(0, 12).map((e, i) => `<div class="lr"><span class="lrn">${i + 1}</span><div class="lrm"><div class="lrt"><b style="color:${col(e)}">${e.side === "long" ? "Long" : "Short"} ${usd(e.usd)}</b><span class="mut">@ ${n0(e.px)} · ${e.src} · ${ago(e.t)}</span></div>
    <div class="lrb"><i style="width:${Math.max(3, (e.usd / mx) * 100).toFixed(1)}%;background:linear-gradient(90deg,${rgba(col(e), 0.35)},${col(e)})"></i></div></div></div>`).join("")}</div>`;
  box.innerHTML = ctl + hero + split + svg + `<div class="mut" style="font-size:11.5px;margin:-2px 0 6px">Each bubble is one liquidation at the price and time it hit; bigger bubble, bigger position. <span class="dn">Red = longs</span>, <span class="up">green = shorts</span>.</div>` +
    `<div class="pt" style="margin:10px 0 6px">Hot zones</div>` + zhtml + `<div class="pt" style="margin:12px 0 6px">Top 12</div>` + list;
}
document.addEventListener("click", (e) => { const w = e.target.closest("[data-lbw]"), sd = e.target.closest("[data-lbs]"); if (!w && !sd) return; if (w) { ST.lbWin = +w.dataset.lbw; LS.set("lbWin", ST.lbWin); } if (sd) { ST.lbSide = sd.dataset.lbs; LS.set("lbSide", ST.lbSide); } render(); });

let LMAP = null, LSEL = null, LKEY = "";
function liqTip(i) {
  const tip = $("#liqTip"), b = LMAP && LMAP.bins[i]; if (!b) { tip.hidden = true; return; } LSEL = i;
  const px = LMAP.px, above = b.p > px, path = LMAP.bins.filter((x) => (above ? x.p > px && x.p <= b.p : x.p < px && x.p >= b.p)), cum = path.reduce((s, x) => s + (above ? x.short : x.long), 0);
  tip.hidden = false;
  tip.innerHTML = `<b>${n0(b.p)}</b> <span class="mut">${pct(((b.p - px) / px) * 100)}</span><br>Est. shorts here <b class="up">${usd(b.short)}</b> · longs <b class="dn">${usd(b.long)}</b><br><span class="mut">${above ? "Shorts" : "Longs"} liquidated if price ${above ? "rises" : "falls"} to here:</span> <b class="${above ? "up" : "dn"}">${usd(cum)}</b>`;
  const hl = document.getElementById("liqHl"), r = document.querySelector(`#liqMap rect[data-i="${i}"]`);
  if (hl && r) { const y = +r.getAttribute("y") + +r.getAttribute("height") / 2; hl.setAttribute("y1", y); hl.setAttribute("y2", y); }
}
["pointermove", "click"].forEach((ev) => $("#liqMap").addEventListener(ev, (e) => { const r = e.target.closest("[data-i]"); if (r) liqTip(+r.dataset.i); }));
$("#liqMap").addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") $("#liqTip").hidden = true; });
document.addEventListener("click", (e) => {
  const r = e.target.closest("[data-lrng]"); if (r) { ST.liqRange = +r.dataset.lrng; LS.set("liqRange", ST.liqRange); $("#liqTip").hidden = true; render(); return; }
  const sd = e.target.closest("[data-lside]"); if (sd) { ST.liqSide = sd.dataset.lside; LS.set("liqSide", ST.liqSide); $("#liqTip").hidden = true; render(); }
});

/* ===================== Markets tab ===================== */
function drawMarkets() {
  const C = chartColors(), ref = live("spot") ? D.spot.px : null;
  const rows = SPOTS.map(([id, name, pair]) => { const d = live(id) ? D[id] : null; if (id === "spot" && d) return { id, name, pair, px: d.px, chg: d.chg, vol: d.vol }; return { id, name, pair, px: d && d.px, chg: d && ok(d.open) ? ((d.px - d.open) / d.open) * 100 : null, vol: d && d.vol }; });
  const tv = rows.reduce((s, r) => s + (ok(r.vol) ? r.vol : 0), 0);
  $("#mktTbl").innerHTML = `<thead><tr><th>Venue</th><th class="l">Pair</th><th>Price</th><th>vs Binance</th><th>24h</th><th>Vol (BTC)</th><th>Share</th><th>Status</th></tr></thead><tbody>${rows.map((r) => r.px ? `<tr><td>${r.name}</td><td class="l mut">${r.pair}</td><td>${nd(r.px, 1)}</td><td class="${cls(ref && r.id !== "spot" ? r.px - ref : 0)}">${ref && r.id !== "spot" ? pct(((r.px - ref) / ref) * 100, 3) : "ref"}</td><td class="${cls(r.chg)}">${pct(r.chg)}</td><td>${ok(r.vol) ? n0(r.vol) : "–"}</td><td>${ok(r.vol) && tv ? ((r.vol / tv) * 100).toFixed(1) + "%" : "–"}</td><td>${stPill(r.id)}</td></tr>` : `<tr><td>${r.name}</td><td class="l mut">${r.pair}</td><td colspan="5" class="l mut">${esc(SRC[r.id].st.err || "Loading…")}</td><td>${stPill(r.id)}</td></tr>`).join("")}</tbody>`;
  const pxs = rows.filter((r) => r.px).map((r) => r.px);
  $("#mktSum").innerHTML = pxs.length ? `<div class="kpi-row"><div><div class="big">${n0(pxs.reduce((s, v) => s + v, 0) / pxs.length)}</div><div class="sub">average of ${pxs.length} spot venues · spread ${n0(Math.max(...pxs) - Math.min(...pxs))}</div></div></div>
    ${rows.filter((r) => ok(r.vol) && tv).sort((x, y) => y.vol - x.vol).map((r) => `<div class="fbar"><span>${r.name}</span><span class="track"><i style="left:0;width:${(r.vol / tv) * 100}%;background:${C.acc}"></i></span><span style="text-align:right">${((r.vol / tv) * 100).toFixed(1)}%</span></div>`).join("")}` : `<div class="unavail">Waiting for venues</div>`;
  // futures basis
  if (live("dbFut") && ref) {
    const idx = live("cbS") ? D.cbS.px : ref, nowMs = Date.now();
    const fr = D.dbFut.rows.filter((r) => r.exp && r.exp > nowMs).sort((x, y) => x.exp - y.exp);
    $("#basisTbl").innerHTML = `<thead><tr><th>Contract</th><th>Expiry</th><th>Price</th><th>Basis</th><th>Annualized</th><th>OI</th></tr></thead><tbody>${fr.map((r) => { const days = (r.exp - nowMs) / 86400e3, b = (r.mark / idx - 1) * 100; return `<tr><td>${r.name}</td><td>${new Date(r.exp).toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" })}</td><td>${n0(r.mark)}</td><td class="${cls(b)}">${pct(b)}</td><td class="${cls(b)}"><b>${pct((b * 365) / days, 1)}</b></td><td>${usd(r.oi)}</td></tr>`; }).join("")}</tbody>`;
  } else $("#basisTbl").innerHTML = `<tbody><tr><td class="l mut">${esc(SRC.dbFut.st.err || "Loading…")}</td></tr></tbody>`;
  // options
  if (live("dbOpt") && ref) {
    const R = D.dbOpt.rows, calls = R.filter((r) => r.cp === "C").reduce((s, r) => s + r.oi, 0), puts = R.filter((r) => r.cp === "P").reduce((s, r) => s + r.oi, 0);
    const exps = [...new Set(R.map((r) => r.ms))].filter((m) => m > Date.now()).sort((x, y) => x - y), byExp = (m) => R.filter((r) => r.ms === m);
    const near = exps[0], biggest = exps.slice().sort((x, y) => byExp(y).reduce((s, r) => s + r.oi, 0) - byExp(x).reduce((s, r) => s + r.oi, 0))[0];
    const ex = (m) => { const o = byExp(m), c = o.filter((r) => r.cp === "C").reduce((s, r) => s + r.oi, 0), p = o.filter((r) => r.cp === "P").reduce((s, r) => s + r.oi, 0), mp = TA.maxPain(o); return { m, c, p, mp, label: new Date(m).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) }; };
    const N = ex(near), B = ex(biggest);
    const strikes = byExp(biggest).filter((r) => Math.abs(r.k - ref) / ref <= 0.15), ks = [...new Set(strikes.map((r) => r.k))].sort((x, y) => x - y);
    const bars = ks.map((k) => ({ t: k, up: strikes.filter((r) => r.k === k && r.cp === "C").reduce((s, r) => s + r.oi, 0), dn: strikes.filter((r) => r.k === k && r.cp === "P").reduce((s, r) => s + r.oi, 0) }));
    const W = cw("#optPanel"), H = 190, pr = 70, mid = H / 2 - 8, mx = Math.max(...bars.map((b) => Math.max(b.up, b.dn))) || 1, bw = (W - pr - 4) / (bars.length || 1);
    let svg = `<svg width="100%" viewBox="0 0 ${W} ${H}" style="display:block;max-height:220px" aria-hidden="true"><line x1="0" x2="${W - pr}" y1="${mid}" y2="${mid}" stroke="${C.fg3}"/>`;
    bars.forEach((b, i) => { const x = 2 + i * bw; svg += `<rect x="${x}" y="${mid - (b.up / mx) * (mid - 8)}" width="${Math.max(1, bw - 1)}" height="${(b.up / mx) * (mid - 8)}" fill="${C.up}"/><rect x="${x}" y="${mid}" width="${Math.max(1, bw - 1)}" height="${(b.dn / mx) * (mid - 8)}" fill="${C.dn}"/>`; if (b.t === B.mp) svg += `<text x="${x + bw / 2}" y="${H - 26}" font-size="11" fill="${C.warn}" text-anchor="middle" font-weight="700">max pain</text>`; });
    const xAt = (p) => 2 + ((p - ks[0]) / ((lastOf(ks) - ks[0]) || 1)) * (W - pr - 4 - bw) + bw / 2;
    if (ks.length) svg += `<line x1="${xAt(ref)}" x2="${xAt(ref)}" y1="4" y2="${H - 22}" stroke="${C.acc}" stroke-dasharray="3 3"/><text x="${xAt(ref)}" y="14" font-size="11" fill="${C.acc}" text-anchor="middle">price</text>`;
    svg += `<text x="${W - pr + 6}" y="22" font-size="11.5" fill="${C.up}">calls</text><text x="${W - pr + 6}" y="${H - 34}" font-size="11.5" fill="${C.dn}">puts</text><text x="2" y="${H - 4}" font-size="11" fill="${C.fg3}">${n0(ks[0])}</text><text x="${W - pr}" y="${H - 4}" font-size="11" fill="${C.fg3}" text-anchor="end">${n0(lastOf(ks))}</text></svg>`;
    $("#optPanel").innerHTML = `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:8px">
      <div><div class="mut" style="font-size:12px">Put/call OI (all)</div><div class="big">${(puts / calls).toFixed(2)}</div><div class="sub">${n0(calls)} calls · ${n0(puts)} puts BTC</div></div>
      <div><div class="mut" style="font-size:12px">Next expiry · ${N.label}</div><div class="big">${n0(N.mp)}</div><div class="sub">max pain · ${pct(((N.mp - ref) / ref) * 100, 1)} · P/C ${(N.p / N.c).toFixed(2)}</div></div>
      <div><div class="mut" style="font-size:12px">Biggest expiry · ${B.label}</div><div class="big">${n0(B.mp)}</div><div class="sub">max pain · ${pct(((B.mp - ref) / ref) * 100, 1)} · ${n0(B.c + B.p)} BTC OI</div></div></div>
      <div class="pt" style="margin:4px 0">Open interest by strike · ${B.label}</div>${svg}`;
  } else $("#optPanel").innerHTML = unavail("dbOpt");
}

/* ===================== main-chart extras ===================== */
const FIBS = [-0.114, -0.074, 0, 0.074, 0.114, 0.214, 0.25, 0.333, 0.382, 0.5, 0.618, 0.667, 0.75, 0.786, 0.886, 0.926, 1, 1.074, 1.114, 1.214, 1.25, 1.33, 1.382, 1.5];
function fibColor(r) {
  const dark = !window.matchMedia || window.matchMedia("(prefers-color-scheme: dark)").matches, x = Math.round(Math.abs(r % 1) * 1000) / 1000, C = chartColors();
  const P = dark ? { y: "#e8c547", o: "#f29a3a", t: "#36c2c9", b: "#4c8dff", p: "#9b7bff", r: "#ff5d68" } : { y: "#9a7400", o: "#c0601a", t: "#11868b", b: "#2563d4", p: "#6b4fd0", r: "#d23744" };
  if ([0, 0.5].includes(x)) return C.fg; if ([0.382, 0.618].includes(x)) return P.y; if ([0.333, 0.667, 0.33].includes(x)) return P.o;
  if ([0.25, 0.75].includes(x)) return P.t; if ([0.214, 0.786].includes(x)) return P.b; if ([0.114, 0.886].includes(x)) return P.p; return P.r;
}
const XL = { groups: {}, keys: {} };
function setLines(group, list) {
  const key = list.map((l) => l.title + Math.round(l.price)).join("|"); if (XL.keys[group] === key) return; XL.keys[group] = key;
  (XL.groups[group] || []).forEach((pl) => { try { CH.candle.removePriceLine(pl); } catch (e) {} });
  XL.groups[group] = list.map((l) => CH.candle.createPriceLine({ lineWidth: 1, axisLabelVisible: true, ...l }));
}
function visBars() {
  if (!D.kl || !D.kl.k.length) return []; const k = D.kl.k, r = CH.main.timeScale().getVisibleLogicalRange();
  if (!r) return k.slice(-150); const a = Math.max(0, Math.floor(r.from)), b = Math.min(k.length - 1, Math.ceil(r.to)); return b - a >= 5 ? k.slice(a, b + 1) : k.slice(-150);
}
function profile(bars) {
  const lo = Math.min(...bars.map((x) => x.l)), hi = Math.max(...bars.map((x) => x.h)); if (!(hi > lo)) return null;
  const n = 64, step = (hi - lo) / n, vol = new Array(n).fill(0), tpo = new Array(n).fill(0);
  for (const x of bars) { const a = Math.max(0, Math.floor((x.l - lo) / step)), b = Math.min(n - 1, Math.floor((x.h - lo) / step)), per = x.v / (b - a + 1); for (let i = a; i <= b; i++) { vol[i] += per; tpo[i]++; } }
  const va = (arr) => { const tot = arr.reduce((s, v) => s + v, 0); let poc = arr.indexOf(Math.max(...arr)), a = poc, b = poc, acc = arr[poc];
    while (acc < 0.7 * tot && (a > 0 || b < n - 1)) { const up = b < n - 1 ? arr[b + 1] : -1, dn = a > 0 ? arr[a - 1] : -1; if (up >= dn) acc += arr[++b]; else acc += arr[--a]; }
    return { poc: lo + (poc + 0.5) * step, vah: lo + (b + 1) * step, val: lo + a * step }; };
  return { lo, step, n, vol, vp: va(vol), tp: va(tpo) };
}
function avwapSeries(k) {
  const now = new Date(), dow = (now.getUTCDay() + 6) % 7, anchor = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow) / 1000;
  let pv = 0, vv = 0, p2 = 0; const out = { m: [], u1: [], l1: [], u2: [], l2: [] };
  for (const x of k) { if (x.t < anchor) continue; const tp = (x.h + x.l + x.c) / 3; pv += tp * x.v; vv += x.v; p2 += tp * tp * x.v; if (!vv) continue; const m = pv / vv, sd = Math.sqrt(Math.max(0, p2 / vv - m * m));
    out.m.push({ time: x.t, value: m }); out.u1.push({ time: x.t, value: m + sd }); out.l1.push({ time: x.t, value: m - sd }); out.u2.push({ time: x.t, value: m + 2 * sd }); out.l2.push({ time: x.t, value: m - 2 * sd }); }
  return out;
}
let OV = null, PROF = null;
function initExtras() {
  if (!CH.ready || CH.x2) return; CH.x2 = true; const C = chartColors();
  const ln = (col, extra = {}) => CH.main.addLineSeries({ color: col, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...extra });
  CH.s50 = ln(C.up, { lineStyle: 0 }); CH.s200 = ln(C.dn, { lineWidth: 2 });
  CH.av = ln("#e8c547", { lineWidth: 2 }); CH.av1u = ln(C.acc); CH.av1l = ln(C.acc); CH.av2u = ln(C.acc, { lineStyle: 2 }); CH.av2l = ln(C.acc, { lineStyle: 2 });
  const host = $("#cMain"); host.style.position = "relative"; OV = document.createElement("canvas"); OV.className = "ov"; host.appendChild(OV);
  let q = 0; const later = () => { if (q) return; q = setTimeout(() => { q = 0; chartExtras(true); }, 120); };
  CH.main.timeScale().subscribeVisibleLogicalRangeChange(later);
  setInterval(() => { if (ST.tab === "overview" && !document.hidden) drawOverlay(); }, 700);
}
function chartExtras(fromScroll) {
  if (!CH.ready) return; initExtras(); const C = chartColors(), k = D.kl && D.kl.tf === ST.tf ? D.kl.k : null;
  const mk = [ST.tf, SRC.kl.st.okAt, ST.sma, ST.avwap, ST.mono, ST.fib, ST.prof, ST.tpo, ST.liq, ST.zones, AN.key, JSON.stringify(ST.fibOff), C.bg].join("|");
  if (!fromScroll && CH.xKey === mk) return; CH.xKey = mk;
  CH.candle.applyOptions(ST.mono ? { upColor: rgba(C.bg, 1), downColor: C.fg, borderVisible: true, borderUpColor: C.fg, borderDownColor: C.fg, wickUpColor: C.fg, wickDownColor: C.fg }
    : { upColor: C.up, downColor: C.dn, borderVisible: false, wickUpColor: C.up, wickDownColor: C.dn });
  if (!k) return;
  if (!fromScroll) {
    const c = k.map((x) => x.c), sm = (n) => TA.sma(c, n).map((v, i) => (ok(v) ? { time: k[i].t, value: v } : null)).filter(Boolean);
    CH.s50.setData(ST.sma ? sm(50) : []); CH.s200.setData(ST.sma ? sm(200) : []);
    const intra = ["5m", "15m", "30m", "1h"].includes(ST.tf), av = ST.avwap && intra ? avwapSeries(k) : { m: [], u1: [], l1: [], u2: [], l2: [] };
    CH.av.setData(av.m); CH.av1u.setData(av.u1); CH.av1l.setData(av.l1); CH.av2u.setData(av.u2); CH.av2l.setData(av.l2);
  }
  const vb = visBars();
  if (ST.fib && vb.length) {
    const lo = Math.min(...vb.map((x) => x.l)), hi = Math.max(...vb.map((x) => x.h));
    setLines("fib", FIBS.filter((r) => !ST.fibOff[r]).map((r) => ({ price: lo + r * (hi - lo), color: fibColor(r), lineStyle: 1, title: String(r), axisLabelVisible: [0, 0.382, 0.5, 0.618, 1].includes(r) })));
  } else setLines("fib", []);
  PROF = (ST.prof || ST.tpo) && vb.length ? profile(vb) : null;
  setLines("prof", PROF && ST.prof ? [
    { price: PROF.vp.poc, color: "#e8c547", lineStyle: 0, lineWidth: 2, title: "POC" }, { price: PROF.vp.vah, color: C.fg2, lineStyle: 2, title: "VAH" }, { price: PROF.vp.val, color: C.fg2, lineStyle: 2, title: "VAL" }] : []);
  setLines("tpo", PROF && ST.tpo ? [
    { price: PROF.tp.poc, color: C.acc, lineStyle: 1, title: "TPO POC" }, { price: PROF.tp.vah, color: C.acc, lineStyle: 1, title: "TPO VAH", axisLabelVisible: false }, { price: PROF.tp.val, color: C.acc, lineStyle: 1, title: "TPO VAL", axisLabelVisible: false }] : []);
  const a = AN && AN.key ? AN : null;
  setLines("liq", ST.liq && a && a.L ? [...a.L.shorts.slice(0, 3).map((c) => ({ price: c.p, color: C.up, lineStyle: 3, title: `Short liq ${usd(c.usd)}` })), ...a.L.longs.slice(0, 3).map((c) => ({ price: c.p, color: C.dn, lineStyle: 3, title: `Long liq ${usd(c.usd)}` }))] : []);
  drawOverlay();
}
function drawOverlay() {
  if (!OV || !CH.ready) return; const host = $("#cMain"), w = host.clientWidth, h = host.clientHeight, dpr = window.devicePixelRatio || 1;
  if (OV.width !== Math.round(w * dpr) || OV.height !== Math.round(h * dpr)) { OV.width = Math.round(w * dpr); OV.height = Math.round(h * dpr); OV.style.width = w + "px"; OV.style.height = h + "px"; }
  const g = OV.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  let psw = 72; try { psw = CH.main.priceScale("right").width() || 72; } catch (e) {}
  const pw = w - psw, Y = (p) => CH.candle.priceToCoordinate(p), C = chartColors();
  if (ST.zones && AN && AN.Z) {
    AN.Z.filter((z) => Math.abs(z.dist) <= 3 && z.w >= 2).forEach((z) => { const y1 = Y(z.hi), y2 = Y(z.lo); if (y1 === null || y2 === null) return; g.fillStyle = rgba(z.c > AN.px ? C.dn : C.up, 0.13); g.fillRect(0, Math.min(y1, y2) - 2, pw, Math.max(4, Math.abs(y2 - y1) + 4)); });
  }
  if (PROF && ST.prof) {
    const y1 = Y(PROF.vp.vah), y2 = Y(PROF.vp.val);
    if (y1 !== null && y2 !== null) { g.fillStyle = rgba(C.acc, 0.07); g.fillRect(0, Math.min(y1, y2), pw, Math.abs(y2 - y1)); }
    const mx = Math.max(...PROF.vol) || 1, maxW = pw * 0.24;
    for (let i = 0; i < PROF.n; i++) {
      const pa = PROF.lo + i * PROF.step, ya = Y(pa), yb = Y(pa + PROF.step); if (ya === null || yb === null) continue;
      const inVA = pa + PROF.step / 2 >= PROF.vp.val && pa + PROF.step / 2 <= PROF.vp.vah, isPoc = Math.abs(pa + PROF.step / 2 - PROF.vp.poc) < PROF.step / 2;
      g.fillStyle = isPoc ? rgba("#e8c547", 0.75) : inVA ? rgba(C.acc, 0.45) : rgba(C.fg3, 0.35);
      const bw = (PROF.vol[i] / mx) * maxW; g.fillRect(pw - bw, Math.min(ya, yb) + 0.5, bw, Math.max(1, Math.abs(yb - ya) - 1));
    }
  }
}

/* ===================== wiring ===================== */
function drawStage2(tab) {
  const a = analysis();
  const hl = $("#hLean"); if (hl) hl.innerHTML = a ? `${tag(`Lean ${a.verdict}`, a.bias)}<span class="mut" style="font-size:12.5px">${a.bias > 0 ? "+" : ""}${a.bias}</span>` : "";
  const need = (sel, fn) => { const el = $(sel); if (!el) return; if (!a) { el.innerHTML = `<div class="unavail">${esc(SRC.taK.st.err || "Loading candles for analysis…")}</div>`; return; } fn(a); };
  try {
    if (tab === "overview") {
      need("#ovAssess", (x) => ($("#ovAssess").innerHTML = assessHTML(x, false)));
      const fs = $("#fibSel"); fs.hidden = !ST.fib;
      if (ST.fib) { const on = FIBS.filter((r) => !ST.fibOff[r]), isKey = on.length === 6 && [0, 0.382, 0.5, 0.618, 0.786, 1].every((r) => !ST.fibOff[r]), isAll = on.length === FIBS.length, sm = "min-height:26px;padding:1px 9px;font-size:12px";
        const swi = ST.fibSrc === "auto" ? (typeof FIBA !== "undefined" ? FIBA.v : null) : ST.fibSrc !== "vis" && typeof fibSwing === "function" ? fibSwing(ST.fibSrc) : null;
        fs.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;flex-basis:100%"><span class="mut" style="font-size:12px">Measure from</span><span class="seg">${[["auto", "Last big move"], ["30m", "30m"], ["1h", "1h"], ["4h", "4h"], ["vis", "Screen"]].map(([v2, l]) => `<button data-fibsrc="${v2}" aria-pressed="${ST.fibSrc === v2}" style="${sm}">${l}</button>`).join("")}</span>${ST.fibSrc === "auto" ? `<button class="chip" data-fiblock aria-pressed="${!!ST.fibLock}" style="${sm}" title="Locked: stays on the latest big move while you scroll. Unlocked: re-anchors to the last big move in what's on screen.">${ST.fibLock ? "🔒 Locked to latest" : "↔ Follows scroll"}</button>` : ""}<span class="mut" id="fibInfo" style="font-size:11.5px">${fibInfoHTML(swi)}</span></div><span class="mut" style="font-size:12px">Fib · ${on.length} of ${FIBS.length}</span><span class="seg"><button data-fib="key" aria-pressed="${isKey}" style="${sm}">Key</button><button data-fib="all" aria-pressed="${isAll}" style="${sm}">All</button><button data-fib="edit" aria-pressed="false" style="${sm}">${ST.fibOpen ? "Hide levels ▴" : "Show levels ▾"}</button></span>` +
          (ST.fibOpen ? `<div style="display:flex;flex-wrap:wrap;gap:4px;flex-basis:100%">` + FIBS.map((r) => `<button class="chip" data-fib="${r}" aria-pressed="${!ST.fibOff[r]}" style="${sm};${!ST.fibOff[r] ? `border-color:${fibColor(r)};color:${fibColor(r)}` : ""}">${r}</button>`).join("") + `</div>` : ""); }
    }
    if (tab === "ta") need("#taAssess", drawTA);
    if (tab === "pat") need("#pat30m", drawPatterns);
    if (tab === "setups") need("#setL", drawSetups);
    if (tab === "flow") drawFlowTab();
    if (tab === "liq") drawLiq(a);
    if (tab === "mkts") drawMarkets();
  } catch (e) { console.error(e); }
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-lev]"); if (b) { ST.lev = +b.dataset.lev; LS.set("lev", ST.lev); render(); return; }
  if (e.target.closest("[data-fiblock]")) { ST.fibLock = !ST.fibLock; LS.set("fibLock", ST.fibLock); CH.xKey = null; render(); return; }
  const fsrc = e.target.closest("[data-fibsrc]"); if (fsrc) { LS.set("fibAutoV1", true); ST.fibSrc = fsrc.dataset.fibsrc; LS.set("fibSrc", ST.fibSrc); CH.xKey = null; render(); return; }
  const f = e.target.closest("[data-fib]");
  if (f) {
    const v = f.dataset.fib;
    if (v === "edit") { ST.fibOpen = !ST.fibOpen; LS.set("fibOpen", ST.fibOpen); render(); return; }
    if (v === "all") ST.fibOff = {}; else if (v === "key") { ST.fibOff = {}; FIBS.forEach((r) => { if (![0, 0.382, 0.5, 0.618, 0.786, 1].includes(r)) ST.fibOff[r] = true; }); }
    else { const r = +v; if (ST.fibOff[r]) delete ST.fibOff[r]; else ST.fibOff[r] = true; }
    LS.set("fibOff", ST.fibOff); render(); return;
  }
  const x = e.target.closest("[data-cvdx]"); if (x) { const n = x.dataset.cvdx; if (ST.cvdOff[n]) delete ST.cvdOff[n]; else ST.cvdOff[n] = true; LS.set("cvdOff", ST.cvdOff); render(); }
});
$("#marginIn").addEventListener("input", (e) => { const v = +e.target.value; if (v > 0) { ST.margin = v; LS.set("margin", v); render(); } });
syncCtl(); setTab(ST.tab);
["taK", "okxOI1h", "okxSpTk", "okxLiq", "wsOkxLiq", "wsBnLiq", "wsByLiq", "cbTr", "wsCb", "cbS", "krS", "bsS", "okS", "bgS", "gmS", "mxS", "dbFut", "dbOpt"].forEach((id) => tick(id));
