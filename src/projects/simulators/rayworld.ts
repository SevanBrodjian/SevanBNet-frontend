// Rayworld, the paper's second environment, as a small simulator for the page's demos.
//
// Seen from above: an observer at the origin looks along +z into a trapezoid from depth 3 to 12,
// as wide at each depth as that depth (walls at x = ±z/2). Two discs, one dim (0.4) and one
// bright (0.8), move in straight lines at constant speed. Each frame is a 1D image: a fan of rays,
// evenly spaced where they cross the far edge, each returning the reflectivity of the nearest
// disc it hits, or 0. Depth is never observed. It shows only in how many rays a disc covers and
// in which disc hides the other.
//
// Conventions follow the paper's code (pim/environments/rayworld): the ray spacing, the wall test
// (|x| ≤ half-width − r at the disc's depth), the rejection sampling, the blackout rule and its
// edge-ray markers, the edit bench, and the appearance bins (a 500 × 500 sweep: 3736, 77, 30 and
// 14 bins at 128, 16, 8 and 5 rays). The random streams are not numpy's: episodes come from the
// same distributions, not the same sequences.
//
// z is depth (the code's y). Positions are flat [x0, z0, x1, z1]. Time t counts frames and may be
// fractional. An episode is mutable: a teleport rewrites its future in place.

export const NEAR = 3;
export const FAR = 12;
const X_NEAR = 1.5;
const X_FAR = 6;
/** tan of the half field of view: the walls are x = ±SCALE·z. */
export const SCALE = X_FAR / FAR;
export const FRAMES = 40;
export const SPEED_MIN = 0.05;
export const SPEED_MAX = 0.12;
/** The closest two centres may come, in diameters. */
export const SEPARATION = 1.6;
/** Reflectivity of disc 0 (dim) and disc 1 (bright). */
export const REFLECTIVITY = [0.4, 0.8] as const;
/** Blackouts: start probability per disc and frame, mean and cap of the geometric length, and
 * the first frame one may start. */
export const BLINK = { prob: 0.05, mean: 7, cap: 12, warmup: 3 } as const;
/** What an edge ray reads when it marks a blackout. */
export const MARK = 0.5;
/** The frame at which the paper's edit bench teleports a disc. */
export const EDIT_FRAME = 20;

// ── variants ──────────────────────────────────────────────────────────────────

export type VariantName = "standard" | "blink" | "128-ray" | "16-ray" | "8-ray" | "5-ray";

export type Variant = {
  readonly name: VariantName;
  /** rays cast; the N-ray family casts N + 2 and drops the two that run along the walls */
  readonly cast: number;
  readonly dropWalls: boolean;
  /** rays kept: the width of one observation */
  readonly rays: number;
  readonly radius: number;
  readonly blink: boolean;
  /** draws the edit bench allows to find a valid teleport */
  readonly editTries: number;
};

const variant = (
  name: VariantName,
  cast: number,
  dropWalls: boolean,
  radius: number,
  blink: boolean,
  editTries: number,
): Variant => ({
  name,
  cast,
  dropWalls,
  rays: dropWalls ? cast - 2 : cast,
  radius,
  blink,
  editTries,
});

export const VARIANTS: Readonly<Record<VariantName, Variant>> = {
  standard: variant("standard", 128, false, 0.5, false, 50),
  blink: variant("blink", 128, false, 0.5, true, 50),
  "128-ray": variant("128-ray", 130, true, 1, false, 2000),
  "16-ray": variant("16-ray", 18, true, 1, false, 2000),
  "8-ray": variant("8-ray", 10, true, 1, false, 2000),
  "5-ray": variant("5-ray", 7, true, 1, false, 2000),
};

export const VARIANT_NAMES = Object.keys(VARIANTS) as VariantName[];

// ── randomness ────────────────────────────────────────────────────────────────

export type Rng = () => number;

/** A seeded generator in [0, 1) (mulberry32, as frame/util's rng). Same seed, same sequence. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A geometric draw on 1, 2, 3, ... with success probability p (mean 1 / p). */
export function geometric(r: Rng, p: number): number {
  return Math.max(1, Math.ceil(Math.log(1 - r()) / Math.log(1 - p)));
}

// ── geometry ──────────────────────────────────────────────────────────────────

/** Half-width of the frustum at depth z (z / 2, computed as the code computes it). */
export const halfWidth = (z: number) => X_NEAR + (X_FAR - X_NEAR) * ((z - NEAR) / (FAR - NEAR));

export type Fan = {
  /** each kept ray's slope: it crosses depth z at x = slope·z, the far edge at slope·FAR */
  readonly slope: Float64Array;
  /** each kept ray's unit direction */
  readonly dx: Float64Array;
  readonly dz: Float64Array;
};

const fans = new WeakMap<Variant, Fan>();

/** The kept rays of a variant. Cast rays are uniform in slope (numpy's linspace on [-1, 1]
 * times SCALE), so they cross the far edge at equal intervals; the two outermost run along the
 * walls. */
export function fan(v: Variant): Fan {
  let f = fans.get(v);
  if (f) return f;
  const n = v.rays;
  const off = v.dropWalls ? 1 : 0;
  const step = 2 / (v.cast - 1);
  const slope = new Float64Array(n);
  const dx = new Float64Array(n);
  const dz = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const i = k + off;
    const s = i === v.cast - 1 ? 1 : i * step - 1;
    const a = s * SCALE;
    const norm = Math.hypot(a, 1);
    slope[k] = a;
    dx[k] = a / norm;
    dz[k] = 1 / norm;
  }
  f = { slope, dx, dz };
  fans.set(v, f);
  return f;
}

/** A lone disc centred at (x, z) lies inside the frustum and clear of the walls, by the code's
 * test: its depth range within [NEAR, FAR] and |x| ≤ half-width − r at its depth. */
export function inside(v: Variant, x: number, z: number): boolean {
  const r = v.radius;
  if (!(z - r >= NEAR && z + r <= FAR)) return false;
  return Math.abs(x) <= halfWidth(z) - r;
}

/** Two centres are at least SEPARATION diameters apart. */
export function apart(v: Variant, x0: number, z0: number, x1: number, z1: number): boolean {
  const ax = x1 - x0;
  const az = z1 - z0;
  return Math.sqrt(ax * ax + az * az) >= SEPARATION * 2 * v.radius;
}

/** Both discs inside and apart: a state the world allows. */
export function valid(v: Variant, p: ArrayLike<number>): boolean {
  return inside(v, p[0], p[1]) && inside(v, p[2], p[3]) && apart(v, p[0], p[1], p[2], p[3]);
}

/** Corners of the region a centre may occupy, as [x, z]: near left, near right, far right, far
 * left. */
export function reach(v: Variant): [number, number][] {
  const r = v.radius;
  const zn = NEAR + r;
  const zf = FAR - r;
  const hn = halfWidth(zn) - r;
  const hf = halfWidth(zf) - r;
  return [
    [-hn, zn],
    [hn, zn],
    [hf, zf],
    [-hf, zf],
  ];
}

/** A draw of where a disc may sit, as the code draws it: depth uniform first, then the lateral
 * position uniform across the frustum at that depth. */
export function randomPosition(r: Rng, v: Variant): [number, number] {
  const rad = v.radius;
  const z = NEAR + rad + (FAR - NEAR - 2 * rad) * r();
  const xl = halfWidth(z) - rad;
  return [-xl + 2 * xl * r(), z];
}

/** The valid position nearest to (x, z) for a disc whose partner sits at (ox, oz): inside, clear
 * of the walls and SEPARATION diameters from the partner. For dragging. */
export function clampPosition(
  v: Variant,
  x: number,
  z: number,
  ox: number,
  oz: number,
): [number, number] {
  const e = 1e-9;
  const r = v.radius;
  const zn = NEAR + r + e;
  const zf = FAR - r - e;
  const hn = halfWidth(zn) - r - e;
  const hf = halfWidth(zf) - r - e;
  const P = [-hn, zn, hn, zn, hf, zf, -hf, zf];
  const inT = (px: number, pz: number) =>
    pz >= zn && pz <= zf && Math.abs(px) <= halfWidth(pz) - r - e;
  const S = SEPARATION * 2 * r + e;
  const out = (px: number, pz: number) => (px - ox) ** 2 + (pz - oz) ** 2 >= S * S;

  // nearest point of the trapezoid
  let px = x;
  let pz = z;
  if (!inT(x, z)) {
    let best = Infinity;
    for (let k = 0; k < 4; k++) {
      const [qx, qz] = onSegment(
        x,
        z,
        P[2 * k],
        P[2 * k + 1],
        P[(2 * k + 2) % 8],
        P[(2 * k + 3) % 8],
      );
      const d = (qx - x) ** 2 + (qz - z) ** 2;
      if (d < best) {
        best = d;
        px = qx;
        pz = qz;
      }
    }
  }
  if (out(px, pz)) return [px, pz];

  // inside the partner's circle: the nearest point on its rim or on the trapezoid's edges
  const cand: number[] = [];
  let ux = x - ox;
  let uz = z - oz;
  let ul = Math.hypot(ux, uz);
  if (ul < 1e-12) {
    ux = px - ox;
    uz = pz - oz;
    ul = Math.hypot(ux, uz);
  }
  if (ul < 1e-12) {
    ux = 0;
    uz = -1;
    ul = 1;
  }
  const rx = ox + (ux / ul) * S;
  const rz = oz + (uz / ul) * S;
  if (inT(rx, rz)) cand.push(rx, rz);
  for (let k = 0; k < 4; k++) {
    const ax = P[2 * k];
    const az = P[2 * k + 1];
    const bx = P[(2 * k + 2) % 8];
    const bz = P[(2 * k + 3) % 8];
    if (out(ax, az)) cand.push(ax, az);
    const [qx, qz] = onSegment(x, z, ax, az, bx, bz);
    if (out(qx, qz)) cand.push(qx, qz);
    // the rim meets this edge
    const dx = bx - ax;
    const dz = bz - az;
    const fx = ax - ox;
    const fz = az - oz;
    const A = dx * dx + dz * dz;
    const B = fx * dx + fz * dz;
    const C = fx * fx + fz * fz - S * S;
    const D = B * B - A * C;
    if (D >= 0) {
      for (const sgn of [-1, 1]) {
        const s = (-B + sgn * Math.sqrt(D)) / A;
        if (s >= 0 && s <= 1) cand.push(ax + s * dx, az + s * dz);
      }
    }
  }
  let best = Infinity;
  for (let k = 0; k < cand.length; k += 2) {
    const d = (cand[k] - x) ** 2 + (cand[k + 1] - z) ** 2;
    if (d < best) {
      best = d;
      px = cand[k];
      pz = cand[k + 1];
    }
  }
  return [px, pz];
}

function onSegment(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): [number, number] {
  const dx = bx - ax;
  const dz = bz - az;
  const s = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return [ax + s * dx, az + s * dz];
}

// ── rendering ─────────────────────────────────────────────────────────────────

/** Ray parameter of the first point a ray (ux, uz) meets a disc, or Infinity: the front surface
 * between the near and far edges, or the near edge for a disc that straddles it. */
function front(ux: number, uz: number, cx: number, cz: number, c: number): number {
  const b = ux * cx + uz * cz;
  const disc = b * b - c;
  if (!(disc >= 0)) return Number.POSITIVE_INFINITY;
  const sq = Math.sqrt(disc);
  const tf = b - sq;
  const zf = uz * tf;
  if (tf > 1e-9 && zf >= NEAR && zf <= FAR) return tf;
  if (zf < NEAR && uz * (b + sq) >= NEAR) return NEAR / uz;
  return Number.POSITIVE_INFINITY;
}

/** Render positions p = [x0, z0, x1, z1] into out[at .. at + v.rays): each ray reads the
 * reflectivity of the nearest disc it hits, or 0. `shown` has bit j set when disc j is shown
 * (blink). `hit` (-1 nothing, else the disc) and `depth` (where the ray stopped, 0 on a miss)
 * take the same layout. */
export function renderFrame(
  v: Variant,
  p: ArrayLike<number>,
  out: Float32Array,
  at = 0,
  shown = 3,
  hit?: Int8Array,
  depth?: Float32Array,
): void {
  const { dx, dz } = fan(v);
  const r2 = v.radius * v.radius;
  const x0 = p[0];
  const z0 = p[1];
  const x1 = p[2];
  const z1 = p[3];
  const c0 = x0 * x0 + z0 * z0 - r2;
  const c1 = x1 * x1 + z1 * z1 - r2;
  const s0 = (shown & 1) !== 0;
  const s1 = (shown & 2) !== 0;
  for (let k = 0; k < v.rays; k++) {
    const ux = dx[k];
    const uz = dz[k];
    let best = Number.POSITIVE_INFINITY;
    let id = -1;
    if (s0) {
      const t = front(ux, uz, x0, z0, c0);
      if (t < best) {
        best = t;
        id = 0;
      }
    }
    if (s1) {
      const t = front(ux, uz, x1, z1, c1);
      if (t < best) {
        best = t;
        id = 1;
      }
    }
    const i = at + k;
    if (id < 0) {
      out[i] = 0;
      if (hit) hit[i] = -1;
      if (depth) depth[i] = 0;
    } else {
      out[i] = REFLECTIVITY[id];
      if (hit) hit[i] = id;
      if (depth) depth[i] = uz * best;
    }
  }
}

// ── episodes ──────────────────────────────────────────────────────────────────

/** A blackout as drawn: the disc, its first hidden frame and its drawn length (the episode's
 * end may cut it short). */
export type Blackout = { readonly disc: number; readonly start: number; readonly length: number };

/** Where a disc's straight line starts: the episode's start, or its latest teleport. */
export type Anchor = { readonly t: number; readonly x: number; readonly z: number };

export type Episode = {
  readonly variant: Variant;
  readonly frames: number;
  /** velocities [vx0, vz0, vx1, vz1], per frame; a teleport keeps them */
  readonly vel: Float64Array;
  /** positions at every frame, frame-major [x0, z0, x1, z1] */
  readonly pos: Float64Array;
  /** 1 when disc j is shown at frame f, at shown[2f + j]; all 1 without blink */
  readonly shown: Uint8Array;
  readonly blackouts: readonly Blackout[];
  /** the observation, frame-major, v.rays values per frame */
  readonly obs: Float32Array;
  /** what each ray saw: -1 nothing, 0 or 1 a disc, -2 or -3 the blackout marker of disc 0 or 1 */
  readonly hit: Int8Array;
  /** depth at which each ray stopped, 0 on a miss */
  readonly depth: Float32Array;
  /** each disc's straight lines, in time order; the last one with t ≤ now is in force */
  readonly anchors: readonly [Anchor[], Anchor[]];
  /** draws the rejection sampler took (1 for a hand-built episode) */
  readonly draws: number;
};

/** The paper's acceptance test for a whole trajectory: both discs inside at every frame and
 * never closer than SEPARATION diameters. */
function trackValid(v: Variant, p: Float64Array, vel: Float64Array, frames: number): boolean {
  for (let f = 0; f < frames; f++) {
    const x0 = p[0] + vel[0] * f;
    const z0 = p[1] + vel[1] * f;
    const x1 = p[2] + vel[2] * f;
    const z1 = p[3] + vel[3] * f;
    if (!apart(v, x0, z0, x1, z1) || !inside(v, x0, z0) || !inside(v, x1, z1)) return false;
  }
  return true;
}

/** A valid episode, drawn as the paper draws it: per disc a position (depth, then lateral), a
 * speed in [SPEED_MIN, SPEED_MAX] and a direction, all uniform; redrawn until both discs stay
 * inside and apart for every frame. Blink variants then draw their blackouts. */
export function sampleEpisode(r: Rng, v: Variant, frames = FRAMES): Episode {
  const p = new Float64Array(4);
  const vel = new Float64Array(4);
  let draws = 0;
  do {
    draws++;
    for (let j = 0; j < 2; j++) {
      const [x, z] = randomPosition(r, v);
      const speed = SPEED_MIN + (SPEED_MAX - SPEED_MIN) * r();
      const ang = 2 * Math.PI * r();
      p[2 * j] = x;
      p[2 * j + 1] = z;
      vel[2 * j] = speed * Math.cos(ang);
      vel[2 * j + 1] = speed * Math.sin(ang);
    }
  } while (!trackValid(v, p, vel, frames));
  return build(v, p, vel, frames, v.blink ? blackouts(r, frames) : null, draws);
}

/** An episode from given start positions and velocities, valid or not. Blackouts are drawn from
 * `rng` for a blink variant, or taken from `shown` (per frame and disc, as Episode.shown). */
export function makeEpisode(
  v: Variant,
  p0: ArrayLike<number>,
  vel: ArrayLike<number>,
  opts: { frames?: number; rng?: Rng; shown?: ArrayLike<number> } = {},
): Episode {
  const frames = opts.frames ?? FRAMES;
  let sched: { shown: Uint8Array; list: Blackout[] } | null = null;
  if (opts.shown) sched = { shown: Uint8Array.from(opts.shown), list: [] };
  else if (v.blink && opts.rng) sched = blackouts(opts.rng, frames);
  return build(v, Float64Array.from(p0), Float64Array.from(vel), frames, sched, 1);
}

/** The code's blackout schedule: no blackout starts before BLINK.warmup, only one disc is hidden
 * at a time, and a disc cannot start a new one on the frame it reappears. */
function blackouts(r: Rng, frames: number): { shown: Uint8Array; list: Blackout[] } {
  const shown = new Uint8Array(2 * frames).fill(1);
  const list: Blackout[] = [];
  const left = [0, 0];
  const warm = Math.max(BLINK.warmup, 1);
  for (let t = 0; t < frames; t++) {
    for (let j = 0; j < 2; j++) {
      if (left[j] > 0) {
        shown[2 * t + j] = 0;
        left[j]--;
      }
    }
    for (let j = 0; j < 2; j++) {
      if (t < warm || !shown[2 * (t - 1) + j]) continue;
      if (!shown[2 * t] || !shown[2 * t + 1]) continue;
      if (r() < BLINK.prob) {
        const length = Math.min(BLINK.cap, geometric(r, 1 / BLINK.mean));
        shown[2 * t + j] = 0;
        left[j] = length - 1;
        list.push({ disc: j, start: t, length });
      }
    }
  }
  return { shown, list };
}

function build(
  v: Variant,
  p: Float64Array,
  vel: Float64Array,
  frames: number,
  sched: { shown: Uint8Array; list: Blackout[] } | null,
  draws: number,
): Episode {
  const n = frames * v.rays;
  const ep: Episode = {
    variant: v,
    frames,
    vel,
    pos: new Float64Array(4 * frames),
    shown: sched ? sched.shown : new Uint8Array(2 * frames).fill(1),
    blackouts: sched ? sched.list : [],
    obs: new Float32Array(n),
    hit: new Int8Array(n),
    depth: new Float32Array(n),
    anchors: [[{ t: 0, x: p[0], z: p[1] }], [{ t: 0, x: p[2], z: p[3] }]],
    draws,
  };
  fill(ep, 0);
  return ep;
}

function anchorAt(list: Anchor[], t: number): Anchor {
  for (let i = list.length - 1; i > 0; i--) if (list[i].t <= t) return list[i];
  return list[0];
}

/** Positions at time t (frames, may be fractional) into out, [x0, z0, x1, z1]. */
export function stateAt(ep: Episode, t: number, out: Float64Array = new Float64Array(4)) {
  for (let j = 0; j < 2; j++) {
    const a = anchorAt(ep.anchors[j], t);
    out[2 * j] = a.x + ep.vel[2 * j] * (t - a.t);
    out[2 * j + 1] = a.z + ep.vel[2 * j + 1] * (t - a.t);
  }
  return out;
}

/** Bits of the discs shown at frame f (bit j for disc j). */
export function shownAt(ep: Episode, f: number): number {
  const i = Math.max(0, Math.min(ep.frames - 1, Math.floor(f)));
  return (ep.shown[2 * i] ? 1 : 0) | (ep.shown[2 * i + 1] ? 2 : 0);
}

/** Mark disc j's edge ray (ray 0 for disc 0, the last ray for disc 1) on frame f when its
 * visibility changes between f and f + 1: the frame before a blackout and its last hidden frame. */
function paintMarks(ep: Episode, f: number, out: Float32Array, at: number, hit?: Int8Array) {
  if (f + 1 >= ep.frames) return;
  for (let j = 0; j < 2; j++) {
    if (ep.shown[2 * f + j] !== ep.shown[2 * (f + 1) + j]) {
      const i = at + (j === 0 ? 0 : ep.variant.rays - 1);
      out[i] = MARK;
      if (hit) hit[i] = -2 - j;
    }
  }
}

const P = new Float64Array(4);

/** Recompute positions and the observation from frame f0 on. */
function fill(ep: Episode, f0: number) {
  const R = ep.variant.rays;
  for (let f = Math.max(0, f0); f < ep.frames; f++) {
    stateAt(ep, f, P);
    ep.pos.set(P, 4 * f);
    renderFrame(ep.variant, P, ep.obs, f * R, shownAt(ep, f), ep.hit, ep.depth);
    paintMarks(ep, f, ep.obs, f * R, ep.hit);
  }
}

/** The observation at time t: the discs where they are at t, shown and marked as at frame
 * floor(t). At a whole frame it equals that frame's row of ep.obs. */
export function renderAt(
  ep: Episode,
  t: number,
  out: Float32Array,
  hit?: Int8Array,
  depth?: Float32Array,
): void {
  const f = Math.max(0, Math.min(ep.frames - 1, Math.floor(t)));
  stateAt(ep, t, P);
  renderFrame(ep.variant, P, out, 0, shownAt(ep, f), hit, depth);
  paintMarks(ep, f, out, 0, hit);
}

// ── validity over time, and edits ─────────────────────────────────────────────

export type Break = {
  /** first frame (from ceil(from) on) that breaks the paper's rule; ep.frames if none */
  readonly frame: number;
  /** when that break begins, in [frame − 1, frame] and no earlier than `from`; Infinity if none */
  readonly time: number;
  /** a disc reaches a wall, or the discs come within SEPARATION diameters */
  readonly cause: "wall" | "disc" | null;
};

/** The first frame from ceil(from) on whose state the world does not allow, or ep.frames. */
export function firstInvalidFrame(ep: Episode, from = 0): number {
  const v = ep.variant;
  const p = ep.pos;
  for (let f = Math.max(0, Math.ceil(from)); f < ep.frames; f++) {
    const i = 4 * f;
    if (!apart(v, p[i], p[i + 1], p[i + 2], p[i + 3])) return f;
    if (!inside(v, p[i], p[i + 1]) || !inside(v, p[i + 2], p[i + 3])) return f;
  }
  return ep.frames;
}

const W = new Float64Array(4);

/** How far a disc at (x, z) is past one of the four boundaries of the region its centre may
 * occupy (near, far, right wall, left wall); positive outside. Linear in a straight motion. */
function wallGap(r: number, x: number, z: number, k: number): number {
  if (k === 0) return NEAR + r - z;
  if (k === 1) return z + r - FAR;
  return (k === 2 ? x : -x) - (halfWidth(z) - r);
}

/** When the episode breaks from time `from` on. The world is checked at whole frames, as in the
 * paper; the time places the start of the violation between the last good frame and the bad
 * one, so a demo can stop a disc at the wall it reaches. */
export function breakAt(ep: Episode, from = 0): Break {
  const f = firstInvalidFrame(ep, from);
  if (f >= ep.frames) return { frame: f, time: Number.POSITIVE_INFINITY, cause: null };
  const v = ep.variant;
  const r = v.radius;
  // the window over which both discs move in straight lines up to frame f
  let w = Math.max(from, f - 1);
  for (const list of ep.anchors) {
    const a = anchorAt(list, f);
    if (a.t > w) w = a.t;
  }
  w = Math.min(w, f);
  stateAt(ep, w, W);
  const end = ep.pos.subarray(4 * f, 4 * f + 4);
  const span = f - w;
  let time = f;
  let cause: "wall" | "disc" = "wall";
  // walls: four linear constraints per disc
  for (let j = 0; j < 2; j++) {
    for (let k = 0; k < 4; k++) {
      const g1 = wallGap(r, end[2 * j], end[2 * j + 1], k);
      if (!(g1 > 0)) continue;
      const g0 = wallGap(r, W[2 * j], W[2 * j + 1], k);
      const t = g0 > 0 || span <= 0 ? w : w + (span * -g0) / (g1 - g0);
      if (t < time) {
        time = t;
        cause = "wall";
      }
    }
  }
  // separation: |d(τ)| < S, d linear in τ
  const S = SEPARATION * 2 * r;
  const ex = end[2] - end[0];
  const ez = end[3] - end[1];
  if (ex * ex + ez * ez < S * S) {
    const dx = W[2] - W[0];
    const dz = W[3] - W[1];
    const c = dx * dx + dz * dz - S * S;
    let t = w;
    if (c >= 0 && span > 0) {
      const vx = (ex - dx) / span;
      const vz = (ez - dz) / span;
      const a = vx * vx + vz * vz;
      const b = dx * vx + dz * vz;
      const disc = b * b - a * c;
      t = a > 0 && disc >= 0 ? w + Math.max(0, (-b - Math.sqrt(disc)) / a) : f;
    }
    if (t < time) {
      time = t;
      cause = "disc";
    }
  }
  return { frame: f, time: Math.max(w, Math.min(f, time)), cause };
}

export type Edit = Break & {
  readonly disc: number;
  readonly t: number;
  readonly x: number;
  readonly z: number;
  /** the first frame the teleport rewrote */
  readonly from: number;
  /** the new position is inside, clear of the walls and of the other disc at time t */
  readonly ok: boolean;
  /** ok, and the world stays valid at every remaining frame */
  readonly holds: boolean;
};

/** Teleport disc `disc` to (x, z) at time t, keeping both velocities: its line from t on starts
 * there, later teleports of it are dropped, and positions and observation are rewritten from
 * frame ceil(t) on. Returns where the edited world breaks, if it does. */
export function teleport(ep: Episode, disc: number, t: number, x: number, z: number): Edit {
  const list = ep.anchors[disc];
  let n = list.length;
  while (n > 0 && list[n - 1].t >= t) n--;
  list.length = n;
  list.push({ t, x, z });
  const from = Math.max(0, Math.ceil(t));
  fill(ep, from);
  const ok = valid(ep.variant, stateAt(ep, t, P));
  const b = breakAt(ep, t);
  return { ...b, disc, t, x, z, from, ok, holds: ok && b.frame >= ep.frames };
}

/** The paper's edit: teleport one disc (drawn uniformly unless given) at time t to a random
 * position, accepted only if both discs then stay inside and apart at every remaining frame;
 * up to v.editTries draws. Returns the edit, or null (episode untouched) if no draw fits. */
export function randomTeleport(r: Rng, ep: Episode, t = EDIT_FRAME, disc = -1): Edit | null {
  const v = ep.variant;
  const j = disc >= 0 ? disc : r() < 0.5 ? 0 : 1;
  const k = 1 - j;
  const vx = ep.vel[2 * j];
  const vz = ep.vel[2 * j + 1];
  const f0 = Math.max(0, Math.ceil(t));
  const other = new Float64Array(4);
  for (let a = 0; a < v.editTries; a++) {
    const [x, z] = randomPosition(r, v);
    let fits = true;
    if (f0 !== t) {
      stateAt(ep, t, other);
      fits = apart(v, x, z, other[2 * k], other[2 * k + 1]);
    }
    for (let f = f0; fits && f < ep.frames; f++) {
      const px = x + vx * (f - t);
      const pz = z + vz * (f - t);
      const i = 4 * f + 2 * k;
      fits = inside(v, px, pz) && apart(v, px, pz, ep.pos[i], ep.pos[i + 1]);
    }
    if (fits) return teleport(ep, j, t, x, z);
  }
  return null;
}

// ── appearance ────────────────────────────────────────────────────────────────

/** First and last kept ray a lone disc at (x, z) lights, packed as first·1024 + last, or -1.
 * Occlusion is ignored; the test is the renderer's (front surface between the near and far
 * edges). The analytic slope interval picks a window; each ray in it is then tested exactly. */
function run(v: Variant, x: number, z: number): number {
  const { dx, dz } = fan(v);
  const n = v.rays;
  const r2 = v.radius * v.radius;
  const c = x * x + z * z - r2;
  const hits = (k: number) => {
    const ux = dx[k];
    const uz = dz[k];
    const b = ux * x + uz * z;
    const disc = b * b - c;
    if (!(disc >= 0)) return false;
    const tf = b - Math.sqrt(disc);
    const zf = uz * tf;
    return tf > 1e-9 && zf >= NEAR && zf <= FAR;
  };
  let lo = 0;
  let hi = n - 1;
  const q = z * z - r2;
  if (q > 0) {
    // slopes a with (x − a z)² ≤ r² (1 + a²)
    const root = v.radius * Math.sqrt(Math.max(0, x * x + q));
    const off = v.dropWalls ? 1 : 0;
    const toK = (a: number) => ((a / SCALE + 1) * (v.cast - 1)) / 2 - off;
    lo = Math.max(0, Math.floor(toK((x * z - root) / q)) - 1);
    hi = Math.min(n - 1, Math.ceil(toK((x * z + root) / q)) + 1);
    if (lo > hi) return -1;
  }
  let first = -1;
  let last = -1;
  for (let k = lo; k <= hi; k++) {
    if (hits(k)) {
      if (first < 0) first = k;
      last = k;
    }
  }
  if (first < 0) return -1;
  while (first > 0 && hits(first - 1)) first--;
  while (last < n - 1 && hits(last + 1)) last++;
  return first * 1024 + last;
}

/** The run of kept rays a lone disc at (x, z) lights, [first ray, width]; width 0 if none. */
export function appearance(v: Variant, x: number, z: number): [number, number] {
  const c = run(v, x, z);
  if (c < 0) return [-1, 0];
  const first = Math.floor(c / 1024);
  return [first, (c % 1024) - first + 1];
}

export type Bins = {
  readonly count: number;
  /** each bin's run, in the code's cell order: narrow runs (far) first, then left to right */
  readonly first: Int16Array;
  readonly width: Int16Array;
  /** the factorized target: each bin's lateral class (first + last) and width class */
  readonly lateral: Int16Array;
  readonly widthClass: Int16Array;
  readonly lateralCount: number;
  readonly widthCount: number;
  /** bin of the run (first, last) at first·rays + last; -1 for a run the sweep never met */
  readonly lookup: Int32Array;
};

const binsOf = new WeakMap<Variant, Bins>();

/** The appearance bins of a variant: every run a lone disc can light, found as the code finds
 * them, by a 500 × 500 sweep of the region its centre may occupy. Cached. */
export function appearanceBins(v: Variant): Bins {
  const got = binsOf.get(v);
  if (got) return got;
  const N = 500;
  const r = v.radius;
  const R = v.rays;
  const seen = new Uint8Array(R * R);
  const y0 = NEAR + r;
  const y1 = FAR - r;
  for (let a = 0; a < N; a++) {
    const y = a === N - 1 ? y1 : y0 + a * ((y1 - y0) / (N - 1));
    const reachX = SCALE * y - r;
    for (let b = 0; b < N; b++) {
      const s = b === N - 1 ? 1 : b * (2 / (N - 1)) - 1;
      const c = run(v, s * reachX, y);
      if (c >= 0) seen[Math.floor(c / 1024) * R + (c % 1024)] = 1;
    }
  }
  const runs: [number, number][] = [];
  for (let i = 0; i < R * R; i++) if (seen[i]) runs.push([Math.floor(i / R), i % R]);
  runs.sort((p, q) => p[1] - p[0] - (q[1] - q[0]) || p[0] - q[0]);
  const count = runs.length;
  const centers = [...new Set(runs.map(([f, l]) => f + l))].sort((p, q) => p - q);
  const widths = [...new Set(runs.map(([f, l]) => l - f + 1))].sort((p, q) => p - q);
  const bins: Bins = {
    count,
    first: Int16Array.from(runs, ([f]) => f),
    width: Int16Array.from(runs, ([f, l]) => l - f + 1),
    lateral: Int16Array.from(runs, ([f, l]) => centers.indexOf(f + l)),
    widthClass: Int16Array.from(runs, ([f, l]) => widths.indexOf(l - f + 1)),
    lateralCount: centers.length,
    widthCount: widths.length,
    lookup: new Int32Array(R * R).fill(-1),
  };
  runs.forEach(([f, l], i) => {
    bins.lookup[f * R + l] = i;
  });
  binsOf.set(v, bins);
  return bins;
}

/** The code's fallback for a run the sweep never met: the realizable run with the same centre
 * first, then the smallest |Δfirst| + |Δlast|, ties to the earlier bin. */
function nearestBin(b: Bins, f: number, l: number): number {
  let best = 0;
  let k0 = Number.POSITIVE_INFINITY;
  let k1 = Number.POSITIVE_INFINITY;
  for (let i = 0; i < b.count; i++) {
    const rf = b.first[i];
    const rl = rf + b.width[i] - 1;
    const a = Math.abs(rf + rl - (f + l));
    const c = Math.abs(rf - f) + Math.abs(rl - l);
    if (a < k0 || (a === k0 && c < k1)) {
      best = i;
      k0 = a;
      k1 = c;
    }
  }
  return best;
}

/** The appearance bin of a lone disc centred at (x, z), or -1 where no centre may sit. */
export function binOf(v: Variant, x: number, z: number): number {
  if (!inside(v, x, z)) return -1;
  const c = run(v, x, z);
  if (c < 0) return -1;
  const b = appearanceBins(v);
  const f = Math.floor(c / 1024);
  const l = c % 1024;
  const i = b.lookup[f * v.rays + l];
  return i >= 0 ? i : nearestBin(b, f, l);
}

/** Appearance bins sampled at the centres of an nx × nz grid spanning x0..x1 and z0..z1 (pass
 * z0 = FAR, z1 = NEAR for far at the top), row-major into out; -1 where no centre may sit. */
export function binGrid(
  v: Variant,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  nx: number,
  nz: number,
  out: Int32Array = new Int32Array(nx * nz),
): Int32Array {
  appearanceBins(v);
  const sx = (x1 - x0) / nx;
  const sz = (z1 - z0) / nz;
  for (let k = 0; k < nz; k++) {
    const z = z0 + (k + 0.5) * sz;
    for (let i = 0; i < nx; i++) out[k * nx + i] = binOf(v, x0 + (i + 0.5) * sx, z);
  }
  return out;
}
