# Round 4 · Projects: progress log

Owner: projects agent. Owns src/pages/Projects.tsx, src/pages/ProjectPage.tsx, src/projects/**,
src/styles/projects.css, public/lab/** (gitignored). Resume from the first unchecked item.

## Plan
- [x] 0. Lab export copied to public/lab/learning-taichi (no PUBLIC_EXPORT_REPORT.md); /public/lab/ in .gitignore.
- [x] 1. Projects list: one consistent list (old site's clarity), icon per project that glows on hover (all of them), title, status/dates, one line.
- [x] 2. Shared project page shell: near-black room, StarSky, header (title, dates/status, big Actions), AutoVideo.
- [x] 3. Earlier project pages from the API.
- [x] 4. Sonar page: live demo on top, video, short text, dark figures, results, cite.
- [x] 5. Learning Taichi page: embedded lab at top, fullscreen / full-window, short paragraph.
- [x] 6. Verify: 1440x900 + 390x844, four views, reduced motion, keyboard, long tasks; npm run check + build.

## Log
- Checkpoint 1: list (src/pages/Projects.tsx + src/projects/kit.tsx Entry/Thumb, earlier.ts looks), earlier pages (ProjectPage.tsx, Media.tsx: AutoVideo / autoplaying muted YouTube / image / pip code), sonar page (sonar/Page.tsx, SonarDemo.tsx + model.ts ported from F, sonar.css; old SonarRendering.* removed), LT page (learning-taichi/Page.tsx, Lab.tsx, lab.css). Images in src/projects/assets (thumbs 560x350). Next: mobile + four views + reduced motion + keyboard + perf checks, polish.
- Checkpoint 2: sonar formulas pre-rendered (sonar/tex.ts) so the page no longer ships KaTeX JS (chunk 280 kB -> 32 kB); lab full-window mode moved to the top layer (manual popover) so the header and view transforms cannot cover it; YouTube embeds without controls; Fullscreen hidden when the lab export is missing. Verified: desktop + mobile for list and every page, four views, reduced motion (demo waits for Fit and computes in slices, stars still, videos hold), keyboard through the list, API failure and missing-lab states, both fullscreen modes. Perf at 4x: the only long tasks are the main bundle's (same on /about, /papers) plus the lab iframe's own start-up (~55-95 ms, deferred to idle).
- Checkpoint 3: one pager (ProjectPager in kit.tsx) on every project page, walking the list order. Next: clean-copy check + build of HEAD; summary.
