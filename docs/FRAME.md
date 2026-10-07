# The frame

What every page shares, and what page areas build with. Short on purpose; the code
comments carry the detail.

## Who owns what

| Area | Files |
| --- | --- |
| Frame | `src/frame/*`, `src/controls/*`, `src/styles/frame.css`, `controls.css`, `home.css`, `about.css`, `src/pages/Home.tsx`, `About.tsx`, `NotFound.tsx`, `src/main.tsx`, `src/App.tsx`, `seo.ts`, `vite.config.ts` |
| Projects | `src/pages/Projects.tsx`, `ProjectPage.tsx`, `src/projects/**`, `src/styles/projects.css` |
| Papers | `src/pages/Papers.tsx`, `src/styles/papers.css` (+ any `src/papers/**`) |
| Writing | `src/pages/Writing.tsx`, `Essay.tsx`, `src/styles/writing.css` (+ any `src/writing/**`) |

Each page imports its own CSS file. Don't restyle the header, footer or kit from a page
file; ask the frame instead.

## Tokens (`src/styles/frame.css`)

- Colour: use `--g0` (ground), `--g1`, `--g2` (raised), `--rule`, `--rule2` (lines),
  `--tx` (headings, 16:1), `--tx2` (body, 11:1), `--tx3` (smallest words, 7:1), `--tx4`
  (decoration only), `--acc` (the old site's cyan; earned, not default), `--acc-tx`
  (cyan for words), `--wire` (Wireframe's phosphor).
- Rooms: `<html data-room>` is `home`, `projects`, `project`, `papers`, `writing`,
  `essay`, `about` or `page` (set by Layout from the path). To colour a room, set the
  `--r-*` inputs (`--r-g0`, `--r-g1`, `--r-g2`, `--r-rule`, `--r-rule2`, `--r-tx`...
  `--r-tx4`) on `html[data-room="..."]` in your CSS file. Never set `--g0`/`--tx`
  directly: they are derived from `--r-*` so the controls (ground, temperature,
  phosphor ink) work in every room. Grounds stay above pure black.
- Type: `--sans` (Archivo), `--serif` (Source Serif 4), `--mono`. Weights `--w3`,
  `--w35`, `--w4`, `--w45`, `--w5`, `--w6` are a touch heavier than the type's defaults
  and follow the Weight control; use them instead of numbers. Line heights:
  `calc(1.5 * var(--k-lead))`.
- Layout: `.wrap` (max 1440, margin `--m`), 12-column grids with `--gap`, `--hdr`
  (header height on desktop), `--hdr-b` (where the header ends, any size), `--hair`.
- Kit: `.lbl` (small caps label), `.loadbox` (the plain Loading... box, only while
  loading), `.btn` (small secondary button), `.chip`, `.bib` + `.copy`, `.ptitle` (tick
  rule under a title), `.crop` (crop marks), `.cx` (four caret corners; `--cx` colour,
  `--cx-o` offset), `.mx` (wrap media so Wireframe can cross it out), `.live` + `.osd`
  (a canvas well with readouts), `.cap`, `.vh`.
- Motion: nothing fades or eases. CSS transitions/animations are off site-wide; anything
  that moves runs on the shared loop. Opt an element out with `[data-motion]` only if it
  truly needs CSS animation.

## Shared components (`src/frame`)

- `<Action to|href|onClick primary?>` and `<Actions>`: the big, clear buttons for a
  page's main actions (Code, Paper, Video, CV). `to` = page on this site; `href` = link
  (leaving the site opens a new tab with ↗); `onClick` = button. One action per page may
  be `primary` (cyan, like the old site's buttons). Never two buttons to the same place.
- `<ExternalLink href>`: inline link out (new tab, ↗). On-site names use `<Link>`.
- `<AutoVideo src poster label width height />`: muted, looping, inline, plays only
  on screen and in a visible tab; holds its poster under reduced motion / Save-Data;
  a small square in the corner (hover/focus) pauses it. No play button in front.
  `src` may be a list of `{ src, type }`.
- `<StarSky density? />`: the shooting-star sky for project pages (fixed, behind
  `<main>`). Render it once anywhere in the page; it removes itself on unmount.
- `<PageFrame glow? />`: the plain bezel used by Home and About.
- `<Time iso f />`: every date. `f`: `y` 2026, `ym` 2026.03, `ymd`, `my` Mar 2026,
  `day` Mar 4, 2026, `long`. Follows the Calendar control (Wireframe shows ISO, Broken
  Unix).
- `<Loading failed? empty? what? />`: the plain box.
- `useApi(path)`: fetch from the backend (`/api` is proxied in dev; any port works).
- `useLiving(ref, el => ({ fps, tick(dt), budget?, slow?, always?, paused? }))`: put a
  canvas or simulation on the one shared loop. It is capped by the Clock control, scaled
  by Tempo, paused offscreen and in hidden tabs, and starts paused under reduced motion
  (draw one still frame yourself when `STILL` from `./live` is true). The returned ref's
  `.current.setPaused(bool)` pauses and resumes, e.g. to play only while hovered.
  Lower level: `living()` in `./live`. Also `REDUCED_MOTION`, `STILL`, `TIER`, `COARSE`.
- `./util`: `clamp`, `lerp`, `rng(seed)`, `hash(str, seed)`, `oklch(L, C, h)` (for
  canvases), `isExternal`, `SAVE_DATA`.

## Views and the controls (`src/controls`)

- 55 settings (`schema.ts`); a view is a preset of them. The navbar toggle cycles
  Comfort, Wireframe, Broken, Reactive. Reset returns everything to Comfort.
- The panel (`Panel.tsx`) has no entry point: pressing the toggle rapidly (7 presses
  within 1.4 s) or arriving at Comfort for the third time opens it; `?controls` too.
  Esc closes it. `?view=wireframe` etc. and `?reset` work in URLs.
- The store writes `--k-*` properties and `k-*` classes on `<html>`; `fx.ts` marks
  boxes with `data-bx`, `data-bk`, `data-ff`, `data-st`, `data-ovf`, `data-zf` and
  draws labels. Page CSS can react to `html[data-view="wireframe"]`, `html.k-ink`, etc.
  Optics, faults and dynamics only reach `<main>` and the footer.
- Page areas add their own settings (import from `src/controls`):

  ```ts
  const WRITING: ControlGroup = {
    id: "writing",
    title: "Writing",
    controls: [
      { id: "biome", label: "Biome", k: "s", d: "auto", o: ["auto", "meadow", "understory", "mycelium"] },
      { id: "season", label: "Season", k: "s", d: "today", o: ["today", "spring", "summer", "autumn", "winter"] },
      { id: "tempo", label: "Growth", k: "n", d: 1, min: 0.25, max: 4, st: 0.05, fmt: "x" },
    ],
  };
  registerGroup(WRITING);                    // in the panel on every page
  // or useControlGroup(WRITING) to show it only while a component is mounted
  const biome = useControl("writing.biome"); // value; re-renders on change
  set("writing.biome", "meadow");            // e.g. a small toggle at the end of a post
  onReset(() => { /* clear anything else you keep */ });
  ```

  Kinds: `n` number (`min`, `max`, `st`, optional `fmt`: `pct`, `x`, `deg`, `px`, `n`),
  `h` hue, `s` choice (`o`), `b` on/off. Values persist on the device and reset with
  everything else. Numbers also appear as `--k-writing-tempo` on `<html>`, choices as
  `data-k-writing-biome`.

## Rules the frame keeps (keep them too)

- No "cockpit" anywhere a visitor can see; the panel is "controls".
- No narrating microcopy, no reading times, no tags like "Sketch", no play buttons in
  front of videos, no duplicate buttons to the same target.
- Body text AA on its ground; keyboard reachable; works with any input speed.
