// A leaf, drawn the way a hand engraves one: it clears what is behind it, its veins leave the
// midrib and bend toward the tip, it is hatched between the veins (along them) wherever light
// comes through it, and its edge is heavier on the side away from the light and lifts off
// where the light is strongest. One drawer for every leaf in the jungle; the detail follows
// how big the leaf is on the view. A leaf's shape is worked out once (its margin, where its
// veins end, where its hatching may go); each frame only places, bends and lights it.
//
// Every stroke takes its id from what it is (which vein, which hatch), counted from the id the
// caller set, so strokes that come and go with the light never re-boil the others.

import { clamp, hash, type Light, mix, type Sketch, TAU } from "../sketch";
import { strip, vdc } from "./jungle-kit";

export type V3 = [number, number, number];

export const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Rotate v about unit axis k by angle th (Rodrigues), into o. */
export function rotTo(v: V3, k: V3, th: number, o: V3): V3 {
  const c = Math.cos(th);
  const s = Math.sin(th);
  const d = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  const x = v[0] * c + (k[1] * v[2] - k[2] * v[1]) * s + k[0] * d * (1 - c);
  const y = v[1] * c + (k[2] * v[0] - k[0] * v[2]) * s + k[1] * d * (1 - c);
  const z = v[2] * c + (k[0] * v[1] - k[1] * v[0]) * s + k[2] * d * (1 - c);
  o[0] = x;
  o[1] = y;
  o[2] = z;
  return o;
}

/** Where a leaf is: base, along the midrib (a), across (b), its face (n), its length. */
export interface Frame3 {
  B: V3;
  a: V3;
  b: V3;
  n: V3;
  L: number;
}

/** A frame from a base, a direction along the midrib and roughly which way its face looks. */
export function frame(B: V3, dir: V3, face: V3, L: number): Frame3 {
  const a = norm(dir);
  const b = norm(cross(norm(face), a));
  const n = cross(a, b);
  return { B, a, b, n, L };
}

/** frame(), written into o without allocating (B is kept by reference). */
export function frameTo(
  B: V3,
  dx: number,
  dy: number,
  dz: number,
  fx: number,
  fy: number,
  fz: number,
  L: number,
  o: Frame3,
): Frame3 {
  let l = Math.hypot(dx, dy, dz) || 1;
  const ax = dx / l;
  const ay = dy / l;
  const az = dz / l;
  l = Math.hypot(fx, fy, fz) || 1;
  fx /= l;
  fy /= l;
  fz /= l;
  let bx = fy * az - fz * ay;
  let by = fz * ax - fx * az;
  let bz = fx * ay - fy * ax;
  l = Math.hypot(bx, by, bz) || 1;
  bx /= l;
  by /= l;
  bz /= l;
  o.B = B;
  o.L = L;
  o.a[0] = ax;
  o.a[1] = ay;
  o.a[2] = az;
  o.b[0] = bx;
  o.b[1] = by;
  o.b[2] = bz;
  o.n[0] = ay * bz - az * by;
  o.n[1] = az * bx - ax * bz;
  o.n[2] = ax * by - ay * bx;
  return o;
}

/** Turn frame F about axis k through its base by th, into o (reusable). */
export function turnTo(F: Frame3, k: V3, th: number, o: Frame3): Frame3 {
  o.B = F.B;
  o.L = F.L;
  rotTo(F.a, k, th, o.a);
  rotTo(F.b, k, th, o.b);
  rotTo(F.n, k, th, o.n);
  return o;
}

export const newFrame = (): Frame3 => ({
  B: [0, 0, 0],
  a: [1, 0, 0],
  b: [0, 1, 0],
  n: [0, 0, 1],
  L: 1,
});

/** The leaf's shape, in units of its length. */
export interface Form {
  /** Half-width at the widest. */
  W: number;
  /** Heart-shaped base (0 none, 1 deep lobes). */
  lobe: number;
  /** Where along it is widest (exponent: lower is nearer the base). */
  p: number;
  /** Fullness (exponent on the width). */
  q: number;
  /** The midrib bends away from its face toward the tip. */
  droop: number;
  /** The halves fold up from the midrib (a V), and cup. */
  keel: number;
  cup: number;
  /** The margin rises and falls. */
  wave: number;
  /** Scallops along the margin (count, depth). */
  scal: number;
  scalD: number;
  /** Side veins on each side. */
  veins: number;
  /** How far the veins run toward the tip as they go out. */
  slant: number;
  /** The tip runs on into a curl (turns; 0 none). */
  curl: number;
  /** The whole blade curves to one side as it goes (a sickle). */
  arc: number;
  seed: number;
}

/** What is worked out once per form. */
interface Geo {
  /** Margin points, side * (MN + 1) + i: x, y. */
  M: Float32Array;
  /** Per vein (k * 2 + side): start along the midrib, end x, end y. */
  V: Float32Array;
  /** Per hatch slot ((k * 2 + side) * HJ + j): jitter, u0, u1, threshold. */
  H: Float32Array;
}

const MN = 32;
const HJ = 8;
const GEO = new WeakMap<Form, Geo>();

/** The margin at t (0 base, 1 tip) on side s (+1/-1), in leaf units: [x along, y across]. */
function margin(F: Form, t: number, s: number, o: number[]) {
  const x = t - F.lobe * 0.17 * (1 - t) ** 5;
  let y = F.W * Math.sin(Math.PI * clamp(t, 0, 1) ** F.p) ** F.q;
  y *= 1 + F.lobe * 0.28 * (1 - t) ** 3;
  y *= 1 - F.scalD * (0.5 + 0.5 * Math.cos(t * TAU * F.scal + F.seed + (s > 0 ? 0 : 1.7)));
  // a hand never draws an even margin
  y *=
    1 +
    0.035 * Math.sin(t * 17 + F.seed * 1.3 + (s > 0 ? 0 : 2.1)) +
    0.02 * Math.sin(t * 41 + F.seed * 2.7 + (s > 0 ? 1 : 0));
  // a bite or two, out of one side
  const bc = 0.4 + 0.3 * hash(F.seed, s > 0 ? 3 : 4);
  const bd = hash(F.seed, s > 0 ? 5 : 6) < 0.5 ? 0.16 : 0;
  y *= 1 - bd * Math.exp(-(((t - bc) / 0.06) ** 2));
  o[0] = x;
  o[1] = s * y;
}

const O = [0, 0];

function geo(F: Form): Geo {
  let g = GEO.get(F);
  if (g) return g;
  const M = new Float32Array(2 * (MN + 1) * 2);
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i <= MN; i++) {
      margin(F, i / MN, side ? 1 : -1, O);
      M[(side * (MN + 1) + i) * 2] = O[0];
      M[(side * (MN + 1) + i) * 2 + 1] = O[1];
    }
  }
  const K = F.veins;
  const V = new Float32Array(K * 2 * 3);
  const H = new Float32Array(K * 2 * HJ * 4);
  for (let k = 0; k < K; k++) {
    for (let side = 0; side < 2; side++) {
      const x0 = Math.max(
        0,
        ((k + 0.35 + 0.15 * hash(F.seed + k, side ? 7 : 8)) / (K + 0.4)) * 0.86 - 0.02,
      );
      const t1 = clamp(x0 + F.slant * (1 - x0) * (0.6 + 0.4 * (1 - x0)), 0.02, 0.97);
      margin(F, t1, side ? 1 : -1, O);
      const o = (k * 2 + side) * 3;
      V[o] = x0;
      V[o + 1] = O[0];
      V[o + 2] = O[1] * 0.92;
      for (let j = 0; j < HJ; j++) {
        const h = ((k * 2 + side) * HJ + j) * 4;
        H[h] = hash(k * 13 + j, F.seed + side) - 0.5;
        H[h + 1] = 0.06 + 0.3 * hash(k * 7 + j, F.seed + 11 + side);
        H[h + 2] = 0.62 + 0.34 * hash(k * 5 + j, F.seed + 13 + side);
        H[h + 3] = hash(k * 17 + j * 3 + side, F.seed + 17);
      }
    }
  }
  g = { M, V, H };
  GEO.set(F, g);
  return g;
}

/** Extra bend toward the tip (a leaf pushed by something), set by the caller around a draw. */
let BEND = 0;
export function setBend(b: number) {
  BEND = b;
}

/** Off the face: droop along the length, the V and cup across, a wave in the margin. */
function lift(F: Form, x: number, y: number): number {
  const ay = Math.abs(y) / Math.max(1e-3, F.W);
  return (
    (F.droop + BEND) * x * x +
    F.keel * Math.abs(y) +
    F.cup * ay * ay * F.W +
    F.wave * Math.sin(x * 13 + F.seed) * ay * F.W
  );
}

function at(Fr: Frame3, F: Form, x: number, y: number, o: number[]) {
  const z = lift(F, x, y);
  y += F.arc * x * x;
  const L = Fr.L;
  o[0] = Fr.B[0] + (Fr.a[0] * x + Fr.b[0] * y + Fr.n[0] * z) * L;
  o[1] = Fr.B[1] + (Fr.a[1] * x + Fr.b[1] * y + Fr.n[1] * z) * L;
  o[2] = Fr.B[2] + (Fr.a[2] * x + Fr.b[2] * y + Fr.n[2] * z) * L;
}

/** A point on side vein (k, side) at u (0 at the midrib, 1 near the margin). */
function vein(V: Float32Array, k: number, side: number, u: number, o: number[]) {
  const i = (k * 2 + side) * 3;
  const xs = u * 0.45 + u * u * 0.55;
  o[0] = mix(V[i], V[i + 1], xs);
  o[1] = V[i + 2] * Math.sqrt(u) ** 1.2 * (0.6 + 0.4 * u);
}

export interface LeafStyle {
  light: Light;
  /** Weight multiplier. */
  w?: number;
  /** Hatch strokes between each pair of veins, where fully lit (at most 8). */
  hatch?: number;
  /** How bright the light must be before strokes appear (0..1). */
  floor?: number;
  /** Outline weight (heavier away from the light). */
  edge?: number;
  /** Draw the side veins. */
  veins?: boolean;
  /** Clear what is behind. */
  fill?: boolean;
  /** Boil amount for the detail. */
  amp?: number;
  /** Which way the light travels, for the edge weights. */
  sun?: V3;
}

const P = [0, 0, 0];
const Q = [0, 0, 0];
const VP = [0, 0];
const LA = new Float32Array(2 * (MN + 2));
const LB = new Float32Array(2 * (MN + 2));
const NLm = [0, 0, 0];
const NLp = [0, 0, 0];

const SUN0: V3 = [0.42, 0.86, 0.28];

/**
 * Draw a leaf. Returns false if it is not on the view. Uses ids from sk.id up to sk.id + 3000.
 */
export function leaf(sk: Sketch, Fr: Frame3, F: Form, st: LeafStyle): boolean {
  const base = sk.id;
  sk.id = base + 3000;
  // how big is it on the view?
  if (
    !sk.p3(
      Fr.B[0] + Fr.a[0] * Fr.L * 0.5,
      Fr.B[1] + Fr.a[1] * Fr.L * 0.5,
      Fr.B[2] + Fr.a[2] * Fr.L * 0.5,
      Q,
    )
  ) {
    if (!sk.p3(Fr.B[0] + Fr.a[0] * Fr.L, Fr.B[1] + Fr.a[1] * Fr.L, Fr.B[2] + Fr.a[2] * Fr.L, Q))
      return false;
  }
  if (Math.abs(Q[0]) > sk.A + 1.5 || Math.abs(Q[1]) > 2.5) return false;
  const size = (Fr.L * sk.foc * sk.px) / Math.max(0.1, Q[2]);
  if (size < 4) return false;
  const g = geo(F);
  const W = st.w ?? 1;
  const light = st.light;
  const sun = st.sun ?? SUN0;
  const amp0 = sk.amp;
  const stride = size > 260 ? 1 : size > 80 ? 2 : size > 30 ? 4 : 8;
  const N = MN / stride;
  const M = g.M;
  const mx = (side: number, i: number) => M[(side * (MN + 1) + i * stride) * 2];
  const my = (side: number, i: number) => M[(side * (MN + 1) + i * stride) * 2 + 1];
  // clear: two strips, margin to midrib on each side
  if (st.fill !== false) {
    sk.id = base;
    let okAll = true;
    for (let side = 0; side < 2 && okAll; side++) {
      let n = 0;
      for (let i = 0; i <= N; i++) {
        at(Fr, F, mx(side, i), my(side, i) * 1.03, P);
        if (!sk.p3(P[0], P[1], P[2], Q)) {
          okAll = false;
          break;
        }
        LA[n * 2] = Q[0];
        LA[n * 2 + 1] = Q[1];
        at(Fr, F, Math.max(0, mx(side, i)), 0, P);
        if (!sk.p3(P[0], P[1], P[2], Q)) {
          okAll = false;
          break;
        }
        LB[n * 2] = Q[0];
        LB[n * 2 + 1] = Q[1];
        n++;
      }
      if (okAll) strip(sk, LA, LB, n);
    }
    if (!okAll) {
      // near the eye: clear with the clipped outline instead
      for (let i = 0; i <= N; i++) {
        at(Fr, F, mx(0, i), my(0, i) * 1.03, P);
        if (i === 0) sk.m3(P[0], P[1], P[2]);
        else sk.l3(P[0], P[1], P[2]);
      }
      for (let i = N; i >= 0; i--) {
        at(Fr, F, mx(1, i), my(1, i) * 1.03, P);
        sk.l3(P[0], P[1], P[2]);
      }
      sk.fill3();
    }
  }
  // the light on each half (it comes through a leaf, so either face)
  const nl = (s: number, o: number[]) => {
    const nx = Fr.n[0] - s * F.keel * Fr.b[0] * 1.5;
    const ny = Fr.n[1] - s * F.keel * Fr.b[1] * 1.5;
    const nz = Fr.n[2] - s * F.keel * Fr.b[2] * 1.5;
    const l = Math.hypot(nx, ny, nz) || 1;
    o[0] = nx / l;
    o[1] = ny / l;
    o[2] = nz / l;
  };
  nl(-1, NLm);
  nl(1, NLp);
  const lit = (x: number, y: number) => {
    at(Fr, F, x, y, P);
    const n = y > 0 ? NLp : NLm;
    return light(P[0], P[1], P[2], n[0], n[1], n[2]);
  };
  const floor = st.floor ?? 0.08;
  // side veins, and hatching along them between
  const K = F.veins;
  const V = g.V;
  const H = g.H;
  const showVeins = st.veins !== false && size > 64;
  const Hs = Math.min(HJ, st.hatch ?? 3);
  const hatch = size > 70 ? Hs : size > 36 ? Math.min(2, Hs) : size > 22 ? 1 : 0;
  sk.amp = st.amp ?? 0.6;
  if (showVeins || hatch) {
    const VS = clamp(Math.round(size / 34), 3, 10);
    const HS = size > 200 ? 5 : 3;
    for (let side = 0; side < 2; side++) {
      const _s = side ? 1 : -1;
      for (let k = 0; k < K; k++) {
        // the vein: drawn where light shows it
        vein(V, k, side, 0.5, VP);
        const lv = lit(VP[0], VP[1]);
        // where light comes through strongly, the veins show as the dark between the
        // hatching; in half light they are drawn; in shadow, nothing
        if (showVeins && lv > 0.25 && lv < 0.65) {
          sk.id = base + 500 + k * 2 + side;
          const ve = 0.45 + 0.3 * H[(k * 2 + side) * HJ * 4 + 3];
          for (let i = 0; i <= VS; i++) {
            vein(V, k, side, (i / VS) * ve, VP);
            at(Fr, F, VP[0], VP[1], P);
            if (i === 0) sk.m3(P[0], P[1], P[2]);
            else sk.l3(P[0], P[1], P[2], mix(1.2, 0.6, i / VS));
          }
          sk.s3((0.35 + 0.4 * lv) * W, 0.3, 0.4);
        }
        // between this vein and the next (or the margin), strokes along them
        for (let j = 0; j < Hs; j++) {
          // fixed slots; how many show depends on the leaf's size (well spread for any count)
          if (vdc(j) * Hs >= hatch) continue;
          const h = ((k * 2 + side) * HJ + j) * 4;
          const f = 0.13 + (0.74 * (j + 0.5 + H[h] * 0.6)) / Hs;
          const u0 = H[h + 1];
          const u1 = H[h + 2];
          const um = (u0 + u1) * 0.5;
          vein(V, k, side, um, VP);
          const ax = VP[0];
          const ay = VP[1];
          if (k + 1 < K) vein(V, k + 1, side, um, VP);
          else {
            VP[0] = Math.min(0.98, ax + 0.06);
            VP[1] = ay * 0.5;
          }
          const l = lit(mix(ax, VP[0], f), mix(ay, VP[1], f));
          const thr = mix(floor, 1, H[h + 3]);
          if (l < thr) continue;
          sk.id = base + 1000 + ((k * 2 + side) * HJ + j) * 2;
          for (let i = 0; i <= HS; i++) {
            const u = mix(u0, u1, i / HS);
            vein(V, k, side, u, VP);
            const x0 = VP[0];
            const y0 = VP[1];
            if (k + 1 < K) vein(V, k + 1, side, u, VP);
            else {
              VP[0] = Math.min(0.98, x0 + 0.06 * u);
              VP[1] = y0 * (1 - 0.5 * u);
            }
            at(Fr, F, mix(x0, VP[0], f), mix(y0, VP[1], f), P);
            if (i === 0) sk.m3(P[0], P[1], P[2]);
            else sk.l3(P[0], P[1], P[2], 0.6 + 0.8 * l);
          }
          sk.s3(0.5 * W, 0.3, 0.35);
          // in the brightest light, a second, shorter stroke beside it
          if (l > 0.82 && H[h + 3] < 0.45 && size > 120) {
            sk.id = base + 1001 + ((k * 2 + side) * HJ + j) * 2;
            const f2 = Math.min(0.87, f + 0.37 / Hs);
            for (let i = 0; i <= 3; i++) {
              const u = mix(u0 + 0.1, mix(u0, u1, 0.7), i / 3);
              vein(V, k, side, u, VP);
              const x0 = VP[0];
              const y0 = VP[1];
              if (k + 1 < K) vein(V, k + 1, side, u, VP);
              else {
                VP[0] = Math.min(0.98, x0 + 0.06 * u);
                VP[1] = y0 * (1 - 0.5 * u);
              }
              at(Fr, F, mix(x0, VP[0], f2), mix(y0, VP[1], f2), P);
              if (i === 0) sk.m3(P[0], P[1], P[2]);
              else sk.l3(P[0], P[1], P[2]);
            }
            sk.s3(0.45 * W, 0.35, 0.3);
          }
        }
      }
    }
  }
  // the midrib: heavy at the base, a second line beside it near the base on big leaves
  sk.amp = 0.9;
  const lm = lit(0.4, 0);
  const MS = clamp(Math.round(size / 24), 3, 14);
  sk.id = base + 2;
  for (let i = 0; i <= MS; i++) {
    at(Fr, F, (i / MS) * 0.97, 0, P);
    if (i === 0) sk.m3(P[0], P[1], P[2]);
    else sk.l3(P[0], P[1], P[2], mix(1.5, 0.45, i / MS));
  }
  sk.s3((0.75 + 0.4 * lm) * W, 0.05, 0.6);
  if (size > 120) {
    sk.id = base + 3;
    for (let i = 0; i <= 6; i++) {
      at(Fr, F, 0.02 + (i / 6) * 0.45, F.W * 0.03 * (1 - i / 6), P);
      if (i === 0) sk.m3(P[0], P[1], P[2]);
      else sk.l3(P[0], P[1], P[2]);
    }
    sk.s3(0.55 * W, 0.3, 0.4);
  }
  // the edge: each side its own strokes, heavy away from the light, lost where it is bright
  const edge = st.edge ?? 1.2;
  sk.amp = 0.85;
  for (let side = 0; side < 2; side++) {
    const s = side ? 1 : -1;
    const face = -(Fr.b[0] * s * sun[0] + Fr.b[1] * s * sun[1] + Fr.b[2] * s * sun[2]);
    let open = false;
    let runs = 0;
    let l = 0;
    for (let i = 0; i <= N; i++) {
      if (i % 2 === 0) l = lit(mx(side, i) * 0.97, my(side, i) * 0.9);
      const lost =
        face > 0.15 &&
        l > 0.5 &&
        i > 1 &&
        i < N - 1 &&
        hash(i * stride + runs * 5, F.seed + side * 3) < 0.35;
      if (!lost) {
        at(Fr, F, mx(side, i), my(side, i), P);
        const wm =
          mix(1.25, 0.7, clamp(face + 0.5, 0, 1)) *
          (0.7 + 0.3 * Math.sin(Math.PI * clamp(i / N, 0.15, 0.85))) *
          (0.75 + 0.35 * l);
        if (!open) {
          sk.id = base + 20 + side * 200 + runs;
          sk.m3(P[0], P[1], P[2]);
          open = true;
        } else sk.l3(P[0], P[1], P[2], wm);
      } else if (open) {
        if (sk.count3 >= 2) sk.s3(edge * W, 0.08, 0.8);
        open = false;
        runs++;
      }
    }
    if (open && sk.count3 >= 2) sk.s3(edge * W, 0.06, 0.8);
  }
  // the tip runs on into a curl
  if (F.curl > 0 && size > 30) {
    sk.amp = 0.6;
    sk.id = base + 5;
    const dir = hash(F.seed, 41) < 0.5 ? 1 : -1;
    const r0 = 0.05 * (0.8 + 0.4 * hash(F.seed, 42));
    let x = 1;
    let y = 0;
    let h = 0;
    const steps = 14;
    const turn = F.curl * TAU;
    at(Fr, F, 0.97, 0, P);
    sk.m3(P[0], P[1], P[2]);
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      const r = r0 * (1 - 0.75 * u);
      h += (turn / steps) * dir;
      x += Math.cos(h) * r * (turn / steps);
      y += Math.sin(h) * r * (turn / steps);
      at(Fr, F, x, y, P);
      sk.l3(P[0], P[1], P[2], mix(1, 0.5, u));
    }
    sk.s3(0.8 * W, 0.1, 0.4);
  }
  sk.amp = amp0;
  sk.id = base + 3000;
  return true;
}

/** A point on the margin (t along, side s) of a leaf, in the world. */
export function edgePoint(Fr: Frame3, F: Form, t: number, s: number, o: number[]) {
  margin(F, t, s, O);
  at(Fr, F, O[0], O[1], o);
}

/** A point on the leaf (x along, y across, leaf units), in the world. */
export function leafPoint(Fr: Frame3, F: Form, x: number, y: number, o: number[]) {
  at(Fr, F, x, y, o);
}

/** A leaf form with sensible defaults. */
export function form(o: Partial<Form>): Form {
  return {
    W: 0.32,
    lobe: 0,
    p: 0.72,
    q: 0.9,
    droop: 0.12,
    keel: 0.12,
    cup: 0.05,
    wave: 0.03,
    scal: 0,
    scalD: 0,
    veins: 9,
    slant: 0.32,
    curl: 0,
    arc: 0,
    seed: 1,
    ...o,
  };
}

/** A stem from a to b, bowed (CSS px widths at each end). */
export function stem(sk: Sketch, a: V3, b: V3, bow: V3, w0: number, w1: number) {
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const k = 4 * t * (1 - t);
    const x = mix(a[0], b[0], t) + bow[0] * k;
    const y = mix(a[1], b[1], t) + bow[1] * k;
    const z = mix(a[2], b[2], t) + bow[2] * k;
    if (i === 0) sk.m3(x, y, z);
    else sk.l3(x, y, z, mix(1, w1 / w0, t));
  }
  sk.s3(w0, 0.05, 0.6);
}
