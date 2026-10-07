# Round 4 · Fix pass: progress log

Owner: fix-pass agent (only agent running; may touch any repo path except dist/ and
public/lab/). Resume from the first unchecked item.

## Verified facts (deploy)
- origin/redesign = 6c3a572; its CI run failed at `npm run check` on biome.json
  formatting (reproduced on a clean copy). Fixed locally in 1e05253 (biome.json) and
  4f4d541 (vite.config.ts, a later local-only error).
- Railway's frontend_dev deploys the `dev` branch (.railway/railway.ts), not `redesign`,
  so pushing `redesign` alone never deploys. origin/dev (4732e5f) is an ancestor of
  redesign, so `git push origin redesign:dev` would fast-forward. Not pushed.

## Plan
- [x] 1. App: lazy routes + preload on nav hover/focus; error boundary; vite:preloadError reload once
- [x] 2. Layout: focus to main on route change; keep scroll on Back/Forward; main min-height (CLS)
- [x] 3. Header: remove Reset from navbar; fix 760–900 px overflow
- [x] 4. Writing progress bar above the sticky header
- [x] 5. AutoVideo: only NotAllowedError gives up
- [x] 6. useApi cache (Back to /projects keeps place)
- [x] 7. Lab: build-time flag; missing → bright still, no error; seo.ts <base> for a hosted lab
- [x] 8. Copy: LT narrating sentence; meta descriptions (site.js)
- [x] 9. About fits 100vh on laptops; Home slot centred below desktop
- [x] 10. StarSky subtler behind text; projects list stacks on phones
- [x] 11. Papers: drop sonar's duplicate "Project page" button
- [~] 12. Low (done: llms flagships, seo comment, biome override, allowFullScreen, Post type, .page to frame.css, static-page look, route modulepreloads; skipped: sonar content-visibility, DOMPurify lazy): llms.txt flagships, seo comment, biome override, allowFullScreen, sonar content-visibility, types.ts Post, .page/.rows to frame.css, static-page look, DOMPurify lazy
- [ ] 13. check + build + browser sweep + final screenshots + final commit

## Log
- Checkpoint 1: items 1-11 done. Main bundle 372 KB -> 286 KB. Papers: off-site titles are
  plain text; sonar keeps title link + "Project page" button (a title plus one button is
  not the Watch/Read problem). Next: full browser sweep, perf at 6x, final screenshots.
