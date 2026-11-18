"use strict";
/* ===================== Voices: what big BTC names are saying =====================
   Google News search (RSS, through the site's /px/gnews pass-through) for a list of well-known bitcoin voices:
   founders, fund managers, banks' analysts, traders, on-chain analysts and skeptics. Each headline is matched to the
   person it names, toned with simple word rules, and scanned for BTC price targets ($150K, $1 million…).
   No API keys, no AI; refreshes every 15 minutes while Intel or Signals is open. */
const VOICES = [
  // [name, group, role, regex (matched on the headline), usual stance]
  ["Michael Saylor", "Bulls & treasuries", "Strategy (MSTR) chairman", /saylor/i, 1],
  ["Larry Fink", "Funds & banks", "BlackRock CEO", /\bfink\b/i, 1],
  ["Cathie Wood", "Funds & banks", "ARK Invest CEO", /cathie wood|\bark invest/i, 1],
  ["Tom Lee", "Funds & banks", "Fundstrat / BitMine", /tom lee|fundstrat/i, 1],
  ["Geoffrey Kendrick", "Funds & banks", "Standard Chartered", /kendrick|standard chartered/i, 1],
  ["Matt Hougan", "Funds & banks", "Bitwise CIO", /hougan|bitwise/i, 1],
  ["Mike Novogratz", "Funds & banks", "Galaxy CEO", /novogratz/i, 1],
  ["Jurrien Timmer", "Funds & banks", "Fidelity macro", /timmer/i, 0],
  ["Eric Balchunas", "Funds & banks", "Bloomberg ETF analyst", /balchunas|seyffart/i, 0],
  ["Arthur Hayes", "Traders & macro", "BitMEX co-founder", /arthur hayes|\bhayes\b/i, 1],
  ["Raoul Pal", "Traders & macro", "Real Vision", /raoul pal/i, 1],
  ["Peter Brandt", "Traders & macro", "Veteran chartist", /peter brandt|\bbrandt\b/i, 0],
  ["Lyn Alden", "Traders & macro", "Macro analyst", /lyn alden/i, 1],
  ["Willy Woo", "On-chain", "On-chain analyst", /willy woo/i, 0],
  ["Ki Young Ju", "On-chain", "CryptoQuant CEO", /ki young ju|cryptoquant/i, 0],
  ["Glassnode", "On-chain", "On-chain data", /glassnode/i, 0],
  ["Changpeng Zhao", "Industry", "Binance founder", /changpeng|\bcz\b/i, 1],
  ["Brian Armstrong", "Industry", "Coinbase CEO", /brian armstrong/i, 1],
  ["Jack Dorsey", "Industry", "Block CEO", /dorsey/i, 1],
  ["Jack Mallers", "Industry", "Strike / Twenty One", /mallers/i, 1],
  ["Samson Mow", "Industry", "JAN3 CEO", /samson mow/i, 1],
  ["Anthony Pompliano", "Industry", "Investor, podcaster", /pompliano|\bpomp\b/i, 1],
  ["Peter Schiff", "Skeptics", "Gold bug, BTC skeptic", /schiff/i, -1],
  ["Jamie Dimon", "Skeptics", "JPMorgan CEO", /dimon/i, -1],
];
const VQ = [ // Google News OR-queries (kept short so each URL stays reasonable)
  '("Michael Saylor" OR "Larry Fink" OR "Cathie Wood" OR "Tom Lee" OR "Standard Chartered" OR "Matt Hougan" OR "Novogratz" OR "Jurrien Timmer") bitcoin when:7d',
  '("Arthur Hayes" OR "Raoul Pal" OR "Peter Brandt" OR "Lyn Alden" OR "Willy Woo" OR "Ki Young Ju" OR "Glassnode" OR "Balchunas") bitcoin when:7d',
  '("Changpeng Zhao" OR "Brian Armstrong" OR "Jack Dorsey" OR "Jack Mallers" OR "Samson Mow" OR "Pompliano" OR "Peter Schiff" OR "Jamie Dimon") bitcoin when:7d',
];
const VBULL = /\b(bull(ish)?|rall(y|ies)|soar|surge|moon|breakout|higher|buy(ing|s)?|accumulat\w*|bottom(ed)? (is )?in|undervalued|parabolic|supercycle|all-time high|ath|record|\$\d[\d,.]*\s?(k|m|million)\b.*\b(by|in|target|predict))/i;
const VBEAR = /\b(bear(ish)?|crash|plunge|collapse|bubble|sell(ing|s|-off)?|dump|top (is )?in|warns?|warning|fall|drop|risk|capitulat\w*|bear market|lower|correction|overvalued|ponzi|worthless)\b/i;
ST.voGrp = LS.get("voGrp", "all");
const voWanted = () => ["voices", "now"].includes(ST.tab);
VQ.forEach((q, i) => {
  const f = { id: "vo" + i, name: "Google News", px: "gnews", host: "https://news.google.com", path: `/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`, agg: true };
  def(f.id, `Voices ${i + 1}/3`, "Intel → Voices", 15 * 60000, async () => ({ items: parseFeed(await getFeed(f), f) }), true);
  SRC[f.id].when = voWanted;
});
function voTargets(t) { // BTC price targets in a headline: "$150K", "$1 million", "$200,000"
  const out = []; const re = /\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(k|K|thousand|m|M|million|mn)?\b/g; let m;
  while ((m = re.exec(t))) { let v = parseFloat(m[1].replace(/,/g, "")); const u = (m[2] || "").toLowerCase(); if (u === "k" || u === "thousand") v *= 1e3; else if (u === "m" || u === "million" || u === "mn") v *= 1e6;
    if (v >= 20000 && v <= 2e7 && /bitcoin|btc/i.test(t)) out.push(v); }
  return out;
}
let VOC = { key: "", v: null };
function voCompute() {
  const ids = VQ.map((_, i) => "vo" + i), key = ids.map((id) => SRC[id].st.okAt).join("|"); if (VOC.key === key) return VOC.v;
  const seen = new Set(), items = [];
  ids.forEach((id) => { if (live(id)) D[id].items.forEach((x) => { const k = x.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60); if (seen.has(k)) return; seen.add(k); items.push(x); }); });
  const takes = [];
  for (const x of items) {
    const who = VOICES.filter((p) => p[3].test(x.title)); if (!who.length) continue;
    const b = VBULL.test(x.title), r = VBEAR.test(x.title), tone = b && !r ? 1 : r && !b ? -1 : 0;
    takes.push({ ...x, who: who.map((p) => p[0]), grp: who[0][1], tone, tg: voTargets(x.title) });
  }
  takes.sort((a, b) => b.t - a.t);
  const ppl = VOICES.map(([name, grp, role, , lean]) => { const T = takes.filter((t) => t.who.includes(name)); const s = T.reduce((a, t) => a + t.tone, 0);
    return { name, grp, role, lean, n: T.length, last: T[0] || null, tone: T.length ? s / T.length : 0, tg: T.flatMap((t) => t.tg) }; }).filter((p) => p.n).sort((a, b) => (b.last ? b.last.t : 0) - (a.last ? a.last.t : 0));
  const bulls = takes.filter((t) => t.tone > 0).length, bears = takes.filter((t) => t.tone < 0).length;
  const tg = takes.flatMap((t) => t.tg.map((v) => ({ v, who: t.who[0], t: t.t, link: t.link }))).sort((a, b) => a.v - b.v);
  VOC = { key, v: { takes, ppl, bulls, bears, tg } }; return VOC.v;
}
const initials = (n) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join("");
function drawVoices() {
  const el = $("#voBody"); if (!el) return; const v = voCompute();
  if (!v.takes.length) { const st = VQ.map((_, i) => status("vo" + i)); el.innerHTML = `<div class="panel"><div class="unavail">${st.includes("wait") ? "Searching the news for what big names are saying…" : esc(SRC.vo0.st.err || "No recent headlines found")}</div></div>`; return; }
  const tot = v.bulls + v.bears || 1, px = curPx();
  const tgt = v.tg.length ? `<div class="vtg">${[...new Map(v.tg.map((x) => [Math.round(x.v / 1000), x])).values()].slice(-12).map((x) => `<a class="bchip" href="${esc(x.link)}" target="_blank" rel="noopener"><b class="${px && x.v > px ? "up" : "dn"}">$${x.v >= 1e6 ? (x.v / 1e6).toFixed(x.v % 1e6 ? 1 : 0) + "M" : Math.round(x.v / 1000) + "K"}</b><i>${esc(x.who.split(" ").pop())}</i></a>`).join("")}</div>` : `<div class="mut" style="font-size:13px">No price targets in this week's headlines.</div>`;
  const grps = ["all", ...new Set(VOICES.map((p) => p[1]))];
  const ppl = v.ppl.filter((p) => ST.voGrp === "all" || p.grp === ST.voGrp);
  el.innerHTML = `<div class="panel"><div class="ph"><span class="pt">Big-name sentiment · 7 days</span></div>
      <div class="vmeter"><span class="up">Bullish ${v.bulls}</span><i><b class="vb" style="width:${(v.bulls / tot) * 100}%"></b><b class="vr" style="width:${(v.bears / tot) * 100}%"></b></i><span class="dn">${v.bears} Bearish</span></div>
      <div class="sub" style="margin:6px 0 10px">${v.takes.length} headlines quoting ${v.ppl.length} people. ${v.bulls > v.bears * 2 ? "The loud voices are leaning bullish; that's usual, so watch for who turns cautious." : v.bears > v.bulls ? "More cautious headlines than usual from the big names: often a late-stage-fear signal, sometimes a real warning." : "Mixed."}</div>
      <div class="bcap">Price targets mentioned</div>${tgt}</div>
    <div class="ctl"><span class="seg" style="overflow-x:auto;max-width:100%">${grps.map((g) => `<button data-vog="${esc(g)}" aria-pressed="${ST.voGrp === g}">${g === "all" ? "All" : esc(g)}</button>`).join("")}</span></div>
    <div class="vgrid">${ppl.map((p) => `<div class="panel vcard"><div class="vh"><span class="vav g${VOICES.findIndex((x) => x[0] === p.name) % 6}">${initials(p.name)}</span><div><b>${esc(p.name)}</b><small>${esc(p.role)}</small></div><span class="ftag ${vcls(p.tone)}" style="margin-left:auto;background:color-mix(in srgb,currentColor 12%,transparent)">${p.tone > 0.2 ? "Bullish" : p.tone < -0.2 ? "Bearish" : "Mixed"}</span></div>
      ${p.last ? `<a class="vlast" href="${esc(p.last.link)}" target="_blank" rel="noopener">${esc(p.last.title)}<small>${esc(p.last.outlet)} · ${ago(p.last.t)}</small></a>` : ""}
      <div class="mut" style="font-size:12px">${p.n} headline${p.n > 1 ? "s" : ""} this week${p.tg.length ? ` · targets ${[...new Set(p.tg.map((x) => "$" + (x >= 1e6 ? x / 1e6 + "M" : Math.round(x / 1000) + "K")))].join(", ")}` : ""}</div></div>`).join("") || `<div class="panel unavail">Nobody in this group made the news this week</div>`}</div>
    <div class="panel"><div class="ph"><span class="pt">Latest takes</span></div>${v.takes.filter((t) => ST.voGrp === "all" || t.grp === ST.voGrp).slice(0, 30).map((t) => `<a class="vrow" href="${esc(t.link)}" target="_blank" rel="noopener"><span class="sld ${vcls(t.tone)}"></span><span><b>${esc(t.who.join(", "))}</b> · ${esc(t.title)}<small class="mut" style="display:block">${esc(t.outlet)} · ${ago(t.t)}</small></span></a>`).join("")}
      <div class="src">Google News search for ${VOICES.length} well-known names, last 7 days. Headlines are matched to the person they name; tone comes from headline words only, so read the story before trading on it. Headlines can describe someone without quoting them. Refreshes every 15 min.</div></div>`;
}
function drawVoicesOverview() {
  const el = $("#ovVoices"); if (!el) return; const v = voCompute();
  if (!v.takes.length) { el.innerHTML = `<div class="unavail">Searching…</div>`; return; }
  el.innerHTML = v.takes.slice(0, 4).map((t) => `<a class="vrow" href="${esc(t.link)}" target="_blank" rel="noopener"><span class="sld ${vcls(t.tone)}"></span><span><b>${esc(t.who[0])}</b> · ${esc(t.title)}<small class="mut" style="display:block">${ago(t.t)}</small></span></a>`).join("") + `<button class="btn" data-goto="voices" style="margin-top:6px">All voices ›</button>`;
}
document.addEventListener("click", (e) => { const b = e.target.closest("[data-vog]"); if (b) { ST.voGrp = b.dataset.vog; LS.set("voGrp", ST.voGrp); drawVoices(); } });
const _dVo = drawStage2;
drawStage2 = function (tab) { _dVo(tab); try { if (tab === "voices") drawVoices(); if (tab === "now") drawVoicesOverview(); } catch (e) { console.error(e); } };
