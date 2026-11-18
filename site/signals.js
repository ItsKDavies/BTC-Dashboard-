"use strict";
/* ===================== Signals tab =====================
   Now · Regime · Structure · Levels. Built on SG (sigta.js) and the data the dashboard already loads:
   Binance spot candles 15m–1D (taK), analysis() (technicals, zones, liquidation model, setups), OKX OI/taker/LS,
   funding across venues, Deribit GEX, your levels. Also keeps a change log (regime flips, structure breaks,
   confluence flips, key levels crossed) on this device and can pop a toast when something changes. */
const SIG_TFS = ["15m", "30m", "1h", "4h", "1d"], SIG_TW = { "15m": 0.6, "30m": 0.8, "1h": 1, "4h": 1.6, "1d": 2.2 };
const SIG_CW = { "15m": 0.1, "30m": 0.2, "1h": 0.2, "4h": 0.3, "1d": 0.2 }; // confluence weight per timeframe
ST.sigTf = LS.get("sigTf", "1h"); ST.sigToast = LS.get("sigToast", true); ST.sigNotif = LS.get("sigNotif", false);
let SIGC = { key: "", v: null }, SIGLOG = LS.get("sigLog", []), SIGSTATE = LS.get("sigState", null);

/* ---------- compute ---------- */
function sigFib(k) { // biggest recent 4h leg, same rules as the chart's auto fib
  if (!k || k.length < 40 || typeof fibLegs !== "function") return null;
  const legs = fibLegs(k.slice(-180)); if (!legs.length) return null;
  const mx = Math.max(...legs.map((l) => l.size)), L = [...legs].reverse().find((l) => l.size >= mx * 0.6);
  return { up: L.b.p > L.a.p, hi: Math.max(L.a.p, L.b.p), lo: Math.min(L.a.p, L.b.p) };
}
function sigWeekMonth(k) { // previous week / month high-low from daily candles (UTC)
  if (!k || k.length < 40) return [];
  const out = [], now = new Date(), dow = (now.getUTCDay() + 6) % 7;
  const wk0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow) / 1000, pw = k.filter((x) => x.t >= wk0 - 7 * 86400 && x.t < wk0);
  if (pw.length) out.push({ p: Math.max(...pw.map((x) => x.h)), label: "Prev week high", kind: "hl", w: 1.6 }, { p: Math.min(...pw.map((x) => x.l)), label: "Prev week low", kind: "hl", w: 1.6 });
  const m0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000, pm0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1) / 1000, pm = k.filter((x) => x.t >= pm0 && x.t < m0);
  if (pm.length) out.push({ p: Math.max(...pm.map((x) => x.h)), label: "Prev month high", kind: "hl", w: 1.8 }, { p: Math.min(...pm.map((x) => x.l)), label: "Prev month low", kind: "hl", w: 1.8 });
  return out;
}
function sigCompute(a) {
  a = a || analysis(); if (!a || !live("taK")) return null;
  const px = curPx() || a.px, key = [a.key, Math.round(px / 20), MYLV.at, typeof CWG !== "undefined" ? CWG.at : 0, SRC.dbOpt ? SRC.dbOpt.st.okAt : 0].join("|");
  if (SIGC.key === key) return SIGC.v;
  const K = D.taK, reg = {}, st = {};
  SIG_TFS.forEach((tf) => { const k = K[tf]; reg[tf] = k ? SG.regime(k, tf) : null; st[tf] = k ? SG.structure(k, tf, tf === "1d" ? 2 : 3) : null; });

  /* confluence grid */
  const avgV = (t, keys) => { if (!t) return null; const v = t.votes.filter((x) => keys.includes(x.key)); return v.length ? v.reduce((s, x) => s + x.v, 0) / v.length : null; };
  const rowsTf = [
    ["Trend", "EMA stack and the 200 EMA", (tf) => avgV(a.tfm[tf], ["ema", "e200"])],
    ["Momentum", "RSI, MACD, Stoch RSI", (tf) => avgV(a.tfm[tf], ["rsi", "macd", "stoch"])],
    ["Structure", "Last break of structure (BOS / CHoCH)", (tf) => (st[tf] ? st[tf].trend : null)],
    ["Regime", "Trending up / down (ADX, efficiency)", (tf) => (reg[tf] ? reg[tf].dir : null)],
    ["Location", "Price vs VWAP (intraday) or BB middle", (tf) => avgV(a.tfm[tf], ["vwap", "bb"])],
  ];
  const grid = rowsTf.map(([name, why, f]) => ({ name, why, cells: SIG_TFS.map((tf) => { const v = f(tf); return ok(v) ? Math.max(-1, Math.min(1, v)) : null; }) }));
  const tfAvg = SIG_TFS.map((tf, j) => { const v = grid.map((r) => r.cells[j]).filter(ok); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; });
  let tfs = 0, tfw = 0; SIG_TFS.forEach((tf, j) => { if (ok(tfAvg[j])) { tfs += tfAvg[j] * SIG_CW[tf]; tfw += SIG_CW[tf]; } });
  const tfScore = tfw ? tfs / tfw : 0;
  // "now" signals: flow, positioning, premium, liquidity pull
  const A = aggr(), now = [];
  now.push({ name: "Flow", why: "OI vs price, spot CVD, perp takers (1h)", v: Math.max(-1, Math.min(1, a.flow / 50)), w: 0.4 });
  let pos = 0, posTxt = [];
  if (ok(A.f8)) { if (A.f8 > 0.0003) { pos -= 0.7; posTxt.push("funding hot"); } else if (A.f8 < -0.0001) { pos += 0.7; posTxt.push("shorts paying"); } }
  const ls = live("okxLS") ? lastOf(D.okxLS.s).v : null; if (ok(ls)) { if (ls > 2.2) { pos -= 0.4; posTxt.push("crowded long accounts"); } else if (ls < 0.95) { pos += 0.4; posTxt.push("more short accounts"); } }
  now.push({ name: "Positioning", why: posTxt.length ? posTxt.join(", ") + " (contrarian)" : "Funding and long/short ratio (contrarian)", v: Math.max(-1, Math.min(1, pos)), w: 0.25 });
  const prem = live("cb") && live("spot") ? ((D.cb.px - D.spot.px) / D.spot.px) * 100 : null;
  now.push({ name: "US spot bid", why: ok(prem) ? `Coinbase premium ${pct(prem, 3)}` : "Coinbase premium", v: ok(prem) ? Math.max(-1, Math.min(1, prem / 0.05)) : null, w: 0.15 });
  let pull = null, pullTxt = "Biggest liquidation clusters within 3%";
  if (a.L) { const s3 = a.L.shorts.filter((c) => Math.abs(c.dist) <= 3).reduce((s, c) => s + c.usd, 0), l3 = a.L.longs.filter((c) => Math.abs(c.dist) <= 3).reduce((s, c) => s + c.usd, 0);
    if (s3 + l3 > 0) { pull = (s3 - l3) / (s3 + l3); pullTxt = `Shorts ${usd(s3)} above vs longs ${usd(l3)} below`; } }
  now.push({ name: "Liquidity pull", why: pullTxt, v: ok(pull) ? pull : null, w: 0.2 });
  let ns = 0, nw = 0; now.forEach((x) => { if (ok(x.v)) { ns += x.v * x.w; nw += x.w; } });
  const nowScore = nw ? ns / nw : 0, score = Math.round(100 * (0.65 * tfScore + 0.35 * nowScore));
  const cells = [...grid.flatMap((r) => r.cells), ...now.map((x) => x.v)].filter((v) => ok(v) && Math.abs(v) >= 0.25);
  const agree = cells.filter((v) => Math.sign(v) === Math.sign(score || 1)).length, against = cells.filter((v) => Math.sign(v) === -Math.sign(score || 1)).length;
  const avgOf = (tfl) => { const v = tfl.map((tf) => tfAvg[SIG_TFS.indexOf(tf)]).filter(ok); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0; };
  const htf = avgOf(["4h", "1d"]), ltf = avgOf(["15m", "30m", "1h"]);
  const strength = Math.abs(score) >= 45 && agree >= against * 2.5 ? "Strong" : Math.abs(score) >= 22 ? "Moderate" : "Weak";
  const conf = { grid, now, tfAvg, score, agree, against, n: cells.length, htf, ltf, strength,
    label: Math.abs(score) < 10 ? "No clear edge" : `${strength} ${score > 0 ? "long" : "short"} confluence` };
  conf.insight = htf > 0.2 && ltf < -0.2 ? "Pullback inside a higher-timeframe uptrend. Longs usually wait for 15m–30m structure to turn back up (a CHoCH up) at support."
    : htf < -0.2 && ltf > 0.2 ? "Bounce inside a higher-timeframe downtrend. Rallies into resistance are where shorts usually reload, unless 4h structure breaks up."
    : htf > 0.2 && ltf > 0.2 ? "Timeframes aligned up. Pullbacks to support are the cleaner entries; chasing extended candles is the main risk."
    : htf < -0.2 && ltf < -0.2 ? "Timeframes aligned down. Bounces into resistance are the cleaner shorts; capitulation wicks are the main risk."
    : "Timeframes disagree or are flat. Expect chop; trade the edges of the range or wait for a break.";

  /* derivatives + gamma regime */
  const oi4 = live("okxOI") ? seriesChg(D.okxOI.s, 4 * 3600) : null, oi24 = live("okxOI") ? seriesChg(D.okxOI.s, 23 * 3600) : null, w4 = live("k5") ? win(D.k5.k, 48) : null;
  let dreg = { key: "na", label: "Waiting for OI data", txt: "", dir: 0 };
  if (ok(oi4) && w4) {
    const pu = w4.pChg >= 0, ou = oi4 >= 0, flat = Math.abs(oi4) < 0.5, f = A.f8;
    if (flat) dreg = { key: "spot", label: Math.abs(w4.cvd) > 300 ? "Spot-led" : "Quiet positioning", dir: Math.sign(w4.cvd) * 0.5, txt: `OI ${pct(oi4)} in 4h: leverage isn't driving this. ${Math.abs(w4.cvd) > 300 ? `Spot CVD ${sgn(w4.cvd, 0)} BTC is.` : "Wait for OI to commit."}` };
    else if (pu && ou) dreg = ok(f) && f > 0.00025 ? { key: "lcrowd", label: "Longs piling in · crowded", dir: -0.3, txt: `Price ${pct(w4.pChg)} and OI ${pct(oi4)} in 4h with hot funding. Trend can continue, but a flush below support liquidates late longs fast.` }
      : { key: "lbuild", label: "Longs opening · healthy", dir: 1, txt: `Price ${pct(w4.pChg)} with OI ${pct(oi4)} in 4h and funding calm: new longs are driving the move.` };
    else if (!pu && ou) dreg = ok(f) && f < 0 ? { key: "sfuel", label: "Shorts piling in · squeeze fuel", dir: 0.3, txt: `Price ${pct(w4.pChg)} with OI ${pct(oi4)} and negative funding: shorts are crowded. A reclaim of resistance can squeeze them.` }
      : { key: "sbuild", label: "Shorts opening", dir: -1, txt: `Price ${pct(w4.pChg)} with OI ${pct(oi4)} in 4h: new shorts are pressing.` };
    else if (pu && !ou) dreg = { key: "scover", label: "Short covering", dir: 0.4, txt: `Price ${pct(w4.pChg)} while OI ${pct(oi4)}: shorts closing. Often weaker follow-through unless spot buys.` };
    else dreg = { key: "delev", label: "Deleveraging · longs out", dir: -0.4, txt: `Price ${pct(w4.pChg)} with OI ${pct(oi4)}: longs closing or getting liquidated. Selling often exhausts once OI stops falling.` };
    dreg.oi4 = oi4; dreg.oi24 = oi24; dreg.p4 = w4.pChg; dreg.cvd4 = w4.cvd;
  }
  const g = typeof gexCalc === "function" ? gexCalc("all") : null;
  const gam = g ? { pos: ok(g.flip) ? px >= g.flip : g.net >= 0, flip: g.flip, em1: g.em1, em7: g.em7 } : null;

  /* level map */
  const raw = [], TW = SIG_TW;
  (a.Z || []).forEach((z) => raw.push({ p: z.c, kind: "zone", label: z.names.slice(0, 2).join(" · "), w: z.w }));
  ["30m", "1h", "4h", "1d"].forEach((tf) => { const s = st[tf]; if (!s) return;
    if (ok(s.bosLv)) raw.push({ p: s.bosLv, kind: "struct", label: `${tf} ${s.trend > 0 ? "high · BOS trigger" : "low · BOS trigger"}`, w: 1.1 * TW[tf], tf });
    if (ok(s.chochLv)) raw.push({ p: s.chochLv, kind: "struct", label: `${tf} ${s.trend > 0 ? "protected low · CHoCH" : "protected high · CHoCH"}`, w: 1.3 * TW[tf], tf });
    s.pools.forEach((q) => raw.push({ p: q.p, kind: "pool", label: `${tf} equal ${q.side > 0 ? "highs" : "lows"} · stops`, w: 1.1 * TW[tf], tf, pool: q.side }));
    if (tf !== "30m") s.fvg.forEach((f) => raw.push({ p: f.mid, kind: "fvg", label: `${tf} ${f.dir > 0 ? "bullish" : "bearish"} FVG`, w: 0.75 * TW[tf], tf, lo: f.bot, hi: f.top }));
    if (tf === "1h" || tf === "4h") s.ob.forEach((o) => raw.push({ p: o.mid, kind: "ob", label: `${tf} ${o.dir > 0 ? "bullish" : "bearish"} order block`, w: 0.85 * TW[tf], tf, lo: o.bot, hi: o.top }));
  });
  if (a.L) [...a.L.shorts.slice(0, 4), ...a.L.longs.slice(0, 4)].forEach((c) => raw.push({ p: c.p, kind: "liq", label: `${c.dist < 0 ? "Long" : "Short"} liquidations ${usd(c.usd)}`, w: 0.8 + Math.max(0, Math.log10(c.usd / 1e6)) * 0.6, usd: c.usd }));
  if (g && typeof gexLevels === "function") gexLevels(g).forEach((l) => raw.push({ p: l.p, kind: "gex", label: l.name, w: l.id === "FLIP" ? 2 : /Magnet/.test(l.name) ? 1.6 : 1.3 }));
  const fb = sigFib(K["4h"]);
  if (fb) { const R = fb.hi - fb.lo; [[0.382, 1], [0.5, 1], [0.618, 1.4], [0.786, 1.1]].forEach(([r, w]) => raw.push({ p: fb.up ? fb.hi - r * R : fb.lo + r * R, kind: "fib", label: `4h fib ${r}`, w }));
    [[1.272, 1], [1.618, 1.2]].forEach(([r, w]) => raw.push({ p: fb.up ? fb.lo + r * R : fb.hi - r * R, kind: "fib", label: `4h fib ext ${r}`, w })); }
  const vp7 = SG.vprofile(K["1h"].slice(-168)), vp30 = SG.vprofile(K["4h"].slice(-180));
  if (vp7) raw.push({ p: vp7.poc, kind: "vp", label: "7d POC", w: 1.4 }, { p: vp7.vah, kind: "vp", label: "7d VAH", w: 1 }, { p: vp7.val, kind: "vp", label: "7d VAL", w: 1 });
  if (vp30) raw.push({ p: vp30.poc, kind: "vp", label: "30d POC", w: 1.7 });
  sigWeekMonth(K["1d"]).forEach((l) => raw.push(l));
  for (let r = Math.ceil((px * 0.95) / 1000) * 1000; r <= px * 1.05; r += 1000) raw.push({ p: r, kind: "round", label: r % 10000 === 0 ? `${r / 1000}k big round` : `${r / 1000}k round`, w: r % 10000 === 0 ? 1.4 : r % 5000 === 0 ? 0.8 : 0.35 });
  MYLV.list.forEach((l) => raw.push({ p: l.p, kind: "my", label: l.label && l.label !== "Mine" ? `My ${l.label}` : "My level", w: 2 }));
  if (typeof CWG !== "undefined") CWG.list.forEach((l) => raw.push({ p: l.p, kind: "cw", label: `CoinWise ${l.label || l.name || "GEX"}`, w: 1.5 }));
  const lv = SG.cluster(raw, px);

  /* odds and big-move scenarios */
  const sig = SG.hourlySigma(K["1h"]), drift = (score / 100) * 0.03 * (ok(sig) ? sig : 0);
  lv.forEach((z) => { z.o24 = SG.touchOdds(z.d, sig, 24, drift); z.o72 = SG.touchOdds(z.d, sig, 72, drift); z.pool = z.items.some((r) => r.kind === "pool"); z.fvg = z.items.some((r) => r.kind === "fvg"); z.liqUsd = z.items.reduce((s, r) => s + (r.kind === "liq" ? r.usd || 0 : 0), 0); });
  const strong = (z) => z.stars >= 3 && Math.abs(z.d) >= 0.12;
  const up = lv.filter((z) => z.side > 0 && strong(z)).sort((x, y) => x.p - y.p), dn = lv.filter((z) => z.side < 0 && strong(z)).sort((x, y) => y.p - x.p);
  const liqBetween = (p1, p2, side) => (a.L ? (side > 0 ? a.L.shorts : a.L.longs).filter((c) => c.p > Math.min(p1, p2) && c.p < Math.max(p1, p2)).reduce((s, c) => s + c.usd, 0) : 0);
  const scen = (arr, side) => {
    const trig = arr.find((z) => Math.abs(z.d) <= 2.5) || arr[0]; if (!trig) return null;
    const tgt = arr.find((z) => side * (z.p - trig.p) / px * 100 >= 0.6 && z.stars >= 3) || null;
    const fuel = tgt ? liqBetween(trig.p, tgt.p, side) : 0, notes = [];
    if (fuel > 0) notes.push(`${usd(fuel)} of estimated ${side > 0 ? "short" : "long"} liquidations sit between them`);
    if (tgt && tgt.pool) notes.push(`equal ${side > 0 ? "highs" : "lows"} at the target: stops resting there`);
    if (gam && ok(gam.flip)) { if (side < 0 && trig.p <= gam.flip) notes.push("below the GEX flip dealers chase moves, so drops can run"); if (side > 0 && px < gam.flip && trig.p >= gam.flip) notes.push("reclaiming the GEX flip calms volatility, so a grind is likelier than a spike"); }
    if (side > 0 && dreg.key === "sfuel") notes.push("shorts are crowded (negative funding, rising OI): squeeze risk");
    if (side < 0 && dreg.key === "lcrowd") notes.push("longs are crowded (hot funding, rising OI): flush risk");
    const st4 = st["4h"]; if (st4 && ok(st4.chochLv) && Math.abs(st4.chochLv - trig.p) / px < 0.004) notes.push(`it is also the 4h ${st4.trend > 0 ? "protected low" : "protected high"}: a close through it flips 4h structure`);
    return { side, trig, tgt, fuel, notes, odds: trig.o24, tOdds: tgt ? tgt.o72 : null };
  };
  const scUp = scen(up, 1), scDn = scen(dn, -1);
  const mags = lv.filter((z) => z.stars >= 3 && Math.abs(z.d) <= 6).map((z) => ({ z, pull: z.stars + (z.liqUsd > 0 ? Math.log10(z.liqUsd / 1e6 + 1) * 1.5 : 0) + (z.pool ? 1 : 0) + (z.fvg ? 0.6 : 0) + (z.kinds.includes("gex") ? 0.6 : 0) }))
    .map((m) => ({ ...m, rank: m.pull * (m.z.o24 / 100) })).sort((x, y) => y.rank - x.rank).slice(0, 6);
  const rng = gam && ok(gam.em1) ? { half: gam.em1, src: "options" } : ok(sig) ? { half: (sig / 100) * Math.sqrt(24) * px, src: "recent volatility" } : null;
  const squeeze = ["1h", "4h"].filter((tf) => reg[tf] && reg[tf].key === "squeeze");
  const coil = squeeze.length ? { tfs: squeeze, lev: ok(oi4) && oi4 > 1, txt: `${squeeze.join(" and ")} volatility is coiled (Bollinger width in the bottom 15% of the last 150 bars)${ok(oi4) && oi4 > 1 ? ` while open interest built ${pct(oi4)} in 4h` : ""}. A large move usually follows; the side that breaks first tends to run.` } : null;

  const v = { px, reg, st, conf, dreg, gam, lv, up, dn, scUp, scDn, mags, sig, rng, coil, t: Date.now() };
  SIGC = { key, v }; sigTrack(v); return v;
}

/* ---------- change log ---------- */
function sigTrack(v) {
  const cur = { px: v.px, conf: v.conf.score >= 22 ? 1 : v.conf.score <= -22 ? -1 : 0, gam: v.gam ? v.gam.pos : null, dreg: v.dreg.key, rg: {}, ev: {}, tr: {}, lv: v.lv.filter((z) => z.stars >= 4).map((z) => [Math.round(z.p), z.labels[0], z.stars]) };
  SIG_TFS.forEach((tf) => { if (v.reg[tf]) cur.rg[tf] = v.reg[tf].key; const s = v.st[tf]; if (s) { cur.tr[tf] = s.trend; if (s.lastEv) cur.ev[tf] = s.lastEv.t + ":" + s.lastEv.type + ":" + s.lastEv.dir; } });
  const P = SIGSTATE, add = [], now = Date.now();
  if (P) {
    ["30m", "1h", "4h", "1d"].forEach((tf) => {
      const s = v.st[tf]; if (s && s.lastEv && P.ev[tf] && P.ev[tf] !== cur.ev[tf] && s.lastEv.t * 1000 > now - 3 * 864e5) {
        const e = s.lastEv; add.push({ t: now, dir: e.dir, tf, kind: "struct", txt: `${tf} ${e.type === "CHoCH" ? "change of character" : "break of structure"} ${e.dir > 0 ? "up" : "down"}: closed ${e.dir > 0 ? "above" : "below"} ${n0(e.p)}${e.type === "CHoCH" ? `. ${tf} trend flips ${e.dir > 0 ? "up" : "down"}` : ""}` });
      }
      if (P.rg[tf] && cur.rg[tf] && P.rg[tf] !== cur.rg[tf] && tf !== "30m") add.push({ t: now, dir: v.reg[tf].dir, tf, kind: "regime", txt: `${tf} regime: ${sigRegName(P.rg[tf])} → ${v.reg[tf].label}` });
    });
    if (P.conf !== cur.conf) add.push({ t: now, dir: cur.conf, kind: "conf", txt: `Confluence ${cur.conf ? `turned ${cur.conf > 0 ? "long" : "short"}` : "went neutral"} (${v.conf.score > 0 ? "+" : ""}${v.conf.score})` });
    if (P.gam != null && cur.gam != null && P.gam !== cur.gam) add.push({ t: now, dir: cur.gam ? 0 : 0, kind: "gamma", txt: `Gamma regime flipped ${cur.gam ? "positive (dealers dampen moves)" : "negative (moves can extend)"}` });
    if (P.dreg && P.dreg !== cur.dreg && cur.dreg !== "na" && P.dreg !== "na") add.push({ t: now, dir: v.dreg.dir, kind: "deriv", txt: `Positioning: ${v.dreg.label}` });
    if (ok(P.px)) (P.lv || []).forEach(([p, lab, s]) => { if ((P.px < p && v.px >= p) || (P.px > p && v.px <= p)) add.push({ t: now, dir: v.px >= p ? 1 : -1, kind: "level", txt: `Price crossed ${v.px >= p ? "above" : "below"} ${n0(p)} (${lab}, ${"★".repeat(s)})` }); });
  }
  SIGSTATE = cur; LS.set("sigState", cur);
  if (add.length) {
    SIGLOG = [...add, ...SIGLOG].slice(0, 120); LS.set("sigLog", SIGLOG);
    if (P) add.slice(0, 3).forEach(sigToast);
  }
}
const sigRegName = (k) => ({ up: "Trending up", down: "Trending down", range: "Range", squeeze: "Squeeze", expand: "Volatile expansion", trans: "Transition" }[k] || k);
function sigToast(e) {
  if (ST.sigToast) {
    let box = $("#toasts"); if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.appendChild(box); }
    const d = document.createElement("div"); d.className = "toast " + vcls(e.dir); d.innerHTML = `<b>${e.tf ? e.tf + " · " : ""}Signal</b><span>${esc(e.txt)}</span>`;
    d.addEventListener("click", () => { setTab("now"); d.remove(); }); box.appendChild(d); setTimeout(() => d.classList.add("out"), 6500); setTimeout(() => d.remove(), 7200);
  }
  if (ST.sigNotif && document.hidden && "Notification" in window && Notification.permission === "granted") {
    try { navigator.serviceWorker && navigator.serviceWorker.ready ? navigator.serviceWorker.ready.then((r) => r.showNotification("BTC signal", { body: e.txt, tag: "sig" + e.kind })) : new Notification("BTC signal", { body: e.txt }); } catch (x) {}
  }
}
function sigUnseen() { const seen = LS.get("sigSeen", 0); return SIGLOG.filter((e) => e.t > seen).length; }
function sigBadge() {
  const m = document.querySelector('.mtab[data-main="signals"]'); if (!m) return; const n = sigUnseen(); let d = m.querySelector(".nbadge");
  if (n && !d) { d = document.createElement("span"); d.className = "nbadge mb"; m.appendChild(d); } if (d) { if (n) d.textContent = n > 9 ? "9+" : n; else d.remove(); }
}

/* ---------- small pieces ---------- */
const stars = (n) => `<span class="stars" title="${n} of 5">${"★".repeat(n)}<i>${"★".repeat(5 - n)}</i></span>`;
const oddsTag = (p) => (ok(p) ? `<span class="odds ${p >= 60 ? "hi" : p >= 30 ? "md" : "lo"}">${Math.round(p)}%</span>` : "–");
const agoS = (t) => { const h = (Date.now() / 1000 - t) / 3600; return h >= 48 ? `${Math.round(h / 24)}d ago` : ago(t * 1000); };
const KIND = { zone: "Zone", struct: "Structure", pool: "Stops", fvg: "FVG", ob: "Order block", liq: "Liquidations", gex: "GEX", fib: "Fib", vp: "Volume", hl: "Week/month", round: "Round", my: "Mine", cw: "CoinWise" };
function gaugeSVG(score, label) {
  const W = 220, H = 128, cx = 110, cy = 112, r = 92, C = chartColors(), ang = (v) => Math.PI * (1 - (v + 100) / 200);
  const P = (v, rr) => [cx + rr * Math.cos(ang(v)), cy - rr * Math.sin(ang(v))];
  const arc = (v0, v1, col, w) => { const [x0, y0] = P(v0, r), [x1, y1] = P(v1, r); return `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" stroke="${col}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`; };
  const sv = Math.max(-100, Math.min(100, score)), [mx, my] = P(sv, r), col = score > 9 ? C.up : score < -9 ? C.dn : cssv("--fg");
  return `<svg class="gauge" viewBox="0 0 ${W} ${H}" aria-label="Confluence ${score}">${arc(-100, -35, C.dn, 12)}${arc(-33, 33, C.fg3, 12).replace('stroke-width="12"', 'stroke-width="12" opacity=".35"')}${arc(35, 100, C.up, 12)}
    <circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="11" fill="${cssv("--panel")}" stroke="${cssv("--fg")}" stroke-width="4"/>
    <text x="${cx}" y="${cy - 10}" text-anchor="middle" font-size="38" font-weight="700" fill="${col}">${score > 0 ? "+" : ""}${score}</text>
    <text x="14" y="${H - 2}" font-size="11" fill="${C.fg3}">Short</text><text x="${W - 14}" y="${H - 2}" font-size="11" fill="${C.fg3}" text-anchor="end">Long</text></svg>`;
}
const cellCls = (v) => (!ok(v) ? "c0 na" : v >= 0.6 ? "c2" : v >= 0.2 ? "c1" : v <= -0.6 ? "c-2" : v <= -0.2 ? "c-1" : "c0");
const cellTxt = (v) => (!ok(v) ? "·" : v >= 0.2 ? "▲" : v <= -0.2 ? "▼" : "–");
function structLine(s) {
  if (!s) return `<span class="mut">loading</span>`;
  const tr = s.trend > 0 ? `<b class="up">Bullish</b>` : s.trend < 0 ? `<b class="dn">Bearish</b>` : `<b class="mut">No trend</b>`, e = s.lastEv;
  return `${tr}${e ? ` <span class="mut">· ${e.type} ${e.dir > 0 ? "↑" : "↓"} ${agoS(e.t)}</span>` : ""}`;
}
function sigEvTxt(e) { return `<b>${e.type === "CHoCH" ? "CHoCH" : "BOS"}</b> ${e.dir > 0 ? "up" : "down"} · closed ${e.dir > 0 ? "above" : "below"} ${n0(e.p)}${e.from && e.from.length === 2 ? ` (${e.from})` : ""}`; }

/* ---------- renderers ---------- */
function drawSigNow(a) {
  const el = $("#sigHero"); if (!el) return; const v = sigCompute(a);
  if (!v) { el.innerHTML = `<div class="unavail">Loading candles for signals…</div>`; return; }
  const c = v.conf, r4 = v.reg["4h"], r1 = v.reg["1h"], s4 = v.st["4h"], s30 = v.st["30m"], s1 = v.st["1h"];
  const tile = (cap, main, sub, extra = "") => `<div class="htile${extra}"><span>${cap}</span><b>${main}</b><small>${sub}</small></div>`;
  let range = "";
  if (v.rng) { const lo = v.px - v.rng.half, hi = v.px + v.rng.half, inside = v.lv.filter((z) => z.p > lo && z.p < hi && z.stars >= 4).slice(0, 6);
    range = `<div class="erng"><div class="erc"><span>Expected 24h range · ${v.rng.src}</span><b>${n0(lo)} – ${n0(hi)}</b><small>±$${n0(v.rng.half)} (${pct((v.rng.half / v.px) * 100, 1).replace("+", "±")})</small></div>
      <div class="erbar"><i class="now" style="left:50%"></i>${inside.map((z) => `<i class="lv ${z.side > 0 ? "r" : "s"}" style="left:${(((z.p - lo) / (hi - lo)) * 100).toFixed(1)}%" title="${n0(z.p)} ${esc(z.labels[0])}"></i>`).join("")}</div>
      <div class="erl"><span>${n0(lo)}</span><span>now ${n0(v.px)}</span><span>${n0(hi)}</span></div></div>`; }
  el.innerHTML = `<div class="hero">
    <div class="hg">${gaugeSVG(c.score)}<div class="hgl"><b class="${vcls(c.score)}">${esc(c.label)}</b><span>${c.agree} of ${c.n} signals agree · ${c.against} against</span></div></div>
    <div class="htiles">
      ${tile("Regime · 4h", r4 ? esc(r4.label) : "–", r1 ? `1h ${esc(r1.label.toLowerCase())}` : "", r4 ? " rg-" + r4.key : "")}
      ${tile("Structure · 4h", structLine(s4), `1h ${s1 ? (s1.trend > 0 ? "bull" : s1.trend < 0 ? "bear" : "flat") : "–"} · 30m ${s30 ? (s30.trend > 0 ? "bull" : s30.trend < 0 ? "bear" : "flat") : "–"}`)}
      ${tile("Positioning", esc(v.dreg.label), v.gam ? `${v.gam.pos ? "Positive" : "Negative"} gamma${ok(v.gam.flip) ? ` · flip ${kfmt(v.gam.flip)}` : ""}` : "gamma loading")}
    </div>
    <p class="hins">${esc(c.insight)}</p>${v.coil ? `<p class="hcoil">⚡ ${esc(v.coil.txt)}</p>` : ""}${range}</div>`;
  drawMoves(v, "#sigMoves", false);
  drawSigLog(5, "#sigLogNow");
  LS.set("sigSeen", Date.now()); sigBadge();
}
function moveCard(s, full) {
  if (!s) return "";
  const side = s.side > 0, t = s.trig, g = s.tgt;
  return `<div class="mvc ${side ? "up" : "dn"}"><div class="mvh"><b>${side ? "▲ Upside move" : "▼ Downside move"}</b>${oddsTag(s.odds)}<small>odds of tagging the trigger in 24h</small></div>
    <div class="mvp"><div><span>Trigger</span><b>${n0(t.p)}</b><small>${distTxt(t.p, SIGC.v.px)} · ${stars(t.stars)}</small></div><div class="mva">→</div><div><span>Target</span><b>${g ? n0(g.p) : "next leg"}</b><small>${g ? `${distTxt(g.p, SIGC.v.px)} · ${stars(g.stars)}` : "no strong level within 12%"}</small></div></div>
    <div class="mvw">${esc(t.labels.slice(0, 3).join(" · "))}</div>
    ${s.notes.length ? `<ul class="mvn">${s.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
    ${full && g ? `<div class="mut" style="font-size:12px">Odds of reaching the target within 3 days: ${oddsTag(s.tOdds)}</div>` : ""}</div>`;
}
function drawMoves(v, sel, full) {
  const el = $(sel); if (!el) return;
  el.innerHTML = `<div class="mvs">${moveCard(v.scUp, full) || `<div class="unavail">No strong resistance found above</div>`}${moveCard(v.scDn, full) || `<div class="unavail">No strong support found below</div>`}</div>
    <div class="src">Trigger = the nearest strong level (3★+) within 2.5%. Target = the next strong level beyond it. Odds are from the last 3 days of hourly volatility as a random walk, nudged a little toward the confluence lean. Estimates, not predictions.</div>`;
}
function drawSigLog(n, sel) {
  const el = $(sel); if (!el) return; const L = SIGLOG.slice(0, n || 60);
  el.innerHTML = L.length ? `<div class="slog">${L.map((e) => `<div class="sle"><span class="sld ${vcls(e.dir)}"></span><span class="slt">${new Date(e.t).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}</span><span>${esc(e.txt)}</span></div>`).join("")}</div>`
    : `<div class="unavail">Nothing has changed since this page started watching. Structure breaks, regime flips, confluence flips and key levels crossed will show up here (and as a pop-up while the page is open).</div>`;
}
function drawRegime(a) {
  const v = sigCompute(a), el = $("#rgGrid"); if (!el) return;
  if (!v) { el.innerHTML = `<div class="unavail">Loading…</div>`; return; }
  const c = v.conf;
  $("#cfHead").innerHTML = `<div class="cfh">${gaugeSVG(c.score)}<div><b class="${vcls(c.score)}" style="font-size:18px">${esc(c.label)}</b><div class="sub">${c.agree} agree · ${c.against} against · higher timeframes ${c.htf > 0.2 ? "<b class=up>up</b>" : c.htf < -0.2 ? "<b class=dn>down</b>" : "flat"} · lower timeframes ${c.ltf > 0.2 ? "<b class=up>up</b>" : c.ltf < -0.2 ? "<b class=dn>down</b>" : "flat"}</div><p class="hins" style="margin:8px 0 0">${esc(c.insight)}</p></div></div>`;
  $("#cfGrid").innerHTML = `<table class="cfg"><thead><tr><th></th>${SIG_TFS.map((tf) => `<th>${tf}</th>`).join("")}</tr></thead><tbody>
    ${c.grid.map((r) => `<tr><td class="l"><b>${r.name}</b><small>${r.why}</small></td>${r.cells.map((x) => `<td class="${cellCls(x)}">${cellTxt(x)}</td>`).join("")}</tr>`).join("")}
    <tr class="cfavg"><td class="l"><b>Timeframe total</b></td>${c.tfAvg.map((x) => `<td class="${cellCls(x)}">${ok(x) ? (x > 0 ? "+" : "") + Math.round(x * 100) : "·"}</td>`).join("")}</tr></tbody></table>
    <div class="cfnow">${c.now.map((x) => `<div class="cfn ${cellCls(x.v)}"><b>${x.name}</b><span>${ok(x.v) ? (x.v >= 0.2 ? "▲ Long" : x.v <= -0.2 ? "▼ Short" : "– Neutral") : "· No data"}</span><small>${esc(x.why)}</small></div>`).join("")}</div>`;
  el.innerHTML = ["30m", "1h", "4h", "1d"].map((tf) => { const r = v.reg[tf]; if (!r) return `<div class="panel"><div class="unavail">${tf}: loading</div></div>`;
    const bar = (lab, val, max, txt) => `<div class="rgb"><span>${lab}</span><i><b style="width:${Math.max(2, Math.min(100, (val / max) * 100)).toFixed(0)}%"></b></i><em>${txt}</em></div>`;
    return `<div class="panel rgc rg-${r.key}"><div class="ph"><span class="pt">${tf}</span><span class="rgl">${esc(r.label)}</span></div>
      ${bar("Trend strength (ADX)", r.adx, 50, ok(r.adx) ? r.adx.toFixed(0) : "–")}${bar("Efficiency", r.er * 100, 100, ok(r.er) ? (r.er * 100).toFixed(0) + "%" : "–")}
      ${bar("Band width vs 150 bars", r.bwPct, 100, ok(r.bwPct) ? `${r.bwPct.toFixed(0)}th pct` : "–")}${bar("Volatility (ATR) vs 150 bars", r.atrPct, 100, ok(r.atrPct) ? `${r.atrPct.toFixed(0)}th pct` : "–")}
      <div class="sub" style="margin-top:6px">${r.key === "range" || r.key === "squeeze" ? `30-bar range <b>${n0(r.lo30)} – ${n0(r.hi30)}</b>. ` : ""}${esc(r.play)}</div></div>`; }).join("");
  const d = v.dreg, g = v.gam;
  $("#rgDeriv").innerHTML = `<div class="two"><div class="panel"><div class="ph"><span class="pt">Leverage regime</span></div><div class="big ${vcls(d.dir)}" style="font-size:18px">${esc(d.label)}</div><div class="sub">${esc(d.txt || "")}</div>${ok(d.oi24) ? `<div class="sub">OI 24h <b class="${cls(d.oi24)}">${pct(d.oi24)}</b></div>` : ""}<div class="src">OKX open interest (all BTC contracts), Binance spot price and CVD over 4h, funding across venues.</div></div>
    <div class="panel"><div class="ph"><span class="pt">Gamma regime</span></div>${g ? `<div class="big ${g.pos ? "up" : "dn"}" style="font-size:18px">${g.pos ? "Positive gamma" : "Negative gamma"}</div><div class="sub">${g.pos ? "Dealers sell rips and buy dips: ranges, pinning, failed breakouts." : "Dealers chase the move: trends extend, wicks run further."}${ok(g.flip) ? ` Flip at <b>${n0(g.flip)}</b> (${distTxt(g.flip, v.px)}).` : ""}</div>` : `<div class="unavail">Waiting for Deribit options</div>`}<div class="src">From Deribit options open interest. Full detail in Flow → Options.</div></div></div>`;
}
function structSVG(k, s, lv) {
  const el = $("#stChart"), W = Math.max(340, Math.min(1100, (el && el.clientWidth) || 640)), H = W < 500 ? 330 : 340, n = Math.min(k.length, W < 500 ? 80 : 140), K = k.slice(-n), off = k.length - n, C = chartColors(), pr = 80, pt = 10, pb = 18;
  const lo = Math.min(...K.map((x) => x.l)), hi = Math.max(...K.map((x) => x.h)), pad = (hi - lo) * 0.06, y0 = lo - pad, y1 = hi + pad;
  const X = (i) => ((i - off + 0.5) / n) * (W - pr), Y = (p) => pt + (1 - (p - y0) / (y1 - y0)) * (H - pt - pb), bw = Math.max(1.5, ((W - pr) / n) * 0.62);
  const inR = (p) => p >= y0 && p <= y1, out = [];
  s.fvg.forEach((f) => { if (f.i >= off) out.push(`<rect x="${X(f.i).toFixed(1)}" y="${Y(f.top).toFixed(1)}" width="${(W - pr - X(f.i)).toFixed(1)}" height="${Math.max(1.5, Y(f.bot) - Y(f.top)).toFixed(1)}" fill="${f.dir > 0 ? C.up : C.dn}" opacity=".13"/>`); });
  s.ob.forEach((o) => { if (o.i >= off) out.push(`<rect x="${X(o.i).toFixed(1)}" y="${Y(o.top).toFixed(1)}" width="${(W - pr - X(o.i)).toFixed(1)}" height="${Math.max(1.5, Y(o.bot) - Y(o.top)).toFixed(1)}" fill="none" stroke="${o.dir > 0 ? C.up : C.dn}" stroke-dasharray="2 3" opacity=".7"/>`); });
  K.forEach((x, j) => { const i = j + off, col = x.c >= x.o ? C.up : C.dn; out.push(`<line x1="${X(i).toFixed(1)}" x2="${X(i).toFixed(1)}" y1="${Y(x.h).toFixed(1)}" y2="${Y(x.l).toFixed(1)}" stroke="${col}" opacity=".7"/><rect x="${(X(i) - bw / 2).toFixed(1)}" y="${Y(Math.max(x.o, x.c)).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, Math.abs(Y(x.o) - Y(x.c))).toFixed(1)}" fill="${col}"/>`); });
  s.ev.filter((e) => e.i >= off).forEach((e) => { const src = e.dir > 0 ? s.swings.hi : s.swings.lo, sw = [...src].reverse().find((q) => q.i < e.i && Math.abs(q.p - e.p) < 1e-6) || { i: Math.max(off, e.i - 8) };
    const col = e.type === "CHoCH" ? cssv("--warn") : e.dir > 0 ? C.up : C.dn, xa = X(Math.max(off, sw.i)), xb = X(e.i);
    out.push(`<line x1="${xa.toFixed(1)}" x2="${xb.toFixed(1)}" y1="${Y(e.p).toFixed(1)}" y2="${Y(e.p).toFixed(1)}" stroke="${col}" stroke-width="1.4" stroke-dasharray="4 3"/><text x="${((xa + xb) / 2).toFixed(1)}" y="${(Y(e.p) + (e.dir > 0 ? -4 : 12)).toFixed(1)}" font-size="11" font-weight="700" fill="${col}" text-anchor="middle">${e.type}</text>`); });
  [...s.swings.hi, ...s.swings.lo].filter((q) => q.i >= off && q.lab.length === 2).forEach((q) => out.push(`<text x="${X(q.i).toFixed(1)}" y="${(q.kind === "H" ? Y(q.p) - 5 : Y(q.p) + 13).toFixed(1)}" font-size="10" fill="${C.fg3}" text-anchor="middle">${q.lab}</text>`));
  s.pools.forEach((q) => { if (inR(q.p)) out.push(`<line x1="0" x2="${W - pr}" y1="${Y(q.p).toFixed(1)}" y2="${Y(q.p).toFixed(1)}" stroke="${cssv("--purple")}" stroke-dasharray="1 3" stroke-width="1.5"/><text x="${W - pr - 4}" y="${(Y(q.p) - 3).toFixed(1)}" font-size="10" fill="${cssv("--purple")}" text-anchor="end">EQ${q.side > 0 ? "H" : "L"} · stops</text>`); });
  const tags = [];
  if (ok(s.bosLv) && inR(s.bosLv)) tags.push([s.bosLv, s.trend > 0 ? C.up : C.dn, "BOS"]);
  if (ok(s.chochLv) && inR(s.chochLv)) tags.push([s.chochLv, cssv("--warn"), "CHoCH"]);
  tags.forEach(([p, col, t]) => out.push(`<line x1="0" x2="${W - pr}" y1="${Y(p).toFixed(1)}" y2="${Y(p).toFixed(1)}" stroke="${col}" opacity=".5"/><rect x="${W - pr + 2}" y="${(Y(p) - 8).toFixed(1)}" width="${pr - 4}" height="16" rx="4" fill="${col}"/><text x="${W - pr / 2}" y="${(Y(p) + 4).toFixed(1)}" font-size="10.5" font-weight="700" fill="#000" text-anchor="middle">${t} ${kfmt(p)}</text>`));
  const pxl = k[k.length - 1].c; out.push(`<line x1="0" x2="${W - pr}" y1="${Y(pxl).toFixed(1)}" y2="${Y(pxl).toFixed(1)}" stroke="${cssv("--fg")}" stroke-dasharray="2 2" opacity=".6"/><text x="${W - pr + 4}" y="${(Y(pxl) + 4).toFixed(1)}" font-size="11" fill="${cssv("--fg")}">${n0(pxl)}</text>`);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block" aria-label="Structure chart">${out.join("")}</svg>`;
}
function drawStruct(a) {
  const v = sigCompute(a), el = $("#stTbl"); if (!el) return;
  if (!v) { el.innerHTML = `<div class="unavail">Loading…</div>`; return; }
  el.innerHTML = `<table><thead><tr><th class="l">TF</th><th class="l">Trend · swings</th><th>Next BOS</th><th>CHoCH at</th></tr></thead><tbody>${SIG_TFS.map((tf) => { const s = v.st[tf]; if (!s) return `<tr><td class="l">${tf}</td><td colspan="3" class="l mut">loading</td></tr>`;
    return `<tr><td class="l"><b>${tf}</b></td><td class="l">${s.trend > 0 ? `<b class="up">Bullish</b>` : s.trend < 0 ? `<b class="dn">Bearish</b>` : `<span class="mut">None</span>`}${s.run > 1 ? ` <span class="mut">×${s.run}</span>` : ""}<span class="stsq">${s.seq.slice(-4).join(" ")}</span></td><td>${ok(s.bosLv) ? `${n0(s.bosLv)}<div class="mut" style="font-size:11px">${distTxt(s.bosLv, v.px)}</div>` : "–"}</td><td class="wn">${ok(s.chochLv) ? `${n0(s.chochLv)}<div class="mut" style="font-size:11px">${distTxt(s.chochLv, v.px)}</div>` : "–"}</td></tr>`; }).join("")}</tbody></table>`;
  $("#stSeg").innerHTML = SIG_TFS.map((tf) => `<button data-sigtf="${tf}" aria-pressed="${ST.sigTf === tf}">${tf}</button>`).join("");
  const s = v.st[ST.sigTf], k = D.taK[ST.sigTf];
  $("#stChart").innerHTML = s && k ? structSVG(k, s) : `<div class="unavail">Loading…</div>`;
  $("#stRead").innerHTML = s ? stRead(s, v.px) : "";
  const evs = SIG_TFS.flatMap((tf) => (v.st[tf] ? v.st[tf].ev : [])).filter((e) => e.t * 1000 > Date.now() - 4 * 864e5 && e.tf !== "15m").sort((x, y) => y.t - x.t).slice(0, 24);
  $("#stEvents").innerHTML = evs.length ? `<div class="slog">${evs.map((e) => `<div class="sle"><span class="sld ${e.type === "CHoCH" ? "wn" : vcls(e.dir)}"></span><span class="slt">${new Date(e.t * 1000).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}</span><span><b>${e.tf}</b> ${sigEvTxt(e)}</span></div>`).join("")}</div>` : `<div class="unavail">No breaks in the last 4 days</div>`;
  const items = [];
  ["1h", "4h", "1d"].forEach((tf) => { const x = v.st[tf]; if (!x) return;
    x.pools.forEach((q) => items.push({ p: q.p, txt: `${tf} equal ${q.side > 0 ? "highs" : "lows"} (${q.n} touches): stop orders rest just ${q.side > 0 ? "above" : "below"}. A sweep through and back is a classic reversal tell.`, c: "pool" }));
    x.fvg.forEach((f) => items.push({ p: f.mid, txt: `${tf} ${f.dir > 0 ? "bullish" : "bearish"} fair value gap ${n0(f.bot)} – ${n0(f.top)} (${f.size.toFixed(2)}%): price often returns to fill it.`, c: f.dir > 0 ? "up" : "dn" }));
    if (tf !== "1d") x.ob.forEach((o) => items.push({ p: o.mid, txt: `${tf} ${o.dir > 0 ? "bullish" : "bearish"} order block ${n0(o.bot)} – ${n0(o.top)}: last ${o.dir > 0 ? "down" : "up"} candle before the ${o.from}. Often defended on the first retest.`, c: o.dir > 0 ? "up" : "dn" }));
  });
  items.sort((x, y) => Math.abs(x.p - v.px) - Math.abs(y.p - v.px));
  $("#stZones").innerHTML = items.length ? items.slice(0, 14).map((x) => `<div class="stz"><b class="${x.c === "pool" ? "pu" : x.c}">${n0(x.p)}</b><span class="mut">${distTxt(x.p, v.px)}</span><span>${esc(x.txt)}</span></div>`).join("") : `<div class="unavail">No open gaps, order blocks or equal highs/lows nearby</div>`;
  drawSigLog(40, "#sigLogFull");
}
function stRead(s, px) {
  const out = [];
  if (s.trend > 0) out.push(`<b class="up">Bullish structure</b>${s.run > 1 ? ` (${s.run} breaks up in a row)` : ""}. ${ok(s.bosLv) ? `A close above <b>${n0(s.bosLv)}</b> continues it (BOS). ` : ""}${ok(s.chochLv) ? `A close below <b>${n0(s.chochLv)}</b>, the protected low, would be a change of character and flip it bearish.` : ""}`);
  else if (s.trend < 0) out.push(`<b class="dn">Bearish structure</b>${s.run > 1 ? ` (${s.run} breaks down in a row)` : ""}. ${ok(s.bosLv) ? `A close below <b>${n0(s.bosLv)}</b> continues it (BOS). ` : ""}${ok(s.chochLv) ? `A close above <b>${n0(s.chochLv)}</b>, the protected high, would be a change of character and flip it bullish.` : ""}`);
  else out.push("No clear structure yet.");
  if (s.lastEv) out.push(`Last break: ${sigEvTxt(s.lastEv)}, ${agoS(s.lastEv.t)}.`);
  if (ok(s.chochLv) && Math.abs(s.chochLv - px) / px < 0.004) out.push(`<b class="wn">Price is sitting on the CHoCH level</b>: a structure flip is close.`);
  return out.join(" ");
}
function drawLevels(a) {
  const v = sigCompute(a), el = $("#lvTbl"); if (!el) return;
  if (!v) { el.innerHTML = `<div class="unavail">Loading…</div>`; return; }
  drawMoves(v, "#lvMoves", true);
  $("#lvMags").innerHTML = v.mags.length ? v.mags.map((m) => { const z = m.z; return `<div class="mag ${z.side > 0 ? "r" : "s"}"><div class="magp"><b>${n0(z.p)}</b><span class="mut">${distTxt(z.p, v.px)}</span>${stars(z.stars)}</div><div class="mago"><span>24h ${oddsTag(z.o24)}</span><span>3d ${oddsTag(z.o72)}</span></div><div class="magw">${esc(z.labels.slice(0, 4).join(" · "))}${z.liqUsd ? ` · <b>${usd(z.liqUsd)}</b> liquidations` : ""}</div></div>`; }).join("")
    : `<div class="unavail">No strong levels within 6%</div>`;
  const rows = v.lv.filter((z) => Math.abs(z.d) <= 7).sort((x, y) => y.p - x.p), C = chartColors();
  // ladder
  const W = 640, H = 420, lo = v.px * 0.95, hi = v.px * 1.05, Y = (p) => 10 + (1 - (p - lo) / (hi - lo)) * (H - 20);
  const lad = rows.filter((z) => z.p > lo && z.p < hi && z.stars >= 2).map((z) => { const w = 40 + z.stars * 44, col = z.side > 0 ? C.dn : C.up;
    return `<rect x="${W / 2 - w / 2}" y="${(Y(z.p) - 2.5).toFixed(1)}" width="${w}" height="5" rx="2.5" fill="${col}" opacity="${0.25 + z.stars * 0.15}"/><text x="${W / 2 + w / 2 + 8}" y="${(Y(z.p) + 4).toFixed(1)}" font-size="12" fill="${cssv("--fg")}">${n0(z.p)} <tspan fill="${C.fg3}">${esc(z.labels[0]).slice(0, 34)}</tspan></text>`; }).join("");
  $("#lvLadder").innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;max-height:520px">${lad}<line x1="40" x2="${W - 40}" y1="${Y(v.px)}" y2="${Y(v.px)}" stroke="${cssv("--acc")}" stroke-width="2"/><rect x="2" y="${Y(v.px) - 10}" width="74" height="20" rx="6" fill="${cssv("--acc")}"/><text x="39" y="${Y(v.px) + 4}" font-size="12" font-weight="700" fill="#000" text-anchor="middle">${n0(v.px)}</text><text x="4" y="22" font-size="11" fill="${C.fg3}">+5%</text><text x="4" y="${H - 8}" font-size="11" fill="${C.fg3}">−5%</text></svg>`;
  el.innerHTML = `<table><thead><tr><th>Price</th><th>Dist</th><th class="l">Strength</th><th class="l">What's there</th><th>24h</th></tr></thead><tbody>${rows.map((z) => `<tr class="${z.side > 0 ? "lvr" : "lvs"}"><td><b>${n0(z.p)}</b></td><td class="${z.side > 0 ? "dn" : "up"}">${distTxt(z.p, v.px)}</td><td class="l">${stars(z.stars)}</td><td class="l wrap">${z.kinds.map((k) => `<span class="kchip k-${k}">${KIND[k] || k}</span>`).join("")}<div class="mut" style="font-size:11.5px">${esc(z.labels.slice(0, 4).join(" · "))}</div></td><td>${oddsTag(z.o24)}</td></tr>`).join("")}</tbody></table>`;
}
function drawBriefStrip(a) {
  const el = $("#briefStrip"); if (!el) return; const v = sigCompute(a);
  if (!v) { el.innerHTML = `<span class="mut">Building signals…</span>`; return; }
  const r = v.reg["30m"], s = v.st["30m"], up = v.up[0], dn = v.dn[0];
  el.innerHTML = `<button class="bsx" data-goto="now"><span class="bsi"><i>30m</i>${r ? esc(r.label) : "–"}</span><span class="bsi"><i>Structure</i>${s ? (s.trend > 0 ? "<b class=up>bull</b>" : s.trend < 0 ? "<b class=dn>bear</b>" : "flat") : "–"}</span>${up ? `<span class="bsi"><i>R</i><b class="dn">${n0(up.p)}</b> ${"★".repeat(up.stars)}</span>` : ""}${dn ? `<span class="bsi"><i>S</i><b class="up">${n0(dn.p)}</b> ${"★".repeat(dn.stars)}</span>` : ""}<span class="bsgo">›</span></button>`;
}

/* ---------- Trade brief uses the ranked level map ---------- */
briefLevels = function (a) {
  const v = sigCompute(a); if (!v) return { above: [], below: [] };
  const map = (z) => ({ p: z.p, lo: z.lo, hi: z.hi, w: z.score, names: z.labels, my: z.kinds.includes("my"), gex: z.kinds.includes("gex"), d: z.d, str: z.stars >= 5 ? 3 : z.stars >= 3 ? 2 : 1 });
  const ok2 = (z) => z.stars >= 2 && Math.abs(z.d) >= 0.04;
  return { above: v.lv.filter((z) => z.side > 0 && ok2(z)).sort((x, y) => x.p - y.p).slice(0, 3).map(map), below: v.lv.filter((z) => z.side < 0 && ok2(z)).sort((x, y) => y.p - x.p).slice(0, 3).map(map) };
};

/* ---------- wiring ---------- */
const _dSig = drawStage2;
drawStage2 = function (tab) {
  _dSig(tab);
  try {
    const a = analysis();
    if (tab === "now") drawSigNow(a);
    if (tab === "regime") drawRegime(a);
    if (tab === "struct") drawStruct(a);
    if (tab === "levels") drawLevels(a);
    if (tab === "overview") drawBriefStrip(a);
    const v = a ? sigCompute(a) : null, hl = $("#hLean"); if (v && hl) hl.innerHTML = `<button class="hlb" data-goto="regime">${tag(v.conf.label, v.conf.score)}<b class="${vcls(v.conf.score)}">${v.conf.score > 0 ? "+" : ""}${v.conf.score}</b></button>`;
    sigBadge();
  } catch (e) { console.error(e); }
};
document.addEventListener("click", (e) => { const b = e.target.closest("[data-sigtf]"); if (b) { ST.sigTf = b.dataset.sigtf; LS.set("sigTf", ST.sigTf); render(); } });
