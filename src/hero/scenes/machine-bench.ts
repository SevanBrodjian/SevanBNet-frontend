// The bench under the lamp: planks of wood whose grain runs off into the dark at a slant, lit
// in a pool round the bird's turned stand, the bench's front edge across the bottom of the
// view; the grooved rail the ball comes down; the lever it drops onto, a counterweighted
// strip whose far end lifts a brass finger into a notch under the bird's balance; and what
// lies about: a loupe, a loose wheel, a mainspring, a fine screwdriver, a drawing pinned flat.
// World: metres, y down, the bench top at y = 0.

import { clamp, hash, mix, noise, type Sketch, smooth, TAU } from "../sketch";
import { inFrame, ink, LAMP, lamp, pband, pfill, pl, pm, teeth, wd } from "./machine-kit";

const V0 = [0, 0, 0];
const V1 = [0, 0, 0];
const VP = [0, 0, 0];
const VQ = [0, 0, 0];

// ---------------------------------------------------------------- layout

/** The stand: a turned base the bird stands on. */
export const STAND = { x: 0.008, z: 0.009, r: 0.026, h: 0.013 };
export const BALL_R = 0.0052;
/** Where the lever's cup rests, low by the stand's left; the rail ends just above and before it. */
export const CUP0 = [-0.07, -0.0145, -0.033];
/** The rail: its groove from the far end (in the dark) to the near end over the lever's cup. */
export const RAIL_A = [-0.232, -0.062, 0.09];
export const RAIL_B = (() => {
  const dx = CUP0[0] - RAIL_A[0];
  const dz = CUP0[2] - RAIL_A[2];
  const l = Math.hypot(dx, dz);
  return [CUP0[0] - (dx / l) * 0.0065, CUP0[1] - 0.0125, CUP0[2] - (dz / l) * 0.0065];
})();
export const RAIL_L = Math.hypot(
  RAIL_B[0] - RAIL_A[0],
  RAIL_B[1] - RAIL_A[1],
  RAIL_B[2] - RAIL_A[2],
);
const RD = [
  (RAIL_B[0] - RAIL_A[0]) / RAIL_L,
  (RAIL_B[1] - RAIL_A[1]) / RAIL_L,
  (RAIL_B[2] - RAIL_A[2]) / RAIL_L,
];
/** Across the rail (horizontal), toward us. */
const RX = (() => {
  const x = RD[2];
  const z = -RD[0];
  const l = Math.hypot(x, z);
  return [x / l, 0, z / l];
})();
export const RAIL_DIR = RD;
const RAIL_W = 0.0058; // half-width
const RAIL_H = 0.0078;
const GROOVE = 0.0024;
/** The rail's supports, as fractions along it. */
const POSTS = [0.3, 0.72];

/** The ball's centre at s along the rail. */
export function railBall(s: number, out: number[]): number[] {
  out[0] = RAIL_A[0] + RD[0] * s;
  out[1] = RAIL_A[1] + RD[1] * s - (BALL_R - GROOVE * 0.6);
  out[2] = RAIL_A[2] + RD[2] * s;
  return out;
}

/**
 * The lever: a brass strip on a pivot post. Behind the pivot a round counterweight holds it
 * up; ahead of it the cup, and far ahead its end, from which a short finger stands up into a
 * notch in the bird's window and holds the balance. The ball's weight in the cup tips it: the
 * far end drops and the finger comes down out of the notch.
 */
export const LEV = {
  /** The pivot. */
  x: 0,
  y: 0,
  z: 0,
  /** The far arm's direction in plan (unit), and its rest elevation (rad, + up). */
  hx: 1,
  hz: 0,
  th0: 0.2,
  /** Pivot to cup, to the far end, to the counterweight (the other way). */
  Lc: 0.011,
  Le: 0.08,
  Lw: 0.0105,
  /** The finger's length, straight up from the far end at rest. */
  fin: 0.009,
};

/** Lay the lever so its finger's tip rests at tip (world). */
export function layLever(tip: number[]): void {
  const ex = tip[0];
  const ey = tip[1] + LEV.fin;
  const ez = tip[2];
  const dx = ex - CUP0[0];
  const dy = ey - CUP0[1];
  const dz = ez - CUP0[2];
  const h = Math.hypot(dx, dz);
  LEV.hx = dx / h;
  LEV.hz = dz / h;
  LEV.th0 = Math.atan2(-dy, h);
  LEV.Le = LEV.Lc + Math.hypot(h, dy);
  LEV.x = CUP0[0] - LEV.hx * Math.cos(LEV.th0) * LEV.Lc;
  LEV.y = CUP0[1] + Math.sin(LEV.th0) * LEV.Lc;
  LEV.z = CUP0[2] - LEV.hz * Math.cos(LEV.th0) * LEV.Lc;
  // the post's foot keeps the light off the bench round it
  BASES[BASE_LEVER * 4] = LEV.x;
  BASES[BASE_LEVER * 4 + 1] = LEV.z + 0.0035;
}

/** A point at signed distance d along the lever (+ toward the far end) when tipped by la. */
export function levAt(d: number, la: number, out: number[]): number[] {
  const th = LEV.th0 - la;
  out[0] = LEV.x + LEV.hx * Math.cos(th) * d;
  out[1] = LEV.y - Math.sin(th) * d;
  out[2] = LEV.z + LEV.hz * Math.cos(th) * d;
  return out;
}

/** The cup's centre (the ball sits a little above it) when the lever is tipped by la. */
export function cupAt(la: number, out: number[]): number[] {
  return levAt(LEV.Lc, la, out);
}

/** The finger's tip when the lever is tipped by la. */
export function fingerTip(la: number, out: number[]): number[] {
  levAt(LEV.Le, la, out);
  out[0] += LEV.hx * Math.sin(la) * LEV.fin;
  out[1] -= Math.cos(la) * LEV.fin;
  out[2] += LEV.hz * Math.sin(la) * LEV.fin;
  return out;
}

// ---------------------------------------------------------------- what keeps light off the bench

/** Bases standing on the bench: x, z, radius, and how wide the dark crescent round them is. */
const BASES: number[] = [];
const base = (x: number, z: number, r: number, w: number) => {
  BASES.push(x, z, r, w);
  return BASES.length / 4 - 1;
};

/** The loose things' places. */
const LOUPE = { x: -0.142, z: -0.052, r0: 0.0145, r1: 0.0095, h: 0.017 };
const WHEEL = { x: 0.062, z: -0.05, N: 36, r: 0.0118, ang: 1.1 };
const SPRING = { x: -0.06, z: 0.078 };

base(STAND.x, STAND.z, STAND.r, 0.0042);
base(LOUPE.x, LOUPE.z, LOUPE.r0, 0.0034);
base(WHEEL.x, WHEEL.z, WHEEL.r * 1.05, 0.0018);
for (const u of POSTS) {
  base(RAIL_A[0] + RD[0] * RAIL_L * u, RAIL_A[2] + RD[2] * RAIL_L * u, 0.0052, 0.0022);
}
const BASE_LEVER = base(0, 0, 0.0045, 0.002);

/** 1, or toward 0 just outside a base on the side away from the lamp (its contact shadow). */
function contact(x: number, z: number): number {
  let k = 1;
  for (let i = 0; i < BASES.length; i += 4) {
    const bx = BASES[i];
    const bz = BASES[i + 1];
    const r = BASES[i + 2];
    const w = BASES[i + 3];
    const dx0 = x - bx;
    const dz0 = z - bz;
    if (dx0 * dx0 + dz0 * dz0 > (r + w * 2) ** 2) continue;
    let lx = LAMP.x - bx;
    let lz = LAMP.z - bz;
    const l = Math.hypot(lx, lz) || 1;
    lx /= l;
    lz /= l;
    // a disc a little larger than the base, pushed away from the lamp
    const d = Math.hypot(dx0 + lx * w * 0.6, dz0 + lz * w * 0.6) - (r + w * 0.5);
    k *= smooth(-w * 0.1, w * 0.35, d);
  }
  return k;
}

// ---------------------------------------------------------------- the bench

/** The grain's angle to the bench's front edge, and the front edge (z). */
const GA = 0.5;
const CG = Math.cos(GA);
const SG = Math.sin(GA);
export const ZF = -0.094;
/** The seams between the planks: across the grain (plank coordinate b). */
const SEAMS = [-0.152, -0.06, 0.032, 0.124, 0.216];
/** Knots: plank coordinates (a along the grain, b across) and size. */
const KNOTS = [
  [0.112, 0.074, 0.0048],
  [-0.15, -0.012, 0.0036],
  [0.02, -0.098, 0.003],
];

const plankA = (x: number, z: number) => x * CG + z * SG;
const plankB = (x: number, z: number) => -x * SG + z * CG;

/** Inside a knot's dark eye? */
function inKnot(a: number, b: number): boolean {
  for (const [ka, kb, ks] of KNOTS) {
    const u = (a - ka) / (ks * 1.9);
    const v = (b - kb) / (ks * 0.75);
    if (u * u + v * v < 1) return true;
  }
  return false;
}

/** The pool on the bench: full under the lamp, thinning out to its rim; dark round the feet
 *  of what stands on it, in the knots' eyes, and off the bench's front edge. */
const benchLight = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
  if (z < ZF + 0.0015) return 0;
  const l = lamp(x, y, z, nx, ny, nz, 0.15);
  if (l < 0.01) return 0;
  if (inKnot(plankA(x, z), plankB(x, z))) return 0;
  return clamp(l * 0.85, 0, 1) ** 1.45 * contact(x, z);
};

export function bench(sk: Sketch, g: number): void {
  sk.group(g);
  sk.amp = 0.75;
  // planks at a slant, each with its own grain wandering round a knot or two
  sk.surf(
    (u, v, o) => {
      const a = mix(-0.34, 0.34, u);
      let b = mix(-0.25, 0.3, v);
      let board = 0;
      for (const s of SEAMS) if (b > s) board++;
      const ph = board * 2.3;
      // the figure: lines drawing together and apart, never in step
      b +=
        0.0024 * Math.sin(a * (15 + board * 3) + ph + b * 70) +
        0.0011 * Math.sin(a * 41 - ph * 2 + b * 150) +
        0.0007 * noise(a * 60 + b * 300, board + 3);
      // round the knots
      for (const [ka, kb, ks] of KNOTS) {
        const da = (a - ka) / 2.6;
        const db = b - kb;
        const r2 = (da * da + db * db) / (ks * ks * 5);
        b += ks * 1.3 * Math.exp(-r2) * Math.sign(db || 1);
      }
      o[0] = a * CG - b * SG;
      o[1] = 0;
      o[2] = a * SG + b * CG;
    },
    30,
    26,
    {
      dir: 1,
      n: 196 * (30 / 26),
      dashes: 4,
      w: 0.52,
      floor: 0.09,
      ragged: 0.8,
      cross: 2,
      seed: 5,
      exact: true,
      light: benchLight,
    },
  );
  // the seams: dark gaps along the planks' edges, unbroken through the light
  sk.amp = 0.4;
  const P = [0, 0, 0];
  for (let j = 0; j < SEAMS.length; j++) {
    sk.group(g + 1 + j);
    let open = false;
    let run = 0;
    for (let i = 0; i <= 48; i++) {
      const a = mix(-0.34, 0.34, i / 48);
      const b = SEAMS[j] + 0.0006 * Math.sin(a * 9 + j);
      const x = a * CG - b * SG;
      const z = a * SG + b * CG;
      const lt = z > ZF ? lamp(x, 0, z, 0, -1, 0, 0.15) : 0;
      if (lt > 0.06) {
        sk.p3(x, 0, z, P);
        if (!open) {
          sk.id = (g + 1 + j) * 10007 + run * 2;
          sk.m(P[0], P[1]);
          open = true;
        } else sk.l(P[0], P[1]);
      } else if (open) {
        sk.e(2.6);
        open = false;
        run++;
      }
    }
    if (open) sk.e(2.6);
  }
  // the knots' eyes: a thin lit lip round each dark eye, where the light is on it
  sk.amp = 0.5;
  for (let j = 0; j < KNOTS.length; j++) {
    sk.group(g + 8 + j);
    const [ka, kb, ks] = KNOTS[j];
    const x0 = ka * CG - kb * SG;
    const z0 = ka * SG + kb * CG;
    const lt = lamp(x0, 0, z0, 0, -1, 0, 0.15) * contact(x0, z0);
    if (lt < 0.12) continue;
    const s0 = hash(j, 71) * TAU;
    for (let i = 0; i <= 20; i++) {
      const t = s0 + (i / 18) * TAU;
      const a = ka + Math.cos(t) * ks * 2.1;
      const b = kb + Math.sin(t) * ks * 0.95;
      sk.p3(a * CG - b * SG, 0, a * SG + b * CG, P);
      const w = (0.4 + 0.35 * lt) * (0.6 + 0.4 * Math.abs(Math.sin(t)));
      if (i === 0) pm(P[0], P[1], w);
      else pl(P[0], P[1], w);
    }
    ink(sk, 0.25, 0.3, 0.3);
  }
  // the front edge: clear what lies beyond it (the bench's front face, in its own shade), and
  // its arris where the light reaches it
  sk.group(g + 12);
  if (sk.p3(-0.5, 0, ZF, VP) && sk.p3(0.5, 0, ZF, VQ)) {
    const dx = VQ[0] - VP[0];
    const dy = VQ[1] - VP[1];
    const l = Math.hypot(dx, dy) || 1;
    // toward the bottom of the view, square to the edge
    let nx = -dy / l;
    let ny = dx / l;
    if (ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    pm(VP[0], VP[1], 0);
    pl(VQ[0], VQ[1], 0);
    pl(VQ[0] + nx * 4, VQ[1] + ny * 4, 0);
    pl(VP[0] + nx * 4, VP[1] + ny * 4, 0);
    pfill(sk);
  } else sk.id++;
  sk.group(g + 13);
  sk.amp = 0.7;
  {
    let open = false;
    let run = 0;
    for (let i = 0; i <= 40; i++) {
      const x = mix(-0.3, 0.3, i / 40);
      const lt = lamp(x, 0, ZF, 0, -0.8, -0.6, 0.3);
      if (lt > 0.05 && sk.p3(x, -0.0003, ZF, P)) {
        const w = (0.5 + 0.8 * Math.min(1, lt * 1.6)) * wd(sk, P[2]);
        if (!open) {
          sk.id = (g + 13) * 10007 + run * 2;
          pm(P[0], P[1], w);
          open = true;
        } else pl(P[0], P[1], w);
      } else if (open) {
        ink(sk, 0.3, 0.6, 0.35);
        open = false;
        run++;
      }
    }
    if (open) ink(sk, 0.3, 0.6, 0.35);
  }
  sk.amp = 1;
}

// ---------------------------------------------------------------- a turned post

/** A turned post standing on the bench at (x, z) up to y = top: tapering, a collar near its
 *  top, a foot; cleared, edged heavier away from the lamp, a lit stripe down its lit side. */
function post(sk: Sketch, x: number, z: number, top: number, r: number): void {
  const N = 10;
  if (!sk.p3(x, top, z, VP) || !sk.p3(x, 0, z, VQ)) return;
  // the lamp's side on the view
  const my = top * 0.5;
  const lt = lamp(x, my, z, LAMP.x - x, 0, LAMP.z - z, 0.4);
  const k = wd(sk, VQ[2]);
  const tx = VP[0] - VQ[0];
  const ty = VP[1] - VQ[1];
  const tl = Math.hypot(tx, ty) || 1;
  let nx = -ty / tl;
  let ny = tx / tl;
  sk.p3(x + Math.sign(LAMP.x - x) * 0.01, my, z, V0);
  sk.p3(x, my, z, V1);
  if ((V0[0] - V1[0]) * nx + (V0[1] - V1[1]) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  // radius along it (u = 0 at the foot): a taper, a collar at 0.82
  const rad = (u: number) =>
    r *
    (1.12 - 0.3 * u + 0.4 * Math.exp(-(((u - 0.82) / 0.05) ** 2))) *
    (sk.foc / mix(VQ[2], VP[2], u));
  const at = (u: number, s: number, o: number[]) => {
    const rr = rad(u) * s;
    o[0] = mix(VQ[0], VP[0], u) + nx * rr;
    o[1] = mix(VQ[1], VP[1], u) + ny * rr;
    return o;
  };
  for (let i = 0; i <= N; i++) {
    at(i / N, 1, V0);
    if (i === 0) pm(V0[0], V0[1], 0);
    else pl(V0[0], V0[1], 0);
  }
  for (let i = N; i >= 0; i--) {
    at(i / N, -1, V0);
    pl(V0[0], V0[1], 0);
  }
  pband(sk);
  // the foot: a flat disc on the bench, the near half
  const fr = (0.0052 * sk.foc) / VQ[2];
  sk.arc(VQ[0], VQ[1] - fr * 0.06, fr, fr * 0.36, Math.PI, TAU).fill();
  if (lt < 0.04) {
    sk.id += 5;
    return;
  }
  const on = Math.min(1, lt * 2.5);
  for (const s of [1, -1]) {
    for (let i = 0; i <= N; i++) {
      at(i / N, s, V0);
      const w = (s > 0 ? 0.55 : 1.1 + 0.5 * (1 - lt)) * k * on;
      if (i === 0) pm(V0[0], V0[1], w);
      else pl(V0[0], V0[1], w);
    }
    ink(sk, 0.08, 0.3, 0.3);
  }
  // the lit stripe, broken at the collar
  if (lt > 0.2) {
    for (let i = 1; i <= 7; i++) {
      at(i / N, 0.4, V0);
      if (i === 1) pm(V0[0], V0[1], 0.45 * k);
      else pl(V0[0], V0[1], 0.5 * k);
    }
    ink(sk, 0.3, 0.2, 0.3);
  } else sk.id++;
  // the collar's front, and the foot's rim
  {
    const c = (sk.foc / mix(VQ[2], VP[2], 0.82)) * r * 1.5;
    const cx = mix(VQ[0], VP[0], 0.82);
    const cy = mix(VQ[1], VP[1], 0.82);
    sk.arc(cx, cy, c, c * 0.32, 0.25, Math.PI - 0.25).s(0.5 * k * on, 0.2, 0.2);
  }
  sk.arc(VQ[0], VQ[1], fr, fr * 0.36, -0.15, Math.PI + 0.15).s(0.85 * k * on, 0.15, 0.3);
}

// ---------------------------------------------------------------- the stand

/** The turned base: a low drum with a moulded top, its top face struck with turning rings. */
export function stand(sk: Sketch, g: number): void {
  const { x, z, r, h } = STAND;
  sk.group(g);
  const N = 48;
  // the silhouette: top ellipse's far half, bottom's near half
  const top = (t: number, o: number[], rr = r, y = -h) => {
    o[0] = x + Math.cos(t) * rr;
    o[1] = y;
    o[2] = z + Math.sin(t) * rr;
    return o;
  };
  // (z is away from us: the far half is t in (0, pi), the near half t in (pi, 2 pi))
  pm(0, 0, 0);
  for (let i = 0; i <= N; i++) {
    top((i / N) * Math.PI, V0, r * 0.96);
    sk.p3(V0[0], V0[1], V0[2], VP);
    if (i === 0) pm(VP[0], VP[1], 0);
    else pl(VP[0], VP[1], 0);
  }
  for (let i = 0; i <= N; i++) {
    top(Math.PI + (i / N) * Math.PI, V0, r, 0);
    sk.p3(V0[0], V0[1], V0[2], VP);
    pl(VP[0], VP[1], 0);
  }
  pfill(sk);
  const k = wd(sk, sk.depth(x, -h, z));
  // the drum's side: vertical strokes where the lamp finds it
  sk.amp = 0.6;
  for (let i = 0; i < 40; i++) {
    sk.id = g * 10007 + 10 + i * 2;
    const t = Math.PI + (i / 40) * Math.PI + (hash(i, 31) - 0.5) * 0.04;
    const nx = Math.cos(t);
    const nz = Math.sin(t);
    const px = x + nx * r;
    const pz = z + nz * r;
    const lt = lamp(px, -h * 0.5, pz, nx, 0, nz, 0.3);
    if (lt < 0.15 + 0.4 * hash(i, 32)) continue;
    const y0 = -h * (0.15 + 0.2 * hash(i, 33));
    const y1 = -h * (0.62 + 0.15 * hash(i, 34));
    sk.m3(px, y0, pz)
      .l3(px, mix(y0, y1, 0.5), pz)
      .l3(px, y1, pz)
      .s3(0.45 + 0.35 * lt, 0.3, 0.3);
  }
  // the top: three turned rings, each a long arc on the side the lamp lights, ragged where
  // the light gives out
  for (let j = 0; j < 3; j++) {
    sk.id = g * 10007 + 200 + j * 6;
    const rr = r * (0.42 + j * 0.2);
    const la = Math.atan2(LAMP.z - z, LAMP.x - x);
    const c0 = la - 1.25 + (hash(j, 36) - 0.5) * 0.5;
    const span = 2.4 + 0.8 * hash(j, 37);
    for (let i = 0; i <= 24; i++) {
      const t = c0 + (i / 24) * span;
      top(t, V0, rr, -h - 0.0003);
      sk.p3(V0[0], V0[1], V0[2], VP);
      const lt = lamp(V0[0], V0[1], V0[2], 0, -1, 0, 0.2);
      if (i === 0) pm(VP[0], VP[1], (0.3 + 0.25 * lt) * k);
      else pl(VP[0], VP[1], (0.3 + 0.3 * lt) * k * Math.sin((i / 24) * Math.PI) ** 0.5);
    }
    ink(sk, 0.3, 0.3, 0.3);
  }
  // edges: the top's rim (all round, heavy away from the lamp), the bead, the foot's near arc
  sk.group(g + 1);
  sk.amp = 0.85;
  for (let i = 0; i <= N + 4; i++) {
    const t = (i / N) * TAU + hash(g + 1, sk.boil) * TAU;
    top(t, V0, r * 0.96);
    sk.p3(V0[0], V0[1], V0[2], VP);
    const lt = lamp(V0[0], V0[1], V0[2], Math.cos(t) * 0.7, -0.7, Math.sin(t) * 0.7, 0.3);
    const w = (0.6 + 1.1 * (1 - lt)) * k;
    if (i === 0) pm(VP[0], VP[1], w);
    else pl(VP[0], VP[1], w);
  }
  ink(sk, 0.04, 0.4, 0.3);
  sk.group(g + 2);
  for (let i = 0; i <= N / 2; i++) {
    const t = Math.PI + (i / (N / 2)) * Math.PI;
    top(t, V0, r, -h * 0.72);
    sk.p3(V0[0], V0[1], V0[2], VP);
    const lt = lamp(V0[0], V0[1], V0[2], Math.cos(t), 0, Math.sin(t), 0.4);
    if (i === 0) pm(VP[0], VP[1], 0.6 * k);
    else pl(VP[0], VP[1], (0.45 + 0.4 * lt) * k);
  }
  ink(sk, 0.15, 0.3, 0.3);
  sk.group(g + 3);
  for (let i = 0; i <= N / 2; i++) {
    const t = Math.PI + (i / (N / 2)) * Math.PI;
    top(t, V0, r, 0);
    sk.p3(V0[0], V0[1], V0[2], VP);
    const lt = lamp(V0[0], V0[1], V0[2], Math.cos(t), 0, Math.sin(t), 0.4);
    if (i === 0) pm(VP[0], VP[1], 1.2 * k);
    else pl(VP[0], VP[1], (1.5 - 0.5 * lt) * k);
  }
  ink(sk, 0.1, 0.4, 0.3);
  sk.group(g + 4);
  for (const t of [0, Math.PI]) {
    top(t, V0, r * 0.97, -h);
    top(t, V1, r, 0);
    sk.m3(V0[0], V0[1], V0[2])
      .l3(mix(V0[0], V1[0], 0.5), mix(V0[1], V1[1], 0.5), mix(V0[2], V1[2], 0.5))
      .l3(V1[0], V1[1], V1[2])
      .s3(t ? 1.3 : 0.8, 0.2, 0.6);
  }
  sk.amp = 1;
}

// ---------------------------------------------------------------- the rail

/** The rail: two turned posts, then the grooved strip on them, its near face and top lit. */
export function rail(sk: Sketch, g: number): void {
  // supports: two turned posts with round feet
  for (let j = 0; j < POSTS.length; j++) {
    sk.group(g + j);
    const u = POSTS[j];
    const cx = RAIL_A[0] + RD[0] * RAIL_L * u;
    const cy = RAIL_A[1] + RD[1] * RAIL_L * u + RAIL_H;
    const cz = RAIL_A[2] + RD[2] * RAIL_L * u;
    sk.amp = 0.7;
    post(sk, cx, cz, cy, 0.0021);
  }
  // the rail: its near side face and its top, a band each, cleared then lit
  const at = (s: number, across: number, down: number, o: number[]) => {
    o[0] = RAIL_A[0] + RD[0] * s + RX[0] * across;
    o[1] = RAIL_A[1] + RD[1] * s + down;
    o[2] = RAIL_A[2] + RD[2] * s + RX[2] * across;
    return o;
  };
  const L = RAIL_L;
  sk.group(g + 3);
  // clear the rail's body (top and near side together)
  const NN = 16;
  for (let i = 0; i <= NN; i++) {
    at((i / NN) * L, -RAIL_W, -0.0003, V0);
    sk.p3(V0[0], V0[1], V0[2], VP);
    if (i === 0) pm(VP[0], VP[1], 0);
    else pl(VP[0], VP[1], 0);
  }
  for (let i = NN; i >= 0; i--) {
    at((i / NN) * L, RAIL_W, RAIL_H, V0);
    sk.p3(V0[0], V0[1], V0[2], VP);
    pl(VP[0], VP[1], 0);
  }
  pband(sk);
  // the near face: grain along it where lit
  sk.amp = 0.6;
  sk.surf((u, v, o) => at(u * L, RAIL_W, mix(0.0004, RAIL_H, v), o), 12, 2, {
    dir: 1,
    n: 2,
    dashes: 5,
    w: 0.5,
    floor: 0.1,
    ragged: 0.6,
    cross: 2,
    seed: 7,
    light: (x, y, z) => 1.05 * lamp(x, y, z, RX[0], -0.15, RX[2], 0.35),
  });
  // the top face either side of the groove
  sk.group(g + 4);
  sk.surf((u, v, o) => at(u * L, mix(-RAIL_W, RAIL_W, v), 0, o), 12, 2, {
    dir: 1,
    n: 3,
    dashes: 4,
    w: 0.5,
    floor: 0.1,
    ragged: 0.6,
    cross: 2,
    seed: 8,
    light: (x, y, z) =>
      Math.abs((x - RAIL_A[0]) * RX[0] + (z - RAIL_A[2]) * RX[2]) < GROOVE * 0.9
        ? 0
        : 1.1 * lamp(x, y, z, 0, -1, 0, 0.3),
  });
  // edges: the top's far edge, the groove's two lips, the near bottom edge, lit or not
  sk.group(g + 5);
  sk.amp = 0.75;
  const edge = (across: number, down: number, w: number, n: number, ny: number, id: number) => {
    sk.id = (g + 5) * 10007 + id * 20;
    let open = false;
    let run = 0;
    for (let i = 0; i <= 30; i++) {
      at((i / 30) * L, across, down, V0);
      const lt = lamp(V0[0], V0[1], V0[2], RX[0] * n, ny, RX[2] * n, 0.5);
      if (lt > 0.08) {
        sk.p3(V0[0], V0[1], V0[2], VP);
        if (!open) {
          sk.id = (g + 5) * 10007 + id * 20 + run;
          pm(VP[0], VP[1], w * (0.5 + 0.7 * Math.min(1, lt)));
          open = true;
        } else pl(VP[0], VP[1], w * (0.5 + 0.7 * Math.min(1, lt)) * wd(sk, VP[2]));
      } else if (open) {
        ink(sk, 0.15, 0.4, 0.3);
        open = false;
        run++;
      }
    }
    if (open) ink(sk, 0.15, 0.4, 0.3);
  };
  edge(-RAIL_W, 0, 0.9, -0.4, -0.9, 0);
  edge(-GROOVE, 0.0004, 0.55, 0.6, -0.8, 1);
  edge(GROOVE, 0.0004, 0.75, -0.6, -0.8, 2);
  edge(RAIL_W, 0, 1.0, 0.5, -0.8, 3);
  edge(RAIL_W, RAIL_H, 1.2, 1, 0.2, 4);
  // the groove's floor, a dark channel with a thin lit line on its far wall
  edge(-GROOVE * 0.4, GROOVE * 0.7, 0.4, 0.8, -0.5, 5);
  // the near end: a small square face
  sk.group(g + 6);
  at(L, -RAIL_W, 0, V0);
  at(L, RAIL_W, 0, V1);
  sk.line3(V0[0], V0[1], V0[2], V1[0], V1[1], V1[2], 0.9);
  at(L, RAIL_W, RAIL_H, V0);
  sk.line3(V1[0], V1[1], V1[2], V0[0], V0[1], V0[2], 1.1);
  sk.amp = 1;
}

// ---------------------------------------------------------------- the ball

/** A brass ball: cleared, struck with arcs on its lit side, a catchlight, a heavy shadow edge. */
export function ball(sk: Sketch, g: number, x: number, y: number, z: number, roll: number): void {
  sk.group(g);
  if (!sk.p3(x, y, z, VP)) return;
  const r = (BALL_R * sk.foc) / VP[2];
  const cx = VP[0];
  const cy = VP[1];
  // which way the lamp is on the view
  const lx = LAMP.x - x;
  const ly = LAMP.y - y;
  const lz = LAMP.z - z;
  const ll = Math.hypot(lx, ly, lz);
  sk.p3(x + (lx / ll) * 0.01, y + (ly / ll) * 0.01, z + (lz / ll) * 0.01, VQ);
  let dx = VQ[0] - cx;
  let dy = VQ[1] - cy;
  const dl = Math.hypot(dx, dy) || 1;
  dx /= dl;
  dy /= dl;
  const lit = lamp(x, y, z, lx / ll, ly / ll, lz / ll, 0.5);
  sk.blot(cx, cy, r * 1.06);
  if (lit < 0.03) return;
  const k = wd(sk, VP[2]);
  // arcs round the lit side, turning with the roll
  sk.amp = 0.4;
  const la = Math.atan2(dy, dx);
  for (let i = 0; i < 4; i++) {
    const rr = r * (0.42 + i * 0.15);
    const span = 1.3 - i * 0.18;
    const c = la + (i - 1.5) * 0.12 + Math.sin(roll + i) * 0.1;
    sk.arc(cx + dx * r * 0.18, cy + dy * r * 0.18, rr, rr, c - span / 2, c + span / 2).s(
      (0.45 + 0.2 * lit) * k,
      0.4,
      0.15,
    );
  }
  // the outline, heavy away from the light
  sk.amp = 0.6;
  const s0 = hash(g, sk.boil) * TAU;
  for (let i = 0; i <= 26; i++) {
    const t = s0 + (i / 24) * TAU;
    const sh = 0.5 - 0.5 * (Math.cos(t) * dx + Math.sin(t) * dy);
    const w = (0.6 + 1.6 * sh * sh) * k * Math.min(1, lit * 2);
    if (i === 0) pm(cx + Math.cos(t) * r, cy + Math.sin(t) * r, w);
    else pl(cx + Math.cos(t) * r, cy + Math.sin(t) * r, w);
  }
  ink(sk, 0.05, 0.2, 0.2);
  // an engraved band round it, turning as it rolls
  ballBand(sk, g + 1, x, y, z, roll);
  // the catchlight, with a black moat
  sk.group(g + 2);
  if (lit > 0.15) {
    sk.amp = 0.15;
    const hx = cx + dx * r * 0.45;
    const hy = cy + dy * r * 0.45;
    sk.blot(hx, hy, r * 0.32);
    if (inFrame(sk, hx, hy)) sk.dot(hx, hy, r * 0.17, r * 0.14);
  }
  sk.amp = 1;
}

/** The ball's band: a great circle through its rolling axis (across the rail), turned by the
 *  roll; only its near, lit half is drawn. */
function ballBand(sk: Sketch, g: number, x: number, y: number, z: number, roll: number): void {
  sk.group(g);
  const ax = RX[0];
  const az = RX[2];
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const ux = RD[0] * cr;
  const uy = -sr;
  const uz = RD[2] * cr;
  const R = BALL_R * 1.01;
  let open = false;
  for (let i = 0; i <= 24; i++) {
    const t = (i / 24) * TAU;
    const px = x + (ax * Math.cos(t) + ux * Math.sin(t)) * R;
    const py = y + uy * Math.sin(t) * R;
    const pz = z + (az * Math.cos(t) + uz * Math.sin(t)) * R;
    const nx = (px - x) / R;
    const ny = (py - y) / R;
    const nz = (pz - z) / R;
    const vis = (sk.ex - px) * nx + (sk.ey - py) * ny + (sk.ez - pz) * nz > 0.0005 && ny < 0.35;
    if (vis) {
      sk.p3(px, py, pz, VP);
      if (!open) {
        pm(VP[0], VP[1], 0.45);
        open = true;
      } else pl(VP[0], VP[1], 0.55);
    } else if (open) {
      ink(sk, 0.3, 0.1, 0.2);
      open = false;
    }
  }
  if (open) ink(sk, 0.3, 0.1, 0.2);
}

// ---------------------------------------------------------------- the lever

/** A band along the lever from d0 to d1, half-widths h0 and h1, at tip la: its points into
 *  BAND (view), top edge first then the bottom edge back. */
const BAND = new Float32Array(2 * 2 * 14);
function leverBand(
  sk: Sketch,
  d0: number,
  d1: number,
  h0: number,
  h1: number,
  la: number,
  n: number,
): boolean {
  const th = LEV.th0 - la;
  // the strip's up, square to it in its vertical plane
  const ux = LEV.hx * Math.sin(th);
  const uy = -Math.cos(th);
  const uz = LEV.hz * Math.sin(th);
  for (let s = 0; s < 2; s++) {
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const d = mix(d0, d1, u);
      const hw = mix(h0, h1, u) * (s ? -1 : 1);
      levAt(d, la, V0);
      if (!sk.p3(V0[0] + ux * hw, V0[1] + uy * hw, V0[2] + uz * hw, VP)) return false;
      const j = s ? 2 * n + 1 - i : i;
      BAND[j * 2] = VP[0];
      BAND[j * 2 + 1] = VP[1];
    }
  }
  return true;
}

/**
 * The lever at tip la: the pivot post, the counterweight, the strip, the cup, the finger.
 */
export function lever(sk: Sketch, g: number, la: number): void {
  const k = wd(sk, sk.depth(LEV.x, LEV.y, LEV.z));
  const lt = lamp(LEV.x, LEV.y, LEV.z, 0, -0.6, -0.8, 0.5);
  // the post: from the bench up to the pivot, just behind the strip
  sk.group(g);
  sk.amp = 0.7;
  post(sk, LEV.x, LEV.z + 0.0035, LEV.y + 0.0016, 0.0019);
  // the counterweight: a small brass disc on the short arm
  sk.group(g + 1);
  const th = LEV.th0 - la;
  const ax = LEV.hx * Math.cos(th);
  const ay = -Math.sin(th);
  const az = LEV.hz * Math.cos(th);
  const upx = LEV.hx * Math.sin(th);
  const upy = -Math.cos(th);
  const upz = LEV.hz * Math.sin(th);
  {
    levAt(-LEV.Lw, la, V1);
    const R = 0.0052;
    const pts: number[] = [];
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * TAU;
      const c = Math.cos(t) * R;
      const s = Math.sin(t) * R;
      sk.p3(V1[0] + ax * c + upx * s, V1[1] + ay * c + upy * s, V1[2] + az * c + upz * s, VP);
      pts.push(VP[0], VP[1]);
    }
    pm(pts[0], pts[1], 0);
    for (let i = 1; i < 24; i++) pl(pts[i * 2], pts[i * 2 + 1], 0);
    pfill(sk);
    if (lt > 0.04) {
      // the rim, heavy below; a lit arc on the lamp's side; a screw at its centre
      const s0 = Math.floor(hash(g + 1, sk.boil) * 24);
      for (let i = 0; i <= 26; i++) {
        const j = (s0 + i) % 24;
        const t = (j / 24) * TAU;
        const w = (0.6 + 0.9 * Math.max(0, -Math.sin(t))) * k;
        if (i === 0) pm(pts[j * 2], pts[j * 2 + 1], w);
        else pl(pts[j * 2], pts[j * 2 + 1], w);
      }
      ink(sk, 0.05, 0.3, 0.3);
      sk.amp = 0.4;
      for (let i = 0; i <= 8; i++) {
        const t = 0.5 + (i / 8) * 1.6;
        const c = Math.cos(t) * R * 0.7;
        const s = Math.sin(t) * R * 0.7;
        sk.p3(V1[0] + ax * c + upx * s, V1[1] + ay * c + upy * s, V1[2] + az * c + upz * s, VP);
        if (i === 0) pm(VP[0], VP[1], 0.4 * k);
        else pl(VP[0], VP[1], 0.5 * k * Math.sin((i / 8) * Math.PI));
      }
      ink(sk, 0.3, 0.2, 0.3);
      if (sk.p3(V1[0], V1[1], V1[2], VP)) {
        const r = (0.0009 * sk.foc) / VP[2];
        sk.ring(VP[0], VP[1], r, r, 0.6 * k);
      }
    }
  }
  // the strip: a thin band, end to end, its far end narrowing
  sk.group(g + 2);
  sk.amp = 0.75;
  const n = 12;
  if (leverBand(sk, -LEV.Lw - 0.002, LEV.Le, 0.0017, 0.0012, la, n)) {
    pm(BAND[0], BAND[1], 0);
    for (let i = 1; i < 2 * n + 2; i++) pl(BAND[i * 2], BAND[i * 2 + 1], 0);
    pband(sk);
    if (lt > 0.03) {
      // its top edge thin and lit, its underside heavy
      for (let i = 0; i <= n; i++) {
        const w = (0.55 + 0.4 * lt) * k;
        if (i === 0) pm(BAND[0], BAND[1], w);
        else pl(BAND[i * 2], BAND[i * 2 + 1], w);
      }
      ink(sk, 0.05, 0.4, 0.3);
      for (let i = 0; i <= n; i++) {
        const j = 2 * n + 1 - i;
        const w = (1.1 + 0.6 * (1 - lt)) * k;
        if (i === 0) pm(BAND[j * 2], BAND[j * 2 + 1], w);
        else pl(BAND[j * 2], BAND[j * 2 + 1], w);
      }
      ink(sk, 0.05, 0.4, 0.3);
      // a struck line along its lit face
      if (lt > 0.2) {
        for (let i = 2; i <= n - 2; i++) {
          const j = 2 * n + 1 - i;
          const x = mix(BAND[i * 2], BAND[j * 2], 0.32);
          const y = mix(BAND[i * 2 + 1], BAND[j * 2 + 1], 0.32);
          if (i === 2) pm(x, y, 0.35);
          else pl(x, y, 0.42);
        }
        ink(sk, 0.4, 0.2, 0.3);
      }
    }
  }
  // the pivot screw
  sk.group(g + 3);
  if (sk.p3(LEV.x, LEV.y, LEV.z - 0.0012, VP)) {
    const r = (0.0016 * sk.foc) / VP[2];
    sk.blot(VP[0], VP[1], r * 1.15);
    sk.amp = 0.5;
    sk.ring(VP[0], VP[1], r, r, 0.75 * k);
    sk.line(VP[0] - r * 0.6, VP[1] + r * 0.25, VP[0] + r * 0.6, VP[1] - r * 0.25, 0.5, 0.1, 0.1);
  }
  // the cup: a small dish
  sk.group(g + 4);
  sk.amp = 0.7;
  cupAt(la, V0);
  if (sk.p3(V0[0], V0[1] - 0.0012, V0[2], VP)) {
    const r = (0.0068 * sk.foc) / VP[2];
    // a shallow bowl seen from above: its rim an ellipse, its belly a half-ellipse below
    sk.m(VP[0] - r, VP[1]);
    sk.arc(VP[0], VP[1], r, r * 0.45, Math.PI, TAU, false);
    sk.arc(VP[0], VP[1] + r * 0.05, r, r * 0.75, 0, Math.PI, false);
    sk.fill();
    sk.arc(VP[0], VP[1] + r * 0.05, r, r * 0.75, 0.05, Math.PI - 0.05).s(
      (1.1 + 0.7 * (1 - lt)) * k,
      0.1,
      0.4,
    );
    sk.ring(VP[0], VP[1], r, r * 0.42, 0.8 * k);
    if (lt > 0.2) sk.arc(VP[0], VP[1] + r * 0.05, r * 0.75, r * 0.5, 0.5, 1.6).s(0.45, 0.3, 0.2);
    else sk.id++;
  }
  // the finger: a short brass pin standing up from the far end, its tip rounded
  sk.group(g + 5);
  {
    levAt(LEV.Le, la, V0);
    fingerTip(la, V1);
    const lf = lamp(V1[0], V1[1], V1[2], LAMP.x - V1[0], 0, LAMP.z - V1[2], 0.5);
    if (sk.p3(V0[0], V0[1], V0[2], VP) && sk.p3(V1[0], V1[1], V1[2], VQ)) {
      const kf = wd(sk, VQ[2]);
      const r = (0.0007 * sk.foc) / VQ[2];
      const dx = VQ[0] - VP[0];
      const dy = VQ[1] - VP[1];
      const dl = Math.hypot(dx, dy) || 1;
      const nx = -dy / dl;
      const ny = dx / dl;
      pm(VP[0] + nx * r, VP[1] + ny * r, 0);
      for (let i = 1; i <= 6; i++) {
        const u = i / 6;
        pl(mix(VP[0], VQ[0], u) + nx * r, mix(VP[1], VQ[1], u) + ny * r, 0);
      }
      for (let i = 0; i <= 6; i++) {
        const t = (i / 6) * Math.PI;
        pl(
          VQ[0] + nx * r * Math.cos(t) + (dx / dl) * r * Math.sin(t),
          VQ[1] + ny * r * Math.cos(t) + (dy / dl) * r * Math.sin(t),
          0,
        );
      }
      for (let i = 6; i >= 1; i--) {
        const u = i / 6;
        pl(mix(VP[0], VQ[0], u) - nx * r, mix(VP[1], VQ[1], u) - ny * r, 0);
      }
      pl(VP[0] - nx * r, VP[1] - ny * r, 0);
      pfill(sk);
      // its outline round the tip, and a glint up its lit side
      const on = clamp(lf * 2.5, 0.35, 1);
      for (let i = 0; i <= 6; i++) {
        const u = i / 6;
        if (i === 0) pm(VP[0] - nx * r, VP[1] - ny * r, 0.9 * kf * on);
        else pl(mix(VP[0], VQ[0], u) - nx * r, mix(VP[1], VQ[1], u) - ny * r, 0.9 * kf * on);
      }
      for (let i = 0; i <= 6; i++) {
        const t = Math.PI - (i / 6) * Math.PI;
        pl(
          VQ[0] + nx * r * Math.cos(t) + (dx / dl) * r * Math.sin(t),
          VQ[1] + ny * r * Math.cos(t) + (dy / dl) * r * Math.sin(t),
          0.8 * kf * on,
        );
      }
      for (let i = 6; i >= 0; i--) {
        const u = i / 6;
        pl(mix(VP[0], VQ[0], u) + nx * r, mix(VP[1], VQ[1], u) + ny * r, 0.55 * kf * on);
      }
      ink(sk, 0.1, 0.2, 0.3);
    }
  }
  sk.amp = 1;
}

// ---------------------------------------------------------------- what lies about

/**
 * A rod between two points (radius r0 at A, r1 at B): cleared, its edges, a lit stripe along
 * it. For tool handles and blades lying on the bench.
 */
function rod(
  sk: Sketch,
  A: number[],
  B: number[],
  r0: number,
  r1: number,
  w: number,
  stripe = true,
  caps = 1,
): void {
  if (!sk.p3(A[0], A[1], A[2], VP) || !sk.p3(B[0], B[1], B[2], VQ)) return;
  const ax = VP[0];
  const ay = VP[1];
  const bx = VQ[0];
  const by = VQ[1];
  const ra = (r0 * sk.foc) / VP[2];
  const rb = (r1 * sk.foc) / VQ[2];
  let nx = -(by - ay);
  let ny = bx - ax;
  const nl = Math.hypot(nx, ny) || 1;
  nx /= nl;
  ny /= nl;
  const ta = Math.atan2(ny, nx);
  pm(ax + nx * ra, ay + ny * ra, 0);
  for (let i = 1; i <= 6; i++)
    pl(mix(ax + nx * ra, bx + nx * rb, i / 6), mix(ay + ny * ra, by + ny * rb, i / 6), 0);
  for (let i = 1; i < 8; i++) {
    const t = ta - (i / 8) * Math.PI;
    pl(bx + Math.cos(t) * rb, by + Math.sin(t) * rb, 0);
  }
  for (let i = 0; i <= 6; i++)
    pl(mix(bx - nx * rb, ax - nx * ra, i / 6), mix(by - ny * rb, ay - ny * ra, i / 6), 0);
  for (let i = 1; i < 8; i++) {
    const t = ta + Math.PI - (i / 8) * Math.PI;
    pl(ax + Math.cos(t) * ra, ay + Math.sin(t) * ra, 0);
  }
  pfill(sk);
  const mx = (A[0] + B[0]) / 2;
  const my = (A[1] + B[1]) / 2;
  const mz = (A[2] + B[2]) / 2;
  const lt = lamp(mx, my, mz, 0, -1, 0, 0.6);
  if (lt < 0.04) {
    sk.id += 5;
    return;
  }
  const k = wd(sk, (VP[2] + VQ[2]) / 2) * Math.min(1, lt * 2.2);
  // which side faces the lamp, on the view (up the screen, mostly)
  const up = ny < 0 ? 1 : -1;
  const side = (s: number, wt: number) => {
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      const x = mix(ax + nx * ra * s, bx + nx * rb * s, u);
      const y = mix(ay + ny * ra * s, by + ny * rb * s, u);
      if (i === 0) pm(x, y, wt);
      else pl(x, y, wt);
    }
    ink(sk, 0.1, 0.4, 0.3);
  };
  side(up, w * 0.6 * k);
  side(-up, w * 1.3 * k);
  if (stripe && lt > 0.2) {
    for (let i = 0; i <= 8; i++) {
      const u = (i / 8) * 0.85;
      const x = mix(ax, bx, u) + nx * mix(ra, rb, u) * up * 0.45;
      const y = mix(ay, by, u) + ny * mix(ra, rb, u) * up * 0.45;
      if (i === 0) pm(x, y, 0.4 * k);
      else pl(x, y, 0.45 * k);
    }
    ink(sk, 0.4, 0.2, 0.3);
  } else sk.id++;
  if (caps & 1)
    sk.arc(ax, ay, ra, ra, ta + Math.PI * 0.5, ta + Math.PI * 1.5).s(w * 0.8 * k, 0.2, 0.3);
  else sk.id++;
  if (caps & 2)
    sk.arc(bx, by, rb, rb, ta - Math.PI * 0.5, ta + Math.PI * 0.5).s(w * 0.8 * k, 0.2, 0.3);
  else sk.id++;
}

/** The drawing: where it lies, and a point on it (u across, v away from us). */
const SHEET = { x: 0.086, z: 0.072, rot: -0.3, W: 0.078, H: 0.058 };
function sheetAt(u: number, v: number, out: number[]): number[] {
  const a = (u - 0.5) * SHEET.W;
  const b = (v - 0.5) * SHEET.H;
  const cr = Math.cos(SHEET.rot);
  const sr = Math.sin(SHEET.rot);
  // the near-left corner lifts a little off the bench
  const lift = 0.0045 * Math.max(0, 1 - u * 2.6) ** 2 * Math.max(0, 1 - v * 2.2) ** 2;
  out[0] = SHEET.x + a * cr - b * sr;
  out[1] = -0.0004 - lift;
  out[2] = SHEET.z + a * sr + b * cr;
  return out;
}

/** A fine screwdriver lying across the drawing's right margin: knurled handle, a swivel cap,
 *  a long thin blade whose tip rests on the paper. */
function screwdriver(sk: Sketch, g: number): void {
  sk.group(g);
  const C = sheetAt(0.9, 0.36, [0, 0, 0]);
  C[1] = -0.0009;
  const dir = [-0.86, 0, -0.51];
  const B = [C[0] - dir[0] * 0.034, -0.0016, C[2] - dir[2] * 0.034];
  const H = 0.052;
  const A = [B[0] - dir[0] * H, -0.0058, B[2] - dir[2] * H];
  // the blade first (it lies under the handle's end)
  rod(sk, B, C, 0.0011, 0.0007, 0.8, false, 2);
  sk.group(g + 1);
  // the cap
  const A0 = [A[0] + dir[0] * -0.007, A[1], A[2] + dir[2] * -0.007];
  rod(sk, A0, A, 0.0042, 0.0042, 0.9, true, 1);
  sk.group(g + 2);
  rod(sk, A, B, 0.0058, 0.005, 1.1, true, 3);
  // knurling: short ticks across the lit top of the handle
  sk.group(g + 3);
  const lt = lamp(mix(A[0], B[0], 0.5), -0.006, mix(A[2], B[2], 0.5), 0, -1, 0, 0.5);
  if (lt > 0.15) {
    sk.amp = 0.4;
    const side = [dir[2], 0, -dir[0]];
    for (let i = 0; i < 16; i++) {
      sk.id = (g + 3) * 10007 + i * 2;
      const u = 0.08 + (i / 16) * 0.84;
      const x = mix(A[0], B[0], u);
      const z = mix(A[2], B[2], u);
      const r = mix(0.0058, 0.005, u);
      if (hash(i, 41) > lt * 1.4) continue;
      sk.m3(x + side[0] * r * 0.6, -0.0058 - r * 0.75, z + side[2] * r * 0.6)
        .l3(x - side[0] * r * 0.1, -0.0058 - r * 0.98, z - side[2] * r * 0.1)
        .s3(0.45, 0.3, 0.1);
    }
    sk.amp = 1;
  }
}

/** A watchmaker's loupe standing on its wide rim: a short black cone, its lens at the top
 *  catching the lamp. */
function loupe(sk: Sketch, g: number): void {
  sk.group(g);
  const { x: cx, z: cz, r0, r1, h } = LOUPE;
  const N = 36;
  const pts: number[] = [];
  // the eyepiece's far half, then the foot's near half (z runs away from us)
  for (let i = 0; i <= N / 2; i++) {
    const t = (i / (N / 2)) * Math.PI;
    sk.p3(cx + Math.cos(t) * r1, -h, cz + Math.sin(t) * r1, VP);
    pts.push(VP[0], VP[1]);
  }
  for (let i = 0; i <= N / 2; i++) {
    const t = Math.PI + (i / (N / 2)) * Math.PI;
    sk.p3(cx + Math.cos(t) * r0, 0, cz + Math.sin(t) * r0, VP);
    pts.push(VP[0], VP[1]);
  }
  pm(pts[0], pts[1], 0);
  for (let i = 1; i < pts.length / 2; i++) pl(pts[i * 2], pts[i * 2 + 1], 0);
  pfill(sk);
  const k = wd(sk, sk.depth(cx, -h, cz));
  const lt = lamp(cx, -h * 0.5, cz, 0.3, -0.3, -0.9, 0.5);
  if (lt < 0.03) return;
  const on = Math.min(1, lt * 2);
  // the eyepiece's rim, all round
  sk.group(g + 1);
  sk.amp = 0.7;
  {
    const s0 = hash(g + 1, sk.boil) * TAU;
    for (let i = 0; i <= N + 3; i++) {
      const t = (i / N) * TAU + s0;
      sk.p3(cx + Math.cos(t) * r1, -h, cz + Math.sin(t) * r1, VP);
      const w = k * on * (0.6 + 0.7 * Math.max(0, -Math.sin(t)));
      if (i === 0) pm(VP[0], VP[1], w);
      else pl(VP[0], VP[1], w);
    }
    ink(sk, 0.05, 0.3, 0.3);
  }
  // the lens: its own edge inside the rim, and the lamp in it: a bright crescent on the side
  // toward the lamp, a faint one opposite
  sk.group(g + 2);
  {
    const rl = r1 * 0.74;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * TAU;
      sk.p3(cx + Math.cos(t) * rl, -h - 0.0006, cz + Math.sin(t) * rl, VP);
      if (i === 0) pm(VP[0], VP[1], 0.5 * k * on);
      else pl(VP[0], VP[1], (0.4 + 0.3 * Math.max(0, Math.sin(t))) * k * on);
    }
    ink(sk, 0.1, 0.3, 0.3);
    const la = Math.atan2(LAMP.z - cz, LAMP.x - cx);
    sk.amp = 0.3;
    for (const [rr, a0, a1, w] of [
      [0.56, -0.75, 0.55, 2.1],
      [0.46, 2.6, 3.4, 0.7],
    ] as const) {
      for (let i = 0; i <= 10; i++) {
        const t = la + mix(a0, a1, i / 10);
        sk.p3(cx + Math.cos(t) * rl * rr, -h - 0.0008, cz + Math.sin(t) * rl * rr, VP);
        const ww = w * k * on * Math.sin((i / 10) * Math.PI) ** 0.6;
        if (i === 0) pm(VP[0], VP[1], ww * 0.4);
        else pl(VP[0], VP[1], ww);
      }
      ink(sk, 0.3, 0.1, 0.3);
    }
  }
  // the cone's flanks: the outline either side (heavy on the side away from the lamp), struck
  // down its lit side
  sk.group(g + 3);
  sk.amp = 0.6;
  const lampLeft = LAMP.x < cx;
  for (const t of [0, Math.PI]) {
    const away = Math.cos(t) > 0 === lampLeft;
    sk.m3(cx + Math.cos(t) * r1, -h, cz)
      .l3(cx + Math.cos(t) * mix(r1, r0, 0.5), -h * 0.5, cz)
      .l3(cx + Math.cos(t) * r0, 0, cz)
      .s3((away ? 1.6 : 0.7) * on, 0.15, 0.6);
  }
  sk.group(g + 4);
  for (let i = 0; i < 16; i++) {
    sk.id = (g + 4) * 10007 + i * 2;
    const t = (i / 16) * Math.PI;
    const nx = Math.cos(t);
    const nz = -Math.sin(t);
    const l2 = lamp(cx + nx * r0, -h * 0.5, cz + nz * r0, nx, -0.3, nz, 0.3);
    if (l2 < 0.25 + 0.4 * hash(i, 51)) continue;
    sk.m3(cx + nx * r1 * 1.05, -h * 0.85, cz + nz * r1 * 1.05)
      .l3(cx + nx * r0 * 0.98, -h * 0.12, cz + nz * r0 * 0.98)
      .s3(0.45 + 0.35 * l2, 0.3, 0.2);
  }
  sk.group(g + 5);
  for (let i = 0; i <= N / 2; i++) {
    const t = (i / (N / 2)) * Math.PI;
    sk.p3(cx + Math.cos(t) * r0, 0, cz - Math.sin(t) * r0, VP);
    if (i === 0) pm(VP[0], VP[1], 1.2 * k * on);
    else pl(VP[0], VP[1], 1.3 * k * on);
  }
  ink(sk, 0.1, 0.3, 0.3);
  sk.amp = 1;
}

const GO = new Float32Array(2 * 8 * 64);

/** A loose wheel lying flat on the bench: its toothed edge, curved crossings, and its face
 *  struck with turning rings where the lamp is on it. */
function looseWheel(sk: Sketch, g: number): void {
  sk.group(g);
  const { x, z, N, r, ang } = WHEEL;
  const m = (2 * r) / N;
  const n = teeth(0, N, r, m, ang, 4, GO);
  const y = -0.0006;
  const lt = lamp(x, y, z, 0, -1, 0, 0.3);
  for (let i = 0; i < n; i++) {
    sk.p3(x + GO[i * 2], y, z + GO[i * 2 + 1], VP);
    if (i === 0) pm(VP[0], VP[1], 0);
    else pl(VP[0], VP[1], 0);
  }
  pfill(sk);
  if (lt < 0.04) return;
  const k = wd(sk, sk.depth(x, y, z)) * Math.min(1, lt * 2.2);
  sk.group(g + 1);
  sk.amp = 0.45;
  const s0 = Math.floor(hash(g + 1, sk.boil) * n);
  for (let i = 0; i <= n + 3; i++) {
    const j = (s0 + i) % n;
    sk.p3(x + GO[j * 2], y, z + GO[j * 2 + 1], VP);
    // the near side of the wheel's edge is its shadow side (the lamp is above and beyond)
    const sh = 0.5 + 0.5 * (GO[j * 2 + 1] < 0 ? 1 : -1) * Math.min(1, Math.abs(GO[j * 2 + 1]) / r);
    if (i === 0) pm(VP[0], VP[1], (0.45 + 0.7 * sh) * k);
    else pl(VP[0], VP[1], (0.45 + 0.7 * sh) * k);
  }
  ink(sk, 0.04, 0.15, 0.2);
  // the rim's inner edge, the crossings (curved, swelling at the hub), the hub
  sk.group(g + 2);
  const ri = r * 0.7;
  const arcAt = (rr: number, w: number, a0: number, a1: number, n2 = 20) => {
    for (let i = 0; i <= n2; i++) {
      const t = mix(a0, a1, i / n2);
      sk.p3(x + Math.cos(t) * rr, y - 0.0001, z + Math.sin(t) * rr, VP);
      const ww = w * k * Math.sin((i / n2) * Math.PI) ** 0.4;
      if (i === 0) pm(VP[0], VP[1], ww);
      else pl(VP[0], VP[1], ww);
    }
    ink(sk, 0.15, 0.2, 0.2);
  };
  arcAt(ri, 0.5, ang, ang + TAU + 0.3, 30);
  for (let s = 0; s < 5; s++) {
    const t = ang + (s / 5) * TAU + 0.2;
    for (const e of [-1, 1]) {
      for (let i = 0; i <= 5; i++) {
        const u = mix(r * 0.18, ri, i / 5);
        const tt = t + e * mix(0.2, 0.06, i / 5) + 0.18 * (i / 5) ** 2;
        sk.p3(x + Math.cos(tt) * u, y - 0.0001, z + Math.sin(tt) * u, VP);
        if (i === 0) pm(VP[0], VP[1], 0.45 * k);
        else pl(VP[0], VP[1], 0.45 * k);
      }
      ink(sk, 0.2, 0.15, 0.2);
    }
  }
  arcAt(r * 0.17, 0.6, 0, TAU + 0.3, 14);
  // turning rings on the rim's lit face
  sk.group(g + 3);
  const la = Math.atan2(LAMP.z - z, LAMP.x - x);
  for (let j = 0; j < 3; j++) {
    const rr = mix(ri, r - m * 1.3, 0.25 + j * 0.25);
    const span = 1.4 + 0.5 * hash(j, 81);
    const c = la + Math.PI * 0.15 + (hash(j, 82) - 0.5) * 0.6;
    arcAt(rr, 0.32 + 0.15 * lt, c - span / 2, c + span / 2, 14);
  }
  sk.amp = 1;
}

/** A loose mainspring lying flat: a ribbon of steel on its edge in a few open, sprung turns,
 *  its top edge and its foot, a lit stripe along it where it faces the lamp. */
function spring(sk: Sketch, g: number): void {
  sk.group(g);
  const { x, z } = SPRING;
  const lt0 = lamp(x, -0.001, z, 0, -1, 0, 0.3);
  if (lt0 < 0.05) return;
  const on = Math.min(1, lt0 * 2);
  const turns = 2.3;
  const n = Math.round(turns * 28);
  const hgt = 0.0017;
  const at = (u: number, y: number, o: number[]) => {
    const t = 0.7 + u * turns * TAU;
    // sprung: the coils open unevenly, the outer ones furthest; a little squashed
    const r = 0.0034 + 0.0098 * u ** 0.8 + 0.0009 * Math.sin(u * 11 + 1);
    o[0] = x + Math.cos(t) * r;
    o[1] = y;
    o[2] = z + Math.sin(t) * r * 0.82;
    return o;
  };
  // clear the ribbon (its face between the top edge and the foot)
  for (let i = 0; i <= n; i++) {
    at(i / n, -hgt, V0);
    sk.p3(V0[0], V0[1], V0[2], VP);
    if (i === 0) pm(VP[0], VP[1], 0);
    else pl(VP[0], VP[1], 0);
  }
  for (let i = n; i >= 0; i--) {
    at(i / n, 0, V0);
    sk.p3(V0[0], V0[1], V0[2], VP);
    pl(VP[0], VP[1], 0);
  }
  pband(sk);
  const k = wd(sk, sk.depth(x, 0, z)) * on;
  sk.amp = 0.5;
  // the top edge: one long stroke, heavier where it turns from the lamp
  const la = Math.atan2(LAMP.z - z, LAMP.x - x);
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    at(u, -hgt, V0);
    sk.p3(V0[0], V0[1], V0[2], VP);
    const t = 0.7 + u * turns * TAU;
    const sh = 0.5 - 0.5 * Math.cos(t - la);
    if (i === 0) pm(VP[0], VP[1], 0.5 * k);
    else pl(VP[0], VP[1], (0.45 + 0.6 * sh) * k);
  }
  ink(sk, 0.05, 0.3, 0.3);
  // the foot, where the near face of a coil shows; the lit stripe where the face meets the lamp
  sk.group(g + 1);
  let open = false;
  let open2 = false;
  const S2: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const t = 0.7 + u * turns * TAU;
    const near = Math.sin(t) < -0.15;
    if (near) {
      at(u, 0, V0);
      sk.p3(V0[0], V0[1], V0[2], VP);
      if (!open) {
        pm(VP[0], VP[1], 0.5 * k);
        open = true;
      } else pl(VP[0], VP[1], 0.6 * k);
    } else if (open) {
      ink(sk, 0.3, 0.3, 0.3);
      open = false;
    }
    const lit = Math.cos(t - la) > 0.3;
    S2.push(lit ? 1 : 0);
  }
  if (open) ink(sk, 0.3, 0.3, 0.3);
  sk.group(g + 2);
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    if (S2[i]) {
      at(u, -hgt * 0.5, V0);
      sk.p3(V0[0], V0[1], V0[2], VP);
      if (!open2) {
        pm(VP[0], VP[1], 0.35 * k);
        open2 = true;
      } else pl(VP[0], VP[1], 0.45 * k);
    } else if (open2) {
      ink(sk, 0.4, 0.2, 0.3);
      open2 = false;
    }
  }
  if (open2) ink(sk, 0.4, 0.2, 0.3);
  // its hooked outer end
  sk.group(g + 3);
  {
    at(1, -hgt, V0);
    const t1 = 0.7 + turns * TAU;
    sk.m3(V0[0], V0[1], V0[2])
      .l3(V0[0] + Math.cos(t1 + 1.7) * 0.003, V0[1], V0[2] + Math.sin(t1 + 1.7) * 0.003 * 0.82)
      .l3(V0[0] + Math.cos(t1 + 2.5) * 0.0045, V0[1], V0[2] + Math.sin(t1 + 2.5) * 0.0045 * 0.82)
      .s3(0.7 * on, 0.1, 0.3);
  }
  sk.amp = 1;
}

/** The drawing pinned flat: lit paper (finely hatched on its own slant, thin), the drawing on
 *  it cut through as fine black lines: the bird in profile, its window and two wheels in it, a
 *  centre line, a dimension; a pin at one corner, a strip of tape at the other. */
function drawing(sk: Sketch, g: number): void {
  sk.group(g);
  const { W, H } = SHEET;
  // clear the sheet
  const N = 10;
  for (let i = 0; i < N * 4; i++) {
    const kk = Math.floor(i / N);
    const f = (i % N) / N;
    const [u, v] = kk === 0 ? [f, 0] : kk === 1 ? [1, f] : kk === 2 ? [1 - f, 1] : [0, 1 - f];
    sheetAt(u, v, V0);
    sk.p3(V0[0], V0[1], V0[2], VP);
    if (i === 0) pm(VP[0], VP[1], 0);
    else pl(VP[0], VP[1], 0);
  }
  pfill(sk);
  const lt = lamp(SHEET.x, 0, SHEET.z, 0, -1, 0, 0.15);
  if (lt < 0.04) return;
  const k = wd(sk, sk.depth(SHEET.x, 0, SHEET.z));
  // the paper's tone: fine strokes on one slant, sparse; where the light is full they run
  sk.group(g + 1);
  sk.amp = 0.45;
  const gap = 0.003;
  const diag = (W + H) / gap;
  const P0 = [0, 0, 0];
  for (let i = 1; i < diag; i++) {
    sk.id = (g + 1) * 10007 + i * 2;
    // the line u*W + v*H = c (a slant in the sheet), clipped to the sheet
    const c = i * gap + (hash(i, 61) - 0.5) * gap * 0.5;
    const u0 = clamp((c - H) / W, 0, 1);
    const u1 = clamp(c / W, 0, 1);
    if (u1 - u0 < 0.02) continue;
    const pv = (u: number) => (c - u * W) / H;
    sheetAt(mix(u0, u1, 0.5), pv(mix(u0, u1, 0.5)), P0);
    const l0 = lamp(P0[0], P0[1], P0[2], 0, -1, 0, 0.15);
    if (l0 < 0.42 + 0.5 * hash(i, 62)) continue;
    const a0 = u0 + (u1 - u0) * 0.04 * hash(i, 63);
    const a1 = u1 - (u1 - u0) * 0.06 * hash(i, 64);
    sheetAt(a0, pv(a0), V0);
    sheetAt(a1, pv(a1), V1);
    sk.m3(V0[0], V0[1], V0[2])
      .l3(mix(V0[0], V1[0], 0.5), mix(V0[1], V1[1], 0.5), mix(V0[2], V1[2], 0.5))
      .l3(V1[0], V1[1], V1[2])
      .s3(0.4 + 0.2 * l0, 0.15, 0.2);
  }
  // its edges, the lit ones thin
  sk.group(g + 2);
  sk.amp = 0.7;
  const edge = (u0: number, v0: number, u1: number, v1: number, w: number) => {
    sheetAt(u0, v0, V0);
    sk.m3(V0[0], V0[1], V0[2]);
    for (let i = 1; i <= 8; i++) {
      sheetAt(mix(u0, u1, i / 8), mix(v0, v1, i / 8), V0);
      sk.l3(V0[0], V0[1], V0[2]);
    }
    sk.s3(w * k, 0.08, 0.4);
  };
  edge(0, 0, 1, 0, 1.1);
  edge(1, 0, 1, 1, 0.6);
  edge(1, 1, 0, 1, 0.5);
  edge(0, 1, 0, 0, 0.85);
  // the drawing, cut fine through the tone (sheet millimetres: x across, y away from us)
  sk.group(g + 3);
  sk.amp = 0.3;
  const P = [0, 0, 0];
  const cut = (pts: number[], w: number) => {
    for (let i = 0; i < pts.length / 2; i++) {
      sheetAt(pts[i * 2] / (W * 1000), pts[i * 2 + 1] / (H * 1000), P);
      sk.p3(P[0], P[1], P[2], VP);
      if (i === 0) sk.m(VP[0], VP[1]);
      else sk.l(VP[0], VP[1]);
    }
    sk.e(w);
  };
  const ell = (
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    a0: number,
    a1: number,
    n: number,
  ) => {
    const out: number[] = [];
    for (let i = 0; i <= n; i++) {
      const t = mix(a0, a1, i / n);
      out.push(cx + Math.cos(t) * rx, cy + Math.sin(t) * ry);
    }
    return out;
  };
  // the bird in profile: an egg, broken in three, fuller toward the breast (+x)
  const ex = 27;
  const ey = 31;
  cut(ell(ex, ey, 15.5, 9.5, 0.25, 1.95, 12), 1.0);
  cut(ell(ex, ey, 15.5, 9.5, 2.15, 3.85, 12), 1.0);
  cut(ell(ex, ey, 15.5, 9.5, 4.1, 6.0, 12), 1.0);
  // its window, and two small wheels meshing in it, each with its centre crossed
  cut(ell(ex + 1, ey - 1.5, 9, 4.8, 0, TAU, 20), 0.85);
  const wheels = [
    [ex - 2.2, ey - 1.6, 2.6],
    [ex + 2.9, ey - 1.2, 2.0],
  ];
  for (const [wx, wy, wr] of wheels) {
    cut(ell(wx, wy, wr, wr, 0.3, TAU + 0.1, 14), 0.75);
    cut([wx - 0.9, wy, wx + 0.9, wy], 0.6);
    cut([wx, wy - 0.9, wx, wy + 0.9], 0.6);
  }
  // a centre line, dashed, run on past the egg
  for (let i = 0; i < 6; i++) {
    const x0 = 8 + i * 7.6;
    cut([x0, ey, x0 + (i % 2 ? 1.2 : 4.6), ey], 0.55);
  }
  // a dimension under it: a line with a tick at each end
  cut([ex - 15.5, ey - 14, ex + 15.5, ey - 14], 0.55);
  cut([ex - 15.5, ey - 15.6, ex - 15.5, ey - 12.4], 0.6);
  cut([ex + 15.5, ey - 15.6, ex + 15.5, ey - 12.4], 0.6);
  // two lines of notes, off to the right
  for (let i = 0; i < 2; i++) {
    const y = 44 - i * 5;
    const pts: number[] = [];
    for (let j = 0; j <= 6; j++) pts.push(50 + j * 3.4, y + 0.6 * Math.sin(j * 2.3 + i * 1.7));
    cut(pts, 0.6);
  }
  // a pin at the far-left corner: a dark head, lit on its lamp side, its shadow on the paper
  sk.group(g + 4);
  sk.amp = 0.5;
  sheetAt(0.07, 0.91, P);
  if (sk.p3(P[0], -0.0028, P[2], VP)) {
    const r = (0.0024 * sk.foc) / VP[2];
    sk.p3(P[0] + (LAMP.x - P[0]) * 0.02, -0.0028, P[2] + (LAMP.z - P[2]) * 0.02, VQ);
    const la = Math.atan2(VQ[1] - VP[1], VQ[0] - VP[0]) - 0.6;
    // its shadow falls away from the lamp
    sk.blot(VP[0] - Math.cos(la) * r * 0.35, VP[1] + r * 0.25, r * 1.25, r * 0.95);
    sk.arc(VP[0], VP[1], r, r * 0.88, la - 0.9, la + 0.9).s(0.85 * k, 0.3, 0.2);
    sk.arc(VP[0], VP[1], r * 0.98, r * 0.86, la + 1.2, la + 2.2).s(0.4 * k, 0.4, 0.2);
  }
  // a strip of tape across the far-right corner: lightly struck, its edges fine
  sk.group(g + 5);
  {
    const c = [0.93, 0.9];
    const d = [0.7, 0.7];
    const q = [-0.7 * (H / W), 0.7 * (W / H)];
    const ql = Math.hypot(q[0] * W, q[1] * H);
    const qn = [q[0] / ql, q[1] / ql];
    const dl = Math.hypot(d[0] * W, d[1] * H);
    const dn = [d[0] / dl, d[1] / dl];
    const L = 0.007;
    const Wt = 0.0026;
    const corner = (s: number, t: number, o: number[]) => {
      sheetAt(c[0] + dn[0] * s + qn[0] * t, c[1] + dn[1] * s + qn[1] * t, o);
      o[1] -= 0.0002;
      return o;
    };
    const quad = [
      [-L, -Wt],
      [L, -Wt],
      [L, Wt],
      [-L, Wt],
    ];
    for (let i = 0; i < 4; i++) {
      corner(quad[i][0], quad[i][1], V0);
      sk.p3(V0[0], V0[1], V0[2], VP);
      if (i === 0) pm(VP[0], VP[1], 0);
      else pl(VP[0], VP[1], 0);
    }
    pfill(sk);
    sk.amp = 0.4;
    for (let i = 0; i < 5; i++) {
      const s = mix(-L * 0.85, L * 0.85, (i + 0.5) / 5);
      corner(s - Wt * 0.5, -Wt * 0.8, V0);
      corner(s + Wt * 0.5, Wt * 0.8, V1);
      sk.m3(V0[0], V0[1], V0[2])
        .l3(V1[0], V1[1], V1[2])
        .s3(0.35 * k, 0.3, 0.2);
    }
    for (const t of [-Wt, Wt]) {
      corner(-L, t, V0);
      corner(L, t, V1);
      sk.m3(V0[0], V0[1], V0[2])
        .l3(mix(V0[0], V1[0], 0.5), mix(V0[1], V1[1], 0.5), mix(V0[2], V1[2], 0.5))
        .l3(V1[0], V1[1], V1[2])
        .s3((t > 0 ? 0.45 : 0.7) * k, 0.15, 0.3);
    }
  }
  sk.amp = 1;
}

/** Everything lying about, in an order that suits the view (far first). */
export function clutter(sk: Sketch, g: number, which: "far" | "near"): void {
  if (which === "far") {
    drawing(sk, g);
    screwdriver(sk, g + 10);
    spring(sk, g + 16);
  } else {
    looseWheel(sk, g + 20);
    loupe(sk, g + 26);
  }
}

export { clamp, smooth };
