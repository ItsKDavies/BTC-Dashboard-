"use strict";
/* ===================== Altcoins to watch =====================
   Short-term (1–5 days, 4h candles) and long-term (weeks–months, daily candles) reads on a watchlist of liquid
   alts. Binance spot candles (data-api.binance.vision, browser-friendly), Hyperliquid funding/OI (already loaded by
   the "hl" venue source). Rules only, nothing is backtested. Candles load only while Alts (or Signals → Now) is open. */
const ALT_DEFAULT = ["ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "AVAX", "LINK", "SUI", "TON", "DOT", "LTC", "BCH", "NEAR", "APT", "ARB", "OP", "INJ", "TIA", "SEI", "RENDER", "FET", "TAO", "ENA", "ONDO", "AAVE", "UNI", "PEPE", "WIF", "HBAR", "TRX", "XLM"];
ST.altList = LS.get("altList", ALT_DEFAULT); ST.altMode = LS.get("altMode", "short");
const ALTK = LS.get("altK", {}); // last candles per coin, kept so the tab opens instantly
const altWanted = () => ["alts", "now"].includes(ST.tab);

def("altT", "Alts: prices", "Alts tab: 24h tickers", 60000, async () => {
  const list = ST.altList.filter((b) => !(ALTK[b] && ALTK[b].bad)), m = {};
  const put = (t) => (m[t.symbol.replace(/USDT$/, "")] = { px: +t.lastPrice, chg: +t.priceChangePercent, qv: +t.quoteVolume, hi: +t.highPrice, lo: +t.lowPrice });
  try { (await getJSON(`${BN}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(list.map((b) => b + "USDT")))}`)).forEach(put); }
  catch (e) { if (e.status !== 400) throw e; // one unknown symbol fails the batch: ask one by one and flag the bad ones
    await Promise.all(list.map(async (b) => { try { put(await getJSON(`${BN}/ticker/24hr?symbol=${b}USDT`)); } catch (x) { if (x.status === 400) { (ALTK[b] = ALTK[b] || {}).bad = true; } } })); }
  return { m };
}, true);
SRC.altT.when = altWanted;
def("altK", "Alts: candles", "Alts tab: 4h and daily candles per coin", 15 * 60000, async (prev) => {
  const now = Date.now(), jobs = [];
  for (const b of ST.altList) {
    const e = ALTK[b] || {};
    if (!e.k4 || now - (e.a4 || 0) > 14 * 60000) jobs.push([b, "4h", 150]);
    if (!e.kd || now - (e.ad || 0) > 3 * 3600000) jobs.push([b, "1d", 400]);
  }
  let fails = 0, okN = 0;
  const run = async () => { while (jobs.length) { const [b, iv, lim] = jobs.shift();
    try { const k = (await getJSON(`${BN}/klines?symbol=${b}USDT&interval=${iv}&limit=${lim}`)).map(pk); const e = (ALTK[b] = ALTK[b] || {}); if (iv === "4h") { e.k4 = k; e.a4 = Date.now(); } else { e.kd = k; e.ad = Date.now(); } okN++; }
    catch (x) { fails++; if (x.status === 400) { const e = (ALTK[b] = ALTK[b] || {}); e.bad = true; e.a4 = e.ad = Date.now(); } } } };
  await Promise.all([run(), run(), run(), run()]);
  if (!okN && fails) throw new Error(`No candles (${fails} requests failed)`);
  try { const slim = {}; for (const b in ALTK) slim[b] = { ...ALTK[b], k4: (ALTK[b].k4 || []).slice(-150), kd: (ALTK[b].kd || []).slice(-400) }; LS.set("altK", slim); } catch (e) {}
  ALTC.key = ""; return { n: Object.keys(ALTK).length, at: Date.now() };
}, true);
SRC.altK.when = altWanted;

/* ---------- scoring ---------- */
const lst = (a) => a[a.length - 1];
function altShort(b, k, btc4, info, hl) {
  if (!k || k.length < 60) return null;
  const c = k.map((x) => x.c), n = c.length, px = info ? info.px : c[n - 1], e20 = lst(TA.ema(c, 20)), e50 = lst(TA.ema(c, 50)), r = lst(TA.rsi(c)), atr = lst(TA.atr(k));
  const prior = k.slice(-31, -1), hh = Math.max(...prior.map((x) => x.h)), ll = Math.min(...prior.map((x) => x.l));
  const ch = (arr, bars) => (arr.length > bars ? ((lst(arr).c - arr[arr.length - 1 - bars].c) / arr[arr.length - 1 - bars].c) * 100 : null);
  const rs3 = btc4 ? ch(k, 18) - ch(btc4, 18) : null, d1 = ch(k, 6);
  const qv = k.map((x) => x.v * x.c), lastQ = qv.slice(-6).reduce((s, x) => s + x, 0), base = qv.slice(-42, -6).reduce((s, x) => s + x, 0) / 6, surge = base ? lastQ / base : null;
  const st = SG.structure(k, "4h", 3), tags = []; let sc = 0;
  if (px > e20 && e20 > e50) { sc += 25; tags.push(["Uptrend", 1]); } else if (px < e20 && e20 < e50) { sc -= 25; tags.push(["Downtrend", -1]); }
  if (st) { sc += st.trend * 12; if (st.lastEv && st.lastEv.type === "CHoCH" && n - 1 - st.lastEv.i <= 4) { sc += st.lastEv.dir * 12; tags.push([`4h CHoCH ${st.lastEv.dir > 0 ? "up" : "down"}`, st.lastEv.dir]); } }
  if (ok(rs3)) { sc += Math.max(-1, Math.min(1, rs3 / 6)) * 22; if (rs3 > 4) tags.push([`Beating BTC ${pct(rs3, 1)}`, 1]); if (rs3 < -4) tags.push([`Lagging BTC ${pct(rs3, 1)}`, -1]); }
  if (ok(r)) { if (r >= 52 && r <= 70) sc += 8; else if (r > 76) { sc -= 6; tags.push([`RSI ${r.toFixed(0)} stretched`, 0]); } else if (r < 30) { sc += 6; tags.push([`RSI ${r.toFixed(0)} oversold`, 1]); } else if (r < 46) sc -= 8; }
  if (px > hh) { sc += 15; tags.push(["Breakout · 5-day high", 1]); } else if (px < ll) { sc -= 15; tags.push(["Breakdown · 5-day low", -1]); }
  if (ok(surge) && surge > 1.8 && ok(d1)) { sc += Math.sign(d1) * 8; tags.push([`Volume ${surge.toFixed(1)}× normal`, Math.sign(d1)]); }
  if (hl && ok(hl.f8)) { if (hl.f8 > 0.0005) { sc -= 8; tags.push([`Funding hot ${(hl.f8 * 100).toFixed(3)}%`, -1]); } else if (hl.f8 < -0.0002) { sc += 6; tags.push([`Shorts paying ${(hl.f8 * 100).toFixed(3)}%`, 1]); } }
  sc = Math.round(Math.max(-100, Math.min(100, sc)));
  const side = sc >= 0 ? 1 : -1, brk = side > 0 ? px > hh : px < ll;
  let entry = brk ? (side > 0 ? hh : ll) : side > 0 ? Math.min(px, Math.max(e20, px - 0.6 * atr)) : Math.max(px, Math.min(e20, px + 0.6 * atr));
  let stop = entry - side * 1.6 * atr;
  if (st && ok(st.chochLv) && side * (entry - st.chochLv) > 0 && Math.abs(entry - st.chochLv) < 3 * atr) stop = st.chochLv - side * 0.25 * atr;
  const R = Math.abs(entry - stop), kd30 = k.slice(-180), far = side > 0 ? Math.max(...kd30.map((x) => x.h)) : Math.min(...kd30.map((x) => x.l));
  const tp1 = entry + side * 2 * R, tp2 = side * (far - tp1) > R * 0.5 ? far : entry + side * 3.2 * R;
  return { b, px, chg: info ? info.chg : null, qv: info ? info.qv : null, sc, side, tags, r, rs3, surge, entry, stop, tp1, tp2, brk, st, atrPct: (atr / px) * 100, spark: c.slice(-42) };
}
function altLong(b, kd, btcd, info) {
  if (!kd || kd.length < 210) return null;
  const c = kd.map((x) => x.c), n = c.length, px = info ? info.px : c[n - 1], s50a = TA.sma(c, 50), s200a = TA.sma(c, 200), s50 = lst(s50a), s200 = lst(s200a);
  const slope = s200a[n - 21] ? ((s200 - s200a[n - 21]) / s200a[n - 21]) * 100 : 0;
  const ch = (arr, bars) => (arr && arr.length > bars ? ((lst(arr).c - arr[arr.length - 1 - bars].c) / arr[arr.length - 1 - bars].c) * 100 : null);
  const rs90 = btcd && btcd.length > 91 ? ch(kd, 90) - ch(btcd, 90) : null, y = kd.slice(-365), yH = Math.max(...y.map((x) => x.h)), dd = (px / yH - 1) * 100, d200 = (px / s200 - 1) * 100;
  const lo30 = Math.min(...kd.slice(-30).map((x) => x.l)), lo60 = Math.min(...kd.slice(-60, -30).map((x) => x.l)), hl = lo30 > lo60;
  const wk = []; for (let i = n - 1; i >= 0; i -= 7) wk.unshift(c[i]); const wr = TA.rsi(wk), wrsi = lst(wr), wrsiP = wr[wr.length - 2];
  let sc = (px > s200 ? 20 : -20) + (slope > 0 ? 12 : -12) + (s50 > s200 ? 10 : -10) + (ok(rs90) ? Math.max(-1, Math.min(1, rs90 / 30)) * 25 : 0) + (hl ? 10 : -4) + (d200 > 45 ? -12 : 0) + (ok(wrsi) && wrsi > 40 && wrsi < 68 && wrsi > wrsiP ? 6 : 0);
  sc = Math.round(Math.max(-100, Math.min(100, sc)));
  let cat, zone, why;
  const yL = Math.min(...y.map((x) => x.l)), h90 = Math.max(...kd.slice(-90).map((x) => x.h));
  if (px > s200 && slope > 0 && s50 > s200 && (rs90 == null || rs90 > -5)) { cat = "leader"; zone = [Math.min(s50, px) * 0.97, Math.max(s50 * 1.02, Math.min(px, s50 * 1.06))]; why = `Above a rising 200-day average${ok(rs90) ? `, ${rs90 >= 0 ? "outperforming" : "keeping pace with"} BTC over 90 days (${pct(rs90, 0)})` : ""}. Dips toward the 50-day (${fmtPx(s50)}) have been the buy zone.`; }
  else if (dd < -45 && hl && d200 > -25 && d200 < 12) { cat = "basing"; zone = [lo30, lo30 * 1.08]; why = `${pct(dd, 0)} from its 1-year high but making higher lows and back near the 200-day (${pct(d200, 0)}). Classic base-building; accumulation candidates scale in near the 30-day low.`; }
  else if (px > s50 && px < s200 && hl) { cat = "recovering"; zone = [s50 * 0.97, s50 * 1.02]; why = `Reclaimed the 50-day, still under the 200-day (${fmtPx(s200)}). A daily close above the 200-day would turn it into a trend.`; }
  else if (px < s200 && slope < 0) { cat = "avoid"; zone = null; why = `Below a falling 200-day average${ok(rs90) ? ` and ${pct(rs90, 0)} vs BTC over 90 days` : ""}. Bear trend until it reclaims ${fmtPx(s200)}.`; }
  else { cat = "neutral"; zone = null; why = `Mixed: ${px > s200 ? "above" : "below"} the 200-day, ${slope > 0 ? "rising" : "falling"} slope, ${hl ? "higher lows" : "no higher lows yet"}.`; }
  const inval = cat === "leader" ? Math.min(s200, lo60) * 0.97 : cat === "basing" ? Math.min(lo30, lo60) * 0.94 : cat === "recovering" ? Math.min(lo30, lo60) * 0.95 : null;
  return { b, px, chg: info ? info.chg : null, sc, cat, why, zone, inval, yH, h90, dd, d200, rs90, slope, wrsi, s50, s200, hl, up: (yH / px - 1) * 100, spark: c.slice(-120) };
}
const fmtPx = (p) => (!ok(p) ? "–" : p >= 1000 ? n0(p) : p >= 1 ? nd(p, p >= 100 ? 1 : 3) : p >= 0.01 ? nd(p, 4) : p.toPrecision(3));
let ALTC = { key: "", v: null };
function altCompute() {
  const T = live("altT") ? D.altT.m : {}, btc4 = live("taK") ? D.taK["4h"] : null, btcd = live("taK") ? D.taK["1d"] : null, hlA = live("hl") && D.hl.all ? D.hl.all : {};
  const key = [SRC.altK.st.okAt, SRC.altT.st.okAt, SRC.taK.st.okAt, ST.altList.join()].join("|"); if (ALTC.key === key) return ALTC.v;
  const S = [], L = [];
  ST.altList.forEach((b) => { const e = ALTK[b]; if (!e || e.bad) return; const s = altShort(b, e.k4, btc4, T[b], hlA[b]); if (s) S.push(s); const l = altLong(b, e.kd, btcd, T[b]); if (l) L.push(l); });
  const br = { n: S.length, up4: S.filter((s) => s.tags.some((t) => t[0] === "Uptrend")).length, above200: L.filter((l) => l.px > l.s200).length, nl: L.length,
    rs3: S.length ? S.reduce((a, s) => a + (s.rs3 || 0), 0) / S.length : null, rs90: L.length ? L.filter((l) => ok(l.rs90)).reduce((a, l) => a + l.rs90, 0) / Math.max(1, L.filter((l) => ok(l.rs90)).length) : null };
  const eth = S.find((s) => s.b === "ETH"), ethL = L.find((l) => l.b === "ETH"); br.eth = eth ? eth.rs3 : null; br.eth90 = ethL ? ethL.rs90 : null;
  ALTC = { key, v: { S: S.sort((a, b) => b.sc - a.sc), L: L.sort((a, b) => b.sc - a.sc), br } }; return ALTC.v;
}

/* ---------- rendering ---------- */
function altSpark(vals, up) { return spark(vals, 84, 26, up ? cssv("--up") : cssv("--dn")); }
function altShortCard(s) {
  const side = s.side > 0, R = Math.abs(s.entry - s.stop) / s.entry * 100;
  return `<div class="acard ${side ? "up" : "dn"}"><div class="ach"><b class="asym">${s.b}</b><span class="apx">${fmtPx(s.px)}</span><span class="${cls(s.chg)} ach24">${pct(s.chg, 1)}</span>${altSpark(s.spark, s.spark[s.spark.length - 1] >= s.spark[0])}<span class="asc ${side ? "up" : "dn"}">${side ? "Long" : "Short"} ${Math.abs(s.sc)}</span></div>
    <div class="atags">${s.tags.slice(0, 4).map(([t, d]) => `<span class="atag ${vcls(d)}">${esc(t)}</span>`).join("")}</div>
    <div class="aplan"><span><i>${s.brk ? "Retest" : "Entry"}</i><b>${fmtPx(s.entry)}</b></span><span><i>Stop</i><b class="dn">${fmtPx(s.stop)}</b><small>${R.toFixed(1)}%</small></span><span><i>TP1</i><b class="up">${fmtPx(s.tp1)}</b><small>2R</small></span><span><i>TP2</i><b class="up">${fmtPx(s.tp2)}</b></span></div></div>`;
}
const CATS = { leader: ["Leaders · buy dips", "up"], basing: ["Basing · accumulate", "wn"], recovering: ["Recovering", "acc"], neutral: ["Mixed", "mut"], avoid: ["Downtrends · avoid", "dn"] };
function altLongCard(l) {
  return `<div class="acard ${l.cat === "avoid" ? "dn" : l.cat === "leader" ? "up" : ""}"><div class="ach"><b class="asym">${l.b}</b><span class="apx">${fmtPx(l.px)}</span><span class="mut ach24">${pct(l.dd, 0)} from 1y high</span>${altSpark(l.spark, l.px > l.s200)}<span class="asc ${l.sc >= 0 ? "up" : "dn"}">${l.sc > 0 ? "+" : ""}${l.sc}</span></div>
    <div class="sub" style="margin:4px 0 6px">${esc(l.why)}</div>
    <div class="aplan">${l.zone ? `<span><i>Accumulate</i><b>${fmtPx(l.zone[0])}–${fmtPx(l.zone[1])}</b></span>` : `<span><i>Reclaim</i><b>${fmtPx(l.s200)}</b></span>`}${l.inval ? `<span><i>Weekly close below</i><b class="dn">${fmtPx(l.inval)}</b></span>` : ""}<span><i>1y high</i><b class="up">${fmtPx(l.yH)}</b><small>${pct(l.up, 0)}</small></span><span><i>vs BTC 90d</i><b class="${cls(l.rs90)}">${pct(l.rs90, 0)}</b></span></div></div>`;
}
function drawAlts() {
  const el = $("#altBody"); if (!el) return;
  $("#altSeg").innerHTML = [["short", "Short-term · 1–5 days"], ["long", "Long-term · weeks–months"]].map(([k, t]) => `<button data-altm="${k}" aria-pressed="${ST.altMode === k}">${t}</button>`).join("");
  const v = altCompute();
  if (!v.S.length && !v.L.length) { el.innerHTML = `<div class="panel"><div class="unavail">${esc(SRC.altK.st.err || "Loading candles for " + ST.altList.length + " coins…")}</div></div>`; return; }
  const br = v.br, bp = (x, n) => (n ? Math.round((x / n) * 100) : 0);
  const climate = ok(br.rs3) && ok(br.rs90) ? (br.rs3 > 1.5 && br.rs90 > 0 ? ["Alts leading BTC", "up"] : br.rs3 < -1.5 && br.rs90 < 0 ? ["BTC dominance rising: alts bleeding", "dn"] : br.rs3 > 1.5 ? ["Short-term alt bounce, still lagging longer-term", "wn"] : br.rs3 < -1.5 ? ["Alts cooling off vs BTC", "wn"] : ["Alts moving with BTC", "mut"]) : ["Loading…", "mut"];
  const head = `<div class="panel"><div class="ph"><span class="pt">Alt climate</span><span class="ftag ${climate[1]}" style="margin-left:auto;background:color-mix(in srgb,currentColor 12%,transparent)">${climate[0]}</span></div>
    <div class="abr"><div><span>Above 4h trend</span><b>${bp(br.up4, br.n)}%</b><small>${br.up4} of ${br.n}</small></div><div><span>Above 200-day</span><b>${bp(br.above200, br.nl)}%</b><small>${br.above200} of ${br.nl}</small></div><div><span>Avg vs BTC · 3d</span><b class="${cls(br.rs3)}">${pct(br.rs3, 1)}</b></div><div><span>Avg vs BTC · 90d</span><b class="${cls(br.rs90)}">${pct(br.rs90, 0)}</b></div><div><span>ETH vs BTC · 3d / 90d</span><b class="${cls(br.eth)}">${pct(br.eth, 1)}</b><small class="${cls(br.eth90)}">${pct(br.eth90, 0)}</small></div></div></div>`;
  let body;
  if (ST.altMode === "short") {
    const longs = v.S.filter((s) => s.sc >= 25).slice(0, 6), shorts = v.S.filter((s) => s.sc <= -25).sort((a, b) => a.sc - b.sc).slice(0, 4);
    body = `<div class="ph" style="margin:2px 2px -4px"><span class="pt">Long ideas · strongest first</span></div><div class="agrid">${longs.map(altShortCard).join("") || `<div class="panel unavail">No alt scores a clear long right now</div>`}</div>
      <div class="ph" style="margin:2px 2px -4px"><span class="pt">Short ideas · weakest first</span></div><div class="agrid">${shorts.map(altShortCard).join("") || `<div class="panel unavail">No alt scores a clear short right now</div>`}</div>
      <div class="src" style="padding:0 4px">Score: 4h trend (price vs EMA 20/50), 4h structure and fresh CHoCH, 3-day strength vs BTC, RSI, 5-day breakout or breakdown, volume surge, Hyperliquid funding. Entry is the pullback to the 20 EMA or the retest of the breakout level; stop is 1.6 ATR or just past the protected swing; TP1 = 2R, TP2 = the 30-day extreme or 3.2R. Rules only, not advice. Alts move 2–4× BTC: size down.</div>`;
  } else {
    body = ["leader", "basing", "recovering", "avoid"].map((c) => { const L = v.L.filter((l) => l.cat === c).slice(0, c === "avoid" ? 5 : 6); if (!L.length) return "";
      return `<div class="ph" style="margin:2px 2px -4px"><span class="pt ${CATS[c][1]}">${CATS[c][0]}</span></div><div class="agrid">${L.map(altLongCard).join("")}</div>`; }).join("") +
      `<div class="src" style="padding:0 4px">Daily candles, up to 400 days. Leaders: above a rising 200-day with the 50 above the 200 and not lagging BTC. Basing: 45%+ off the high, higher lows, back near the 200-day. Avoid: below a falling 200-day. Invalidation is a weekly close below the level shown. Rules only, not advice.</div>`;
  }
  const all = (ST.altMode === "short" ? v.S : v.L);
  const tbl = `<details class="panel"><summary class="pt" style="cursor:pointer">All ${all.length} coins · ranked</summary><div class="tw" style="margin-top:8px"><table><thead><tr><th class="l">Coin</th><th>Price</th><th>24h</th><th>Score</th><th class="l">${ST.altMode === "short" ? "Signals" : "Bucket"}</th></tr></thead><tbody>${all.map((x) => `<tr><td class="l"><b>${x.b}</b></td><td>${fmtPx(x.px)}</td><td class="${cls(x.chg)}">${pct(x.chg, 1)}</td><td class="${cls(x.sc)}"><b>${x.sc > 0 ? "+" : ""}${x.sc}</b></td><td class="l wrap" style="font-size:12px">${ST.altMode === "short" ? x.tags.map((t) => esc(t[0])).join(" · ") : CATS[x.cat][0]}</td></tr>`).join("")}</tbody></table></div></details>`;
  const wl = `<details class="panel"><summary class="pt" style="cursor:pointer">Watchlist · ${ST.altList.length} coins</summary><p class="note" style="margin:8px 0">Tap a coin to remove it. Add any coin Binance lists against USDT.</p><div class="bchips">${ST.altList.map((b) => `<button class="chip" data-altrm="${b}">${b}${ALTK[b] && ALTK[b].bad ? " ⚠" : ""} ×</button>`).join("")}</div>
    <div class="ctl" style="margin-top:8px"><input id="altAdd" placeholder="e.g. JUP" autocapitalize="characters" style="width:120px;font:inherit;padding:5px 9px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--fg)"><button class="btn" id="bAltAdd">Add</button><button class="btn" id="bAltReset">Reset list</button></div></details>`;
  el.innerHTML = head + body + tbl + wl;
}
function drawAltsOverview() {
  const el = $("#ovAlts"); if (!el) return; const v = altCompute();
  if (!v.S.length) { el.innerHTML = `<div class="unavail">${esc(SRC.altK.st.err || "Loading alts…")}</div>`; return; }
  const top = v.S.filter((s) => s.sc >= 25).slice(0, 3), bot = v.S.filter((s) => s.sc <= -25).slice(-2).reverse();
  el.innerHTML = [...top, ...bot].map((s) => `<button class="altrow" data-goto="alts"><b>${s.b}</b><span>${fmtPx(s.px)}</span><span class="${cls(s.chg)}">${pct(s.chg, 1)}</span><span class="atag ${vcls(s.side)}">${s.side > 0 ? "Long" : "Short"} ${Math.abs(s.sc)}</span><span class="mut">${esc((s.tags[0] || [""])[0])}</span></button>`).join("") || `<div class="unavail">No clear alt setups right now</div>`;
}
document.addEventListener("click", (e) => {
  const m = e.target.closest("[data-altm]"); if (m) { ST.altMode = m.dataset.altm; LS.set("altMode", ST.altMode); drawAlts(); return; }
  const r = e.target.closest("[data-altrm]"); if (r) { ST.altList = ST.altList.filter((b) => b !== r.dataset.altrm); LS.set("altList", ST.altList); ALTC.key = ""; drawAlts(); return; }
  if (e.target.closest("#bAltAdd")) { const b = ($("#altAdd").value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/USDT$/, ""); if (b && !ST.altList.includes(b)) { ST.altList = [...ST.altList, b]; LS.set("altList", ST.altList); delete ALTK[b]; tick("altT"); tick("altK"); } drawAlts(); return; }
  if (e.target.closest("#bAltReset")) { ST.altList = ALT_DEFAULT.slice(); LS.set("altList", ST.altList); ALTC.key = ""; tick("altT"); tick("altK"); drawAlts(); }
});
const _dAlt = drawStage2;
drawStage2 = function (tab) { _dAlt(tab); try { if (tab === "alts") drawAlts(); if (tab === "now") drawAltsOverview(); } catch (e) { console.error(e); } };
