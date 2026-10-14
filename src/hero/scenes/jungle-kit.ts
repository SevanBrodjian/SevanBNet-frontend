// Helpers for the jungle: 2D value noise, sub-stepped springs, a deterministic stream of
// random numbers, a pen that takes a width per point, clearing strips, a solid of revolution
// drawn the way ink draws it, and the eye (with its gaze and blinks) that the jungle's
// creatures look at us with.

import { clamp, FILL, hash, INK, type Light, mix, noise, type Sketch, TAU } from "../sketch";

// ---------------------------------------------------------------- numbers

/** Smooth 2D value noise in [0, 1]. */
export function vn2(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const s = seed * 7919;
  const a = hash(ix + s, iy);
  const b = hash(ix + 1 + s, iy);
  const c = hash(ix + s, iy + 1);
  const d = hash(ix + 1 + s, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** An underdamped spring, sub-stepped so it is stable at any frame rate: s[i] position, s[i+1] velocity. */
export function spring(
  s: Float64Array,
  i: number,
  target: number,
  w: number,
  z: number,
  dt: number,
): void {
  const n = Math.max(1, Math.ceil((dt * w) / 0.15));
  const h = dt / n;
  let x = s[i];
  let v = s[i + 1];
  for (let k = 0; k < n; k++) {
    v += (w * w * (target - x) - 2 * z * w * v) * h;
    x += v * h;
  }
  s[i] = x;
  s[i + 1] = v;
}

/** The radical inverse of i in base 2: 0, 1/2, 1/4, 3/4, ... (well spread for any prefix). */
export function vdc(i: number): number {
  let x = i >>> 0;
  x = ((x & 0x55555555) << 1) | ((x >>> 1) & 0x55555555);
  x = ((x & 0x33333333) << 2) | ((x >>> 2) & 0x33333333);
  x = ((x & 0x0f0f0f0f) << 4) | ((x >>> 4) & 0x0f0f0f0f);
  x = ((x & 0x00ff00ff) << 8) | ((x >>> 8) & 0x00ff00ff);
  x = (x << 16) | (x >>> 16);
  return (x >>> 0) / 4294967296;
}

/** Numbers from a fixed stream: the same draws in the same order every time. */
export class Rand {
  k = 0;
  constructor(readonly seed: number) {}
  next(): number {
    return hash(this.seed, this.k++);
  }
}

// ---------------------------------------------------------------- a pen with a width per point

const CAP = 4096;
const IX = new Float32Array(CAP);
const IY = new Float32Array(CAP);
const IW = new Float32Array(CAP);
const OX = new Float32Array(CAP);
const OY = new Float32Array(CAP);
const OW = new Float32Array(CAP);
let IN = 0;

/** Start a path (view units) for `ink`. */
export function pm(x: number, y: number, w: number): void {
  IN = 0;
  pl(x, y, w);
}

/** Add a point and its width (CSS px). */
export function pl(x: number, y: number, w: number): void {
  if (IN < CAP) {
    IX[IN] = x;
    IY[IN] = y;
    IW[IN] = w;
    IN++;
  }
}

export function pcount(): number {
  return IN;
}

/**
 * Ink the path with its own widths: a quick start and a long lift (taper), the hand's slow
 * wander (wob, CSS px) and pressure that wanders along it.
 */
export function ink(sk: Sketch, taper = 0.12, wob = 0.5, press = 0.25, kind = INK): void {
  const id = sk.id++;
  const n = IN;
  if (n < 2) return;
  let x0 = 1e9;
  let y0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  let len = 0;
  for (let i = 0; i < n; i++) {
    const x = IX[i];
    const y = IY[i];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (i) len += Math.hypot(x - IX[i - 1], y - IY[i - 1]);
  }
  const A = sk.A + 0.05;
  if (x1 < -A || x0 > A || y1 < -1.05 || y0 > 1.05) return;
  const px = sk.px;
  const L = len * px;
  if (L < sk.minLen) return;
  // resample about every 7 px
  const want = clamp(Math.ceil(L / 7) + 1, 2, 240);
  let m = n;
  if (want > n && len > 0) {
    m = want;
    const step = len / (m - 1);
    let j = 0;
    let acc = 0;
    let seg = Math.hypot(IX[1] - IX[0], IY[1] - IY[0]);
    for (let k = 0; k < m; k++) {
      const target = k * step;
      while (j < n - 2 && acc + seg < target) {
        acc += seg;
        j++;
        seg = Math.hypot(IX[j + 1] - IX[j], IY[j + 1] - IY[j]);
      }
      const t = seg > 0 ? clamp((target - acc) / seg, 0, 1) : 0;
      OX[k] = IX[j] + (IX[j + 1] - IX[j]) * t;
      OY[k] = IY[j] + (IY[j + 1] - IY[j]) * t;
      OW[k] = IW[j] + (IW[j + 1] - IW[j]) * t;
    }
  } else {
    for (let i = 0; i < n; i++) {
      OX[i] = IX[i];
      OY[i] = IY[i];
      OW[i] = IW[i];
    }
  }
  const f = sk.f;
  if (!f.room(m)) return;
  const ws = sk.ws;
  const ph = hash(id, 11) * TAU;
  const fr = 0.6 + hash(id, 12) * 1.1;
  const am = (wob * ws * (0.5 + hash(id, 13))) / px;
  const pph = hash(id, 15) * 10;
  const pf = 1.2 + hash(id, 16) * 1.6;
  f.open(id, kind, sk.amp);
  let acc = 0;
  for (let i = 0; i < m; i++) {
    if (i) acc += Math.hypot(OX[i] - OX[i - 1], OY[i] - OY[i - 1]);
    const s = len > 0 ? acc / len : 0;
    const a = i ? i - 1 : 0;
    const b = i < m - 1 ? i + 1 : m - 1;
    let nx = -(OY[b] - OY[a]);
    let ny = OX[b] - OX[a];
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const d =
      am * (Math.sin(TAU * fr * s + ph) * 0.8 + Math.sin(TAU * 2.3 * fr * s + ph * 1.7) * 0.3);
    let tp = 1;
    if (taper > 0) {
      tp = Math.min(1, s / (taper * 0.6), (1 - s) / taper);
      tp = 0.25 + 0.75 * Math.sqrt(tp > 0 ? tp : 0);
    }
    const pr = press > 0 ? 1 + press * (noise(s * pf + pph, id) * 0.8 + 0.25 * (1 - s)) : 1;
    f.put(OX[i] + nx * d, OY[i] + ny * d, Math.max(0, OW[i] * ws * tp * pr));
  }
  f.close();
}

// ---------------------------------------------------------------- clearing

/** Clear (or fill) the band between two polylines of n points each (view units, flat x,y). */
export function strip(
  sk: Sketch,
  A: ArrayLike<number>,
  B: ArrayLike<number>,
  n: number,
  kind = FILL,
): void {
  const f = sk.f;
  const id = sk.id++;
  if (n < 2 || !f.room((n - 1) * 6)) return;
  f.open(id, kind);
  for (let i = 0; i + 1 < n; i++) {
    const a = i * 2;
    const b = a + 2;
    f.put(A[a], A[a + 1], 0);
    f.put(A[b], A[b + 1], 0);
    f.put(B[a], B[a + 1], 0);
    f.put(A[b], A[b + 1], 0);
    f.put(B[b], B[b + 1], 0);
    f.put(B[a], B[a + 1], 0);
  }
  f.close();
}

// ---------------------------------------------------------------- solids of revolution

export interface RevStyle {
  light: Light;
  /** Meridian strands round the whole form (fixed in the world). */
  m: number;
  /** Dashes along each strand. */
  dashes?: number;
  w?: number;
  /** Silhouette weight. */
  edge?: number;
  floor?: number;
  /** Turn of the strands per unit of height (a spiral). */
  twist?: number;
  /** Rings (latitude lines) where it is lit. */
  rings?: number;
  seed?: number;
  /** Erase this much wider than the silhouette (CSS px), so nothing behind leaks along the boiled edge. */
  grow?: number;
  /** Draw the silhouette at all. */
  sil?: boolean;
}

const RC = new Float64Array(65 * 4);
const SA = new Float32Array(130);
const SB = new Float32Array(130);
const Q3 = [0, 0, 0];

/**
 * A solid round a vertical axis: centre(v) and radius(v) for v in [0, 1] (v = 0 at the top).
 * Clears its inside, hatches the side facing us along fixed meridians wherever the light
 * reaches, and draws its silhouettes heavy on the shadow side, broken where lit.
 */
export function revolve(
  sk: Sketch,
  centre: (v: number, o: number[]) => void,
  radius: (v: number) => number,
  nv: number,
  st: RevStyle,
): void {
  nv = clamp(Math.round(nv), 2, 64);
  const base = sk.id;
  sk.id = base + 4000;
  const P = [0, 0, 0];
  const grow = (st.grow ?? 1) / sk.px;
  let ok = 0;
  for (let j = 0; j <= nv; j++) {
    centre(j / nv, P);
    RC[j * 4] = P[0];
    RC[j * 4 + 1] = P[1];
    RC[j * 4 + 2] = P[2];
    RC[j * 4 + 3] = radius(j / nv);
  }
  // the silhouettes: perpendicular to the way we look at each ring
  const ex = sk.ex;
  const ez = sk.ez;
  let n = 0;
  for (let j = 0; j <= nv; j++) {
    const cx = RC[j * 4];
    const cy = RC[j * 4 + 1];
    const cz = RC[j * 4 + 2];
    const r = RC[j * 4 + 3];
    const dx = cx - ex;
    const dz = cz - ez;
    const dl = Math.hypot(dx, dz) || 1;
    const px = dz / dl;
    const pz = -dx / dl;
    const okA = sk.p3(cx - px * r, cy, cz - pz * r, Q3);
    const ax = Q3[0];
    const ay = Q3[1];
    const okB = okA && sk.p3(cx + px * r, cy, cz + pz * r, Q3);
    if (!okB) continue;
    // widen a little on screen
    const ddx = Q3[0] - ax;
    const ddy = Q3[1] - ay;
    const dd = Math.hypot(ddx, ddy) || 1;
    SA[n * 2] = ax - (ddx / dd) * grow;
    SA[n * 2 + 1] = ay - (ddy / dd) * grow;
    SB[n * 2] = Q3[0] + (ddx / dd) * grow;
    SB[n * 2 + 1] = Q3[1] + (ddy / dd) * grow;
    n++;
    ok++;
  }
  sk.id = base;
  if (n >= 2) strip(sk, SA, SB, n);
  if (!ok) {
    sk.id = base + 4000;
    return;
  }
  const light = st.light;
  const w = st.w ?? 0.6;
  const floor = st.floor ?? 0.1;
  const seed = st.seed ?? 0;
  const twist = st.twist ?? 0;
  const dashes = st.dashes ?? 0;
  const M = st.m;
  // how many meridians its width on the view can hold (they join one at a time as it nears)
  let wmax = 0;
  for (let i = 1; i < n; i++)
    wmax = Math.max(wmax, Math.hypot(SB[i * 2] - SA[i * 2], SB[i * 2 + 1] - SA[i * 2 + 1]));
  const Mon = Math.max(6, (wmax * sk.px * 1.6) / 4.5);
  // meridians
  for (let s = 0; s < M; s++) {
    if (vdc(s) * M >= Mon) continue;
    const a0 = ((s + 0.5 + (hash(s, seed) - 0.5) * 0.5) / M) * TAU;
    const thr = mix(floor, 1, (s * 0.6180339 + hash(seed, 9)) % 1);
    const D = dashes > 0 ? dashes : 1;
    const shift = hash(s, seed + 5);
    let open = false;
    let run = 0;
    for (let j = 0; j <= nv; j++) {
      const v = j / nv;
      const a = a0 + twist * v;
      const cx = RC[j * 4];
      const cy = RC[j * 4 + 1];
      const cz = RC[j * 4 + 2];
      const r = RC[j * 4 + 3];
      const sa = Math.sin(a);
      const ca = Math.cos(a);
      const x = cx + sa * r;
      const z = cz + ca * r;
      // facing us?
      const fx = ex - x;
      const fz = ez - z;
      const facing = (sa * fx + ca * fz) / (Math.hypot(fx, fz) || 1);
      // slope of the profile for the normal's tilt
      const j0 = Math.max(0, j - 1);
      const j1 = Math.min(nv, j + 1);
      const dr = RC[j1 * 4 + 3] - RC[j0 * 4 + 3];
      const dy = RC[j1 * 4 + 1] - RC[j0 * 4 + 1] || 1e-6;
      let nx = sa;
      let ny = -dr / dy;
      let nz = ca;
      const nl = Math.hypot(nx, ny, nz);
      nx /= nl;
      ny /= nl;
      nz /= nl;
      // dashes: a fixed pattern along the strand
      const dpos = v * D + shift;
      const df = dpos - Math.floor(dpos);
      const inDash =
        dashes <= 0 || (df > 0.12 + 0.2 * hash(s * 31 + Math.floor(dpos), seed + 7) && df < 0.92);
      let on = false;
      let lit = 0;
      if (facing > 0.12 && inDash) {
        lit = light(x, cy, z, nx, ny, nz);
        on = lit > thr + (hash(s * 131 + j, seed + 3) - 0.5) * 0.12;
      }
      if (on) {
        const wm = 0.55 + 0.9 * lit;
        if (!open) {
          sk.id = base + 10 + s * 16 + (run & 15);
          sk.m3(x, cy, z);
          open = true;
        } else sk.l3(x, cy, z, wm);
      } else if (open) {
        if (sk.count3 >= 2) sk.s3(w, 0.3, 0.45);
        open = false;
        run++;
      }
    }
    if (open && sk.count3 >= 2) sk.s3(w, 0.3, 0.45);
  }
  // rings where lit (the form's latitude)
  const rings = st.rings ?? 0;
  for (let k = 0; k < rings; k++) {
    const v = (k + 0.5 + (hash(k, seed + 41) - 0.5) * 0.6) / rings;
    const j = Math.min(nv - 1, Math.floor(v * nv));
    const f = v * nv - j;
    const cx = mix(RC[j * 4], RC[j * 4 + 4], f);
    const cy = mix(RC[j * 4 + 1], RC[j * 4 + 5], f);
    const cz = mix(RC[j * 4 + 2], RC[j * 4 + 6], f);
    const r = mix(RC[j * 4 + 3], RC[j * 4 + 7], f);
    const fa = Math.atan2(ex - cx, ez - cz);
    let open = false;
    let run = 0;
    const thr = mix(0.25, 0.85, hash(k, seed + 43));
    for (let i = 0; i <= 14; i++) {
      const a = fa + (i / 14 - 0.5) * Math.PI * 0.9;
      const x = cx + Math.sin(a) * r;
      const z = cz + Math.cos(a) * r;
      const lit = light(x, cy, z, Math.sin(a), 0, Math.cos(a));
      if (lit > thr) {
        if (!open) {
          sk.id = base + 2500 + k * 8 + (run & 7);
          sk.m3(x, cy, z);
          open = true;
        } else sk.l3(x, cy, z, 0.6 + lit);
      } else if (open) {
        if (sk.count3 >= 2) sk.s3(w * 0.9, 0.3, 0.4);
        open = false;
        run++;
      }
    }
    if (open && sk.count3 >= 2) sk.s3(w * 0.9, 0.3, 0.4);
  }
  // silhouettes: heavy where the side is in shadow, lifted where lit
  if (st.sil === false) {
    sk.id = base + 4000;
    return;
  }
  const edge = st.edge ?? 1.2;
  for (const side of [-1, 1]) {
    let open = false;
    let run = 0;
    for (let j = 0; j <= nv; j++) {
      const cx = RC[j * 4];
      const cy = RC[j * 4 + 1];
      const cz = RC[j * 4 + 2];
      const r = RC[j * 4 + 3];
      const dx = cx - ex;
      const dz = cz - ez;
      const dl = Math.hypot(dx, dz) || 1;
      const nx = (side * dz) / dl;
      const nz = (-side * dx) / dl;
      const x = cx + nx * r;
      const z = cz + nz * r;
      const lit = light(x, cy, z, nx, 0, nz);
      const lost = lit > 0.55 && noise(j * 0.9 + side * 7, seed + 21) < -0.2;
      if (!lost) {
        const wm = mix(1.5, 0.55, clamp(lit * 1.4, 0, 1));
        if (!open) {
          sk.id = base + 3000 + (side > 0 ? 50 : 0) + (run & 31);
          sk.m3(x, cy, z);
          open = true;
        } else sk.l3(x, cy, z, wm);
      } else if (open) {
        if (sk.count3 >= 2) sk.s3(edge, 0.08, 0.8);
        open = false;
        run++;
      }
    }
    if (open && sk.count3 >= 2) sk.s3(edge, 0.08, 0.8);
  }
  sk.id = base + 4000;
}

// ---------------------------------------------------------------- eyes

/** Where an eye is looking and how open it is. */
export interface Look {
  /** Gaze across the ball (-1..1 each way); 0, 0 is straight at us. */
  gx: number;
  gy: number;
  /** Upper lid: 1 wide open, 0 shut. */
  open: number;
  /** Lower lid rising (0..1). */
  low: number;
  pupil: number;
}

export interface EyeStyle {
  seed: number;
  /** Iris radius on the ball. */
  iris?: number;
  /** Fibres in the iris (at full size). */
  fib?: number;
  /** Weight multiplier. */
  w?: number;
  /** Draw the ball's contour all round (else only where no lid covers it). */
  ring?: boolean;
  /** Lid hatching lines. */
  lidLines?: number;
}

/** Light on our eyes comes from the upper left of the view. */
const LA = Math.atan2(-0.8, -0.6);
const PUP = new Float32Array(48);

/**
 * An eye on the view at (cx, cy), ball radius R (view units), tilted. Drawn as dreamlog's are:
 * the ball clears what is behind it, a few strokes of light on its lit side, an iris of fibres
 * round a torn black pupil, a loose limbus, a catchlight with a black moat, lids that clear the
 * ball above and below them, a heavy lid margin, and the ball's edge heavy on the shadow side.
 */
export function eye(
  sk: Sketch,
  cx: number,
  cy: number,
  R: number,
  tilt: number,
  L: Look,
  st: EyeStyle,
  sq = 1,
): void {
  const rpx = R * sk.px;
  const base = sk.id;
  sk.id = base + 120;
  if (rpx < 2.2 || cx < -sk.A - R || cx > sk.A + R || cy < -1 - R || cy > 1 + R) return;
  const W = st.w ?? 1;
  const det = clamp((rpx - 5) / 26, 0, 1);
  const seed = st.seed;
  const amp = sk.amp;
  sk.push(cx, cy, tilt, R * sq, R);
  // the ball
  sk.id = base;
  sk.blot(0, 0, 1.06);
  // light on the white of the eye: short strokes on the lit side, toward the iris
  sk.amp = 0.5;
  // a fixed set of marks, each with its own place; how many show depends on the eye's size
  // (they join one at a time as it comes closer, nothing moves)
  const ns = 12;
  const nsOn = rpx < 8 ? 0 : 3 + 9 * det;
  for (let i = 0; i < ns; i++) {
    if (vdc(i) * ns >= nsOn) continue;
    const a = LA + ((i + 0.5) / ns - 0.5) * 2.0 + (hash(seed + i, 1) - 0.5) * 0.2;
    const r1 = 0.9 + 0.05 * hash(seed + i, 3);
    const r0 = mix(0.55, 0.72, hash(seed + i, 2));
    const b = 0.1 + 0.1 * hash(seed + i, 4);
    sk.id = base + 1 + i;
    sk.m(Math.cos(a) * r1, Math.sin(a) * r1)
      .q(
        Math.cos(a + b) * mix(r0, r1, 0.5),
        Math.sin(a + b) * mix(r0, r1, 0.5),
        Math.cos(a + b * 0.4) * r0,
        Math.sin(a + b * 0.4) * r0,
      )
      .s(0.5 * W, 0.4, 0.25);
  }
  // the iris: foreshortened along the gaze, its pattern fixed in the eye
  const gx = L.gx;
  const gy = L.gy;
  const g2 = Math.min(1, gx * gx + gy * gy);
  const ga = Math.atan2(gy, gx);
  const ri = st.iris ?? 0.56;
  sk.push(gx * 0.42, gy * 0.42, ga, ri * (1 - 0.32 * g2), ri);
  sk.id = base + 20;
  sk.blot(0, 0, 1.04);
  const pr = clamp(0.4 * L.pupil, 0.2, 0.7);
  const nf = Math.min(64, st.fib ?? 44);
  const nfOn = nf * (rpx < 8 ? 0.3 : 0.35 + 0.65 * det);
  sk.amp = 0.4;
  for (let i = 0; i < nf; i++) {
    if (vdc(i) * nf >= nfOn) continue;
    const a = ((i + (hash(seed + i, 5) - 0.5) * 0.7) / nf) * TAU - ga;
    const long = i % 2 === 0 ? hash(seed + i, 6) < 0.8 : hash(seed + i, 6) < 0.18;
    const r0 = pr * (long ? 1.12 : 1.5 + 0.6 * hash(seed + i, 7));
    const r1 = 0.8 + 0.18 * hash(seed + i, 8);
    if (r1 - r0 < 0.12) continue;
    const curl = (hash(seed + i, 9) - 0.5) * 0.4;
    const rm = mix(r0, r1, 0.5);
    sk.id = base + 21 + i;
    sk.m(Math.cos(a) * r0, Math.sin(a) * r0)
      .q(
        Math.cos(a + curl) * rm,
        Math.sin(a + curl) * rm,
        Math.cos(a + curl * 0.5) * r1,
        Math.sin(a + curl * 0.5) * r1,
      )
      .s((long ? 0.7 : 0.55) * W, 0.3, 0.3);
  }
  // the pupil: a torn hole
  const p1 = hash(seed, 21) * TAU;
  const p2 = hash(seed, 22) * TAU;
  const p3 = hash(seed, 23) * TAU;
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * TAU;
    PUP[i] =
      0.07 * Math.sin(3 * a + p1) + 0.05 * Math.sin(5 * a + p2) + 0.035 * Math.sin(11 * a + p3);
  }
  const nb = 4 + Math.floor(hash(seed, 24) * 4);
  for (let b = 0; b < nb; b++) {
    const c = hash(seed + b, 25) * TAU;
    const wd = 0.12 + hash(seed + b, 26) * 0.2;
    const ht = (0.12 + hash(seed + b, 27) * 0.3) * (hash(seed + b, 28) < 0.75 ? 1 : -0.45);
    for (let i = 0; i < 40; i++) {
      let d = Math.abs((i / 40) * TAU - c);
      d = Math.min(d, TAU - d);
      if (d < wd) PUP[i] += ht * (1 - d / wd);
    }
  }
  const pstep = rpx > 14 ? 1 : 2;
  for (let i = 0; i < 40; i += pstep) {
    const a = (i / 40) * TAU - ga;
    const r = Math.min(0.9, pr * (1 + PUP[i]));
    if (i === 0) sk.m(Math.cos(a) * r, Math.sin(a) * r);
    else sk.l(Math.cos(a) * r, Math.sin(a) * r);
  }
  sk.id = base + 90;
  sk.fill();
  // the limbus: a loose loop and a partial second pass
  sk.amp = 0.75;
  sk.id = base + 91;
  sk.ring(0, 0, 1, 1, 1.15 * W);
  if (rpx >= 8) {
    const la = hash(seed, sk.boil) * TAU;
    sk.id = base + 92;
    sk.arc(0, 0, 1.05, 1.05, la, la + 1.6).s(0.7 * W, 0.3, 0.4);
  }
  sk.pop();
  // the catchlight: up toward the light, fixed while the iris moves under it; a black moat
  if (L.open > 0.35 && rpx > 4) {
    sk.amp = 0.12;
    const kx = -0.3;
    const ky = -0.34;
    sk.id = base + 93;
    sk.blot(kx, ky, 0.2);
    sk.push(kx, ky, 0.5, 1, 1);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      const r = 1 + 0.18 * (hash(i + seed, sk.boil + 3) - 0.5);
      if (i === 0) sk.m(Math.cos(a) * 0.12 * r, Math.sin(a) * 0.085 * r);
      else sk.l(Math.cos(a) * 0.12 * r, Math.sin(a) * 0.085 * r);
    }
    sk.id = base + 94;
    sk.solid();
    sk.pop();
  }
  // the upper lid: a shell over the ball, its edge a great circle tipped by how open it is
  const lam = clamp((2 * L.open - 1) * 1.45, -1.52, 1.52);
  const sl = Math.sin(lam);
  const K = rpx > 14 ? 18 : 10;
  const top = (t: number) => -1.07 * Math.sin(t) - 0.03;
  const lid = (t: number) => -sl * Math.sin(t);
  sk.m(Math.cos(Math.PI) * 1.07, top(Math.PI));
  for (let i = 1; i <= K; i++) {
    const t = Math.PI - (i / K) * Math.PI;
    sk.l(Math.cos(t) * 1.07, top(t));
  }
  for (let i = K; i >= 0; i--) {
    const t = Math.PI - (i / K) * Math.PI;
    sk.l(Math.cos(t) * 1.0, lid(t));
  }
  sk.id = base + 95;
  sk.band();
  // engraved lines on the lid where the light falls on it
  sk.amp = 0.5;
  const nl = 4;
  const nlOn = st.lidLines ?? 1 + 3 * det;
  for (let k = 1; k <= nl; k++) {
    if (k > nlOn + 0.5) continue;
    const lk = lam + (k / (nl + 1)) * (1.5 - lam);
    if (lk > 1.42) continue;
    const s = Math.sin(lk);
    const t0 = Math.PI * (0.92 - 0.04 * k);
    const t1 = Math.PI * (0.42 + 0.06 * k + 0.1 * hash(seed + k, 31));
    sk.m(Math.cos(t0), -s * Math.sin(t0));
    for (let i = 1; i <= 8; i++) {
      const t = mix(t0, t1, i / 8);
      sk.l(Math.cos(t), -s * Math.sin(t));
    }
    sk.id = base + 95 + k;
    sk.s(0.5 * W, 0.35, 0.3);
  }
  // the lid's margin: heavy in the middle, running out past the corners
  sk.amp = 0.8;
  pm(-1.08, lid(Math.PI) + 0.02, 1);
  for (let i = 0; i <= K; i++) {
    const t = Math.PI - (i / K) * Math.PI;
    pl(Math.cos(t) * 1.0, lid(t), (1.0 + 1.7 * Math.sin(t)) * W);
  }
  pl(1.08, lid(0) + 0.03, 1);
  sk.id = base + 100;
  inkLocal(sk, 0.1, 0.6);
  // the lower lid: rises a little when the eye shuts
  const lo = (t: number) => (0.8 - 0.32 * L.low) * Math.sin(t);
  sk.m(-1.07, 0.03);
  for (let i = 1; i <= K; i++) {
    const t = Math.PI - (i / K) * Math.PI;
    sk.l(Math.cos(t) * 1.07, 1.07 * Math.sin(t) + 0.03);
  }
  for (let i = K; i >= 0; i--) {
    const t = Math.PI - (i / K) * Math.PI;
    sk.l(Math.cos(t), lo(t));
  }
  sk.id = base + 101;
  sk.band();
  sk.amp = 0.6;
  sk.m(Math.cos(Math.PI * 0.86), lo(Math.PI * 0.86));
  for (let i = 1; i <= 10; i++) {
    const t = mix(Math.PI * 0.86, Math.PI * 0.14, i / 10);
    sk.l(Math.cos(t), lo(t));
  }
  sk.id = base + 102;
  sk.s(0.85 * W, 0.25, 0.5);
  // the ball's edge: a loose loop, heavier through the shadow side
  sk.amp = 0.8;
  sk.id = base + 103;
  if (st.ring !== false) sk.ring(0, 0, 1.0, 1.0, 0.8 * W);
  const sa = LA + Math.PI;
  pm(Math.cos(sa - 1.3), Math.sin(sa - 1.3), 0.6 * W);
  for (let i = 1; i <= 16; i++) {
    const a = sa - 1.3 + (i / 16) * 2.6;
    pl(Math.cos(a) * 1.01, Math.sin(a) * 1.01, (0.6 + 1.5 * Math.sin((i / 16) * Math.PI)) * W);
  }
  sk.id = base + 104;
  inkLocal(sk, 0.1, 0.5);
  sk.amp = amp;
  sk.pop();
  sk.id = base + 120;
}

/** Ink the pen's path through the sketch's current 2D transform. */
function inkLocal(sk: Sketch, taper: number, wob: number): void {
  const n = pcount();
  for (let i = 0; i < n; i++) {
    const x = IX[i];
    const y = IY[i];
    IX[i] = sk.vx(x, y);
    IY[i] = sk.vy(x, y);
  }
  ink(sk, taper, wob);
}

/** Ink the pen's path through the sketch's current 2D transform (for callers in a push()). */
export function inkT(sk: Sketch, taper = 0.12, wob = 0.5): void {
  inkLocal(sk, taper, wob);
}

// ---------------------------------------------------------------- gaze and blinks

/**
 * Where an eye looks and when it blinks, simulated: fixations held, then saccades that fall a
 * little short with a correction after, microsaccades, a share of the time straight at us;
 * blinks that close fast and open slowly, sometimes doubled, sometimes slow or half; lids that
 * follow the gaze down; a pupil that never quite holds still.
 */
export class Gaze {
  s = new Float64Array(8); // gx, vgx, gy, vgy, lid, vlid, pupil, vpupil
  fx = 0;
  fy = 0;
  next = 0;
  micro = 0;
  bt = -9;
  nextBlink = 0;
  dbl = false;
  kind = 0;
  viewer = true;
  k = 0;
  /** Something can ask it to look somewhere (view units of the ball) until a time. */
  forceX = 0;
  forceY = 0;
  forceUntil = -1;

  constructor(
    readonly seed: number,
    readonly rest = 0.82,
    readonly range = 0.7,
    readonly share = 0.4,
  ) {
    this.reset();
  }

  private r(): number {
    return hash(this.seed, this.k++);
  }

  reset(): void {
    this.k = 0;
    this.s.fill(0);
    this.s[4] = this.rest;
    this.s[6] = 1;
    this.fx = (this.r() - 0.5) * this.range;
    this.fy = (this.r() - 0.5) * this.range * 0.5;
    this.s[0] = this.fx;
    this.s[2] = this.fy;
    this.next = 0.3 + this.r() * 1.2;
    this.micro = 0.5;
    this.bt = -9;
    this.nextBlink = 0.6 + this.r() * 3.2;
    this.viewer = false;
    this.forceUntil = -1;
  }

  /** Blink now (the next one is planned from here). */
  blink(t: number, kind = 0): void {
    if (t - this.bt < 0.5) return;
    this.bt = t;
    this.kind = kind;
    this.dbl = this.r() < 0.15;
    this.nextBlink = t + 2.4 + this.r() * 4.4;
  }

  step(dt: number, t: number): void {
    const s = this.s;
    if (t < this.forceUntil) {
      const big = Math.hypot(this.forceX - this.fx, this.forceY - this.fy) > 0.04;
      if (big) {
        this.fx = this.forceX;
        this.fy = this.forceY;
      }
      this.viewer = Math.hypot(this.forceX, this.forceY) < 0.08;
      this.next = t + 0.3 + this.r() * 0.5;
    } else if (t >= this.next) {
      const old = Math.hypot(this.fx - s[0], this.fy - s[2]);
      void old;
      let tx: number;
      let ty: number;
      let hold: number;
      if (this.r() < this.share) {
        tx = (this.r() - 0.5) * 0.06;
        ty = (this.r() - 0.5) * 0.06;
        hold = 1.3 + this.r() * 1.8;
        this.viewer = true;
      } else {
        tx = (this.r() - 0.5) * 2 * this.range;
        ty = (this.r() - 0.45) * this.range * 0.9;
        hold = 0.35 + this.r() * 1.1;
        this.viewer = false;
      }
      // falls short; the correction follows
      const under = 0.9 + this.r() * 0.07;
      const jump = Math.hypot(tx - this.fx, ty - this.fy);
      this.fx = this.fx + (tx - this.fx) * under;
      this.fy = this.fy + (ty - this.fy) * under;
      this.next = t + hold;
      this.micro = t + 0.16;
      this.cx = tx;
      this.cy = ty;
      if (jump > 0.5 && this.r() < 0.25) this.blink(t);
    } else if (t >= this.micro) {
      // first the correction, then small drifts
      if (this.cx !== null && this.cy !== null) {
        this.fx = this.cx;
        this.fy = this.cy;
        this.cx = null;
        this.cy = null;
      } else {
        this.fx += (this.r() - 0.5) * 0.05;
        this.fy += (this.r() - 0.5) * 0.04;
      }
      this.micro = t + 0.35 + this.r() * 0.9;
    }
    spring(s, 0, this.fx, 38, 0.8, dt);
    spring(s, 2, this.fy, 38, 0.8, dt);
    // blinks
    if (t >= this.nextBlink) this.blink(t, this.r() < 0.12 ? 1 : this.r() < 0.12 ? 2 : 0);
    const restLid = this.rest + (this.viewer ? 0.05 : 0) - 0.16 * s[2];
    spring(s, 4, restLid, 22, 0.85, dt);
    // pupil: wider on us, hippus always
    const hip = 0.06 * Math.sin(1.9 * t + this.seed) * Math.sin(0.67 * t + 1 + this.seed);
    const pt = (this.viewer ? 1.12 : 1) + hip;
    spring(s, 6, pt, pt < s[6] ? 30 : 11, 0.9, dt);
  }

  private cx: number | null = null;
  private cy: number | null = null;

  /** How shut a blink has the lids at t (0..1). */
  shut(t: number): number {
    const sc = this.kind === 1 ? 2.6 : 1;
    let b = (t - this.bt) / sc;
    let v = 0;
    const prof = (x: number) =>
      x < 0 ? 0 : x < 0.07 ? x / 0.07 : x < 0.11 ? 1 : x < 0.26 ? 1 - (x - 0.11) / 0.15 : 0;
    v = prof(b);
    if (this.dbl) {
      b -= 0.38 / sc;
      v = Math.max(v, prof(b));
    }
    return this.kind === 2 ? v * 0.55 : v;
  }

  look(t: number, out: Look): Look {
    const s = this.s;
    const b = this.shut(t);
    out.gx = s[0];
    out.gy = s[2];
    out.open = clamp(s[4], 0, 1.1) * (1 - b);
    out.low = b;
    out.pupil = s[6];
    return out;
  }
}
