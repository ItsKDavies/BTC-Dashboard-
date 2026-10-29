"use strict";
/* ===================== Stage 3: own canvas chart engine + new visuals ===================== */
const TF_SEC = { "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400 };
Object.assign(ST, {
  heat: LS.get("heat", true), bub: LS.get("bub", true), liqev: LS.get("liqev", false), liqb: LS.get("liqb", false), lpStyle: LS.get("lpStyle", "candles"), pat: LS.get("pat", false), trend: LS.get("trend", false), tlN: LS.get("tlN", "more"), cdl: LS.get("cdl", false), sess: LS.get("sess", true), my: LS.get("my", true),
  lowers: LS.get("lowers", ["bcvd"]), lineLbl: LS.get("lineLbl", true), subAdj: LS.get("subAdj", 0), clean: LS.get("clean", false), layersOpen: false,
});

/* ---------- engine ---------- */
function niceStep(span, n) { const raw = span / Math.max(1, n), mag = Math.pow(10, Math.floor(Math.log10(raw))); return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n + 0.5) || raw; }
class CChart {
  constructor(host) {
    this.host = host; host.innerHTML = ""; host.style.position = "relative";
    const c = (this.cv = document.createElement("canvas")); c.className = "cc"; c.setAttribute("aria-label", "BTC price chart"); c.setAttribute("role", "img"); host.appendChild(c);
    this.g = c.getContext("2d"); this.k = []; this.sec = 1800; this.x0 = 0; this.bars = 120; this.pad = 6; this.auto = true; this.yLo = 0; this.yHi = 1;
    this.L = {}; this.cross = null; this.ptr = new Map(); this.vx = 0; this.colors = () => ({});
    if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(host); else window.addEventListener("resize", () => this.resize());
    const gr = (this.grip = document.createElement("div")); gr.className = "cgrip"; gr.title = "Drag to resize the lower panes"; gr.innerHTML = "<i></i>"; gr.hidden = true; host.appendChild(gr); this.subAdj = 0;
    gr.addEventListener("pointerdown", (e) => { e.preventDefault(); try { gr.setPointerCapture(e.pointerId); } catch (er) {} this.gdrag = true; gr.classList.add("on"); });
    gr.addEventListener("pointermove", (e) => { if (!this.gdrag) return; const n = this.nSub(), avail = this.H - 20, y = e.clientY - this.host.getBoundingClientRect().top;
      this.subAdj = Math.max(0.14, Math.min(0.72, (avail - 6 - y) / avail)) - this.subBase(n); this.dirty(); });
    const gup = () => { if (!this.gdrag) return; this.gdrag = false; gr.classList.remove("on"); if (this.onSplit) this.onSplit(this.subAdj); };
    gr.addEventListener("pointerup", gup); gr.addEventListener("pointercancel", gup);
    gr.addEventListener("dblclick", () => { this.subAdj = 0; this.dirty(); if (this.onSplit) this.onSplit(0); });
    this.resize(); this.bind();
  }
  nSub() { return this.L.subs ? this.L.subs.length : 0; }
  subBase(n) { return [0, 0.22, 0.38, 0.48, 0.54][Math.min(4, n)]; }
  resize() { const r = this.host.getBoundingClientRect(), d = window.devicePixelRatio || 1; this.W = Math.max(200, r.width); this.H = Math.max(160, r.height); this.d = d; this.cv.width = Math.round(this.W * d); this.cv.height = Math.round(this.H * d); this.cv.style.width = this.W + "px"; this.cv.style.height = this.H + "px"; this.draw(); }
  setData(k, sec, keep) { const end = this.atEnd(), fresh = !this.k.length || !keep; this.k = k; this.sec = sec; if (fresh) this.reset(); else if (end) this.x0 = this.k.length + this.pad - this.bars; this.dirty(); }
  atEnd() { return !this.k.length || this.x0 + this.bars >= this.k.length - 1; }
  defBars() { return Math.round(Math.min(160, Math.max(40, this.W / 7))); }
  reset(n) { this.bars = n || this.defBars(); this.x0 = this.k.length + this.pad - this.bars; this.auto = true; this.dirty(); this.emit(); }
  layout() { const axW = 66, tH = 20, n = this.nSub(), sub = n ? Math.round((this.H - tH) * Math.max(0.14, Math.min(0.72, this.subBase(n) + this.subAdj))) : 0, mainH = this.H - tH - (sub ? sub + 6 : 0); return { r: this.W - axW, axW, mainH, subTop: mainH + 6, subH: sub, tTop: this.H - tH }; }
  bw() { return this.layout().r / this.bars; }
  X(i) { return (i - this.x0 + 0.5) * this.bw(); }
  I(x) { return x / this.bw() + this.x0 - 0.5; }
  ti(t) { return this.k.length ? (t - this.k[0].t) / this.sec : 0; }
  vis() { return [Math.max(0, Math.floor(this.x0)), Math.min(this.k.length - 1, Math.ceil(this.x0 + this.bars))]; }
  yRange() {
    if (!this.auto) return; const [a, b] = this.vis(); let lo = Infinity, hi = -Infinity;
    for (let i = a; i <= b; i++) { const x = this.k[i]; if (x.l < lo) lo = x.l; if (x.h > hi) hi = x.h; }
    if (!isFinite(lo)) { lo = 0; hi = 1; } const p = (hi - lo) * 0.08 || 1; this.yLo = lo - p; this.yHi = hi + p;
  }
  Y(p) { const L = this.layout(); return 6 + (1 - (p - this.yLo) / (this.yHi - this.yLo)) * (L.mainH - 12); }
  P(y) { const L = this.layout(); return this.yLo + (1 - (y - 6) / (L.mainH - 12)) * (this.yHi - this.yLo); }
  clamp() { const n = this.k.length; this.bars = Math.max(12, Math.min(1000, this.bars)); this.x0 = Math.max(-this.bars * 0.5, Math.min(n + this.pad * 4 - this.bars * 0.3, this.x0)); }
  dirty() { if (this.q) return; this.q = requestAnimationFrame(() => { this.q = 0; this.draw(); }); }
  emit() { if (this.onView) { clearTimeout(this.vt); this.vt = setTimeout(() => this.onView(), 120); } }
  zoom(f) { const end = this.x0 + this.bars; this.bars *= f; this.clamp(); this.x0 = end - this.bars; this.clamp(); this.dirty(); this.emit(); }
  crossBar() { if (!this.cross || !this.k.length) return null; const i = Math.round(this.I(this.cross.x)); return this.k[Math.max(0, Math.min(this.k.length - 1, i))]; }
  bind() {
    const c = this.cv, pos = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    c.addEventListener("pointerdown", (e) => {
      const p = pos(e); try { c.setPointerCapture(e.pointerId); } catch (er) {}
      this.ptr.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y }); this.vx = 0; cancelAnimationFrame(this.inert);
      if (this.ptr.size === 2) { const [a, b] = [...this.ptr.values()]; this.pinch = { d: Math.max(20, Math.abs(a.x - b.x)), bars: this.bars, idx: this.I((a.x + b.x) / 2) }; this.drag = null; }
      else if (this.ptr.size === 1) this.drag = { axis: p.x > this.layout().r, x0: this.x0, yLo: this.yLo, yHi: this.yHi, moved: false, full: !!this.host.closest(".full"), mouse: e.pointerType === "mouse" };
    });
    c.addEventListener("pointermove", (e) => {
      const p = pos(e), q = this.ptr.get(e.pointerId);
      if (!q) { if (e.pointerType === "mouse") { this.cross = p; this.dirty(); if (this.onCross) this.onCross(this.crossBar()); } return; }
      const lastX = q.x; q.x = p.x; q.y = p.y;
      if (this.ptr.size >= 2 && this.pinch) {
        const [a, b] = [...this.ptr.values()], d = Math.max(20, Math.abs(a.x - b.x));
        this.bars = (this.pinch.bars * this.pinch.d) / d; this.clamp(); this.x0 = this.pinch.idx - ((a.x + b.x) / 2) / this.bw() + 0.5; this.clamp();
        this.cross = null; this.dirty(); this.emit(); return;
      }
      const dr = this.drag; if (!dr) return; const dx = p.x - q.sx, dy = p.y - q.sy;
      if (!dr.moved && Math.abs(dx) + Math.abs(dy) > 6) dr.moved = true; if (!dr.moved) return;
      if (dr.axis) { const f = Math.exp(dy * 0.006), mid = (dr.yLo + dr.yHi) / 2, half = ((dr.yHi - dr.yLo) / 2) * f; this.auto = false; this.yLo = mid - half; this.yHi = mid + half; this.dirty(); return; }
      this.x0 = dr.x0 - dx / this.bw(); this.vx = p.x - lastX; this.clamp();
      if (dr.full || (dr.mouse && !this.auto)) { const span = dr.yHi - dr.yLo, dp = (dy / (this.layout().mainH - 12)) * span; this.auto = false; this.yLo = dr.yLo + dp; this.yHi = dr.yHi + dp; }
      this.cross = null; this.dirty(); this.emit();
    });
    const up = (e) => {
      const q = this.ptr.get(e.pointerId); this.ptr.delete(e.pointerId); if (this.ptr.size < 2) this.pinch = null;
      if (this.ptr.size) return; const dr = this.drag; this.drag = null; if (!dr) return;
      if (q && !dr.moved && e.type === "pointerup") {
        const now = performance.now();
        if (now - (this.lastTap || 0) < 320) { if (dr.axis) this.auto = true; else this.reset(); this.lastTap = 0; this.cross = null; }
        else { this.lastTap = now; if (!dr.axis) { this.cross = this.cross && !dr.mouse ? null : { x: q.x, y: q.y }; if (this.onCross) this.onCross(this.cross ? this.crossBar() : null); } }
        this.dirty();
      } else if (dr.moved && !dr.axis && Math.abs(this.vx) > 2) this.inertia();
    };
    c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);
    c.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse" && !this.ptr.size) { this.cross = null; this.dirty(); if (this.onCross) this.onCross(null); } });
    c.addEventListener("wheel", (e) => {
      e.preventDefault(); const p = pos(e);
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) this.x0 += (e.deltaX || e.deltaY) / this.bw();
      else { const idx = this.I(p.x); this.bars *= Math.exp(e.deltaY * 0.0015); this.clamp(); this.x0 = idx - p.x / this.bw() + 0.5; }
      this.clamp(); this.dirty(); this.emit();
    }, { passive: false });
    ["gesturestart", "gesturechange", "gestureend"].forEach((ev) => c.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
    c.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  inertia() { let v = this.vx; const step = () => { v *= 0.88; if (Math.abs(v) < 0.4) { this.emit(); return; } this.x0 -= v / this.bw(); this.clamp(); this.draw(); this.inert = requestAnimationFrame(step); }; this.inert = requestAnimationFrame(step); }

  /* ---------- drawing ---------- */
  draw() {
    const g = this.g, C = this.colors(), Ls = this.L; g.setTransform(this.d || 1, 0, 0, this.d || 1, 0, 0);
    g.fillStyle = C.bg || "#111"; g.fillRect(0, 0, this.W, this.H); g.font = "11.5px IBM Plex Sans, system-ui, sans-serif"; g.textBaseline = "middle";
    if (!this.k.length) { g.fillStyle = C.fg3; g.fillText("Loading candles…", 12, 24); return; }
    const L = this.layout(); this.yRange(); const [a, b] = this.vis(), bw = this.bw();
    { const gr = g.createLinearGradient(0, 0, 0, L.mainH); gr.addColorStop(0, rgba(C.acc, 0.05)); gr.addColorStop(0.55, rgba(C.acc, 0)); gr.addColorStop(1, rgba(C.purple || C.acc, 0.05)); g.fillStyle = gr; g.fillRect(0, 0, L.r, L.mainH); }
    // grid
    const ys = niceStep(this.yHi - this.yLo, Math.max(3, Math.round(L.mainH / 70))), yt = [];
    g.strokeStyle = C.grid; g.lineWidth = 1; g.beginPath();
    for (let v = Math.ceil(this.yLo / ys) * ys; v <= this.yHi; v += ys) { const y = Math.round(this.Y(v)) + 0.5; g.moveTo(0, y); g.lineTo(L.r, y); yt.push([v, y]); }
    const secPx = this.sec / bw, cands = [300, 900, 1800, 3600, 7200, 14400, 21600, 43200, 86400, 172800, 604800, 1209600, 2592000], step = cands.find((s) => s / secPx >= 90) || 2592000;
    const off = -new Date().getTimezoneOffset() * 60, t0 = this.k[0].t + (this.x0 - 1) * this.sec, t1 = this.k[0].t + (this.x0 + this.bars + 1) * this.sec, xt = [];
    for (let t = Math.ceil((t0 + off) / step) * step - off; t <= t1; t += step) { const x = Math.round(this.X(this.ti(t))) + 0.5; if (x < 0 || x > L.r) continue; g.moveTo(x, 0); g.lineTo(x, L.mainH); if (L.subH) { g.moveTo(x, L.subTop); g.lineTo(x, L.subTop + L.subH); } xt.push([t, x]); }
    g.stroke();
    g.save(); g.beginPath(); g.rect(0, 0, L.r, L.mainH); g.clip();
    // session bands
    for (const s of Ls.sessions || []) { const xa = this.X(this.ti(s.t0) - 0.5), xb = this.X(this.ti(s.t1) - 0.5); if (xb < 0 || xa > L.r) continue; g.fillStyle = rgba(s.color, 0.08); g.fillRect(xa, 0, xb - xa, L.mainH); if (xb - xa > 46) { g.fillStyle = rgba(s.color, 0.85); g.font = "600 10.5px IBM Plex Sans, system-ui, sans-serif"; g.fillText(s.name, Math.max(xa + 4, 4), 12); g.font = "11.5px IBM Plex Sans, system-ui, sans-serif"; } }
    // liquidation heatmap
    const H = Ls.heat;
    if (H && H.max > 0) {
      const ca = Math.max(0, Math.floor(this.ti(t0) * this.sec / H.dt + (this.k[0].t - H.t0) / H.dt) - 1);
      for (let c = ca; c < H.cols; c++) {
        const tA = H.t0 + c * H.dt, xa = this.X(this.ti(tA) - 0.5), xb = this.X(this.ti(tA + H.dt) - 0.5); if (xa > L.r) break; if (xb < 0) continue;
        for (let r = 0; r < H.rows; r++) {
          const v = H.grid[c * H.rows + r]; if (v < H.max * 0.06) continue; const pa = H.lo + r * H.step, y1 = this.Y(pa + H.step), y2 = this.Y(pa); if (y2 < 0 || y1 > L.mainH) continue;
          const t = Math.pow(v / H.max, 0.75); g.fillStyle = heatColor(t); g.fillRect(xa, y1, Math.max(1, xb - xa + 0.5), Math.max(1, y2 - y1 + 0.5));
        }
      }
    }
    // liquidation cluster bands (estimated)
    for (const z of Ls.liqBands || []) { const y1 = this.Y(z.p + z.h / 2), y2 = this.Y(z.p - z.h / 2), hgt = Math.max(5, y2 - y1); g.fillStyle = rgba(z.color, 0.12 + 0.28 * z.w); g.fillRect(0, y1, L.r, hgt); g.fillStyle = z.color; g.font = "700 10.5px IBM Plex Sans, system-ui, sans-serif"; g.fillText(z.label, 6, y1 + hgt / 2); g.font = "11.5px IBM Plex Sans, system-ui, sans-serif"; }
    // zone boxes
    for (const z of Ls.boxes || []) { const y1 = this.Y(z.hi), y2 = this.Y(z.lo); g.fillStyle = rgba(z.color, 0.13); g.fillRect(0, Math.min(y1, y2) - 2, L.r, Math.max(4, Math.abs(y2 - y1) + 4)); }
    // value area shading
    const PF = Ls.profile; if (PF) { const y1 = this.Y(PF.vah), y2 = this.Y(PF.val); g.fillStyle = rgba(C.acc, 0.07); g.fillRect(0, y1, L.r, y2 - y1); }
    // volume
    let mv = 0; for (let i = a; i <= b; i++) mv = Math.max(mv, this.k[i].v);
    const cwid = Math.max(1, Math.min(bw * 0.72, bw - 1)), vH = L.mainH * 0.16;
    for (let i = a; i <= b; i++) { const x = this.k[i], h = mv ? (x.v / mv) * vH : 0, X = this.X(i); g.fillStyle = rgba(x.c >= x.o ? (Ls.mono ? C.fg3 : C.up) : (Ls.mono ? C.fg3 : C.dn), 0.28); g.fillRect(X - cwid / 2, L.mainH - h, cwid, h); }
    // candles
    const HL = Ls.hl && Ls.hl.size ? Ls.hl : null;
    if (HL) for (let i = a; i <= b; i++) { const hc = HL.get(i); if (!hc) continue; const x = this.k[i], X = this.X(i), y1 = this.Y(x.h) - 6, y2 = this.Y(x.l) + 6;
      g.fillStyle = rgba(hc, 0.13); g.fillRect(X - bw / 2, y1, bw, y2 - y1); }
    for (let i = a; i <= b; i++) {
      const x = this.k[i], X = Math.round(this.X(i)) + 0.5, up = x.c >= x.o, hc = HL && HL.get(i), mono = Ls.mono && !hc, col = mono ? C.fg : up ? C.up : C.dn;
      const yo = this.Y(x.o), yc = this.Y(x.c), top = Math.min(yo, yc), hb = Math.max(1, Math.abs(yc - yo));
      if (hc) { g.save(); g.shadowColor = col; g.shadowBlur = 7; }
      g.strokeStyle = col; g.lineWidth = hc ? 1.4 : 1; g.beginPath(); g.moveTo(X, this.Y(x.h)); g.lineTo(X, this.Y(x.l)); g.stroke();
      if (cwid >= 2.5) {
        if (mono && up) { g.fillStyle = C.bg; g.fillRect(X - cwid / 2, top, cwid, hb); g.strokeRect(X - cwid / 2 + 0.5, top + 0.5, cwid - 1, Math.max(0, hb - 1)); }
        else { g.fillStyle = col; g.fillRect(X - cwid / 2, top, cwid, hb); }
      }
      if (hc) g.restore();
    }
    // indicator lines
    for (const s of Ls.lines || []) {
      g.strokeStyle = s.color; g.lineWidth = s.w || 1.2; g.setLineDash(s.dash || []); g.beginPath(); let on = false;
      for (const p of s.pts) { const i = this.ti(p.t); if (i < a - 2 || i > b + 2) continue; const X = this.X(i), Yv = this.Y(p.v); if (!on) { g.moveTo(X, Yv); on = true; } else g.lineTo(X, Yv); }
      g.stroke(); g.setLineDash([]);
    }
    // drawings: pattern shapes, trendlines, swing labels, pattern tags
    for (const d of Ls.draw || []) {
      if (d.type === "poly") { g.beginPath(); d.pts.forEach(([i, p], j) => (j ? g.lineTo(this.X(i), this.Y(p)) : g.moveTo(this.X(i), this.Y(p)))); g.closePath(); g.fillStyle = rgba(d.color, d.alpha || 0.09); g.fill(); }
      else if (d.type === "seg") { g.save(); g.strokeStyle = d.color; g.lineWidth = d.w || 2; g.lineCap = "round"; g.setLineDash(d.dash || []); if (d.glow) { g.shadowColor = d.color; g.shadowBlur = 8; } g.beginPath(); g.moveTo(this.X(d.i0), this.Y(d.p0)); g.lineTo(this.X(d.i1), this.Y(d.p1)); g.stroke(); g.restore(); }
      else if (d.type === "dot") { g.beginPath(); g.arc(this.X(d.i), this.Y(d.p), d.r || 3.5, 0, Math.PI * 2); g.fillStyle = C.bg; g.fill(); g.strokeStyle = d.color; g.lineWidth = 1.6; g.stroke(); }
      else if (d.type === "pill" || d.type === "text") {
        const X = this.X(d.i), Yv = this.Y(d.p) + (d.dy || 0); g.font = `${d.bold === false ? 600 : 700} ${d.size || 10.5}px IBM Plex Sans, system-ui, sans-serif`; const w = g.measureText(d.text).width;
        if (d.type === "text") { g.fillStyle = d.color; g.textAlign = "center"; g.fillText(d.text, X, Yv); g.textAlign = "left"; }
        else { const x0 = Math.min(L.r - w - 12, Math.max(2, d.anchor === "right" ? X - w - 12 : X - w / 2 - 6)); g.fillStyle = rgba(d.color, 0.92); g.beginPath(); if (g.roundRect) g.roundRect(x0, Yv - 9, w + 12, 18, 9); else g.rect(x0, Yv - 9, w + 12, 18); g.fill(); g.fillStyle = "#fff"; g.fillText(d.text, x0 + 6, Yv + 0.5); }
        g.font = "11.5px IBM Plex Sans, system-ui, sans-serif";
      }
    }
    // horizontal levels
    // CoinWise-style: level names written at the right end of each line instead of boxes on the price axis
    const lbl = new Map();
    if (Ls.lineLbl) { const used = []; g.font = "600 11px IBM Plex Sans, system-ui, sans-serif";
      (Ls.hlines || []).filter((h) => h.tag && ok(h.p)).sort((x, y) => (y.prio || 10) - (x.prio || 10)).forEach((h) => { const y = this.Y(h.p); if (y < 8 || y > L.mainH - 8 || used.some((u) => Math.abs(u - y) < 12)) return; used.push(y); lbl.set(h, { y, w: g.measureText(h.tag).width }); });
      g.font = "11.5px IBM Plex Sans, system-ui, sans-serif"; }
    for (const h of Ls.hlines || []) {
      if (!ok(h.p)) continue; const y = Math.round(this.Y(h.p)) + 0.5; if (y < 0 || y > L.mainH) continue; const lb = lbl.get(h), xe = lb ? L.r - lb.w - 12 : L.r;
      g.strokeStyle = h.color; g.lineWidth = h.w || 1; g.setLineDash(h.dash || []); g.globalAlpha = h.alpha || 0.9; g.beginPath(); g.moveTo(h.x0 ? Math.max(0, this.X(this.ti(h.x0))) : 0, y); g.lineTo(xe, y); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      if (lb) { g.font = "600 11px IBM Plex Sans, system-ui, sans-serif"; g.fillStyle = h.color; g.textAlign = "right"; g.fillText(h.tag, L.r - 5, y); g.textAlign = "left"; g.font = "11.5px IBM Plex Sans, system-ui, sans-serif"; }
      if (h.left) { g.fillStyle = h.color; g.font = "10.5px IBM Plex Sans, system-ui, sans-serif"; g.fillText(h.left, 4, y - 6); g.font = "11.5px IBM Plex Sans, system-ui, sans-serif"; }
    }
    // real liquidations (summed per candle and side)
    for (const e of Ls.liqEv || []) {
      const i = this.ti(e.t); if (i < a - 1 || i > b + 1) continue; const X = this.X(Math.round(i)), Yv = this.Y(e.p), s = Math.max(4, Math.min(16, Math.sqrt(e.usd / 2e4) * 3)), col = e.side === "long" ? C.dn : C.up;
      g.beginPath(); if (e.side === "long") { g.moveTo(X - s, Yv - s * 0.2); g.lineTo(X + s, Yv - s * 0.2); g.lineTo(X, Yv + s); } else { g.moveTo(X - s, Yv + s * 0.2); g.lineTo(X + s, Yv + s * 0.2); g.lineTo(X, Yv - s); } g.closePath();
      g.fillStyle = rgba(col, 0.75); g.fill(); g.strokeStyle = C.bg; g.lineWidth = 1; g.stroke();
      if (e.usd >= 250000) { g.fillStyle = col; g.font = "700 10px IBM Plex Sans, system-ui, sans-serif"; g.textAlign = "center"; g.fillText(usd(e.usd).replace("$", ""), X, e.side === "long" ? Yv + s + 9 : Yv - s - 7); g.textAlign = "left"; g.font = "11.5px IBM Plex Sans, system-ui, sans-serif"; }
    }
    // big-trade bubbles
    for (const e of Ls.bubbles || []) {
      const i = this.ti(e.t); if (i < a - 1 || i > b + 1) continue; const X = this.X(i), Yv = this.Y(e.p), r = Math.max(3, Math.min(24, Math.sqrt(e.usd / 2.5e5) * 6)), col = e.side === "buy" ? C.up : C.dn;
      g.beginPath(); g.arc(X, Yv, r, 0, Math.PI * 2); g.fillStyle = rgba(col, 0.32); g.fill(); g.strokeStyle = col; g.lineWidth = 1.2; g.stroke();
      if (r >= 13) { g.fillStyle = C.fg; g.font = "600 10px IBM Plex Sans, system-ui, sans-serif"; g.textAlign = "center"; g.fillText(usd(e.usd).replace("$", ""), X, Yv); g.textAlign = "left"; g.font = "11.5px IBM Plex Sans, system-ui, sans-serif"; }
    }
    // volume profile histogram
    if (PF) {
      const mx = Math.max(...PF.vol) || 1, maxW = L.r * 0.22;
      for (let i = 0; i < PF.n; i++) {
        const pa = PF.lo + i * PF.step, ya = this.Y(pa + PF.step), yb = this.Y(pa), mid = pa + PF.step / 2;
        g.fillStyle = Math.abs(mid - PF.poc) < PF.step / 2 ? rgba("#e8c547", 0.75) : mid >= PF.val && mid <= PF.vah ? rgba(C.acc, 0.42) : rgba(C.fg3, 0.3);
        const w = (PF.vol[i] / mx) * maxW; g.fillRect(L.r - w, ya + 0.5, w, Math.max(1, yb - ya - 1));
      }
    }
    // last price line
    const last = this.k[this.k.length - 1], lc = last.c >= last.o ? C.up : C.dn, ly = Math.round(this.Y(last.c)) + 0.5;
    g.strokeStyle = lc; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(0, ly); g.lineTo(L.r, ly); g.stroke(); g.setLineDash([]);
    g.restore();
    // lower panes
    const subs = Ls.subs || [];
    this.grip.hidden = !subs.length; if (subs.length) { this.grip.style.top = `${L.mainH - 6}px`; this.grip.style.width = `${L.r}px`; }
    if (subs.length) {
      const ph = L.subH / subs.length, ci = this.cross ? Math.max(0, Math.min(this.k.length - 1, Math.round(this.I(this.cross.x)))) : this.k.length - 1, ct = this.k[ci].t, inV = (p) => { const i = this.ti(p.t); return i >= a - 1 && i <= b + 1; };
      const at = (pts, t) => { if (!pts) return NaN; if (!pts._m) pts._m = new Map(pts.map((p) => [p.t, p.v])); return pts._m.get(t); };
      const font = (w, z) => (g.font = `${w} ${z}px IBM Plex Sans, system-ui, sans-serif`);
      subs.forEach((S, j) => {
        const top = L.subTop + j * ph, h = ph - (j < subs.length - 1 ? 4 : 0), y0 = top + 15, hh = h - 19;
        g.fillStyle = rgba(C.fg3, 0.035); g.fillRect(0, top, L.r, h); g.strokeStyle = C.grid; g.strokeRect(0.5, top + 0.5, L.r - 1, h - 1);
        g.save(); g.beginPath(); g.rect(0, top, L.r, h); g.clip();
        const tags = [];
        if (S.empty) { font(400, 11); g.fillStyle = C.fg3; g.fillText(S.empty, 8, y0 + hh / 2); }
        else if (S.kind === "ohlc") {
          const V = S.bars.filter(inV);
          if (V.length) { let lo = Math.min(...V.map((x) => x.l)), hi = Math.max(...V.map((x) => x.h)); const pd = (hi - lo) * 0.08 || 1; lo -= pd; hi += pd; const Yo = (v) => y0 + (1 - (v - lo) / (hi - lo)) * hh;
            if (lo < 0 && hi > 0) { g.strokeStyle = rgba(C.fg3, 0.5); g.setLineDash([2, 3]); g.beginPath(); g.moveTo(0, Yo(0)); g.lineTo(L.r, Yo(0)); g.stroke(); g.setLineDash([]); }
            for (const x of V) { const X = Math.round(this.X(this.ti(x.t))) + 0.5, upb = x.c >= x.o, col = upb ? S.color : S.dnColor || rgba(C.fg3, 0.9), t1 = Math.min(Yo(x.o), Yo(x.c)), hb = Math.max(1, Math.abs(Yo(x.c) - Yo(x.o)));
              g.strokeStyle = col; g.beginPath(); g.moveTo(X, Yo(x.h)); g.lineTo(X, Yo(x.l)); g.stroke(); g.fillStyle = col; g.fillRect(X - cwid / 2, t1, cwid, hb); }
            const lv = V[V.length - 1]; tags.push([Yo(lv.c), S.fmt(lv.c), lv.c >= lv.o ? S.color : S.dnColor || C.fg3]); }
          g.restore();
          if (!S._m) S._m = new Map(S.bars.map((x) => [x.t, x])); const cb = S._m.get(ct);
          S.read = cb ? [[S.fmt(cb.c), S.color], [`${cb.c >= cb.o ? "▲" : "▼"} ${usd(Math.abs(cb.c - cb.o))}`, cb.c >= cb.o ? S.color : S.dnColor || C.fg3]] : [];
        } else if (S.kind === "mirror") {
          const U = S.up.filter(inV), Dn = S.dn.filter(inV), m = Math.max(1, ...U.map((p) => p.v), ...Dn.map((p) => p.v)), mid = y0 + hh / 2, sc = (hh / 2 - 2) / m;
          g.strokeStyle = rgba(C.fg3, 0.5); g.setLineDash([2, 3]); g.beginPath(); g.moveTo(0, Math.round(mid) + 0.5); g.lineTo(L.r, Math.round(mid) + 0.5); g.stroke(); g.setLineDash([]);
          for (const p of U) { const X = this.X(this.ti(p.t)), hgt = p.v * sc; if (hgt < 0.4) continue; g.fillStyle = S.color; g.fillRect(X - cwid / 2, mid - hgt, cwid, hgt); }
          for (const p of Dn) { const X = this.X(this.ti(p.t)), hgt = p.v * sc; if (hgt < 0.4) continue; g.fillStyle = S.dnColor || rgba(C.fg3, 0.75); g.fillRect(X - cwid / 2, mid, cwid, hgt); }
          g.restore(); font(400, 10.5); g.fillStyle = S.color; g.fillText(`+${S.fmt(m)}`, L.r + 6, y0 + 6); g.fillStyle = S.dnColor || C.fg3; g.fillText(`−${S.fmt(m)}`, L.r + 6, y0 + hh - 4);
          const u = at(S.up, ct), d = at(S.dn, ct);
          S.read = [[`${S.upL || "▲"} ${ok(u) ? S.fmt(u) : "–"}`, S.color], [`${S.dnL || "▼"} ${ok(d) ? S.fmt(d) : "–"}`, S.dnColor || C.fg3]];
        } else {
          const lines = (S.lines || []).map((q) => ({ ...q, v: q.pts.filter(inV) })).filter((q) => q.v.length > 1), H2 = S.hist ? S.hist.filter(inV) : [];
          if (H2.length) { const m = Math.max(1, ...H2.map((p) => Math.abs(p.v))), solo = !lines.length, mid = solo ? null : y0 + hh / 2;
            let lo = Math.min(0, ...H2.map((p) => p.v)), hi = Math.max(0, ...H2.map((p) => p.v)); if (!solo) { lo = -m; hi = m; }
            const Yh = (v) => y0 + (1 - (v - lo) / (hi - lo || 1)) * hh, z = Yh(0);
            for (const p of H2) { const X = this.X(this.ti(p.t)), y1 = Yh(p.v); g.fillStyle = rgba(p.v >= 0 ? C.up : C.dn, solo ? 0.75 : 0.22); g.fillRect(X - cwid / 2, Math.min(z, y1), cwid, Math.max(1, Math.abs(y1 - z))); }
            if (solo) { g.strokeStyle = rgba(C.fg3, 0.5); g.setLineDash([2, 3]); g.beginPath(); g.moveTo(0, z); g.lineTo(L.r, z); g.stroke(); g.setLineDash([]); const lv = H2[H2.length - 1].v; tags.push([Yh(lv), S.fmt(lv), lv >= 0 ? C.up : C.dn]); } }
          if (lines.length) {
            const all = lines.flatMap((q) => q.v.map((p) => p.v)); let lo = Math.min(...all), hi = Math.max(...all); const pd = (hi - lo) * 0.08 || 1; lo -= pd; hi += pd;
            const Yl = (v) => y0 + (1 - (v - lo) / (hi - lo)) * hh;
            if (S.zero && lo < 0 && hi > 0) { g.strokeStyle = rgba(C.fg3, 0.5); g.setLineDash([2, 3]); g.beginPath(); g.moveTo(0, Yl(0)); g.lineTo(L.r, Yl(0)); g.stroke(); g.setLineDash([]); }
            if (lines.length === 1) { const q = lines[0], gf = g.createLinearGradient(0, y0, 0, y0 + hh); gf.addColorStop(0, rgba(q.color, 0.28)); gf.addColorStop(1, rgba(q.color, 0)); g.fillStyle = gf; g.beginPath();
              q.v.forEach((p, i) => { const X = this.X(this.ti(p.t)), Yv = Yl(p.v); if (i) g.lineTo(X, Yv); else g.moveTo(X, Yv); }); g.lineTo(this.X(this.ti(q.v[q.v.length - 1].t)), y0 + hh); g.lineTo(this.X(this.ti(q.v[0].t)), y0 + hh); g.closePath(); g.fill(); }
            for (const q of lines) { g.strokeStyle = q.color; g.lineWidth = q.w || 1.7; g.beginPath(); q.v.forEach((p, i) => { const X = this.X(this.ti(p.t)), Yv = Yl(p.v); if (i) g.lineTo(X, Yv); else g.moveTo(X, Yv); }); g.stroke();
              const lv = q.v[q.v.length - 1].v; tags.push([Yl(lv), S.fmt(lv), q.color]); }
            g.lineWidth = 1;
          }
          g.restore();
          S.read = (S.lines && S.lines.length ? S.lines : [{ pts: S.hist, label: "", color: null }]).map((q) => { const v = at(q.pts, ct); return [`${q.label ? q.label + " " : ""}${ok(v) ? S.fmt(v) : "–"}`, q.color || (v >= 0 ? C.up : C.dn)]; });
        }
        if (!S.empty && S.kind !== "mirror") { const done = []; tags.sort((x, y) => x[0] - y[0]).forEach(([y, t, c]) => { y = Math.max(top + 8, Math.min(top + h - 8, y)); if (done.some((q) => Math.abs(q - y) < 15)) return; done.push(y); this.tag(g, L, y, t, c, true); }); }
        if (S.empty) g.restore();
        else { const fp = (S.up || S.bars || (S.lines && S.lines[0] && S.lines[0].pts) || S.hist || [])[0], fx = fp ? this.X(this.ti(fp.t)) : 0;
          if (fx > 150) { font(400, 10.5); g.fillStyle = C.fg3; g.textAlign = "right"; g.fillText("OKX history starts here →", fx - 8, top + h / 2 + 4); g.textAlign = "left"; } }
        // title + readout
        font(600, 10.5); g.fillStyle = C.fg; let x = 8; g.fillText(S.name, x, top + 9); x += g.measureText(S.name).width + 10;
        font(600, 10.5); for (const [t, c] of S.read || []) { if (x > L.r - 40) break; g.fillStyle = c; g.fillText(t, x, top + 9); x += g.measureText(t).width + 9; }
        font(400, 11.5);
      });
    }
    // price axis: tags first (priority, no overlaps), then tick labels in the gaps
    g.fillStyle = C.bg; g.fillRect(L.r, 0, L.axW, L.mainH); g.strokeStyle = C.line; g.beginPath(); g.moveTo(L.r + 0.5, 0); g.lineTo(L.r + 0.5, this.H); g.stroke();
    const tags = [{ p: last.c, text: n0(last.c), color: lc, prio: 1000, solid: true }];
    if (!Ls.lineLbl) for (const h of Ls.hlines || []) if (h.tag && ok(h.p)) tags.push({ p: h.p, text: h.tag, color: h.color, prio: h.prio || 10 });
    if (this.cross && this.cross.y < L.mainH) tags.push({ p: this.P(this.cross.y), text: n0(this.P(this.cross.y)), color: C.fg, prio: 2000, solid: true, cross: true });
    const placed = [];
    tags.sort((x, y) => y.prio - x.prio).forEach((t) => { const y = this.Y(t.p); if (y < 7 || y > L.mainH - 7) return; if (placed.some((q) => Math.abs(q.y - y) < 15)) return; placed.push({ ...t, y }); });
    g.fillStyle = C.fg3; g.textAlign = "left";
    for (const [v, y] of yt) if (y > 8 && y < L.mainH - 8 && !placed.some((q) => Math.abs(q.y - y) < 13)) g.fillText(n0(v), L.r + 6, y);
    for (const t of placed) this.tag(g, L, t.y, t.text, t.color, t.solid, t.cross);
    // time axis
    g.fillStyle = C.bg; g.fillRect(0, L.tTop, this.W, this.H - L.tTop); g.fillStyle = C.fg3; g.textAlign = "center";
    for (const [t, x] of xt) { const d = new Date(t * 1000), lab = step >= 86400 || (d.getHours() === 0 && d.getMinutes() === 0) ? d.toLocaleDateString([], { month: "short", day: "numeric" }) : d.toLocaleTimeString([], { hour: "numeric", minute: step < 3600 ? "2-digit" : undefined }); if (x > 20 && x < L.r - 20) g.fillText(lab, x, L.tTop + 10); }
    g.textAlign = "left";
    // crosshair
    if (this.cross) {
      const cb = this.crossBar(), i = Math.max(0, Math.min(this.k.length - 1, Math.round(this.I(this.cross.x)))), X = Math.round(this.X(i)) + 0.5;
      g.strokeStyle = C.fg2; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X, 0); g.lineTo(X, L.tTop); if (this.cross.y < L.mainH) { g.moveTo(0, Math.round(this.cross.y) + 0.5); g.lineTo(L.r, Math.round(this.cross.y) + 0.5); } g.stroke(); g.setLineDash([]);
      if (cb) { const lab = new Date(cb.t * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), w = g.measureText(lab).width + 12; g.fillStyle = C.fg; g.fillRect(Math.min(L.r - w, Math.max(0, X - w / 2)), L.tTop + 1, w, 18); g.fillStyle = C.bg; g.textAlign = "center"; g.fillText(lab, Math.min(L.r - w / 2, Math.max(w / 2, X)), L.tTop + 10); g.textAlign = "left"; }
    }
    if (!this.auto) { g.fillStyle = C.acc; g.font = "600 10.5px IBM Plex Sans, system-ui, sans-serif"; g.fillText("manual scale · double-tap axis", 6, L.mainH - 8); g.font = "11.5px IBM Plex Sans, system-ui, sans-serif"; }
  }
  tag(g, L, y, text, color, solid, cross) {
    const C = this.colors(); g.font = "600 11px IBM Plex Sans, system-ui, sans-serif"; let t = text; while (g.measureText(t).width > L.axW - 8 && t.length > 4) t = t.slice(0, -1);
    g.fillStyle = solid ? color : C.bg; g.fillRect(L.r + 1, y - 8, L.axW - 2, 16); if (!solid) { g.strokeStyle = color; g.strokeRect(L.r + 1.5, y - 7.5, L.axW - 3, 15); }
    g.fillStyle = solid ? (cross ? C.bg : "#fff") : color; g.fillText(t, L.r + 5, y + 0.5); g.font = "11.5px IBM Plex Sans, system-ui, sans-serif";
  }
}
const HEAT_STOPS = [[0, [40, 11, 84]], [0.25, [59, 82, 139]], [0.5, [33, 145, 140]], [0.75, [94, 201, 98]], [1, [253, 231, 37]]];
function heatColor(t) {
  let i = 1; while (i < HEAT_STOPS.length - 1 && HEAT_STOPS[i][0] < t) i++;
  const [ta, ca] = HEAT_STOPS[i - 1], [tb, cb] = HEAT_STOPS[i], f = Math.max(0, Math.min(1, (t - ta) / (tb - ta)));
  const c = ca.map((v, j) => Math.round(v + (cb[j] - v) * f)); return `rgba(${c[0]},${c[1]},${c[2]},${(0.08 + 0.55 * t).toFixed(2)})`;
}

/* ---------- big trades: Binance spot, OKX perp, Coinbase ---------- */
const BIG = new Map(), BUCK = new Map(), BIG_MIN = { Binance: 250000, "OKX perp": 400000, Coinbase: 150000 };
(LS.get("bigTrades", []) || []).forEach((e) => BIG.set(e.k, e));
function bigAdd(venue, side, px, qty, tms) {
  if (!ok(px) || !ok(qty) || !ok(tms)) return; const s = Math.floor(tms / 1000), key = `${venue}|${side}|${s}`;
  let b = BUCK.get(key); if (!b) { b = { k: key, t: s, side, venue, usd: 0, q: 0 }; BUCK.set(key, b); } b.usd += px * qty; b.q += qty;
}
setInterval(() => {
  const now = Date.now() / 1000;
  for (const [k, b] of BUCK) if (b.t < now - 2) { if (b.usd >= BIG_MIN[b.venue]) BIG.set(k, { k, t: b.t, side: b.side, venue: b.venue, usd: b.usd, p: b.usd / b.q }); BUCK.delete(k); }
  for (const [k, e] of BIG) if (e.t < now - 86400) BIG.delete(k);
}, 1000);
setInterval(() => LS.set("bigTrades", [...BIG.values()].sort((a, b) => a.t - b.t).slice(-1500)), 30000);
wsDef("wsBnT", "Binance spot trades", "Big-trade bubbles", "wss://data-stream.binance.vision/ws/btcusdt@aggTrade", () => {},
  (m) => { if (m.e === "aggTrade") bigAdd("Binance", m.m ? "sell" : "buy", +m.p, +m.q, +m.T); });
wsDef("wsOkT", "OKX perp trades", "Big-trade bubbles", OKXWS, (ws) => ws.send(JSON.stringify({ op: "subscribe", args: [{ channel: "trades", instId: "BTC-USDT-SWAP" }] })),
  (m) => { if (m.arg && m.arg.channel === "trades" && m.data) for (const d of m.data) bigAdd("OKX perp", d.side, +d.px, +d.sz * 0.01, +d.ts); }, { ping: "ping" });

/* ---------- Fear & Greed ---------- */
PROXY["api.alternative.me"] = "/px/fng";
def("fng", "Fear & Greed (alternative.me)", "Mood gauges", 600000, async () => {
  const j = await getJSONp("https://api.alternative.me/fng/?limit=30"), d = j.data; if (!d || !d.length) throw new Error("no index");
  return { v: +d[0].value, label: d[0].value_classification, hist: d.map((x) => +x.value).reverse() };
});

/* ---------- sessions ---------- */
function tzOff(tz, ms) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(ms));
  const g = (t) => +p.find((x) => x.type === t).value; return (Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute")) - ms) / 60000;
}
const SESS = [{ name: "Asia", tz: "Asia/Tokyo", a: [9, 0], b: [18, 0], key: "purple" }, { name: "London", tz: "Europe/London", a: [8, 0], b: [16, 30], key: "acc" }, { name: "New York", tz: "America/New_York", a: [9, 30], b: [16, 0], key: "warn" }];
function sessions(tA, tB) {
  const out = [], C = chartColors();
  for (let day = Math.floor(tA / 86400) - 1; day <= Math.floor(tB / 86400) + 1; day++) for (const s of SESS) {
    const base = day * 86400000, off = tzOff(s.tz, base + 43200000) * 60000;
    const a = (Date.UTC(1970, 0, 1 + day, s.a[0], s.a[1]) - off) / 1000, b = (Date.UTC(1970, 0, 1 + day, s.b[0], s.b[1]) - off) / 1000;
    if (b >= tA && a <= tB) out.push({ t0: a, t1: b, name: s.name, color: C[s.key] });
  }
  return out;
}

/* ---------- my levels (CoinWise paste) ---------- */
let MYLV = LS.get("myLevels", { at: 0, list: [] });
function parseLevels(txt, ref) {
  const out = [];
  for (const line of txt.split(/\n|;|\|/)) {
    const re = /(\d{2,3}[,.]?\d{3}(?:\.\d+)?|\d{2,3}(?:\.\d+)?\s?[kK])/g; let m;
    while ((m = re.exec(line))) {
      let v = m[1].replace(/\s/g, ""); v = /k$/i.test(v) ? parseFloat(v) * 1000 : parseFloat(v.replace(/,/g, "").replace(/\.(?=\d{3}$)/, ""));
      if (!ok(v) || (ref && Math.abs(v - ref) / ref > 0.35)) continue;
      const label = line.slice(0, m.index).replace(/[^A-Za-z0-9 /+-]/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(-3).join(" ");
      out.push({ p: v, label: (label || "CW").slice(0, 16) });
    }
  }
  return out.filter((x, i) => out.findIndex((y) => Math.abs(y.p - x.p) < 1) === i).sort((a, b) => b.p - a.p);
}
// quick-add: tap the chart, then "+ Add level" saves the crosshair price as one of your levels
let MYADD = null;
function myAddBar() {
  const el = $("#myAdd"); if (!el) return;
  if (!ST.my) { el.innerHTML = ""; return; }
  const n = MYLV.list.length;
  el.innerHTML = MYADD ? `<button class="chip" id="bAddLv" style="border-color:var(--my);color:var(--my)">+ Add level ${n0(MYADD)}</button>${n ? `<span class="mut" style="font-size:12px">${n} on chart</span>` : ""}`
    : `<span class="mut" style="font-size:12px">${n ? `${n} of your levels on the chart (pink). ` : ""}Tap the chart where you want a level, then tap “+ Add level”. Or paste CoinWise levels in the My levels box below.</span>`;
}
function drawMyLevels() { myAddBar();
  const box = $("#myList"); if (!box) return;
  box.innerHTML = MYLV.list.length ? `<div class="mut" style="font-size:12px;margin:6px 0">${MYLV.list.length} levels saved ${MYLV.at ? `on ${new Date(MYLV.at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}` : ""}</div><div style="display:flex;flex-wrap:wrap;gap:6px">${MYLV.list.map((l, i) => `<span class="chip" style="border-color:var(--my);color:var(--my);display:inline-flex;align-items:center;gap:6px">${esc(l.label)} <b>${n0(l.p)}</b><button data-rmlv="${i}" aria-label="Remove level" style="border:none;background:none;color:inherit;padding:0 2px;font-size:15px;line-height:1">×</button></span>`).join("")}</div>` : `<div class="mut" style="font-size:12.5px;margin-top:6px">No levels saved yet.</div>`;
}

/* ---------- mood gauges ---------- */
function gauge(title, v, min, max, txt, sub, segs) {
  const C = chartColors(), W = 170, H = 104, cx = 85, cy = 88, R = 66, ang = (x) => Math.PI * (1 - (Math.max(min, Math.min(max, x)) - min) / (max - min));
  const arc = (a0, a1, col) => { const p = (a) => [cx + R * Math.cos(a), cy - R * Math.sin(a)], [x0, y0] = p(a0), [x1, y1] = p(a1); return `<path d="M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1}" stroke="${col}" stroke-width="12" fill="none"/>`; };
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;max-width:220px;margin:0 auto" aria-hidden="true">`;
  segs.forEach(([a, b, col]) => (s += arc(ang(a), ang(b), col)));
  if (ok(v)) { const a = ang(v); s += `<line x1="${cx}" y1="${cy}" x2="${cx + (R - 4) * Math.cos(a)}" y2="${cy - (R - 4) * Math.sin(a)}" stroke="${C.fg}" stroke-width="3" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="5" fill="${C.fg}"/>`; }
  s += `</svg>`;
  return `<div class="panel" style="text-align:center;padding:10px 8px"><div class="pt">${title}</div>${s}<div class="big" style="font-size:18px;margin-top:-4px">${txt}</div><div class="sub">${sub}</div></div>`;
}
function drawMood() {
  const el = $("#mood"); if (!el) return; const C = chartColors(), a = analysis(), A = aggr(), out = [], R3 = [[0, 0.2, C.dn], [0.2, 0.4, rgba(C.dn, 0.55)], [0.4, 0.6, C.fg3], [0.6, 0.8, rgba(C.up, 0.55)], [0.8, 1, C.up]];
  const sc = (lo, hi) => R3.map(([x, y, c]) => [lo + x * (hi - lo), lo + y * (hi - lo), c]);
  const f = live("fng") ? D.fng : null;
  out.push(gauge("Fear & Greed", f && f.v, 0, 100, f ? `${f.v}` : "–", f ? f.label : esc(SRC.fng.st.err || "loading"), sc(0, 100)));
  out.push(gauge("Overall lean", a && a.bias, -100, 100, a ? `${a.bias > 0 ? "+" : ""}${a.bias}` : "–", a ? a.verdict : "loading", sc(-100, 100)));
  out.push(gauge("Funding · 8h", ok(A.f8) ? A.f8 * 100 : null, -0.03, 0.03, ok(A.f8) ? `${(A.f8 * 100).toFixed(4)}%` : "–", ok(A.f8) ? (A.f8 > 0.0002 ? "Longs paying, crowded" : A.f8 < 0 ? "Shorts paying" : "Neutral") : "loading",
    [[-0.03, -0.01, C.up], [-0.01, 0.005, C.fg3], [0.005, 0.015, rgba(C.dn, 0.55)], [0.015, 0.03, C.dn]]));
  const ls = live("okxLS") ? lastOf(D.okxLS.s).v : null;
  out.push(gauge("Long/short accounts", ls, 0.5, 3, ok(ls) ? ls.toFixed(2) : "–", ok(ls) ? (ls > 2 ? "Crowded long" : ls < 1 ? "More shorts" : "Leaning long") : "loading", [[0.5, 1, C.up], [1, 2, C.fg3], [2, 3, C.dn]]));
  const prem = live("cb") && live("spot") ? ((D.cb.px - D.spot.px) / D.spot.px) * 100 : null;
  out.push(gauge("Coinbase premium", prem, -0.1, 0.1, ok(prem) ? pct(prem, 3) : "–", ok(prem) ? (prem > 0.02 ? "US buying" : prem < -0.02 ? "US selling" : "Flat") : "loading", sc(-0.1, 0.1)));
  let pc = null; if (live("dbOpt")) { const R = D.dbOpt.rows, c = R.filter((r) => r.cp === "C").reduce((s, r) => s + r.oi, 0), p = R.filter((r) => r.cp === "P").reduce((s, r) => s + r.oi, 0); pc = c ? p / c : null; }
  out.push(gauge("Options put/call", pc, 0.3, 1.5, ok(pc) ? pc.toFixed(2) : "–", ok(pc) ? (pc > 1 ? "Hedging, fearful" : pc < 0.6 ? "Call heavy, greedy" : "Balanced") : "loading", [[0.3, 0.6, C.up], [0.6, 1, C.fg3], [1, 1.5, C.dn]]));
  el.innerHTML = out.join("");
}

/* ---------- main chart wiring (replaces the old library versions) ---------- */
let CC = null;
function initChart() {
  const host = $("#cMain"); if (!host || CC) return;
  CC = new CChart(host); CC.colors = chartColors; CC.onView = () => { CH.xKey = null; chartExtras(true); };
  CC.onCross = (b) => { showOhlc(b ? { o: b.o, h: b.h, l: b.l, c: b.c } : null); if (b && CC.cross && CC.cross.y < CC.layout().mainH) { MYADD = Math.round(CC.P(CC.cross.y)); } myAddBar(); };
  CH.ready = true;
}
function resetView() { if (CC) CC.reset(); }
function zoom(f) { if (CC) CC.zoom(f); }
function recolorCharts() { if (CC) { CH.xKey = null; chartExtras(); CC.dirty(); } }
function drawOverlay() {}
function initExtras() {}
function updateChart() {
  if (!CC) return;
  if (live("kl") && D.kl.tf === ST.tf && CC.kRef !== D.kl.k) { CC.setData(D.kl.k, TF_SEC[ST.tf], CC.tf === ST.tf); CC.kRef = D.kl.k; CC.tf = ST.tf; showOhlc(); }
  chartExtras();
}
let HEAT = { key: "", v: null };
function heatData() {
  if (!live("okxOI1h") || !live("taK")) return null;
  const key = SRC.okxOI1h.st.okAt + ":" + SRC.taK.st.okAt; if (HEAT.key === key) return HEAT.v;
  const k1 = D.taK["1h"], byT = new Map(k1.map((x) => [x.t, x.c])), px = curPx(), A = aggr();
  const oi = D.okxOI1h.s.map((x) => ({ t: x.t, v: x.v > 1e7 ? x.v / (byT.get(x.t) || px) : x.v }));
  HEAT = { key, v: TA.liqHeat(k1, oi, px, okxScale(4)) }; return HEAT.v;
}
/* ---------- lower panes: positions opening/closing, CVD spot vs perp, delta, OI ---------- */
const PFC_PER = { "5m": "5m", "15m": "5m", "30m": "5m", "1h": "1H", "4h": "1H", "1d": "1D" }, PER_SEC = { "5m": 300, "1H": 3600, "1D": 86400 };
def("pfc", "OKX OI + taker flow (chart timeframe)", "Lower panes: longs/shorts, CVD, OI", 60000, async () => {
  const per = PFC_PER[ST.tf], q = `ccy=BTC&period=${per}`, tk = (r) => ({ t: Math.floor(+r[0] / 1000), sell: +r[1], buy: +r[2] });
  const [oi, pf, sp] = await Promise.all([okxR(`/api/v5/rubik/stat/contracts/open-interest-volume?${q}`), okxR(`/api/v5/rubik/stat/taker-volume?${q}&instType=CONTRACTS`), okxR(`/api/v5/rubik/stat/taker-volume?${q}&instType=SPOT`).catch(() => [])]);
  const O = oi.map((r) => ({ t: Math.floor(+r[0] / 1000), oi: +r[1] })).filter((x) => ok(x.oi)).sort((a, b) => a.t - b.t);
  if (O.length < 5) throw new Error("not enough OI history"); return { per, oi: O, pf: pf.map(tk).sort((a, b) => a.t - b.t), sp: sp.map(tk).sort((a, b) => a.t - b.t) };
});
function lowerPanes(k, C) {
  const out = [], sec = TF_SEC[ST.tf], idx = new Map(k.map((x, i) => [x.t, i])), B = (t) => Math.floor(t / sec) * sec, P = live("pfc") && D.pfc.per === PFC_PER[ST.tf] ? D.pfc : null;
  const sU = (v) => `${v < 0 ? "−" : "+"}${usd(Math.abs(v))}`, pxAt = (t) => { const i = idx.get(B(t)); return i === undefined ? curPx() : k[i].c; };
  const oiU = (r) => (r.oi > 1e7 ? r.oi : r.oi * pxAt(r.t)), A = aggr(), scale = okxScale(1);
  const sum = (rows, f) => { const m = new Map(); for (const r of rows) { const bt = B(r.t); if (!idx.has(bt)) continue; m.set(bt, (m.get(bt) || 0) + f(r)); } return m; };
  const pts = (m) => [...m].sort((x, y) => x[0] - y[0]).map(([t, v]) => ({ t, v }));
  const delta = (rows) => { if (!rows.length) return new Map(); const tot = rows.map((r) => r.buy + r.sell).sort((x, y) => x - y), isUsd = tot[tot.length >> 1] > 1e6 * (PER_SEC[P.per] / 300); return sum(rows, (r) => (r.buy - r.sell) * (isUsd ? 1 : pxAt(r.t))); };
  const wait = (name) => ({ name, empty: SRC.pfc.st.err ? `Unavailable: ${SRC.pfc.st.err}` : "Loading OKX flow for this timeframe…" });
  for (const id of ST.lowers) {
    if (id === "pos") {
      if (!P) { out.push(wait("Longs / shorts")); continue; }
      const T = new Map(P.pf.map((r) => [r.t, r])), rows = [];
      for (let i = 1; i < P.oi.length; i++) { const tk = T.get(P.oi[i].t); if (!tk) continue; const d = (oiU(P.oi[i]) - oiU(P.oi[i - 1])) * scale, b = tk.buy / (tk.buy + tk.sell || 1); rows.push({ t: P.oi[i].t, lo: d > 0 ? d * b : 0, so: d > 0 ? d * (1 - b) : 0, lc: d < 0 ? -d * (1 - b) : 0, sc: d < 0 ? -d * b : 0 }); }
      // running net positions added since OKX history starts, as candles (open/high/low/close per chart candle) or a line
      const ohlc = (f) => { const m = new Map(); let v = 0; for (const r of rows) { const bt = B(r.t); const o = m.get(bt) || { t: bt, o: v, h: v, l: v, c: v }; v += f(r); o.c = v; o.h = Math.max(o.h, v); o.l = Math.min(o.l, v); if (idx.has(bt)) m.set(bt, o); } return [...m.values()].sort((x, y) => x.t - y.t); };
      const LO = ohlc((r) => r.lo - r.lc), SO = ohlc((r) => r.so - r.sc), t0 = rows.length ? fmtT(rows[0].t, { month: "short", day: "numeric", hour: "numeric" }) : "";
      const mk = (name, bars, color) => (ST.lpStyle === "lines" ? { name, zero: true, fmt: sU, lines: [{ pts: bars.map((x) => ({ t: x.t, v: x.c })), color, label: "", w: 2 }] } : { name, kind: "ohlc", zero: true, bars, color, fmt: sU });
      out.push(mk(`Longs · net added since ${t0}`, LO, C.up), mk(`Shorts · net added since ${t0}`, SO, C.dn));
    }
    if (id === "cvd") {
      const bn = new Map(k.map((x) => [x.t, (2 * x.tb - x.v) * x.c])), sp = P ? delta(P.sp) : new Map(), pf = P ? delta(P.pf) : new Map();
      const t0 = P && pf.size ? Math.min(...pf.keys()) : k[0].t; let cs = 0, cp = 0; const S1 = [], P1 = [], H = [];
      for (const x of k) { if (x.t < t0) continue; const ds = bn.get(x.t) + (sp.get(x.t) || 0), dp = pf.get(x.t) || 0; cs += ds; S1.push({ t: x.t, v: cs }); if (pf.size) { cp += dp; P1.push({ t: x.t, v: cp }); } H.push({ t: x.t, v: ds + dp }); }
      out.push({ name: "CVD", zero: true, fmt: sU, hist: H, lines: [{ pts: S1, color: C.acc, label: "Spot" }, ...(P1.length ? [{ pts: P1, color: C.warn, label: "Perp" }] : [])] });
    }
    if (id === "cvdc") { // CVD as candles: Binance spot + OKX spot + OKX perp (USD), body = that candle's net taker flow
      const sp = P ? delta(P.sp) : new Map(), pf = P ? delta(P.pf) : new Map(), t0 = P && pf.size ? Math.min(...pf.keys()) : k[0].t; let v = 0; const bars = [];
      for (const x of k) { if (x.t < t0) continue; const d = (2 * x.tb - x.v) * x.c + (sp.get(x.t) || 0) + (pf.get(x.t) || 0), o = v; v += d; bars.push({ t: x.t, o, c: v, h: Math.max(o, v), l: Math.min(o, v) }); }
      out.push({ name: P && pf.size ? "CVD · aggregated (Binance + OKX)" : "CVD · Binance spot", kind: "ohlc", bars, color: C.up, dnColor: C.dn, fmt: sU });
    }
    if (id === "oic") {
      if (!P) { out.push(wait("Open interest")); continue; }
      const m = new Map(); for (const r of P.oi) { const bt = B(r.t); if (!idx.has(bt)) continue; const v = oiU(r) * scale, o = m.get(bt); if (!o) m.set(bt, { t: bt, o: v, h: v, l: v, c: v }); else { o.c = v; o.h = Math.max(o.h, v); o.l = Math.min(o.l, v); } }
      const bars = [...m.values()].sort((x, y) => x.t - y.t); for (let i = 1; i < bars.length; i++) { bars[i].o = bars[i - 1].c; bars[i].h = Math.max(bars[i].h, bars[i].o); bars[i].l = Math.min(bars[i].l, bars[i].o); }
      out.push({ name: "Open interest · all venues (est.)", kind: "ohlc", bars, color: C.up, dnColor: C.dn, fmt: usd });
    }
    if (id === "liq") { const L1 = new Map(), S1 = new Map(); if (typeof LIQ !== "undefined") for (const e of LIQ.values()) { const bt = B(e.t / 1000); if (!idx.has(bt)) continue; const m = e.side === "long" ? L1 : S1; m.set(bt, (m.get(bt) || 0) + e.usd); }
      out.push({ name: "Liquidations", kind: "mirror", up: pts(S1), dn: pts(L1), color: C.up, dnColor: C.dn, upL: "Shorts", dnL: "Longs", fmt: usd }); }
    if (id === "vol") out.push({ name: "Buy / sell volume · Binance spot", kind: "mirror", up: k.map((x) => ({ t: x.t, v: x.tb * x.c })), dn: k.map((x) => ({ t: x.t, v: (x.v - x.tb) * x.c })), color: C.up, dnColor: C.dn, upL: "Buy", dnL: "Sell", fmt: usd });
    if (id === "bcvd") { let c = 0; out.push({ name: "Spot CVD · Binance (BTC)", fmt: (v) => sgn(v, 0), lines: [{ pts: k.map((x) => ({ t: x.t, v: (c += 2 * x.tb - x.v) })), color: C.acc, label: "" }] }); }
    if (id === "delta") out.push({ name: "Buy − sell per candle (Binance spot, BTC)", fmt: (v) => sgn(v, 0), hist: k.map((x) => ({ t: x.t, v: 2 * x.tb - x.v })) });
    if (id === "oi") {
      if (P) { const m = new Map(); P.oi.forEach((r) => { const bt = B(r.t); if (idx.has(bt)) m.set(bt, oiU(r) * scale); }); out.push({ name: "Open interest · all venues (est.)", fmt: usd, lines: [{ pts: pts(m), color: C.warn, label: "" }] }); }
      else out.push(wait("Open interest"));
    }
  }
  return out;
}
function chartExtras(fromView) {
  if (!CC || !CC.k.length) return; const C = chartColors(), k = CC.k, a = AN && AN.key ? AN : null, intra = ["5m", "15m", "30m", "1h"].includes(ST.tf);
  const key = [ST.tf, SRC.kl.st.okAt, ST.ema, ST.sma, ST.vwap, ST.avwap, ST.lv, ST.fib, ST.prof, ST.tpo, ST.zones, ST.liq, ST.liqb, ST.lpStyle, ST.tlN, ST.lineLbl, ST.mono, ST.heat, ST.bub, ST.liqev, ST.pat, ST.trend, ST.cdl, typeof LIQ !== "undefined" ? LIQ.size : 0, ST.sess, ST.my, ST.lowers.join(","), SRC.pfc ? SRC.pfc.st.okAt : 0, SRC.okxOI.st.okAt, ST.clean, a && a.key, MYLV.at, JSON.stringify(ST.fibOff), C.bg, BIG.size, SRC.okxOI.st.okAt].join("|");
  if (!fromView && CH.xKey === key) return; CH.xKey = key;
  const on = (x) => x && !ST.clean, L = { mono: ST.mono, lineLbl: ST.lineLbl, lines: [], hlines: [], boxes: [] }, c = k.map((x) => x.c), T = (arr, n) => arr.map((v, i) => (ok(v) ? { t: k[i].t, v } : null)).filter(Boolean);
  if (on(ST.ema)) { L.lines.push({ pts: T(TA.ema(c, 21), 21), color: C.warn }, { pts: T(TA.ema(c, 50), 50), color: C.acc }, { pts: T(TA.ema(c, 200), 200), color: C.purple, w: 1.6 }); }
  if (on(ST.sma)) { L.lines.push({ pts: T(TA.sma(c, 50)), color: C.up, dash: [6, 3] }, { pts: T(TA.sma(c, 200)), color: C.dn, w: 1.6, dash: [6, 3] }); }
  if (on(ST.vwap) && intra) L.lines.push({ pts: T(TA.vwapDaily(k)), color: C.fg2, dash: [4, 3] });
  if (on(ST.avwap) && intra) { const av = avwapSeries(k), m = (arr) => arr.map((p) => ({ t: p.time, v: p.value })); L.lines.push({ pts: m(av.m), color: "#e8c547", w: 1.8 }, { pts: m(av.u1), color: C.acc }, { pts: m(av.l1), color: C.acc }, { pts: m(av.u2), color: C.acc, dash: [4, 4] }, { pts: m(av.l2), color: C.acc, dash: [4, 4] }); L.hlines.push({ p: lastOf(av.m) ? lastOf(av.m).value : NaN, color: "#e8c547", tag: "AVWAP", prio: 48, alpha: 0 }); }
  if (on(ST.lv)) levels().forEach((l) => L.hlines.push({ p: l.p, color: l.t.startsWith("PD") ? C.fg3 : C.acc, dash: [5, 4], tag: l.t.replace("Day open", "D open").replace("Week open", "W open").replace("Month open", "M open"), prio: 50 }));
  const [va, vb] = CC.vis(), vis = k.slice(va, vb + 1);
  if (on(ST.fib) && vis.length > 4) { const lo = Math.min(...vis.map((x) => x.l)), hi = Math.max(...vis.map((x) => x.h)); FIBS.filter((r) => !ST.fibOff[r]).forEach((r) => L.hlines.push({ p: lo + r * (hi - lo), color: fibColor(r), dash: [1, 3], left: String(r), alpha: 0.95 })); }
  const PF = (on(ST.prof) || on(ST.tpo)) && vis.length > 4 ? profile(vis) : null;
  if (PF && on(ST.prof)) { L.profile = { ...PF, poc: PF.vp.poc, vah: PF.vp.vah, val: PF.vp.val }; L.hlines.push({ p: PF.vp.poc, color: "#e8c547", w: 1.5, tag: "POC", prio: 70 }, { p: PF.vp.vah, color: C.fg2, dash: [5, 3], tag: "VAH", prio: 45 }, { p: PF.vp.val, color: C.fg2, dash: [5, 3], tag: "VAL", prio: 45 }); }
  if (PF && on(ST.tpo)) L.hlines.push({ p: PF.tp.poc, color: C.acc, dash: [2, 3], tag: "TPO POC", prio: 42 }, { p: PF.tp.vah, color: C.acc, dash: [2, 3], prio: 5 }, { p: PF.tp.val, color: C.acc, dash: [2, 3], prio: 5 });
  if (on(ST.zones) && a) a.Z.filter((z) => Math.abs(z.dist) <= 4 && z.w >= 2).forEach((z) => L.boxes.push({ lo: z.lo, hi: z.hi, color: z.c > a.px ? C.dn : C.up }));
  if (on(ST.liq) && a && a.L) [...a.L.shorts.slice(0, 3), ...a.L.longs.slice(0, 3)].forEach((x) => L.hlines.push({ p: x.p, color: x.dist > 0 ? C.up : C.dn, dash: [8, 4], w: 1.4, tag: `Liq ${usd(x.usd).replace("$", "")}`, prio: 55 }));
  if (on(ST.liqb) && a && a.L) { const tops = [...a.L.shorts.slice(0, 4), ...a.L.longs.slice(0, 4)].filter((x) => Math.abs(x.dist) <= 8), mx = Math.max(...tops.map((x) => x.usd), 1);
    L.liqBands = tops.map((x) => ({ p: x.p, h: a.L.step, w: x.usd / mx, color: x.dist > 0 ? C.up : C.dn, label: `${x.dist > 0 ? "Shorts" : "Longs"} ${usd(x.usd)}` })); }
  if (on(ST.liqev) && typeof LIQ !== "undefined") { const sec = TF_SEC[ST.tf], t0 = k[0].t, m = new Map();
    for (const e of LIQ.values()) { const t = e.t / 1000; if (t < t0) continue; const bt = Math.floor(t / sec) * sec, key = bt + e.side, o = m.get(key) || { t: bt, side: e.side, usd: 0, pv: 0 }; o.usd += e.usd; o.pv += e.px * e.usd; m.set(key, o); }
    L.liqEv = [...m.values()].map((o) => ({ ...o, p: o.pv / o.usd })); }
  if (on(ST.heat)) L.heat = heatData();
  if (on(ST.bub)) { const t0 = k[0].t; L.bubbles = [...BIG.values()].filter((e) => e.t >= t0); }
  if (on(ST.sess) && intra) {
    const tA = k[Math.max(0, va)].t, tB = lastOf(k).t + TF_SEC[ST.tf]; L.sessions = sessions(tA, tB);
    const done = {}; L.sessions.slice().sort((x, y) => y.t0 - x.t0).forEach((s) => { if (done[s.name] || s.t0 > Date.now() / 1000) return; const bars = k.filter((x) => x.t >= s.t0 && x.t < s.t1); if (!bars.length) return; done[s.name] = 1;
      const ab = s.name === "New York" ? "NY" : s.name === "London" ? "LDN" : "Asia"; L.hlines.push({ p: Math.max(...bars.map((x) => x.h)), color: s.color, dash: [3, 3], tag: `${ab} H`, prio: 35, x0: s.t0, alpha: 0.75 }, { p: Math.min(...bars.map((x) => x.l)), color: s.color, dash: [3, 3], tag: `${ab} L`, prio: 35, x0: s.t0, alpha: 0.75 }); });
  }
  L.draw = []; L.hl = new Map();
  if (on(ST.trend) && k.length > 40) drawStructure(L, k, C);
  if (on(ST.pat) && k.length > 60) drawGeo(L, k, C);
  if (on(ST.cdl) && k.length > 30) drawCandles(L, k, C, a);
  if (ST.my && MYLV.list.length) MYLV.list.forEach((l) => L.hlines.push({ p: l.p, color: cssv("--my"), w: 1.6, tag: `${l.label.slice(0, 5)} ${kfmt(l.p)}`, prio: 90, left: l.label }));
  L.subs = lowerPanes(k, C); const host = $("#cMain"); if (host) host.style.setProperty("--subx", `${L.subs.length > 1 ? 90 * (L.subs.length - 1) : 0}px`);
  const nb = CC.nSub(); CC.L = L; if (nb !== L.subs.length) CC.resize(); CC.dirty();
  const n = ["ema", "sma", "vwap", "avwap", "lv", "fib", "prof", "tpo", "zones", "liq", "liqb", "liqev", "heat", "bub", "sess", "my", "pat", "trend", "cdl"].filter((x) => ST[x]).length;
  const lb = $("#bLayers"); if (lb) lb.textContent = `Layers · ${ST.clean ? "clean" : n + " on"} ${ST.layersOpen ? "▴" : "▾"}`;
}

/* ---------- chart drawings: structure, trendlines, chart patterns, candle patterns ---------- */
let GEOC = { key: "", v: [] };
function drawStructure(L, k, C) {
  const n = k.length, W0 = Math.max(0, n - 160), { hi, lo } = TA.pivots(k.slice(W0, -1), 4, 4); hi.forEach((q) => (q.i += W0)); lo.forEach((q) => (q.i += W0));
  const lab = (arr, isHi) => arr.slice(-6).forEach((q, j, s) => { if (!j && arr.length < 7) return; const prev = j ? s[j - 1] : arr[arr.length - 7]; const t = isHi ? (q.p > prev.p ? "HH" : "LH") : q.p > prev.p ? "HL" : "LL", good = t === "HH" || t === "HL";
    L.draw.push({ type: "text", i: q.i, p: q.p, dy: isHi ? -12 : 16, text: t, color: good ? C.up : C.dn, size: 10.5 }); });
  lab(hi, true); lab(lo, false);
  trendLines(L, k, C);
}
// Trendlines: every pair of swing points (minor 3-bar and major 8-bar swings) is a candidate line. A line counts if no candle
// closed through it between its two anchors; it scores for extra touches, length and recency. Best N per side are drawn,
// broken ones fade out a few bars after the break.
function trendLines(L, k, C) {
  const n = k.length, N = { few: 1, more: 3, max: 5 }[ST.tlN] || 3, W0 = Math.max(0, n - 220), seg = k.slice(W0, -1);
  const A = TA.atr ? TA.atr(k) : null, at = (A && A[n - 1]) || (k[n - 1].c * 0.004), tol = at * 0.35;
  const piv = (Lb) => { const { hi, lo } = TA.pivots(seg, Lb, Lb); [hi, lo].forEach((a) => a.forEach((q) => { q.i += W0; q.major = Lb >= 8; })); return { hi, lo }; };
  const mi = piv(3), ma = piv(8), uniq = (a) => a.sort((x, y) => x.i - y.i).filter((q, j, s) => !j || q.i !== s[j - 1].i || ((s[j - 1].major = s[j - 1].major || q.major), false));
  const side = (P, res) => {
    const pts = uniq(P).slice(-14), cand = [];
    for (let x = 0; x < pts.length; x++) for (let y = x + 1; y < pts.length; y++) {
      const a = pts[x], b = pts[y]; if (b.i - a.i < 5) continue; const m = (b.p - a.p) / (b.i - a.i), f = (i) => a.p + m * (i - a.i);
      if (Math.abs(m) > at * 0.22 || n - b.i > 150) continue; // too steep or too old to matter
      let bad = false; for (let i = a.i + 1; i < b.i; i++) { const c = k[i].c; if (res ? c > f(i) + tol : c < f(i) - tol) { bad = true; break; } } if (bad) continue;
      let touch = 2; for (const q of pts) if (q !== a && q !== b && q.i > a.i && Math.abs(q.p - f(q.i)) < tol) touch++;
      let brk = -1; for (let i = b.i + 1; i < n; i++) { const c = k[i].c; if (res ? c > f(i) + tol : c < f(i) - tol) { brk = i; break; } }
      const major = a.major && b.major, score = touch * 3 + (major ? 3 : 0) + (b.i - a.i) / 30 + (b.i - W0) / 40 - (brk >= 0 ? 4 + (n - brk) / 10 : 0);
      cand.push({ a, b, m, f, touch, brk, major, score });
    }
    cand.sort((x, y) => y.score - x.score); const pick = [];
    for (const c of cand) { if (pick.length >= N) break; if (c.brk >= 0 && n - c.brk > 40) continue; if (pick.some((q) => (Math.abs(q.f(n - 1) - c.f(n - 1)) < at * 0.8 && Math.sign(q.m) === Math.sign(c.m)) || q.a === c.a || q.b === c.b || q.a === c.b || q.b === c.a)) continue; pick.push(c); }
    const col = res ? C.dn : C.up;
    pick.forEach((c, j) => {
      const end = c.brk >= 0 ? Math.min(n + 2, c.brk + 4) : n + 8, live = c.brk < 0, w = (c.major ? 2.1 : 1.4) + (j === 0 ? 0.3 : 0);
      L.draw.push({ type: "seg", i0: c.a.i, p0: c.a.p, i1: end, p1: c.f(end), color: live ? col : rgba(col, 0.45), w, dash: c.major ? null : [7, 5], glow: live && j === 0 });
      L.draw.push({ type: "dot", i: c.a.i, p: c.a.p, color: col }, { type: "dot", i: c.b.i, p: c.b.p, color: col });
      if (live && j < 2) L.hlines.push({ p: c.f(n - 1), color: col, alpha: 0, tag: `${res ? "Res" : "Sup"} ${c.touch}×`, prio: 52 - j });
    });
  };
  side([...mi.hi, ...ma.hi], true); side([...mi.lo, ...ma.lo], false);
}
function drawGeo(L, k, C) {
  const key = ST.tf + ":" + k.length + ":" + k[k.length - 2].t; if (GEOC.key !== key) GEOC = { key, v: TA.geoPatterns(k, ST.tf) };
  const col = (c) => C[c] || c, n = k.length;
  for (const p of GEOC.v) {
    const c = p.dir > 0 ? C.up : p.dir < 0 ? C.dn : C.warn, ls = p.lines;
    if (ls.length >= 2 && p.kind !== "hs") { const [u, d] = ls; L.draw.push({ type: "poly", pts: [[u.i0, u.p0], [u.i1, u.p1], [d.i1, d.p1], [d.i0, d.p0]], color: c, alpha: 0.1 }); }
    ls.forEach((s) => L.draw.push({ type: "seg", i0: s.i0, p0: s.p0, i1: s.i1, p1: s.p1, color: col(s.color), w: s.w || 2.2, glow: true }));
    (p.touches || []).forEach((q) => L.draw.push({ type: "dot", i: q.i, p: q.p, color: c }));
    const tch = (p.touches || []).map((q) => q.i), iEnd = Math.min(n - 1, tch.length ? Math.max(...tch) + 1 : Math.min(...ls.map((s) => s.i1)));
    for (let i = Math.max(0, p.i0); i <= iEnd; i++) if (!L.hl.has(i)) L.hl.set(i, c);
    const top = Math.max(...ls.map((s) => Math.max(s.p0, s.p1)));
    L.draw.push({ type: "pill", i: Math.min(n - 1, ls[0].i1 - 2), p: top, dy: -16, text: `${p.name}${p.brk ? (p.brk > 0 ? " ↑ broke out" : " ↓ broke down") : ""}`, color: c, anchor: "right" });
    if (ok(p.breakUp) && p.brk >= 0) L.hlines.push({ p: p.breakUp, color: C.up, dash: [3, 3], alpha: 0.6, x0: k[Math.max(0, p.i0)].t, tag: "Break ↑", prio: 58 });
    if (ok(p.breakDn) && p.brk <= 0) L.hlines.push({ p: p.breakDn, color: C.dn, dash: [3, 3], alpha: 0.6, x0: k[Math.max(0, p.i0)].t, tag: "Break ↓", prio: 58 });
    if (ok(p.tgtUp) && p.brk >= 0 && p.dir >= 0) L.hlines.push({ p: p.tgtUp, color: C.up, dash: [1, 4], alpha: 0.8, x0: k[n - 1].t, tag: "Target ↑", prio: 57 });
    if (ok(p.tgtDn) && p.brk <= 0 && p.dir <= 0) L.hlines.push({ p: p.tgtDn, color: C.dn, dash: [1, 4], alpha: 0.8, x0: k[n - 1].t, tag: "Target ↓", prio: 57 });
  }
}
const CDL_SHORT = { "Bullish engulfing": "Engulf", "Bearish engulfing": "Engulf", "Morning star": "M-star", "Evening star": "E-star", "Three white soldiers": "3 soldiers", "Three black crows": "3 crows", "Bullish harami": "Harami", "Bearish harami": "Harami", "Shooting star": "Shooting ★", "Inverted hammer": "Inv hammer", "Piercing line": "Piercing", "Dark cloud cover": "Dark cloud", "Tweezer bottom": "Tweezer", "Tweezer top": "Tweezer", "Bullish marubozu": "Marubozu", "Bearish marubozu": "Marubozu", "Hanging man": "Hang man" };
function drawCandles(L, k, C, a) {
  const lv = a ? a.Z.map((z) => ({ p: z.c, name: z.names[0] })) : [];
  TA.candlePatterns(k, lv, 40).filter((p) => p.dir && p.strength >= 2).slice(0, 5).forEach((p) => {
    const c = p.dir > 0 ? C.up : C.dn; for (let j = 0; j < (p.n || 1); j++) L.hl.set(p.i - j, c); L.draw.push({ type: "pill", i: p.i, p: p.dir > 0 ? p.lo : p.hi, dy: p.dir > 0 ? 18 : -18, text: CDL_SHORT[p.name] || p.name, color: c, size: 10 });
  });
}

/* ---------- controls ---------- */
document.addEventListener("click", (e) => {
  if (e.target.closest("#bFull") && ST.layersOpen) { ST.layersOpen = false; $("#layers").hidden = true; CH.xKey = null; chartExtras(); }
  if (e.target.closest("#bLayers")) { ST.layersOpen = !ST.layersOpen; $("#layers").hidden = !ST.layersOpen; CH.xKey = null; chartExtras(); return; }
  if (e.target.closest("#bClean")) { ST.clean = !ST.clean; LS.set("clean", ST.clean); $("#bClean").setAttribute("aria-pressed", ST.clean); CH.xKey = null; chartExtras(); return; }
  const tl = e.target.closest("[data-tln]"); if (tl) { ST.tlN = tl.dataset.tln; LS.set("tlN", ST.tlN); if (!ST.trend) { ST.trend = true; LS.set("trend", true); syncCtl(); } syncLow(); CH.xKey = null; chartExtras(); return; }
  const lp = e.target.closest("[data-lps]"); if (lp) { ST.lpStyle = lp.dataset.lps; LS.set("lpStyle", ST.lpStyle); if (!ST.lowers.includes("pos")) { ST.lowers.push("pos"); while (ST.lowers.length > 4) ST.lowers.shift(); LS.set("lowers", ST.lowers); tick("pfc"); } syncLow(); CH.xKey = null; chartExtras(); return; }
  const pr = e.target.closest("[data-lpre]"); if (pr) { ST.lowers = pr.dataset.lpre === "cw" ? ["cvdc", "oic", "liq", "vol"] : ["bcvd"]; LS.set("lowers", ST.lowers); syncLow(); tick("pfc"); CH.xKey = null; chartExtras(); return; }
  const lw = e.target.closest("[data-low]"); if (lw) { const id = lw.dataset.low, L2 = ST.lowers.filter((x) => x !== id); if (L2.length === ST.lowers.length) { L2.push(id); while (L2.length > 4) L2.shift(); } ST.lowers = L2; LS.set("lowers", L2); syncLow(); if (id === "pos" || id === "cvd" || id === "oi") tick("pfc"); CH.xKey = null; chartExtras(); return; }
  if (e.target.closest("#bAddLv") && MYADD) { MYLV = { at: Date.now(), list: [...MYLV.list, { p: MYADD, label: "Mine", man: true }].sort((a, b) => b.p - a.p) }; LS.set("myLevels", MYLV); MYADD = null; drawMyLevels(); CH.xKey = null; chartExtras(); return; }
  const rm = e.target.closest("[data-rmlv]"); if (rm) { MYLV = { at: MYLV.at, list: MYLV.list.filter((_, i) => i !== +rm.dataset.rmlv) }; LS.set("myLevels", MYLV); drawMyLevels(); CH.xKey = null; chartExtras(); return; }
  if (e.target.closest("#bMySave")) { const v = $("#myTxt").value; MYLV = { at: Date.now(), list: [...MYLV.list.filter((l) => l.man), ...parseLevels(v, curPx())].sort((a, b) => b.p - a.p) }; LS.set("myLevels", MYLV); $("#myMsg").textContent = MYLV.list.length ? `Saved ${MYLV.list.length} levels. They're on the chart.` : "No prices found. Paste lines like “Support 79,750” or “R1 81.2k”."; drawMyLevels(); CH.xKey = null; chartExtras(); return; }
  if (e.target.closest("#bMyClear")) { MYLV = { at: 0, list: [] }; LS.set("myLevels", MYLV); $("#myTxt").value = ""; $("#myMsg").textContent = "Cleared."; drawMyLevels(); CH.xKey = null; chartExtras(); }
});
const _draw2 = drawStage2;
drawStage2 = function (tab) { _draw2(tab); if (tab === "overview") { drawMood(); } };
function syncLow() { document.querySelectorAll("[data-low]").forEach((b) => b.setAttribute("aria-pressed", ST.lowers.includes(b.dataset.low))); document.querySelectorAll("[data-lps]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lps === ST.lpStyle)); document.querySelectorAll("[data-tln]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.tln === ST.tlN)); }
syncLow(); $("#tfSeg").addEventListener("click", () => setTimeout(() => { if (D.pfc && D.pfc.per !== PFC_PER[ST.tf]) tick("pfc"); }, 0));
if ($("#bClean")) $("#bClean").setAttribute("aria-pressed", ST.clean);
drawMyLevels(); initChart(); if (CC) { CC.subAdj = ST.subAdj; CC.onSplit = (v) => { ST.subAdj = v; LS.set("subAdj", v); }; } syncCtl(); render();
["wsBnT", "wsOkT", "fng"].forEach((id) => tick(id));
