# Round 4 · Papers: progress log

Owner: papers agent. Owns `src/pages/Papers.tsx`, `src/papers/**`, `src/styles/papers.css`.
Resume from the first unchecked item. Dev server port 5612.

## Plan
- [x] 1. Page: entries as separated panels (date, title, authors, venue lamp, description,
      big Paper / Code / BibTeX actions, BibTeX block with Copy); sonar title and a
      "Project page" action go on-site; others go to arXiv in a new tab.
- [x] 2. `src/papers/overrides.ts` keyed by arXiv id (Training-Free BibTeX, sonar code link).
- [x] 3. Widget host: lazy module per paper, mounted near the viewport, active while the
      pointer is over the entry / focus inside / tap on touch; still otherwise.
- [x] 4. Temporal abstraction widget: frames collapse into a few events. Simple.
- [x] 5. Sonar widget: target + render fans and a hidden-line (design B) seafloor converging live.
- [x] 6. Kuramoto widget: F's bar (play, Data-Sync scrub, t, New), richer data fields.
- [ ] 7. Verify 1440x900 + 390x844, all four views, reduced motion, keyboard, perf; check + build.

## Log
- Checkpoint 1: page (panels, big actions, BibTeX + Copy, overrides), lazy widget host with
  placeholders, temporal (film strip -> events), sonar (fans + hidden-line ridges, rests on a
  finished fit, refits a new floor from flat while active), kuramoto (F's bar, five field
  families, autoplay data -> sync -> next sample while active). Next: step 7 (views, touch,
  keyboard, reduced motion, perf, check + build) and polish.
