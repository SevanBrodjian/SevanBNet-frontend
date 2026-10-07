# Round 4 · Writing: progress log

Owner: writing agent. Resume from the first unchecked item.
Owns: src/pages/Writing.tsx, src/pages/Essay.tsx, src/writing/**, content/writing/**,
src/styles/writing.css, the writing parts of seo.ts and vite.config.ts, package.json/lock.

## Plan
- [x] 1. Markdown posts: deps (devDependencies), build-time plugin src/writing/build.ts
      (virtual:writing index + one lazy chunk per post; images hashed by Vite; KaTeX only
      in posts with math), Obsidian embeds/wikilinks/comments, 6 posts migrated from the
      API into content/writing/*.md, content/writing/README.md.
- [~] 2. Writing index + Essay pages on the markdown posts (no API), progress bar, pager,
      biome toggle at the end of an essay, no reading time.
- [~] 3. Ecosystem (src/writing/eco/*): port of F's eco.js to TS on the shared loop; more
      alive; season from today's date; biome rolled at random and kept for days; settings
      only in the hidden controls (writing.biome / writing.season / writing.tempo).
- [~] 4. Essay night: dim margins, biome-specific bioluminescence lighting its surroundings.
- [ ] 5. seo.ts on markdown posts (static pages, sitemap, llms.txt, no writing/:slug shell
      fallback), browser checks (1440x900, 390x844, four views, reduced motion, perf),
      npm run check + production build.

## Log
- Checkpoint 1: deps (devDependencies: unified/remark/rehype, yaml, image-size), plugin in
  src/writing/build.ts registered in vite.config.ts; 6 posts migrated (scratchpad
  writing/migrate.py + verify.mts: text, em, strong, h2 and front matter identical to the
  API); README; Writing/Essay pages on virtual:writing; engine ported (src/writing/eco/*)
  with night lighting, fireflies (pulse-coupled), glow-worms, foxfire, threads, hyphae
  pulses, glowing caps, pointer lamp, wind gusts, butterflies, fresh growth; settings in
  src/writing/settings.ts (controls group "writing", biome roll 4-9 days).
  A local test post content/writing/zz-test-draft(.md|/) is NOT committed (draft: true);
  delete it before finishing.
  Next: tune day density/aliveness, check views + mobile + reduced motion, seo.ts.
