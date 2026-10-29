/* BTC Dashboard v2 analysis engine: pure functions, no network or DOM.
   Candles are {t (sec), o, h, l, c, v (BTC), tb (taker-buy BTC)} ascending; the last one may still be forming. */
(function (g) {
  "use strict";
  const ok = (v) => typeof v === "number" && Number.isFinite(v);
  const last = (a) => a[a.length - 1];
  const lastOk = (a) => { for (let i = a.length - 1; i >= 0; i--) if (ok(a[i])) return a[i]; return null; };

  /* ---------- indicators ---------- */
  function ema(v, n) {
    const out = new Array(v.length).fill(null); if (v.length < n) return out;
    const a = 2 / (n + 1); let e = 0; for (let i = 0; i < n; i++) e += v[i]; e /= n; out[n - 1] = e;
    for (let i = n; i < v.length; i++) { e = v[i] * a + e * (1 - a); out[i] = e; }
    return out;
  }
  function sma(v, n) {
    const out = new Array(v.length).fill(null); let s = 0, bad = 0;
    for (let i = 0; i < v.length; i++) {
      if (ok(v[i])) s += v[i]; else bad++;
      if (i >= n) { if (ok(v[i - n])) s -= v[i - n]; else bad--; }
      if (i >= n - 1 && bad === 0) out[i] = s / n;
    }
    return out;
  }
  function rsi(v, n = 14) {
    const out = new Array(v.length).fill(null); if (v.length <= n) return out;
    let up = 0, dn = 0;
    for (let i = 1; i <= n; i++) { const d = v[i] - v[i - 1]; if (d > 0) up += d; else dn -= d; }
    up /= n; dn /= n; out[n] = dn === 0 ? 100 : 100 - 100 / (1 + up / dn);
    for (let i = n + 1; i < v.length; i++) {
      const d = v[i] - v[i - 1]; up = (up * (n - 1) + Math.max(d, 0)) / n; dn = (dn * (n - 1) + Math.max(-d, 0)) / n;
      out[i] = dn === 0 ? 100 : 100 - 100 / (1 + up / dn);
    }
    return out;
  }
  function macd(v) {
    const e12 = ema(v, 12), e26 = ema(v, 26);
    const m = v.map((_, i) => (e12[i] !== null && e26[i] !== null ? e12[i] - e26[i] : null));
    const st = m.findIndex((x) => x !== null), sig = new Array(v.length).fill(null);
    if (st >= 0) { const s = ema(m.slice(st), 9); for (let i = 0; i < s.length; i++) sig[st + i] = s[i]; }
    return { m, sig, hist: m.map((x, i) => (x !== null && sig[i] !== null ? x - sig[i] : null)) };
  }
  function stochRsi(v) {
    const r = rsi(v, 14), raw = new Array(v.length).fill(null);
    for (let i = 0; i < v.length; i++) {
      if (r[i] === null || i < 13 || r[i - 13] === null) continue;
      let lo = Infinity, hi = -Infinity; for (let j = i - 13; j <= i; j++) { lo = Math.min(lo, r[j]); hi = Math.max(hi, r[j]); }
      raw[i] = hi === lo ? 50 : ((r[i] - lo) / (hi - lo)) * 100;
    }
    const k = sma(raw, 3); return { k, d: sma(k, 3) };
  }
  function atr(k, n = 14) {
    const out = new Array(k.length).fill(null); if (k.length <= n) return out;
    const tr = k.map((x, i) => (i ? Math.max(x.h - x.l, Math.abs(x.h - k[i - 1].c), Math.abs(x.l - k[i - 1].c)) : x.h - x.l));
    let a = 0; for (let i = 1; i <= n; i++) a += tr[i]; a /= n; out[n] = a;
    for (let i = n + 1; i < k.length; i++) { a = (a * (n - 1) + tr[i]) / n; out[i] = a; }
    return out;
  }
  function bb(c, n = 20, m = 2) {
    const mid = sma(c, n);
    return c.map((x, i) => {
      if (mid[i] === null) return null;
      let s = 0; for (let j = i - n + 1; j <= i; j++) s += (c[j] - mid[i]) ** 2;
      const sd = Math.sqrt(s / n), up = mid[i] + m * sd, lo = mid[i] - m * sd;
      return { mid: mid[i], up, lo, w: ((up - lo) / mid[i]) * 100, pb: up === lo ? 0.5 : (x - lo) / (up - lo) };
    });
  }
  function vwapDaily(k) { let pv = 0, vv = 0, day = -1; return k.map((r) => { const d = Math.floor(r.t / 86400); if (d !== day) { day = d; pv = 0; vv = 0; } pv += ((r.h + r.l + r.c) / 3) * r.v; vv += r.v; return vv ? pv / vv : r.c; }); }
  function cvd(k) { let s = 0; return k.map((r) => (s += 2 * r.tb - r.v)); }

  /* ---------- structure ---------- */
  function pivots(k, L = 3, R = 3) {
    const hi = [], lo = [];
    for (let i = L; i < k.length - R; i++) {
      let isH = true, isL = true;
      for (let j = i - L; j <= i + R; j++) {
        if (j === i) continue;
        if (j < i ? k[j].h > k[i].h : k[j].h >= k[i].h) isH = false;
        if (j < i ? k[j].l < k[i].l : k[j].l <= k[i].l) isL = false;
      }
      if (isH) hi.push({ i, p: k[i].h, t: k[i].t });
      if (isL) lo.push({ i, p: k[i].l, t: k[i].t });
    }
    return { hi, lo };
  }
  function structure(k) {
    const { hi, lo } = pivots(k.slice(0, -1), 3, 3);
    if (hi.length < 2 || lo.length < 2) return { dir: 0, label: "Not enough swings" };
    const [h1, h2] = hi.slice(-2), [l1, l2] = lo.slice(-2), hh = h2.p > h1.p, hl = l2.p > l1.p;
    if (hh && hl) return { dir: 1, label: "Uptrend · higher highs and higher lows", hh, hl };
    if (!hh && !hl) return { dir: -1, label: "Downtrend · lower highs and lower lows", hh, hl };
    return { dir: 0, label: hh ? "Mixed · higher high, lower low" : "Mixed · lower high, higher low", hh, hl };
  }

  /* ---------- per-timeframe assessment ---------- */
  const MA_E = [9, 21, 50, 100, 200], MA_S = [20, 50, 100, 200];
  function analyze(k, tf) {
    if (!k || k.length < 60) return null;
    const c = k.map((x) => x.c), px = last(c), n = c.length;
    const E = {}, S = {}; MA_E.forEach((p) => (E[p] = ema(c, p))); MA_S.forEach((p) => (S[p] = sma(c, p)));
    const e = (p) => E[p][n - 1], r = rsi(c), M = macd(c), SR = stochRsi(c), A = atr(k), B = bb(c), st = structure(k);
    const intra = ["5m", "15m", "30m", "1h"].includes(tf), vw = intra ? last(vwapDaily(k)) : null;
    const vAvg = k.slice(-21, -1).reduce((a, x) => a + x.v, 0) / 20, vr = vAvg ? k[n - 2].v / vAvg : null;
    const o = {
      tf, px, ema: {}, sma: {}, rsi: r[n - 1], rsiPrev: r[n - 2], hist: M.hist[n - 1], histPrev: M.hist[n - 2],
      stK: SR.k[n - 1], stD: SR.d[n - 1], bb: B[n - 1], atr: A[n - 1], atrPct: A[n - 1] ? (A[n - 1] / px) * 100 : null, vwap: vw, st, vr, votes: [],
    };
    MA_E.forEach((p) => (o.ema[p] = e(p))); MA_S.forEach((p) => (o.sma[p] = S[p][n - 1]));
    // EMA 50/200 cross in the last 30 bars
    for (let i = n - 1; i > n - 31 && i > 0; i--) {
      const a = E[50][i], b = E[200][i], a0 = E[50][i - 1], b0 = E[200][i - 1];
      if ([a, b, a0, b0].every(ok) && Math.sign(a - b) !== Math.sign(a0 - b0)) { o.cross = { dir: a > b ? 1 : -1, ago: n - 1 - i }; break; }
    }
    const V = (key, label, v, txt) => o.votes.push({ key, label, v, txt });
    V("st", "Structure", st.dir, st.label);
    const e9 = e(9), e21 = e(21), e50 = e(50);
    if ([e9, e21, e50].every(ok)) { const s = e9 > e21 && e21 > e50 ? 1 : e9 < e21 && e21 < e50 ? -1 : 0; V("ema", "EMA 9/21/50", s, s > 0 ? "Bull stack" : s < 0 ? "Bear stack" : "Tangled"); }
    if (ok(e(200))) V("e200", "vs EMA 200", px > e(200) ? 1 : -1, `${px > e(200) ? "Above" : "Below"} ${Math.round(e(200)).toLocaleString("en-US")}`);
    if (ok(o.rsi)) V("rsi", "RSI 14", o.rsi > 55 ? 1 : o.rsi < 45 ? -1 : 0, `${o.rsi.toFixed(1)}${o.rsi >= 70 ? " overbought" : o.rsi <= 30 ? " oversold" : ""}`);
    if (ok(o.hist) && ok(o.histPrev)) { const rising = o.hist > o.histPrev; V("macd", "MACD hist", o.hist > 0 ? (rising ? 1 : 0) : rising ? 0 : -1, `${o.hist > 0 ? "+" : ""}${o.hist.toFixed(1)}, ${rising ? "rising" : "falling"}`); }
    if (ok(o.stK) && ok(o.stD)) V("stoch", "Stoch RSI", o.stK > o.stD && o.stK < 85 ? 1 : o.stK < o.stD && o.stK > 15 ? -1 : 0, `K ${o.stK.toFixed(0)} / D ${o.stD.toFixed(0)}`);
    if (intra && ok(vw)) V("vwap", "vs VWAP", px > vw ? 1 : -1, `${px > vw ? "Above" : "Below"} ${Math.round(vw).toLocaleString("en-US")}`);
    else if (o.bb) V("bb", "vs BB mid", px > o.bb.mid ? 1 : -1, `%B ${o.bb.pb.toFixed(2)} · width ${o.bb.w.toFixed(2)}%`);
    const sum = o.votes.reduce((a, x) => a + x.v, 0);
    o.score = Math.round((sum / o.votes.length) * 100);
    o.verdict = o.score >= 30 ? "Bullish" : o.score <= -30 ? "Bearish" : o.score > 0 ? "Neutral, leaning up" : o.score < 0 ? "Neutral, leaning down" : "Neutral";
    return o;
  }
  const TF_W = { "15m": 0.15, "30m": 0.25, "1h": 0.25, "4h": 0.25, "1d": 0.1 };
  function multiTF(map) {
    let s = 0, w = 0; for (const tf in map) if (map[tf] && TF_W[tf]) { s += map[tf].score * TF_W[tf]; w += TF_W[tf]; }
    return w ? Math.round(s / w) : null;
  }

  /* ---------- candle patterns ---------- */
  const Bd = (x) => Math.abs(x.c - x.o), Rg = (x) => x.h - x.l, Up = (x) => x.h - Math.max(x.o, x.c), Lw = (x) => Math.min(x.o, x.c) - x.l;
  const bull = (x) => x.c > x.o, bear = (x) => x.c < x.o;
  function candlePatterns(kAll, levels = [], scan = 24) {
    const k = kAll.slice(0, -1); // closed bars only
    const A = atr(k), out = [];
    for (let i = Math.max(8, k.length - scan); i < k.length; i++) {
      const at = A[i] || A[A.length - 1]; if (!ok(at)) continue;
      const x = k[i], b = k[i - 1], a = k[i - 2], tr = (k[i - 1].c - k[i - 6].c) / at;
      const vAvg = k.slice(Math.max(0, i - 20), i).reduce((s, r) => s + r.v, 0) / Math.min(20, i);
      const found = [];
      const P = (name, dir, n, note) => found.push({ name, dir, n, note });
      if (Rg(x) > 0.3 * at && Bd(x) <= 0.08 * Rg(x)) P("Doji", tr > 0.5 ? -1 : tr < -0.5 ? 1 : 0, 1, tr > 0.5 ? "Indecision after a rise" : tr < -0.5 ? "Indecision after a drop" : "Indecision");
      const small = 0.3 * Bd(x) + 0.1 * Rg(x);
      if (Rg(x) > 0.6 * at && Lw(x) >= 2 * Bd(x) && Up(x) <= small && Bd(x) > 0.05 * Rg(x)) {
        if (tr < -0.3) P("Hammer", 1, 1, "Long lower wick after a drop: buyers rejected lower prices");
        else if (tr > 0.3) P("Hanging man", -1, 1, "Long lower wick after a rise: early warning, needs confirmation");
      }
      if (Rg(x) > 0.6 * at && Up(x) >= 2 * Bd(x) && Lw(x) <= small && Bd(x) > 0.05 * Rg(x)) {
        if (tr > 0.3) P("Shooting star", -1, 1, "Long upper wick after a rise: sellers rejected higher prices");
        else if (tr < -0.3) P("Inverted hammer", 1, 1, "Long upper wick after a drop: buyers testing higher");
      }
      if (bear(b) && bull(x) && x.c >= b.o && x.o <= b.c && Bd(x) > Bd(b) * 1.05 && Bd(b) > 0.2 * at) P("Bullish engulfing", 1, 2, "Green body swallows the prior red body");
      if (bull(b) && bear(x) && x.c <= b.o && x.o >= b.c && Bd(x) > Bd(b) * 1.05 && Bd(b) > 0.2 * at) P("Bearish engulfing", -1, 2, "Red body swallows the prior green body");
      if (bear(b) && Bd(b) > 0.5 * at && bull(x) && x.o <= b.c && x.c > (b.o + b.c) / 2 && x.c < b.o) P("Piercing line", 1, 2, "Closes back above half of the prior red candle");
      if (bull(b) && Bd(b) > 0.5 * at && bear(x) && x.o >= b.c && x.c < (b.o + b.c) / 2 && x.c > b.o) P("Dark cloud cover", -1, 2, "Closes back below half of the prior green candle");
      if (Bd(b) > 0.6 * at && Bd(x) < 0.5 * Bd(b) && Math.max(x.o, x.c) <= Math.max(b.o, b.c) && Math.min(x.o, x.c) >= Math.min(b.o, b.c)) {
        if (bear(b) && bull(x)) P("Bullish harami", 1, 2, "Small green candle inside a big red one: selling slowing");
        if (bull(b) && bear(x)) P("Bearish harami", -1, 2, "Small red candle inside a big green one: buying slowing");
      }
      if (bear(a) && Bd(a) > 0.6 * at && Bd(b) < 0.35 * Bd(a) && bull(x) && x.c > (a.o + a.c) / 2) P("Morning star", 1, 3, "Big red, small pause, strong green: three-bar reversal");
      if (bull(a) && Bd(a) > 0.6 * at && Bd(b) < 0.35 * Bd(a) && bear(x) && x.c < (a.o + a.c) / 2) P("Evening star", -1, 3, "Big green, small pause, strong red: three-bar reversal");
      const strong = (y) => Bd(y) > 0.5 * Rg(y) && Bd(y) > 0.3 * at;
      if ([a, b, x].every(bull) && [a, b, x].every(strong) && b.c > a.c && x.c > b.c) P("Three white soldiers", 1, 3, "Three strong green closes in a row");
      if ([a, b, x].every(bear) && [a, b, x].every(strong) && b.c < a.c && x.c < b.c) P("Three black crows", -1, 3, "Three strong red closes in a row");
      if (bear(b) && bull(x) && Math.abs(b.l - x.l) <= 0.08 * at && tr < -0.3) P("Tweezer bottom", 1, 2, "Two candles hold the same low");
      if (bull(b) && bear(x) && Math.abs(b.h - x.h) <= 0.08 * at && tr > 0.3) P("Tweezer top", -1, 2, "Two candles reject the same high");
      if (Bd(x) >= 0.85 * Rg(x) && Rg(x) > 1.1 * at) P(bull(x) ? "Bullish marubozu" : "Bearish marubozu", bull(x) ? 1 : -1, 1, "Full-body candle with almost no wicks: strong control");
      if (x.h < b.h && x.l > b.l) P("Inside bar", 0, 2, `Compression inside the prior range ${Math.round(b.l).toLocaleString("en-US")}–${Math.round(b.h).toLocaleString("en-US")}`);
      for (const f of found) {
        const bars = k.slice(i - f.n + 1, i + 1), lo = Math.min(...bars.map((y) => y.l)), hi = Math.max(...bars.map((y) => y.h));
        let strength = 1; const why = [];
        if (x.v > 1.3 * vAvg) { strength++; why.push("high volume"); }
        const lv = levels.find((L) => (f.dir >= 0 ? Math.abs(lo - L.p) : Math.abs(hi - L.p)) <= 0.4 * at || (L.p >= lo && L.p <= hi));
        if (lv) { strength++; why.push("at " + lv.name); }
        out.push({ ...f, i, t: x.t, ago: k.length - 1 - i, strength: Math.min(3, strength), why, lo, hi,
          confirm: f.dir > 0 ? hi : f.dir < 0 ? lo : null, invalid: f.dir > 0 ? lo : f.dir < 0 ? hi : null });
      }
    }
    out.sort((p, q) => q.t - p.t || q.strength - p.strength);
    return out.filter((p, j) => !out.some((q, m) => m < j && q.name === p.name && Math.abs(q.i - p.i) <= 2)); // one entry per repeating run
  }

  /* ---------- chart patterns and divergences ---------- */
  function chartPatterns(kAll, tf) {
    const k = kAll.slice(0, -1), n = k.length, out = []; if (n < 40) return out;
    const A = atr(k), at = lastOk(A), px = kAll[kAll.length - 1].c, { hi, lo } = pivots(k, 3, 3);
    const c = k.map((x) => x.c), R = rsi(c), C = cvd(k);
    const tol = Math.max(px * 0.0025, 0.5 * at);
    if (hi.length >= 2) {
      const [h1, h2] = hi.slice(-2);
      if (h2.i - h1.i >= 5 && Math.abs(h1.p - h2.p) <= tol && n - 1 - h2.i <= 30) {
        const neck = Math.min(...k.slice(h1.i, h2.i + 1).map((x) => x.l)), top = (h1.p + h2.p) / 2;
        if (px < top + tol) out.push({ name: "Double top", dir: -1, status: px < neck ? "confirmed (broke neckline)" : "forming, watch the neckline", neck, target: neck - (top - neck), level: top, t: h2.t });
      }
      if (R[h1.i] !== null && R[h2.i] !== null && h2.p > h1.p && R[h2.i] < R[h1.i] - 2 && n - 1 - h2.i <= 20)
        out.push({ name: "Bearish RSI divergence", dir: -1, status: `price higher high, RSI lower high (${R[h1.i].toFixed(0)} → ${R[h2.i].toFixed(0)})`, level: h2.p, t: h2.t });
      if (h2.p > h1.p && C[h2.i] < C[h1.i] && n - 1 - h2.i <= 20)
        out.push({ name: "Bearish CVD divergence", dir: -1, status: "price higher high while spot CVD made a lower high", level: h2.p, t: h2.t });
    }
    if (lo.length >= 2) {
      const [l1, l2] = lo.slice(-2);
      if (l2.i - l1.i >= 5 && Math.abs(l1.p - l2.p) <= tol && n - 1 - l2.i <= 30) {
        const neck = Math.max(...k.slice(l1.i, l2.i + 1).map((x) => x.h)), bot = (l1.p + l2.p) / 2;
        if (px > bot - tol) out.push({ name: "Double bottom", dir: 1, status: px > neck ? "confirmed (broke neckline)" : "forming, watch the neckline", neck, target: neck + (neck - bot), level: bot, t: l2.t });
      }
      if (R[l1.i] !== null && R[l2.i] !== null && l2.p < l1.p && R[l2.i] > R[l1.i] + 2 && n - 1 - l2.i <= 20)
        out.push({ name: "Bullish RSI divergence", dir: 1, status: `price lower low, RSI higher low (${R[l1.i].toFixed(0)} → ${R[l2.i].toFixed(0)})`, level: l2.p, t: l2.t });
      if (l2.p < l1.p && C[l2.i] > C[l1.i] && n - 1 - l2.i <= 20)
        out.push({ name: "Bullish CVD divergence", dir: 1, status: "price lower low while spot CVD made a higher low", level: l2.p, t: l2.t });
    }
    return out.map((p) => ({ ...p, tf }));
  }

  /* ---------- geometric chart patterns: triangles, wedges, channels, flags, head and shoulders ---------- */
  function fitLine(pts) { // least squares through [{i,p}]
    const n = pts.length, mi = pts.reduce((s, q) => s + q.i, 0) / n, mp = pts.reduce((s, q) => s + q.p, 0) / n;
    let num = 0, den = 0; for (const q of pts) { num += (q.i - mi) * (q.p - mp); den += (q.i - mi) ** 2; }
    const m = den ? num / den : 0, b = mp - m * mi, res = Math.max(...pts.map((q) => Math.abs(q.p - (m * q.i + b))));
    return { m, b, at: (i) => m * i + b, res };
  }
  function geoPatterns(kAll, tf) {
    const k = kAll.slice(0, -1), n = k.length, out = []; if (n < 60) return out;
    const A = atr(k), at = lastOk(A), px = kAll[kAll.length - 1].c, now = n - 1, W0 = Math.max(0, n - 110);
    const { hi, lo } = pivots(k.slice(W0), 3, 3); hi.forEach((q) => (q.i += W0)); lo.forEach((q) => (q.i += W0));
    const lineObj = (L, i0, i1) => ({ i0, p0: L.at(i0), i1, p1: L.at(i1) });
    // 1) triangles / wedges / channels / range from the last 2–3 swing highs and lows
    const H = hi.slice(-3), Lw = lo.slice(-3);
    if (H.length >= 2 && Lw.length >= 2) {
      const pick = (arr, L) => (arr.length === 3 && L.res > 0.6 * at ? arr.slice(1) : arr);
      let U = fitLine(H), D = fitLine(Lw); const H2 = pick(H, U), L2 = pick(Lw, D); U = fitLine(H2); D = fitLine(L2);
      const i0 = Math.min(H2[0].i, L2[0].i), span = now - i0;
      if (span >= 12 && span <= 110 && U.res <= 0.6 * at && D.res <= 0.6 * at && U.at(i0) > D.at(i0)) {
        const du = U.m * span, dd = D.m * span, flat = 0.8 * at, w0 = U.at(i0) - D.at(i0), w1 = U.at(now) - D.at(now);
        const conv = w1 < w0 * 0.75 && w1 > 0, par = Math.abs(w1 - w0) <= 0.3 * w0, exp = w1 > w0 * 1.35;
        const upF = Math.abs(du) < flat, dnF = Math.abs(dd) < flat, upR = du >= flat, dnR = dd >= flat, upD = du <= -flat, dnD = dd <= -flat;
        let name = null, dir = 0, why = "";
        if (upF && dnR && conv) { name = "Ascending triangle"; dir = 1; why = "Flat ceiling with rising lows: buyers keep pressing into the same resistance."; }
        else if (dnF && upD && conv) { name = "Descending triangle"; dir = -1; why = "Flat floor with falling highs: sellers keep pressing into the same support."; }
        else if (upD && dnR) { name = "Symmetrical triangle"; dir = 0; why = "Lower highs and higher lows squeeze into a point; the break usually decides direction."; }
        else if (upR && dnR && conv) { name = "Rising wedge"; dir = -1; why = "Price climbing in a narrowing wedge: momentum fading, often breaks down."; }
        else if (upD && dnD && conv) { name = "Falling wedge"; dir = 1; why = "Price falling in a narrowing wedge: selling fading, often breaks up."; }
        else if (upR && dnR && par) { name = "Rising channel"; dir = 1; why = "Parallel up-trend: buy the lower line, trim at the upper line until it breaks."; }
        else if (upD && dnD && par) { name = "Falling channel"; dir = -1; why = "Parallel down-trend: sell the upper line, cover at the lower line until it breaks."; }
        else if (upF && dnF) { name = "Range"; dir = 0; why = "Sideways box: fade the edges, trade the breakout."; }
        else if (exp && H2.length === 3 && L2.length === 3) { name = "Broadening formation"; dir = 0; why = "Swings getting wider: volatile, two-sided, harder to trade."; }
        if (name) {
          const u = U.at(now), d = D.at(now), h0 = w0, st = px > u + 0.2 * at ? 1 : px < d - 0.2 * at ? -1 : 0;
          out.push({ kind: "geo", name, tf, dir, why, i0, lines: [{ ...lineObj(U, i0, now + 6), color: "dn" }, { ...lineObj(D, i0, now + 6), color: "up" }],
            touches: [...H2, ...L2], upper: u, lower: d,
            status: st > 0 ? "Broke out above the upper line" : st < 0 ? "Broke down below the lower line" : px - d < (u - d) * 0.25 ? "Inside, near the lower line" : u - px < (u - d) * 0.25 ? "Inside, near the upper line" : "Inside the pattern",
            breakUp: u, breakDn: d, tgtUp: u + h0, tgtDn: d - h0, brk: st });
        }
      }
    }
    // 2) flag / pennant: sharp pole, then a tight drift against it
    for (let len = 4; len <= 18; len++) {
      const e = now - len; if (e < 10) break;
      let best = null; for (let s = Math.max(0, e - 8); s < e - 1; s++) { const mv = k[e].c - k[s].c; if (!best || Math.abs(mv) > Math.abs(best.mv)) best = { s, mv }; }
      if (!best || Math.abs(best.mv) < 3 * at) continue;
      const pre = k.slice(Math.max(0, best.s - 20), best.s + 1).map((x) => x.c); if (pre.length > 5 && Math.abs(best.mv) < 1.3 * (Math.max(...pre) - Math.min(...pre))) continue; // pole must stand out
      const cons = k.slice(e + 1), ch = Math.max(...cons.map((x) => x.h)), cl = Math.min(...cons.map((x) => x.l)), pole = Math.abs(best.mv);
      if (ch - cl > 0.55 * pole) continue; const up = best.mv > 0;
      if (up ? cl < k[e].c - 0.5 * pole : ch > k[e].c + 0.5 * pole) continue;
      const U = fitLine(cons.map((x, j) => ({ i: e + 1 + j, p: x.h }))), D = fitLine(cons.map((x, j) => ({ i: e + 1 + j, p: x.l })));
      const pen = U.at(now) - D.at(now) < (U.at(e + 1) - D.at(e + 1)) * 0.6, st = up ? (px > ch ? 1 : 0) : px < cl ? -1 : 0;
      out.push({ kind: "flag", name: `${up ? "Bull" : "Bear"} ${pen ? "pennant" : "flag"}`, tf, dir: up ? 1 : -1, i0: best.s,
        why: up ? "Sharp rally (the pole) followed by a tight pause: often continues higher." : "Sharp drop (the pole) followed by a tight pause: often continues lower.",
        lines: [{ ...lineObj(U, e + 1, now + 4), color: "dn" }, { ...lineObj(D, e + 1, now + 4), color: "up" }, { i0: best.s, p0: k[best.s].c, i1: e, p1: k[e].c, color: up ? "up" : "dn", w: 3 }],
        status: st ? (up ? "Broke out of the flag" : "Broke down out of the flag") : "Still consolidating", breakUp: ch, breakDn: cl, tgtUp: ch + pole, tgtDn: cl - pole, brk: st });
      break;
    }
    // 3) head and shoulders (and inverse)
    const hs = (P, inv) => {
      if (P.length < 3) return; const [l, h, r] = P.slice(-3);
      const hd = inv ? Math.min(l.p, r.p) - h.p : h.p - Math.max(l.p, r.p);
      if (hd < 0.6 * at || Math.abs(l.p - r.p) > 1.4 * at || r.i - l.i < 10 || now - r.i > 25) return;
      const ext = (a, b) => { const seg = k.slice(a, b + 1); return inv ? seg.reduce((m, x, j) => (x.h > m.p ? { i: a + j, p: x.h } : m), { i: a, p: -Infinity }) : seg.reduce((m, x, j) => (x.l < m.p ? { i: a + j, p: x.l } : m), { i: a, p: Infinity }); };
      const n1 = ext(l.i, h.i), n2 = ext(h.i, r.i), N = fitLine([n1, n2]), neck = N.at(now), conf = inv ? px > neck : px < neck, height = Math.abs(h.p - N.at(h.i));
      out.push({ kind: "hs", name: inv ? "Inverse head and shoulders" : "Head and shoulders", tf, dir: inv ? 1 : -1, i0: l.i,
        why: inv ? "Three lows with the middle one deepest: sellers exhausted; confirms on a close above the neckline." : "Three highs with the middle one highest: buyers exhausted; confirms on a close below the neckline.",
        lines: [{ ...lineObj(N, l.i, now + 6), color: "warn" }], touches: [l, h, r, n1, n2], status: conf ? "Confirmed: neckline broken" : "Forming: watch the neckline",
        breakUp: inv ? neck : null, breakDn: inv ? null : neck, tgtUp: inv ? neck + height : null, tgtDn: inv ? null : neck - height, brk: conf ? (inv ? 1 : -1) : 0, neck });
    };
    hs(hi.slice(-3).length === 3 ? hi : [], false); hs(lo.slice(-3).length === 3 ? lo : [], true);
    return out;
  }

  /* ---------- levels and zones ---------- */
  function zones(px, raw) {
    const L = raw.filter((x) => ok(x.p) && Math.abs(x.p - px) / px <= 0.07).sort((a, b) => a.p - b.p), out = [];
    for (const x of L) {
      const z = last(out);
      if (z && (x.p - z.hi) / px <= 0.0012) { z.hi = Math.max(z.hi, x.p); z.w += x.w; z.sum += x.p * x.w; z.names.push(x.name); }
      else out.push({ lo: x.p, hi: x.p, w: x.w, sum: x.p * x.w, names: [x.name] });
    }
    return out.map((z) => ({ lo: z.lo, hi: z.hi, c: z.sum / z.w, w: z.w, names: [...new Set(z.names)], dist: ((z.sum / z.w - px) / px) * 100 }));
  }
  function swingLevels(k, tag, w) {
    const { hi, lo } = pivots(k.slice(0, -1), 3, 3);
    return [...hi.slice(-6).map((p) => ({ p: p.p, name: `${tag} swing high`, w })), ...lo.slice(-6).map((p) => ({ p: p.p, name: `${tag} swing low`, w }))];
  }

  /* ---------- setups and risk ---------- */
  function setups(px, Z, at, bias) {
    if (!Z.length || !ok(at)) return { longs: [], shorts: [] };
    const make = (side) => {
      const sup = side > 0 ? Z.filter((z) => z.c < px && z.dist >= -4.5) : Z.filter((z) => z.c > px && z.dist <= 4.5);
      return sup.map((z) => {
        const entry = side > 0 ? Math.min(px, z.hi) : Math.max(px, z.lo), buf = Math.max(0.6 * at, px * 0.0012);
        let stop = side > 0 ? z.lo - buf : z.hi + buf; if (Math.abs(entry - stop) < at) stop = entry - side * at; // never tighter than 1 ATR
        const risk = Math.abs(entry - stop);
        const tgt = Z.filter((r) => r !== z && side * (r.c - entry) > 0.5 * risk).sort((a, b) => side * (a.c - b.c));
        if (!tgt.length) return null;
        const tp1 = side > 0 ? tgt[0].lo : tgt[0].hi, tp2 = tgt[1] ? (side > 0 ? tgt[1].lo : tgt[1].hi) : entry + side * 2.5 * risk;
        const rr = Math.abs(tp1 - entry) / risk, dist = Math.abs(entry - px) / px * 100;
        const align = ok(bias) ? (side * bias + 100) / 200 : 0.5;
        const score = Math.round(Math.min(1, z.w / 7) * 35 + align * 30 + (Math.min(rr, 3) / 3) * 20 + Math.max(0, 1 - dist / 4.5) * 15);
        return { side, zone: z, entry, stop, tp1, tp2, rr, dist, score, conf: score >= 65 ? "High" : score >= 45 ? "Medium" : "Low", tp1z: tgt[0], tp2z: tgt[1] || null };
      }).filter((s) => s && s.rr >= 0.8).sort((a, b) => b.score - a.score).slice(0, 3);
    };
    return { longs: make(1), shorts: make(-1) };
  }
  function risk(s, lev, margin, mmr = 0.005) {
    const notional = margin * lev, qty = notional / s.entry, side = s.side;
    const liq = side > 0 ? s.entry * (1 - 1 / lev + mmr) : s.entry * (1 + 1 / lev - mmr);
    const pnl = (p) => side * (p - s.entry) * qty, roe = (p) => (pnl(p) / margin) * 100;
    const stopPct = Math.abs(s.entry - s.stop) / s.entry;
    return { notional, qty, liq, liqFirst: side > 0 ? liq >= s.stop : liq <= s.stop, maxLev: Math.max(1, Math.floor(0.9 / (stopPct + mmr))),
      sl: { pnl: pnl(s.stop), roe: roe(s.stop) }, tp1: { pnl: pnl(s.tp1), roe: roe(s.tp1) }, tp2: { pnl: pnl(s.tp2), roe: roe(s.tp2) } };
  }

  /* ---------- liquidation map (model) ---------- */
  const LEVS = [[5, 0.1], [10, 0.25], [25, 0.3], [50, 0.25], [100, 0.1]];
  function liqMap(k, oi, px, scale = 1) {
    if (!k || k.length < 24 || !oi || oi.length < 6) return null;
    const idx = new Map(k.map((x, i) => [x.t, i])), pos = [];
    for (let j = 1; j < oi.length; j++) {
      const i = idx.get(oi[j].t); if (i === undefined) continue;
      const d = (oi[j].v - oi[j - 1].v) * scale, bar = k[i], tp = (bar.h + bar.l + bar.c) / 3;
      if (d > 0) { const ls = bar.c >= bar.o ? 0.56 : 0.44; pos.push({ p: tp, i, l: d * ls, s: d * (1 - ls) }); }
      else if (d < 0) { const tot = pos.reduce((a, x) => a + x.l + x.s, 0); if (tot > 0) { const f = Math.max(0, 1 + d / tot); pos.forEach((x) => { x.l *= f; x.s *= f; }); } }
    }
    const n = k.length, minL = new Array(n + 1).fill(Infinity), maxH = new Array(n + 1).fill(-Infinity);
    for (let i = n - 1; i >= 0; i--) { minL[i] = Math.min(minL[i + 1], k[i].l); maxH[i] = Math.max(maxH[i + 1], k[i].h); }
    const step = Math.max(25, Math.round((px * 0.0015) / 25) * 25), bins = new Map(), MM = 0.004;
    const add = (p, side, usd) => { if (Math.abs(p - px) / px > 0.1) return; const b = Math.round(p / step) * step; const o = bins.get(b) || { p: b, long: 0, short: 0 }; o[side] += usd; bins.set(b, o); };
    for (const x of pos) for (const [L, w] of LEVS) {
      const lp = x.p * (1 - 1 / L + MM), sp = x.p * (1 + 1 / L - MM);
      if (minL[x.i + 1] > lp) add(lp, "long", x.l * w * x.p);
      if (maxH[x.i + 1] < sp) add(sp, "short", x.s * w * x.p);
    }
    const arr = [...bins.values()].sort((a, b) => a.p - b.p);
    const top = (side) => arr.filter((b) => b[side] > 0).sort((a, b) => b[side] - a[side]).slice(0, 4).map((b) => ({ p: b.p, usd: b[side], dist: ((b.p - px) / px) * 100 }));
    const within = (side, pct) => arr.filter((b) => Math.abs(b.p - px) / px <= pct / 100).reduce((a, b) => a + b[side], 0);
    return { bins: arr, step, longs: top("long"), shorts: top("short"), long3: within("long", 3), short3: within("short", 3), hours: oi.length };
  }

  /* liquidation heatmap over time: each hour's new leverage stays "alive" until price trades through it */
  function liqHeat(k, oi, px, scale = 1, range = 0.1) {
    if (!k || k.length < 24 || !oi || oi.length < 6) return null;
    const idx = new Map(k.map((x, i) => [x.t, i])), pos = [];
    for (let j = 1; j < oi.length; j++) {
      const i = idx.get(oi[j].t); if (i === undefined) continue;
      const d = (oi[j].v - oi[j - 1].v) * scale, bar = k[i], tp = (bar.h + bar.l + bar.c) / 3;
      if (d > 0) { const ls = bar.c >= bar.o ? 0.56 : 0.44; pos.push({ p: tp, i, l: d * ls, s: d * (1 - ls) }); }
    }
    const step = px * 0.002, lo = px * (1 - range), rows = Math.ceil((2 * range * px) / step), cols = k.length, grid = new Float32Array(cols * rows), MM = 0.004;
    const add = (p, from, to, usd) => { const r = Math.floor((p - lo) / step); if (r < 0 || r >= rows) return; for (let c = from; c <= to; c++) grid[c * rows + r] += usd; };
    for (const x of pos) for (const [L, w] of LEVS) {
      const lp = x.p * (1 - 1 / L + MM), sp = x.p * (1 + 1 / L - MM);
      let j = x.i + 1; while (j < cols && k[j].l > lp) j++; add(lp, x.i + 1, Math.min(cols - 1, j - 1), x.l * w * x.p);
      j = x.i + 1; while (j < cols && k[j].h < sp) j++; add(sp, x.i + 1, Math.min(cols - 1, j - 1), x.s * w * x.p);
    }
    let max = 0; for (let q = 0; q < grid.length; q++) if (grid[q] > max) max = grid[q];
    return { t0: k[0].t, dt: k.length > 1 ? k[1].t - k[0].t : 3600, cols, rows, lo, step, grid, max };
  }

  /* ---------- options helpers ---------- */
  function maxPain(opts) {
    const strikes = [...new Set(opts.map((o) => o.k))].sort((a, b) => a - b); let best = null;
    for (const S of strikes) {
      let pain = 0; for (const o of opts) pain += o.oi * (o.cp === "C" ? Math.max(0, S - o.k) : Math.max(0, o.k - S));
      if (!best || pain < best.pain) best = { k: S, pain };
    }
    return best ? best.k : null;
  }

  g.TA = { ok, ema, sma, rsi, macd, stochRsi, atr, bb, vwapDaily, cvd, pivots, structure, analyze, multiTF, candlePatterns, chartPatterns, geoPatterns, fitLine, zones, swingLevels, setups, risk, liqMap, liqHeat, maxPain, MA_E, MA_S };
})(typeof window !== "undefined" ? window : globalThis);
