// The Rayworld half of EditWorlds: the frustum seen from above, its fan of rays, and the
// observation history (rays across, time down), as the paper's figure 4a draws them. An episode
// plays at a calm pace, then the next one starts. Each makes the paper's edit at frame 20 by
// itself until the visitor makes one. A visitor teleports a disc by dragging it, or by tapping it
// and then tapping where it should go; its velocity is kept. Cyan marks where it was, magenta
// where it went (figure 9). A drop the world does not allow is refused; a drop that later runs a
// disc into a wall or into the other disc ends the episode where the world breaks.
// - on the shared loop (paused offscreen, in hidden tabs, and whenever nothing moves)
// - a finger acts on a tap, so a swipe that scrolls the page past the world never changes it;
//   only a finger that lands on a disc holds the page still, to drag it
// - STILL: the whole episode is shown at its edit frame; edits rewrite its future at once

import { living, STILL, TIER } from "../../frame/live";
import { clamp } from "../../frame/util";
import { fit, local, localTouch, SLOP, type Tones, u32 } from "./demo-draw";
import * as R from "./rayworld";

export const RAY_VARIANTS = ["standard", "blink", "16-ray", "8-ray", "5-ray"] as const;
export type RayVariant = (typeof RAY_VARIANTS)[number];
/** Variants whose appearance bins are few enough to draw (the paper's 77, 30 and 14). */
export const binnable = (v: RayVariant) => v === "16-ray" || v === "8-ray" || v === "5-ray";

/** Episode frames per second. */
const RATE = 7;
/** Milliseconds held on the last frame, and on a broken world, before the next episode. */
const HOLD_END = 1500;
const HOLD_BREAK = 2400;
/** How long a refused drop stays marked. */
const REFUSE_MS = 700;
/** Arrow-key step, in world units (Shift: four times). */
const STEP = 0.25;
/** Draws tried for a legible automatic edit. */
const PLAN_TRIES = 32;
/** The first episode, chosen so the two discs cross in the history, as in figure 4a. */
const FIRST_SEED = 65;

const INK = "236,233,226";
/** The paper's grey map: reflectivity 0..1 to grey 0..255. */
const grey = (r: number) => Math.round(clamp(r, 0, 1) * 255);
const DISC = [grey(R.REFLECTIVITY[0]), grey(R.REFLECTIVITY[1])];
const EDIT_LINE = "#c8c4bb";

export type RayReport = {
  /** frames observed so far (1..frames) */
  readonly frame: number;
  readonly frames: number;
  readonly rays: number;
  /** appearance bins drawn (0 when the overlay is off) */
  readonly bins: number;
  readonly running: boolean;
  /** the world broke: a disc reached a wall, or the discs came too close */
  readonly broken: "wall" | "disc" | null;
  /** the disc being moved, or -1 */
  readonly holding: number;
};

export type RayEvent =
  | { kind: "pick"; disc: number }
  | { kind: "edit"; disc: number; holds: boolean }
  | { kind: "refused"; disc: number }
  | { kind: "broken"; cause: "wall" | "disc" };

export type RayOptions = {
  variant: RayVariant;
  bins: boolean;
  paused: boolean;
  tones: Tones;
  report: (r: RayReport) => void;
  announce: (e: RayEvent) => void;
};

export type RayDemo = {
  setVariant: (v: RayVariant) => void;
  setBins: (on: boolean) => void;
  setPaused: (p: boolean) => void;
  /** A new episode now. */
  renew: () => void;
  dispose: () => void;
};

/** An edit as drawn: where the disc was and where it went, at time t. */
type Mark = { disc: number; t: number; from: number; ox: number; oz: number; x: number; z: number };

/** The episode's own edit at frame 20, chosen ahead. */
type Plan = { disc: number; x: number; z: number };

type Grab = {
  disc: number;
  /** press: down on a disc; drag: moving it; select: picked by a tap, waiting for a place;
   * key: picked from the keyboard */
  how: "press" | "drag" | "select" | "key";
  pointer: number;
  /** a press on the frustum while a disc is picked: drop on release (a finger: if it taps) */
  pending: boolean;
  /** where the press began */
  px: number;
  py: number;
  /** where the disc is at t, and its straight lines before the grab */
  ox: number;
  oz: number;
  snap: R.Anchor[];
  /** the place asked for, and the valid place the ghost takes (snapped near walls) */
  rx: number;
  rz: number;
  gx: number;
  gz: number;
  ok: boolean;
  moved: boolean;
  ed: R.Edit | null;
};

type Layout = {
  d: number;
  W: number;
  H: number;
  /** world to canvas: X = cx + x s, Y = ay − z s */
  cx: number;
  ay: number;
  s: number;
  barY: number;
  barH: number;
  hx: number;
  hy: number;
  k: number;
  rowH: number;
  histW: number;
  histH: number;
  lw: number;
};

const NONE: R.Break = {
  frame: Number.POSITIVE_INFINITY,
  time: Number.POSITIVE_INFINITY,
  cause: null,
};

export function rayDemo(cv: HTMLCanvasElement, opts: RayOptions): RayDemo {
  const ctx = cv.getContext("2d") as CanvasRenderingContext2D;
  const hc = document.createElement("canvas");
  const hctx = hc.getContext("2d") as CanvasRenderingContext2D;
  const T = opts.tones;

  let name = opts.variant;
  let v = R.VARIANTS[name];
  let seed = FIRST_SEED;
  let ep = R.sampleEpisode(R.makeRng(seed), v);
  let t = STILL ? R.EDIT_FRAME : 0;
  let hold = 0;
  let brk: R.Break = NONE;
  let broken = false;
  let marks: Mark[] = [];
  /** episodes edit themselves until the visitor makes an edit */
  let auto = true;
  let plan: Plan | null = null;
  let grab: Grab | null = null;
  let hover = -1;
  let refuse: { x: number; z: number } | null = null;
  let refuseTimer = 0;
  let paused = opts.paused;
  let started = false;
  let bins = opts.bins;
  let histDirty = true;
  let L: Layout | null = null;
  let live = new Float32Array(v.rays);
  let liveHit = new Int8Array(v.rays);
  let liveDepth = new Float32Array(v.rays);
  const P = new Float64Array(4);
  let lastReport = "";

  const running = () => !STILL && !paused && started;

  // ---------- the episode ----------

  function newEpisode(nextSeed = true) {
    if (nextSeed) seed = (seed * 7919 + 104729) % 2147483647;
    ep = R.sampleEpisode(R.makeRng(seed), v);
    t = STILL ? R.EDIT_FRAME : 0;
    hold = 0;
    brk = NONE;
    broken = false;
    marks = [];
    grab = null;
    hover = -1;
    histDirty = true;
    if (live.length !== v.rays) {
      live = new Float32Array(v.rays);
      liveHit = new Int8Array(v.rays);
      liveDepth = new Float32Array(v.rays);
    }
    planEdit();
    syncLoop();
    setCursor();
  }

  /** The episode's own edit: chosen now, made at frame 20 (at once under STILL). */
  function planEdit() {
    plan = auto ? choosePlan() : null;
    if (STILL) autoEdit();
  }

  /** The paper's edit at frame 20 (a random disc to a random spot from which the rest of the
   * episode stays valid), drawn until it is legible: the disc seen before and after, and its run
   * of rays moved well across the image, clear of where it was (as the Papers widget chooses). */
  function choosePlan(): Plan | null {
    const n = v.rays;
    const at = R.EDIT_FRAME * n;
    const before = ep.hit.subarray(at, at + n);
    const p0 = ep.pos.subarray(0, 4);
    const r = R.makeRng(seed + 1);
    let best = -1;
    let out: Plan | null = null;
    for (let i = 0; i < PLAN_TRIES; i++) {
      const trial = R.makeEpisode(v, p0, ep.vel, { frames: ep.frames, shown: ep.shown });
      const e = R.randomTeleport(r, trial, R.EDIT_FRAME);
      if (!e) continue;
      const j = e.disc;
      const after = trial.hit.subarray(at, at + n);
      let a = 0;
      let na = 0;
      let b = 0;
      let nb = 0;
      let both = 0;
      for (let k = 0; k < n; k++) {
        if (before[k] === j) {
          a += k;
          na++;
        }
        if (after[k] === j) {
          b += k;
          nb++;
          if (before[k] === j) both++;
        }
      }
      const score = na && nb ? (Math.abs(b / nb - a / na) / n) * (1 - both / nb) : 0;
      if (score > best) {
        best = score;
        out = { disc: j, x: e.x, z: e.z };
      }
      if (score > 0.3) break;
    }
    return out;
  }

  /** Make the planned edit, marked as a visitor's is. */
  function autoEdit() {
    const p = plan;
    plan = null;
    if (!p) return;
    R.stateAt(ep, R.EDIT_FRAME, P);
    const ox = P[2 * p.disc];
    const oz = P[2 * p.disc + 1];
    const ed = R.teleport(ep, p.disc, R.EDIT_FRAME, p.x, p.z);
    marks.push({ disc: p.disc, t: R.EDIT_FRAME, from: ed.from, ox, oz, x: p.x, z: p.z });
    brk = R.breakAt(ep, R.EDIT_FRAME);
    histDirty = true;
  }

  /** Rows of the history the visitor has seen: every row under STILL, else up to now. */
  function rowsShown() {
    if (STILL) return Math.min(ep.frames, brk.frame);
    const upTo = Math.min(Math.floor(t + 1e-9) + 1, ep.frames);
    return Math.min(upTo, brk.frame);
  }

  function report() {
    const r: RayReport = {
      frame: Math.min(ep.frames, STILL ? Math.floor(t) + 1 : rowsShown()),
      frames: ep.frames,
      rays: v.rays,
      bins: bins && binnable(name) ? R.appearanceBins(v).count : 0,
      running: running(),
      broken: broken ? (brk.cause ?? "wall") : null,
      holding: grab ? grab.disc : -1,
    };
    const key = JSON.stringify(r);
    if (key === lastReport) return;
    lastReport = key;
    opts.report(r);
  }

  function advance(dt: number) {
    if (hold > 0) {
      hold -= dt;
      if (hold <= 0) newEpisode();
      return;
    }
    const t1 = t + (dt * RATE) / 1000;
    if (plan && t1 >= R.EDIT_FRAME) autoEdit();
    if (t1 >= brk.time) {
      t = brk.time;
      broken = true;
      hold = HOLD_BREAK;
      opts.announce({ kind: "broken", cause: brk.cause ?? "wall" });
    } else if (t1 >= ep.frames - 1) {
      t = ep.frames - 1;
      hold = HOLD_END;
    } else {
      t = t1;
    }
  }

  // ---------- edits ----------

  function other(disc: number) {
    R.stateAt(ep, t, P);
    return [P[2 * (1 - disc)], P[2 * (1 - disc) + 1]];
  }

  function startGrab(disc: number, how: Grab["how"], pointer = -1, px = 0, py = 0) {
    R.stateAt(ep, t, P);
    const ox = P[2 * disc];
    const oz = P[2 * disc + 1];
    grab = {
      disc,
      how,
      pointer,
      pending: false,
      px,
      py,
      ox,
      oz,
      snap: ep.anchors[disc].slice(),
      rx: ox,
      rz: oz,
      gx: ox,
      gz: oz,
      ok: true,
      moved: false,
      ed: null,
    };
    if (how !== "press") opts.announce({ kind: "pick", disc });
  }

  /** Undo the preview: the disc back on its old line. */
  function unpreview(g: Grab) {
    const list = ep.anchors[g.disc];
    R.teleport(ep, g.disc, t, g.ox, g.oz);
    list.length = 0;
    list.push(...g.snap);
    brk = R.breakAt(ep, t);
    g.ed = null;
    histDirty = true;
  }

  /** Move the ghost toward (x, z): snapped onto the nearest valid place when that is close,
   * refused otherwise. A valid ghost is a real teleport, so the future it implies is exact. */
  function aim(x: number, z: number) {
    const g = grab;
    if (!g || !L) return;
    g.rx = x;
    g.rz = z;
    const [px, pz] = other(g.disc);
    let ok = R.inside(v, x, z) && R.apart(v, x, z, px, pz);
    if (!ok) {
      const [sx, sz] = R.clampPosition(v, x, z, px, pz);
      const tol = Math.max(0.35, (10 * L.d) / L.s);
      if (Math.hypot(sx - x, sz - z) <= tol) {
        x = sx;
        z = sz;
        ok = true;
      }
    }
    g.gx = x;
    g.gz = z;
    g.ok = ok;
    if (ok) {
      g.ed = R.teleport(ep, g.disc, t, x, z);
      brk = R.breakAt(ep, t);
      histDirty = true;
    } else if (g.ed) {
      unpreview(g);
    }
  }

  function commit() {
    const g = grab;
    if (!g) return;
    grab = null;
    if (!g.ok || !g.ed || (Math.abs(g.gx - g.ox) < 1e-9 && Math.abs(g.gz - g.oz) < 1e-9)) {
      if (g.ed) unpreview(g);
      if (!g.ok) refused(g.rx, g.rz, g.disc);
      after();
      return;
    }
    // the visitor's edit replaces the episode's own, here and in the episodes after
    auto = false;
    plan = null;
    const prev = marks.find((m) => m.disc === g.disc && m.t === t);
    if (prev) {
      prev.x = g.gx;
      prev.z = g.gz;
    } else {
      marks.push({ disc: g.disc, t, from: g.ed.from, ox: g.ox, oz: g.oz, x: g.gx, z: g.gz });
    }
    brk = R.breakAt(ep, t);
    if (broken && !(brk.time <= t)) {
      broken = false;
      hold = 0;
    }
    opts.announce({ kind: "edit", disc: g.disc, holds: brk.frame >= ep.frames });
    after();
  }

  function cancel() {
    const g = grab;
    if (!g) return;
    grab = null;
    if (g.ed) unpreview(g);
    after();
  }

  /** The ghost back on the disc, still in hand. */
  function rest(g: Grab) {
    if (g.ed) unpreview(g);
    g.rx = g.gx = g.ox;
    g.rz = g.gz = g.oz;
    g.ok = true;
  }

  function refused(x: number, z: number, disc: number) {
    refuse = { x, z };
    clearTimeout(refuseTimer);
    refuseTimer = window.setTimeout(() => {
      refuse = null;
      draw();
    }, REFUSE_MS);
    opts.announce({ kind: "refused", disc });
  }

  function after() {
    syncLoop();
    draw();
  }

  // ---------- layout and drawing ----------

  function layout(): Layout {
    const d = cv.width / Math.max(1, cv.clientWidth);
    const W = cv.width;
    const H = cv.height;
    const top = Math.round(36 * d);
    const bot = Math.round(46 * d);
    const pad = Math.round(14 * d);
    const gap = Math.round(24 * d);
    const rowH = Math.max(1, Math.floor((H - top - bot) / ep.frames));
    const histH = rowH * ep.frames;
    const n = v.rays;
    const want = clamp((W / d) * 0.26, 100, 150) * d;
    const k = Math.max(1, Math.round(want / n));
    const histW = k * n;
    const barH = Math.max(4, Math.round(8 * d));
    const barGap = Math.round(8 * d);
    const room = W - 2 * pad - gap - histW;
    const s = Math.max(
      1,
      Math.min((histH - barH - barGap) / R.FAR, room / (2 * R.FAR * R.SCALE + 0.4)),
    );
    const fw = 2 * R.FAR * R.SCALE * s;
    const left = Math.round((W - (fw + gap + histW)) / 2);
    const barY = top;
    return {
      d,
      W,
      H,
      cx: left + fw / 2,
      ay: Math.round(barY + barH + barGap + R.FAR * s),
      s,
      barY,
      barH,
      hx: Math.round(left + fw + gap),
      hy: top,
      k,
      rowH,
      histW,
      histH,
      lw: Math.max(1, Math.round(d)),
    };
  }

  const X = (x: number) => (L as Layout).cx + x * (L as Layout).s;
  const Y = (z: number) => (L as Layout).ay - z * (L as Layout).s;

  function paintHistory() {
    const n = v.rays;
    if (hc.width !== n || hc.height !== ep.frames) {
      hc.width = n;
      hc.height = ep.frames;
    }
    const img = hctx.createImageData(n, ep.frames);
    const buf = new Uint32Array(img.data.buffer);
    for (let i = 0; i < buf.length; i++) {
      const g = grey(ep.obs[i]);
      buf[i] = u32(g, g, g);
    }
    hctx.putImageData(img, 0, 0);
    histDirty = false;
  }

  function ring(x: number, z: number, rr: number, color: string, width: number, dash?: number[]) {
    ctx.beginPath();
    ctx.arc(X(x), Y(z), rr, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash ?? []);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // The appearance bins (figure 4d): a disc lights ray k when its centre lies within r of that
  // ray's line, so the bins are the cells that the lines at ±r beside every ray cut from the region
  // centres may occupy (exact, and straight). Crossing one of those lines turns one ray on or off
  // at an end of the lit run, so first + last changes by one: its parity two-colours the bins.
  type Tile = { poly: number[][]; odd: boolean };
  const tileCache = new Map<R.Variant, Tile[]>();
  function tiles(): Tile[] {
    let out = tileCache.get(v);
    if (out) return out;
    out = [];
    const seen = new Set<number>();
    const far = R.reach(v)[2];
    const hf = far[0];
    const zf = far[1];
    const zn = R.NEAR + v.radius;
    const N = 320;
    for (let a = 0; a <= N; a++) {
      const z = zn + ((zf - zn) * a) / N;
      for (let b = 0; b <= N; b++) {
        const x = -hf + (2 * hf * b) / N;
        if (!R.inside(v, x, z)) continue;
        const [first, width] = R.appearance(v, x, z);
        if (width <= 0) continue;
        const key = first * 1024 + width;
        if (seen.has(key)) continue;
        seen.add(key);
        const poly = binCell(x, z);
        if (poly.length > 2) out.push({ poly, odd: (width & 1) === 0 });
      }
    }
    tileCache.set(v, out);
    return out;
  }

  /** The bin (cell) a centre at (x, z) sits in, as a polygon. */
  function binCell(x: number, z: number): number[][] {
    let poly: number[][] = R.reach(v).map(([a, b]) => [a, b]);
    const { dx, dz } = R.fan(v);
    const r = v.radius;
    const cut = (nx: number, nz: number, c: number) => {
      // keep n·p ≥ c
      const out: number[][] = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const da = nx * a[0] + nz * a[1] - c;
        const db = nx * b[0] + nz * b[1] - c;
        if (da >= 0) out.push(a);
        if (da >= 0 !== db >= 0) {
          const u = da / (da - db);
          out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
        }
      }
      poly = out;
    };
    for (let k = 0; k < v.rays && poly.length > 2; k++) {
      const nx = dz[k];
      const nz = -dx[k];
      const q = nx * x + nz * z;
      if (q > r) cut(nx, nz, r);
      else if (q < -r) cut(-nx, -nz, r);
      else {
        cut(-nx, -nz, -r);
        cut(nx, nz, -r);
      }
    }
    return poly;
  }

  function fillCell(x: number, z: number, fill: string | null, stroke: string | null, lw: number) {
    const poly = binCell(x, z);
    if (poly.length < 3) return;
    ctx.beginPath();
    path(poly);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  }

  function path(poly: number[][]) {
    poly.forEach(([a, b], i) => {
      if (i) ctx.lineTo(X(a), Y(b));
      else ctx.moveTo(X(a), Y(b));
    });
    ctx.closePath();
  }

  function drawBins(lay: Layout, pos: Float64Array) {
    ctx.beginPath();
    path(R.reach(v));
    ctx.fillStyle = `rgba(${INK},0.035)`;
    ctx.fill();
    ctx.beginPath();
    for (const tile of tiles()) if (tile.odd) path(tile.poly);
    ctx.fillStyle = `rgba(${INK},0.1)`;
    ctx.fill();
    for (let j = 0; j < 2; j++) {
      if (grab && grab.disc === j) continue;
      const g = DISC[j];
      fillCell(pos[2 * j], pos[2 * j + 1], `rgba(${g},${g},${g},0.3)`, null, 0);
    }
    if (grab) {
      fillCell(grab.ox, grab.oz, null, T.pre, lay.lw * 1.5);
      if (grab.ok) fillCell(grab.gx, grab.gz, `rgba(${INK},0.12)`, T.post, lay.lw * 1.5);
    }
  }

  function draw() {
    if (!L) return;
    const lay = L;
    const { d, s, lw } = lay;
    ctx.clearRect(0, 0, lay.W, lay.H);
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    const pos = R.stateAt(ep, t, new Float64Array(4));
    const f = Math.max(0, Math.min(ep.frames - 1, Math.floor(t + 1e-9)));
    const shown = R.shownAt(ep, f);
    const n = v.rays;
    const F = R.fan(v);
    const half = R.SCALE * R.FAR;
    const showBins = bins && binnable(name);

    if (showBins) drawBins(lay, pos);

    // the frustum: the walls from the observer, the near and far edges
    const farY = Math.round(Y(R.FAR));
    const nearY = Math.round(Y(R.NEAR));
    const o = lw / 2;
    ctx.strokeStyle = `rgba(${INK},0.34)`;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(X(-half), farY + o);
    ctx.lineTo(X(half), farY + o);
    ctx.moveTo(X(-R.SCALE * R.NEAR), nearY + o);
    ctx.lineTo(X(R.SCALE * R.NEAR), nearY + o);
    ctx.moveTo(X(-half), farY + o);
    ctx.lineTo(X(0), Y(0));
    ctx.lineTo(X(half), farY + o);
    ctx.stroke();

    // the rays: each to the disc it meets, or to the far edge
    R.renderAt(ep, t, live, liveHit, liveDepth);
    const step = (2 * half) / (v.cast - 1);
    if (n > 32) drawDense(lay, F, step / R.FAR, nearY);
    else {
      // a few rays: each one a line, from the observer to what it meets
      for (const want of [-1, 0, 1]) {
        ctx.beginPath();
        for (let k = 0; k < n; k++) {
          const id = liveHit[k] < 0 ? -1 : liveHit[k];
          if (id !== want || (id < 0 && showBins)) continue;
          const z1 = id < 0 ? R.FAR : liveDepth[k];
          const a = F.slope[k];
          ctx.moveTo(X(0), Y(0));
          ctx.lineTo(X(a * z1), Y(z1));
        }
        if (want < 0) ctx.strokeStyle = `rgba(${INK},0.2)`;
        else {
          const g = DISC[want];
          ctx.strokeStyle = `rgba(${g},${g},${g},0.85)`;
        }
        ctx.lineWidth = lw;
        ctx.stroke();
      }
    }

    // the observation now, along the far edge: each ray's value where it crosses it
    ctx.fillStyle = "#000";
    const bx0 = Math.round(X(F.slope[0] * R.FAR - step / 2));
    const bx1 = Math.round(X(F.slope[n - 1] * R.FAR + step / 2));
    ctx.fillRect(bx0, lay.barY, bx1 - bx0, lay.barH);
    for (let k = 0; k < n; k++) {
      const g = grey(live[k]);
      if (!g) continue;
      const xa = Math.round(X(F.slope[k] * R.FAR - step / 2));
      const xb = Math.round(X(F.slope[k] * R.FAR + step / 2));
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.fillRect(xa, lay.barY, Math.max(1, xb - xa), lay.barH);
    }
    ctx.strokeStyle = `rgba(${INK},0.22)`;
    ctx.lineWidth = lw;
    ctx.strokeRect(bx0 - o, lay.barY - o, bx1 - bx0 + lw, lay.barH + lw);

    // edits: cyan where a disc was, magenta where it went
    const rr = v.radius * s;
    const mw = Math.max(1.5, 1.5 * d);
    for (const m of marks) {
      ring(m.ox, m.oz, rr, T.pre, mw);
      ring(m.x, m.z, rr, T.post, mw);
    }

    // the discs, with their velocities (a teleport keeps them)
    for (let j = 0; j < 2; j++) {
      const x = pos[2 * j];
      const z = pos[2 * j + 1];
      const g = DISC[j];
      const vis = (shown >> j) & 1;
      if (vis) {
        ctx.beginPath();
        ctx.arc(X(x), Y(z), rr, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${g},${g},${g})`;
        ctx.fill();
      } else {
        ring(x, z, rr - lw / 2, `rgba(${g},${g},${g},0.9)`, lw, [2 * d, 2 * d]);
      }
      const vx = ep.vel[2 * j];
      const vz = ep.vel[2 * j + 1];
      const sp = Math.hypot(vx, vz);
      if (sp > 0) {
        const ux = vx / sp;
        const uz = vz / sp;
        const len = sp * 8;
        const ax = x + ux * (v.radius + 0.12);
        const az = z + uz * (v.radius + 0.12);
        const bx = ax + ux * len;
        const bz = az + uz * len;
        ctx.strokeStyle = `rgba(${g},${g},${g},${vis ? 0.9 : 0.6})`;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(X(ax), Y(az));
        ctx.lineTo(X(bx), Y(bz));
        const h = 4 * d;
        const px = -uz;
        const pz = ux;
        ctx.moveTo(X(bx) - ux * h + px * h * 0.6, Y(bz) + uz * h - pz * h * 0.6);
        ctx.lineTo(X(bx), Y(bz));
        ctx.lineTo(X(bx) - ux * h - px * h * 0.6, Y(bz) + uz * h + pz * h * 0.6);
        ctx.stroke();
      }
      if (hover === j && !grab) ring(x, z, rr + 4 * d, `rgba(${INK},0.75)`, lw);
      if (grab && grab.disc === j && grab.how !== "drag") {
        ring(grab.ox, grab.oz, rr + 4 * d, `rgba(${INK},0.75)`, lw);
      }
    }

    // a broken world: the disc(s) that broke it
    if (broken) {
      const bf = Math.min(ep.frames - 1, brk.frame);
      const q = ep.pos.subarray(4 * bf, 4 * bf + 4);
      for (let j = 0; j < 2; j++) {
        const bad =
          brk.cause === "disc" ||
          !R.inside(v, q[2 * j], q[2 * j + 1]) ||
          !R.inside(v, pos[2 * j], pos[2 * j + 1]);
        if (bad) ring(pos[2 * j], pos[2 * j + 1], rr + 4 * d, T.bad, mw);
      }
    }

    drawHistory(lay, f);

    // a disc in hand: where it was (cyan), where it would go (magenta) and the line it would
    // then follow, to the end or to where the world breaks. Over the history, so a drop refused
    // there is seen.
    if (grab && (grab.how !== "press" || grab.moved)) {
      ring(grab.ox, grab.oz, rr, T.pre, mw);
      if (grab.ok) {
        ring(grab.gx, grab.gz, rr, T.post, mw);
        const vx = ep.vel[2 * grab.disc];
        const vz = ep.vel[2 * grab.disc + 1];
        const end = Math.min(ep.frames - 1, brk.time);
        const ex = grab.gx + vx * (end - t);
        const ez = grab.gz + vz * (end - t);
        ctx.setLineDash([2 * d, 3 * d]);
        ctx.strokeStyle = T.post;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(X(grab.gx), Y(grab.gz));
        ctx.lineTo(X(ex), Y(ez));
        ctx.stroke();
        ctx.setLineDash([]);
        const bp = breakPoints();
        for (let i = 0; i < bp.length; i += 2) cross(X(bp[i]), Y(bp[i + 1]), 5 * d, T.bad, mw);
      } else {
        ring(grab.rx, grab.rz, rr, T.bad, mw, [3 * d, 3 * d]);
      }
    }
    if (refuse) ring(refuse.x, refuse.z, rr, T.bad, mw, [3 * d, 3 * d]);
    // a still world shows its whole future, so also where an edit will break it
    if (STILL && !grab) {
      const bp = breakPoints();
      for (let i = 0; i < bp.length; i += 2) cross(X(bp[i]), Y(bp[i + 1]), 5 * d, T.bad, mw);
    }
  }

  /** Many rays: too close to draw one by one near the observer (they would shimmer), so the
   * misses thin out toward the near edge and each run of rays that meets a disc is one solid
   * beam, stepped where each ray stops on the disc's surface. */
  function drawDense(lay: Layout, F: R.Fan, hs: number, nearY: number) {
    const n = v.rays;
    const g0 = ctx.createLinearGradient(0, nearY, 0, Y(8));
    g0.addColorStop(0, `rgba(${INK},0)`);
    g0.addColorStop(1, `rgba(${INK},0.075)`);
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      if (liveHit[k] >= 0) continue;
      const a = F.slope[k];
      ctx.moveTo(X(a * R.NEAR), Y(R.NEAR));
      ctx.lineTo(X(a * R.FAR), Y(R.FAR));
    }
    ctx.strokeStyle = g0;
    ctx.lineWidth = Math.max(1, lay.lw * 0.5);
    ctx.stroke();
    // the funnel between the observer and the near edge
    ctx.beginPath();
    ctx.moveTo(X(-R.SCALE * R.NEAR), nearY + lay.lw);
    ctx.lineTo(X(R.SCALE * R.NEAR), nearY + lay.lw);
    ctx.lineTo(X(0), Y(0));
    ctx.closePath();
    ctx.fillStyle = `rgba(${INK},0.03)`;
    ctx.fill();
    // beams: runs of neighbouring rays on the same disc
    const h = hs / 2;
    for (let k = 0; k < n; ) {
      const id = liveHit[k];
      if (id < 0) {
        k++;
        continue;
      }
      let e = k;
      while (e + 1 < n && liveHit[e + 1] === id) e++;
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0));
      for (let q = e; q >= k; q--) {
        const z = liveDepth[q];
        ctx.lineTo(X((F.slope[q] + h) * z), Y(z));
        ctx.lineTo(X((F.slope[q] - h) * z), Y(z));
      }
      ctx.closePath();
      const g = DISC[id];
      ctx.fillStyle = `rgba(${g},${g},${g},0.26)`;
      ctx.fill();
      k = e + 1;
    }
  }

  /** Where the world breaks, if it does: the disc that reaches a wall, or the point between two
   * discs that come too close. Flat [x, z, ...]. */
  function breakPoints(): number[] {
    if (!(brk.time < ep.frames)) return [];
    const q = R.stateAt(ep, brk.time, new Float64Array(4));
    if (brk.cause === "disc") return [(q[0] + q[2]) / 2, (q[1] + q[3]) / 2];
    const bf = Math.min(ep.frames - 1, brk.frame);
    const pf = ep.pos.subarray(4 * bf, 4 * bf + 4);
    const out: number[] = [];
    for (let j = 0; j < 2; j++)
      if (!R.inside(v, pf[2 * j], pf[2 * j + 1])) out.push(q[2 * j], q[2 * j + 1]);
    return out;
  }

  function cross(x: number, y: number, h: number, color: string, width: number) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x - h, y - h);
    ctx.lineTo(x + h, y + h);
    ctx.moveTo(x + h, y - h);
    ctx.lineTo(x - h, y + h);
    ctx.stroke();
  }

  function drawHistory(lay: Layout, f: number) {
    const { hx, hy, k, rowH, histW, histH, lw, d } = lay;
    if (histDirty) paintHistory();
    const rows = rowsShown();
    ctx.fillStyle = "#000";
    ctx.fillRect(hx, hy, histW, histH);
    ctx.imageSmoothingEnabled = false;
    if (rows > 0) ctx.drawImage(hc, 0, 0, v.rays, rows, hx, hy, histW, rows * rowH);
    const o = lw / 2;
    ctx.strokeStyle = `rgba(${INK},0.22)`;
    ctx.lineWidth = lw;
    ctx.strokeRect(hx - o, hy - o, histW + lw, histH + lw);

    // edit rows (dashed) and the edited disc's ray centres before and after (figure 9)
    const lineAt = (x: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(hx + x * k - lw / 2), hy, lw, histH);
    };
    const centre = (x: number, z: number) => {
      const [first, width] = R.appearance(v, x, z);
      return width > 0 ? first + width / 2 : -1;
    };
    const edits: { from: number; ox: number; oz: number; x: number; z: number }[] = marks.slice();
    if (grab?.ok && grab.ed && (grab.how !== "press" || grab.moved)) {
      edits.push({ from: grab.ed.from, ox: grab.ox, oz: grab.oz, x: grab.gx, z: grab.gz });
    }
    for (const m of edits) {
      const a = centre(m.ox, m.oz);
      const b = centre(m.x, m.z);
      if (a >= 0) lineAt(a, T.pre);
      if (b >= 0) lineAt(b, T.post);
      const y = Math.round(hy + m.from * rowH - lw / 2);
      ctx.fillStyle = EDIT_LINE;
      const dash = Math.max(2, Math.round(3 * d));
      for (let x = hx; x < hx + histW; x += dash * 2) {
        ctx.fillRect(x, y, Math.min(dash, hx + histW - x), lw);
      }
    }
    if ((broken || STILL) && brk.frame < ep.frames) {
      ctx.fillStyle = T.bad;
      ctx.fillRect(hx, Math.round(hy + brk.frame * rowH - lw / 2), histW, lw);
    }

    // now: a small notch beside the row being observed
    const ny = hy + (f + 0.5) * rowH;
    const nh = Math.max(3 * d, Math.min(5 * d, rowH));
    ctx.fillStyle = `rgba(${INK},0.8)`;
    ctx.beginPath();
    ctx.moveTo(hx - 3 * d, ny);
    ctx.lineTo(hx - 3 * d - nh, ny - nh / 1.6);
    ctx.lineTo(hx - 3 * d - nh, ny + nh / 1.6);
    ctx.closePath();
    ctx.fill();
  }

  // ---------- pointer, touch and keys ----------

  const world = (px: number, py: number) => {
    const lay = L as Layout;
    return [(px - lay.cx) / lay.s, (lay.ay - py) / lay.s];
  };

  /** The disc under a point; a disc in hand counts where it was picked up. */
  function discAt(px: number, py: number) {
    if (!L) return -1;
    const pos = R.stateAt(ep, t, P);
    if (grab) {
      pos[2 * grab.disc] = grab.ox;
      pos[2 * grab.disc + 1] = grab.oz;
    }
    const reachPx = Math.max(v.radius * L.s, 12 * L.d) + 4 * L.d;
    let best = -1;
    let bd = Number.POSITIVE_INFINITY;
    for (let j = 0; j < 2; j++) {
      const dd = Math.hypot(px - X(pos[2 * j]), py - Y(pos[2 * j + 1]));
      if (dd <= reachPx && dd < bd) {
        bd = dd;
        best = j;
      }
    }
    return best;
  }

  function setCursor() {
    cv.style.cursor = grab
      ? grab.how === "drag"
        ? "grabbing"
        : grab.how === "press"
          ? "grabbing"
          : "crosshair"
      : hover >= 0
        ? "grab"
        : "";
  }

  /** A finger or pen that has moved too far to tap (the page is scrolling under it). */
  const strayed = (g: Grab, px: number, py: number) =>
    Math.hypot(px - g.px, py - g.py) > SLOP * (L as Layout).d;

  const down = (e: PointerEvent) => {
    if (e.button !== 0 || !L) return;
    // one pointer at a time: a second finger never takes a disc from the first
    if (grab && (grab.how === "press" || grab.how === "drag")) {
      if (e.pointerId !== grab.pointer) return;
      cancel();
    }
    const [px, py] = local(cv, e);
    const j = discAt(px, py);
    if (grab && (grab.how === "select" || grab.how === "key")) {
      if (j === grab.disc) {
        cancel();
        setCursor();
        return;
      }
      if (j < 0) {
        grab.pending = true;
        grab.pointer = e.pointerId;
        grab.px = px;
        grab.py = py;
        // a mouse aims at once; a finger or pen waits for its tap, as it may be scrolling
        if (e.pointerType === "mouse") {
          const [x, z] = world(px, py);
          grab.moved = true;
          aim(x, z);
          draw();
        }
        return;
      }
      cancel();
    }
    if (j < 0) return;
    startGrab(j, "press", e.pointerId, px, py);
    try {
      cv.setPointerCapture(e.pointerId);
    } catch {
      // capture is a nicety; dragging still works without it
    }
    syncLoop();
    setCursor();
    draw();
  };

  const move = (e: PointerEvent) => {
    if (!L) return;
    const [px, py] = local(cv, e);
    if (grab) {
      const mine = e.pointerId === grab.pointer;
      if (grab.how === "press") {
        if (!mine) return;
        if (Math.hypot(px - grab.px, py - grab.py) > 5 * L.d) {
          grab.how = "drag";
          grab.moved = true;
          opts.announce({ kind: "pick", disc: grab.disc });
        } else return;
      }
      if (e.pointerType !== "mouse") {
        if (grab.pending && mine && strayed(grab, px, py)) grab.pending = false;
        if (grab.how !== "drag" || !mine) return;
      }
      if (grab.how === "drag" ? mine : grab.how === "select") {
        const [x, z] = world(px, py);
        if (grab.how === "select") grab.moved = true;
        aim(x, z);
        draw();
      }
      return;
    }
    const h = e.pointerType === "mouse" ? discAt(px, py) : -1;
    if (h !== hover) {
      hover = h;
      setCursor();
      draw();
    }
  };

  const up = (e: PointerEvent) => {
    if (!grab || e.pointerId !== grab.pointer) return;
    const [px, py] = local(cv, e);
    if (grab.how === "press") {
      grab.how = "select";
      grab.pointer = -1;
      opts.announce({ kind: "pick", disc: grab.disc });
      report();
      setCursor();
      draw();
      return;
    }
    if (grab.how !== "drag" && !grab.pending) return;
    if (grab.how !== "drag" && e.pointerType !== "mouse") {
      // a finger's tap: the disc goes where it lifted
      if (strayed(grab, px, py)) {
        grab.pending = false;
        return;
      }
      const [x, z] = world(px, py);
      grab.moved = true;
      aim(x, z);
    }
    commit();
    // the pointer may have let go away from the disc it pressed
    hover = e.pointerType === "mouse" ? discAt(px, py) : -1;
    setCursor();
    draw();
  };

  const lost = (e: PointerEvent) => {
    if (!grab || e.pointerId !== grab.pointer) return;
    if (grab.how === "press" || grab.how === "drag") cancel();
    else if (grab.pending) {
      // a mouse had aimed where it pressed; a finger had not yet
      grab.pending = false;
      if (e.pointerType === "mouse") rest(grab);
      draw();
    }
    hover = -1;
    setCursor();
  };

  const leave = () => {
    if (hover >= 0) {
      hover = -1;
      setCursor();
      draw();
    }
  };

  // A finger on a disc drags it instead of scrolling the page; anywhere else the page scrolls.
  const touchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    const [px, py] = localTouch(cv, e.touches[0]);
    if (grab?.how === "press" || discAt(px, py) >= 0) e.preventDefault();
  };
  const touchMove = (e: TouchEvent) => {
    if (grab && (grab.how === "drag" || grab.how === "press")) e.preventDefault();
  };

  const key = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!grab) startGrab(1, "key");
      else if (!grab.moved) {
        const j = 1 - grab.disc;
        cancel();
        startGrab(j, "key");
      } else commit();
      syncLoop();
      draw();
      report();
      return;
    }
    if (e.key === "Escape" && grab) {
      e.preventDefault();
      cancel();
      report();
      return;
    }
    const dir: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    const m = dir[e.key];
    if (!m || !grab || grab.how === "press" || grab.how === "drag") return;
    e.preventDefault();
    const st = e.shiftKey ? STEP * 4 : STEP;
    // the step stops at the walls; past the other disc it goes on, refused while it overlaps
    const [x, z] = R.clampPosition(
      v,
      grab.rx + m[0] * st,
      grab.rz + m[1] * st,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    );
    const was = grab.ok;
    grab.moved = true;
    aim(x, z);
    if (was && !grab.ok) opts.announce({ kind: "refused", disc: grab.disc });
    draw();
  };

  const blur = () => {
    if (grab?.how === "key") cancel();
  };

  cv.addEventListener("pointerdown", down);
  cv.addEventListener("pointermove", move);
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", lost);
  cv.addEventListener("pointerleave", leave);
  cv.addEventListener("touchstart", touchStart, { passive: false });
  cv.addEventListener("touchmove", touchMove, { passive: false });
  cv.addEventListener("keydown", key);
  cv.addEventListener("blur", blur);

  // ---------- the loop ----------

  const loop = living({
    el: cv,
    fps: TIER === "A" ? 60 : TIER === "B" ? 30 : 24,
    budget: 4,
    paused: true,
    slow() {
      loop.fps = Math.max(15, Math.round(loop.fps * 0.66));
    },
    onVisible(visible) {
      if (visible && !started && !STILL) {
        started = true;
        syncLoop();
      }
      // a disc picked by a tap or a key is put back when the world scrolls away
      if (!visible && (grab?.how === "select" || grab?.how === "key")) cancel();
    },
    tick(dt) {
      if (!running() || grab) return;
      advance(dt);
      draw();
      report();
    },
  });

  function syncLoop() {
    loop.setPaused(!running() || !!grab);
    report();
  }

  const ro = new ResizeObserver(() => {
    fit(cv);
    L = layout();
    draw();
  });
  ro.observe(cv);
  planEdit();
  fit(cv);
  L = layout();
  draw();
  report();

  return {
    setVariant(next) {
      if (next === name) return;
      name = next;
      v = R.VARIANTS[next];
      newEpisode(false);
      L = layout();
      draw();
      report();
    },
    setBins(on) {
      bins = on;
      draw();
      report();
    },
    setPaused(p) {
      paused = p;
      if (!p) started = true;
      // Play runs the world: a disc in hand goes back
      if (!p && grab) cancel();
      syncLoop();
      setCursor();
    },
    renew() {
      newEpisode();
      L = layout();
      draw();
      report();
    },
    dispose() {
      loop.dispose();
      ro.disconnect();
      clearTimeout(refuseTimer);
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("pointercancel", lost);
      cv.removeEventListener("pointerleave", leave);
      cv.removeEventListener("touchstart", touchStart);
      cv.removeEventListener("touchmove", touchMove);
      cv.removeEventListener("keydown", key);
      cv.removeEventListener("blur", blur);
    },
  };
}
