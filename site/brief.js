/* ===================== Trade brief (top of the Chart tab) =====================
   One card that pulls the whole dashboard together: lean, where price sits, the nearest levels above and below
   (zones + GEX + your levels), what would change the picture, the best setup each way, flow context and the
   next macro event. Everything here is computed in the browser from data the dashboard already loads. */
ST.briefOpen = LS.get("briefOpen", true);
let BRIEF = "";
function briefLevels(a) {
  const px = a.px, out = [];
  (a.Z || []).forEach((z) => out.push({ p: z.c, lo: z.lo, hi: z.hi, w: z.w, names: z.names.slice(), src: "zone" }));
  if (typeof gexCalc === "function") { const g = gexCalc("all"); if (g) gexLevels(g).filter((l) => /flip|wall|Magnet/i.test(l.name)).forEach((l) => out.push({ p: l.p, lo: l.p, hi: l.p, w: l.id === "FLIP" ? 2 : 1.5, names: [l.name], src: "gex" })); }
  if (typeof MYLV !== "undefined") MYLV.list.forEach((l) => out.push({ p: l.p, lo: l.p, hi: l.p, w: 2.5, names: [l.label && l.label !== "Mine" ? `My ${l.label}` : "My level"], src: "my" }));
  // merge anything within 0.15% of each other
  out.sort((x, y) => x.p - y.p); const m = [];
  for (const l of out) { const z = m[m.length - 1]; if (z && (l.p - z.hi) / px <= 0.0015) { z.hi = Math.max(z.hi, l.hi); z.lo = Math.min(z.lo, l.lo); z.p = (z.p * z.w + l.p * l.w) / (z.w + l.w); z.w += l.w; z.names.push(...l.names); z.my = z.my || l.src === "my"; z.gex = z.gex || l.src === "gex"; } else m.push({ ...l, my: l.src === "my", gex: l.src === "gex" }); }
  m.forEach((z) => { z.names = [...new Set(z.names)]; z.d = ((z.p - px) / px) * 100; z.str = z.w >= 5 ? 3 : z.w >= 3 ? 2 : 1; });
  const above = m.filter((z) => z.lo > px * 1.0004).sort((x, y) => x.p - y.p).slice(0, 3), below = m.filter((z) => z.hi < px * 0.9996).sort((x, y) => y.p - x.p).slice(0, 3);
  return { above, below };
}
function briefPick(list) { // the level that matters most nearby: strong and close
  let best = null, bs = -1; for (const z of list) { const sc = z.w / (0.4 + Math.abs(z.d)); if (sc > bs) { bs = sc; best = z; } } return best;
}
function drawBrief(a) {
  const el = $("#brief"); if (!el) return;
  if (!a) { const h = `<div class="ph"><span class="pt">Trade brief</span></div><div class="unavail">Building the brief as data comes in…</div>`; if (BRIEF !== h) { el.innerHTML = h; BRIEF = h; } return; }
  const px = a.px, { above, below } = briefLevels(a), A = aggr(), C = chartColors();
  const oi1 = live("okxOI") ? seriesChg(D.okxOI.s, 3600) : null, oi4 = live("okxOI") ? seriesChg(D.okxOI.s, 4 * 3600) : null;
  const prem = live("cb") && live("spot") ? ((D.cb.px - D.spot.px) / D.spot.px) * 100 : null;
  const w1 = live("k5") ? win(D.k5.k, 12) : null, w4 = live("k5") ? win(D.k5.k, 48) : null;
  const g = typeof gexCalc === "function" ? gexCalc("all") : null;
  const nm = (z) => esc(z.names.slice(0, 2).join(" · ") + (z.names.length > 2 ? ` +${z.names.length - 2}` : ""));
  const lvRow = (z, side) => `<div class="blv ${side}"><span class="blp">${n0(z.p)}</span><span class="bld ${side === "up" ? "dn" : "up"}">${z.d >= 0 ? "+" : "−"}${Math.abs(z.d).toFixed(2)}%</span><span class="bln">${nm(z)}${z.my ? ' <i class="bmy">mine</i>' : ""}</span><span class="bls" title="strength">${"●".repeat(z.str)}${"○".repeat(3 - z.str)}</span></div>`;

  // headline: lean + where price is
  const parts = [];
  const lean = a.bias >= 25 ? "Bullish" : a.bias <= -25 ? "Bearish" : a.bias > 5 ? "Leaning up" : a.bias < -5 ? "Leaning down" : "Neutral";
  parts.push(`<b class="${vcls(a.bias)}">${lean}</b> (${a.bias > 0 ? "+" : ""}${a.bias}): technicals ${a.mtf > 0 ? "+" : ""}${a.mtf}, flow ${a.flow > 0 ? "+" : ""}${a.flow}.`);
  if (w1 && w4) parts.push(`Price ${pct(w1.pChg)} in 1h, ${pct(w4.pChg)} in 4h.`);
  if (g && ok(g.flip)) parts.push(px >= g.flip ? `Above the GEX flip (${kfmt(g.flip)}), so dealers tend to dampen moves.` : `Below the GEX flip (${kfmt(g.flip)}), so moves can run further.`);
  if (typeof FIBA !== "undefined" && FIBA.v && typeof fibPlan === "function" && CC && CC.k.length) { const pl = fibPlan(FIBA.v, CC.k); if (pl) parts.push(`Fib: ${pl.title.replace(/—/g, "–")}.`); }

  // what to watch
  const watch = [], up = briefPick(above), dn = briefPick(below), nx1 = above[0], nb1 = below[0];
  if (up) { const next = above.find((z) => z.p > up.hi * 1.001); watch.push(`<span class="up">▲</span> A 30m close above <b>${n0(up.hi)}</b> (${nm(up)}) opens <b>${next ? n0(next.p) : "the next leg up"}</b>${a.bias < 0 ? " and would flip the lean" : ""}.`); }
  if (dn) { const next = below.find((z) => z.p < dn.lo * 0.999); watch.push(`<span class="dn">▼</span> Losing <b>${n0(dn.lo)}</b> (${nm(dn)}) opens <b>${next ? n0(next.p) : "the next leg down"}</b>${a.bias > 0 ? " and would flip the lean" : ""}.`); }
  if (nx1 && nb1) { const rng = ((nx1.p - nb1.p) / px) * 100; if (rng < 0.6) watch.push(`<span class="wn">◆</span> Price is boxed between <b>${n0(nb1.p)}</b> and <b>${n0(nx1.p)}</b> (${rng.toFixed(2)}% wide). Chop risk: wait for a break and retest.`); }
  const fr = a.reasons.filter((r) => r.v && !/technicals|Biggest liquidity/.test(r.txt)).slice(0, 2);
  fr.forEach((r) => watch.push(`<span class="${vcls(r.v)}">${r.v > 0 ? "▲" : "▼"}</span> ${esc(r.txt)}`));
  if (a.L && a.L.shorts[0] && a.L.longs[0]) { const s0 = a.L.shorts[0], l0 = a.L.longs[0], near = Math.abs(s0.p - px) < Math.abs(l0.p - px) ? ["short", s0, "above"] : ["long", l0, "below"];
    watch.push(`<span class="wn">◎</span> Closest big liquidity: ${near[0]} liqs ${near[2]} at <b>${n0(near[1].p)}</b> (${usd(near[1].usd)}, ${distTxt(near[1].p, px)}). Price is often pulled toward these.`); }
  if (live("cal")) { const nx = D.cal.ev.find((e) => e.t > Date.now() - 5 * 60000 && e.impact === "High"); if (nx && nx.t - Date.now() < 48 * 36e5) watch.push(`<span class="wn">⚑</span> <b>${esc(nx.title)}</b> ${untilTxt(nx.t - Date.now())} (${new Date(nx.t).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}). Expect a volatility spike; size down or wait.`); }

  // best setups
  const bs = (arr, side) => { const s = arr[0]; if (!s) return `<div class="bset ${side}"><b>${side === "up" ? "Long" : "Short"}</b><span class="mut">No setup qualifies right now</span></div>`;
    return `<button class="bset ${side}" data-goto="setups"><b>${side === "up" ? "Long" : "Short"}</b><span>${n0(s.entry)} → ${n0(s.tp1)} / ${kfmt(s.tp2)}</span><span class="mut">SL ${n0(s.stop)} · R:R ${s.rr.toFixed(1)} · ${esc(s.conf)}</span></button>`; };

  // context chips
  const chip = (lab, val, cls, tip) => `<span class="bchip" title="${esc(tip || "")}"><i>${lab}</i><b class="${cls || ""}">${val}</b></span>`;
  const chips = [];
  if (ok(A.f8)) chips.push(chip("Funding 8h", `${(A.f8 * 100).toFixed(4)}%`, A.f8 > 0.0003 ? "dn" : A.f8 < 0 ? "up" : "", "OI-weighted funding across venues. High positive = crowded longs."));
  if (ok(oi1)) chips.push(chip("OI 1h", pct(oi1), "", `Open interest change (OKX). 4h ${ok(oi4) ? pct(oi4) : "–"}`));
  if (w1) chips.push(chip("Spot CVD 1h", `${sgn(w1.cvd, 0)} BTC`, vcls(w1.cvd), "Binance spot buyers minus sellers, last hour"));
  if (ok(prem)) chips.push(chip("CB premium", pct(prem, 3), vcls(prem), "Coinbase vs Binance. Positive = US buyers stronger."));
  if (live("okxLS")) { const ls = D.okxLS.s; chips.push(chip("L/S accts", nd(ls[ls.length - 1].v, 2), "", "OKX long accounts per short account")); }
  if (g) chips.push(chip("Gamma", ok(g.flip) ? (px >= g.flip ? "Positive" : "Negative") : g.net >= 0 ? "Positive" : "Negative", ok(g.flip) ? (px >= g.flip ? "up" : "dn") : "", "Dealer gamma regime from Deribit options"));
  if (g && ok(g.em1)) chips.push(chip("Exp. move 1d", `±$${n0(g.em1)}`, "", "Options-implied one-day move"));

  const t = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const html = `<details class="bwrap"${ST.briefOpen ? " open" : ""}><summary class="bhd"><span class="pt">Trade brief</span>${tag(a.verdict, a.bias)}<span class="bsc ${vcls(a.bias)}">${a.bias > 0 ? "+" : ""}${a.bias}</span><span class="mut bt">${t}</span></summary>
    <p class="bhl">${parts.join(" ")}</p>
    <div class="blvs"><div><div class="bcap">Above · resistance</div>${above.length ? above.map((z) => lvRow(z, "up")).join("") : `<div class="mut">No level within 7%</div>`}</div>
      <div class="bnow"><span>Now</span><b>${n0(px)}</b></div>
      <div><div class="bcap">Below · support</div>${below.length ? below.map((z) => lvRow(z, "down")).join("") : `<div class="mut">No level within 7%</div>`}</div></div>
    <div class="bcap" style="margin-top:10px">What to watch</div><ul class="bwl">${watch.map((w) => { const m = w.match(/^(<span[^>]*>[^<]*<\/span>)\s*([\s\S]*)$/); return m ? `<li>${m[1]}<span>${m[2]}</span></li>` : `<li><span></span><span>${w}</span></li>`; }).join("")}</ul>
    <div class="bcap">Best setups</div><div class="bsets">${bs(a.S.longs, "up")}${bs(a.S.shorts, "down")}</div>
    <div class="bchips">${chips.join("")}</div>
    <div class="src">Levels merge zones, swing highs/lows, opens, VWAP, liquidation clusters, GEX and your levels; ● = how many agree. Rules only, not advice.</div></details>`;
  if (html === BRIEF) return; BRIEF = html; el.innerHTML = html;
  el.querySelector(".bwrap").addEventListener("toggle", (e) => { ST.briefOpen = e.target.open; LS.set("briefOpen", ST.briefOpen); });
}
document.addEventListener("click", (e) => { const b = e.target.closest("[data-goto]"); if (b) { setTab(b.dataset.goto); window.scrollTo({ top: 0 }); } });
