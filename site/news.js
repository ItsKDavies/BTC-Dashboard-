"use strict";
/* ===================== News: important crypto headlines =====================
   Public RSS feeds, fetched by the browser through the site's own /px/<name>/ pass-through (news sites block direct
   browser requests). Stories that several outlets cover are merged into one. "Importance" is a rule score: topic
   keywords + how many outlets carry the story + Bitcoin relevance + freshness. No AI, no API keys. */
const NEWS_FEEDS = [
  { id: "nwCd", name: "CoinDesk", px: "coindesk", host: "https://www.coindesk.com", path: "/arc/outboundfeeds/rss/" },
  { id: "nwCt", name: "Cointelegraph", px: "ctg", host: "https://cointelegraph.com", path: "/rss" },
  { id: "nwTb", name: "The Block", px: "theblock", host: "https://www.theblock.co", path: "/rss.xml" },
  { id: "nwDc", name: "Decrypt", px: "decrypt", host: "https://decrypt.co", path: "/feed" },
  { id: "nwBm", name: "Bitcoin Magazine", px: "btcmag", host: "https://bitcoinmagazine.com", path: "/.rss/full/" },
  // Google News search: brings in Reuters, Bloomberg, CNBC, WSJ etc. when they cover crypto.
  { id: "nwGn", name: "Google News", px: "gnews", host: "https://news.google.com", path: "/rss/search?q=bitcoin+OR+crypto+when:1d&hl=en-US&gl=US&ceid=US:en", agg: true },
];
const NEWS_MS = 300000; // 5 min per feed (the edge caches each feed for 5 min too)

async function getText(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
  try { const r = await fetch(url, { signal: ctl.signal, cache: "no-store" }); if (!r.ok) throw new HttpErr(r.status); return await r.text(); }
  finally { clearTimeout(t); }
}
async function getFeed(f) {
  if (canProxy) { try { return await getText(`/px/${f.px}${f.path}`); } catch (e) { if (e.status !== 404) throw e; } } // no pass-through: try direct
  return getText(f.host + f.path);
}
const htmlText = (s) => { if (!s || !/[<&]/.test(s)) return (s || "").trim(); try { return (new DOMParser().parseFromString(s, "text/html").body.textContent || "").trim(); } catch (e) { return s.replace(/<[^>]*>/g, " ").trim(); } };
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");
function parseFeed(xml, f) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Feed isn't valid XML (site may be blocking the pass-through)");
  const nodes = [...doc.getElementsByTagName("item")].concat([...doc.getElementsByTagName("entry")]).slice(0, 50);
  const tx = (el, tag) => { const x = el.getElementsByTagName(tag)[0]; return x ? (x.textContent || "").trim() : ""; };
  const at = (el, tag, a) => { const x = el.getElementsByTagName(tag)[0]; return x ? x.getAttribute(a) || "" : ""; };
  const out = [];
  for (const el of nodes) {
    let title = htmlText(tx(el, "title")), link = tx(el, "link") || at(el, "link", "href"), outlet = f.name;
    if (f.agg) { const s = tx(el, "source"); if (s) { outlet = s; title = title.replace(new RegExp("\\s+[-–—]\\s+" + s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"), ""); } }
    const t = Date.parse(tx(el, "pubDate") || tx(el, "published") || tx(el, "updated") || tx(el, "dc:date"));
    if (!title || !safeUrl(link) || !ok(t)) continue;
    const rawDesc = tx(el, "description") || tx(el, "summary") || "";
    let img = at(el, "media:content", "url") || at(el, "media:thumbnail", "url") || (/^image/.test(at(el, "enclosure", "type")) ? at(el, "enclosure", "url") : "");
    if (!img) { const m = /<img[^>]+src="([^"]+)"/i.exec(rawDesc + tx(el, "content:encoded").slice(0, 3000)); if (m) img = m[1]; }
    let desc = f.agg ? "" : htmlText(rawDesc).replace(/\s+/g, " ");
    if (desc.length > 240) desc = desc.slice(0, 230).replace(/\s+\S*$/, "") + "…";
    const cats = [...el.getElementsByTagName("category")].map((c) => (c.textContent || "").trim()).filter(Boolean).slice(0, 8);
    out.push({ title, link, t, outlet, via: f.agg ? f.name : "", desc, img: safeUrl(img), cats });
  }
  if (!out.length) throw new Error("Feed returned no stories");
  return out;
}
NEWS_FEEDS.forEach((f) => def(f.id, `News: ${f.name}`, "News tab, Overview headlines", NEWS_MS, async () => ({ items: parseFeed(await getFeed(f), f) }), true));

/* ---------- scoring (rules, not AI) ---------- */
const NTOP = [
  ["macro", "Macro", /\b(fed|fomc|powell|rate (cut|hike)s?|interest rates?|cpi|inflation|jobs report|payrolls|nfp|pce|gdp|treasur(y|ies)|bond yields?|recession|tariffs?|dxy|federal reserve)\b/i, 3],
  ["reg", "Regulation", /\b(sec|cftc|doj|regulat\w*|lawsuit|sues|sued|court|judge|congress|senate|lawmakers?|legislation|bill|clarity act|genius act|executive order|white house|ban(s|ned)?|sanction\w*)\b/i, 3],
  ["etf", "ETFs & treasuries", /\b(etfs?|etps?|inflows?|outflows?|blackrock|ibit|fidelity|grayscale|gbtc|microstrategy|mstr|saylor|strategy (inc|buys|adds|acquires|purchases)|metaplanet|treasury compan\w*|strategic (bitcoin )?reserve)\b/i, 3],
  ["risk", "Hacks & risk", /\b(hack(ed|er|ers|s)?|exploit(ed|s)?|drain(ed)?|stolen|breach|scam|rug ?pull|insolven\w*|bankrupt\w*|depeg\w*|withdrawals? (halt|paused|suspend)\w*|halts? withdrawals|outage|collapse\w*)\b/i, 4],
  ["mkt", "Markets", /\b(rall(y|ies|ied)|surg(e|es|ed)|soar\w*|plung\w*|crash\w*|tumbl\w*|sell-?off|record high|all-time high|ath|liquidat\w*|short squeeze|open interest|funding rates?|options expir\w*|whales?|volatil\w*|\$\d{2,3}(,\d{3}|k))\b/i, 2],
];
const NBTC = /\b(bitcoin|btc)\b/i, NALT = /\b(ether(eum)?|eth|solana|sol|xrp|doge(coin)?|memecoins?|nfts?|cardano|altcoins?|tokens?)\b/i;
const NLOW = /\b(price predictions?|predicts?|could|might|here'?s why|what to expect|top \d+|best \w+|how to|guide|explained|podcast|sponsored|press release|op-ed|opinion|recap|newsletter|quiz|giveaway|review)\b/i;
const NTIER = /^(reuters|bloomberg|the wall street journal|wsj|financial times|cnbc|associated press|ap news|the new york times|barron'?s|marketwatch|axios|forbes|fortune|yahoo finance)/i;
const NUP = /\b(surg\w*|rall\w*|soar\w*|jump\w*|gain\w*|climb\w*|record high|all-time high|inflows?|approv\w*|adopt\w*|buys|bought|accumulat\w*|bull\w*|rebound\w*|recover\w*|breakout)\b/i;
const NDN = /\b(plung\w*|crash\w*|drop\w*|fall(s|ing)?|fell|slid\w*|slump\w*|tumbl\w*|sell-?off|outflows?|hack\w*|exploit\w*|lawsuit|sued|ban(s|ned)?|bear\w*|fear\w*|reject\w*|delay\w*|liquidat\w*|dump\w*|lows?)\b/i;
const NSTOP = new Set("the a an and or of to in on for with as at by from is are be its it this that after amid over into new says said say will could may than more why how what who has have had about up down vs".split(" "));
const ntok = (s) => [...new Set(s.toLowerCase().replace(/[’']s\b/g, "").replace(/[^a-z0-9$%.]+/g, " ").split(" ").filter((w) => w.length > 2 && !NSTOP.has(w)))];
function sameStory(a, b) {
  let c = 0; for (const w of a) if (b.includes(w)) c++;
  const mn = Math.min(a.length, b.length); return mn >= 3 && (c / mn >= 0.6 || c / (a.length + b.length - c) >= 0.45) && c >= 3;
}
let NEWS_MEMO = { key: "", v: null };
function newsAll() {
  const live0 = NEWS_FEEDS.filter((f) => live(f.id)), key = live0.map((f) => f.id + SRC[f.id].st.okAt).join() + "|" + Math.floor(Date.now() / 60000);
  if (NEWS_MEMO.key === key) return NEWS_MEMO.v;
  const now = Date.now(), seen = new Set(), raw = [];
  for (const f of live0) for (const it of D[f.id].items) {
    if (it.t > now + 6e5 || now - it.t > 48 * 36e5) continue;
    const k = it.link.replace(/[?#].*$/, "").replace(/\/$/, ""); if (seen.has(k)) continue; seen.add(k);
    raw.push({ ...it, tok: ntok(it.title) });
  }
  raw.sort((a, b) => a.t - b.t);
  const clusters = [];
  for (const it of raw) {
    const c = clusters.find((c) => Math.abs(c.t - it.t) < 30 * 36e5 && c.items.some((x) => sameStory(x.tok, it.tok)));
    if (c) c.items.push(it); else clusters.push({ t: it.t, items: [it] });
  }
  const out = clusters.map((c) => {
    const lead = c.items.find((x) => x.desc) || c.items[0];
    const head = c.items.find((x) => !NTIER.test(x.outlet) && !x.via) || c.items[0];
    const outlets = [...new Set([head.outlet, ...c.items.map((x) => x.outlet)])]; // prefer a crypto outlet's headline/link (Google links are redirects)
    const text = c.items.map((x) => x.title + " " + x.cats.join(" ")).join(" ");
    const topics = NTOP.filter(([, , rx]) => rx.test(text));
    const btc = NBTC.test(text), alt = !btc && NALT.test(head.title), low = NLOW.test(head.title) || /\?$/.test(head.title);
    const tier = outlets.some((o) => NTIER.test(o));
    let score = Math.min(7, topics.reduce((s, [, , , w]) => s + w, 0)) + (btc ? 2 : 0) - (alt ? 2.5 : 0) + Math.min(4, outlets.length - 1) * 2 + (tier ? 1.5 : 0) - (low ? 3 : 0);
    const tone = (NUP.test(head.title) ? 1 : 0) - (NDN.test(head.title) ? 1 : 0);
    const ageH = (now - c.t) / 36e5;
    return { title: head.title, link: head.link, t: c.t, last: c.items[c.items.length - 1].t, outlets, desc: lead.desc, img: c.items.map((x) => x.img).find(Boolean) || "", items: c.items,
      topics: topics.map(([k, l]) => ({ k, l })), btc, score, lvl: score >= 9 ? 2 : score >= 5.5 ? 1 : 0, tone, rank: score / (1 + ageH / 8) };
  }).sort((a, b) => b.t - a.t);
  NEWS_MEMO = { key, v: out }; return out;
}

/* ---------- UI ---------- */
ST.newsScope = LS.get("newsScope", "imp"); ST.newsTopic = LS.get("newsTopic", ""); ST.newsSeen = LS.get("newsSeen", 0);
let NEWS_PREV_SEEN = ST.newsSeen;
const newsAgo = (t) => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ${m % 60 ? (m % 60) + "m " : ""}ago`.replace(/ (\d+)m ago/, " ago") : `${Math.floor(m / 1440)}d ago`; };
const newsOutlets = (s) => `<b>${esc(s.outlets[0])}</b>${s.outlets.length > 1 ? ` <span class="mut" title="${esc(s.outlets.slice(1).join(", "))}">+${s.outlets.length - 1} more outlet${s.outlets.length > 2 ? "s" : ""}</span>` : ""}`;
const newsTags = (s) => `${s.lvl === 2 ? `<span class="ntag nmaj">Major</span>` : s.lvl === 1 ? `<span class="ntag nimp">Important</span>` : ""}${s.topics.map((x) => `<span class="ntag">${x.l}</span>`).join("")}${s.btc ? `<span class="ntag nbtc">BTC</span>` : ""}`;
const toneCls = (s) => (s.tone > 0 ? " nup" : s.tone < 0 ? " ndn" : "");
const isNew = (s) => NEWS_PREV_SEEN && s.t > NEWS_PREV_SEEN;
function newsCard(s, big) {
  return `<article class="ncard${toneCls(s)}">${big && s.img ? `<img class="nimg" src="${esc(s.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}
    <div class="nbody"><div class="ntags">${isNew(s) ? `<span class="ntag nnew">New</span>` : ""}${newsTags(s)}</div>
    <a class="ntitle" href="${esc(s.link)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>
    ${big && s.desc ? `<div class="ndesc">${esc(s.desc)}</div>` : ""}
    <div class="nmeta">${newsOutlets(s)} · ${newsAgo(s.t)}</div></div></article>`;
}
function newsFeedStatus() {
  return NEWS_FEEDS.map((f) => { const st = status(f.id); return `<span class="nfs ${st === "ok" || st === "stale" ? "ok" : st === "wait" ? "wait" : "down"}" title="${esc(SRC[f.id].st.err || st)}">${f.name}</span>`; }).join("");
}
function drawNews() {
  const el = $("#newsTop"); if (!el) return;
  const all = newsAll(), nLive = NEWS_FEEDS.filter((f) => live(f.id)).length;
  $("#newsFeeds").innerHTML = newsFeedStatus();
  if (!nLive) { const any = NEWS_FEEDS.some((f) => status(f.id) === "wait"); el.innerHTML = `<div class="unavail">${any ? "Loading headlines…" : "No news feed reachable right now. Check the Sources tab for details."}</div>`; $("#newsList").innerHTML = ""; $("#newsPulse").innerHTML = ""; return; }
  const day = all.filter((s) => Date.now() - s.t < 24 * 36e5);
  const top = day.filter((s) => s.lvl > 0).sort((a, b) => b.rank - a.rank).slice(0, 5);
  el.innerHTML = top.length ? `<div class="ntop">${top.map((s, i) => newsCard(s, true)).join("")}</div>` : `<div class="unavail">No major stories in the last 24 hours. Quiet tape.</div>`;
  $("#newsPulse").innerHTML = pulseHTML(day);
  // filters
  $("#newsSeg").innerHTML = [["imp", "Important"], ["btc", "Bitcoin"], ["all", "All"]].map(([v, l]) => `<button data-nscope="${v}" aria-pressed="${ST.newsScope === v}">${l}</button>`).join("");
  $("#newsChips").innerHTML = NTOP.map(([k, l]) => `<button class="chip" data-ntopic="${k}" aria-pressed="${ST.newsTopic === k}">${l}</button>`).join("");
  let list = all.filter((s) => (ST.newsScope === "imp" ? s.lvl > 0 : ST.newsScope === "btc" ? s.btc : true) && (!ST.newsTopic || s.topics.some((x) => x.k === ST.newsTopic)));
  const groups = [["Last hour", 36e5], ["Last 6 hours", 6 * 36e5], ["Last 24 hours", 24 * 36e5], ["Older", Infinity]];
  let html = "", from = 0;
  for (const [lab, lim] of groups) {
    const g = list.filter((s) => { const a = Date.now() - s.t; return a >= from && a < lim; }); from = lim;
    if (g.length) html += `<div class="calday">${lab} · ${g.length}</div>` + g.map((s) => `<div class="nrow${toneCls(s)}"><span class="ntime">${new Date(s.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span><span class="imp ${s.lvl === 2 ? "hi" : s.lvl === 1 ? "md" : "lo"}"></span><span style="min-width:0"><a class="nlink" href="${esc(s.link)}" target="_blank" rel="noopener noreferrer">${isNew(s) ? `<span class="ntag nnew">New</span>` : ""}${esc(s.title)}</a><span class="nmeta">${newsOutlets(s)}${s.topics.length ? " · " + s.topics.map((x) => x.l).join(", ") : ""}</span></span></div>`).join("");
  }
  $("#newsList").innerHTML = html || `<div class="unavail">Nothing matches this filter in the last 48 hours.</div>`;
}
function pulseHTML(day) {
  const imp = day.filter((s) => s.lvl > 0), up = imp.filter((s) => s.tone > 0).length, dn = imp.filter((s) => s.tone < 0).length, n = imp.length || 1;
  const lastH = day.filter((s) => s.lvl > 0 && Date.now() - s.t < 36e5).length;
  const byT = NTOP.map(([k, l]) => [l, imp.filter((s) => s.topics.some((x) => x.k === k)).length]).filter((x) => x[1]).sort((a, b) => b[1] - a[1]);
  const lean = up > dn * 1.5 && up >= 2 ? `<b class="up">Leaning positive</b>` : dn > up * 1.5 && dn >= 2 ? `<b class="dn">Leaning negative</b>` : `<b>Mixed</b>`;
  return `<div class="npulse"><div><i>Important, 24h</i><b>${imp.length}</b><i>${lastH} in the last hour</i></div>
    <div><i>Headline tone</i>${lean}<span class="ntone"><span class="up" style="width:${(up / n) * 100}%"></span><span class="mid" style="width:${((n - up - dn) / n) * 100}%"></span><span class="dn" style="width:${(dn / n) * 100}%"></span></span><i>${up} positive · ${dn} negative</i></div>
    <div><i>Main themes</i><b style="font-size:13.5px">${byT.slice(0, 3).map((x) => `${x[0]} <span class="mut">${x[1]}</span>`).join("<br>") || "–"}</b></div></div>`;
}
function drawNewsOverview() {
  const el = $("#ovNews"); if (!el) return;
  const nLive = NEWS_FEEDS.filter((f) => live(f.id)).length;
  if (!nLive) { el.innerHTML = `<div class="unavail">${NEWS_FEEDS.some((f) => status(f.id) === "wait") ? "Loading headlines…" : "News feeds unreachable right now."}</div>`; return; }
  const day = newsAll().filter((s) => Date.now() - s.t < 24 * 36e5), top = day.filter((s) => s.lvl > 0).sort((a, b) => b.rank - a.rank).slice(0, 3);
  el.innerHTML = (top.length ? top.map((s) => newsCard(s, false)).join("") : `<div class="unavail">No major crypto stories in the last 24 hours.</div>`) + `<button class="btn" data-gonews style="margin-top:8px">All news →</button>`;
}
function newsBadge() {
  const b = document.querySelector('.tab[data-tab="news"]'); if (!b) return;
  const n = ST.tab === "news" ? 0 : newsAll().filter((s) => s.lvl > 0 && s.t > ST.newsSeen && Date.now() - s.t < 24 * 36e5).length;
  const want = n ? `News <span class="nbadge">${n > 9 ? "9+" : n}</span>` : "News"; if (b.innerHTML !== want) b.innerHTML = want;
}
document.addEventListener("click", (e) => {
  const s = e.target.closest("[data-nscope]"); if (s) { ST.newsScope = s.dataset.nscope; LS.set("newsScope", ST.newsScope); drawNews(); return; }
  const t = e.target.closest("[data-ntopic]"); if (t) { ST.newsTopic = ST.newsTopic === t.dataset.ntopic ? "" : t.dataset.ntopic; LS.set("newsTopic", ST.newsTopic); drawNews(); return; }
  if (e.target.closest("[data-gonews]")) { setTab("news"); window.scrollTo({ top: 0 }); }
});
// "New" marks: stories newer than your previous visit to the News tab.
let newsWasOpen = false;
const _d4 = drawStage2;
drawStage2 = function (tab) {
  _d4(tab);
  try {
    if (tab === "news") { if (!newsWasOpen) { NEWS_PREV_SEEN = ST.newsSeen; newsWasOpen = true; } ST.newsSeen = Date.now(); LS.set("newsSeen", ST.newsSeen); drawNews(); }
    else newsWasOpen = false;
    if (tab === "overview") drawNewsOverview();
    newsBadge();
  } catch (e) { console.error(e); }
};
render(); NEWS_FEEDS.forEach((f) => tick(f.id));
