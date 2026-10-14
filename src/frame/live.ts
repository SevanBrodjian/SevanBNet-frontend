// One requestAnimationFrame loop for every living element on the site.
//
// - Each element declares the rate it wants; the controls' clock (fps) caps them all and
//   tempo scales the time they are given.
// - Elements pause offscreen (IntersectionObserver), and the loop stops in hidden tabs and
//   whenever nothing is running.
// - Tier S (reduced motion, Save-Data, very low memory, ?still) starts everything paused:
//   draw one still frame and stop.
// - An element whose frame keeps costing more than its budget is told to slow down; one
//   that throws is halted rather than taking the page down with it.

import { getNumber, subscribe } from "../controls/store";

const browser = typeof window !== "undefined";
const query = browser ? new URLSearchParams(location.search) : new URLSearchParams();

/** prefers-reduced-motion, or ?still. */
export const REDUCED_MOTION =
  browser && (matchMedia("(prefers-reduced-motion: reduce)").matches || query.has("still"));
export const COARSE = browser && matchMedia("(pointer: coarse)").matches;

type NavigatorExtras = Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };

function detectTier(): "S" | "A" | "B" | "C" {
  if (!browser) return "S";
  const q = (query.get("tier") ?? "").toUpperCase();
  if (q === "S" || q === "A" || q === "B" || q === "C") return q;
  const nav = navigator as NavigatorExtras;
  const mem = nav.deviceMemory ?? 4;
  const cores = nav.hardwareConcurrency || 4;
  if (REDUCED_MOTION || nav.connection?.saveData || mem <= 1) return "S";
  if (cores >= 8 && mem >= 4 && !COARSE) return "A";
  if (cores <= 4 || mem <= 2) return "C";
  return "B";
}

/** S: still frames only. A, B, C: budgets for living elements, best to least. */
export const TIER = detectTier();
/** True when living elements should draw a single still frame and not move. */
export const STILL = TIER === "S";

if (browser) document.documentElement.dataset.tier = TIER;

export type LivingOptions = {
  /** The element whose visibility decides whether this runs. Omit with `always`. */
  el?: Element | null;
  /** Run even when `el` is offscreen (fixed layers, global effects). */
  always?: boolean;
  /** Frames per second wanted; the controls' clock caps it. */
  fps: number;
  /** dt is in milliseconds, scaled by tempo unless `notempo`. */
  tick: (dt: number, now: number, rawDt: number) => void;
  /** Start paused (default: paused when STILL). */
  paused?: boolean;
  /** Not slowed by the controls' clock. */
  nocap?: boolean;
  /** Not scaled by tempo. */
  notempo?: boolean;
  /** Milliseconds per frame this may cost before `slow` is called. */
  budget?: number;
  slow?: () => void;
  onVisible?: (visible: boolean) => void;
};

export type Living = LivingOptions & {
  visible: boolean;
  paused: boolean;
  halted: boolean;
  last: number;
  cost: number;
  frames: number;
  setPaused: (p: boolean) => void;
  /** Stop for good: unobserve and drop from the loop. */
  dispose: () => void;
};

const live: Living[] = [];
let raf = 0;
let frameMs = 16.7;
let lastNow = 0;

const clock = () => getNumber("fps") || 60;
const tempo = () => Math.min(4, Math.max(0.25, getNumber("tempo") || 1));
const runnable = (o: Living) => o.visible && !o.paused && !o.halted && o.fps > 0;

function wake() {
  if (browser && !raf && !document.hidden && live.some(runnable)) raf = requestAnimationFrame(loop);
}

function loop(now: number) {
  raf = 0;
  let any = false;
  if (lastNow) frameMs = frameMs * 0.9 + Math.min(200, now - lastNow) * 0.1;
  lastNow = now;
  const cap = clock();
  for (const o of live) {
    if (!runnable(o)) {
      o.last = 0;
      continue;
    }
    any = true;
    const interval = 1000 / Math.min(o.fps, o.nocap ? 60 : cap);
    if (o.last && now - o.last < interval - 1.5) continue;
    const dt = o.last ? Math.min(100, now - o.last) : interval;
    o.last = now;
    const t0 = performance.now();
    try {
      o.tick(dt * (o.notempo ? 1 : tempo()), now, dt);
    } catch (error) {
      o.halted = true;
      console.error(error);
      continue;
    }
    const cost = performance.now() - t0;
    o.cost = o.cost ? o.cost * 0.92 + cost * 0.08 : cost;
    o.frames++;
    if (o.budget && o.slow && o.frames > 30 && o.cost > o.budget) {
      o.slow();
      o.cost = 0;
      o.frames = 0;
    }
  }
  if (any) raf = requestAnimationFrame(loop);
  else lastNow = 0;
}

if (browser) {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
      lastNow = 0;
    } else wake();
  });
  subscribe((keys) => {
    if (keys.includes("fps") || keys.includes("tempo")) wake();
  });
}

/** Register a living element with the shared loop. */
export function living(options: LivingOptions): Living {
  let observer: IntersectionObserver | null = null;
  const o: Living = {
    ...options,
    visible: !!options.always,
    paused: options.paused ?? STILL,
    halted: false,
    last: 0,
    cost: 0,
    frames: 0,
    setPaused(p: boolean) {
      o.paused = p;
      wake();
    },
    dispose() {
      observer?.disconnect();
      const i = live.indexOf(o);
      if (i >= 0) live.splice(i, 1);
    },
  };
  if (!options.always && options.el && browser) {
    observer = new IntersectionObserver(
      (entries) => {
        o.visible = entries[entries.length - 1].isIntersecting;
        o.onVisible?.(o.visible);
        wake();
      },
      { rootMargin: "80px" },
    );
    observer.observe(options.el);
  }
  live.push(o);
  wake();
  return o;
}

/** For the controls' instruments. */
export const loopStats = () => ({
  frameMs,
  running: live.filter((o) => o.visible && !o.paused && !o.halted).length,
  total: live.length,
});
