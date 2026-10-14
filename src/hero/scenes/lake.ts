// 5. The lake. Dusk going to night, low on the water, as if sitting in a small boat. A far
// range still holds the last of the afterglow; the light climbs its faces as the earth's
// shadow rises and goes out on the highest peak, while the sky round the large moon above
// them grows brighter, until the range stands black against it. Mist lies along the far
// shore. All of it is again in the water, drawn as broken level strokes that the swell bends
// and the hand redraws, and the moon's light lies across it as a path of glints that wink. A
// heron stands in the shallows; a clump of reeds sways at the edge of the moon's path. It is
// the hour of the evening rise: here and there a fish takes a fly at the surface, once rolling
// over in the moon's path, and the rings spread and break the image. Fireflies blink, and
// blink again in the water under them. Toward the end the swell dies away, the path draws in
// to a second moon with the stars coming out round it, our gaze sinks to it, and the eyes
// close (the engine's blink).
//
// Light is ink: the sky is drawn only where the moon and the glow light it, the land is black
// where the light has left it, and the water is drawn wherever it mirrors something lit. The
// water is not painted with a picture of the sky: each stroke asks which way that bit of
// surface (tilted by the swell and the rings) throws our gaze, and what is there.
//
// Far things are placed by bearing: u is the tangent of the bearing (right positive), v the
// rise over level (up positive), as seen from where we are.

import type { Scene } from "../engine";
import { clamp, hash, mix, noise, type Sketch, smooth, TAU } from "../sketch";
import { Heron, HX, HZ, heron } from "./lake-heron";
import { pcount, pink, pl, pm, strip } from "./lake-kit";
import {
  CHAINS,
  cell,
  cellLum,
  cellNear,
  D_H,
  E_H,
  E_TOP,
  ensureLand,
  H0,
  HACH,
  HMAX,
  HTHR,
  HW,
  landStep,
  look,
  MU0,
  RDU,
  RE,
  RNU,
  RU0,
  rangeLum,
  ridgeAt,
} from "./lake-land";

const DUR = 13.6;
const FOC = 1.25;
/** Resting tilt down. */
const PITCH = 0.085;
/** The moon on the sky plane, and its radius there. */
const MU = MU0;
const MV = 0.215;
const MR = 0.1;
/** How far away the sky is drawn (it only needs to be far), and the range. */
const SKYD = 9000;
const FARD = 8000;

// ---------------------------------------------------------------- per frame

const C = {
  t: 0,
  A: 1.2,
  px: 350,
  boil: 0,
  ex: 0,
  ez: 0,
  H: H0,
  /** The bearing at the middle of the view, and half the view's width in bearing. */
  uc: 0,
  span: 1,
  calm: 1,
  /** The afterglow on the range, and the height (m) the earth's shadow has climbed to. */
  alpen: 1,
  hs: 200,
  /** The twilit sky's light on the slopes in shadow. */
  amb: 0.2,
  glow: 0.5,
  /** The moonlit haze over the far slopes. */
  air: 0.2,
  halo: 0.6,
  /** How far the halo reaches. */
  hr: 0.2,
  mx: 0,
  my: 0,
  mr: 0.1,
};

const Q = [0, 0, 0];
const Q2 = [0, 0, 0];
let SK: Sketch;

/** Project a point on the sky plane into Q. */
function sky(u: number, v: number): boolean {
  return SK.p3(u * SKYD, -v * SKYD, SKYD, Q);
}
/** Project the point at bearing u, rise v, distance D into Q. */
function far(u: number, v: number, D: number): boolean {
  return SK.p3(u * D, -v * D, D, Q);
}

// ---------------------------------------------------------------- the sky

/** The lit sky: the moon's halo and the glow low over the land (not the disc). */
function skyLum(u: number, v: number, hk = 1): number {
  const dm = Math.max(0, Math.hypot(u - MU, v - MV) - MR) * 500;
  const di = dm | 0;
  const halo = di < 999 ? hk * (HALO[di] + (HALO[di + 1] - HALO[di]) * (dm - di)) : 0;
  const vi = Math.min(999, Math.max(0, v * 500) | 0);
  const ui = Math.min(999, (Math.abs(u - MU) * 500) | 0);
  return halo + C.glow * LOWV[vi] * LOWU[ui];
}

/** The halo by distance from the moon's edge (per frame), and the glow's falloffs. */
const HALO = new Float32Array(1001);
const LOWV = new Float32Array(1000);
const LOWU = new Float32Array(1000);
for (let i = 0; i < 1000; i++) {
  LOWV[i] = Math.exp(-i / 500 / 0.22);
  LOWU[i] = 0.55 + 0.45 * Math.exp(-i / 500 / 0.35);
}
function haloTable() {
  for (let i = 0; i <= 1000; i++) {
    const dm = i / 500;
    HALO[i] = C.halo * (0.55 * Math.exp(-dm / 0.03) + 0.38 * Math.exp(-dm / C.hr));
  }
}

const MARIA: readonly [number, number, number, number, number][] = [
  // a, b (b down), radii, depth: the familiar face of the full moon
  [-0.36, -0.42, 0.27, 0.22, 1],
  [0.17, -0.38, 0.16, 0.15, 1],
  [0.33, -0.04, 0.2, 0.17, 0.95],
  [0.72, -0.27, 0.11, 0.1, 1],
  [0.58, 0.22, 0.12, 0.16, 0.85],
  [0.36, 0.34, 0.09, 0.09, 0.8],
  [-0.62, 0.05, 0.26, 0.42, 0.8],
  [-0.2, 0.42, 0.18, 0.12, 0.75],
  [-0.52, 0.48, 0.09, 0.08, 0.75],
  [-0.05, -0.72, 0.4, 0.06, 0.6],
];

function mare(a: number, b: number): number {
  let m = 0;
  for (let i = 0; i < MARIA.length; i++) {
    const [ma, mb, ra, rb, dp] = MARIA[i];
    const d = Math.hypot((a - ma) / ra, (b - mb) / rb) + 0.1 * noise(a * 7 + b * 5 + i * 3.3, 91);
    if (d < 1.1) m = Math.max(m, dp * smooth(1.1, 0.55, d));
  }
  return m;
}

/** The moon's face at (u, v) on the sky plane, 0..1. */
function moonTone(u: number, v: number): number {
  return 1 - 0.6 * mare((u - MU) / MR, (MV - v) / MR);
}

/** What a ray from a point at distance z out on the water sees in direction (u, v): 0..1. */
function seen(u: number, v: number, z: number): number {
  if (z > D_H - 2 || v < look(E_H, u) * (D_H / (D_H - z))) return 0;
  const ci = cell(u, v);
  if (ci >= 0) return cellLum(ci, C.alpen, C.hs, C.amb);
  return Math.hypot(u - MU, v - MV) < MR ? moonTone(u, v) : skyLum(u, v, 0.45);
}

interface Star {
  u: number;
  v: number;
  b: number;
  at: number;
  i: number;
}
const STARS: Star[] = [];
for (let i = 0; i < 400 && STARS.length < 46; i++) {
  const u = -1.0 + 2.0 * hash(i, 101);
  const v = 0.2 + 0.5 * hash(i, 102);
  if (Math.hypot(u - MU, v - MV) < 0.3) continue;
  // no two close together
  if (STARS.some((s) => Math.hypot(s.u - u, s.v - v) < 0.08)) continue;
  const b = hash(i, 103) ** 2.2;
  STARS.push({ u, v, b, at: 1.2 + 10.5 * (1 - b) * (0.35 + 0.65 * hash(i, 104)), i });
}

// ---------------------------------------------------------------- the water's surface

const WAVES: readonly [number, number, number, number, number][] = [
  // kx, kz (rad/m), slope, omega, phase
  [0.15, 1.55, 0.0085, 0.92, 0.3],
  [-0.4, 1.1, 0.006, 1.27, 2.1],
  [0.7, 2.45, 0.0042, 1.95, 4.4],
  [0.2, 4.3, 0.0032, 2.7, 1.2],
];
/** The slopes along z count for less: they stretch the images up and down, which loses them. */
const WK = WAVES.map(([kx, kz]) => Math.hypot(kx, kz));
const ZK = 0.6;

interface Ring {
  x: number;
  z: number;
  t0: number;
  a: number;
  c: number;
}

/** Fish taking flies at the surface: when, where (m), how hard. Only the rings show. */
const RISES: readonly [number, number, number, number][] = [
  [1.4, -2.9, 15, 0.05],
  [4.3, MU * 4.7 + 0.12, 4.7, 0.085],
  [7.5, MU * 3.5 + 0.12, 3.5, 0.07],
  [10.4, 3.2, 18, 0.045],
];
const RINGS: Ring[] = [];
for (const [t, x, z, a] of RISES) {
  RINGS.push({ x, z, t0: t, a, c: 0.34 });
  RINGS.push({ x, z, t0: t + 0.3, a: a * 0.55, c: 0.3 });
}

/** How much of the swell there is at distance z: it dies through the scene, and is least far
 *  out, where the water lies in the lee of the far shore and mirrors it. */
function swellAmp(z: number): number {
  const dz = Math.max(0.5, z - C.ez);
  return (0.1 + 0.9 * C.calm) * Math.min(1, 2.5 / dz) ** 0.8;
}

/** Slopes of the surface at (x, z), into S: the swell, the rings. */
const S = [0, 0];
function slopes(x: number, z: number) {
  const t = C.t;
  let sx = 0;
  let sz = 0;
  const amp = swellAmp(z);
  for (let i = 0; i < WAVES.length; i++) {
    const w = WAVES[i];
    const s = amp * w[2] * Math.cos(w[0] * x + w[1] * z - w[3] * t + w[4]);
    sx += (s * w[0]) / WK[i];
    sz += (ZK * s * w[1]) / WK[i];
  }
  S[0] = sx;
  S[1] = sz;
  ringSlopes(x, z);
}

/** Add the rings' slopes at (x, z) to S. */
function ringSlopes(x: number, z: number) {
  const t = C.t;
  for (const r of RINGS) {
    const age = t - r.t0;
    if (age <= 0 || age > 9) continue;
    const R = r.c * age;
    const wr = 0.07 + 0.05 * age;
    const dx = x - r.x;
    const dz = z - r.z;
    if (Math.abs(dz) > R + 3 * wr || Math.abs(dx) > R + 3 * wr) continue;
    const d = Math.sqrt(dx * dx + dz * dz) + 1e-4;
    const q = (d - R) / wr;
    if (q < -3 || q > 3) continue;
    const A = (r.a * Math.exp(-age / 3.4)) / Math.sqrt(1 + R / 0.3);
    const s = A * Math.exp(-q * q) * Math.sin(3.4 * q);
    S[0] += (s * dx) / d;
    S[1] += (s * dz) / d;
  }
}

/** Where (x, z) on the water throws our gaze, given slopes (sx, sz): into Q2 as (u, v). */
function reflect(x: number, z: number, sx: number, sz: number) {
  const dx = x - C.ex;
  const dy = C.H;
  const dz = z - C.ez;
  const nl = 1 / Math.sqrt(1 + sx * sx + sz * sz);
  const nx = -sx * nl;
  const ny = -nl;
  const nz = -sz * nl;
  const dn = dx * nx + dy * ny + dz * nz;
  const rx = dx - 2 * dn * nx;
  const ry = dy - 2 * dn * ny;
  const rz = dz - 2 * dn * nz;
  Q2[0] = rx / rz;
  Q2[1] = -ry / rz;
}

/** How brightly the water at (x, z) shows; cellId: its stroke cell (for the winking glints). */
function waterLum(x: number, z: number, cellId: number): number {
  slopes(x, z);
  return waterLumS(x, z, cellId);
}

/** The same, with the surface's slopes already in S. */
function waterLumS(x: number, z: number, cellId: number): number {
  rowConsts(z);
  return waterLumR(x, z, cellId);
}

/** What waterLumR needs that holds along a row at distance z. */
const WR = { dz: 1, R: 1, su: 0.01, near: 1, jit: 1 };
function rowConsts(z: number, k = 0) {
  const dz = z - C.ez;
  const dep = C.H / dz;
  WR.dz = dz;
  WR.near = Math.min(1, 2.5 / dz) ** 0.8;
  // a mirror, more so at a glance
  WR.R = 0.6 + 0.4 * Math.exp(-dep / 0.05);
  // the moon's path narrows toward the far shore and widens toward us, its edge ragged where
  // the swell runs a little higher
  WR.su = (0.003 + 0.036 * C.calm) * (0.15 + 1.2 * Math.min(1.2, dep / 0.5));
  WR.jit = 1 + 0.3 * C.calm * noise(k * 0.83 + C.t * 0.45, 32);
}

/** The same, along a row whose constants are set. */
function waterLumR(x: number, z: number, cellId: number): number {
  // facets too small to draw, tilted afresh each time the hand redraws
  const fr = (0.002 + 0.011 * C.calm) * (0.3 + 0.7 * WR.near);
  const sx = S[0] + (hash(cellId, C.boil * 2 + 1) - 0.5) * fr;
  const sz = S[1] + (hash(cellId, C.boil * 2 + 2) - 0.5) * fr * 1.5;
  reflect(x, z, sx, sz);
  const u = Q2[0];
  const v = Q2[1];
  const l0 = seen(u, v, WR.dz);
  // the moon itself, seen in still water: its face again, every line of it
  const inDisc = Math.hypot(u - MU, v - MV) < MR;
  const L = WR.R * (inDisc ? 0.62 + 0.38 * l0 : l0 ** 0.85);
  // the moon's glitter: of all the facets in this bit of water, how many find the moon (how
  // far each would have to tilt, across and along, to catch some of its disc)
  const su = WR.su;
  const du = (u - MU) / WR.jit;
  if (Math.abs(du) > MR + 6 * su) return L;
  const sv = 0.008 + 0.156 * C.calm;
  const dv = v - MV;
  const ru = Math.max(0, Math.abs(du) - MR * 0.95);
  const rv = Math.max(0, Math.abs(dv) - MR * 0.95 * Math.sqrt(Math.max(0, 1 - (du / MR) ** 2)));
  const d = Math.hypot(ru / su, rv / sv);
  if (d > 6) return L;
  const sp = hash(cellId * 7 + 3, C.boil * 3 + 1);
  let G = 0.85 * Math.exp(-d * d) * (0.15 + sp * Math.sqrt(sp));
  // now and then a facet well out from the path finds the moon for a moment
  if (d > 1.2 && hash(cellId * 7 + 5, C.boil * 3 + 2) < 0.05 * (1 - d / 6) * (0.3 + 0.7 * C.calm))
    G = 0.75;
  return Math.max(L, G);
}

// ---------------------------------------------------------------- strokes in rows

const RV = new Float32Array(1200);
const RL = new Float32Array(1200);

/**
 * Runs of a row of n samples where RV > 0 (crossings interpolated), split at gaps, handed to
 * emit(a, b, lum, slot) in sample units. brk(j): the gap at sample j (in samples), or 0. slot:
 * the sample of the gap a piece starts after, which holds while the run's ends move with the
 * light, so a piece keeps its id (and its hand) from frame to frame.
 */
function runs(
  n: number,
  brk: (j: number) => number,
  emit: (a: number, b: number, lum: number, slot: number) => void,
) {
  let start = -1;
  let acc = 0;
  let cnt = 0;
  for (let j = 0; j < n; j++) {
    const on = RV[j] > 0;
    if (on && start < 0) {
      start = j > 0 ? j - 1 + -RV[j - 1] / (RV[j] - RV[j - 1]) : j;
      acc = 0;
      cnt = 0;
    }
    if (on) {
      acc += RL[j];
      cnt++;
    }
    if (start >= 0 && (!on || j === n - 1)) {
      const end = on ? j : j - 1 + RV[j - 1] / (RV[j - 1] - RV[j]);
      const lum = acc / Math.max(1, cnt);
      // the slot the run begins in: back to the last gap (or a coarse step, if none is near)
      const f = Math.floor(start + 0.3);
      let slot = f - (((f % 8) + 8) % 8) - 8;
      for (let m = f; m > f - 8; m--) {
        if (brk(m) > 0) {
          slot = m;
          break;
        }
      }
      let s = start;
      for (let m = Math.ceil(start + 0.3); m < end - 0.3; m++) {
        const g = brk(m);
        if (g > 0) {
          if (m - g / 2 > s + 0.12) emit(s, m - g / 2, lum, slot);
          s = m + g / 2;
          slot = m;
        }
      }
      if (end > s + 0.12) emit(s, end, lum, slot);
      start = -1;
    }
  }
}

// ---------------------------------------------------------------- the reeds (their state lives in the scene)

interface Blade {
  x: number;
  z: number;
  h: number;
  /** Which way it leans (bearing on the water, 0 = right, pi/2 = away), how far. */
  phi: number;
  a0: number;
  /** How much it bends further toward its tip. */
  k: number;
  /** Half-width at the base. */
  w: number;
  tw: number;
  /** A cattail's head along it (0: a leaf). */
  cat: number;
  /** Where a leaf is broken over (0: it is not), and how far it falls there. */
  kink: number;
  kinkA: number;
  flex: number;
  i: number;
}

const NB = 14;

/** A clump of reeds round (cx, cz): from a tight base, leaves fanning out and arching, rushes,
 *  and a few cattails standing straight; lean: which way the clump as a whole leans (x). */
function clump(
  out: Blade[],
  cx: number,
  cz: number,
  n: number,
  seed: number,
  size: number,
  lean: number,
  cats: boolean,
) {
  for (let q = 0; q < n; q++) {
    const i = seed + q;
    const r = hash(i, 12);
    const cat = cats && q % 9 === 4;
    const leaf = !cat && r > 0.42;
    let ang = hash(i, 4) * TAU;
    // leaning out from the middle of the clump, more to one side
    if (lean && Math.cos(ang) * lean < 0 && hash(i, 13) < 0.6) ang = Math.PI - ang;
    const rad = 0.16 * size * Math.sqrt(hash(i, 1));
    const kinked = leaf && hash(i, 14) < 0.16;
    out.push({
      x: cx + Math.cos(ang) * rad,
      z: cz + Math.sin(ang) * rad * 0.8,
      h:
        size *
        (cat
          ? 1.2 + 0.3 * hash(i, 3)
          : leaf
            ? 0.55 + 0.75 * hash(i, 3)
            : 0.45 + 0.9 * hash(i, 3) ** 0.8),
      phi: ang + (hash(i, 5) - 0.5) * 0.9,
      a0: cat ? 0.02 + 0.04 * hash(i, 6) : 0.04 + 0.26 * (rad / (0.16 * size)) * hash(i, 6),
      k: cat
        ? 0.03 + 0.04 * hash(i, 7)
        : leaf
          ? 0.2 + 1.1 * hash(i, 7) ** 1.3
          : 0.02 + 0.35 * hash(i, 7) ** 2,
      w: cat ? 0.008 : leaf ? 0.012 + 0.01 * hash(i, 8) : 0.0055 + 0.003 * hash(i, 8),
      tw: hash(i, 10) * TAU,
      cat: cat ? 0.68 + 0.08 * hash(i, 9) : 0,
      kink: kinked ? 0.45 + 0.3 * hash(i, 15) : 0,
      kinkA: 0.9 + 0.7 * hash(i, 16),
      flex: 0.6 + 0.6 * hash(i, 11),
      i,
    });
  }
}

const BLADES: Blade[] = [];
// on our right, at the edge of the moon's path; and nearer, low on our left
clump(BLADES, 1.0, 2.3, 26, 0, 1, -0.5, true);
clump(BLADES, -1.12, 1.7, 16, 100, 0.7, -1, false);
{
  // keep the fans inside the view: a blade that would reach out past it leans in less
  for (const b of BLADES) {
    const tipX = b.x + Math.cos(b.phi) * b.h * Math.sin(b.a0 + b.k * 0.6);
    if (tipX / b.z > 0.66) b.a0 *= 0.4;
    if (tipX / b.z > 0.66) b.k *= 0.5;
  }
  // and none reaches up across the moon
  const P = new Float32Array((NB + 1) * 3);
  for (const b of BLADES) {
    for (let it = 0; it < 6; it++) {
      bladePts(b, 0, 0, P);
      const tx = P[NB * 3];
      const ty = P[NB * 3 + 1];
      const tz = P[NB * 3 + 2];
      const tu = tx / tz;
      const tv = (-ty - H0) / tz;
      if (Math.abs(tu - MU) > MR + 0.12 || tv < MV - MR - 0.09) break;
      b.h *= 0.85;
    }
  }
  // far ones first
  BLADES.sort((a, b) => b.z - a.z);
}

/** The centreline of blade b, bent by the wind (bx, bz), into P (x, y, z). */
function bladePts(b: Blade, bx: number, bz: number, P: Float32Array) {
  let x = b.x;
  let y = 0;
  let z = b.z;
  const cp = Math.cos(b.phi);
  const sp = Math.sin(b.phi);
  const ds = b.h / NB;
  P[0] = x;
  P[1] = y;
  P[2] = z;
  for (let i = 1; i <= NB; i++) {
    const s = (i - 0.5) / NB;
    let th = b.a0 + b.k * s ** 1.5;
    // a broken leaf folds over there and hangs
    if (b.kink && s > b.kink) th += b.kinkA * Math.min(1, (s - b.kink) * 9);
    const st = Math.sin(th);
    x += ds * (st * cp + bx * 2.2 * s);
    z += ds * (st * sp + bz * 2.2 * s);
    y -= ds * Math.cos(th) * (1 - 0.5 * (bx * bx + bz * bz) * s);
    P[i * 3] = x;
    P[i * 3 + 1] = Math.min(-0.005, y);
    P[i * 3 + 2] = z;
  }
}

// ---------------------------------------------------------------- fireflies

interface Fly {
  x: number;
  y: number;
  z: number;
  i: number;
  on: number[];
}
const FLIES: Fly[] = [];
{
  const spots: [number, number, number, number, number, number, number][] = [
    // x, spread, height over the water, spread, z, spread, count: low over the water, round
    // the reeds, in the heron's shallows, by the near clump, and scattered over the near water
    [1.3, 0.45, 0.15, 0.5, 2.6, 0.7, 13],
    [-1.9, 0.9, 0.1, 0.4, 4.6, 1.4, 12],
    [-1.0, 0.45, 0.1, 0.35, 2.3, 0.5, 8],
    [0, 2.6, 0.1, 0.5, 4.5, 2.5, 23],
  ];
  let i = 0;
  for (const [x, xs, y, ys, z, zs, count] of spots) {
    for (let n = 0, tries = 0; n < count && tries < 200; tries++) {
      const fz = z + (hash(i * 7 + tries, 133) - 0.5) * 2 * zs;
      const fx = x + (hash(i * 7 + tries, 131) - 0.5) * 2 * xs;
      // only where they will be seen, over the dark water off the moon's path
      if (fz < 1.6 || Math.abs(fx / fz) > 0.68 || Math.abs(fx / fz - MU) < 0.2) continue;
      FLIES.push({ x: fx, y: -(y + hash(i, 132) * ys), z: fz, i, on: [] });
      n++;
      i++;
    }
  }
  for (const f of FLIES) {
    let t = 0.2 + 3.5 * hash(f.i, 135);
    for (let n = 0; t < DUR + 0.6; n++) {
      f.on.push(t);
      t += 1.6 + 3.4 * hash(f.i * 17 + n, 138);
    }
  }
  // once, a few in the reeds light together, as they do
  const near = FLIES.slice(0, 7);
  near.forEach((f, r) => {
    f.on = f.on.filter((s) => Math.abs(s - 8.9) > 1.2);
    f.on.push(8.9 + r * 0.02 + 0.03 * hash(f.i, 134));
    f.on.sort((a, b) => a - b);
  });
}

/** Where fly f is in a flash at t: its phase through it (or -1), and the flash's length. */
const FL = [0, 0];
function flashAt(f: Fly, t: number): boolean {
  for (const s of f.on) {
    const d = 0.3 + 0.3 * hash(f.i, Math.round(s * 10));
    if (t >= s && t < s + d) {
      FL[0] = (t - s) / d;
      FL[1] = d;
      return true;
    }
  }
  return false;
}

/** How bright a flash is at phase p: on at once, out in a few steps. */
function glowAt(p: number): number {
  return p < 0.2 ? 1 : (1 - (p - 0.2) / 0.8) ** 1.3;
}

/** Where fly f is at t, in a flash at phase p (it dips, then climbs as it glows: a J). */
function flyPos(f: Fly, t: number, p: number, out: number[]) {
  const dir = hash(f.i, 145) < 0.5 ? -1 : 1;
  out[0] = f.x + 0.18 * noise(t * 0.3 + f.i * 7.1, 141) + dir * 0.05 * p;
  out[1] = Math.min(-0.06, f.y + 0.06 * noise(t * 0.27 + f.i * 5.3, 142) + 0.02 * p - 0.07 * p * p);
  out[2] = f.z + 0.18 * noise(t * 0.23 + f.i * 3.7, 143);
}

// ---------------------------------------------------------------- state

class State {
  roll = 0;
  rollV = 0;
  bx = new Float32Array(BLADES.length);
  bvx = new Float32Array(BLADES.length);
  bz = new Float32Array(BLADES.length);
  bvz = new Float32Array(BLADES.length);
  heron = new Heron();

  reset() {
    this.heron.reset();
    this.roll = 0;
    this.rollV = 0;
    this.bx.fill(0);
    this.bvx.fill(0);
    this.bz.fill(0);
    this.bvz.fill(0);
    // settle the reeds into the breeze before we see them
    for (let i = 0; i < 120; i++) this.sub(-2 + i / 60, 1 / 60);
  }

  step(t: number, dt: number) {
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    for (let i = 0; i < n; i++) this.sub(t - dt + (dt * (i + 1)) / n, dt / n);
  }

  private sub(t: number, h: number) {
    this.heron.step(t, h);
    const calm = calmAt(t);
    // the boat rolls a little on the swell
    const tr =
      (0.009 * Math.sin(0.83 * t + 0.4) +
        0.005 * Math.sin(1.71 * t + 2.1) +
        0.002 * Math.sin(2.9 * t)) *
      (0.3 + 0.7 * calm);
    this.rollV += (2.4 * 2.4 * (tr - this.roll) - 2 * 0.3 * 2.4 * this.rollV) * h;
    this.roll += this.rollV * h;
    // reeds in a breeze from the left, the gusts running across the clump
    for (let i = 0; i < BLADES.length; i++) {
      const b = BLADES[i];
      const lag = b.x * 0.35;
      const gust =
        0.5 + 0.35 * noise((t - lag) * 0.45, 161) + 0.22 * noise((t - lag) * 1.3 + i * 0.3, 162);
      const tx = 0.035 * b.flex * gust * (0.4 + 0.6 * calm);
      const tz = 0.016 * b.flex * noise(t * 0.6 + i * 1.7, 163) * calm;
      const w = 3.2 + 1.2 * hash(b.i, 164);
      this.bvx[i] += (w * w * (tx - this.bx[i]) - 2 * 0.22 * w * this.bvx[i]) * h;
      this.bx[i] += this.bvx[i] * h;
      this.bvz[i] += (w * w * (tz - this.bz[i]) - 2 * 0.22 * w * this.bvz[i]) * h;
      this.bz[i] += this.bvz[i] * h;
    }
  }
}

function calmAt(t: number): number {
  return 1 - 0.9 * smooth(8.5, 13.2, t);
}

// ---------------------------------------------------------------- the scene

export function lake(): Scene {
  const st = new State();
  st.reset();
  return {
    t: 0,
    dur: DUR,
    exit: [0, 0],
    still: 2.6,
    out: "blink",
    prepare(ms) {
      landStep(ms);
    },
    reset() {
      this.t = 0;
      st.reset();
    },
    step(dt) {
      this.t += dt;
      st.step(this.t, dt);
    },
    draw(sk) {
      ensureLand();
      draw(sk, this.t, st);
    },
  };
}

function draw(sk: Sketch, t: number, st: State) {
  SK = sk;
  C.t = t;
  C.A = sk.A;
  C.px = sk.px;
  C.boil = sk.boil;
  C.calm = calmAt(t);
  C.alpen = 0.95 - 0.3 * smooth(3, 11, t);
  C.amb = 0.2 * (1 - smooth(6, 11.5, t));
  C.hs = mix(60, HMAX + 260, smooth(-2, 13, t) ** 1.6);
  // the sky behind the range brightens with the moon as the range darkens
  C.glow = 0.09 + 0.1 * smooth(4, 11, t);
  C.hr = 0.075 + 0.025 * smooth(4, 11, t);
  C.halo = 0.48 + 0.17 * smooth(2, 11, t);
  haloTable();
  C.air = 0.12 + 0.3 * smooth(3, 11, t);
  // the boat: drifting slowly, bobbing and rolling on the swell; at the end our gaze settles
  // on the water
  C.ex = 0.08 * noise(t * 0.08, 171) + 0.012 * t;
  C.ez = 0.01 * t;
  C.H =
    H0 + (0.005 * Math.sin(1.1 * t + 0.3) + 0.003 * Math.sin(2.3 * t + 1)) * (0.3 + 0.7 * C.calm);
  const yaw = -0.01 + 0.012 * noise(t * 0.11, 172);
  // at the end our gaze sinks to the moon in the water, and rests there as the eyes close
  const pitch = PITCH + 0.003 * Math.sin(0.9 * t) * C.calm + 0.06 * smooth(9.6, 13.9, t);
  sk.eye(C.ex, -C.H, C.ez, FOC, yaw, pitch, st.roll);
  sk.depthW = 0;
  C.uc = Math.tan(yaw);
  C.span = (C.A + 0.12) / FOC;
  // the moon on the view
  sky(MU, MV);
  C.mx = Q[0];
  C.my = Q[1];
  sky(MU + MR, MV);
  C.mr = Math.hypot(Q[0] - C.mx, Q[1] - C.my);

  const calmAmp = 0.65 + 0.35 * C.calm;

  sk.group(1);
  sk.amp = 0.25;
  stars(sk, t);
  sk.group(2);
  glowLines(sk);
  sk.group(4);
  haloRings(sk);
  sk.group(3);
  moon(sk);
  sk.group(5);
  range(sk);
  sk.group(6);
  shore(sk);
  sk.group(8);
  sk.amp = 0.4 * calmAmp;
  waterRows(sk);
  sk.group(9);
  hotGlints(sk);
  sk.group(14);
  mirrorRidge(sk);
  sk.group(15);
  starImages(sk, t);
  sk.group(16);
  bird(sk, t, st, true);
  sk.group(10);
  rings(sk, t);
  sk.group(11);
  splashes(sk, t);
  sk.group(17);
  bird(sk, t, st, false);
  sk.group(12);
  reeds(sk, st);
  sk.group(13);
  flies(sk, t);
  sk.amp = 1;
}

// ---------------------------------------------------------------- stars

function stars(sk: Sketch, t: number) {
  for (const s of STARS) {
    if (t < s.at) continue;
    if (s.v < look(E_TOP, s.u) + 0.02) continue;
    // a dim one goes out now and then for a moment
    if (s.b < 0.3 && hash(s.i, C.boil) < 0.12) continue;
    if (!sky(s.u, s.v) || Math.abs(Q[0]) > 0.9 * C.A || Q[1] < -0.95) continue;
    // they come out slowly, and twinkle
    const r = ((0.45 + 0.6 * s.b) * (0.8 + 0.35 * hash(s.i * 3, C.boil))) / C.px;
    sk.id = 1_100_000 + s.i * 4;
    sk.dot(Q[0], Q[1], r, r * (0.85 + 0.2 * hash(s.i, 106)));
  }
}

// ---------------------------------------------------------------- the sky: the moon's halo, the glow low over the land

/** The halo: a few fine broken rings round the moon, fewer and fainter further out. */
const NHALO = 4;
function haloRings(sk: Sketch) {
  sk.amp = 0.3;
  for (let k = 0; k < NHALO; k++) {
    const r = 1.11 + 0.1 * k + 0.012 * k * k + (hash(k, 211) - 0.5) * 0.02;
    const dm = (r - 1) * MR;
    const L = C.halo * (0.55 * Math.exp(-dm / 0.03) + 0.38 * Math.exp(-dm / C.hr));
    // how much of the ring the hand puts down
    const cover = clamp((L - 0.08) * 2, 0, 0.72);
    if (cover <= 0.02) continue;
    const ph = hash(k, 212) * TAU;
    const wob = hash(k, 213) * TAU;
    let a = ph;
    for (let p = 0; p < 7; p++) {
      const len = (0.5 + 0.9 * hash(k * 17 + p, 214)) * (0.45 + 0.55 * cover);
      const gap = (0.18 + 0.5 * hash(k * 17 + p, 215)) * (1.25 - cover);
      if (a - ph > TAU - 0.05) break;
      const a1 = Math.min(a + len, ph + TAU - 0.05);
      if (hash(k * 17 + p, 216) < cover + 0.15) {
        const m = Math.max(3, Math.ceil((a1 - a) * r * 9));
        sk.id = 2_000_000 + k * 32 + p;
        for (let i = 0; i <= m; i++) {
          const q = a + ((a1 - a) * i) / m;
          const rr = r * (1 + 0.012 * Math.sin(3 * q + wob) + 0.006 * Math.sin(7 * q + 2 * wob));
          sky(MU + Math.cos(q) * rr * MR, MV - Math.sin(q) * rr * MR);
          if (i === 0) pm(Q[0], Q[1], 0.2);
          else pl(Q[0], Q[1], 0.32 + 0.35 * Math.min(1, L * 1.4) * Math.sin((Math.PI * i) / m));
        }
        pink(sk, 0.3, 0.25, 0.2);
      }
      a = a1 + gap;
    }
  }
}

/** The glow low over the land: long fine lines, only where it is bright enough, cut by the
 *  range when it is drawn in front, so the mountains stand dark against it. */
const NGLOW = 13;
function glowLines(sk: Sketch) {
  sk.amp = 0.3;
  const du = 0.012;
  for (let k = 0; k < NGLOW; k++) {
    const v = 0.004 + k * 0.0105 + (hash(k, 221) - 0.5) * 0.003;
    const T = 0.025 + 0.09 * (k / (NGLOW - 1)) ** 1.3;
    const off = hash(k, 222) * du;
    const lo = C.uc - C.span - 0.05;
    const hi = C.uc + C.span + 0.05;
    const j0 = Math.floor((lo - off) / du);
    const n = Math.min(1200, Math.ceil((hi - off) / du) - j0 + 1);
    let any = false;
    for (let j = 0; j < n; j++) {
      const u = (j0 + j) * du + off;
      // nothing to draw where the land already stands in front
      const L =
        v < ridgeAt(u) - 0.004
          ? 0
          : C.glow * (0.55 + 0.45 * Math.exp(-Math.abs(u - MU) / 0.35)) * Math.exp(-v / 0.25);
      RL[j] = L;
      RV[j] = L - T - noise(u * 9 + k * 3.1, 223) * 0.5 * 0.06;
      if (RV[j] > 0) any = true;
    }
    if (!any) continue;
    const rowId = 2_100_000 + k * 2048;
    runs(
      n,
      // a hand's stroke is about a fifth of the view; the next starts just past where it ended
      (j) => ((j0 + j) % 23 === (k * 7) % 23 ? 0.35 : 0),
      (ja, jb, lum, slot) => {
        sk.id = rowId + ((j0 + slot + 1024) & 2047);
        const m = Math.max(2, Math.ceil(jb - ja));
        for (let i = 0; i <= m; i++) {
          const u = (j0 + ja + ((jb - ja) * i) / m) * du + off;
          sky(u, v + 0.0012 * noise(u * 14 + k, 224));
          if (i === 0) pm(Q[0], Q[1], 0.15);
          else pl(Q[0], Q[1], 0.3 + 0.25 * Math.min(1, lum * 3));
        }
        pink(sk, 0.35, 0.3, 0.25);
      },
    );
  }
}

// ---------------------------------------------------------------- the moon

/** A point on the moon's face: (a, b) across it, b down; the hatching runs at a slant. */
const MCA = Math.cos(-0.42);
const MSA = Math.sin(-0.42);
function moonPt(a: number, b: number) {
  return sky(MU + MR * a, MV - MR * b);
}
function moonPtR(a: number, b: number) {
  return moonPt(a * MCA - b * MSA, a * MSA + b * MCA);
}

/** The engraving, worked out once: lines bowed round the sphere at a slant, each broken into
 *  short dashes whose pen-down points are staggered from line to line; a dash is drawn where
 *  the face is bright (one threshold for all of it), so the seas come out as dark patches. Per
 *  line and point: where on the face, how heavy (0: a gap), and which dash it belongs to. */
const MNL = 50;
const MNM = 48;
const MFA = new Float32Array(MNL * (MNM + 1));
const MFB = new Float32Array(MNL * (MNM + 1));
const MW = new Float32Array(MNL * (MNM + 1));
const MD = new Int16Array(MNL * (MNM + 1));
{
  const tilt = 0.26;
  for (let j = 0; j < MNL; j++) {
    const bl = -1 + ((j + 0.5 + (hash(j, 81) - 0.5) * 0.35) * 2) / MNL;
    const half = Math.sqrt(Math.max(0, 1 - bl * bl));
    // the dashes along this line: lengths 0.15-0.3 R, small lifts between, a staggered start
    let pos = -1 - 0.25 * hash(j, 86);
    let dash = 0;
    let end = pos + 0.2 + 0.18 * hash(j * 13, 87);
    let lift = end + 0.03 + 0.035 * hash(j * 13, 88);
    for (let i = 0; i <= MNM; i++) {
      const f = -0.995 + (1.99 * i) / MNM;
      const a = f * half;
      // where along the line, in moon radii
      const sAt = a;
      while (sAt > lift) {
        dash++;
        pos = lift;
        end = pos + 0.2 + 0.18 * hash(j * 13 + dash, 87);
        lift = end + 0.03 + 0.035 * hash(j * 13 + dash, 88);
      }
      const b = bl * Math.cos(tilt) + half * Math.sin(tilt) * Math.sqrt(Math.max(0, 1 - f * f));
      const zz = Math.sqrt(Math.max(0, 1 - a * a - b * b));
      const sea = mare(a * MCA - b * MSA, a * MSA + b * MCA);
      const tone = (0.86 + 0.14 * zz) * (1 - 0.85 * sea);
      const k = j * (MNM + 1) + i;
      MFA[k] = a;
      MFB[k] = b;
      MD[k] = dash;
      // in the seas, every third line goes on thinly, so they are grey rather than holes
      const on = sAt <= end && (tone > 0.5 || (j % 3 === 1 && tone > 0.2));
      MW[k] = on ? (tone > 0.5 ? 0.75 + 0.85 * tone : 0.5) : 0;
    }
  }
}

function moon(sk: Sketch) {
  // clear its disc
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * TAU;
    moonPt(Math.cos(a) * 1.04, Math.sin(a) * 1.04);
    if (i === 0) sk.m(Q[0], Q[1]);
    else sk.l(Q[0], Q[1]);
  }
  sk.fill();
  sk.amp = 0.35;
  for (let j = 0; j < MNL; j++) {
    let open = false;
    let piece = -1;
    for (let i = 0; i <= MNM; i++) {
      const k = j * (MNM + 1) + i;
      const w = MW[k];
      // a dash ends where it lifts or where a sea begins
      if (open && (!(w > 0) || MD[k] !== piece)) {
        if (pcount() > 1) pink(sk, 0.15, 0.25, 0.25);
        open = false;
      }
      if (w > 0) {
        moonPtR(MFA[k], MFB[k]);
        if (!open) {
          piece = MD[k];
          sk.id = 3_000_000 + j * 256 + piece * 4 + (i & 3);
          pm(Q[0], Q[1], w * 0.8);
          open = true;
        } else pl(Q[0], Q[1], w);
      }
    }
    if (open && pcount() > 1) pink(sk, 0.15, 0.25, 0.25);
  }
  // its edge: firm, drawn round past itself, the hand lifting only a little
  sk.amp = 0.55;
  const a0 = hash(33, C.boil) * TAU;
  let open = false;
  let piece = 0;
  for (let i = 0; i <= 72; i++) {
    const a = a0 + ((TAU + 0.35) * i) / 72;
    const on = noise(a * 2.2 + 3, 271) > -0.62;
    if (on) {
      moonPt(Math.cos(a), Math.sin(a));
      if (!open) {
        sk.id = 3_200_000 + piece++;
        pm(Q[0], Q[1], 1);
        open = true;
      } else pl(Q[0], Q[1], 1.15 + 0.25 * Math.sin(a * 3 + 1));
    }
    if (open && (!on || i === 72)) {
      if (pcount() > 1) pink(sk, 0.06, 0.3, 0.3);
      open = false;
    }
  }
}

// ---------------------------------------------------------------- the range

const TOPX: number[] = [];
const BOTX: number[] = [];

function range(sk: Sketch) {
  const lo = C.uc - C.span - 0.04;
  const hi = C.uc + C.span + 0.04;
  const i0 = Math.max(0, Math.floor((lo - RU0) / RDU));
  const i1 = Math.min(RNU - 1, Math.ceil((hi - RU0) / RDU));
  // clear it, from the skyline down to the water
  TOPX.length = 0;
  BOTX.length = 0;
  for (let i = i0; i <= i1; i++) {
    const u = RU0 + i * RDU;
    far(u, RE[i], FARD);
    TOPX.push(Q[0], Q[1]);
    far(u, -0.004, FARD);
    BOTX.push(Q[0], Q[1]);
  }
  sk.id = 5_000_000;
  strip(sk, TOPX, BOTX, i1 - i0 + 1);
  // hachures down the fall lines, where the afterglow still holds: the pen comes down only
  // above the shadow line, and the twilight under it only carries a stroke on a little way
  sk.amp = 0.55;
  const px = C.px;
  for (let h = 0; h < HACH.length; h++) {
    const P = HACH[h];
    const u0 = P[0];
    if (u0 < lo || u0 > hi) continue;
    const thr = HTHR[h];
    const n = P.length / 2;
    let open = false;
    let pL = 0;
    let len = 0;
    let lx = 0;
    let ly = 0;
    for (let k = 0; k < n; k++) {
      const u = P[k * 2];
      const v = P[k * 2 + 1];
      const c = cell(u, v);
      const sun = c < 0 ? 0 : cellLum(c, C.alpen, C.hs, 0);
      const lit = open ? (c < 0 ? 0 : cellLum(c, C.alpen, C.hs, C.amb)) : sun;
      const on = lit > thr;
      if (on && !open) {
        // the pen comes down where the light begins
        if (k > 0) {
          const f = (thr - pL) / (lit - pL || 1);
          far(mix(P[k * 2 - 2], u, f), mix(P[k * 2 - 1], v, f), FARD);
        } else far(u, v, FARD);
        sk.id = 5_000_100 + h * 16 + k;
        pm(Q[0], Q[1], (0.4 + 0.5 * lit) * HW[h] * 0.75);
        lx = Q[0];
        ly = Q[1];
        len = 0;
        if (k > 0) {
          far(u, v, FARD);
          pl(Q[0], Q[1], (0.4 + 0.5 * lit) * HW[h] * 0.75);
          len += Math.hypot(Q[0] - lx, Q[1] - ly);
          lx = Q[0];
          ly = Q[1];
        }
        open = true;
      } else if (on) {
        far(u, v, FARD);
        pl(Q[0], Q[1], (0.4 + 0.5 * lit) * HW[h] * 0.75);
        len += Math.hypot(Q[0] - lx, Q[1] - ly);
        lx = Q[0];
        ly = Q[1];
      } else if (open) {
        const f = (pL - thr) / (pL - lit || 1);
        far(mix(P[k * 2 - 2], u, f), mix(P[k * 2 - 1], v, f), FARD);
        pl(Q[0], Q[1], 0.3 * HW[h]);
        len += Math.hypot(Q[0] - lx, Q[1] - ly);
        // scraps too short to be a stroke are left out
        if (pcount() > 1 && len * px > 6) pink(sk, 0.3, 0.3, 0.3);
        open = false;
      }
      pL = lit;
    }
    if (open && pcount() > 1 && len * px > 6) pink(sk, 0.3, 0.3, 0.3);
  }
  // inner edges, where a nearer ridge stands in front: drawn where its crest is lit, and
  // faintly elsewhere, the hand losing them here and there
  sk.amp = 0.7;
  for (let e = 0; e < CHAINS.length; e++) {
    const P = CHAINS[e];
    const n = P.length / 3;
    if (P[(n - 1) * 3] < lo || P[0] > hi) continue;
    let open = false;
    for (let k = 0; k < n; k++) {
      const u = P[k * 3];
      const v = P[k * 3 + 1];
      const c = cell(u, v - 0.004);
      const lit = c < 0 ? 0 : cellLum(c, C.alpen, C.hs, C.amb);
      const nearK = c < 0 ? 0.5 : cellNear(c);
      const rim = Math.exp(-Math.abs(u - MU) / 0.3) * (0.25 + 0.5 * C.air);
      const w = 0.35 + 0.5 * nearK + 0.9 * Math.max(lit, rim);
      const lost = noise(u * 31 + e * 1.7, 231) > 0.25 + 0.2 * lit;
      const on = !lost && Math.max(lit, rim) > 0.1 + 0.12 * hash(e, 232) && u > lo && u < hi;
      if (on) {
        far(u, v, FARD);
        if (!open) {
          sk.id = 5_900_000 + e * 512 + k;
          pm(Q[0], Q[1], w);
          open = true;
        } else pl(Q[0], Q[1], w);
      }
      if (open && (!on || k === n - 1)) {
        if (pcount() > 1) pink(sk, 0.2, 0.5, 0.35);
        open = false;
      }
    }
  }
  // the skyline: rimmed by the moon near it, by the afterglow where it holds, found by the
  // glow behind it; lost only where the land and the sky behind it are both dark
  sk.amp = 0.8;
  let open = false;
  let seg = 0;
  for (let i = i0; i <= i1; i++) {
    const u = RU0 + i * RDU;
    const e = RE[i];
    const rim = Math.exp(-Math.abs(u - MU) / 0.14);
    const c = cell(u, e - 0.003);
    const face = c < 0 ? 0 : cellLum(c, C.alpen, C.hs, C.amb);
    const behind = Math.min(1, skyLum(u, e + 0.012) * 3.2);
    const lum = Math.max(rim, face * 0.9, behind);
    const lost = noise(u * 13, 241) * 0.5 + 0.5 < 0.42 - lum * 1.4;
    const on = !lost;
    if (on) {
      far(u, e, FARD);
      const w = 0.45 + 0.85 * lum;
      if (!open) {
        sk.id = 5_800_000 + i;
        pm(Q[0], Q[1], w);
        open = true;
        seg = 0;
      } else pl(Q[0], Q[1], w);
      seg++;
    }
    // a long run is a few strokes, the next taking up where the last left off
    if (open && (!on || i === i1 || (seg > 40 && hash(i, 242) < 0.08))) {
      if (pcount() > 1) pink(sk, 0.12, 0.6, 0.3);
      open = false;
      if (on && i < i1) {
        sk.id = 5_800_000 + i;
        far(u, e, FARD);
        pm(Q[0], Q[1], 0.45 + 0.85 * lum);
        open = true;
        seg = 0;
      }
    }
  }
}

// ---------------------------------------------------------------- the far shore: low pine woods

function shore(sk: Sketch) {
  const lo = C.uc - C.span - 0.04;
  const hi = C.uc + C.span + 0.04;
  const N = Math.ceil((hi - lo) / 0.0025);
  TOPX.length = 0;
  BOTX.length = 0;
  for (let i = 0; i <= N; i++) {
    const u = lo + ((hi - lo) * i) / N;
    far(u, look(E_H, u), D_H);
    TOPX.push(Q[0], Q[1]);
    far(u, -0.002, D_H);
    BOTX.push(Q[0], Q[1]);
  }
  sk.id = 6_000_000;
  strip(sk, TOPX, BOTX, N + 1);
  // the treetops: one serrated stroke along each stretch where something lit is behind them
  // (the moon's column most of all), lost where it is dark
  sk.amp = 0.5;
  const g = 0.0011;
  const k0 = Math.floor(lo / g);
  const k1 = Math.ceil(hi / g);
  let open = false;
  let run = 0;
  for (let k = k0; k <= k1; k++) {
    const tu = k * g;
    const e = look(E_H, tu);
    const ve = e - H0 / D_H;
    const back = Math.max(
      rangeLum(tu, ve + 0.004, C.alpen, C.hs, C.amb),
      ve + 0.004 > ridgeAt(tu) ? Math.min(1, skyLum(tu, ve + 0.004) * 2.5) : 0,
    );
    const lum = Math.max(back * 0.8, Math.exp(-Math.abs(tu - MU) / 0.09) * 0.85);
    const on = lum > 0.22 + 0.25 * (noise(tu * 40, 222) * 0.5 + 0.5);
    if (on) {
      far(tu, e, D_H);
      const w = 0.35 + 0.65 * lum;
      if (!open) {
        sk.id = 6_000_100 + (k & 65535);
        pm(Q[0], Q[1], w * 0.6);
        open = true;
        run = 0;
      } else pl(Q[0], Q[1], w);
      run++;
    }
    if (open && (!on || k === k1 || run > 90)) {
      if (pcount() > 2) pink(sk, 0.15, 0.25, 0.3);
      open = false;
    }
  }
}

// ---------------------------------------------------------------- the water

const NW = 104;
const WZ = new Float32Array(NW);
const WT = new Float32Array(NW);
for (let k = 0; k < NW; k++) {
  // rows evenly spread in how far below the horizon they lie, a little closer near it
  const dep = 0.74 * ((k + 0.5) / NW) ** 1.1;
  WZ[k] = H0 / dep;
  WT[k] = 0.05 + 0.85 * ((k * 0.618034 + 0.27) % 1) ** 1.3;
}

const WC = new Float64Array(4);
const WS = new Float64Array(4);
const WD = new Float64Array(8);
const WA = new Float64Array(8);

function waterRows(sk: Sketch) {
  for (let k = 0; k < NW; k++) {
    const z = WZ[k];
    const dz = z - C.ez;
    if (dz < 0.9 || z > D_H - 4) continue;
    const xl = C.ex + (C.uc - C.span) * dz;
    const xr = C.ex + (C.uc + C.span) * dz;
    const dxs = dz * 0.021;
    const off = hash(k, 21) * dxs;
    const j0 = Math.floor((xl - off) / dxs);
    const n = Math.min(1200, Math.ceil((xr - off) / dxs) - j0 + 1);
    const T = WT[k];
    rowConsts(z, k);
    // the swell along the row, each wave turned on by a fixed step
    const amp = swellAmp(z);
    for (let i = 0; i < 4; i++) {
      const w = WAVES[i];
      const a = w[0] * (j0 * dxs + off) + w[1] * z - w[3] * C.t + w[4];
      WC[i] = Math.cos(a);
      WS[i] = Math.sin(a);
      WD[i * 2] = Math.cos(w[0] * dxs);
      WD[i * 2 + 1] = Math.sin(w[0] * dxs);
      WA[i * 2] = (amp * w[2] * w[0]) / WK[i];
      WA[i * 2 + 1] = (ZK * amp * w[2] * w[1]) / WK[i];
    }
    for (let j = 0; j < n; j++) {
      const x = (j0 + j) * dxs + off;
      let sx = 0;
      let sz = 0;
      for (let i = 0; i < 4; i++) {
        const c = WC[i];
        sx += WA[i * 2] * c;
        sz += WA[i * 2 + 1] * c;
        WC[i] = c * WD[i * 2] - WS[i] * WD[i * 2 + 1];
        WS[i] = WS[i] * WD[i * 2] + c * WD[i * 2 + 1];
      }
      S[0] = sx;
      S[1] = sz;
      ringSlopes(x, z);
      const L = waterLumR(x, z, k * 4096 + ((j0 + j) & 4095));
      RL[j] = L;
      RV[j] =
        L -
        T -
        (hash(k * 977 + j0 + j, 22) - 0.5) * 0.1 -
        (hash(k * 389 + j0 + j, C.boil) - 0.5) * 0.07 * C.calm;
    }
    const near = clamp(1.4 / dz, 0, 1);
    const w = 0.45 + 0.7 * near ** 0.7;
    const gapP = 0.32 - 0.1 * near;
    const prev = k > 0 ? WZ[k - 1] : z * 1.05;
    const rowGap = prev - z;
    const rowId = 10_000_000 + k * 4096;
    runs(
      n,
      (j) => {
        const jj = j0 + j;
        if (hash(k * 613 + jj, 23) < gapP * (RL[j] > 0.55 ? 0.35 + 0.65 * C.calm : 1))
          return 0.2 + 0.4 * hash(k + jj * 3, 24);
        if (hash(k * 613 + jj, C.boil * 5 + 2) < 0.12 * (0.3 + 0.7 * C.calm))
          return 0.18 + 0.25 * hash(jj, C.boil);
        return 0;
      },
      (ja, jb, lum, slot) => {
        const xa = (j0 + ja) * dxs + off;
        const xb = (j0 + jb) * dxs + off;
        const jj = j0 + slot;
        const zo = (hash(k * 71 + jj, 25) - 0.5) * 0.35 * rowGap;
        const tl = (hash(k * 73 + jj, 26) - 0.5) * 0.1 * rowGap;
        sk.id = rowId + ((j0 + slot) & 4095);
        sk.m3(xa, 0, z + zo - tl)
          .l3((xa + xb) * 0.5, 0, z + zo)
          .l3(xb, 0, z + zo + tl)
          .s3(w * (0.6 + 0.6 * Math.min(1, lum)), 0.3, 0.3);
      },
    );
  }
}

// ---------------------------------------------------------------- the moon's hottest glints

/** A few facets in the moon's path that throw the moon straight at us: short heavy flecks,
 *  each there for a redraw or two, then somewhere else. Fewer as the water stills. */
const NGLINT = 18;
function hotGlints(sk: Sketch) {
  sk.amp = 0.2;
  const n = Math.round(NGLINT * (0.25 + 0.75 * C.calm));
  for (let g = 0; g < n; g++) {
    // each holds for one or two redraws
    const life = 1 + (g % 2);
    const ep = Math.floor((C.boil + g) / life);
    const h1 = hash(g * 131 + ep, 401);
    const h2 = hash(g * 137 + ep, 402);
    const h3 = hash(g * 139 + ep, 403);
    // how far below the horizon (the near water more), and across the path
    const dep = 0.05 + 0.45 * h1 ** 1.4;
    const z = C.ez + C.H / dep;
    rowConsts(z);
    const du = (h2 - 0.5) * 2 * (MR + 2.2 * WR.su) * (0.5 + 0.5 * h3);
    const x = C.ex + (MU + du) * (z - C.ez);
    slopes(x, z);
    const L = waterLumR(x, z, 7_777_000 + g * 64 + (ep & 63));
    if (L < 0.55) continue;
    if (!sk.p3(x, 0, z, Q)) continue;
    const near = clamp(0.6 + dep * 2, 0.6, 1.4);
    const len = ((2 + 2 * hash(g, ep + 404)) * near) / C.px;
    sk.id = 9_000_000 + g;
    sk.line(Q[0] - len, Q[1], Q[0] + len, Q[1], (1.5 + 0.5 * h3) * near, 0.35, 0);
  }
}

// ---------------------------------------------------------------- stars again, in the stilling water

function starImages(sk: Sketch, t: number) {
  sk.amp = 0.2;
  // they come as the swell dies
  const still = smooth(0.55, 0.3, C.calm);
  if (still <= 0) return;
  for (const s of STARS) {
    if (t < s.at || s.b < 0.12 || hash(s.i, 107) > still) continue;
    const zw = C.H / s.v;
    slopes(C.ex + s.u * zw, C.ez + zw);
    if (!far(s.u, -s.v, FARD)) continue;
    const x = Q[0] + 2 * S[0] * FOC + ((hash(s.i, C.boil) - 0.5) * 2) / C.px;
    const y = Q[1] + S[1] * FOC;
    const len = (0.8 + 2.2 * s.b) / C.px;
    sk.id = 1_200_000 + s.i * 4;
    sk.line(x - len, y, x + len, y, 0.5 + 0.5 * s.b, 0.3, 0.1);
  }
}

// ---------------------------------------------------------------- the skyline again, upside down in the water

function mirrorRidge(sk: Sketch) {
  sk.amp = 0.35;
  const lo = C.uc - C.span;
  const hi = C.uc + C.span;
  const i0 = Math.max(0, Math.floor((lo - RU0) / RDU));
  const i1 = Math.min(RNU - 1, Math.ceil((hi - RU0) / RDU));
  const half = RDU * FOC * 0.62;
  for (let i = i0; i <= i1; i++) {
    const u = RU0 + i * RDU;
    const v = RE[i];
    if (v < 0.012) continue;
    const c = cell(u, v - 0.004);
    const face = c < 0 ? 0 : cellLum(c, C.alpen, C.hs, C.amb);
    const rim = Math.exp(-Math.abs(u - MU) / 0.14) * 0.8;
    const lum = Math.max(face, rim, Math.min(1, skyLum(u, v + 0.012) * 2.5));
    if (lum < 0.12 || hash(i, 252) > 0.2 + 1.2 * lum) continue;
    // where on the water the image forms, and how the water there tilts it
    const zw = C.H / v;
    slopes(C.ex + u * zw, C.ez + zw);
    if (!far(u, -v, FARD)) continue;
    const x = Q[0] + 2 * S[0] * FOC;
    const y = Q[1] + S[1] * FOC;
    const len = half * (0.8 + 0.5 * hash(i, 253));
    sk.id = 14_000_000 + i;
    sk.line(x - len, y, x + len, y, 0.45 + 0.6 * lum, 0.2, 0.15);
  }
}

// ---------------------------------------------------------------- rings, where they cross something bright

function rings(sk: Sketch, t: number) {
  sk.amp = 0.4;
  for (let ri = 0; ri < RINGS.length; ri++) {
    const r = RINGS[ri];
    const age = t - r.t0;
    if (age <= 0.05 || age > 8) continue;
    const fade = Math.exp(-age / 2.6);
    const near = clamp(1.6 / (r.z - C.ez), 0, 1.5);
    for (let c = 0; c < 3; c++) {
      const R = r.c * age - c * (0.09 + 0.035 * age);
      if (R < 0.08) continue;
      const amp = fade * (1 - c * 0.3);
      // the hand breaks each crest into a few arcs
      const M = 56;
      const nArc = 2 + Math.floor(hash(ri * 7 + c, 312) * 3);
      const a0 = hash(ri * 7 + c, 313) * TAU;
      let open = false;
      let piece = 0;
      for (let i = 0; i <= M; i++) {
        const f = i / M;
        const a = a0 + f * TAU;
        const inArc =
          (f * nArc) % 1 < 0.72 + 0.15 * hash(ri * 31 + c * 7 + Math.floor(f * nArc), 314);
        const x = r.x + Math.cos(a) * R;
        const z = r.z + Math.sin(a) * R;
        const lum = inArc ? waterLum(x, z, ri * 977 + c * 131 + i) : 0;
        const want = lum * amp * 1.5;
        const on = want > 0.3 + 0.1 * hash(ri * 59 + c * 7 + i, 311);
        if (on) {
          if (!open) {
            sk.id = 10_600_000 + ri * 4096 + c * 512 + piece++ * 8;
            sk.m3(x, 0, z);
            open = true;
          } else sk.l3(x, 0, z, 0.5 + 0.7 * Math.min(1, want));
        }
        if (open && (!on || i === M)) {
          if (sk.count3 > 1) sk.s3(0.6 * (0.6 + 0.4 * near), 0.4, 0.3);
          open = false;
        }
      }
    }
  }
}

/** Where a fish breaks the surface, a fleck of water thrown up for a moment. */
function splashes(sk: Sketch, t: number) {
  sk.amp = 0.2;
  for (let ri = 0; ri < RINGS.length; ri += 2) {
    const r = RINGS[ri];
    const age = t - r.t0;
    if (age < 0 || age > 0.16) continue;
    if (waterLum(r.x, r.z, ri) < 0.25) continue;
    const near = clamp(2 / (r.z - C.ez), 0.4, 1.2);
    for (let k = 0; k < 2; k++) {
      sk.p3(r.x + (k - 0.5) * 0.05, -0.02 - 0.03 * k - age * 0.2, r.z, Q);
      sk.id = 11_000_000 + ri * 8 + k;
      sk.dot(Q[0], Q[1], (0.9 * near) / C.px);
    }
  }
}

// ---------------------------------------------------------------- the heron, and its image

function bird(sk: Sketch, t: number, st: State, mirror: boolean) {
  // the moon's direction on the view, from where the heron stands
  sk.p3(HX, -0.7, HZ, Q);
  const dx = C.mx - Q[0];
  const dy = C.my - Q[1];
  const dl = Math.hypot(dx, dy) || 1;
  const wobble = (h: number) => {
    const f = C.H / (C.H + h);
    const wx = mix(C.ex, HX, f);
    const wz = mix(C.ez, HZ, f);
    slopes(wx, wz);
    return -2 * S[0] * Math.hypot(HX - wx, h, HZ - wz);
  };
  heron(sk, st.heron, t, mirror, wobble, dx / dl, dy / dl, 0.85, C.amb / 0.2);
}

// ---------------------------------------------------------------- the reeds, and their images in the water

const BP = new Float32Array((NB + 1) * 3);
const MX: number[] = [];
const EL: number[] = [];
const ER: number[] = [];
const ELW: number[] = [];
const ERW: number[] = [];
const CL: number[] = [];
const CR: number[] = [];
// the moon's direction
const ML = Math.hypot(MU, MV, 1);
const MDX = MU / ML;
const MDY = -MV / ML;
const MDZ = 1 / ML;

function reeds(sk: Sketch, st: State) {
  const dusk = clamp(C.amb / 0.2, 0, 1);
  sk.depthW = 0.55;
  sk.depthRef = 3;
  // their images first: under the water line, broken by the surface into level dashes
  sk.amp = 0.4;
  for (let bi = 0; bi < BLADES.length; bi++) {
    const b = BLADES[bi];
    bladePts(b, st.bx[bi], st.bz[bi], BP);
    MX.length = 0;
    let ok = true;
    for (let i = 0; i <= NB; i++) {
      const x = BP[i * 3];
      const h = -BP[i * 3 + 1];
      const z = BP[i * 3 + 2];
      // where on the water the image of this point is seen, and how the water there tilts it
      const f = C.H / (C.H + h);
      const wx = mix(C.ex, x, f);
      const wz = mix(C.ez, z, f);
      slopes(wx, wz);
      const d = Math.hypot(x - wx, h, z - wz);
      if (!sk.p3(x - 2 * S[0] * d, h, z, Q)) {
        ok = false;
        break;
      }
      MX.push(Q[0], Q[1]);
    }
    if (!ok) continue;
    const dep = Math.max(0.5, BP[2] - C.ez);
    // the dark image hides the bright water behind it
    sk.id = 12_000_000 + b.i * 64;
    sk.m(MX[0], MX[1]);
    for (let i = 1; i <= NB * 0.8; i++) sk.l(MX[i * 2], MX[i * 2 + 1]);
    sk.e(1.5 + (2 * b.w * FOC * C.px) / dep);
    // the moonlit edge, seen again: a dash at each step, fewer further down
    for (let i = 1; i < NB; i++) {
      if (hash(b.i * 53 + i, 171) > 0.5 * (1 - (0.8 * i) / NB)) continue;
      const len = ((1.5 + 3 * hash(b.i * 13 + i, 172)) * (1.6 / dep) ** 0.5) / C.px;
      const x = MX[i * 2] + (hash(b.i * 7 + i, 173) - 0.5) * len;
      sk.id = 12_000_000 + b.i * 64 + 1 + i;
      sk.line(x - len, MX[i * 2 + 1], x + len, MX[i * 2 + 1], 0.55 + 0.3 * (1 - i / NB), 0.3, 0.15);
    }
  }
  // the reeds themselves
  sk.amp = 0.8;
  for (let bi = 0; bi < BLADES.length; bi++) {
    const b = BLADES[bi];
    bladePts(b, st.bx[bi], st.bz[bi], BP);
    EL.length = 0;
    ER.length = 0;
    ELW.length = 0;
    ERW.length = 0;
    let ok = true;
    for (let i = 0; i <= NB; i++) {
      const s = i / NB;
      const a = Math.max(0, i - 1) * 3;
      const c = Math.min(NB, i + 1) * 3;
      const tx = BP[c] - BP[a];
      const ty = BP[c + 1] - BP[a + 1];
      const tz = BP[c + 2] - BP[a + 2];
      const vx = BP[i * 3] - C.ex;
      const vy = BP[i * 3 + 1] + C.H;
      const vz = BP[i * 3 + 2] - C.ez;
      // across the blade, square to the eye
      let sx = ty * vz - tz * vy;
      let sy = tz * vx - tx * vz;
      let sz = tx * vy - ty * vx;
      const sl = Math.hypot(sx, sy, sz) || 1;
      sx /= sl;
      sy /= sl;
      sz /= sl;
      const twist = 0.3 + 0.7 * Math.abs(Math.cos(b.tw + s * 2.4));
      const hw = b.w * (1 - 0.9 * s ** 1.3) * (b.cat ? 1 : twist);
      const x = BP[i * 3];
      const y = BP[i * 3 + 1];
      const z = BP[i * 3 + 2];
      if (!sk.p3(x + sx * hw, y + sy * hw, z + sz * hw, Q)) {
        ok = false;
        break;
      }
      EL.push(Q[0], Q[1]);
      sk.p3(x - sx * hw, y - sy * hw, z - sz * hw, Q);
      ER.push(Q[0], Q[1]);
      // which edge the moon finds
      const m = (sx * MDX + sy * MDY + sz * MDZ) * 5;
      const dep = clamp((2.6 / Math.max(0.5, vz)) ** 0.55, 0.6, 1.8);
      // a signed weight: positive where the moon finds this edge
      ELW.push(
        (m > 0.08 ? 1 : -1) * dep * (0.38 + (0.25 + 0.5 * dusk) * clamp(m, 0, 1)) * (1 - 0.4 * s),
      );
      ERW.push(
        (m < -0.08 ? 1 : -1) * dep * (0.38 + (0.25 + 0.5 * dusk) * clamp(-m, 0, 1)) * (1 - 0.4 * s),
      );
    }
    if (!ok) continue;
    sk.id = 12_100_000 + b.i * 64;
    strip(sk, EL, ER, NB + 1);
    // backlit: the moon finds one edge, a hairline; while the dusk lasts, the light from behind
    // us still shows the near edge here and there
    for (let side = 0; side < 2; side++) {
      const E = side ? ER : EL;
      const W = side ? ERW : ELW;
      let open = false;
      let piece = 0;
      for (let i = 0; i <= NB; i++) {
        const lit = W[i] > 0 && hash(b.i * 29 + i + side * 13, 174) < 0.9;
        const on = lit || hash(b.i * 31 + i + side * 17, 172) < 0.14 * dusk;
        const w = lit ? W[i] : 0.5 * dusk;
        if (on) {
          if (!open) {
            sk.id = 12_100_000 + b.i * 64 + 1 + side * 16 + piece++;
            pm(E[i * 2], E[i * 2 + 1], w);
            open = true;
          } else pl(E[i * 2], E[i * 2 + 1], w);
        }
        if (open && (!on || i === NB)) {
          if (pcount() > 1) pink(sk, 0.12, 0.5, 0.3);
          open = false;
        }
      }
    }
    // a cattail's head: a dark spindle on the stalk, its moonward side caught
    if (b.cat) {
      const i0 = Math.round(b.cat * NB);
      const i1 = Math.min(NB - 1, i0 + 3);
      CL.length = 0;
      CR.length = 0;
      for (let i = i0; i <= i1; i++) {
        const s = (i - i0) / (i1 - i0);
        const r = 0.048 * Math.sin(Math.PI * (0.08 + 0.84 * s)) ** 0.45;
        // across the head, square to the eye: from its two edges' points
        const lx = EL[i * 2] - ER[i * 2];
        const ly = EL[i * 2 + 1] - ER[i * 2 + 1];
        const ll = Math.hypot(lx, ly) || 1;
        sk.p3(BP[i * 3], BP[i * 3 + 1], BP[i * 3 + 2], Q);
        const rv = (r * FOC) / Math.max(0.3, sk.depth(BP[i * 3], BP[i * 3 + 1], BP[i * 3 + 2]));
        CL.push(Q[0] + (lx / ll) * rv, Q[1] + (ly / ll) * rv);
        CR.push(Q[0] - (lx / ll) * rv, Q[1] - (ly / ll) * rv);
      }
      const n = i1 - i0 + 1;
      sk.id = 12_100_000 + b.i * 64 + 40;
      strip(sk, CL, CR, n);
      const moonward = ELW[i0] > ERW[i0];
      for (let side = 0; side < 2; side++) {
        const E = side ? CR : CL;
        const lit = (side === 0) === moonward;
        sk.id = 12_100_000 + b.i * 64 + 41 + side;
        pm(E[0], E[1], 0.5);
        if (!lit && dusk < 0.3) continue;
        for (let i = 1; i < n; i++)
          pl(
            E[i * 2],
            E[i * 2 + 1],
            (lit ? 1.1 : 0.5 * dusk) * Math.sin((Math.PI * i) / (n - 1)) + 0.4,
          );
        pink(sk, 0.2, 0.3, 0.3);
      }
    }
  }
  sk.depthW = 0;
}

// ---------------------------------------------------------------- fireflies, and their images

const FP = [0, 0, 0];
const FP2 = [0, 0, 0];

function flies(sk: Sketch, t: number) {
  sk.amp = 0.15;
  // the flashes go on and off with the hand's redraws (about ten a second)
  const tq = Math.floor(t * 10) / 10;
  for (const f of FLIES) {
    if (!flashAt(f, tq)) continue;
    const b = glowAt(FL[0]);
    flyPos(f, t, FL[0], FP);
    if (!sk.p3(FP[0], FP[1], FP[2], Q)) continue;
    const near = clamp(3.2 / (FP[2] - C.ez), 0.7, 1.4);
    const hx = Q[0];
    const hy = Q[1];
    if (Math.abs(hx) > 0.92 * C.A) continue;
    // a short streak where it has just been, if it is moving
    flyPos(f, t - 0.06, FL[0], FP2);
    sk.p3(FP2[0], FP2[1], FP2[2], Q);
    let sx = Q[0] - hx;
    let sy = Q[1] - hy;
    const sl = Math.hypot(sx, sy) * C.px;
    if (sl > 4) {
      sx *= 4 / sl;
      sy *= 4 / sl;
    }
    const r = ((0.95 + 1.0 * b) * near) / C.px;
    sk.id = 13_000_000 + f.i * 8;
    if (sl > 1.2 && b > 0.5) sk.line(hx + sx, hy + sy, hx, hy, 1.1 * b * near, 0.5, 0);
    sk.id = 13_000_000 + f.i * 8 + 1;
    sk.dot(hx, hy, r, r * 0.9);
    // its image: a few short level glints right under it in the water, wavering
    const h = -FP[1];
    const ff = C.H / (C.H + h);
    const wx = mix(C.ex, FP[0], ff);
    const wz = mix(C.ez, FP[2], ff);
    slopes(wx, wz);
    const dd = Math.hypot(FP[0] - wx, h, FP[2] - wz);
    if (!sk.p3(FP[0] - 2 * S[0] * dd, h, FP[2], Q)) continue;
    const cx = Q[0];
    const cy = Q[1];
    const n = b > 0.6 ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const jx = (hash(f.i * 7 + k, C.boil) - 0.5) * 2.5 * near;
      const len =
        (1.4 + 2.2 * b * (0.5 + 0.5 * hash(f.i * 5 + k, C.boil + 3))) * near * (1 - 0.2 * k);
      const y = cy + ((k - 0.6) * 2.6 * near) / C.px;
      sk.id = 13_000_000 + f.i * 8 + 2 + k;
      sk.line(
        cx + (jx - len) / C.px,
        y,
        cx + (jx + len) / C.px,
        y,
        (0.6 + 0.8 * b) * near,
        0.25,
        0,
      );
    }
  }
}
