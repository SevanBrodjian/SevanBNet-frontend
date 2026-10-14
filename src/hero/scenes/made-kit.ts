// Tools for the made world: one low sun, solid blocks drawn the way an engraver draws them
// (cleared, then hatched along their own faces where the sun reaches, outlined heavier on
// the shadow side), and cast shadows found exactly: every caster's shadow is projected onto
// a receiving plane as a convex polygon, and the hatch strands on that plane stop where
// they enter one.
//
// Every stroke here gets a stable id from what it is (which face, which strand, which
// cell), never from how many strokes came before it, so the boil of a mark never changes
// because something elsewhere appeared or went into shadow.

import { clamp, hash, mix, type Sketch } from "../sketch";

export type V3 = [number, number, number];

/** Settings shared by everything the kit draws: dens thins all hatching evenly (by rank), for
 *  small canvases where a fixed number of strands per metre would crowd. */
export const KIT = { dens: 1 };

/** The sun: the way toward it (x, y, z, y down). Its light travels the other way. */
export const SUN = { x: 0, y: -1, z: 0 };

export function setSun(az: number, el: number) {
  SUN.x = Math.cos(el) * Math.sin(az);
  SUN.y = -Math.sin(el);
  SUN.z = Math.cos(el) * Math.cos(az);
}

/** Lambert: how squarely a face with normal n meets the sun (negative: turned away). */
export const lam = (nx: number, ny: number, nz: number) => nx * SUN.x + ny * SUN.y + nz * SUN.z;

/** The golden-ratio rank of strand i: strands are admitted lowest rank first, so any
 *  density keeps them evenly spread. */
export const rank = (i: number, salt: number) => (i * 0.6180339887 + hash(salt, 77)) % 1;

// ---------------------------------------------------------------- shadows on a plane

const MAXPOLY = 256;

/** A plane that receives shadows: origin, two unit axes in it; shadows are kept as convex
 *  polygons in its own (u, v) coordinates (metres). */
export class Receiver {
  o: V3 = [0, 0, 0];
  u: V3 = [1, 0, 0];
  v: V3 = [0, 1, 0];
  n: V3 = [0, 0, 1];
  count = 0;
  private PU = new Float64Array(MAXPOLY * 8);
  private PV = new Float64Array(MAXPOLY * 8);
  private PN = new Int32Array(MAXPOLY);
  private BB = new Float64Array(MAXPOLY * 4);
  private tu = new Float64Array(16);
  private tv = new Float64Array(16);
  private hu = new Float64Array(16);
  private hv = new Float64Array(16);

  set(o: V3, u: V3, v: V3) {
    this.o = o;
    this.u = u;
    this.v = v;
    let nx = u[1] * v[2] - u[2] * v[1];
    let ny = u[2] * v[0] - u[0] * v[2];
    let nz = u[0] * v[1] - u[1] * v[0];
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    // the normal points out of the lit side
    if (lam(nx, ny, nz) < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    this.n = [nx, ny, nz];
    this.count = 0;
  }

  /** Cast the shadow of a solid given by its corners (flat x, y, z list of k points). */
  cast(C: ArrayLike<number>, k = 8) {
    if (this.count >= MAXPOLY) return;
    const [nx, ny, nz] = this.n;
    // light travels along -SUN; it meets the plane after t
    const dn = -(SUN.x * nx + SUN.y * ny + SUN.z * nz);
    if (dn > -1e-4) return;
    const [ox, oy, oz] = this.o;
    const U = this.u;
    const V = this.v;
    let anyIn = false;
    for (let i = 0; i < k; i++) {
      const x = C[i * 3] - ox;
      const y = C[i * 3 + 1] - oy;
      const z = C[i * 3 + 2] - oz;
      const s = x * nx + y * ny + z * nz;
      if (s > 0.001) anyIn = true;
      const t = Math.max(0, -s / dn);
      const px = x - SUN.x * t;
      const py = y - SUN.y * t;
      const pz = z - SUN.z * t;
      this.tu[i] = px * U[0] + py * U[1] + pz * U[2];
      this.tv[i] = px * V[0] + py * V[1] + pz * V[2];
    }
    if (!anyIn) return;
    // convex hull (monotone chain) of the k projected points
    const idx = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].slice(0, k);
    const tu = this.tu;
    const tv = this.tv;
    idx.sort((a, b) => tu[a] - tu[b] || tv[a] - tv[b]);
    const H: number[] = [];
    const cross = (o: number, a: number, b: number) =>
      (tu[a] - tu[o]) * (tv[b] - tv[o]) - (tv[a] - tv[o]) * (tu[b] - tu[o]);
    for (const p of idx) {
      while (H.length >= 2 && cross(H[H.length - 2], H[H.length - 1], p) <= 0) H.pop();
      H.push(p);
    }
    const lo = H.length + 1;
    for (let i = idx.length - 2; i >= 0; i--) {
      const p = idx[i];
      while (H.length >= lo && cross(H[H.length - 2], H[H.length - 1], p) <= 0) H.pop();
      H.push(p);
    }
    H.pop();
    if (H.length < 3) return;
    const c = this.count++;
    const m = Math.min(8, H.length);
    let u0 = 1e9;
    let u1 = -1e9;
    let v0 = 1e9;
    let v1 = -1e9;
    for (let i = 0; i < m; i++) {
      const uu = tu[H[i]];
      const vv = tv[H[i]];
      this.PU[c * 8 + i] = uu;
      this.PV[c * 8 + i] = vv;
      if (uu < u0) u0 = uu;
      if (uu > u1) u1 = uu;
      if (vv < v0) v0 = vv;
      if (vv > v1) v1 = vv;
    }
    this.PN[c] = m;
    this.BB[c * 4] = u0;
    this.BB[c * 4 + 1] = u1;
    this.BB[c * 4 + 2] = v0;
    this.BB[c * 4 + 3] = v1;
    void this.hu;
    void this.hv;
  }

  /** Cast an axis-aligned box. */
  castBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    BOX[0] = x0;
    BOX[1] = y0;
    BOX[2] = z0;
    BOX[3] = x1;
    BOX[4] = y0;
    BOX[5] = z0;
    BOX[6] = x0;
    BOX[7] = y1;
    BOX[8] = z0;
    BOX[9] = x1;
    BOX[10] = y1;
    BOX[11] = z0;
    for (let i = 0; i < 12; i++) BOX[12 + i] = BOX[i];
    for (let i = 0; i < 4; i++) BOX[12 + i * 3 + 2] = z1;
    this.cast(BOX, 8);
  }

  /** Whether (u, v) on the plane is in shadow. */
  inside(u: number, v: number): boolean {
    for (let p = 0; p < this.count; p++) {
      if (
        u < this.BB[p * 4] ||
        u > this.BB[p * 4 + 1] ||
        v < this.BB[p * 4 + 2] ||
        v > this.BB[p * 4 + 3]
      )
        continue;
      const m = this.PN[p];
      let ok = true;
      for (let i = 0; i < m && ok; i++) {
        const j = (i + 1) % m;
        const ax = this.PU[p * 8 + i];
        const ay = this.PV[p * 8 + i];
        const cr = (this.PU[p * 8 + j] - ax) * (v - ay) - (this.PV[p * 8 + j] - ay) * (u - ax);
        if (cr < 0) ok = false;
      }
      if (ok) return true;
    }
    return false;
  }

  /** The shadowed stretches of the line u = c (v from, v to), into IV; returns how many. */
  along(c: number, IV: Float64Array): number {
    let k = 0;
    for (let p = 0; p < this.count; p++) {
      if (c < this.BB[p * 4] || c > this.BB[p * 4 + 1]) continue;
      const m = this.PN[p];
      let lo = 1e9;
      let hi = -1e9;
      for (let i = 0; i < m; i++) {
        const j = (i + 1) % m;
        const ua = this.PU[p * 8 + i];
        const ub = this.PU[p * 8 + j];
        if ((ua - c) * (ub - c) > 0 || ua === ub) continue;
        const va = this.PV[p * 8 + i];
        const vb = this.PV[p * 8 + j];
        const vv = va + ((c - ua) / (ub - ua)) * (vb - va);
        if (vv < lo) lo = vv;
        if (vv > hi) hi = vv;
      }
      if (hi > lo && k < IV.length / 2) {
        IV[k * 2] = lo;
        IV[k * 2 + 1] = hi;
        k++;
      }
    }
    return k;
  }
}

const BOX = new Float64Array(24);

// ---------------------------------------------------------------- hatching a flat face

export interface Hatch {
  /** Stable id base for the face. */
  id: number;
  /** Strands across u, and cells along each strand (both fixed to the face). */
  n: number;
  cells: number;
  /** Light on the face, 0..1, or per point (u, v in metres). */
  tone: number;
  toneAt?: ((u: number, v: number) => number) | null;
  /** Width at no light and at full light. */
  w0?: number;
  w1?: number;
  /** Shadows: a receiver whose frame is this face's (same origin and axes). */
  rec?: Receiver | null;
  /** Dark recesses: rectangles u0, v0, u1, v1 (metres), flat. */
  holes?: number[] | null;
  /** How much of the hatching distance lets through (0..1) at a point of the face. */
  keep?: ((u: number, v: number) => number) | null;
  /** How freely the pen starts and lifts in each cell (0 tidy, 1 loose). */
  pen?: number;
  /** How far the cells' strands wander sideways, in spacings. */
  wander?: number;
  /** Boil amount. */
  amp?: number;
  taper?: number;
  /** Index of the first cell among the face's cells (a face drawn from a moving start keeps
   *  every mark's look tied to its own cell). */
  j0?: number;
  /** Only u < uMax and v < vMax of the face exists yet (the rest is still inside something);
   *  uMin and vMin likewise from the other side. */
  uMax?: number;
  vMax?: number;
  uMin?: number;
  vMin?: number;
  /** Where strand i begins and ends along v (metres), for faces that give out raggedly. */
  vLo?: ((i: number) => number) | null;
  vHi?: ((i: number) => number) | null;
  /** Density multiplier on top of the light (0..1). */
  dens?: number;
  /** Stagger each strand's breaks along its length by up to this many cells (0: the breaks
   *  line up across the face, as storeys do). */
  stagger?: number;
}

const IV = new Float64Array(256);
const PA = new Float64Array(64);
const PB = new Float64Array(64);
const S0 = [0, 0, 0];
const S1 = [0, 0, 0];

/**
 * The part of the 3D segment a -> b that falls on the view (with a margin), as fractions of
 * its length, into R; false when none of it does. Both ends must be in front of the eye.
 */
function onView(
  sk: Sketch,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  R: number[],
): boolean {
  R[0] = 0;
  R[1] = 1;
  if (!sk.p3(ax, ay, az, S0) || !sk.p3(bx, by, bz, S1)) return true;
  const m = 0.12;
  const X0 = -sk.A - m;
  const X1 = sk.A + m;
  const Y0 = -1 - m;
  const Y1 = 1 + m;
  const dx = S1[0] - S0[0];
  const dy = S1[1] - S0[1];
  let s0 = 0;
  let s1 = 1;
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > s1) return false;
      if (r > s0) s0 = r;
    } else {
      if (r < s0) return false;
      if (r < s1) s1 = r;
    }
    return true;
  };
  if (
    !clip(-dx, S0[0] - X0) ||
    !clip(dx, X1 - S0[0]) ||
    !clip(-dy, S0[1] - Y0) ||
    !clip(dy, Y1 - S0[1])
  )
    return false;
  // from fractions along the drawn line back to fractions along the 3D segment
  const z0 = S0[2];
  const z1 = S1[2];
  R[0] = (s0 * z0) / (z1 - s0 * (z1 - z0));
  R[1] = (s1 * z0) / (z1 - s1 * (z1 - z0));
  return true;
}
const VR = [0, 1];

/**
 * Hatch a flat face: origin o, unit axes U (across the strands) and V (along them), sizes
 * LU and LV metres. Strands sit at fixed u, each broken into cells along v; a strand shows
 * where the light admits its rank, minus shadows and recesses.
 */
export function hatchFace(sk: Sketch, o: V3, U: V3, LU: number, V: V3, LV: number, h: Hatch) {
  const n = h.n;
  const cells = h.cells;
  if (n <= 0 || cells <= 0) return;
  const w0 = h.w0 ?? 0.45;
  const w1 = h.w1 ?? 0.85;
  const pen = h.pen ?? 0.5;
  const wander = h.wander ?? 0.22;
  const taper = h.taper ?? 0.3;
  const prevAmp = sk.amp;
  sk.amp = h.amp ?? 0.5;
  const cl = LV / cells;
  const j0 = h.j0 ?? 0;
  const uMax = h.uMax ?? 1e9;
  const vMax = h.vMax ?? 1e9;
  const uMin = h.uMin ?? -1e9;
  const vMin = h.vMin ?? -1e9;
  const dens = KIT.dens * (h.dens ?? 1);
  const stagger = h.stagger ?? 0;
  for (let i = 0; i < n; i++) {
    const g = rank(i, h.id);
    if (g - 0.05 >= dens) continue;
    const lo = h.vLo ? Math.max(vMin, h.vLo(i)) : vMin;
    const hi = h.vHi ? Math.min(vMax, h.vHi(i)) : vMax;
    if (hi <= lo) continue;
    const ub = ((i + 0.5 + (hash(i, h.id) - 0.5) * 0.45) / n) * LU;
    let ni = h.rec ? h.rec.along(ub, IV) : 0;
    if (h.holes) {
      const H = h.holes;
      for (let k = 0; k < H.length; k += 4) {
        if (ub >= H[k] && ub <= H[k + 2] && ni < 127) {
          IV[ni * 2] = H[k + 1];
          IV[ni * 2 + 1] = H[k + 3];
          ni++;
        }
      }
    }
    // only the cells of this strand that can be seen are worth drawing
    if (
      !onView(
        sk,
        o[0] + U[0] * ub,
        o[1] + U[1] * ub,
        o[2] + U[2] * ub,
        o[0] + U[0] * ub + V[0] * LV,
        o[1] + U[1] * ub + V[1] * LV,
        o[2] + U[2] * ub + V[2] * LV,
        VR,
      )
    )
      continue;
    const vA = VR[0] * LV - cl * 0.5;
    const vB = VR[1] * LV + cl * 0.5;
    const ph = stagger > 0 ? stagger * hash(i, h.id + 9) : 0;
    for (let j = ph > 0 ? -1 : 0; j < cells; j++) {
      const key = i * 7919 + (j + j0) * 104729;
      const k1 = hash(key, h.id + 1);
      const c0 = (j + ph) * cl;
      if (c0 >= hi || c0 >= LV || c0 > vB) break;
      if (c0 + cl < vA || c0 + cl <= lo) continue;
      let a = Math.max(0, lo, c0 + cl * pen * 0.3 * k1);
      let b = Math.min(hi, LV, c0 + cl - cl * pen * 0.45 * hash(key, h.id + 2));
      if (b <= a) continue;
      const vm = (a + b) * 0.5;
      const u = ub + (hash(key, h.id + 3) - 0.5) * wander * (LU / n);
      if (u > uMax || u < uMin) continue;
      const tone = h.toneAt ? h.toneAt(u, vm) : h.tone;
      const kp = h.keep ? h.keep(u, vm) : 1;
      if (tone * kp * dens <= g + (k1 - 0.5) * 0.1) continue;
      // cut out the shadows and recesses
      let np = 1;
      PA[0] = a;
      PB[0] = b;
      const ragMax = Math.min(cl * 0.12, 0.35);
      for (let s = 0; s < ni && np > 0; s++) {
        // a shadow that cannot reach this cell, however its edge wavers, cuts nothing
        if (IV[s * 2] - ragMax * 0.5 >= b || IV[s * 2 + 1] + ragMax * 0.5 <= a) continue;
        // its edges waver by hand, less for a narrow shadow, each the same every frame (keyed
        // by where the shadow is, not by its place in the list)
        const rag = Math.min(ragMax, (IV[s * 2 + 1] - IV[s * 2]) * 0.35);
        const sk0 = key + (((IV[s * 2] + j0 * cl) * 5) | 0);
        const s0 = IV[s * 2] + (hash(sk0, h.id + 4) - 0.5) * rag;
        const s1 = IV[s * 2 + 1] + (hash(sk0, h.id + 5) - 0.5) * rag;
        let q = 0;
        const m = np;
        for (let p = 0; p < m; p++) {
          const pa = PA[p];
          const pb = PB[p];
          if (s1 <= pa || s0 >= pb) {
            PA[q] = pa;
            PB[q] = pb;
            q++;
            continue;
          }
          if (s0 > pa && q < 63) {
            PA[q] = pa;
            PB[q] = s0;
            q++;
          }
          if (s1 < pb && q < 63) {
            PA[q] = s1;
            PB[q] = pb;
            q++;
          }
        }
        np = q;
      }
      const w = mix(w0, w1, tone) * (0.85 + 0.3 * hash(key, h.id + 6));
      for (let p = 0; p < np; p++) {
        a = PA[p];
        b = PB[p];
        if (b - a < cl * 0.06) continue;
        sk.id = h.id * 7 + key * 3 + p;
        sk.m3(o[0] + U[0] * u + V[0] * a, o[1] + U[1] * u + V[1] * a, o[2] + U[2] * u + V[2] * a)
          .l3(o[0] + U[0] * u + V[0] * b, o[1] + U[1] * u + V[1] * b, o[2] + U[2] * u + V[2] * b)
          .s3(w, taper, 0.35);
      }
    }
  }
  sk.amp = prevAmp;
}

// ---------------------------------------------------------------- solids

/** Corner index bits: 1 along a, 2 along b, 4 along c. Faces, each as 4 corners going
 *  first along its own first axis (q0 -> q1) then its second (q0 -> q3). */
export const FACES = [
  [0, 2, 6, 4], // a = 0: axes b, c
  [1, 3, 7, 5], // a = 1: axes b, c
  [0, 1, 5, 4], // b = 0: axes a, c
  [2, 3, 7, 6], // b = 1: axes a, c
  [0, 1, 3, 2], // c = 0: axes a, b
  [4, 5, 7, 6], // c = 1: axes a, b
];
/** Edges: corner pairs and the two faces that meet there. */
export const EDGES: number[][] = [];
{
  const pairs = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  for (const [a, b] of pairs) {
    const fs: number[] = [];
    FACES.forEach((f, fi) => {
      if (f.includes(a) && f.includes(b)) fs.push(fi);
    });
    EDGES.push([a, b, fs[0], fs[1]]);
  }
}

/** How a face is hatched: strands along its first (0) or second (1) axis; spacing in metres. */
export interface FaceInk {
  along: 0 | 1;
  gap: number;
  cells: number;
  tone?: number;
  toneAt?: ((u: number, v: number) => number) | null;
  rec?: Receiver | null;
  holes?: number[] | null;
  keep?: number;
  pen?: number;
  w0?: number;
  w1?: number;
  stagger?: number;
  wander?: number;
  /** A second, sparser family across the first (for the brightest faces only); its tone and
   *  holes are in its own axes. */
  cross?: FaceInk | null;
}

export interface Solid {
  /** 8 corners, flat. */
  C: Float64Array;
  id: number;
  /** Contour weight. */
  edge: number;
  /** Faces never drawn (inside something, or where another part joins): bit per face. */
  hidden?: number;
  /** How each face is hatched (null: left bare). */
  ink?: (fi: number, nx: number, ny: number, nz: number, tone: number) => FaceInk | null;
  /** Light on a face from its normal (default: Lambert, made generous). */
  tone?: (nx: number, ny: number, nz: number) => number;
  /** Contours toward lit faces may break; amount 0..1. */
  lost?: number;
  /** Retrace the heaviest contours a second time. */
  retrace?: boolean;
  /** Overshoot at corners, CSS px. */
  over?: number;
  amp?: number;
}

const NRM = new Float64Array(18);
const CEN = new Float64Array(18);
const VIS = new Uint8Array(6);
const TON = new Float64Array(6);

export const defaultTone = (nx: number, ny: number, nz: number) =>
  clamp((lam(nx, ny, nz) - 0.03) * 2.1, 0, 1);

/** Depth of a solid's middle from the eye (for painter's order). */
export function solidDepth(sk: Sketch, C: ArrayLike<number>, k = 8) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < k; i++) {
    x += C[i * 3];
    y += C[i * 3 + 1];
    z += C[i * 3 + 2];
  }
  return Math.hypot(x / k - sk.ex, y / k - sk.ey, z / k - sk.ez);
}

/** Draw a six-faced solid: clear its visible faces, hatch them by the light, then its edges. */
export function solid(sk: Sketch, s: Solid) {
  const C = s.C;
  let mx = 0;
  let my = 0;
  let mz = 0;
  for (let i = 0; i < 8; i++) {
    mx += C[i * 3];
    my += C[i * 3 + 1];
    mz += C[i * 3 + 2];
  }
  mx /= 8;
  my /= 8;
  mz /= 8;
  const hidden = s.hidden ?? 0;
  const toneF = s.tone ?? defaultTone;
  let anyVis = false;
  for (let f = 0; f < 6; f++) {
    const q = FACES[f];
    const a = q[0] * 3;
    const b = q[1] * 3;
    const c = q[2] * 3;
    const d = q[3] * 3;
    // normal from the diagonals, turned away from the middle
    const e1x = C[c] - C[a];
    const e1y = C[c + 1] - C[a + 1];
    const e1z = C[c + 2] - C[a + 2];
    const e2x = C[d] - C[b];
    const e2y = C[d + 1] - C[b + 1];
    const e2z = C[d + 2] - C[b + 2];
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const cx = (C[a] + C[b] + C[c] + C[d]) / 4;
    const cy = (C[a + 1] + C[b + 1] + C[c + 1] + C[d + 1]) / 4;
    const cz = (C[a + 2] + C[b + 2] + C[c + 2] + C[d + 2]) / 4;
    if ((cx - mx) * nx + (cy - my) * ny + (cz - mz) * nz < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    NRM[f * 3] = nx;
    NRM[f * 3 + 1] = ny;
    NRM[f * 3 + 2] = nz;
    CEN[f * 3] = cx;
    CEN[f * 3 + 1] = cy;
    CEN[f * 3 + 2] = cz;
    const facing = (sk.ex - cx) * nx + (sk.ey - cy) * ny + (sk.ez - cz) * nz > 1e-6;
    VIS[f] = facing && !(hidden & (1 << f)) ? 1 : 0;
    if (VIS[f]) anyVis = true;
    TON[f] = toneF(nx, ny, nz);
  }
  if (!anyVis) return;
  // clear
  for (let f = 0; f < 6; f++) {
    if (!VIS[f]) continue;
    const q = FACES[f];
    sk.m3(C[q[0] * 3], C[q[0] * 3 + 1], C[q[0] * 3 + 2]);
    for (let i = 1; i < 4; i++) sk.l3(C[q[i] * 3], C[q[i] * 3 + 1], C[q[i] * 3 + 2]);
    sk.fill3();
  }
  // hatch
  if (s.ink) {
    for (let f = 0; f < 6; f++) {
      if (!VIS[f]) continue;
      const fi = s.ink(f, NRM[f * 3], NRM[f * 3 + 1], NRM[f * 3 + 2], TON[f]);
      if (!fi) continue;
      const tone = fi.tone ?? TON[f];
      if (tone <= 0.02 && !fi.toneAt) continue;
      const q = FACES[f];
      const o: V3 = [C[q[0] * 3], C[q[0] * 3 + 1], C[q[0] * 3 + 2]];
      const ax: V3 = [C[q[1] * 3] - o[0], C[q[1] * 3 + 1] - o[1], C[q[1] * 3 + 2] - o[2]];
      const bx: V3 = [C[q[3] * 3] - o[0], C[q[3] * 3 + 1] - o[1], C[q[3] * 3 + 2] - o[2]];
      const la = Math.hypot(ax[0], ax[1], ax[2]) || 1;
      const lb = Math.hypot(bx[0], bx[1], bx[2]) || 1;
      ax[0] /= la;
      ax[1] /= la;
      ax[2] /= la;
      bx[0] /= lb;
      bx[1] /= lb;
      bx[2] /= lb;
      // strands along 'along': across the other axis
      const U = fi.along === 0 ? bx : ax;
      const V = fi.along === 0 ? ax : bx;
      const LU = fi.along === 0 ? lb : la;
      const LV = fi.along === 0 ? la : lb;
      hatchFace(sk, o, U, LU, V, LV, {
        id: s.id * 16 + f,
        n: Math.max(1, Math.round(LU / fi.gap)),
        cells: fi.cells,
        tone,
        toneAt: fi.toneAt,
        rec: fi.rec,
        holes: fi.holes,
        keep: fi.keep !== undefined ? () => fi.keep as number : null,
        pen: fi.pen,
        w0: fi.w0,
        w1: fi.w1,
        stagger: fi.stagger,
        wander: fi.wander,
      });
      const c = fi.cross;
      if (c) {
        const U2 = c.along === 0 ? bx : ax;
        const V2 = c.along === 0 ? ax : bx;
        const LU2 = c.along === 0 ? lb : la;
        const LV2 = c.along === 0 ? la : lb;
        hatchFace(sk, o, U2, LU2, V2, LV2, {
          id: s.id * 16 + f + 700001,
          n: Math.max(1, Math.round(LU2 / c.gap)),
          cells: c.cells,
          tone: c.tone ?? tone,
          toneAt: c.toneAt,
          rec: c.rec,
          holes: c.holes,
          pen: c.pen,
          w0: c.w0,
          w1: c.w1,
          stagger: c.stagger,
          wander: c.wander,
        });
      }
    }
  }
  // edges: heavy where the solid turns away into shadow, light (and broken) where it is lit
  const prevAmp = sk.amp;
  sk.amp = s.amp ?? 1;
  const over = s.over ?? 1.2;
  const lost = s.lost ?? 0.5;
  for (let e = 0; e < 12; e++) {
    const [ia, ib, fa, fb] = EDGES[e];
    if (hidden & (1 << fa) || hidden & (1 << fb)) continue;
    const va = VIS[fa];
    const vb = VIS[fb];
    if (!va && !vb) continue;
    const ta = TON[fa];
    const tb = TON[fb];
    let w: number;
    let breaks = false;
    if (va && vb) {
      // a crease between two faces we see
      w = s.edge * (0.75 + 0.35 * (1 - Math.max(ta, tb)));
      breaks = Math.min(ta, tb) > 0.35;
    } else {
      // the silhouette: heavy unless both sides are lit
      const tv = va ? ta : tb;
      const th = va ? tb : ta;
      w = s.edge * (th > 0.3 && tv > 0.3 ? 0.8 : 1.15 + 0.5 * (1 - tv));
      breaks = th > 0.3 && tv > 0.3;
    }
    const x0 = C[ia * 3];
    const y0 = C[ia * 3 + 1];
    const z0 = C[ia * 3 + 2];
    const x1 = C[ib * 3];
    const y1 = C[ib * 3 + 1];
    const z1 = C[ib * 3 + 2];
    const key = s.id * 64 + e * 4;
    if (breaks && lost > 0) {
      // a lost edge: the line lifts off where the light is strongest
      const g0 = 0.2 + 0.5 * hash(key, 3);
      const g1 = g0 + lost * (0.12 + 0.25 * hash(key, 4));
      sk.id = key;
      sk.m3(x0, y0, z0)
        .l3(mix(x0, x1, g0), mix(y0, y1, g0), mix(z0, z1, g0))
        .s3(w, 0.15, 0.7, w, over);
      if (g1 < 0.97) {
        sk.id = key + 1;
        sk.m3(mix(x0, x1, g1), mix(y0, y1, g1), mix(z0, z1, g1))
          .l3(x1, y1, z1)
          .s3(w, 0.15, 0.7, w, over);
      }
    } else {
      sk.id = key;
      sk.m3(x0, y0, z0).l3(x1, y1, z1).s3(w, 0.06, 0.8, w, over);
      if (s.retrace && w > s.edge * 1.2) {
        // a second, lighter pass over part of it, a little off
        const g0 = 0.1 * hash(key, 5);
        const g1 = 0.45 + 0.5 * hash(key, 6);
        sk.id = key + 2;
        sk.m3(mix(x0, x1, g0), mix(y0, y1, g0), mix(z0, z1, g0))
          .l3(mix(x0, x1, g1), mix(y0, y1, g1), mix(z0, z1, g1))
          .s3(w * 0.55, 0.3, 1.4);
      }
    }
  }
  sk.amp = prevAmp;
}

/** Corners of an axis-aligned box into C. */
export function boxC(
  C: Float64Array,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
) {
  for (let i = 0; i < 8; i++) {
    C[i * 3] = i & 1 ? x1 : x0;
    C[i * 3 + 1] = i & 2 ? y1 : y0;
    C[i * 3 + 2] = i & 4 ? z1 : z0;
  }
  return C;
}

// ---------------------------------------------------------------- springs

/** An underdamped spring, sub-stepped so it is stable at any frame rate. */
export function spring(
  s: { x: number; v: number },
  target: number,
  w: number,
  z: number,
  dt: number,
) {
  const n = Math.max(1, Math.ceil((dt * w) / 0.15));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += (w * w * (target - s.x) - 2 * z * w * s.v) * h;
    s.x += s.v * h;
  }
}
