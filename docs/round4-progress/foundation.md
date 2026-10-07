# Round 4 · Foundation: progress log

Owner: foundation agent. Resume from the first unchecked item.

## Plan
- [x] 1. Dev proxy: vite.config.ts proxies /api (dev + preview) to VITE_API_TARGET (default prod backend); app uses relative /api in dev.
- [x] 1b. CI fix: vite.config.ts was not biome-formatted, so `npm run check` failed on redesign (this is why the Railway dev deploy did not land). Fixed in 4f4d541; HEAD passes check + build in a clean copy.
- [x] 2. Controls core: src/cockpit -> src/controls (schema.ts, store.ts), scheduler src/frame/live.ts, CSS tokens via color-mix so rooms own their colours in CSS.
- [x] 3. Frame: frame.css (tokens, header, footer, kit), controls.css, home.css, about.css + stubs projects/papers/writing; header with "SevanB.net", clacky nav, view toggle + Reset.
- [x] 4. fx runtime port (src/controls/fx.ts: skeleton labels, faults, dynamics, mechanics) + controls panel (src/controls/Panel.tsx; easter egg: rapid clicks / third arrival at Comfort), registration API.
- [~] 5. Home (plain border, slow blue glow at one hotspot, pronounced links) + About (no portrait, big CV/Resume, echoes home).
- [~] 6. Shared: StarSky (shooting stars), AutoVideo, Action buttons, Time, useLiving.
- [ ] 7. seo.ts check, docs/FRAME.md, browser verification (desktop/mobile, all views, easter egg, reset, reduced motion).

## Log
- 1 done: proxy verified (curl localhost/api/projects/ -> 200).
- Resumed after a disconnect (2026-10-06 evening): found schema.ts, store.ts, live.ts and a new frame.css uncommitted; kept them.
- Checkpoint 2: controls (schema/store/fx/Panel/ViewToggle), frame CSS split, Layout, PageFrame, StarSky, AutoVideo, Action, Time, useLiving, Home, About written. Wireframe/Broken render like F; both easter eggs and Esc verified in Chrome. Next: review Reactive + reduced motion + mobile, About/Projects screenshots, StarSky look, FRAME.md, build.
