"use strict";
/* ===================== GEX: options gamma exposure (Deribit) =====================
   Computed locally from the Deribit options book summary that `dbOpt` already loads (open interest, mark IV,
   underlying price per instrument). Gamma from Black-Scholes. Convention (same as most GEX tools): dealers are
   long calls (+ gamma) and short puts (− gamma). GEX = gamma × OI × S² × 1%, in $ per 1% move. No AI, no keys. */
const SQ2PI = Math.sqrt(2 * Math.PI);
function bsGamma(S, K, T, s) { if (!(T > 0 && s > 0 && S > 0 && K > 0)) return 0; const v = s * Math.sqrt(T), d1 = (Math.log(S / K) + 0.5 * s * s * T) / v; return Math.exp(-0.5 * d1 * d1) / SQ2PI / (S * v); }
ST.gexExp = LS.get("gexExp", "all"); ST.gexl = LS.get("gexl", true);
let GEXM = { key: "", v: null };
function gexCalc(exp) {
  if (!live("dbOpt")) return null; const S = curPx() || (D.dbOpt.rows.find((r) => ok(r.u)) || {}).u; if (!ok(S)) return null;
  const key = exp + "|" + SRC.dbOpt.st.okAt + "|" + Math.round(S / 50); if (GEXM.key === key) return GEXM.v;
  const now = Date.now(), Y = 365 * 864e5;
  const rows = D.dbOpt.rows.filter((r) => r.ms > now + 6e4 && r.oi > 0 && (exp === "all" || r.exp === exp)).map((r) => ({ ...r, T: (r.ms - now) / Y, s: ok(r.iv) && r.iv > 1 ? r.iv / 100 : 0.5 }));
  if (!rows.length) return null;
  const at = (P) => { let n = 0; for (const r of rows) n += (r.cp === "C" ? 1 : -1) * bsGamma(P, r.k, r.T, r.s) * r.oi * P * P * 0.01; return n; };
  // per strike at today's price
  const by = new Map();
  for (const r of rows) { const g = bsGamma(S, r.k, r.T, r.s) * r.oi * S * S * 0.01, o = by.get(r.k) || { k: r.k, c: 0, p: 0, oiC: 0, oiP: 0 }; if (r.cp === "C") { o.c += g; o.oiC += r.oi; } else { o.p -= g; o.oiP += r.oi; } by.set(r.k, o); }
  const ks = [...by.values()].map((o) => ({ ...o, net: o.c + o.p, abs: o.c - o.p })).sort((a, b) => a.k - b.k);
  // profile: total GEX if price moved to P; the flip is where it crosses zero (nearest to price)
  const prof = []; for (let f = 0.8; f <= 1.2001; f += 0.0025) prof.push({ p: S * f, g: at(S * f) });
  let flip = null;
  for (let i = 1; i < prof.length; i++) { const a = prof[i - 1], b = prof[i]; if ((a.g <= 0) !== (b.g <= 0)) { const x = a.p + (b.p - a.p) * (-a.g / (b.g - a.g)); if (flip === null || Math.abs(x - S) < Math.abs(flip - S)) flip = x; } }
  const net = ks.reduce((s, o) => s + o.net, 0), callG = ks.reduce((s, o) => s + o.c, 0), putG = ks.reduce((s, o) => s + o.p, 0);
  const near = (pct) => ks.filter((o) => Math.abs(o.k - S) / S <= pct);
  const pos = near(0.25).filter((o) => o.net > 0 && o.k > S).sort((a, b) => b.net - a.net), neg = near(0.25).filter((o) => o.net < 0 && o.k < S).sort((a, b) => a.net - b.net);
  const mag = near(0.06).slice().sort((a, b) => b.abs - a.abs);
  // expected move from ATM IV of the nearest expiry at least ~1 day out
  const exps = [...new Set(rows.map((r) => r.exp))].map((e) => rows.find((r) => r.exp === e)).sort((a, b) => a.ms - b.ms);
  const ref = exps.find((r) => r.T > 0.8 / 365) || exps[0], atm = rows.filter((r) => r.exp === ref.exp).sort((a, b) => Math.abs(a.k - S) - Math.abs(b.k - S)).slice(0, 4), iv = atm.reduce((s, r) => s + r.s, 0) / atm.length;
  const v = { S, ks, prof, flip, net, callG, putG, regime: net >= 0 ? 1 : -1, above: flip === null ? net >= 0 : S >= flip,
    P: pos.slice(0, 2), N: neg.slice(0, 2), A: mag.slice(0, 2), iv, em1: S * iv * Math.sqrt(1 / 365), em7: S * iv * Math.sqrt(7 / 365), mp: TA.maxPain(rows.filter((r) => r.exp === exps[0].exp)), mpExp: exps[0], n: rows.length };
  GEXM = { key, v }; return v;
}
const gexUsd = (v) => (ok(v) ? (v < 0 ? "−" : "+") + usd(Math.abs(v)) : "–");
const distTxt = (p, S) => { const d = ((p - S) / S) * 100; return `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}%`; };
function gexLevels(g) {
  const L = [];
  if (ok(g.flip)) L.push({ id: "FLIP", name: "GEX flip", p: g.flip, cls: "gflip", why: "Above it dealers dampen moves (positive gamma). Below it they chase moves (negative gamma)." });
  g.P.forEach((o, i) => L.push({ id: "P" + (i + 1), name: i ? "Call wall 2" : "Call wall", p: o.k, cls: "gp", why: `Biggest positive gamma above price (${gexUsd(o.net)}). Dealers sell into rallies here, so expect resistance or a slow grind.` }));
  g.N.forEach((o, i) => L.push({ id: "N" + (i + 1), name: i ? "Put wall 2" : "Put wall · vol trigger", p: o.k, cls: "gn", why: `Biggest negative gamma below price (${gexUsd(o.net)}). Losing it can speed up selling as dealers hedge.` }));
  g.A.forEach((o, i) => L.push({ id: "A" + (i + 1), name: "Magnet", p: o.k, cls: "ga", why: `Most total gamma near price (${usd(o.abs)}). Price often gets pulled toward and pinned around it, especially into expiry.` }));
  if (ok(g.mp)) L.push({ id: "MP", name: `Max pain · ${new Date(g.mpExp.ms).toLocaleDateString([], { month: "short", day: "numeric" })}`, p: g.mp, cls: "gm", why: "Strike where the most option value expires worthless at the nearest expiry." });
  return L;
}
function gexRead(g) {
  const S = g.S, f = g.flip, out = [];
  if (ok(f)) out.push(S >= f ? `<b class="up">Positive gamma.</b> Price is ${distTxt(S, f).replace("+", "")} above the flip (${n0(f)}). Dealers buy dips and sell rips, so expect tighter ranges, mean reversion and pinning toward magnets. Breakouts tend to stall at call walls.`
    : `<b class="dn">Negative gamma.</b> Price is ${distTxt(S, f).replace("−", "")} below the flip (${n0(f)}). Dealers sell into drops and buy into rallies, so moves extend and wicks run further. Don't blindly fade breakdowns.`);
  else out.push(g.net >= 0 ? `<b class="up">Positive gamma</b> across the whole ±20% range: dealers dampen moves.` : `<b class="dn">Negative gamma</b> across the whole ±20% range: dealers amplify moves.`);
  const n1 = g.N[0], p1 = g.P[0], a1 = g.A[0];
  if (n1) out.push(`Downside trigger: <b>${n0(n1.k)}</b> (${distTxt(n1.k, S)}). A 30m close below it raises the odds of a fast leg${g.N[1] ? ` toward <b>${n0(g.N[1].k)}</b>` : ""}.`);
  if (ok(f) && S < f) out.push(`Upside: reclaiming <b>${n0(f)}</b> on a 4h close flips the regime to positive gamma, where vol calms down${a1 ? ` and <b>${n0(a1.k)}</b> acts as a magnet` : ""}.`);
  else if (p1) out.push(`Upside cap: <b>${n0(p1.k)}</b> (${distTxt(p1.k, S)}) is the call wall. Expect selling into it unless spot flow is strong.`);
  out.push(`Options imply about <b>±$${n0(g.em1)}</b> a day (±$${n0(g.em7)} a week) from ${(g.iv * 100).toFixed(0)}% ATM IV.`);
  return out.map((x) => `<li>${x}</li>`).join("");
}
function drawGex() {
  const el = $("#gexTop"); if (!el) return;
  const exps = live("dbOpt") ? [...new Set(D.dbOpt.rows.filter((r) => r.ms > Date.now()).map((r) => r.exp))].map((e) => ({ e, ms: D.dbOpt.rows.find((r) => r.exp === e).ms })).sort((a, b) => a.ms - b.ms).slice(0, 6) : [];
  if (ST.gexExp !== "all" && !exps.some((x) => x.e === ST.gexExp)) ST.gexExp = "all";
  $("#gexSeg").innerHTML = `<button data-gexp="all" aria-pressed="${ST.gexExp === "all"}">Total</button>` + exps.map((x) => `<button data-gexp="${x.e}" aria-pressed="${ST.gexExp === x.e}">${new Date(x.ms).toLocaleDateString([], { month: "short", day: "numeric" })}</button>`).join("");
  const g = gexCalc(ST.gexExp);
  if (!g) { el.innerHTML = unavail("dbOpt", "Loading Deribit options…"); $("#gexLv").innerHTML = ""; $("#gexBars").innerHTML = ""; $("#gexRead").innerHTML = ""; return; }
  const pos = ok(g.flip) ? g.S >= g.flip : g.net >= 0;
  el.innerHTML = `<div class="gkpi"><div class="${pos ? "gpos" : "gneg"}"><i>Regime</i><b>${pos ? "Positive gamma" : "Negative gamma"}</b><i>${pos ? "dampened · mean-reverting" : "amplified · trending"}</i></div>
    <div><i>GEX flip</i><b>${ok(g.flip) ? n0(g.flip) : "none in ±20%"}</b><i>${ok(g.flip) ? `price ${distTxt(g.S, g.flip)} from it` : ""}</i></div>
    <div><i>Net GEX per 1%</i><b class="${cls(g.net)}">${gexUsd(g.net)}</b><i>calls ${gexUsd(g.callG)} · puts ${gexUsd(g.putG)}</i></div>
    <div><i>Expected move</i><b>±$${n0(g.em1)}</b><i>1 day · ±$${n0(g.em7)} 1 week</i></div></div>`;
  $("#gexRead").innerHTML = `<ul class="gread">${gexRead(g)}</ul>`;
  $("#gexLv").innerHTML = gexLevels(g).sort((a, b) => b.p - a.p).map((l) => `<div class="glv ${l.cls}"><span class="gid">${l.id}</span><span><b>${l.name}</b><i>${l.why}</i></span><span class="gp2"><b>${n0(l.p)}</b><i>${distTxt(l.p, g.S)}</i></span></div>`).join("");
  drawGexBars(g);
}
function drawGexBars(g) {
  const S = g.S, ks = g.ks.filter((o) => Math.abs(o.k - S) / S <= (ST.gexWide ? 0.25 : 0.12) && (Math.abs(o.net) > 0 || o.abs > 0)).sort((a, b) => b.k - a.k);
  const mx = Math.max(1, ...ks.map((o) => Math.max(Math.abs(o.net), ST.gexSplit ? Math.max(o.c, -o.p) : 0))), tags = new Map();
  gexLevels(g).forEach((l) => { if (l.id !== "FLIP") tags.set(l.p, (tags.get(l.p) || []).concat(l.id)); });
  const ent = ks.map((o) => ({ p: o.k, o })).concat([{ p: S, m: ["Price", "gmp"] }], ok(g.flip) ? [{ p: g.flip, m: ["GEX flip", "gmf"] }] : []).sort((a, b) => b.p - a.p);
  const w = (v) => Math.min(50, (Math.abs(v) / mx) * 50).toFixed(2);
  const html = ent.map(({ p, o, m }) => {
    if (m) return `<div class="gmark ${m[1]}"><span>${m[0]} ${n0(p)}</span></div>`;
    const bar = ST.gexSplit ? `<i class="gb gbn" style="width:${w(o.p)}%;right:50%"></i><i class="gb gbp" style="width:${w(o.c)}%;left:50%"></i>`
      : o.net >= 0 ? `<i class="gb gbp" style="width:${w(o.net)}%;left:50%"></i>` : `<i class="gb gbn" style="width:${w(o.net)}%;right:50%"></i>`;
    const t = tags.get(o.k) || [];
    return `<div class="grow" title="calls ${gexUsd(o.c)} · puts ${gexUsd(o.p)} · OI ${n0(o.oiC)} C / ${n0(o.oiP)} P"><span class="gk">${kfmt(o.k)}</span><span class="gbar">${bar}</span><span class="gv ${cls(o.net)}">${t.map((x) => `<em class="gt ${x[0] === "P" ? "gp" : x[0] === "N" ? "gn" : x[0] === "A" ? "ga" : "gm"}">${x}</em>`).join("")}${usd(Math.abs(o.net)).replace("$", o.net < 0 ? "−$" : "$")}</span></div>`;
  }).join("");
  $("#gexCtl").innerHTML = `<span class="seg"><button data-gsplit="0" aria-pressed="${!ST.gexSplit}">Net</button><button data-gsplit="1" aria-pressed="${!!ST.gexSplit}">Calls vs puts</button></span><span class="seg"><button data-gwide="0" aria-pressed="${!ST.gexWide}">±12%</button><button data-gwide="1" aria-pressed="${!!ST.gexWide}">±25%</button></span>`;
  $("#gexBars").innerHTML = html || `<div class="unavail">No open interest near price for this expiry.</div>`;
}
// main chart layer (Layers → GEX levels), always the Total view
function gexHlines(L, C) {
  const g = gexCalc("all"); if (!g) return;
  for (const l of gexLevels(g)) {
    const col = l.cls === "gp" ? C.up : l.cls === "gn" ? C.dn : l.cls === "ga" ? C.purple : l.cls === "gflip" ? "#e8c547" : C.fg3;
    L.hlines.push({ p: l.p, color: col, w: l.id === "FLIP" ? 1.8 : 1.3, dash: l.id === "FLIP" ? [7, 4] : l.id === "MP" ? [1, 4] : [3, 3], alpha: 0.9, tag: `${l.id === "FLIP" ? "GEX flip" : l.id} ${kfmt(l.p)}`, prio: l.id === "FLIP" ? 66 : l.id === "MP" ? 30 : 60 });
  }
}
function drawGexOverview() {
  const el = $("#ovGex"); if (!el) return; const g = gexCalc("all");
  if (!g) { el.innerHTML = unavail("dbOpt", "Loading Deribit options…"); return; }
  const pos = ok(g.flip) ? g.S >= g.flip : g.net >= 0, n1 = g.N[0], p1 = g.P[0], a1 = g.A[0];
  el.innerHTML = `<div class="govr"><b class="${pos ? "up" : "dn"}">${pos ? "Positive gamma · dampened" : "Negative gamma · moves extend"}</b>
    <span>Flip <b>${ok(g.flip) ? n0(g.flip) : "–"}</b></span>${a1 ? `<span>Magnet <b>${n0(a1.k)}</b></span>` : ""}${n1 ? `<span>Put wall <b class="dn">${n0(n1.k)}</b></span>` : ""}${p1 ? `<span>Call wall <b class="up">${n0(p1.k)}</b></span>` : ""}<span>1-day move <b>±$${n0(g.em1)}</b></span></div>
    <button class="btn" data-gogex style="margin-top:8px">GEX detail →</button>`;
}
document.addEventListener("click", (e) => {
  const x = e.target.closest("[data-gexp]"); if (x) { ST.gexExp = x.dataset.gexp; LS.set("gexExp", ST.gexExp); drawGex(); return; }
  const s = e.target.closest("[data-gsplit]"); if (s) { ST.gexSplit = s.dataset.gsplit === "1"; drawGex(); return; }
  const w = e.target.closest("[data-gwide]"); if (w) { ST.gexWide = w.dataset.gwide === "1"; drawGex(); return; }
  if (e.target.closest("[data-gogex]")) { setTab("gex"); window.scrollTo({ top: 0 }); }
});
const _d5 = drawStage2;
drawStage2 = function (tab) {
  _d5(tab);
  try { if (tab === "gex") drawGex(); if (tab === "overview") drawGexOverview(); } catch (e) { console.error(e); }
};
if (typeof syncCtl === "function") syncCtl();
render();
