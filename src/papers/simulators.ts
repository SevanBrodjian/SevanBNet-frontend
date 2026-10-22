// When Generative Models Act as Simulators: a simulator, and a generator driven by it. On the
// left, Rayworld (the paper's continuous world) seen from above: two discs drifting through a
// frustum watched by one fan of rays. On the right, the generator's frames, rays across and time
// down. Until frame 20 each frame the simulator renders goes into the generator (the faint wire);
// at frame 20 the world waits while a touch drags one disc to its new spot, the paper's edit (a
// teleport: cyan where it was, magenta where it went), and the edited state is written into the
// generator (the magenta wire), whose frames below the dashed line follow the edited world. A
// click in the frustum teleports the nearer disc to the
// nearest spot from which the rest of the episode stays valid (as the paper's edits do); Enter on
// the well makes a random one.
// This is a schematic of what a successful edit looks like, not the paper's results. In the paper
// a single write lands at the edit frame and falls back a step later; history rewriting (appendix
// A.10) is what holds an edit through a rollout, and that is the case drawn here. The trained
// model can't run in the browser, so the generator's frames are the simulator's own, drawn soft
// from the edit on.

import { living, STILL } from "../frame/live";
import { clamp } from "../frame/util";
import { local } from "../projects/simulators/demo-draw";
import {
  EDIT_FRAME,
  type Edit,
  type Episode,
  FAR,
  FRAMES,
  fan,
  makeEpisode,
  makeRng,
  NEAR,
  type Rng,
  randomTeleport,
  renderAt,
  renderFrame,
  SCALE,
  SEPARATION,
  sampleEpisode,
  shownAt,
  stateAt,
  teleport,
  VARIANTS,
  type Variant,
} from "../projects/simulators/rayworld";
import {
  type MountWidget,
  onControls,
  type Palette,
  type RGB,
  readPalette,
  rgba,
  Surface,
  type Widget,
} from "./kit";

const FRAME_MS = 105; // one world frame while playing
const HOLD_MS = 1500; // the finished record, before the next episode
// The episode's own edit, drawn as a hand would make it: a touch presses on the disc, drags it
// to where the edit puts it, and lifts, while the world waits.
const PRESS_MS = 320;
const DRAG_MS = 1000;
const LIFT_MS = 280;
const HAND_MS = PRESS_MS + DRAG_MS + LIFT_MS;

/** One edit as drawn: when and which disc, where it was and went, and its ray centres on the
 * edit row (the mean of the rays it vacates, and of the rays it lights; NaN if none). */
type Mark = {
  t: number;
  row: number;
  was: [number, number];
  went: [number, number];
  pre: number;
  post: number;
};

/** The paper's edit, chosen ahead for an episode (applied when the episode reaches frame 20). */
type Plan = { disc: number; x: number; z: number };

const little = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
const pack = (c: RGB) =>
  little
    ? ((255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0
    : ((c[0] << 24) | (c[1] << 16) | (c[2] << 8) | 255) >>> 0;
const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

let probe: CanvasRenderingContext2D | null = null;
/** A custom property of `el` as sRGB bytes. */
function cssRGB(el: HTMLElement, name: string, fallback: RGB): RGB {
  const span = document.createElement("span");
  span.style.display = "none";
  span.style.color = `var(${name})`;
  el.append(span);
  const css = getComputedStyle(span).color;
  span.remove();
  probe ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!probe || !css) return fallback;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = rgba(fallback);
  probe.fillStyle = css;
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}

type V2 = [number, number];
type Half = [number, number, number]; // a x + b z <= c

/** The valid spot nearest (x, z) for a disc moving at (vx, vz) from time t to the episode's
 * last frame `last`, whose partner sits at (ox, oz) at t and moves at (wx, wz): inside the
 * frustum and clear of its walls all the way (the frustum is convex, so both ends of the path
 * suffice), and never within SEPARATION diameters of the partner (the relative motion is a
 * line, so the forbidden starts form a capsule). Null if there is no such spot. */
function clampFuture(
  v: Variant,
  x: number,
  z: number,
  vx: number,
  vz: number,
  ox: number,
  oz: number,
  wx: number,
  wz: number,
  span: number,
): V2 | null {
  const r = v.radius;
  const e = 1e-5; // inside by this much, so the nudges below (1e-6 at most) stay inside
  const T: Half[] = [
    [0, -1, -(NEAR + r)],
    [0, 1, FAR - r],
    [1, -SCALE, -r],
    [-1, -SCALE, -r],
  ];
  const dx = vx * span;
  const dz = vz * span;
  const halves: Half[] = [];
  for (const [a, b, c] of T) {
    const m = e * Math.hypot(a, b);
    halves.push([a, b, c - m], [a, b, c - a * dx - b * dz - m]);
  }
  // the region: T, clipped by every half-plane (T shrunk, and T moved back along the path)
  let poly: V2[] = [
    [-(SCALE * (NEAR + r) - r), NEAR + r],
    [SCALE * (NEAR + r) - r, NEAR + r],
    [SCALE * (FAR - r) - r, FAR - r],
    [-(SCALE * (FAR - r) - r), FAR - r],
  ];
  for (const [a, b, c] of halves) {
    const next: V2[] = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const fp = a * p[0] + b * p[1] - c;
      const fq = a * q[0] + b * q[1] - c;
      if (fp <= 0) next.push(p);
      if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
        const s = fp / (fp - fq);
        next.push([p[0] + s * (q[0] - p[0]), p[1] + s * (q[1] - p[1])]);
      }
    }
    poly = next;
    if (poly.length < 3) return null;
  }
  const inPoly = (px: number, pz: number) =>
    halves.every(([a, b, c]) => a * px + b * pz <= c + 1e-6);
  // the capsule: starts that come within S of the partner at some time in [t, last]
  const S = SEPARATION * 2 * r;
  const ax = ox;
  const az = oz;
  const bx = ox - (vx - wx) * span;
  const bz = oz - (vz - wz) * span;
  const ux = bx - ax;
  const uz = bz - az;
  const uu = ux * ux + uz * uz;
  const axis = (px: number, pz: number): V2 => {
    const s = uu > 1e-18 ? Math.max(0, Math.min(1, ((px - ax) * ux + (pz - az) * uz) / uu)) : 0;
    return [ax + s * ux, az + s * uz];
  };
  const clear = (px: number, pz: number) => {
    const [cx, cz] = axis(px, pz);
    return Math.hypot(px - cx, pz - cz) >= S * (1 + 1e-9);
  };
  const out = (px: number, pz: number): V2 => {
    // push a point on the capsule's rim just outside it
    const [cx, cz] = axis(px, pz);
    let nx = px - cx;
    let nz = pz - cz;
    let l = Math.hypot(nx, nz);
    if (l < 1e-12) {
      nx = -uz;
      nz = ux;
      l = Math.hypot(nx, nz);
      if (l < 1e-12) {
        nx = 0;
        nz = 1;
        l = 1;
      }
    }
    const k = (S * (1 + 1e-7)) / l;
    return [cx + nx * k, cz + nz * k];
  };
  if (inPoly(x, z) && clear(x, z)) return [x, z];
  const cand: V2[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    cand.push(p);
    const ex = q[0] - p[0];
    const ez = q[1] - p[1];
    const ee = ex * ex + ez * ez;
    if (ee > 0) {
      const s = Math.max(0, Math.min(1, ((x - p[0]) * ex + (z - p[1]) * ez) / ee));
      cand.push([p[0] + s * ex, p[1] + s * ez]);
      // where this edge meets the capsule's rim: its two end circles and two sides
      for (const [cx, cz] of [
        [ax, az],
        [bx, bz],
      ]) {
        const fx = p[0] - cx;
        const fz = p[1] - cz;
        const B = fx * ex + fz * ez;
        const C = fx * fx + fz * fz - S * S;
        const D = B * B - ee * C;
        if (D < 0) continue;
        for (const sg of [-1, 1]) {
          const s2 = (-B + sg * Math.sqrt(D)) / ee;
          if (s2 >= 0 && s2 <= 1) cand.push(out(p[0] + s2 * ex, p[1] + s2 * ez));
        }
      }
      if (uu > 1e-18) {
        const ul = Math.sqrt(uu);
        for (const sg of [-1, 1]) {
          // side line: points with (pt - A)·n = sg S, n the axis normal
          const nx = -uz / ul;
          const nz = ux / ul;
          const den = ex * nx + ez * nz;
          if (Math.abs(den) < 1e-15) continue;
          const s2 = (sg * S - ((p[0] - ax) * nx + (p[1] - az) * nz)) / den;
          if (s2 < 0 || s2 > 1) continue;
          const px = p[0] + s2 * ex;
          const pz = p[1] + s2 * ez;
          const along = ((px - ax) * ux + (pz - az) * uz) / uu;
          if (along >= 0 && along <= 1) cand.push(out(px, pz));
        }
      }
    }
  }
  // the rim's nearest points to (x, z): the feet on both sides, and on both end circles
  cand.push(out(x, z));
  for (const [cx, cz] of [
    [ax, az],
    [bx, bz],
  ]) {
    const l = Math.hypot(x - cx, z - cz);
    if (l > 1e-12)
      cand.push([cx + ((x - cx) / l) * S * (1 + 1e-7), cz + ((z - cz) / l) * S * (1 + 1e-7)]);
  }
  if (uu > 1e-18) {
    const ul = Math.sqrt(uu);
    const nx = -uz / ul;
    const nz = ux / ul;
    const s = ((x - ax) * ux + (z - az) * uz) / uu;
    if (s >= 0 && s <= 1) {
      const fx = ax + s * ux;
      const fz = az + s * uz;
      for (const sg of [-1, 1])
        cand.push([fx + sg * nx * S * (1 + 1e-7), fz + sg * nz * S * (1 + 1e-7)]);
    }
  }
  let best: V2 | null = null;
  let bd = Number.POSITIVE_INFINITY;
  for (const [px, pz] of cand) {
    if (!inPoly(px, pz) || !clear(px, pz)) continue;
    const d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < bd) {
      bd = d;
      best = [px, pz];
    }
  }
  return best;
}

/** Mean index of the rays where `m` holds, or NaN. */
function centre(n: number, m: (k: number) => boolean) {
  let s = 0;
  let c = 0;
  for (let k = 0; k < n; k++)
    if (m(k)) {
      s += k;
      c++;
    }
  return c ? s / c : Number.NaN;
}

/** For a larger, slower showing (the project page's figure): `frameMs` per frame; `editHold`
 * ms, after the drag, with the edit made in the simulator but not yet written into the
 * generator (without one, its wire and EDIT show from the drag's start); `onPhase` hears 0
 * (running), 1 (the edit), 2 (written in; the generator carries on) or -1 (the still). */
export type StageOptions = {
  frameMs?: number;
  editHold?: number;
  onPhase?: (phase: number) => void;
};

export const mountStage = (host: HTMLElement, opts: StageOptions = {}): Widget => {
  const frameMs = opts.frameMs ?? FRAME_MS;
  const editHold = opts.editHold ?? 0;
  let phase = Number.NaN;
  const well = document.createElement("div");
  well.className = "pw-well live mx";
  host.append(well);

  let pal: Palette = readPalette(host);
  let pre: RGB = [68, 212, 226];
  let post: RGB = [244, 95, 176];
  let mono = "ui-monospace, monospace";
  const colours = () => {
    pal = readPalette(host);
    mono = getComputedStyle(host).getPropertyValue("--mono").trim() || mono;
    pre = cssRGB(host, "--sim-pre", pre);
    post = cssRGB(host, "--sim-post", post);
  };
  colours();

  // ---- the world
  const v: Variant = VARIANTS["128-ray"];
  let seed = 98; // a first episode whose edit reads at a glance
  let r: Rng = makeRng(seed);
  let p0 = new Float64Array(4);
  let vel = new Float64Array(4);
  let orig: Episode = sampleEpisode(r, v); // the episode unedited
  let ep: Episode = orig;
  let plan: Plan | null = null;
  let applied = false; // the plan has been carried out this run
  let marks: Mark[] = [];
  let t = 0; // frames
  let end = FRAMES - 1; // when this run stops: the last frame, or the moment the world breaks
  let limit = FRAMES; // rows the record may hold (the frames before a break)
  let shown = 0; // rows recorded so far
  let figure = true; // the still: the edit's moment over the whole record
  let transferred = true; // the latest edit has been written into the generator
  let wait = 0; // ms left before it is
  /** The episode's edit while it is drawn as a drag: disc j from `from` to `to`, `ms` in. */
  let drag: { j: number; from: V2; to: V2; ms: number } | null = null;
  let hold = 0;
  let on = false;
  let hover: [number, number] | null = null;
  const P = new Float64Array(4);
  const Q = new Float64Array(4);
  let row = new Float32Array(v.rays);
  let rowHit = new Int8Array(v.rays);
  let rowDepth = new Float32Array(v.rays);

  const surface = new Surface(
    well,
    "A schematic of a successful edit, drawn from the simulator because the trained model can't run in the browser. Left, the simulator: Rayworld seen from above, two discs and the fan of rays that sees them. Right, the generator's frames over time. At frame 20 a disc is teleported in the simulator and the edited state is written into the generator, whose frames then follow it, as the paper's history rewriting (appendix A.10) holds an edit through a rollout. Teleport a disc.",
    () => {
      layout();
      draw();
    },
  );
  const { ctx, canvas } = surface;
  // focusable: Enter (or Space) makes the paper's edit, for anyone without a pointer
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "button");
  canvas.style.touchAction = "pan-y";

  // the history, one pixel per ray and frame, and the current frame, scaled up without smoothing
  let hist = document.createElement("canvas");
  let hctx = hist.getContext("2d");
  let himg: ImageData | null = null;
  let hbuf = new Uint32Array(0);
  const strip = document.createElement("canvas");
  const sctx = strip.getContext("2d");
  let simg: ImageData | null = null;
  let sbuf = new Uint32Array(0);

  function sizeBuffers() {
    const R = v.rays;
    hist = document.createElement("canvas");
    hist.width = R;
    hist.height = FRAMES;
    hctx = hist.getContext("2d");
    himg = hctx ? hctx.createImageData(R, FRAMES) : null;
    hbuf = himg ? new Uint32Array(himg.data.buffer) : new Uint32Array(0);
    strip.width = R;
    strip.height = 1;
    simg = sctx ? sctx.createImageData(R, 1) : null;
    sbuf = simg ? new Uint32Array(simg.data.buffer) : new Uint32Array(0);
    row = new Float32Array(R);
    rowHit = new Int8Array(R);
    rowDepth = new Float32Array(R);
  }

  const shade = (val: number) => pack(mix(pal.well, pal.tx, val));

  /** Copy the recorded rows into the history image. Rows from the latest edit on stand for the
   * generator's own (the simulator's frames, drawn soft). */
  const val = new Float32Array(160);
  function paintHistory() {
    if (!himg || !hctx) return;
    const R = v.rays;
    const rows = Math.min(shown, limit);
    const m = marks.length ? marks[marks.length - 1] : null;
    const soft = m ? m.row : FRAMES;
    for (let f = 0; f < rows; f++) {
      for (let k = 0; k < R; k++) {
        const i = f * R + k;
        const h = ep.hit[i];
        val[k] = h === 0 || h === 1 || h < -1 ? ep.obs[i] : 0;
      }
      for (let k = 0; k < R; k++) {
        let c = val[k];
        if (f >= soft) {
          const l1 = val[Math.max(0, k - 1)];
          const l2 = val[Math.max(0, k - 2)];
          const r1 = val[Math.min(R - 1, k + 1)];
          const r2 = val[Math.min(R - 1, k + 2)];
          c = (l2 + 2 * l1 + 4 * c + 2 * r1 + r2) / 10;
        }
        hbuf[f * R + k] = shade(c);
      }
    }
    hctx.putImageData(himg, 0, 0);
  }

  // ---- episodes and edits

  /** A new episode, and the paper's edit for it at frame 20. */
  function begin(s: number) {
    seed = s;
    r = makeRng(seed);
    orig = sampleEpisode(r, v);
    p0 = orig.pos.slice(0, 4);
    vel = orig.vel.slice();
    choosePlan();
  }

  /** The paper's edit at frame 20 (a random disc to a random spot that keeps the episode
   * valid), drawn until it is legible: the disc seen before and after, and its run of rays
   * moved well across the image, clear of where it was. */
  function choosePlan() {
    const R = v.rays;
    const before = orig.hit.subarray(EDIT_FRAME * R, EDIT_FRAME * R + R);
    plan = null;
    let best = -1;
    for (let i = 0; i < 32; i++) {
      const trial = makeEpisode(v, p0, vel);
      const e = randomTeleport(r, trial, EDIT_FRAME);
      if (!e) continue;
      const j = e.disc;
      const after = trial.hit.subarray(EDIT_FRAME * R, EDIT_FRAME * R + R);
      const a = centre(R, (k) => before[k] === j);
      const b = centre(R, (k) => after[k] === j);
      let both = 0;
      let lit = 0;
      for (let k = 0; k < R; k++) {
        if (after[k] === j) lit++;
        if (after[k] === j && before[k] === j) both++;
      }
      const score =
        Number.isFinite(a) && Number.isFinite(b) ? (Math.abs(b - a) / R) * (1 - both / lit) : 0;
      if (score > best) {
        best = score;
        plan = { disc: j, x: e.x, z: e.z };
      }
      if (score > 0.3) break;
    }
  }

  /** Back to the episode's start, nothing edited, nothing recorded. */
  function rewind() {
    ep = makeEpisode(v, p0, vel);
    applied = false;
    marks = [];
    t = 0;
    end = FRAMES - 1;
    limit = FRAMES;
    shown = 0;
    hold = 0;
    transferred = true;
    wait = 0;
    drag = null;
  }

  /** Make an edit at time tt (`act` teleports a disc and says what it did), keeping the marks
   * the paper draws. False if `act` found no edit. */
  function edit(tt: number, act: () => Edit | null) {
    const R = v.rays;
    const from = Math.max(0, Math.ceil(tt));
    const before = from < FRAMES ? ep.hit.slice(from * R, from * R + R) : null;
    const at = stateAt(ep, tt, new Float64Array(4));
    const e = act();
    if (!e) return false;
    transferred = true;
    wait = 0;
    drag = null;
    const j = e.disc;
    const after = from < FRAMES ? ep.hit.subarray(from * R, from * R + R) : null;
    marks = marks.filter((m) => m.t < tt);
    marks.push({
      t: tt,
      row: from,
      was: [at[2 * j], at[2 * j + 1]],
      went: [e.x, e.z],
      pre: before && after ? centre(R, (k) => before[k] === j && after[k] !== j) : Number.NaN,
      post: after ? centre(R, (k) => after[k] === j) : Number.NaN,
    });
    // every edit made here keeps the episode valid; were one to break the world's rules (a wall,
    // or the discs too close), the run would end where it breaks
    limit = e.ok ? e.frame : from;
    end = e.ok ? Math.min(FRAMES - 1, e.time) : tt;
    if (shown > limit) shown = limit;
    paintHistory();
    return true;
  }

  const move = (j: number, tt: number, x: number, z: number) =>
    edit(tt, () => teleport(ep, j, tt, x, z));

  /** The still: the whole record, shown at the edit's moment (as the paper's figure 4a). */
  function still() {
    rewind();
    if (plan) move(plan.disc, EDIT_FRAME, plan.x, plan.z);
    applied = true;
    figure = true;
    t = Math.min(EDIT_FRAME, end);
    shown = limit;
    paintHistory();
  }

  function next() {
    begin((Math.imul(seed, 48271) % 2147483647) >>> 0 || 1);
    rewind();
    figure = false;
    record();
  }

  /** Record every frame reached so far (the edited frame only once the drag is done). */
  function record() {
    const last = marks.length ? marks[marks.length - 1].row : FRAMES;
    const want = Math.min(limit, Math.floor(t + 1e-9) + 1, transferred && !drag ? FRAMES : last);
    if (want !== shown) {
      shown = want;
      paintHistory();
    }
  }

  const live = living({
    el: well,
    fps: 30,
    paused: true,
    tick(dt) {
      if (figure) return;
      if (drag) {
        drag.ms += dt;
        if (drag.ms >= HAND_MS) {
          drag = null;
          if (!transferred) wait = editHold;
          record();
        }
        draw();
        return;
      }
      if (wait > 0) {
        wait -= dt;
        if (wait <= 0) transferred = true;
        record();
        draw();
        return;
      }
      if (t >= end) {
        hold -= dt;
        if (hold > 0) return;
        next();
        draw();
        return;
      }
      t = Math.min(end, t + dt / frameMs);
      if (plan && !applied && t >= EDIT_FRAME) {
        applied = true;
        move(plan.disc, EDIT_FRAME, plan.x, plan.z);
        t = Math.min(EDIT_FRAME, end);
        const m = marks[marks.length - 1];
        drag = { j: plan.disc, from: m.was, to: m.went, ms: 0 };
        if (editHold > 0) transferred = false;
      }
      record();
      if (t >= end) hold = HOLD_MS;
      draw();
    },
  });

  // ---- layout, in device pixels so the coarse things land on whole pixels
  const L = {
    d: 1,
    s: 1,
    fx: 0,
    oy: 0,
    F: 0,
    hx: 0,
    hy: 0,
    hw: 0,
    rowD: 1,
    sy: 0,
    sh: 0,
    mid: 0,
    ly: 0,
    fs: 9,
  };

  function layout() {
    const d = surface.dpr;
    const W = canvas.width;
    const H = canvas.height;
    const pad = Math.round(clamp(surface.h * 0.08, 8, 14) * d);
    const fs = Math.round(clamp(surface.h * 0.05, 9, 12) * d); // the labels
    const band = fs + Math.round(4 * d);
    const rowD = Math.max(1, Math.floor((H - 2 * pad - band) / FRAMES));
    const hh = rowD * FRAMES;
    const y0 = pad + band + Math.floor((H - 2 * pad - band - hh) / 2);
    const sh = Math.max(2, Math.round(4 * d));
    const gap = Math.round(5 * d);
    const F = hh - sh - gap;
    const mid = Math.round(clamp(surface.w * 0.1, 16, 34) * d);
    // the generator's panel: up to 128 px wide in the Papers well, wider in a larger one
    const cap = Math.max(Math.round(128 * d), Math.round(W * 0.37));
    const hw = Math.max(Math.round(40 * d), Math.min(cap, W - 2 * pad - F - mid));
    const x0 = Math.floor((W - (F + mid + hw)) / 2);
    L.d = d;
    L.F = F;
    L.s = F / FAR;
    L.fx = x0 + F / 2;
    L.oy = y0 + hh;
    L.hx = x0 + F + mid;
    L.hy = y0;
    L.hw = hw;
    L.rowD = rowD;
    L.sy = y0;
    L.sh = sh;
    L.mid = mid;
    L.ly = y0 - Math.round(5 * d);
    L.fs = fs;
  }

  const X = (x: number) => L.fx + x * L.s;
  const Y = (z: number) => L.oy - z * L.s;
  /** Where a line L.d wide is centred to fill whole device pixels (an odd width on a half pixel,
   * an even one on a whole). */
  const crisp = (p: number) => Math.round(p) + (Math.round(L.d) % 2) / 2;

  /** Where the observation strip puts ray k (its crossing of the far edge), as a fraction of
   * the strip's run from the first ray's cell to the last's. */
  function stripSpan() {
    const { slope } = fan(v);
    const n = v.rays;
    const step = n > 1 ? slope[1] - slope[0] : 2 * SCALE;
    return [(slope[0] - step / 2) * FAR, (slope[n - 1] + step / 2) * FAR];
  }

  function ring(x: number, z: number, c: RGB, a = 1, dash = false) {
    ctx.beginPath();
    ctx.arc(X(x), Y(z), v.radius * L.s + 1.5 * L.d, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(c, a);
    ctx.lineWidth = 1.25 * L.d;
    ctx.setLineDash(dash ? [2 * L.d, 2 * L.d] : []);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** Where the touch holds the dragged disc, and how present the touch is (0 to 1). */
  function held(g: NonNullable<typeof drag>): [number, number, number] {
    const u = clamp((g.ms - PRESS_MS) / DRAG_MS, 0, 1);
    const e = u * u * (3 - 2 * u);
    return [
      g.from[0] + (g.to[0] - g.from[0]) * e,
      g.from[1] + (g.to[1] - g.from[1]) * e,
      clamp(Math.min(g.ms / PRESS_MS, (HAND_MS - g.ms) / LIFT_MS), 0, 1),
    ];
  }

  function draw() {
    const { d, rowD, hx, hy, hw } = L;
    const R = v.rays;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    // the world now; mid-drag, the dragged disc where the touch holds it
    stateAt(ep, t, P);
    const g = drag;
    const h = g ? held(g) : null;
    if (g && h) {
      P[2 * g.j] = h[0];
      P[2 * g.j + 1] = h[1];
      renderFrame(v, P, row, 0, shownAt(ep, t), rowHit, rowDepth);
    } else renderAt(ep, t, row, rowHit, rowDepth);

    // the frustum: the observer's lines to the near corners, then the frustum itself
    const nearY = crisp(Y(NEAR));
    const farY = crisp(Y(FAR));
    ctx.lineWidth = d;
    ctx.strokeStyle = rgba(pal.tx, 0.14);
    ctx.beginPath();
    ctx.moveTo(L.fx, L.oy);
    ctx.lineTo(X(-SCALE * NEAR), nearY);
    ctx.moveTo(L.fx, L.oy);
    ctx.lineTo(X(SCALE * NEAR), nearY);
    ctx.stroke();

    // the rays, each to where it stopped
    const { slope } = fan(v);
    const every = R > 32 ? 4 : 1;
    const misses = new Path2D();
    const hits = new Path2D();
    for (let k = 0; k < R; k++) {
      if (k % every && k !== R - 1) continue;
      const z = rowHit[k] >= 0 ? rowDepth[k] : FAR;
      const path = rowHit[k] >= 0 ? hits : misses;
      path.moveTo(X(slope[k] * NEAR), Y(NEAR));
      path.lineTo(X(slope[k] * z), Y(z));
    }
    ctx.lineWidth = Math.max(1, 0.75 * d);
    ctx.strokeStyle = rgba(pal.tx, R > 32 ? 0.08 : 0.16);
    ctx.stroke(misses);
    ctx.strokeStyle = rgba(pal.tx, R > 32 ? 0.2 : 0.38);
    ctx.stroke(hits);

    ctx.lineWidth = d;
    ctx.strokeStyle = rgba(pal.tx, 0.42);
    ctx.beginPath();
    ctx.moveTo(X(-SCALE * NEAR), nearY);
    ctx.lineTo(X(SCALE * NEAR), nearY);
    ctx.lineTo(X(SCALE * FAR), farY);
    ctx.lineTo(X(-SCALE * FAR), farY);
    ctx.closePath();
    ctx.stroke();

    // the observer
    ctx.fillStyle = rgba(pal.tx, 0.9);
    const o = Math.max(2, Math.round(1.5 * d));
    ctx.fillRect(Math.round(L.fx - o), Math.round(L.oy - o), 2 * o, 2 * o);

    // the discs, dim and bright, as the rays return them
    for (let j = 0; j < 2; j++) {
      ctx.beginPath();
      ctx.arc(X(P[2 * j]), Y(P[2 * j + 1]), v.radius * L.s, 0, Math.PI * 2);
      ctx.fillStyle = rgba(mix(pal.well, pal.tx, j ? 0.8 : 0.4));
      ctx.fill();
    }

    // the latest edit: where the disc was, and where it went
    const m = marks.length ? marks[marks.length - 1] : null;
    const seen = m && t >= m.t ? m : null;
    if (seen) {
      ring(seen.was[0], seen.was[1], pre);
      ring(h ? h[0] : seen.went[0], h ? h[1] : seen.went[1], post);
    }
    const aim =
      hover && (figure || t < end) ? target(hover[0], hover[1], figure ? EDIT_FRAME : t) : null;
    if (aim) ring(aim[1], aim[2], pal.tx, 0.55, true);

    // the frame as a 1D image, over the far edge
    if (simg && sctx) {
      for (let k = 0; k < R; k++) sbuf[k] = shade(row[k]);
      sctx.putImageData(simg, 0, 0);
      const [a, b] = stripSpan();
      const x0 = Math.round(X(a));
      const sw = Math.round(X(b)) - x0;
      ctx.drawImage(strip, x0, L.sy, sw, L.sh);
      ctx.lineWidth = d;
      ctx.strokeStyle = rgba(pal.tx, 0.2);
      ctx.strokeRect(x0 - d / 2, L.sy - d / 2, sw + d, L.sh + d);
    }

    // the history: frame over frame, down
    const hh = rowD * FRAMES;
    const rows = Math.min(shown, limit);
    ctx.fillStyle = rgba(pal.well);
    ctx.fillRect(hx, hy, hw, hh);
    if (rows) ctx.drawImage(hist, 0, 0, R, rows, hx, hy, hw, rows * rowD);
    ctx.lineWidth = d;
    ctx.strokeStyle = rgba(pal.tx, 0.2);
    ctx.strokeRect(hx - d / 2, hy - d / 2, hw + d, hh + d);
    if (!figure && rows < FRAMES && t < end) {
      ctx.fillStyle = rgba(pal.tx, 0.7);
      ctx.fillRect(hx, hy + rows * rowD, hw, Math.max(1, Math.round(d)));
    }

    // what each side is
    ctx.font = `${L.fs}px ${mono}`;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = rgba(pal.tx, 0.55);
    ctx.fillText("SIMULATOR", Math.round(L.fx - L.F / 2), L.ly);
    ctx.fillText("GENERATOR", hx, L.ly);

    // the wires between them: until the edit, the frame the simulator renders goes into the
    // generator's next row; from the edit on, the edited state goes in at the edit's row
    const xm = crisp(hx - L.mid / 2);
    const wire = (x0: number, y0: number, y1: number, c: RGB, a: number) => {
      const ya = crisp(y0);
      const yb = crisp(y1);
      const tip = Math.round(hx - 2 * d);
      ctx.lineWidth = d;
      ctx.strokeStyle = rgba(c, a);
      ctx.beginPath();
      ctx.moveTo(Math.round(x0), ya);
      ctx.lineTo(xm, ya);
      ctx.lineTo(xm, yb);
      ctx.lineTo(tip - 3 * d, yb);
      ctx.stroke();
      ctx.fillStyle = rgba(c, a);
      ctx.beginPath();
      ctx.moveTo(tip, yb);
      ctx.lineTo(tip - 4 * d, yb - 3 * d);
      ctx.lineTo(tip - 4 * d, yb + 3 * d);
      ctx.closePath();
      ctx.fill();
    };
    const written = seen && seen.row < FRAMES && transferred;
    if (written) {
      const gx = X(h ? h[0] : seen.went[0]) + v.radius * L.s + 2.5 * d;
      const gy = Y(h ? h[1] : seen.went[1]);
      const ey = hy + seen.row * rowD;
      wire(gx, gy, ey, post, 0.95);
      // EDIT, centred on the wire's vertical run, on the side its turn leaves free once the
      // disc has landed (so it holds still through a drag)
      const tw = ctx.measureText("EDIT").width;
      const below = Y(seen.went[1]) < ey - 2 * d;
      const ty = below ? ey + L.fs + Math.round(5 * d) : ey - Math.round(6 * d);
      const tx = Math.round(Math.min(xm - tw / 2, hx - 3 * d - tw));
      ctx.fillStyle = rgba(pal.well);
      ctx.fillRect(tx - 2 * d, ty - L.fs, tw + 4 * d, L.fs + 3 * d);
      ctx.fillStyle = rgba(post);
      ctx.fillText("EDIT", tx, ty);
    } else if (!figure && t < end && !(seen && !transferred)) {
      const [, b] = stripSpan();
      wire(Math.round(X(b)) + 3 * d, L.sy + L.sh / 2, hy + rows * rowD, pal.tx, 0.32);
    }

    const now = figure ? -1 : !seen ? 0 : transferred ? 2 : 1;
    if (now !== phase) {
      phase = now;
      opts.onPhase?.(now);
    }

    // the edits on the record: a dashed line at each edited frame, and the latest one's
    // locators, the edited disc's ray centres before (cyan) and after (magenta)
    // (the generator shows an edit only once it has been written in and the drag is done)
    for (const k of marks) {
      if (t < k.t || k.row >= FRAMES || (k === seen && (!transferred || g))) continue;
      const y = hy + k.row * rowD;
      ctx.fillStyle = rgba(pal.tx, 0.85);
      const dash = Math.round(3 * d);
      const lw = Math.max(1, Math.round(d));
      for (let x = hx; x < hx + hw; x += dash * 2)
        ctx.fillRect(x, y - (lw >> 1), Math.min(dash, hx + hw - x), lw);
    }
    if (seen && transferred && !g) {
      const lw = Math.max(1, Math.round(d));
      for (const [c, col] of [
        [seen.pre, pre],
        [seen.post, post],
      ] as [number, RGB][]) {
        if (!Number.isFinite(c)) continue;
        const x = Math.round(hx + ((c + 0.5) / R) * hw - lw / 2);
        ctx.fillStyle = rgba(col);
        ctx.fillRect(x, hy, lw, hh);
      }
    }

    // the touch making the edit: a translucent fingertip on the disc, settling as it presses
    // and spreading a little as it lifts
    if (g && h) {
      const s = 1 + (g.ms < PRESS_MS ? 0.3 : 0.15) * (1 - h[2]);
      ctx.beginPath();
      ctx.arc(X(h[0]), Y(h[1]), (v.radius * L.s + 13 * d) * s, 0, Math.PI * 2);
      ctx.fillStyle = rgba(pal.tx, 0.2 * h[2]);
      ctx.fill();
      ctx.lineWidth = d;
      ctx.strokeStyle = rgba(pal.tx, 0.5 * h[2]);
      ctx.stroke();
    }
  }

  // ---- input

  /** Canvas point to world (x, z), through any mirror or turn the views give the canvas. */
  function world(e: MouseEvent): [number, number] {
    const [px, py] = local(canvas, e);
    return [(px - L.fx) / L.s, (L.oy - py) / L.s];
  }

  /** Nothing is moving, so the loop will not draw. */
  const quiet = () => live.paused || figure || t >= end;

  /** In the frustum, give or take a little. */
  const near = (x: number, z: number) =>
    z >= NEAR - 0.6 && z <= FAR + 0.6 && Math.abs(x) <= SCALE * z + 0.6;

  /** The disc a click at (x, z) moves (the nearer one, as drawn), and where it lands: the
   * nearest spot from which the rest of the episode stays valid, as the paper's edits do. */
  function target(x: number, z: number, at: number): [number, number, number] | null {
    stateAt(ep, at, Q);
    const d0 = (Q[0] - x) ** 2 + (Q[1] - z) ** 2;
    const d1 = (Q[2] - x) ** 2 + (Q[3] - z) ** 2;
    const j = d1 < d0 ? 1 : 0;
    const k = 1 - j;
    // the still redoes its one edit from the unedited world, so the partner sits there
    if (figure) stateAt(orig, at, Q);
    const c = clampFuture(
      v,
      x,
      z,
      vel[2 * j],
      vel[2 * j + 1],
      Q[2 * k],
      Q[2 * k + 1],
      vel[2 * k],
      vel[2 * k + 1],
      Math.max(0, FRAMES - 1 - at),
    );
    return c ? [j, c[0], c[1]] : null;
  }

  function teleportTo(x: number, z: number) {
    if (figure) {
      const g = target(x, z, EDIT_FRAME);
      if (!g) return;
      rewind();
      move(g[0], EDIT_FRAME, g[1], g[2]);
      applied = true;
      t = Math.min(EDIT_FRAME, end);
      shown = limit;
      paintHistory();
    } else if (t >= end) {
      // the record is full: on to the next
      next();
    } else {
      const g = target(x, z, t);
      if (!g) return;
      applied = true; // the visitor's edit replaces the episode's own
      move(g[0], t, g[1], g[2]);
      record();
      if (t >= end) hold = HOLD_MS;
    }
    draw();
  }

  /** The paper's edit, now (Enter on the well). */
  function randomEdit() {
    if (figure) {
      choosePlan();
      still();
    } else if (t >= end) {
      next();
    } else if (edit(t, () => randomTeleport(r, ep, t))) {
      applied = true;
      record();
    }
    draw();
  }

  let lastPointer = "mouse";
  let asleep = false; // the widget was resting when this press began
  canvas.addEventListener("pointerdown", (e) => {
    lastPointer = e.pointerType;
    asleep = !on;
    if (e.pointerType === "touch" || e.button !== 0) return;
    const [x, z] = world(e);
    if (near(x, z)) teleportTo(x, z);
  });
  canvas.addEventListener("click", (e) => {
    if (lastPointer !== "touch") return;
    // a tap that wakes the widget (by focusing it) only wakes it: the first wake starts the
    // episode over, so an edit would land on a frame the tap was not aimed at
    if (asleep && on && !STILL) return;
    const [x, z] = world(e);
    if (near(x, z)) teleportTo(x, z);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    const [x, z] = world(e);
    const was = hover;
    hover = near(x, z) ? [x, z] : null;
    canvas.style.cursor = hover ? "crosshair" : "";
    if (quiet() && (hover || was)) draw();
  });
  canvas.addEventListener("pointerleave", () => {
    if (!hover) return;
    hover = null;
    if (quiet()) draw();
  });
  canvas.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    randomEdit();
  });

  const offControls = onControls(() => {
    colours();
    paintHistory();
    draw();
  });

  sizeBuffers();
  begin(seed);
  still();
  layout();
  draw();

  return {
    setActive(active) {
      if (active === on) return;
      on = active;
      if (STILL) return;
      if (on && figure) {
        // the still comes alive: the same episode from its start
        rewind();
        figure = false;
        record();
        draw();
      }
      live.setPaused(!on);
    },
    dispose() {
      live.dispose();
      offControls();
      surface.dispose();
    },
  };
};

const mount: MountWidget = (host) => mountStage(host);

export default mount;
