// The land round the lake, worked out once: a mountain range (a heightfield of ridged noise
// over a few great masses), seen from where we sit and kept as an image over bearing u and
// rise v: at each cell, how far away the ground there is, how high it stands, which way it
// faces the afterglow and which way water would run down it on the screen. From that come
// the skyline, the inner edges where a nearer ridge stands in front of a farther slope, and
// the hachures that run down the fall lines. And the low wooded shore across the water.

import { clamp, hash, smooth } from "../sketch";

/** Eye height over the water. */
export const H0 = 0.95;

// ---------------------------------------------------------------- noise

const R2 = Math.SQRT1_2;
const GX = [1, -1, 0, 0, R2, -R2, R2, -R2];
const GY = [0, 0, 1, -1, R2, R2, -R2, -R2];

/** 2D gradient noise, about [-1, 1]. */
export function perlin(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = (hash(ix * 7919 + iy * 104729, seed) * 8) | 0;
  const b = (hash((ix + 1) * 7919 + iy * 104729, seed) * 8) | 0;
  const c = (hash(ix * 7919 + (iy + 1) * 104729, seed) * 8) | 0;
  const d = (hash((ix + 1) * 7919 + (iy + 1) * 104729, seed) * 8) | 0;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const n0 = GX[a] * fx + GY[a] * fy;
  const n1 = GX[b] * (fx - 1) + GY[b] * fy;
  const n2 = GX[c] * fx + GY[c] * (fy - 1);
  const n3 = GX[d] * (fx - 1) + GY[d] * (fy - 1);
  const top = n0 + (n1 - n0) * ux;
  return (top + (n2 + (n3 - n2) * ux - top) * uy) * 1.41;
}

/** Ridged noise: sharp crests, 0..1. */
function ridged(x: number, y: number): number {
  let sum = 0;
  let amp = 0.5;
  let w = 1;
  let f = 1;
  let norm = 0;
  for (let o = 0; o < 5; o++) {
    let n = 1 - Math.abs(perlin(x * f, y * f, 700 + o));
    n *= n;
    n *= w;
    w = clamp(n * 1.6, 0, 1);
    sum += n * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

// ---------------------------------------------------------------- the range

/** The great masses: bearing, rise of the summit, distance, and reach across and in depth (m). */
const MASSES: readonly [number, number, number, number, number][] = [
  [-0.56, 0.34, 8600, 2700, 2300],
  [-0.95, 0.26, 9800, 3600, 2600],
  [-0.27, 0.2, 7200, 1900, 1700],
  [0.07, 0.1, 6200, 2000, 2000],
  [0.55, 0.23, 8200, 2300, 1900],
  [0.92, 0.26, 9800, 3200, 2600],
  [1.3, 0.2, 9000, 3000, 2500],
  [-1.3, 0.22, 9000, 3000, 2500],
];

function terrain(x: number, z: number): number {
  let env = 0;
  for (const [u, v, mz, sx, sz] of MASSES) {
    const dx = (x - u * mz) / sx;
    const dz = (z - mz) / sz;
    const r = Math.sqrt(dx * dx + dz * dz);
    if (r < 1) env = Math.max(env, v * mz * (1 - r) ** 1.5);
  }
  // foothills, low and rolling near, rising toward the range
  const foot =
    z * (0.01 + 0.028 * smooth(2000, 7000, z)) * (0.65 + 0.35 * perlin(x / 1300, z / 1300, 711));
  const r = ridged(x / 2400, z / 2400);
  return Math.max(foot, env * (0.55 + 0.6 * r)) + 130 * r * smooth(2500, 7000, z);
}

/** Columns over bearing, steps out in distance, rows up in rise. */
export const RU0 = -1.35;
export const RNU = 450;
export const RDU = 2.7 / (RNU - 1);
const RNZ = 140;
const RZ0 = 1800;
const RZ1 = 12600;
export const RV0 = -0.004;
export const RDV = 0.0025;
export const RNV = 150;
const ZS = new Float32Array(RNZ);
for (let k = 0; k < RNZ; k++) ZS[k] = RZ0 * (RZ1 / RZ0) ** (k / (RNZ - 1));

/** Where the afterglow comes from (y up): low in the west, behind us and to the left. */
const LL = Math.hypot(0.5, 0.3, 0.81);
const LX = -0.5 / LL;
const LY = 0.3 / LL;
const LZ = -0.81 / LL;

/** Per cell: the distance step seen (-1: sky), facing (to a power), height (m), fall line (du, dv),
 *  ragged. */
const CZ = new Float32Array(RNU * RNV).fill(-1);
const CF = new Float32Array(RNU * RNV);
const CH = new Float32Array(RNU * RNV);
const CDU = new Float32Array(RNU * RNV);
const CDV = new Float32Array(RNU * RNV);
const CN = new Float32Array(RNU * RNV);
/** The skyline's rise over each column. */
export const RE = new Float32Array(RNU);
/** The highest ground (m). */
export let HMAX = 0;
/** Inner edges: polylines of (u, v, distance step). */
export const CHAINS: Float32Array[] = [];
/** Hachures: polylines of (u, v), and per hachure its threshold and weight. */
export const HACH: Float32Array[] = [];
export const HTHR: number[] = [];
export const HW: number[] = [];

/** Builds the range in slices (it is a lot of work): the scene calls landStep() a little each
 *  frame from the start of the hero, and ensureLand() before it first draws. */
function* build(): Generator<void, void, void> {
  const HG = new Float32Array(RNU * RNZ);
  for (let iu = 0; iu < RNU; iu++) {
    if ((iu & 15) === 15) yield;
    const u = RU0 + iu * RDU;
    for (let k = 0; k < RNZ; k++) HG[iu * RNZ + k] = terrain(u * ZS[k], ZS[k]);
  }
  // facing and fall line at every grid point
  const FG = new Float32Array(RNU * RNZ);
  const DUG = new Float32Array(RNU * RNZ);
  const DVG = new Float32Array(RNU * RNZ);
  for (let iu = 0; iu < RNU; iu++) {
    if ((iu & 15) === 15) yield;
    const u = RU0 + iu * RDU;
    const ia = Math.max(0, iu - 1);
    const ib = Math.min(RNU - 1, iu + 1);
    for (let k = 0; k < RNZ; k++) {
      const z = ZS[k];
      const ka = Math.max(0, k - 1);
      const kb = Math.min(RNZ - 1, k + 1);
      const Hu = (HG[ib * RNZ + k] - HG[ia * RNZ + k]) / ((ib - ia) * RDU);
      const Hzu = (HG[iu * RNZ + kb] - HG[iu * RNZ + ka]) / (ZS[kb] - ZS[ka]);
      const Hx = Hu / z;
      const Hz = Hzu - Hx * u;
      const nl = Math.hypot(Hx, 1, Hz);
      FG[iu * RNZ + k] = clamp((-Hx * LX + LY - Hz * LZ) / nl, 0, 1);
      const h = HG[iu * RNZ + k];
      const vv = (h - H0) / z;
      const dy = -(Hx * Hx + Hz * Hz);
      let du = (-Hx + u * Hz) / z;
      let dv = (dy + vv * Hz) / z;
      const dl = Math.hypot(du, dv);
      if (dl < 1e-9) {
        du = 0;
        dv = -1;
      } else {
        du /= dl;
        dv /= dl;
      }
      DUG[iu * RNZ + k] = du;
      DVG[iu * RNZ + k] = dv;
    }
  }
  // look along each column, near to far: what rises above what is already seen is seen
  const EDGES: number[][] = [];
  for (let iu = 0; iu < RNU; iu++) {
    if ((iu & 15) === 15) yield;
    let maxv = RV0 - RDV;
    let maxk = 0;
    let prevV = -1;
    let hidden = 0;
    const edges: number[] = [];
    for (let k = 0; k < RNZ; k++) {
      const h = HG[iu * RNZ + k];
      if (h > HMAX) HMAX = h;
      const v = (h - H0) / ZS[k];
      if (v > maxv) {
        // the ground comes back into view over a nearer ridge: an inner edge
        if (hidden > 1 && ZS[k] / ZS[maxk] > 1.08) edges.push(maxv, maxk);
        const r0 = Math.max(0, Math.ceil((maxv - RV0) / RDV));
        const r1 = Math.min(RNV - 1, Math.floor((v - RV0) / RDV));
        for (let r = r0; r <= r1; r++) {
          const rv = RV0 + r * RDV;
          CZ[iu * RNV + r] = k > 0 && prevV < rv ? k - 1 + (rv - prevV) / (v - prevV) : k;
        }
        maxv = v;
        maxk = k;
        hidden = 0;
      } else hidden++;
      prevV = v;
    }
    RE[iu] = maxv;
    EDGES.push(edges);
  }
  // what each cell shows
  for (let iu = 0; iu < RNU; iu++) {
    if ((iu & 15) === 15) yield;
    for (let r = 0; r < RNV; r++) {
      const i = iu * RNV + r;
      const kf = CZ[i];
      if (kf < 0) continue;
      const k0 = Math.min(RNZ - 2, Math.floor(kf));
      const f = kf - k0;
      const a = iu * RNZ + k0;
      CF[i] = (FG[a] + (FG[a + 1] - FG[a]) * f) ** 1.15;
      CH[i] = HG[a] + (HG[a + 1] - HG[a]) * f;
      const du = DUG[a] + (DUG[a + 1] - DUG[a]) * f;
      const dv = DVG[a] + (DVG[a + 1] - DVG[a]) * f;
      const dl = Math.hypot(du, dv) || 1;
      CDU[i] = du / dl;
      CDV[i] = dv / dl;
      const u = RU0 + iu * RDU;
      const v = RV0 + r * RDV;
      CN[i] = 150 * perlin(u * 30, v * 60, 721) + 60 * perlin(u * 90, v * 150, 722);
    }
  }
  // link the inner edges across columns into lines
  type Ch = { pts: number[]; v: number; k: number; iu: number };
  let active: Ch[] = [];
  const done = (c: Ch) => {
    if (c.pts.length >= 12) CHAINS.push(new Float32Array(c.pts));
  };
  for (let iu = 0; iu < RNU; iu++) {
    const u = RU0 + iu * RDU;
    const next: Ch[] = [];
    const ed = EDGES[iu];
    for (let e = 0; e < ed.length; e += 2) {
      const v = ed[e];
      const k = ed[e + 1];
      let best = -1;
      let bd = 0.007;
      for (let a = 0; a < active.length; a++) {
        const c = active[a];
        const d = Math.abs(c.v - v) + Math.abs(Math.log(ZS[k] / ZS[c.k])) * 0.05;
        if (d < bd) {
          bd = d;
          best = a;
        }
      }
      if (best >= 0) {
        const c = active[best];
        active.splice(best, 1);
        c.pts.push(u, v, k);
        c.v = v;
        c.k = k;
        c.iu = iu;
        next.push(c);
      } else next.push({ pts: [u, v, k], v, k, iu });
    }
    // lines may skip a column
    for (const c of active) {
      if (iu - c.iu < 2) next.push(c);
      else done(c);
    }
    active = next;
  }
  for (const c of active) done(c);
  // hachures: from bands down each column, in bursts, following the fall lines
  let burst = 0;
  let bOff = 0;
  let bLen = 0.03;
  let n = 0;
  const P: number[] = [];
  for (let iu = 2; iu < RNU - 2; iu++) {
    if (burst <= 0) {
      burst = 3 + Math.floor(hash(iu, 401) * 6);
      if (hash(iu, 402) < 0.35) iu += 1 + Math.floor(hash(iu, 403) * 2);
      bOff = hash(iu, 404);
      bLen = 0.018 + 0.026 * hash(iu, 405);
      if (iu >= RNU - 2) break;
    }
    burst--;
    const top = RE[iu];
    if (top < RV0 + 0.008) continue;
    const u0 = RU0 + (iu + (hash(iu, 408) - 0.5) * 0.6) * RDU;
    for (
      let v0 = top - bLen * (0.15 + 0.5 * bOff) - 0.002 * hash(iu, 406);
      v0 > RV0 + 0.004;
      v0 -= bLen * (0.85 + 0.35 * hash(n, 407))
    ) {
      const len = bLen * (0.55 + 0.6 * hash(n, 409));
      P.length = 0;
      let u = u0;
      let v = v0;
      let i0 = cell(u, v);
      if (i0 >= 0) {
        P.push(u, v);
        const step = 0.0032;
        for (let s = 0; s < len; s += step) {
          u += CDU[i0] * step;
          v += CDV[i0] * step;
          const i = cell(u, v);
          if (i < 0 || Math.abs(CZ[i] - CZ[i0]) > 5) break;
          i0 = i;
          P.push(u, v);
        }
      }
      if (P.length >= 6) {
        HACH.push(new Float32Array(P));
        HTHR.push(0.06 + 0.88 * ((n * 0.618034 + 0.31) % 1));
        HW.push(0.8 + 0.4 * hash(n, 410));
      }
      n++;
    }
  }
}

let builder: Generator<void, void, void> | null = build();

/** Spend up to `ms` building the range; true once it is ready. */
export function landStep(ms: number): boolean {
  if (!builder) return true;
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    if (builder.next().done) {
      builder = null;
      return true;
    }
  }
  return false;
}

/** Finish building the range now. */
export function ensureLand(): void {
  while (builder && !builder.next().done);
  builder = null;
}

/** The cell at (u, v), or -1 off the range or in the sky. */
export function cell(u: number, v: number): number {
  const iu = Math.round((u - RU0) / RDU);
  const r = Math.round((v - RV0) / RDV);
  if (iu < 0 || iu >= RNU || r < 0 || r >= RNV) return -1;
  const i = iu * RNV + r;
  return CZ[i] < 0 ? -1 : i;
}

/** The skyline's rise at u. */
export function ridgeAt(u: number): number {
  const f = clamp((u - RU0) / RDU, 0, RNU - 1.001);
  const i = f | 0;
  return RE[i] + (RE[i + 1] - RE[i]) * (f - i);
}

/** How much light the ground at cell i holds: the afterglow (its strength, and the height (m)
 *  the earth's shadow has climbed to), and under the shadow a little of the twilit sky (sky). */
export function cellLum(i: number, alpen: number, hs: number, sky = 0): number {
  if (alpen <= 0.01) return 0;
  const g = CH[i] - hs + CN[i];
  const f = 0.08 + 0.92 * CF[i];
  if (g < -160) return sky * f;
  return alpen * f * (sky + (1 - sky) * smooth(-160, 180, g));
}

/** The same at (u, v); -1 where it is sky. */
export function rangeLum(u: number, v: number, alpen: number, hs: number, sky = 0): number {
  const i = cell(u, v);
  return i < 0 ? -1 : cellLum(i, alpen, hs, sky);
}

/** How far away the ground at cell i is, as a step (for weights of nearer edges). */
export function cellNear(i: number): number {
  return 1 - CZ[i] / (RNZ - 1);
}

/** The moonlit air between us and the ground at cell i (worked out once for the moon's bearing
 *  MU0): more of it further off, and toward the moon. */
export const MU0 = 0.18;
const CA = new Float32Array(RNU * RNV);
for (let i = 0; i < RNU * RNV; i++) {
  if (CZ[i] < 0) continue;
  const u = RU0 + Math.floor(i / RNV) * RDU;
  CA[i] = smooth(0.2, 0.95, CZ[i] / (RNZ - 1)) * (0.1 + 0.9 * Math.exp(-Math.abs(u - MU0) / 0.3));
}
export function cellAir(i: number, air: number): number {
  return air * CA[i];
}

// ---------------------------------------------------------------- the low wooded shore

export const U0 = -1.8;
export const U1 = 2.2;
export const UR = 400;
export const NU = Math.ceil((U1 - U0) * UR) + 2;
export const D_H = 760;
/** The woods' top over the water at each bearing (rise from the water), and the highest land as
 *  the eye sees it. */
export const E_H = new Float32Array(NU);
export const E_TOP = new Float32Array(NU);

export function look(tab: Float32Array, u: number): number {
  const f = clamp((u - U0) * UR, 0, NU - 2.001);
  const i = f | 0;
  return tab[i] + (tab[i + 1] - tab[i]) * (f - i);
}

{
  // the woods: pines in spires along a low rolling shore, with clearings
  for (let i = 0; i < NU; i++) {
    const u = U0 + i / UR;
    E_H[i] = Math.max(
      0.006,
      0.014 +
        0.007 * Math.sin(u * 2.6 + 1.3) +
        0.005 * Math.sin(u * 6.1 + 0.4) +
        0.003 * perlin(u * 13, 0.5, 41),
    );
  }
  const base = E_H.slice();
  let s = U0;
  let n = 0;
  while (s < U1) {
    if (perlin(s * 3.1, 0.5, 44) > -0.35) {
      const sh = 0.006 + 0.016 * hash(n, 45) ** 1.3;
      const sw = 0.0022 + 0.0022 * hash(n, 46);
      const i0 = Math.max(0, Math.floor((s - sw - U0) * UR));
      const i1 = Math.min(NU - 1, Math.ceil((s + sw - U0) * UR));
      const b = base[Math.round((s - U0) * UR)] ?? 0.01;
      for (let i = i0; i <= i1; i++) {
        const p = Math.abs(U0 + i / UR - s) / sw;
        if (p < 1) E_H[i] = Math.max(E_H[i], b + sh * (1 - p) ** 1.25);
      }
    }
    s += 0.0028 + 0.005 * hash(n, 47);
    n++;
  }
  for (let i = 0; i < NU; i++) {
    const u = U0 + i / UR;
    E_TOP[i] = Math.max(ridgeAt(u), E_H[i] - H0 / D_H);
  }
}
