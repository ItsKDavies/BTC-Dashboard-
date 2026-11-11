/* ===================== Chart geometry =====================
   Auto-drawn from the chart's own swing points (a zigzag of major highs and lows):
   - Pitchfork (Andrews): median line from the 3rd-last swing through the middle of the last two, with parallel tines.
   - Fib fan: lines from the start of the last big move through its 0.382 / 0.5 / 0.618 retracements, projected forward.
   - Gann fan: 1×1, 1×2, 2×1, 1×4, 4×1 angles from the latest major swing (1×1 = one ATR per candle).
   - Fib time zones: vertical lines at 0.618 / 1 / 1.618 / 2.618 × the last move's length — common turn windows.
   - Harmonic patterns: Gartley, Bat, Butterfly, Crab and AB=CD on the last swings; finished ones are drawn,
     forming ones show the zone where D is expected (PRZ).
   Everything runs on the loaded candles in the browser. Pattern rules are the common textbook ratios. */
Object.assign(ST, { geoPf: LS.get("geoPf", true), geoFan: LS.get("geoFan", false), geoGann: LS.get("geoGann", false), geoTz: LS.get("geoTz", false), geoHarm: LS.get("geoHarm", true) });
const gOn = (x) => x && !ST.clean;
let GEOZ = { key: "", v: null };
function zigzag(k) {
  const n = k.length, key = n + ":" + k[n - 1].t + ":" + k[n - 1].h + ":" + k[n - 1].l; if (GEOZ.key === key) return GEOZ.v;
  const W0 = Math.max(0, n - 320), Lb = 5, { hi, lo } = TA.pivots(k.slice(W0, n - 1), Lb, Lb), pts = [];
  hi.forEach((q) => pts.push({ i: q.i + W0, p: k[q.i + W0].h, hi: true })); lo.forEach((q) => pts.push({ i: q.i + W0, p: k[q.i + W0].l, hi: false }));
  pts.sort((a, b) => a.i - b.i); const z = [];
  for (const q of pts) { const l = z[z.length - 1]; if (l && l.hi === q.hi) { if (q.hi ? q.p > l.p : q.p < l.p) z[z.length - 1] = q; } else z.push(q); }
  // drop tiny wiggles (< 0.6 ATR) so the swings are meaningful
  const A = TA.atr(k), at = A[n - 1] || (k[n - 1].h - k[n - 1].l), zz = [];
  for (const q of z) { const l = zz[zz.length - 1]; if (l && Math.abs(q.p - l.p) < at * 0.6) { const l2 = zz[zz.length - 2]; if (l2 && l2.hi === q.hi && (q.hi ? q.p > l2.p : q.p < l2.p)) { zz.pop(); zz[zz.length - 1] = q; } continue; } zz.push(q); }
  // the live leg: if price has run past the last swing, use the current extreme as a provisional point
  const last = zz[zz.length - 1]; if (last) { let ex = null; for (let i = last.i + 1; i < n; i++) { const x = k[i]; if (last.hi ? (!ex || x.l < ex.p) : (!ex || x.h > ex.p)) ex = { i, p: last.hi ? x.l : x.h, hi: !last.hi, live: true }; } if (ex && Math.abs(ex.p - last.p) >= at * 0.6) zz.push(ex); }
  GEOZ = { key, v: { z: zz, atr: at } }; return GEOZ.v;
}
const HARM = [
  { name: "Gartley", ab: [0.568, 0.668], bc: [0.382, 0.886], cd: [1.13, 1.618], xd: 0.786 },
  { name: "Bat", ab: [0.382, 0.5], bc: [0.382, 0.886], cd: [1.618, 2.618], xd: 0.886 },
  { name: "Butterfly", ab: [0.736, 0.836], bc: [0.382, 0.886], cd: [1.618, 2.24], xd: 1.27 },
  { name: "Crab", ab: [0.382, 0.618], bc: [0.382, 0.886], cd: [2.24, 3.618], xd: 1.618 },
];
function harmonics(z) {
  const out = [], inR = (v, [a, b], tol = 0.04) => v >= a - tol && v <= b + tol, r = (a, b, c) => Math.abs(c.p - b.p) / Math.abs(b.p - a.p);
  // finished: X A B C D = last five swings
  if (z.length >= 5) { const [X, A, B, C, D] = z.slice(-5), bull = !D.hi, ab = r(X, A, B), bc = r(A, B, C), cd = r(B, C, D), xd = Math.abs(D.p - A.p) / Math.abs(A.p - X.p);
    for (const h of HARM) if (inR(ab, h.ab) && inR(bc, h.bc) && inR(cd, h.cd, 0.12) && Math.abs(xd - h.xd) <= 0.06 * h.xd) out.push({ done: true, name: h.name, bull, X, A, B, C, D, ratios: { ab, bc, cd, xd } }); }
  // forming: X A B C known, D still to come → zone where D should land
  if (z.length >= 4) { const [X, A, B, C] = z.slice(-4), bull = C.hi, ab = r(X, A, B), bc = r(A, B, C), xa = Math.abs(A.p - X.p), dir = bull ? -1 : 1;
    for (const h of HARM) if (inR(ab, h.ab) && inR(bc, h.bc)) { const dXA = A.p + dir * h.xd * xa, bcLen = Math.abs(C.p - B.p), dCD = [C.p + dir * h.cd[0] * bcLen, C.p + dir * h.cd[1] * bcLen];
      const lo = Math.min(dXA, ...dCD), hi = Math.max(dXA, ...dCD), zLo = Math.max(lo, dXA - xa * 0.05), zHi = Math.min(hi, dXA + xa * 0.05);
      if ((bull && dXA < C.p) || (!bull && dXA > C.p)) out.push({ done: false, name: h.name, bull, X, A, B, C, prz: [Math.min(zLo, zHi), Math.max(zLo, zHi)], dXA, ratios: { ab, bc } }); } }
  // AB=CD on the last four swings
  if (z.length >= 4) { const [A, B, C, D] = z.slice(-4), bc = r(A, B, C), cd = Math.abs(D.p - C.p) / Math.abs(B.p - A.p);
    if (inR(bc, [0.382, 0.886]) && Math.abs(cd - 1) <= 0.1 && !out.some((h) => h.done)) out.push({ done: true, name: "AB=CD", bull: !D.hi, A, B, C, D, abcd: true, ratios: { bc, cd } }); }
  return out;
}
function drawGeom(L, k, C) {
  const any = gOn(ST.geoPf) || gOn(ST.geoFan) || gOn(ST.geoGann) || gOn(ST.geoTz) || gOn(ST.geoHarm); LI.geoHarm = ""; LI.geoPf = ""; LI.geoTz = "";
  if (!any || k.length < 60) return; const { z, atr } = zigzag(k); if (z.length < 3) return;
  const n = k.length, fut = Math.max(20, Math.round(CC.bars * 0.4)), px = k[n - 1].c, big = px * 0.25;
  const ext = (i0, p0, i1, p1, to) => { const m = (p1 - p0) / (i1 - i0 || 1); return [to, p0 + m * (to - i0)]; };
  // ---- pitchfork
  if (gOn(ST.geoPf)) { const [P0, P1, P2] = z.slice(-3), mi = (P1.i + P2.i) / 2, mp = (P1.p + P2.p) / 2, end = n - 1 + fut, col = "#a78bfa";
    const [ei, ep] = ext(P0.i, P0.p, mi, mp, end), dm = ep - P0.p, di = ei - P0.i, slope = dm / di, at = (P, i) => P.p + slope * (i - P.i);
    L.draw.push({ type: "seg", i0: P0.i, p0: P0.p, i1: ei, p1: ep, color: col, w: 1.6 }, { type: "seg", i0: P1.i, p0: P1.p, i1: end, p1: at(P1, end), color: col, w: 1.2, dash: [6, 4] }, { type: "seg", i0: P2.i, p0: P2.p, i1: end, p1: at(P2, end), color: col, w: 1.2, dash: [6, 4] },
      { type: "seg", i0: P1.i, p0: P1.p, i1: P2.i, p1: P2.p, color: col, w: 1, dash: [2, 3] }, { type: "poly", pts: [[P1.i, P1.p], [end, at(P1, end)], [end, at(P2, end)], [P2.i, P2.p]], color: col, alpha: 0.05 });
    L.draw.push({ type: "pill", i: n - 12, p: P0.p + slope * (n - 12 - P0.i), dy: -12, text: "Pitchfork median", color: col, size: 9.5 });
    const med = P0.p + slope * (n - 1 - P0.i), up = at(slope > 0 ? P2 : P1, n - 1), dn = at(slope > 0 ? P1 : P2, n - 1), hiT = Math.max(up, dn), loT = Math.min(up, dn);
    LI.geoPf = `${slope > 0 ? "Rising ↗" : "Falling ↘"} · median ${n0(med)} · tines ${n0(loT)}–${n0(hiT)}${px > hiT ? " · price above the fork" : px < loT ? " · price below the fork" : ""}`; }
  // ---- fib fan from the last big move
  if (gOn(ST.geoFan)) { const A = z[z.length - 2], B = z[z.length - 1], end = n - 1 + fut, col = "#ff6ec7";
    [[0.382, [6, 4]], [0.5, [3, 3]], [0.618, []]].forEach(([r, dash]) => { const p = B.p - (B.p - A.p) * r, [ei, ep] = ext(A.i, A.p, B.i, p, end);
      L.draw.push({ type: "seg", i0: A.i, p0: A.p, i1: ei, p1: ep, color: col, w: r === 0.618 ? 1.6 : 1.1, dash }, { type: "text", i: n - 6, p: A.p + (ep - A.p) * ((n - 6 - A.i) / (ei - A.i)), dy: -6, text: `fan ${r}`, color: col, size: 9.5 }); }); }
  // ---- Gann fan from the latest major swing
  if (gOn(ST.geoGann)) { const P = z[z.length - 1].live ? z[z.length - 2] : z[z.length - 1], dir = P.hi ? -1 : 1, end = n - 1 + fut, col = "#e8c547";
    [[1, 1, "1×1", 1.6], [1, 2, "1×2", 1], [2, 1, "2×1", 1], [1, 4, "1×4", 0.8], [4, 1, "4×1", 0.8]].forEach(([pr, tm, lab, w]) => { const m = (dir * atr * pr) / tm, ep = P.p + m * (end - P.i);
      if (Math.abs(ep - px) < big) L.draw.push({ type: "seg", i0: P.i, p0: P.p, i1: end, p1: ep, color: col, w, dash: lab === "1×1" ? [] : [5, 4] }, { type: "text", i: end - 1, p: P.p + m * (end - 1 - P.i), dy: -6, text: lab, color: col, size: 9.5 }); }); }
  // ---- Fib time zones: when the next turn tends to come
  if (gOn(ST.geoTz)) { const A = z[z.length - 2].live ? z[z.length - 3] : z[z.length - 2], B = z[z.length - 2].live ? z[z.length - 2] : z[z.length - 1], len = B.i - A.i, col = "#38bdf8", next = [];
    if (len >= 3) [0.618, 1, 1.618, 2.618].forEach((r) => { const i = B.i + Math.round(len * r); L.draw.push({ type: "seg", i0: i, p0: px - big, i1: i, p1: px + big, color: col, w: r === 1 || r === 1.618 ? 1.4 : 1, dash: [3, 5] }); L.draw.push({ type: "text", i, p: Math.max(...k.slice(-Math.min(n, 120)).map((x) => x.h)), dy: -4, text: `T${r}`, color: col, size: 9.5 }); if (i >= n - 1) next.push([r, i - (n - 1)]); });
    const nx = next[0]; LI.geoTz = nx ? `Next time window: T${nx[0]} in ${nx[1]} candle${nx[1] === 1 ? "" : "s"}${CC && CC.sec ? ` (~${untilTxt(nx[1] * CC.sec * 1000).replace(/^in /, "")})` : ""}` : "All windows have passed"; }
  // ---- harmonic patterns
  if (gOn(ST.geoHarm)) { const hs = harmonics(z), done = hs.filter((h) => h.done), form = hs.filter((h) => !h.done), show = [...done.slice(0, 1), ...form.slice(0, 1)], msgs = [];
    for (const h of show) { const col = h.bull ? C.up : C.dn, P = h.abcd ? [h.A, h.B, h.C, h.D] : h.done ? [h.X, h.A, h.B, h.C, h.D] : [h.X, h.A, h.B, h.C], labs = h.abcd ? ["A", "B", "C", "D"] : ["X", "A", "B", "C", "D"];
      for (let j = 1; j < P.length; j++) L.draw.push({ type: "seg", i0: P[j - 1].i, p0: P[j - 1].p, i1: P[j].i, p1: P[j].p, color: col, w: 1.8, dash: h.done ? [] : [6, 4] });
      if (!h.abcd) { L.draw.push({ type: "poly", pts: [[h.X.i, h.X.p], [h.A.i, h.A.p], [h.B.i, h.B.p]], color: col, alpha: 0.1 }); if (h.done) L.draw.push({ type: "poly", pts: [[h.B.i, h.B.p], [h.C.i, h.C.p], [h.D.i, h.D.p]], color: col, alpha: 0.1 }); L.draw.push({ type: "seg", i0: h.X.i, p0: h.X.p, i1: h.B.i, p1: h.B.p, color: col, w: 1, dash: [2, 3] }); }
      P.forEach((q, j) => L.draw.push({ type: "text", i: q.i, p: q.p, dy: q.hi ? -10 : 16, text: labs[j], color: col, size: 11 }));
      const nm = `${h.bull ? "Bullish" : "Bearish"} ${h.name}`;
      if (h.done) { const D = P[P.length - 1]; L.draw.push({ type: "pill", i: D.i, p: D.p, dy: D.hi ? -24 : 28, text: nm, color: col, size: 10 }); msgs.push(`<b class="${h.bull ? "up" : "dn"}">${nm}</b> finished at ${n0(D.p)} · ${h.bull ? "bounce" : "drop"} zone; invalid past ${n0(D.p + (h.bull ? -1 : 1) * atr)}`); }
      else { const i0 = h.C.i, i1 = n - 1 + fut; L.draw.push({ type: "rect", i0, i1, p0: h.prz[0], p1: h.prz[1], color: col, alpha: 0.16, edge: true, label: `${nm} PRZ` }); msgs.push(`<b class="${h.bull ? "up" : "dn"}">${nm}</b> forming · D expected ${n0(h.prz[0])}–${n0(h.prz[1])} (${distTxt((h.prz[0] + h.prz[1]) / 2, px)})`); } }
    LI.geoHarm = msgs.join("<br>") || "No harmonic pattern on the current swings"; }
}
