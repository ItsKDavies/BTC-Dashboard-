"use strict";
/* ===================== Signals engine (pure functions, no DOM) =====================
   Regime, market structure (BOS / CHoCH, swings, equal highs/lows, fair value gaps, order blocks),
   level clustering and touch odds. Candles are {t,o,h,l,c,v} oldest first. Runs in the browser
   (window.SG) and in Node for tests (module.exports). Rules only: nothing here is backtested. */
(function (root) {
  const ok = (v) => typeof v === "number" && Number.isFinite(v);
  const last = (a) => a[a.length - 1];
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
  const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function ema(v, n) { const o = new Array(v.length).fill(NaN), a = 2 / (n + 1); let e = NaN; for (let i = 0; i < v.length; i++) { if (!ok(v[i])) continue; e = ok(e) ? v[i] * a + e * (1 - a) : v[i]; if (i >= n - 1) o[i] = e; } return o; }
  function rma(v, n) { const o = new Array(v.length).fill(NaN); let s = 0, c = 0, e = NaN; for (let i = 0; i < v.length; i++) { if (!ok(v[i])) continue; if (!ok(e)) { s += v[i]; c++; if (c === n) { e = s / n; o[i] = e; } } else { e = (e * (n - 1) + v[i]) / n; o[i] = e; } } return o; }
  // share of past values below v (0–100)
  function pctRank(arr, v) { const a = arr.filter(ok); if (!a.length || !ok(v)) return NaN; return (a.filter((x) => x < v).length / a.length) * 100; }

  /* ---------- trend strength / volatility ---------- */
  function adx(k, n = 14) {
    const tr = [NaN], pdm = [NaN], mdm = [NaN];
    for (let i = 1; i < k.length; i++) {
      const up = k[i].h - k[i - 1].h, dn = k[i - 1].l - k[i].l;
      pdm.push(up > dn && up > 0 ? up : 0); mdm.push(dn > up && dn > 0 ? dn : 0);
      tr.push(Math.max(k[i].h - k[i].l, Math.abs(k[i].h - k[i - 1].c), Math.abs(k[i].l - k[i - 1].c)));
    }
    const atr = rma(tr, n), p = rma(pdm, n), m = rma(mdm, n);
    const pdi = p.map((x, i) => (ok(x) && atr[i] ? (100 * x) / atr[i] : NaN)), mdi = m.map((x, i) => (ok(x) && atr[i] ? (100 * x) / atr[i] : NaN));
    const dx = pdi.map((x, i) => (ok(x) && ok(mdi[i]) && x + mdi[i] ? (100 * Math.abs(x - mdi[i])) / (x + mdi[i]) : NaN));
    return { adx: rma(dx, n), pdi, mdi, atr };
  }
  function effRatio(c, n = 20) { const N = c.length; if (N <= n) return NaN; let path = 0; for (let i = N - n; i < N; i++) path += Math.abs(c[i] - c[i - 1]); return path ? Math.abs(c[N - 1] - c[N - 1 - n]) / path : 0; }
  function bbWidth(c, n = 20) { const o = new Array(c.length).fill(NaN); for (let i = n - 1; i < c.length; i++) { const s = c.slice(i - n + 1, i + 1), m = mean(s); o[i] = m ? (4 * std(s)) / m * 100 : NaN; } return o; }

  /* ---------- regime ---------- */
  const PLAY = {
    up: "Trend up: buy pullbacks into support or the rising averages; breakouts tend to follow through. Don't short strength without a structure break.",
    down: "Trend down: sell rallies into resistance; breakdowns tend to follow through. Don't catch knives without a structure break.",
    range: "Range: fade the edges, take profit near the middle. Breakouts often fail until volume and open interest confirm.",
    squeeze: "Squeeze: volatility is coiled tight. A big move usually follows; wait for the break and trade the retest, or size down.",
    expand: "Expansion: volatility is high. Wider stops, smaller size; moves can overshoot levels before reversing.",
    trans: "Transition: the old trend is fading and no new one is clear. Be selective; wait for structure to confirm.",
  };
  function regime(k, tf) {
    if (!k || k.length < 80) return null;
    const c = k.map((x) => x.c), n = c.length, A = adx(k), px = c[n - 1];
    const ad = A.adx[n - 1], pdi = A.pdi[n - 1], mdi = A.mdi[n - 1], atr = A.atr[n - 1];
    const er = effRatio(c, 20), bw = bbWidth(c), bwNow = bw[n - 1], bwPct = pctRank(bw.slice(-150, -1), bwNow);
    const atrP = A.atr.map((a, i) => (ok(a) ? (a / c[i]) * 100 : NaN)), atrPct = pctRank(atrP.slice(-150, -1), atrP[n - 1]);
    const e50 = ema(c, 50), slope = atr ? (e50[n - 1] - e50[n - 11]) / atr : 0; // EMA50 drift over 10 bars, in ATRs
    const dir = pdi > mdi ? 1 : -1, hi30 = Math.max(...k.slice(-30).map((x) => x.h)), lo30 = Math.min(...k.slice(-30).map((x) => x.l));
    let key, label;
    if (bwPct <= 15 && ad < 23) { key = "squeeze"; label = "Squeeze"; }
    else if (ad >= 25 && er >= 0.28 && Math.sign(slope) === dir) { key = dir > 0 ? "up" : "down"; label = dir > 0 ? "Trending up" : "Trending down"; }
    else if (bwPct >= 85 && atrPct >= 75) { key = "expand"; label = "Volatile expansion"; }
    else if (ad < 20 || er < 0.18) { key = "range"; label = "Range"; }
    else { key = "trans"; label = ad >= 25 ? (dir > 0 ? "Trend up, losing steam" : "Trend down, losing steam") : "Transition"; }
    const d = key === "up" ? 1 : key === "down" ? -1 : key === "expand" ? Math.sign(c[n - 1] - c[n - 11]) : key === "trans" && ad >= 25 ? dir * 0.5 : 0;
    const strength = clamp(Math.round(ad || 0), 0, 100);
    return { tf, key, label, dir: d, adx: ad, pdi, mdi, er, bw: bwNow, bwPct, atr, atrPct, atrPctNow: atrP[n - 1], slope, px, hi30, lo30, strength, play: PLAY[key] };
  }

  /* ---------- market structure ---------- */
  function pivots(k, L) {
    const hi = [], lo = [];
    for (let i = L; i < k.length - L; i++) {
      let H = true, Lw = true;
      for (let j = i - L; j <= i + L; j++) { if (j === i) continue; if (j < i ? k[j].h > k[i].h : k[j].h >= k[i].h) H = false; if (j < i ? k[j].l < k[i].l : k[j].l <= k[i].l) Lw = false; }
      if (H) hi.push({ i, p: k[i].h, t: k[i].t, kind: "H" }); if (Lw) lo.push({ i, p: k[i].l, t: k[i].t, kind: "L" });
    }
    return { hi, lo };
  }
  function structure(k, tf, L = 3) {
    if (!k || k.length < 40) return null;
    const n = k.length, P = pivots(k, L), px = k[n - 1].c;
    // label swings against the previous swing of the same kind
    P.hi.forEach((s, j) => (s.lab = j ? (s.p > P.hi[j - 1].p ? "HH" : "LH") : "H"));
    P.lo.forEach((s, j) => (s.lab = j ? (s.p > P.lo[j - 1].p ? "HL" : "LL") : "L"));
    // walk forward: a swing becomes usable L bars after it prints; a close through it is a break
    let trend = 0, ih = 0, il = 0, H = null, Lo = null, prot = null; const ev = [];
    for (let i = 0; i < n; i++) {
      while (ih < P.hi.length && P.hi[ih].i + L <= i) { H = { ...P.hi[ih], broken: false }; ih++; }
      while (il < P.lo.length && P.lo[il].i + L <= i) { Lo = { ...P.lo[il], broken: false }; il++; }
      const x = k[i];
      if (H && !H.broken && x.c > H.p) {
        const type = trend < 0 ? "CHoCH" : "BOS"; H.broken = true;
        let lo = Infinity, li = H.i; for (let j = H.i; j <= i; j++) if (k[j].l < lo) { lo = k[j].l; li = j; }
        ev.push({ i, t: x.t, type, dir: 1, p: H.p, from: H.lab, tf });
        prot = { side: "low", p: lo, i: li, t: k[li].t }; trend = 1;
      }
      if (Lo && !Lo.broken && x.c < Lo.p) {
        const type = trend > 0 ? "CHoCH" : "BOS"; Lo.broken = true;
        let hi = -Infinity, hi_i = Lo.i; for (let j = Lo.i; j <= i; j++) if (k[j].h > hi) { hi = k[j].h; hi_i = j; }
        ev.push({ i, t: x.t, type, dir: -1, p: Lo.p, from: Lo.lab, tf });
        prot = { side: "high", p: hi, i: hi_i, t: k[hi_i].t }; trend = -1;
      }
    }
    const lastEv = last(ev) || null;
    // the extreme of the current leg = where the next BOS would trigger
    let legX = null;
    if (lastEv) { const seg = k.slice(lastEv.i); legX = trend > 0 ? Math.max(...seg.map((x) => x.h)) : Math.min(...seg.map((x) => x.l)); }
    const bosLv = trend > 0 ? (H && !H.broken && H.p > px ? H.p : legX) : trend < 0 ? (Lo && !Lo.broken && Lo.p < px ? Lo.p : legX) : null;
    const chochLv = prot ? prot.p : null;
    const seq = [...P.hi.slice(-3), ...P.lo.slice(-3)].sort((a, b) => a.i - b.i).slice(-5).map((s) => s.lab);
    // strength of the current trend: how many BOS in a row since the last CHoCH
    let run = 0; for (let j = ev.length - 1; j >= 0 && ev[j].dir === trend; j--) { run++; if (ev[j].type === "CHoCH") break; }
    // liquidity pools: equal highs / lows nobody has traded through yet
    const a = atrOf(k), tol = Math.max(px * 0.0008, a * 0.15), pools = [];
    const pool = (arr, side) => {
      const live = arr.slice(-12).filter((s) => { const after = k.slice(s.i + 1); return side > 0 ? after.every((x) => x.h <= s.p + tol * 0.3) : after.every((x) => x.l >= s.p - tol * 0.3); });
      for (let x = 0; x < live.length; x++) for (let y = x + 1; y < live.length; y++) if (Math.abs(live[x].p - live[y].p) <= tol && live[y].i - live[x].i >= 3) {
        const p = side > 0 ? Math.max(live[x].p, live[y].p) : Math.min(live[x].p, live[y].p);
        if (!pools.some((q) => q.side === side && Math.abs(q.p - p) <= tol)) pools.push({ side, p, t: live[y].t, n: 2, tf });
        else pools.find((q) => q.side === side && Math.abs(q.p - p) <= tol).n++;
      }
    };
    pool(P.hi, 1); pool(P.lo, -1);
    return { tf, trend, ev, lastEv, bosLv, chochLv, prot, seq, run, pools, swings: P, fvg: fvgs(k, tf), ob: orderBlocks(k, ev, tf), px, n, t: k[n - 1].t };
  }
  function atrOf(k, n = 14) { let s = 0, c = 0; for (let i = Math.max(1, k.length - n); i < k.length; i++) { s += Math.max(k[i].h - k[i].l, Math.abs(k[i].h - k[i - 1].c), Math.abs(k[i].l - k[i - 1].c)); c++; } return c ? s / c : 0; }
  // fair value gaps (3-candle imbalances) still open
  function fvgs(k, tf) {
    const out = [], n = k.length, px = k[n - 1].c, minSz = px * 0.0008;
    for (let i = 2; i < n; i++) {
      if (k[i].l > k[i - 2].h && k[i].l - k[i - 2].h >= minSz) out.push({ dir: 1, top: k[i].l, bot: k[i - 2].h, i, t: k[i - 1].t, tf });
      if (k[i].h < k[i - 2].l && k[i - 2].l - k[i].h >= minSz) out.push({ dir: -1, top: k[i - 2].l, bot: k[i].h, i, t: k[i - 1].t, tf });
    }
    const open = [];
    for (const g of out) {
      let top = g.top, bot = g.bot, filled = false;
      for (let j = g.i + 1; j < n && !filled; j++) {
        if (g.dir > 0) { if (k[j].l <= bot) filled = true; else if (k[j].l < top) top = k[j].l; }
        else { if (k[j].h >= top) filled = true; else if (k[j].h > bot) bot = k[j].h; }
      }
      if (!filled && top - bot >= minSz * 0.5) open.push({ ...g, top, bot, mid: (top + bot) / 2, size: ((top - bot) / px) * 100 });
    }
    return open.filter((g) => Math.abs(g.mid - px) / px < 0.08).slice(-8);
  }
  // order block = last opposite candle before the impulse that broke structure, until price closes through it
  function orderBlocks(k, ev, tf) {
    const out = [], n = k.length;
    for (const e of ev.slice(-8)) {
      let j = e.i - 1; const lim = Math.max(0, e.i - 15);
      while (j > lim && !(e.dir > 0 ? k[j].c < k[j].o : k[j].c > k[j].o)) j--;
      if (j <= lim) continue;
      const ob = { dir: e.dir, top: k[j].h, bot: k[j].l, t: k[j].t, i: j, tf, from: e.type };
      let dead = false; for (let x = e.i + 1; x < n; x++) if (e.dir > 0 ? k[x].c < ob.bot : k[x].c > ob.top) { dead = true; break; }
      if (!dead) out.push({ ...ob, mid: (ob.top + ob.bot) / 2 });
    }
    return out.slice(-3);
  }

  /* ---------- volume profile (POC / value area) ---------- */
  function vprofile(k, bins = 60) {
    if (!k || k.length < 10) return null;
    const lo = Math.min(...k.map((x) => x.l)), hi = Math.max(...k.map((x) => x.h)), step = (hi - lo) / bins || 1, vol = new Array(bins).fill(0);
    for (const x of k) { const a = Math.floor((x.l - lo) / step), b = Math.min(bins - 1, Math.floor((x.h - lo) / step)), per = x.v / (b - a + 1); for (let i = Math.max(0, a); i <= b; i++) vol[i] += per; }
    let pi = 0; vol.forEach((v, i) => { if (v > vol[pi]) pi = i; });
    const tot = vol.reduce((s, v) => s + v, 0); let acc = vol[pi], a = pi, b = pi;
    while (acc < tot * 0.7 && (a > 0 || b < bins - 1)) { const va = a > 0 ? vol[a - 1] : -1, vb = b < bins - 1 ? vol[b + 1] : -1; if (va >= vb) { a--; acc += va; } else { b++; acc += vb; } }
    return { poc: lo + (pi + 0.5) * step, val: lo + a * step, vah: lo + (b + 1) * step };
  }

  /* ---------- levels: cluster and rank ---------- */
  // raw: [{p, kind, label, w, tf?, usd?}]; returns clusters sorted by price
  function cluster(raw, px, tolPct = 0.18) {
    const L = raw.filter((r) => ok(r.p) && r.p > 0 && Math.abs(r.p - px) / px < 0.12).sort((a, b) => a.p - b.p), out = [];
    for (const r of L) {
      const z = last(out);
      if (z && ((r.p - z.hi) / px) * 100 <= tolPct) { z.items.push(r); z.hi = Math.max(z.hi, r.p); z.lo = Math.min(z.lo, r.p); }
      else out.push({ items: [r], lo: r.p, hi: r.p });
    }
    for (const z of out) {
      const W = z.items.reduce((s, r) => s + r.w, 0); z.p = z.items.reduce((s, r) => s + r.p * r.w, 0) / W;
      z.kinds = [...new Set(z.items.map((r) => r.kind))]; z.w = W;
      z.score = W * (1 + 0.3 * (z.kinds.length - 1));
      z.usd = z.items.reduce((s, r) => s + (r.usd || 0), 0);
      z.d = ((z.p - px) / px) * 100; z.side = z.p >= px ? 1 : -1;
      z.labels = [...new Set(z.items.sort((a, b) => b.w - a.w).map((r) => r.label))];
    }
    const sc = out.map((z) => z.score).sort((a, b) => a - b), q = (f) => sc[Math.floor(f * (sc.length - 1))] || 0;
    out.forEach((z) => (z.stars = z.score >= q(0.92) ? 5 : z.score >= q(0.78) ? 4 : z.score >= q(0.55) ? 3 : z.score >= q(0.3) ? 2 : 1));
    return out;
  }

  /* ---------- touch odds (random walk with a small drift) ---------- */
  const Phi = (x) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp((-x * x) / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; };
  // dist: signed % to the level; sig: hourly stdev of % returns; drift: % per hour (signed); hours
  function touchOdds(dist, sig, hours, drift = 0) {
    if (!ok(dist) || !ok(sig) || sig <= 0) return NaN;
    const m = Math.abs(dist), mu = drift * Math.sign(dist) * hours, s = sig * Math.sqrt(hours);
    const p = Phi((mu - m) / s) + Math.exp((2 * mu * m) / (s * s)) * Phi((-m - mu) / s);
    return clamp(p * 100, 1, 97);
  }
  function hourlySigma(k1h, n = 72) { const r = []; for (let i = Math.max(1, k1h.length - n); i < k1h.length; i++) r.push(((k1h[i].c - k1h[i - 1].c) / k1h[i - 1].c) * 100); return std(r); }

  const api = { ema, adx, effRatio, bbWidth, pctRank, regime, pivots, structure, fvgs, orderBlocks, vprofile, cluster, touchOdds, hourlySigma, atrOf, PLAY };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SG = api;
})(typeof window !== "undefined" ? window : globalThis);
