import { useEffect, useRef } from "react";
import { subscribe } from "../controls/store";
import { living, STILL, TIER } from "../frame/live";
import type { HeroEngine } from "./engine";

// The home page's centre: short glimpses of worlds, drawn in white ink, that reorganise from
// one into the next. The engine loads after the page; under reduced motion it draws one
// still frame. Runs on the site's shared loop, so it pauses offscreen and in hidden tabs.

/** The ink colour: the page's text colour as 0..1 sRGB. */
function inkColor(): [number, number, number] {
  try {
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    const g = probe.getContext("2d");
    const css = getComputedStyle(document.documentElement).getPropertyValue("--tx").trim();
    if (!g || !css) return [0.93, 0.92, 0.89];
    g.fillStyle = css;
    g.fillRect(0, 0, 1, 1);
    const [r, gr, b] = g.getImageData(0, 0, 1, 1).data;
    return [r / 255, gr / 255, b / 255];
  } catch {
    return [0.93, 0.92, 0.89];
  }
}

type Make = (canvas: HTMLCanvasElement, flat: boolean) => HeroEngine | null;

/** How long the GPU has to give back a lost context before the ink carries on in 2D. */
const RESTORE_MS = 1500;
/** Draw with the 2D canvas from now on: WebGL failed or was lost and not given back. Safari can
 *  keep a page's WebGL broken for a while, so this holds for the rest of the visit. */
let flat = false;

/** Start the hero in box; `again` restarts it (after the GPU drops the context). */
function run(box: HTMLElement, make: Make, again: () => void): () => void {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  box.append(canvas);
  const engine = make(canvas, flat);
  if (!engine) {
    canvas.remove();
    if (flat) return () => {};
    // WebGL took the canvas and failed with it: start again in 2D on a new one
    flat = true;
    return run(box, make, again);
  }
  // ?hero=scene:seconds (or scene:h:u for the hand-over after it) holds one moment, for checks
  const hold = import.meta.env.DEV ? new URLSearchParams(location.search).get("hero") : null;
  let quality = 1;
  let still = STILL || !!hold;
  const size = () => {
    const r = box.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * quality;
    engine.resize(r.width, r.height, Math.max(1, dpr));
  };
  const paint = () => engine.render(still);
  engine.setColor(inkColor());
  size();
  if (hold) {
    const [i, a, b] = hold.split(":");
    if (a === "h") engine.poseHandover(+i, +b);
    else engine.pose(+i, a === undefined ? undefined : +a);
  } else if (STILL) engine.pose(0);
  else engine.wake();
  paint();

  const live = living({
    el: box,
    fps: TIER === "A" ? 60 : 40,
    paused: still,
    budget: 7,
    // a slow device: first a little less resolution, then fewer frames (the line's redraw
    // keeps its own rhythm, so the drawing still boils as it should)
    slow: () => {
      if (quality > 0.75) {
        quality = 0.75;
        size();
      } else if (live.fps > 24) live.fps = live.fps > 40 ? 40 : live.fps > 30 ? 30 : 24;
    },
    tick: (dt) => {
      engine.step(dt / 1000);
      paint();
    },
  });
  const ro = new ResizeObserver(() => {
    size();
    paint();
  });
  ro.observe(box);
  const unsub = subscribe(() => {
    engine.setColor(inkColor());
    if (live.paused) paint();
  });
  // a lost context takes the ink's buffers with it: start over on a new canvas, with WebGL if
  // the GPU gives the context back soon, and in 2D if it does not
  let waiting = 0;
  const lost = (e: Event) => {
    e.preventDefault();
    live.setPaused(true);
    waiting = window.setTimeout(() => {
      flat = true;
      again();
    }, RESTORE_MS);
  };
  const restored = () => {
    clearTimeout(waiting);
    setTimeout(again);
  };
  canvas.addEventListener("webglcontextlost", lost);
  canvas.addEventListener("webglcontextrestored", restored);

  if (import.meta.env.DEV) {
    (window as unknown as { __hero: object }).__hero = {
      pose: (i: number, t?: number) => {
        still = true;
        live.setPaused(true);
        engine.pose(i, t);
        paint();
      },
      handover: (i: number, u: number) => {
        still = true;
        live.setPaused(true);
        engine.poseHandover(i, u);
        paint();
      },
      bench: (i: number) => {
        // time a run through scene i (or a reorganisation, with i + 0.5), per frame
        still = true;
        live.setPaused(true);
        const out: { t: number; ms: number; strokes: number; points: number }[] = [];
        if (i % 1) engine.poseHandover(Math.floor(i), 0);
        else engine.pose(i, 0);
        for (let k = 0; k < 600; k++) {
          const t0 = performance.now();
          engine.step(1 / 60);
          engine.render();
          if (k % 20 === 0) out.push({ t: k / 60, ms: performance.now() - t0, ...engine.stats() });
        }
        return out;
      },
      play: () => {
        still = false;
        live.setPaused(false);
      },
    };
  }

  return () => {
    clearTimeout(waiting);
    live.dispose();
    ro.disconnect();
    unsub();
    canvas.removeEventListener("webglcontextlost", lost);
    canvas.removeEventListener("webglcontextrestored", restored);
    canvas.remove();
  };
}

export default function Hero() {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let gone = false;
    let stop = () => {};
    import("./load")
      .then(({ HeroEngine, ORDER, SCENES }) => {
        const scenes = ORDER.map((name) => SCENES[name]);
        const start = () => {
          stop();
          if (!gone) stop = run(el, (c, f) => HeroEngine.create(c, scenes, f), start);
        };
        start();
      })
      .catch((error) => console.error("Couldn't load the hero:", error));
    return () => {
      gone = true;
      stop();
    };
  }, []);
  return <div ref={box} className="hero" />;
}
