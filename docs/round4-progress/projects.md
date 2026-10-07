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
- [ ] 6. Verify: 1440x900 + 390x844, four views, reduced motion, keyboard, long tasks; npm run check + build.

## Log
- Checkpoint 1: list (src/pages/Projects.tsx + src/projects/kit.tsx Entry/Thumb, earlier.ts looks), earlier pages (ProjectPage.tsx, Media.tsx: AutoVideo / autoplaying muted YouTube / image / pip code), sonar page (sonar/Page.tsx, SonarDemo.tsx + model.ts ported from F, sonar.css; old SonarRendering.* removed), LT page (learning-taichi/Page.tsx, Lab.tsx, lab.css). Images in src/projects/assets (thumbs 560x350). Next: mobile + four views + reduced motion + keyboard + perf checks, polish.
