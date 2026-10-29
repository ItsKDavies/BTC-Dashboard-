// Cloudflare Pages Function: same-origin pass-through for exchanges that block direct browser requests (CORS).
// Mirrors site/_redirects (used on Netlify). Only the hosts below are reachable, so this can't be used as an open proxy.
const UP = {
  okx: "https://www.okx.com",
  kraken: "https://futures.kraken.com",
  mexc: "https://contract.mexc.com",
  bingx: "https://open-api.bingx.com",
  bybit: "https://api.bybit.com",
  bnf: "https://fapi.binance.com",
  krakens: "https://api.kraken.com",
  bitstamp: "https://www.bitstamp.net",
  gemini: "https://api.gemini.com",
  mexcs: "https://api.mexc.com",
  fng: "https://api.alternative.me",
  ff: "https://nfs.faireconomy.media",
};
// Seconds Cloudflare's edge may reuse a successful response (cuts repeat calls to the exchanges).
const TTL = { fng: 3600, ff: 1800 };
const DEFAULT_TTL = 15;

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const m = /^\/px\/([a-z]+)(\/.*)?$/.exec(url.pathname);
  const base = m && UP[m[1]];
  if (!base) return new Response("Unknown route", { status: 404 });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST, OPTIONS" } });
  if (request.method !== "GET" && request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const target = base + (m[2] || "/") + url.search, ttl = TTL[m[1]] ?? DEFAULT_TTL;
  const init = { method: request.method, headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; BTC-Dashboard)" } };
  if (request.method === "POST") { init.body = await request.text(); init.headers["content-type"] = request.headers.get("content-type") || "application/json"; }
  else init.cf = { cacheEverything: true, cacheTtlByStatus: { "200-299": ttl, "300-599": 0 } }; // never cache errors such as 429
  let r;
  try { r = await fetch(target, init); } catch (e) { return new Response(JSON.stringify({ error: "upstream unreachable" }), { status: 502, headers: { "content-type": "application/json" } }); }
  const h = new Headers(r.headers);
  h.set("access-control-allow-origin", "*"); h.set("cache-control", `public, max-age=${Math.min(ttl, DEFAULT_TTL)}`); h.delete("set-cookie");
  return new Response(r.body, { status: r.status, headers: h });
}
