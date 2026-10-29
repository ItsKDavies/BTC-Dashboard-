"use strict";
/* ===================== Stage 4: pattern cards, mood bars, OI stack, economic calendar ===================== */
ST.posTf = LS.get("posTf", "1H");

/* ---------- mini chart with sloped lines (pattern cards) ---------- */
function miniChart(k, a, b, o = {}) {
  const C = chartColors(), W = o.W || 320, H = o.h || 170, pr = 66, pad = o.pad == null ? 6 : o.pad, n = b - a + 1 + pad, bars = k.slice(a, b + 1);
  const segs = (o.segs || []).map((s) => { const i0 = Math.max(a, s.i0), f = (i) => s.p0 + ((s.p1 - s.p0) * (i - s.i0)) / (s.i1 - s.i0 || 1); return { ...s, i0, p0: f(i0), p1: f(Math.min(s.i1, b + pad)), i1: Math.min(s.i1, b + pad) }; });
  const bh = bars.flatMap((x) => [x.h, x.l]), bLo = Math.min(...bh), bHi = Math.max(...bh), near = (p) => p >= bLo - (bHi - bLo) * 0.35 && p <= bHi + (bHi - bLo) * 0.35;
  const prices = [...bh, ...(o.hl || []).map((l) => l.p).filter((p) => ok(p) && near(p)), ...segs.flatMap((s) => [s.p0, s.p1]).filter(near)];
  let lo = Math.min(...prices), hi = Math.max(...prices); const pd = (hi - lo) * 0.07 || 10; lo -= pd; hi += pd;
  const cw = (W - pr) / n, X = (i) => (i - a + 0.5) * cw, Y = (p) => 8 + (1 - (p - lo) / (hi - lo)) * (H - 26), bw = Math.max(1.5, cw * 0.62);
  let s = `<svg width="100%" viewBox="0 0 ${W} ${H}" style="display:block" aria-hidden="true">`;
  if (o.box) s += `<rect x="${X(o.box.a) - cw / 2 - 2}" y="4" width="${(o.box.b - o.box.a + 1) * cw + 4}" height="${H - 22}" rx="6" fill="${rgba(C.warn, 0.1)}" stroke="${C.warn}" stroke-width="1.2" stroke-dasharray="4 3"/>`;
  bars.forEach((x, j) => { const i = a + j, col = x.c >= x.o ? C.up : C.dn, y1 = Y(Math.max(x.o, x.c)), y2 = Y(Math.min(x.o, x.c));
    s += `<line x1="${X(i)}" x2="${X(i)}" y1="${Y(x.h)}" y2="${Y(x.l)}" stroke="${col}" stroke-width="1"/><rect x="${X(i) - bw / 2}" y="${y1}" width="${bw}" height="${Math.max(1, y2 - y1)}" fill="${col}"/>`; });
  for (const l of o.hl || []) { if (!ok(l.p)) continue; const out = l.p > hi ? "▲ " : l.p < lo ? "▼ " : "", y = Math.max(8, Math.min(H - 20, Y(l.p))); if (out) { s += `<text x="${W - pr + 4}" y="${y + 4}" font-size="11" font-weight="600" fill="${l.color}">${out}${esc(l.label)}</text>`; continue; } s += `<line x1="0" x2="${W - pr}" y1="${y}" y2="${y}" stroke="${l.color}" stroke-width="1.2" stroke-dasharray="${l.dash || "4 3"}"/><text x="${W - pr + 4}" y="${y + 4}" font-size="11" font-weight="600" fill="${l.color}">${esc(l.label)}</text>`; }
  for (const g of segs) s += `<line x1="${X(g.i0)}" y1="${Y(g.p0)}" x2="${X(g.i1)}" y2="${Y(g.p1)}" stroke="${C[g.color] || g.color}" stroke-width="${g.w || 2}" stroke-linecap="round" opacity=".95"/>`;
  for (const d of o.dots || []) if (d.i >= a && d.i <= b) s += `<circle cx="${X(d.i)}" cy="${Y(d.p)}" r="3.5" fill="none" stroke="${C.fg}" stroke-width="1.5"/>`;
  s += `<text x="2" y="${H - 4}" font-size="11" fill="${C.fg3}">${fmtT(k[a].t, { month: "short", day: "numeric", hour: "numeric" })}</text><text x="${W - pr}" y="${H - 4}" font-size="11" fill="${C.fg3}" text-anchor="end">${fmtT(k[b].t, { hour: "numeric", minute: "2-digit" })}</text>`;
  return s + "</svg>";
}
const biasTag = (d) => tag(d > 0 ? "Bullish" : d < 0 ? "Bearish" : "Either way", d);
function cardW() { const w = cw("#patGeo"); return Math.max(280, Math.floor(w >= 700 ? (w - 12) / 2 : w) - 26); }

/* ---------- Patterns tab ---------- */
let GEO = { key: "", v: null };
function geoAll() {
  const key = SRC.taK.st.okAt; if (GEO.key === key) return GEO.v;
  const v = []; ["30m", "1h", "4h"].forEach((tf) => TA.geoPatterns(D.taK[tf], tf).forEach((p) => v.push(p)));
  GEO = { key, v }; return v;
}
function drawPatterns(a) {
  const C = chartColors(), W = cardW(), geo = geoAll();
  // summary strip
  $("#patSum").innerHTML = ["30m", "1h", "4h"].map((tf) => {
    const g = geo.filter((p) => p.tf === tf), c = (a.pats[tf] || []).filter((p) => p.ago <= 2 && p.dir && p.strength >= 2);
    const items = [...g.map((p) => `<span class="${vcls(p.dir)}">${p.name}</span>`), ...c.slice(0, 2).map((p) => `<span class="${vcls(p.dir)}">${p.name}</span>`)];
    return `<div class="psum"><b>${tf}</b><span>${items.length ? items.join(" · ") : '<span class="mut">No clear pattern</span>'}</span></div>`;
  }).join("");
  // chart patterns
  $("#patGeo").innerHTML = geo.length ? geo.map((p) => {
    const k = D.taK[p.tf].slice(0, -1), b = k.length - 1, a0 = Math.max(0, Math.min(p.i0 - 6, b - 40));
    const plan = [];
    if (ok(p.breakUp)) plan.push(`<span class="up">Bullish</span> on a close above <b>${n0(p.breakUp)}</b>${ok(p.tgtUp) ? ` → target <b>${n0(p.tgtUp)}</b>` : ""}`);
    if (ok(p.breakDn)) plan.push(`<span class="dn">Bearish</span> on a close below <b>${n0(p.breakDn)}</b>${ok(p.tgtDn) ? ` → target <b>${n0(p.tgtDn)}</b>` : ""}`);
    const hl = [];
    if (p.brk >= 0 && ok(p.tgtUp)) hl.push({ p: p.tgtUp, label: `T ${kfmt(p.tgtUp)}`, color: C.up, dash: "2 3" });
    if (p.brk <= 0 && ok(p.tgtDn)) hl.push({ p: p.tgtDn, label: `T ${kfmt(p.tgtDn)}`, color: C.dn, dash: "2 3" });
    return `<div class="panel pcard" style="border-color:${p.dir > 0 ? rgba(C.up, 0.5) : p.dir < 0 ? rgba(C.dn, 0.5) : C.line}">
      <div class="ph"><span class="pname">${p.name}</span><span class="tfb">${p.tf}</span><span style="margin-left:auto">${biasTag(p.dir)}</span></div>
      <div class="pstat ${p.brk > 0 ? "up" : p.brk < 0 ? "dn" : ""}">${p.status}</div>
      ${miniChart(k, a0, b, { W, h: 190, segs: p.lines, dots: p.touches, hl })}
      <div class="note" style="margin-top:6px">${p.why}</div>
      <div class="pplan">${plan.join("<br>")}</div></div>`;
  }).join("") : `<div class="panel unavail">No triangle, wedge, channel, flag or head and shoulders on 30m, 1h or 4h right now. Price isn't respecting clean trendlines.</div>`;
  // candle patterns: only meaningful, recent ones
  const cdl = []; ["30m", "4h"].forEach((tf) => (a.pats[tf] || []).filter((p) => p.ago <= 5 && (p.dir !== 0 || p.strength >= 2) && !(p.name === "Doji" && p.strength < 2)).slice(0, 4).forEach((p) => cdl.push({ ...p, tf })));
  $("#patCdl").innerHTML = cdl.length ? cdl.map((p) => {
    const k = D.taK[p.tf].slice(0, -1), b = k.length - 1, a0 = Math.max(0, p.i - 12), hl = [];
    if (ok(p.confirm)) hl.push({ p: p.confirm, label: p.dir > 0 ? `Go ${kfmt(p.confirm)}` : p.dir < 0 ? `Go ${kfmt(p.confirm)}` : `H ${kfmt(p.confirm)}`, color: p.dir < 0 ? C.dn : C.up });
    if (ok(p.invalid)) hl.push({ p: p.invalid, label: `No ${kfmt(p.invalid)}`, color: C.fg3 });
    return `<div class="panel pcard"><div class="ph"><span class="pname">${p.name}</span><span class="tfb">${p.tf}</span><span style="margin-left:auto">${biasTag(p.dir)}</span></div>
      <div class="pstat">${p.ago === 0 ? "Last closed candle" : p.ago === 1 ? "1 candle ago" : `${p.ago} candles ago`} · ${fmtT(p.t, { weekday: "short", hour: "numeric", minute: "2-digit" })}<span class="mut"> · strength ${"●".repeat(p.strength)}${"○".repeat(3 - p.strength)}${p.why.length ? " · " + esc(p.why.join(", ")) : ""}</span></div>
      ${miniChart(k, a0, Math.min(b, p.i + 4), { W, h: 160, pad: 3, box: { a: p.i - p.n + 1, b: p.i }, hl })}
      <div class="note" style="margin-top:6px">${esc(p.note)}.</div>
      <div class="pplan">${p.dir ? `Confirms on a close ${p.dir > 0 ? "above" : "below"} <b>${n0(p.confirm)}</b> · wrong if price ${p.dir > 0 ? "falls below" : "rises above"} <b>${n0(p.invalid)}</b>` : `Watch for a break of <b>${n0(p.lo)}–${n0(p.hi)}</b>`}</div></div>`;
  }).join("") : `<div class="panel unavail">No meaningful candle pattern on the last few 30m or 4h candles.</div>`;
  const dv = a.cps;
  $("#chartPats").innerHTML = dv.length ? `<div class="tw"><table><thead><tr><th>Signal</th><th class="l">TF</th><th class="l">Bias</th><th class="l">Detail</th><th>Level</th></tr></thead><tbody>${dv.map((p) => `<tr><td><b>${p.name}</b></td><td class="l">${p.tf}</td><td class="l">${biasTag(p.dir)}</td><td class="wrap">${esc(p.status)}</td><td>${n0(p.level)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="unavail">No double tops/bottoms or RSI/CVD divergences right now.</div>`;
}

/* ---------- market mood: color bars instead of dials ---------- */
function moodRow(title, v, min, max, cols, txt, sub) {
  const C = chartColors(), p = ok(v) ? Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100)) : null, cc = { r: C.dn, y: C.warn, g: C.up };
  const segs = cols.map((c, i) => `<i style="left:${(i * 100) / cols.length}%;width:${100 / cols.length}%;background:${cc[c]}"></i>`).join("");
  const at = p === null ? null : cols[Math.min(cols.length - 1, Math.floor((p / 100) * cols.length))];
  return `<div class="mrow"><div class="mlab"><b>${title}</b><span>${sub}</span></div>
    <div class="mbar">${segs}${p === null ? "" : `<b class="mpin" style="left:${p}%"></b>`}</div>
    <div class="mval" style="color:${at ? cc[at] : "var(--fg3)"}">${txt}</div></div>`;
}
function drawMood() {
  const el = $("#mood"); if (!el) return; const a = analysis(), A = aggr();
  const f = live("fng") ? D.fng : null, ls = live("okxLS") ? lastOf(D.okxLS.s).v : null, prem = live("cb") && live("spot") ? ((D.cb.px - D.spot.px) / D.spot.px) * 100 : null;
  let pc = null; if (live("dbOpt")) { const R = D.dbOpt.rows, c = R.filter((r) => r.cp === "C").reduce((s, r) => s + r.oi, 0), p = R.filter((r) => r.cp === "P").reduce((s, r) => s + r.oi, 0); pc = c ? p / c : null; }
  el.className = "moodl";
  el.innerHTML = [
    moodRow("Overall lean", a && a.bias, -100, 100, ["r", "y", "g"], a ? `${a.bias > 0 ? "+" : ""}${a.bias}` : "–", a ? a.verdict : "loading"),
    moodRow("Fear & Greed", f && f.v, 0, 100, ["r", "y", "g"], f ? String(f.v) : "–", f ? f.label : esc(SRC.fng.st.err || "loading")),
    moodRow("Funding · 8h", ok(A.f8) ? A.f8 * 100 : null, -0.02, 0.03, ["g", "y", "r"], ok(A.f8) ? `${(A.f8 * 100).toFixed(4)}%` : "–", ok(A.f8) ? (A.f8 > 0.0002 ? "Longs paying, crowded" : A.f8 < 0 ? "Shorts paying" : "Normal") : "loading"),
    moodRow("Long/short accounts", ls, 0.5, 3, ["g", "y", "r"], ok(ls) ? ls.toFixed(2) : "–", ok(ls) ? (ls > 2.2 ? "Crowded long" : ls < 1 ? "More shorts" : "Leaning long") : "loading"),
    moodRow("Coinbase premium", prem, -0.1, 0.1, ["r", "y", "g"], ok(prem) ? pct(prem, 3) : "–", ok(prem) ? (prem > 0.02 ? "US buying" : prem < -0.02 ? "US selling" : "Flat") : "loading"),
    moodRow("Options put/call", pc, 0.3, 1.5, ["g", "y", "r"], ok(pc) ? pc.toFixed(2) : "–", ok(pc) ? (pc > 1 ? "Hedging, fearful" : pc < 0.6 ? "Call heavy" : "Balanced") : "loading"),
  ].join("") + nextEventLine();
}

/* ---------- positioning: Price / OI / Longs / Shorts stacked ---------- */
def("pos", "OKX OI + long/short history", "Positioning charts", 60000, async () => {
  const per = ST.posTf;
  const [oi, ls] = await Promise.all([okxR(`/api/v5/rubik/stat/contracts/open-interest-volume?ccy=BTC&period=${per}`), okxR(`/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=BTC&period=${per}`)]);
  const R = new Map(ls.map((r) => [Math.floor(+r[0] / 1000), +r[1]]));
  const rows = oi.map((r) => ({ t: Math.floor(+r[0] / 1000), oi: +r[1] })).filter((x) => ok(x.oi) && R.has(x.t)).sort((a, b) => a.t - b.t)
    .map((x) => { const r = R.get(x.t), lf = r / (1 + r); return { ...x, r, long: x.oi * lf, short: x.oi * (1 - lf) }; });
  if (rows.length < 5) throw new Error("not enough OI/ratio history"); return { per, rows };
});
let POSI = null;
function priceAt(per) {
  const src = per === "5m" ? (live("k5") ? D.k5.k : []) : live("taK") ? D.taK[per === "1H" ? "1h" : "1d"] : [];
  return new Map(src.map((x) => [x.t, x.c]));
}
function drawPos() {
  const box = $("#posChart"); if (!box) return; const C = chartColors();
  $("#posSeg").innerHTML = [["5m", "5m · 1d"], ["1H", "1h · 4d"], ["1D", "1d · 3mo"]].map(([v, l]) => `<button data-postf="${v}" aria-pressed="${ST.posTf === v}">${l}</button>`).join("");
  if (!live("pos") || D.pos.per !== ST.posTf) { box.innerHTML = unavail("pos", "Loading positioning…"); $("#posRead").textContent = ""; return; }
  let rows = D.pos.rows.slice(-(ST.posTf === "5m" ? 288 : ST.posTf === "1H" ? 96 : 90));
  const pm = priceAt(ST.posTf); rows = rows.map((r) => ({ ...r, px: pm.get(r.t) }));
  const W = cw("#posChart"), pr = 70, pw = W - pr, n = rows.length, bwid = pw / n, panes = [["Price", "px", 96], ["Open interest", "oi", 96], ["Longs", "long", 84], ["Shorts", "short", 84]], gap = 10;
  const X = (i) => (i + 0.5) * bwid; let y = 4, s = `<svg id="posSvg" width="100%" viewBox="0 0 ${W} ${panes.reduce((t, p) => t + p[2] + gap, 0) + 18}" style="display:block;touch-action:pan-y;cursor:crosshair" aria-label="Price, open interest, longs and shorts over time" role="img">`;
  for (const [name, key, h] of panes) {
    const v = rows.map((r) => r[key]).filter(ok); if (v.length < 2) { s += `<text x="4" y="${y + 16}" font-size="12" fill="${C.fg3}">${name}: no data</text>`; y += h + gap; continue; }
    const lo = Math.min(...v), hi = Math.max(...v), pad = (hi - lo) * 0.08 || 1, Y = (x) => y + 4 + (1 - (x - lo + pad) / (hi - lo + 2 * pad)) * (h - 8), base = y + h - 2;
    s += `<rect x="0" y="${y}" width="${pw}" height="${h}" fill="none" stroke="${C.grid}"/>`;
    if (key === "px") s += `<polyline fill="none" stroke="${C.fg}" stroke-width="1.6" points="${rows.map((r, i) => (ok(r.px) ? `${X(i).toFixed(1)},${Y(r.px).toFixed(1)}` : "")).filter(Boolean).join(" ")}"/>`;
    else if (key === "oi") { const pts = rows.map((r, i) => `${X(i).toFixed(1)},${Y(r.oi).toFixed(1)}`).join(" "); s += `<polygon points="${X(0)},${base} ${pts} ${X(n - 1)},${base}" fill="${rgba(C.acc, 0.18)}"/><polyline fill="none" stroke="${C.acc}" stroke-width="1.8" points="${pts}"/>`; }
    else rows.forEach((r, i) => { const up = i && r[key] >= rows[i - 1][key], col = up ? (key === "long" ? C.up : C.dn) : rgba(C.fg3, 0.55), yy = Y(r[key]); s += `<rect x="${(X(i) - bwid * 0.4).toFixed(1)}" y="${yy.toFixed(1)}" width="${Math.max(1, bwid * 0.8).toFixed(1)}" height="${Math.max(1, base - yy).toFixed(1)}" fill="${col}"/>`; });
    const lv = v[v.length - 1], ch = ((lv - v[0]) / v[0]) * 100, fmt = key === "px" ? n0 : usd;
    s += `<text x="6" y="${y + 15}" font-size="12" font-weight="600" fill="${C.fg2}">${name}</text><text x="${pw - 6}" y="${y + 15}" font-size="11.5" text-anchor="end" fill="${ch >= 0 ? C.up : C.dn}">${ch >= 0 ? "+" : ""}${ch.toFixed(2)}% this window</text>`;
    s += `<text x="${pw + 6}" y="${y + 12}" font-size="11" fill="${C.fg3}">${fmt(hi)}</text><text x="${pw + 6}" y="${y + h - 4}" font-size="11" fill="${C.fg3}">${fmt(lo)}</text>`;
    s += `<text x="${pw + 6}" y="${Math.min(y + h - 16, Math.max(y + 26, Y(lv) + 4))}" font-size="12" font-weight="700" fill="${key === "long" ? C.up : key === "short" ? C.dn : key === "oi" ? C.acc : C.fg}">${fmt(lv)}</text>`;
    y += h + gap;
  }
  const fmtX = (t) => fmtT(t, ST.posTf === "1D" ? { month: "short", day: "numeric" } : ST.posTf === "1H" ? { weekday: "short", hour: "numeric" } : { hour: "numeric", minute: "2-digit" });
  s += `<text x="2" y="${y + 10}" font-size="11" fill="${C.fg3}">${fmtX(rows[0].t)}</text><text x="${pw}" y="${y + 10}" font-size="11" fill="${C.fg3}" text-anchor="end">${fmtX(rows[n - 1].t)}</text>`;
  const ci = POSI === null ? n - 1 : Math.min(n - 1, POSI);
  if (POSI !== null) s += `<line x1="${X(ci)}" x2="${X(ci)}" y1="2" y2="${y - gap}" stroke="${C.fg2}" stroke-dasharray="3 3"/>`;
  box.innerHTML = s + "</svg>";
  const r = rows[ci], p0 = ci ? rows[ci - 1] : r, d = (k) => (ok(r[k]) && ok(p0[k]) && p0[k] ? ((r[k] - p0[k]) / p0[k]) * 100 : null);
  $("#posRead").innerHTML = `<b>${fmtT(r.t, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</b> · Price <b>${n0(r.px)}</b> · OI <b class="${cls(d("oi"))}">${usd(r.oi)}</b> · Longs <b class="up">${usd(r.long)}</b> <span class="${cls(d("long"))}">${pct(d("long"))}</span> · Shorts <b class="dn">${usd(r.short)}</b> <span class="${cls(d("short"))}">${pct(d("short"))}</span> · L/S ${r.r.toFixed(2)} (${((r.r / (1 + r.r)) * 100).toFixed(0)}% long)`;
  POSN = n; POSW = pw;
}
let POSN = 0, POSW = 1;
["pointermove", "click"].forEach((ev) => document.addEventListener(ev, (e) => {
  const svg = e.target.closest && e.target.closest("#posSvg"); if (!svg) return; if (ev === "pointermove" && e.pointerType !== "mouse") return;
  const r = svg.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * svg.viewBox.baseVal.width; if (x > POSW) return;
  POSI = Math.max(0, Math.min(POSN - 1, Math.floor((x / POSW) * POSN))); drawPos();
}));
document.addEventListener("pointerleave", (e) => { if (e.target && e.target.id === "posChart") { POSI = null; drawPos(); } }, true);
document.addEventListener("click", (e) => { const b = e.target.closest("[data-postf]"); if (!b) return; ST.posTf = b.dataset.postf; LS.set("posTf", ST.posTf); POSI = null; tick("pos"); drawPos(); });

/* ---------- economic calendar (ForexFactory weekly feed) ---------- */
PROXY["nfs.faireconomy.media"] = "/px/ff";
def("cal", "Economic calendar (ForexFactory)", "US events this week", 1800000, async () => {
  // Try from your own connection first (ForexFactory rate-limits shared cloud IPs), then the site pass-through.
  let j; try { j = await getJSON("https://nfs.faireconomy.media/ff_calendar_thisweek.json"); } catch (e) { j = await getJSONp("https://nfs.faireconomy.media/ff_calendar_thisweek.json"); }
  if (!Array.isArray(j)) throw new Error("no calendar");
  return { ev: j.filter((e) => e.country === "USD" && (e.impact === "High" || e.impact === "Medium")).map((e) => ({ t: Date.parse(e.date), title: e.title, impact: e.impact, f: e.forecast, p: e.previous, a: e.actual })).filter((e) => ok(e.t)).sort((a, b) => a.t - b.t) };
});
const untilTxt = (ms) => { const m = Math.round(ms / 60000); if (m < 0) return "done"; if (m < 60) return `in ${m}m`; const h = Math.floor(m / 60); return h < 24 ? `in ${h}h ${m % 60}m` : `in ${Math.floor(h / 24)}d ${h % 24}h`; };
function nextEventLine() {
  if (!live("cal")) return ""; const nx = D.cal.ev.find((e) => e.t > Date.now() - 5 * 60000 && e.impact === "High"); if (!nx) return `<div class="sub" style="margin-top:8px">No more high-impact US events this week.</div>`;
  return `<div class="nextev"><span class="imp hi"></span><b>${esc(nx.title)}</b> · ${new Date(nx.t).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })} · <b>${untilTxt(nx.t - Date.now())}</b></div>`;
}
function drawCal() {
  const el = $("#calList"); if (!el) return;
  if (!live("cal")) { el.innerHTML = unavail("cal", "Loading calendar…"); return; }
  const by = new Map(); D.cal.ev.forEach((e) => { const d = new Date(e.t).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }); if (!by.has(d)) by.set(d, []); by.get(d).push(e); });
  el.innerHTML = [...by.entries()].map(([d, es]) => `<div class="calday">${d}</div>${es.map((e) => { const past = e.t < Date.now(); return `<div class="calrow${past ? " past" : ""}"><span class="imp ${e.impact === "High" ? "hi" : "md"}" title="${e.impact} impact"></span><span class="calt">${new Date(e.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span><span class="caln"><b>${esc(e.title)}</b><span class="mut">${e.f ? ` · forecast ${esc(e.f)}` : ""}${e.p ? ` · prev ${esc(e.p)}` : ""}${e.a ? ` · actual <b>${esc(e.a)}</b>` : ""}</span></span><span class="calc">${past ? "done" : untilTxt(e.t - Date.now())}</span></div>`; }).join("")}`).join("") || `<div class="unavail">No high or medium impact US events listed this week.</div>`;
}

/* ---------- wiring ---------- */
const _d3 = drawStage2;
drawStage2 = function (tab) {
  _d3(tab);
  try {
    if (tab === "pat") { const a = analysis(); if (a) drawPatterns(a); else $("#patGeo").innerHTML = `<div class="unavail">Loading candles…</div>`; }
    if (tab === "derivs") drawPos();
    if (tab === "mkts") drawCal();
  } catch (e) { console.error(e); }
};
render(); ["pos", "cal"].forEach((id) => tick(id));
