# Legacy: Grok-built dashboard v1.5.2 and its port

- `BTC_Market_Dashboard_v1.5.2.canvas.tsx`: the user's Grok-generated file (data snapshot Sat Oct 24 2026, 1:52 PM ET baked in; 3,597 lines). It imports components from Grok's private `grok/canvas` module.
- `grok-canvas.tsx`: a small React stand-in for `grok/canvas` (Page, Section, Text, Table, Callout, BulletList, Segmented, useGrokTheme with light/dark palettes) so the file runs outside Grok.
- `patch.js`: display-only fixes applied to a copy (caps AGGR/Whales SVG width, catches a clipboard rejection). It reads `src.tsx`, so copy or rename the `.tsx` to `src.tsx` first.
- `entry.tsx`, `template.html`, `mkhtml.js`: bundle with esbuild (`esbuild entry.tsx --bundle --format=iife --jsx-factory=React.createElement --jsx-fragment=React.Fragment --alias:grok/canvas=./grok-canvas.tsx`), then inline the bundle into one HTML page that loads React 18.3.1 UMD from cdnjs. `build.js` is an earlier TypeScript-only bundling path.
- This version never refreshes on its own. Its data came from Grok's `build_dashboard.py`, which is not available. It is superseded by v2.
