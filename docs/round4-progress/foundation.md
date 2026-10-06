# Round 4 · Foundation: progress log

Owner: foundation agent. Resume from the first unchecked item.

## Plan
- [x] 1. Dev proxy: vite.config.ts proxies /api (dev + preview) to VITE_API_TARGET (default prod backend); app uses relative /api in dev.
- [ ] 2. Controls core: src/cockpit -> src/controls (schema, store, scheduler), CSS tokens via color-mix so rooms own their colors in CSS.
- [ ] 3. Frame: frame.css split (frame/controls/home/about + stubs projects/papers/writing), header with "SevanB.net", clacky nav, view toggle + Reset.
- [ ] 4. fx runtime port (skeleton labels, faults, dynamics, mechanics) + controls panel (easter egg: rapid clicks / third arrival at Comfort), registration API.
- [ ] 5. Home (plain border, slow blue glow at one hotspot, pronounced links) + About (no portrait, big CV/Resume, echoes home).
- [ ] 6. Shared: StarSky (shooting stars), AutoVideo, Action buttons, Time.
- [ ] 7. seo.ts check, docs/FRAME.md, browser verification (desktop/mobile, all views, easter egg, reset, reduced motion).

## Log
- 1 done: proxy verified (curl localhost/api/projects/ -> 200).
