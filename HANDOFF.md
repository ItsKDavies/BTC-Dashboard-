# BTC Market Dashboard v2: technical handoff

Snapshot: stage 4 build, Oct 27 2026. Live site: `https://tangerine-choux-da087a.netlify.app/` (Netlify, manual uploads; the live site may be on an older stage than this export, see §8).

This document describes the project exactly as it exists. Nothing was rebuilt or redesigned to write it.

**Short version.** The dashboard is a static, client-only web app (plain HTML/CSS/JavaScript, no framework, no build step). Every number is fetched by the visitor's browser from free public exchange APIs, then calculated locally in JavaScript. **It makes zero AI/LLM calls at runtime and uses no API keys.** The only server-side piece is a set of Netlify `_redirects` proxy rules that pass a few exchange requests through the site's own domain, because those exchanges block direct browser requests (CORS). AI was used only to write the code.

---

## Contents

1. [Source code and project structure](#1-source-code-and-project-structure)
2. [Current features](#2-current-features)
3. [Data sources](#3-data-sources)
4. [Update frequency and duplication](#4-update-frequency-and-duplication)
5. [AI consumption](#5-ai-consumption)
6. [Optimization opportunities](#6-optimization-opportunities)
7. [Calculations (all local, no AI)](#7-calculations-all-local-no-ai)
8. [Known issues](#8-known-issues)
9. [Deployment](#9-deployment)
10. [Migration plan](#10-migration-plan)

Appendix: [docs/sources.csv](docs/sources.csv) (every data source, machine-readable) and [docs/functions.md](docs/functions.md) (every top-level function with file:line).

---

## 1. Source code and project structure

### 1.1 Export layout

```
btc-dashboard-handoff/
├── HANDOFF.md                     ← this document
├── README.md                      ← quick start
├── site/                          ← THE DEPLOYABLE APP (upload this folder as-is)
│   ├── index.html                 markup, all CSS, theme tokens, tab sections (345 lines, 27 KB)
│   ├── ta.js                      pure analysis engine: indicators, patterns, setups, liquidation models (394 lines, 30 KB)
│   ├── app.js                     stage 1 core: helpers, fetch/proxy layer, scheduler, perp venues, header, Overview, Derivatives, Sources (489 lines, 42 KB)
│   ├── app2.js                    stage 2: more sources, liquidations, sockets, Markets, TA/Setups/CVD/Liquidations tabs (595 lines, 63 KB)
│   ├── chart2.js                  stage 3: canvas chart engine (replaces the old chart library), layers, big trades, sessions, My levels, Fear & Greed (381 lines, 37 KB)
│   ├── stage4.js                  stage 4: pattern cards, mood bars, OI/longs/shorts stack, economic calendar (179 lines, 20 KB)
│   ├── news.js                    News tab: RSS feeds via /px, story merging, rule-based importance and tone (Oct 30)
│   ├── gex.js                     GEX tab: Black-Scholes gamma exposure from Deribit OI + mark IV, flip/walls/magnets, chart layer (Oct 30)
│   └── _redirects                 Netlify proxy rules (the only "backend")
├── preview/
│   ├── shim.js                    demo mode: fakes fetch() and WebSocket with generated sample data
│   ├── build.py                   inlines site/ + shim into one HTML file for a no-network preview
│   └── btc-dashboard-v2-preview.html   last built preview (also hosted as a claude.ai artifact)
├── tests/                         Playwright + Node harness (mocked exchanges; no network needed)
│   ├── mock.js                    mock responses for every REST endpoint
│   ├── run2.js                    loads site/ with mocks, walks every tab, screenshots, reports errors
│   ├── chart3.js                  chart gesture tests: drag, pinch (CDP multi-touch), wheel, axis drag, tap
│   ├── liqt.js                    liquidation map tap/hover test
│   ├── tatest.js, geotest.js      unit checks for ta.js (synthetic candles and shapes)
│   └── preview-smoke.js           smoke test of the built preview page
├── docs/
│   ├── sources.csv                every source: id, refresh, requests/min, proxy, endpoints, file:line
│   └── functions.md               function index + list of names that are overridden by later files
└── legacy/grok-v1.5.2-port/       the earlier Grok-built dashboard and the shim used to run it on claude.ai
```

### 1.2 Runtime architecture

```
Browser (phone/desktop)
 ├─ index.html (UI shell, CSS)
 ├─ ta.js      → window.TA (pure functions)
 ├─ app.js     → helpers, getJSON/getJSONp, def() source registry, scheduler, render()
 ├─ app2.js    → more def()/wsDef() sources, analysis() memo, tab renderers
 ├─ chart2.js  → CChart canvas engine + layer builder (overrides app.js chart functions)
 └─ stage4.js  → overrides drawPatterns/drawMood, adds pos + cal sources
       │
       ├─ direct HTTPS to exchanges that allow CORS (Binance spot data, OKX market/public, Coinbase, Bitget, Deribit, Hyperliquid)
       ├─ /px/<name>/… → Netlify edge proxy (_redirects) → exchanges that block CORS (OKX rubik stats, Kraken, MEXC, BingX, Bitstamp, Gemini, alternative.me, ForexFactory, Bybit, Binance futures)
       └─ WebSockets direct (OKX, Coinbase, Binance spot stream; Binance futures + Bybit optional/likely blocked in US)
```

There is no server application, database, queue, cron job or API key. All state is in memory, plus a few items in the visitor's `localStorage` (§1.6).

### 1.3 Load order and the override pattern (important)

Scripts load in this order at the end of `index.html`: `ta.js → app.js → app2.js → chart2.js → stage4.js → news.js → gex.js`. They are classic scripts (not ES modules) sharing one global scope. Later stages **replace** earlier functions by declaring functions with the same name, and wrap `drawStage2` to add behavior:

| Name | First defined | Replaced by | Effect |
|---|---|---|---|
| `initChart`, `updateChart`, `resetView`, `zoom`, `recolorCharts` | app.js (Lightweight Charts version) | chart2.js | Canvas engine is used; app.js versions are dead code |
| `chartExtras`, `initExtras`, `drawOverlay` | app2.js (overlay on old library) | chart2.js | Same; `drawOverlay` is now a no-op |
| `drawPatterns` | app2.js | stage4.js | New card layout and chart patterns |
| `drawMood` | chart2.js (gauge dials) | stage4.js | Color bars |
| `drawStage2` | app2.js | wrapped in chart2.js and again in stage4.js | Adds mood, positioning, calendar, patterns |

`app.js` still calls its own `initChart()` at load (the old chart library isn't loaded any more, so it writes a short message into `#cMain`); `chart2.js` then builds the canvas chart over it. This works but is fragile. See §10 for the cleanup order.

### 1.4 Key modules and functions

A full index with line numbers is in `docs/functions.md`. The essentials:

**app.js (core)**
- `getJSON(url, opt)`: fetch with a 9 s timeout and `cache: "no-store"`; throws `HttpErr(status)`.
- `getJSONp(url, opt)`: if the host is in `PROXY`, tries `/px/<name>/path?query` on the same site first; falls back to direct on 404 (no proxy present, e.g. local file).
- `okx(path)` direct, `okxR(path)` through proxy; both check `code === "0"`.
- `def(id, name, feeds, ms, run, optional)`: registers a data source. `run(prev)` returns the new data object stored in `D[id]`.
- `tick(id)`: runs one source, records status (`ok/stale/down/blocked/wait/off`), latency and error, and schedules the next run. Backoff: on failure `ms × 2^fails` up to 5 min; "blocked" (HTTP 403/451 or optional+CORS) retries every 30 min.
- Scheduler: `setInterval(1 s)` runs any source whose `next ≤ now`, **only while Auto-refresh is on and the tab is visible**. `visibilitychange` re-ticks stale sources when you return.
- `render()` (rAF-debounced) → `draw()`: header, then only the active tab's renderer.
- `aggr()` (aggregate OI and OI-weighted funding across venues), `levels()` (PDH/PDL, day/week/month open), `win()`, `seriesChg()`, `takerImb()`.
- Derivatives tab (`drawDerivs`), Sources tab (`drawSources`, `report()` for "Copy status report").

**app2.js (stage 2)**
- More sources: multi-TF candles, OKX liquidations/stats, Coinbase trades, spot venues, Deribit futures/options.
- `wsDef(id, …)`: wraps a WebSocket as a source so it shows in Sources and reconnects with backoff.
- Liquidation store `LIQ` (Map, last 24 h, persisted to localStorage every 30 s), `okxLiqRows()` parser.
- `analysis()`: memoised (key = taK/kd/okxOI1h/okx timestamps + 20 s bucket). It builds the per-TF TA, multi-TF score, liquidation map, zones, flow score, bias, setups, candle patterns, divergences and reasons.
- Renderers: `assessHTML`, `drawTA`, `drawSetups` (+ `setupCard`, `ladder`), `drawFlowTab` (CVD), `drawLiq` (+ interactive map `liqTip`), `drawMarkets`.
- SVG helpers sized to real pixels: `candleSVG`, `panes`, `updown`, `scoreBar`.

**chart2.js (stage 3)**
- `class CChart`: canvas price chart. Pointer events (drag, inertia, pinch, wheel, price-axis drag, tap crosshair, double-tap reset). One optional lower pane. Axis label de-cluttering by priority. Layers: sessions, liquidation heatmap, zone boxes, value-area shading, volume, candles (mono or colored), indicator lines, horizontal levels, big-trade bubbles, volume profile histogram, last-price line, crosshair.
- `chartExtras(fromView)`: builds layer data from settings (memo key), including fib on the visible range, VP/TPO on the visible range, sessions and session highs/lows, and My levels.
- Big-trade buckets (`bigAdd`, per venue/side/second, thresholds $250K Binance / $400K OKX perp / $150K Coinbase).
- `sessions()`, timezone-aware via `Intl`; `parseLevels()` (CoinWise paste); `heatData()` (memoised `TA.liqHeat`).

**stage4.js**
- `drawPatterns`: summary strip, chart-pattern cards (`TA.geoPatterns`), candle-pattern cards, divergence table; `miniChart()` SVG.
- `drawMood` + `moodRow`: red/yellow/green bars.
- `pos` source + `drawPos`: stacked Price / OI / Longs / Shorts with shared crosshair.
- `cal` source + `drawCal` + `nextEventLine`: ForexFactory weekly calendar.

**ta.js (pure, testable in Node)**
`ema, sma, rsi, macd, stochRsi, atr, bb, vwapDaily, cvd, pivots, structure, analyze, multiTF, candlePatterns, chartPatterns, geoPatterns, fitLine, zones, swingLevels, setups, risk, liqMap, liqHeat, maxPain`.

### 1.5 Dependencies and configuration

- **Runtime dependencies:** none bundled. Google Fonts (IBM Plex Sans/Mono) loaded from fonts.googleapis.com; the page works with system fonts if blocked. The old Lightweight Charts CDN dependency was **removed in stage 3**.
- **Configuration:** hard-coded constants at the top of each file (symbols `BTCUSDT`/`BTC-USDT-SWAP`, intervals in each `def()`, thresholds in `BIG_MIN`, `LEVS` leverage mix, `TF_W` timeframe weights, `SESS` session hours, `FIBS` ratios). No environment variables.
- **Dev/test tooling (not deployed):** Node 18+ and `playwright` for `tests/`; Python 3 for `preview/build.py`. The legacy port additionally used `esbuild`.

### 1.6 Browser storage (per device, `localStorage`, all keys prefixed `v2.`)

UI settings: `tab, tf, auto, ema, sma, vwap, avwap, lv, fib, fibOff, prof, tpo, zones, liq, mono, heat, bub, sess, my, lower, clean, cvd, oi, cvdOff, lev, margin, liqRange, liqSide, posTf, off` (disabled sources).
Data: `liqEvents` (≤1,500 liquidation events, 24 h), `bigTrades` (≤1,500), `myLevels` (pasted CoinWise levels).
Every read and write is wrapped in try/catch; the app works if storage is blocked.

---

## 2. Current features

Status legend: **Verified** = seen working against live exchange data on the user's phone; **Mock-tested** = built and tested against mocked data and synthetic gestures only (see §8.1).

| Area | Feature | Status |
|---|---|---|
| Header | Live BTC price (Binance spot, fallback OKX perp), 24 h change/range/volume, "X of Y sources live", time since update, Auto-refresh toggle, Refresh, overall Lean pill | Price/header verified (stage 1); lean mock-tested |
| Overview | Market mood bars (overall lean, Fear & Greed, funding, long/short accounts, Coinbase premium, options put/call) + next high-impact US event | Mock-tested |
| | KPI tiles: aggregate OI, OI-weighted funding + APR + range, spot CVD 1 h/4 h/24 h, perp taker imbalance, Coinbase premium, OKX long/short ratio | Mostly verified (stage 1) |
| | Assessment: bias −100…+100 (70% multi-TF technicals, 30% flow), reasons, best long/short | Mock-tested |
| | Flow read 1 h/4 h: longs/shorts opening/closing from price vs OI, spot CVD divergence, perp taker lean | Verified in part (OI history was CORS-blocked at stage 1) |
| Main chart | Own canvas engine: drag + inertia, pinch, wheel, axis stretch, tap crosshair + OHLC readout, double-tap reset, Expand (full screen), +/−/Reset | Mock-tested (synthetic touch in Chromium; not yet on a real iPhone) |
| | Timeframes 5m/15m/30m/1h/4h/1d; lower pane CVD / Delta / OI / Off | Mock-tested |
| | Layers menu: Mono candles, Sessions (Asia/London/NY shading + session H/L), EMA 21/50/200, SMA 50/200, daily VWAP, weekly AVWAP ±1σ/±2σ, My levels, Opens + PDH/PDL, Fib (24 ratios, per-ratio toggles, visible range), Zones, Volume profile (POC/VAH/VAL + histogram + value area), TPO POC/VAH/VAL, Liquidation heatmap, Liquidation clusters, Big-trade bubbles, Clean mode | Mock-tested |
| | My levels (CoinWise paste box → parsed prices drawn as labeled lines) | Mock-tested |
| TA tab | Technicals table by timeframe (15m–1D), moving-average table (EMA 9–200, SMA 20–200), key zones | Mock-tested |
| Patterns | Summary strip; chart patterns (ascending/descending/symmetrical triangle, rising/falling wedge, rising/falling channel, range, broadening, bull/bear flag/pennant, head and shoulders, inverse) with drawn lines, status, breakout/target plan; candle patterns (doji, hammer, hanging man, shooting star, inverted hammer, engulfing, piercing, dark cloud, harami, morning/evening star, three soldiers/crows, tweezers, marubozu, inside bar) with confirm/invalid lines; double tops/bottoms; RSI/CVD divergences | Mock-tested |
| Setups | Up to 3 longs + 3 shorts from support/resistance zones: entry, SL, TP1/TP2, R:R, score/confidence, leverage selector (5–100×), margin input, notional/qty, estimated liquidation price, P&L and ROE at SL/TP1/TP2, max safe leverage, "liquidates before stop" warning, price ladder graphic, chart with levels | Mock-tested |
| CVD tab | Price vs spot (Binance) and perp (OKX) CVD; CVD by exchange (Binance spot, Coinbase spot, OKX spot, OKX perp, each toggleable, with EMA); hourly buys vs sells; divergence check table | Mock-tested |
| Liquidations | Links to Coinglass/CoinAnk/CoinMarketCap heatmaps; 1 h/4 h/24 h long vs short totals; 15-min bars; interactive estimated liquidation map (tap for size and cumulative liquidity, ±3/6/10%, Both/Shorts/Longs); biggest liquidations list | Mock-tested |
| Markets | Spot BTC on 8 exchanges with spread vs Binance and volume share; Deribit futures basis (annualized); options put/call, max pain (next and biggest expiry), OI by strike; US economic calendar (high/medium impact, countdowns) | Mock-tested |
| Derivatives | OI · longs vs shorts stack (Price, OI, Longs, Shorts; 5m/1h/1d; tap for values); perp venues table (price, funding/8h, APR, OI BTC/$, share, status); funding and OI-share bars; OKX OI, long/short and taker charts | Venues table verified (stage 1); stack mock-tested |
| Sources | Per-source status, last OK, latency, error detail, turn on/off, Copy status report | Verified |
| News | Top stories, news pulse (count, headline tone, themes), 48 h headline list with Important/Bitcoin/All and topic filters, "New" marks since last visit, tab badge, top 3 on Overview. Six RSS feeds (CoinDesk, Cointelegraph, The Block, Decrypt, Bitcoin Magazine, Google News search) through `/px`; same story from several outlets merged; importance = topic keywords + outlet count + BTC relevance − low-value patterns | Mock-tested |
| GEX | Gamma exposure from Deribit options (Black-Scholes gamma × OI × S² × 1%, dealers long calls / short puts): regime, GEX flip (zero crossing of the ±20% profile), call walls, put walls, magnets, max pain, 1-day/1-week expected move from ATM IV, per-expiry selector, strike bars (net or calls vs puts), plain-language read, Overview summary, chart layer "GEX levels" | Mock-tested |
| Trading signals | Bias score, flow read, setups, pattern bias, divergences. Display only; no orders are placed | Mock-tested |
| Alerts | **None** (not built; offered, not selected) | — |

---

## 3. Data sources

All sources are **free public endpoints with no API key**. No paid service is integrated. Full table with file:line and request math: `docs/sources.csv`.

| ID | Provider | What it feeds | Refresh | Req/min | Transport | Free | Notes |
|---|---|---|---|---|---|---|---|
| `spot` | Binance | Header price, 24h stats<br>`https://data-api.binance.vision/api/v3/ticker/24hr?symbol=BTCUSDT` | 5 s | 12.0 | Direct HTTPS | Yes |  |
| `kl` | Binance | Main chart, CVD pane<br>`https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval={tf}&limit=1000/3` | 5 s | 12.0 | Direct HTTPS | Yes |  |
| `k5` | Binance | Flow read, CVD KPIs<br>`https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=288` | 30 s | 2.0 | Direct HTTPS | Yes |  |
| `kd` | Binance | Levels (PDH/PDL, opens)<br>`https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=40` | 300 s | 0.2 | Direct HTTPS | Yes |  |
| `cb` | Coinbase | Coinbase premium<br>`https://api.exchange.coinbase.com/products/BTC-USD/ticker` | 10 s | 6.0 | Direct HTTPS | Yes |  |
| `okx` | OKX | Venue: price, funding, OI<br>`https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT-SWAP`<br>`https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP`<br>`https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=BTC-USDT-SWAP` | 30 s | 6.0 | Direct HTTPS | Yes |  |
| `okxOI` | OKX | OI pane, OI change<br>`https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-volume?ccy=BTC&period=5m` | 60 s | 1.0 | Netlify proxy | Yes |  |
| `okxTk` | OKX | Perp taker flow<br>`https://www.okx.com/api/v5/rubik/stat/taker-volume?ccy=BTC&instType=CONTRACTS&period=5m` | 60 s | 1.0 | Netlify proxy | Yes |  |
| `okxLS` | OKX | Long/short accounts<br>`https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=BTC&period=5m` | 60 s | 1.0 | Netlify proxy | Yes |  |
| `hl` | Hyperliquid | Venue: price, funding, OI<br>`https://api.hyperliquid.xyz/info` | 30 s | 2.0 | Direct HTTPS | Yes |  |
| `bitget` | Bitget | Venue: price, funding, OI<br>`https://api.bitget.com/api/v2/mix/market/ticker?symbol=BTCUSDT&productType=usdt-futures` | 30 s | 2.0 | Direct HTTPS | Yes |  |
| `deribit` | Deribit | Venue: price, funding, OI<br>`https://www.deribit.com/api/v2/public/ticker?instrument_name=BTC-PERPETUAL` | 30 s | 2.0 | Direct HTTPS | Yes |  |
| `kraken` | Kraken Futures | Venue: price, funding, OI<br>`https://futures.kraken.com/derivatives/api/v3/tickers/PF_XBTUSD` | 30 s | 2.0 | Netlify proxy | Yes |  |
| `mexc` | MEXC | Venue: price, funding, OI<br>`https://contract.mexc.com/api/v1/contract/ticker?symbol=BTC_USDT` | 60 s | 1.0 | Netlify proxy | Yes |  |
| `bingx` | BingX | Venue: price, funding<br>`https://open-api.bingx.com/openApi/swap/v2/quote/premiumIndex?symbol=BTC-USDT` | 60 s | 1.0 | Netlify proxy | Yes |  |
| `bybit` | Bybit | Venue: price, funding, OI<br>`https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT` | 30 s | 2.0 | Netlify proxy | Yes | optional, likely blocked in US |
| `bnf` | Binance futures | Venue: price, funding, OI<br>`https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT`<br>`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT` | 30 s | 4.0 | Netlify proxy | Yes | optional, likely blocked in US |
| `taK` | Binance | TA, patterns, setups, liquidation model<br>`https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval={tf}&limit={n}` | 60 s | 5.0 | Direct HTTPS | Yes |  |
| `okxOI1h` | OKX | Liquidation map model<br>`https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-volume?ccy=BTC&period=1H` | 300 s | 0.2 | Netlify proxy | Yes |  |
| `okxSpTk` | OKX | CVD by exchange<br>`https://www.okx.com/api/v5/rubik/stat/taker-volume?ccy=BTC&instType=SPOT&period=5m` | 60 s | 1.0 | Netlify proxy | Yes |  |
| `okxLiq` | OKX | Liquidations feed (recent history)<br>`https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&instFamily=BTC-USDT/BTC-USD&state=filled&limit=100` | 60 s | 2.0 | Netlify proxy | Yes |  |
| `wsOkxLiq` | OKX | Liquidations feed (live)<br>`wss://ws.okx.com:8443/ws/v5/public` | live | — | WebSocket | Yes |  |
| `wsBnLiq` | Binance futures | Liquidations feed (live)<br>`wss://fstream.binance.com/ws/btcusdt@forceOrder` | live | — | WebSocket | Yes | optional, likely blocked in US |
| `wsByLiq` | Bybit | Liquidations feed (live)<br>`wss://stream.bybit.com/v5/public/linear` | live | — | WebSocket | Yes | optional, likely blocked in US |
| `cbTr` | Coinbase | CVD by exchange (Coinbase)<br>`https://api.exchange.coinbase.com/products/BTC-USD/trades?limit=1000` | 60 s | 1.0 | Direct HTTPS | Yes |  |
| `wsCb` | Coinbase | CVD by exchange (Coinbase, live)<br>`wss://ws-feed.exchange.coinbase.com` | live | — | WebSocket | Yes |  |
| `cbS` | Coinbase | Markets: spot price, 24h<br>`https://api.exchange.coinbase.com/products/BTC-USD/stats` | 30 s | 2.0 | Direct HTTPS | Yes |  |
| `krS` | Kraken | Markets: spot price, 24h<br>`https://api.kraken.com/0/public/Ticker?pair=XBTUSD` | 30 s | 2.0 | Netlify proxy | Yes |  |
| `bsS` | Bitstamp | Markets: spot price, 24h<br>`https://www.bitstamp.net/api/v2/ticker/btcusd/` | 30 s | 2.0 | Netlify proxy | Yes |  |
| `okS` | OKX | Markets: spot price, 24h<br>`https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT` | 30 s | 2.0 | Direct HTTPS | Yes |  |
| `bgS` | Bitget | Markets: spot price, 24h<br>`https://api.bitget.com/api/v2/spot/market/tickers?symbol=BTCUSDT` | 30 s | 2.0 | Direct HTTPS | Yes |  |
| `gmS` | Gemini | Markets: spot price, 24h<br>`https://api.gemini.com/v1/pubticker/btcusd` | 30 s | 2.0 | Netlify proxy | Yes |  |
| `mxS` | MEXC | Markets: spot price, 24h<br>`https://api.mexc.com/api/v3/ticker/24hr?symbol=BTCUSDT` | 30 s | 2.0 | Netlify proxy | Yes |  |
| `dbFut` | Deribit | Basis term structure<br>`https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=future` | 60 s | 1.0 | Direct HTTPS | Yes |  |
| `dbOpt` | Deribit | Put/call, max pain, OI by strike<br>`https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option` | 300 s | 0.2 | Direct HTTPS | Yes |  |
| `wsBnT` | Binance | Big-trade bubbles<br>`wss://data-stream.binance.vision/ws/btcusdt@aggTrade` | live | — | WebSocket | Yes |  |
| `wsOkT` | OKX | Big-trade bubbles<br>`wss://ws.okx.com:8443/ws/v5/public` | live | — | WebSocket | Yes |  |
| `fng` | alternative.me | Mood gauges<br>`https://api.alternative.me/fng/?limit=30` | 600 s | 0.1 | Netlify proxy | Yes |  |
| `pos` | OKX | Positioning charts<br>`https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=BTC&period={5m/1H/1D}`<br>`https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-volume?ccy=BTC&period={5m/1H/1D}` | 60 s | 2.0 | Netlify proxy | Yes |  |
| `nwCd` `nwCt` `nwTb` `nwDc` `nwBm` `nwGn` | CoinDesk, Cointelegraph, The Block, Decrypt, Bitcoin Magazine, Google News | News tab, Overview headlines (RSS) | 300 s each | 1.2 total | Cloudflare/Netlify proxy | Yes | optional; edge-cached 5 min |
| `cal` | ForexFactory | US events this week<br>`https://nfs.faireconomy.media/ff_calendar_thisweek.json` | 1800 s | 0.03 | Netlify proxy | Yes |  |

"Netlify proxy" = requested as `/px/<name>/…` on the site and passed through by `_redirects` (counts toward Netlify credits). `getJSONp` tries the proxy first and falls back to direct.

**Paid / not integrated:** Coinglass API (paid plans, from about $29/mo), CoinAnk OpenAPI (membership or pay-per-call), CoinWise (member login; handled by manual paste). The Liquidations tab only links out to their web pages.

**Region notes (user is in the US):** Binance futures (`fapi.binance.com`, `fstream.binance.com`) and Bybit refuse US connections (HTTP 451/403, or connection refused). They are marked optional, shown as "blocked", and retried every 30 min. Binance *spot* data is fetched from `data-api.binance.vision` / `data-stream.binance.vision`, which serve market data publicly.

---

## 4. Update frequency and duplication

### 4.1 How updates are triggered

- **Polling scheduler** (`app.js`): a 1 s loop starts any source that is due. Each source has its own interval (table above). Polling pauses when Auto-refresh is off or the browser tab is hidden. A failed source backs off; a blocked one waits 30 min.
- **WebSockets:** 6 sockets (OKX ×2, Coinbase, Binance spot aggTrade, plus 2 optional futures sockets). They push continuously while connected. The scheduler checks each socket every 5 s and reconnects when closed. Sockets are **not** paused when the tab is hidden.
- **Rendering:** every successful source run calls `render()` (rAF-debounced), plus a 5 s timer for "ago" labels. Only the active tab is redrawn. Heavy analysis is memoised (`analysis()` ≈ every 20 s or when its inputs change; heatmap only when OI/candles change; geo patterns only when `taK` changes). The canvas chart redraws only on data/view changes.
- **Other timers:** big-trade bucket flush (1 s), liquidation and big-trade persistence (30 s), an obsolete 700 ms overlay timer in app2.js (now a no-op).

### 4.2 Request volume (from the code, page open and visible)

- **≈ 78 REST requests per minute** (≈ 4,700/hour) across all sources, excluding the two US-blocked sources.
- **≈ 20 per minute (≈ 1,220/hour) go through the Netlify proxy.** On Netlify's credit plan, requests and bandwidth through the site cost credits (2 credits per 10,000 requests; 20 credits per GB). Estimate: if the dashboard is open 8 h/day, proxy traffic alone could use roughly 50–100 of the free 300 monthly credits. Each production upload costs another 15. This is an estimate from response sizes, not a measurement.
- **Download volume (rough estimate, ~60–70 MB/hour):** the largest contributors are trade WebSockets (Binance aggTrade ~10 MB/h, OKX trades ~7 MB/h, Coinbase matches ~5 MB/h), Coinbase `trades?limit=1000` every minute (~7 MB/h), `taK` five-timeframe candles every minute (~13 MB/h), Binance 5m candles every 30 s (~5 MB/h), OKX stats (~5 MB/h) and Deribit options (~3.4 MB/h).

### 4.3 Duplicated or wasteful requests

| Duplicate | Why it's wasteful | Fix |
|---|---|---|
| `spot` (ticker every 5 s) **and** `kl` (candles every 5 s) | Last price is already the last candle's close | One Binance WebSocket (kline + miniTicker) |
| `kl` (current TF, full 1,000-bar reload every 5 min) **and** `taK` (15m/30m/1h/4h/1d every 60 s) **and** `k5` (5m every 30 s) **and** `kd` (1d every 5 min) | Same BTCUSDT candles fetched by four sources. `kd` duplicates `taK["1d"]`; `kl` duplicates `taK` whenever the chart TF is 15m/30m/1h/4h/1d | Fetch history once, keep one candle store, update the last bar of each TF from a 1m/5m stream, aggregate higher TFs locally |
| `taK` re-downloads 1,450 bars every minute | Only the last 1–2 bars of each TF change | Incremental `startTime=` fetches or stream updates |
| `okxOI` (5m) / `okxOI1h` (1H) / `pos` (5m/1H/1D OI) | Same OKX OI history endpoint, overlapping periods | One positioning store per period, shared by OI pane, flow read, liquidation model and positioning chart |
| `okxLS` (5m) and `pos` (long/short ratio) | Same endpoint | Same store |
| OKX rubik stats polled every 60 s | Data only changes every 5 min (period=5m) or 1 h; ~80% of polls return identical data | Align polls to period boundaries + ~15 s |
| `cb` (ticker 10 s) + `cbS` (stats 30 s) + `cbTr` (1,000 trades every 60 s) + `wsCb` (live matches) | Four Coinbase feeds; the trades REST call repeats data the socket already has | Coinbase WS `ticker` + `matches`; REST trades only as a gap-fill on (re)connect |
| `okx` (perp ticker/funding/OI REST) + `wsOkT` (perp trades WS) + `wsOkxLiq` (liquidations WS) + `okxLiq` (liquidations REST every 60 s) | Two separate OKX sockets plus REST duplicates | One OKX socket subscribed to `tickers`, `funding-rate`, `open-interest`, `trades`, `liquidation-orders`; REST only for history/backfill |
| `deribit` (perp ticker) + `dbFut` (all futures incl. PERPETUAL) | Overlap | Read perp from `dbFut` |
| `dbOpt` (~300 KB every 5 min) | Options OI changes slowly | Every 15–30 min |
| `fng` every 10 min | Index updates daily | Every 1–6 h |

---

## 5. AI consumption

### 5.1 Runtime: none

| Question | Answer |
|---|---|
| Where do LLM calls occur at runtime? | **Nowhere.** No file contains a call to any AI API. (A search of `site/` for AI endpoints finds none. The only mention of Claude is the Sources tab's "paste it to Claude" hint for the status report.) |
| Which models? | None at runtime. |
| Tokens per request / frequency | 0 / never. Every indicator, signal, pattern and text explanation is computed by local JavaScript rules (§7). |
| API keys | None. |

### 5.2 Where AI usage *did* happen (development only)

- **Grok version (v1.0–v1.5.2, legacy):** data refresh ran through Grok. A Python generator (`build_dashboard.py`, not in this export; Grok never shared it) fetched data and regenerated the whole 1.7 MB `.tsx` file inside a Grok chat. The dashboard's "↻ Refresh" button only copied the word "refresh" for the user to paste back to Grok. Every refresh was a full AI turn, which is why that approach hit usage caps. v2 removed this completely.
- **This build (Claude):** AI was used only to write and test code. Usage per change was driven by conversation length, screenshots (image tokens) and re-sending context. One mid-size update was observed by the user at about 6% of their Claude usage. Exact token counts aren't available from inside the session.

### 5.3 How to keep AI usage near zero from here

- Never route data refresh through an AI. The app already refreshes itself.
- Use AI only for code changes, and give it narrow context: this document, `docs/functions.md`, and the one file or function to change. Ask for a diff, not a whole file.
- Test with the mock harness and preview (no network, no AI) before asking an AI to look at screenshots.
- Batch changes and upload once (Netlify charges per upload).
- If a future "AI commentary" feature is wanted, generate it on demand only (a button), with a small model, from a compact JSON summary (bias, levels, setups), so a few hundred tokens per call instead of raw market data.

---

## 6. Optimization opportunities

Ordered by impact per effort. None of these is implemented yet.

1. **One candle store fed by WebSockets** (biggest win). Load history once over REST (1,000 × 1m or 5m bars plus 1h/4h/1d history), cache it in IndexedDB for a warm start, then keep it current from `wss://data-stream.binance.vision/stream?streams=btcusdt@kline_1m/btcusdt@miniTicker`. Build 5m/15m/30m/1h/4h from 1m locally. Replaces `spot`, `kl`, `k5`, `kd` and most of `taK` (≈ 33 of 78 req/min and ~20 MB/h). On reconnect, gap-fill with `klines?startTime=<last>`.
2. **One OKX socket** (`wss://ws.okx.com:8443/ws/v5/public`) with `tickers`, `funding-rate`, `open-interest`, `mark-price`, `trades` and `liquidation-orders`. Remove the second OKX socket and the `okx`, `okS` and `okxLiq` polling.
3. **Coinbase socket only** (`ticker` + `matches`). Drop `cb`, the 1,000-trade REST poll (keep it as a one-time backfill), and most `cbS` polling.
4. **Shared positioning store** for OKX OI and long/short history by period (5m/1H/1D), polled once per period boundary. Removes `okxOI`/`okxOI1h`/`okxLS`/`pos` overlap and cuts proxied traffic ~70%.
5. **Interval tuning:** Deribit options 15–30 min, Fear & Greed 1–6 h, calendar 1 h, spot venues 60 s, perp venue funding/OI 60 s.
6. **Move the CORS proxy off Netlify** to a Cloudflare Worker (free tier, 100,000 requests/day), with `Cache-Control: s-maxage=…` per route so the edge serves repeats from cache. Or host the whole site on Cloudflare Pages (free; 500 builds/month). This removes the per-request and per-upload Netlify credit cost.
7. **Pause sockets when hidden** for more than 60 s; resubscribe and gap-fill on return. Make trade streams conditional (only open aggTrade/trades when Big trades or the CVD tab is on).
8. **Render less:** update only changed numbers instead of rebuilding tab HTML on every source tick. Throttle `render()` to at most 1–2 per second. Remove the dead 700 ms overlay timer and the legacy chart code.
9. **Web Worker** for `analysis()`, `liqHeat`, `geoPatterns` and profile calculations so the main thread stays smooth on phones.
10. **Incremental fetches** wherever history is needed: `startTime` for klines, `before`/`after` cursors for OKX liquidations and Coinbase trades.
11. **PWA:** a service worker caching the static files (instant load, offline shell) plus a manifest for a home-screen app.

Expected result if 1–7 are done: about 10 REST req/min (from ~78), 3 sockets (from 6), proxied requests under 3/min, download roughly 15–25 MB/h (mostly optional trade streams), and no AI usage.

---

## 7. Calculations (all local, no AI)

Everything below already runs in plain JavaScript in the browser. Each is a straightforward port to Python (pandas/numpy, or TA-Lib for the indicators) if a backend is added later.

| Category | Calculations | Where |
|---|---|---|
| Indicators | EMA, SMA, RSI(14, Wilder), MACD(12,26,9), Stoch RSI(14,14,3,3), ATR(14, Wilder), Bollinger(20,2) width and %B, daily VWAP, weekly anchored VWAP with ±1σ/±2σ, EMA 50/200 cross detection | `ta.js`, `chart2.js` (`avwapSeries` in app2.js) |
| Order flow | Spot CVD from Binance taker-buy volume (2·takerBuy − volume), perp/spot CVD from OKX taker stats, per-candle delta, taker imbalance %, CVD divergence | `ta.js`, `app.js`, `app2.js` |
| Positioning | Aggregate OI across venues (BTC and $), OI-weighted funding, funding APR, OI change 1 h/4 h, price-vs-OI quadrant (longs/shorts opening/closing), long/short split of OI by account ratio | `app.js`, `stage4.js` |
| Structure and levels | Swing pivots, market structure (HH/HL, LH/LL), PDH/PDL, day/week/month opens, session highs/lows, zone clustering (levels within 0.12% merged and weighted), visible-range Fibonacci, visible-range volume profile and TPO (POC/VAH/VAL, 70% value area) | `ta.js`, `app.js`, `chart2.js` |
| Patterns | 20 candle-pattern variants with trend, volume and level context; double top/bottom; RSI and CVD divergences; least-squares trendline fits for triangles, wedges, channels, ranges, broadening, flags/pennants, head and shoulders (+ inverse) with breakout and measured-move targets | `ta.js` |
| Scoring | Per-TF vote score, weighted multi-TF score (15m 15%, 30m 25%, 1h 25%, 4h 25%, 1d 10%), flow score, overall bias (70/30) | `ta.js`, `app2.js` |
| Trade planning | Setup generation from zones (entry, ATR-based stop, zone targets, R:R, score), isolated-margin liquidation estimate (MMR 0.5%), P&L/ROE, max safe leverage | `ta.js` |
| Liquidity models | Liquidation map and time heatmap from hourly OI changes spread across 5×/10×/25×/50×/100× (10/25/30/25/10%), removing levels price has crossed, scaled from OKX to all venues | `ta.js` |
| Markets | Spot spreads and volume share, Coinbase premium, futures basis and annualized basis, options put/call, max pain, OI by strike | `app2.js` |
| Other | Big-trade detection (per venue/side/second aggregation), session windows with DST (`Intl`), CoinWise text parsing, economic-calendar countdowns | `chart2.js`, `stage4.js` |

---

## 8. Known issues

### 8.1 Verification gaps (most important)

- **Live data has only been verified for stage 1.** The development container could not reach exchange APIs, so stages 2–4 were tested only with mocked responses (`tests/mock.js`) and the sample-data preview. The response formats were written from API documentation and memory; some field names or units may be off on real responses.
- **Last live status report (stage 1, Oct 27 09:12 ET, iPhone Safari):** 9 of 15 OK; OKX rubik stats (OI history, taker volume, long/short), Kraken Futures, MEXC and BingX failed with CORS; Bybit and Binance futures region-blocked. The `_redirects` proxy fix shipped in 1.1 but **has not been confirmed live**.
- **Which stage is live is unknown.** The user uploaded stage 1 and possibly later stages; they stopped uploading because of Netlify credit cost. Check the site footer (it shows the stage).
- **The canvas chart's gestures were tested in Chromium with synthetic touch**, not on a real iPhone. iOS Safari behavior (`touch-action: pan-y`, gesture events, inertia feel) needs a real-device check.
- **WebSockets** (OKX liquidations/trades, Coinbase matches, Binance aggTrade) were tested only with fake sockets.

### 8.2 Data accuracy and assumptions

- OKX rubik values are treated as USD when > 10,000,000 and converted to BTC with a price. This is a heuristic because the endpoint doesn't state units clearly.
- The OI lower pane converts the whole 5m OI history with the *current* price, which slightly misstates older points.
- Aggregate OI mixes contract types and relies on per-venue unit assumptions: Deribit OI is USD ÷ mark price; MEXC `holdVol × 0.0001 BTC`; Bitget `holdingAmount` treated as BTC; BingX has no OI; Kraken funding is normalized by a heuristic (absolute vs relative).
- Longs/shorts in the positioning chart are **OI split by OKX's account ratio**, not actual position sizes. No free source gives exact long vs short OI.
- Liquidation map and heatmap are **models** (assumed leverage mix, OKX OI scaled to all venues). They will not match Coinglass/CoinAnk.
- Liquidation events: OKX is the only reliable source from the US. The REST call returns at most the last 100 orders per family, so there can be gaps between polls. Binance/Bybit liquidations are likely blocked.
- Coinbase CVD and big-trade bubbles only cover the time the page has been open (plus whatever is cached in localStorage on that device).
- The Coinbase premium compares BTC-USD with BTC-USDT without removing the USDT/USD basis.
- Kraken spot "24 h" change is actually since the UTC-midnight open; Gemini has no change figure.
- ForexFactory feed: field names (`actual` in particular), rate limits and the proxy route are unverified. The feed only covers the current week.
- Session hours are fixed: Asia 09:00–18:00 Tokyo, London 08:00–16:30, New York 09:30–16:00 ET. They may differ from the user's preferred definitions.
- Scores, weights, pattern thresholds and setup rules are heuristics. **Nothing is backtested.** Setups ignore fees, funding and slippage, and the liquidation price uses a flat 0.5% maintenance margin.

### 8.3 Code and performance

- Layered overrides and dead code (§1.3): legacy Lightweight Charts code in `app.js` (`initChart` … `recolorCharts`, the LWC-specific `ema` helper) and the overlay code in `app2.js` still ship and run partially at load.
- Global scope, no modules, no build, no type checking. Name collisions are possible.
- `render()` rebuilds the active tab's HTML after every source update (several times per second at peak). That's fine on desktop but wasteful on phones.
- An obsolete `setInterval(…, 700)` in `app2.js` still fires.
- WebSockets keep running in background tabs; on iOS they'll be killed and reconnected.
- Error classification can't always distinguish CORS from regional blocking (both appear as `TypeError` in browsers).
- The live site supports light/dark only via the system setting; a manual theme toggle exists only in the preview build.
- The canvas chart has no keyboard support (accessibility).
- No automated tests run on deploy; the harness in `tests/` is manual.

### 8.4 Unfinished or not built

- Coinglass/CoinAnk data (paid APIs): links only. CoinWise: manual paste only.
- Price alerts, trade journal and home-screen app (PWA): proposed, not built.
- Discord/YouTube intel from the Grok version: intentionally dropped (needed a logged-in browser).
- Patterns are not drawn on the main chart (cards only).

### 8.5 Cost

- Netlify Free: 300 credits/month, 15 per production upload, plus request/bandwidth credits for proxied traffic (§4.2). If credits run out, Netlify pauses the site until the next cycle.

---

## 9. Deployment

### 9.1 Requirements

Any static web host. No server runtime, database, environment variables or API keys. The one host-specific need: **a same-origin pass-through (`/px/<name>/*`) for the CORS-blocked exchanges.** Without it, those ~12 sources show "blocked" and everything else still works.

### 9.2 Netlify (current)

1. Upload the contents of `site/` (or a zip of it) via **Deploys → drag and drop**, or connect a Git repo for automatic deploys. Git deploys get free Deploy Previews; production deploys cost credits.
2. `_redirects` is picked up automatically; it defines the `/px/*` proxies (status 200 rewrites; query strings are forwarded).
3. No environment variables.

### 9.3 Other hosts

- **Cloudflare Pages (now set up in this repo):** `functions/px/[[path]].js` implements the `/px/<name>/*` pass-through as a Pages Function with an allow-list and short edge caching. Build output directory `site`, no build command, repo root as project root. See README.
- **Cloudflare Pages + a Worker (alternative):** serve `site/` as static files. Implement `/px/<name>/*` in a Worker (or Pages Function) that maps `<name>` to the same upstream hosts as `_redirects`, forwards method/body/query, adds `Access-Control-Allow-Origin` and short edge caching. Keep an allow-list of hosts so it can't be used as an open proxy.
- **GitHub Pages / any static host:** works for everything except the `/px` sources unless a separate proxy (such as the Worker above) is added. Then change the `PROXY` map in `app.js` (and the additions in `chart2.js`/`stage4.js`) to the proxy's absolute URL.
- **Local:** `npx netlify-cli dev` in `site/` honors `_redirects` locally. A plain static server (`python3 -m http.server`) runs the app but the `/px` routes 404 and fall back to direct requests, which those exchanges block (CORS).

### 9.4 Preview without network or credits

`python3 preview/build.py` inlines `site/` plus `preview/shim.js` into `preview/btc-dashboard-v2-preview.html`. It runs anywhere (including as a claude.ai artifact, where external requests are blocked) using generated sample data. The banner says it's sample data. Use it to review layout and interaction before any upload.

### 9.5 Tests

From `tests/` (needs Node 18+ and `npm i playwright` with a Chromium):
- `node tatest.js` and `node geotest.js`: engine checks, no browser.
- `node run2.js 1400 900 dark out.png` / `node run2.js 390 844 dark out.png`: load `site/` with mocks, walk every tab, screenshot, print errors.
- `node chart3.js 390 844 dark out.png touch`: gesture tests.
- `node liqt.js`, `node preview-smoke.js`.

Some scripts write screenshots into folders (`s2/`, `s3/`); create them first.

### 9.6 Secrets

None exist today. If paid APIs (Coinglass/CoinAnk) are added later, keys must live in the proxy/Worker as environment secrets and never in `site/` files.

---

## 10. Migration plan

### 10.1 For a developer taking over

1. **Read** this file, then `docs/functions.md` (watch the "defined more than once" list) and `docs/sources.csv`.
2. **Run** the preview and `tests/run2.js` to see everything working on mock data. No network or AI needed.
3. **Put it in Git** (GitHub) and connect a host with free previews (Cloudflare Pages, or Netlify Git deploys). This replaces manual zip uploads.
4. **Verify live data first.** Deploy as-is to a preview URL, open **Sources → Copy status report** on a phone, and fix any field/unit mismatches source by source. Each source is isolated in one `def()` block.
5. **Clean up without changing behavior:**
   - Delete the legacy chart code in `app.js` and the overlay code in `app2.js`.
   - Fold `drawMood`/`drawPatterns`/`chartExtras` into single definitions.
   - Replace the `drawStage2` wrappers with one tab router.
   - Optionally convert to ES modules with a tiny bundler (esbuild or Vite).
   - Keep `ta.js` pure; it's already Node-testable.
6. **Data layer rewrite (§6 items 1–7):** a single store with one Binance, one OKX and one Coinbase socket, shared candle and positioning stores, period-aligned polling, and the proxy moved to a Cloudflare Worker.
7. **Performance (§6 items 8–9):** targeted DOM updates and a Web Worker for analysis.
8. **Then features:** alerts, PWA, Coinglass/CoinAnk if paid keys are provided (through the Worker), patterns on the main chart.

What not to rebuild: `ta.js` (indicators, patterns, setups, models), `CChart` (chart engine), the source registry/scheduler/status pattern (`def`/`tick`/Sources tab), and all tab renderers. They can be reorganized rather than rewritten.

### 10.2 For an AI assistant taking over (low-token workflow)

- Start each session with: this file's §1.3–1.4 + the specific function(s) from `docs/functions.md`. Don't paste whole files.
- Ask for targeted patches (search/replace or unified diffs) to named functions.
- Verify with `tests/` and the preview build, not with screenshots in chat. Use screenshots only for visual design questions.
- Keep data refresh, analysis and text generation in code. Do not add runtime LLM calls.
- Batch changes; deploy once per batch.

### 10.3 Related projects (not part of this export)

- **BTC Market Dashboard v1.5.2 (Grok build), hosted on claude.ai:** a static snapshot of the Grok dashboard (Oct 24, 1:52 PM ET), run through the React shim in `legacy/grok-v1.5.2-port/`. It doesn't refresh; it's superseded by v2.
- **BTC Futures Desk (claude.ai artifact):** an earlier, separate Claude-built desk. Its source isn't included here; it can be exported from claude.ai if needed.
- **My tools hub (claude.ai artifact):** links to all of the above, the live Netlify site and the preview.
