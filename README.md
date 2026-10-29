# BTC Market Dashboard v2 (handoff export)

A static, client-only BTC futures dashboard. Live exchange data is fetched directly by the browser from free public APIs, and every indicator, signal and pattern is calculated locally in JavaScript. There are no runtime AI calls and no API keys.

- **Read first:** [HANDOFF.md](HANDOFF.md). It covers the full technical handoff: structure, features, data sources, refresh rates, AI usage, optimization, known issues, deployment and migration.
- **Deploy:** upload `site/` to Netlify (its `_redirects` proxies the CORS-blocked exchanges). Any static host works; see HANDOFF §9.
- **Try without network:** `python3 preview/build.py`, then open `preview/btc-dashboard-v2-preview.html` (sample data).
- **Test:** `cd tests && npm i playwright && node tatest.js && node run2.js 390 844 dark out.png` (mocked exchanges; create `s2/`, `s3/` folders for scripts that save screenshots there).
- **Inventory:** `docs/sources.csv` (every data source), `docs/functions.md` (every function, plus overrides between files).

Folder map: `site/` app · `preview/` sample-data build · `tests/` harness · `docs/` generated inventories · `legacy/` the earlier Grok-built version and its port.

## Hosting on Cloudflare Pages (free, auto-updates from this repo)

Connect this repository in Cloudflare (**Workers & Pages → Create → Pages → Connect to Git**) with:

- **Framework preset:** None
- **Build command:** leave empty (or `exit 0` if a value is required)
- **Build output directory:** `site`
- **Root directory:** leave as the repo root (so the `functions/` folder is found)

`functions/px/[[path]].js` provides the `/px/<name>/…` pass-through on Cloudflare (Netlify uses `site/_redirects` instead). Every push to `main` redeploys automatically.
