// Clockwork for the machine scene, drawn in the plane of a frame: wheels with crossings
// (spokes), pinions, the escape wheel and its pallet fork, the balance with its hairspring,
// a snail cam and its follower. Everything is laid out in the plane (a forward, b up) of a
// Basis at a depth c along its side axis, projected, and inked with a width per point:
// heavier where the edge turns away from the light, the seam of every loop wherever the hand
// put it this time.

import { clamp, hash, mix, type Sketch, TAU } from "../sketch";
import { type Basis, ink, pband, pfill, pl, pm, type ToothKind, teeth, wd } from "./machine-kit";

const P3 = [0, 0, 0];
const PV = [0, 0, 0];

/** A pen in the plane of a frame: plane coordinates in, view out, widths by depth. */
export class PlanePen {
  b!: Basis;
  c = 0;
  k = 1;
  /** The light's direction within the plane (unit), and how much reaches it (0..1). */
  la = 0.7;
  lb = 0.7;
  lit = 1;
  /** Line presence (0..1): everything thins as the light leaves. */
  pres = 1;
  ok = true;

  set(sk: Sketch, b: Basis, c: number, la: number, lb: number, lit: number, pres: number): this {
    this.b = b;
    this.c = c;
    b.at(0, 0, c, P3);
    this.ok = sk.p3(P3[0], P3[1], P3[2], PV);
    this.k = this.ok ? wd(sk, PV[2]) : 1;
    const l = Math.hypot(la, lb) || 1;
    this.la = la / l;
    this.lb = lb / l;
    this.lit = lit;
    this.pres = pres;
    return this;
  }

  /** Project plane point (a, b) at this pen's depth (plus dc) into out (view x, y). */
  p(sk: Sketch, a: number, bb: number, out: number[], dc = 0): boolean {
    this.b.at(a, bb, this.c + dc, P3);
    return sk.p3(P3[0], P3[1], P3[2], out);
  }

  m(sk: Sketch, a: number, bb: number, w: number, dc = 0): void {
    this.p(sk, a, bb, PV, dc);
    pm(PV[0], PV[1], w * this.k * this.pres);
  }

  l(sk: Sketch, a: number, bb: number, w: number, dc = 0): void {
    this.p(sk, a, bb, PV, dc);
    pl(PV[0], PV[1], w * this.k * this.pres);
  }

  /** How much an edge facing (na, nb) in the plane is in shadow, 0..1. */
  shade(na: number, nb: number): number {
    return 0.5 - 0.5 * (na * this.la + nb * this.lb);
  }

  /** Clear a disc. */
  disc(sk: Sketch, a0: number, b0: number, r: number, n = 20): void {
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU;
      this.p(sk, a0 + Math.cos(t) * r, b0 + Math.sin(t) * r, PV);
      if (i === 0) pm(PV[0], PV[1], 0);
      else pl(PV[0], PV[1], 0);
    }
    pfill(sk);
  }

  /** A hand-closed circle, heavier on the shadow side; sweep past a full turn. */
  circle(
    sk: Sketch,
    a0: number,
    b0: number,
    r: number,
    w0: number,
    w1: number,
    n = 24,
    sweep = TAU + 0.35,
    taper = 0.12,
  ): void {
    const s0 = hash(sk.id, sk.boil + 7) * TAU;
    for (let i = 0; i <= n; i++) {
      const t = s0 + (i / n) * sweep;
      const ca = Math.cos(t);
      const sa = Math.sin(t);
      const sh = this.shade(ca, sa);
      const w = mix(w0, w1, sh * sh);
      if (i === 0) this.m(sk, a0 + ca * r, b0 + sa * r, w);
      else this.l(sk, a0 + ca * r, b0 + sa * r, w);
    }
    ink(sk, taper, 0.25, 0.25);
  }

  /** An arc from t0 to t1, weight w. */
  arc(
    sk: Sketch,
    a0: number,
    b0: number,
    r: number,
    t0: number,
    t1: number,
    w: number,
    n = 10,
    taper = 0.3,
  ): void {
    for (let i = 0; i <= n; i++) {
      const t = mix(t0, t1, i / n);
      if (i === 0) this.m(sk, a0 + Math.cos(t) * r, b0 + Math.sin(t) * r, w);
      else this.l(sk, a0 + Math.cos(t) * r, b0 + Math.sin(t) * r, w);
    }
    ink(sk, taper, 0.2, 0.25);
  }
}

const OL = new Float32Array(2 * 8 * 80);
const OA = new Float32Array(8 * 80);

export interface WheelSpec {
  kind: ToothKind;
  N: number;
  /** Pitch radius and module (m). */
  r: number;
  m: number;
  /** Crossings (spokes): 0 for a solid wheel. */
  spokes: number;
  /** Rim width and hub radius (m). */
  rim: number;
  hub: number;
  seed: number;
}

/**
 * A toothed wheel in the pen's plane, centre (a0, b0), turned by ang: its solid parts
 * cleared (rim, crossings, hub; the gaps between crossings left open), then inked.
 */
export function wheel(
  sk: Sketch,
  pen: PlanePen,
  a0: number,
  b0: number,
  ang: number,
  w: WheelSpec,
  weight = 1,
): void {
  const n = teeth(w.kind, w.N, w.r, w.m, ang, w.seed, OL);
  for (let i = 0; i < n; i++) OA[i] = Math.atan2(OL[i * 2 + 1], OL[i * 2]);
  const ri = w.r - w.m * 1.3 - w.rim;
  // clear the solid parts
  if (w.spokes <= 0) {
    for (let i = 0; i < n; i++) {
      pen.p(sk, a0 + OL[i * 2], b0 + OL[i * 2 + 1], PV);
      if (i === 0) pm(PV[0], PV[1], 0);
      else pl(PV[0], PV[1], 0);
    }
    pfill(sk);
  } else {
    // the rim: a band between the toothed edge and the inner circle
    for (let i = 0; i <= n; i++) {
      const j = i % n;
      pen.p(sk, a0 + OL[j * 2], b0 + OL[j * 2 + 1], PV);
      if (i === 0) pm(PV[0], PV[1], 0);
      else pl(PV[0], PV[1], 0);
    }
    for (let i = n; i >= 0; i--) {
      const j = i % n;
      pen.p(sk, a0 + Math.cos(OA[j]) * ri, b0 + Math.sin(OA[j]) * ri, PV);
      pl(PV[0], PV[1], 0);
    }
    pband(sk);
    // crossings: slightly curved, swelling toward the hub
    for (let s = 0; s < w.spokes; s++) {
      const t = ang + (s / w.spokes) * TAU + 0.3;
      const ca = Math.cos(t);
      const sa = Math.sin(t);
      const hw0 = w.r * 0.075;
      const hw1 = w.r * 0.05;
      const L0 = w.hub * 0.8;
      const L1 = ri + w.m * 0.3;
      for (let i = 0; i <= 4; i++) {
        const u = mix(L0, L1, i / 4);
        const hw = mix(hw0, hw1, i / 4);
        pen.p(sk, a0 + ca * u - sa * hw, b0 + sa * u + ca * hw, PV);
        if (i === 0) pm(PV[0], PV[1], 0);
        else pl(PV[0], PV[1], 0);
      }
      for (let i = 4; i >= 0; i--) {
        const u = mix(L0, L1, i / 4);
        const hw = mix(hw0, hw1, i / 4);
        pen.p(sk, a0 + ca * u + sa * hw, b0 + sa * u - ca * hw, PV);
        pl(PV[0], PV[1], 0);
      }
      pband(sk);
    }
    pen.disc(sk, a0, b0, w.hub);
  }
  // the toothed edge: one stroke round, heavier where it turns from the light
  const W = weight;
  const s0 = Math.floor(hash(sk.id, sk.boil + 3) * n);
  const over = Math.max(2, Math.round(n * 0.03));
  for (let i = 0; i <= n + over; i++) {
    const j = (s0 + i) % n;
    const ca = Math.cos(OA[j]);
    const sa = Math.sin(OA[j]);
    const sh = pen.shade(ca, sa);
    const wv = (0.42 + 0.95 * sh * sh) * W;
    if (i === 0) pen.m(sk, a0 + OL[j * 2], b0 + OL[j * 2 + 1], wv);
    else pen.l(sk, a0 + OL[j * 2], b0 + OL[j * 2 + 1], wv);
  }
  ink(sk, 0.04, 0.15, 0.2);
  if (w.spokes > 0) {
    // the rim's inner edge and the crossings' edges, thinner
    pen.circle(sk, a0, b0, ri, 0.35 * W, 0.8 * W, 28);
    for (let s = 0; s < w.spokes; s++) {
      const t = ang + (s / w.spokes) * TAU + 0.3;
      const ca = Math.cos(t);
      const sa = Math.sin(t);
      for (const side of [-1, 1]) {
        const sh = pen.shade(-sa * side, ca * side);
        const wv = (0.3 + 0.55 * sh) * W;
        for (let i = 0; i <= 3; i++) {
          const u = mix(w.hub * 1.05, ri, i / 3);
          const hw = mix(w.r * 0.075, w.r * 0.05, i / 3) * side;
          if (i === 0) pen.m(sk, a0 + ca * u - sa * hw, b0 + sa * u + ca * hw, wv);
          else pen.l(sk, a0 + ca * u - sa * hw, b0 + sa * u + ca * hw, wv);
        }
        ink(sk, 0.2, 0.15, 0.2);
      }
    }
    // turned brass: a few rings on the rim where the light falls
    {
      const la = Math.atan2(pen.lb, pen.la);
      const on = Math.min(1, Math.max(0, (pen.lit - 0.2) / 0.15));
      for (let k = 0; k < 2; k++) {
        const rr = mix(ri, w.r - w.m * 1.3, 0.35 + 0.35 * k);
        const span = 0.9 + 0.8 * pen.lit;
        const c0 = la + (hash(k, w.seed + 17) - 0.5) * 0.6;
        pen.arc(sk, a0, b0, rr, c0 - span * 0.5, c0 + span * 0.5, 0.32 * W * on, 12, 0.4);
      }
    }
  }
  // hub and pivot
  pen.circle(sk, a0, b0, w.hub, 0.4 * W, 0.9 * W, 14);
  pivot(sk, pen, a0, b0, w.hub * 0.42, W);
}

/** A pivot: a dark hole with a bright jewel ring round it. */
export function pivot(sk: Sketch, pen: PlanePen, a0: number, b0: number, r: number, W = 1): void {
  pen.disc(sk, a0, b0, r * 0.55, 10);
  pen.circle(sk, a0, b0, r, 0.45 * W, 0.7 * W, 12, TAU + 0.4, 0.1);
}

/** A pinion: a few deep leaves, solid, with a shine along the lit flank. */
export function pinion(
  sk: Sketch,
  pen: PlanePen,
  a0: number,
  b0: number,
  ang: number,
  N: number,
  r: number,
  m: number,
  seed: number,
  W = 1,
): void {
  const n = teeth(1, N, r, m, ang, seed, OL);
  for (let i = 0; i < n; i++) {
    pen.p(sk, a0 + OL[i * 2], b0 + OL[i * 2 + 1], PV);
    if (i === 0) pm(PV[0], PV[1], 0);
    else pl(PV[0], PV[1], 0);
  }
  pfill(sk);
  const s0 = Math.floor(hash(sk.id, sk.boil + 5) * n);
  for (let i = 0; i <= n + 2; i++) {
    const j = (s0 + i) % n;
    const t = Math.atan2(OL[j * 2 + 1], OL[j * 2]);
    const sh = pen.shade(Math.cos(t), Math.sin(t));
    const wv = (0.4 + 0.8 * sh * sh) * W;
    if (i === 0) pen.m(sk, a0 + OL[j * 2], b0 + OL[j * 2 + 1], wv);
    else pen.l(sk, a0 + OL[j * 2], b0 + OL[j * 2 + 1], wv);
  }
  ink(sk, 0.05, 0.12, 0.2);
  pivot(sk, pen, a0, b0, r * 0.3, W);
}

/**
 * The pallet fork: pivot (a0, b0), turned by ang; its arms reach to the escape wheel at
 * (ea, eb), its fork toward the balance at (ba, bb).
 */
export function pallet(
  sk: Sketch,
  pen: PlanePen,
  a0: number,
  b0: number,
  ang: number,
  ea: number,
  eb: number,
  ba: number,
  bb: number,
  re: number,
  W = 1,
): void {
  const te = Math.atan2(eb - b0, ea - a0) + ang;
  const de = Math.hypot(ea - a0, eb - b0);
  const tb = Math.atan2(bb - b0, ba - a0) + ang;
  const db = Math.hypot(ba - a0, bb - b0);
  const at = (t: number, r: number, side: number, o: number[]) => {
    o[0] = a0 + Math.cos(t) * r - Math.sin(t) * side;
    o[1] = b0 + Math.sin(t) * r + Math.cos(t) * side;
    return o;
  };
  const A = [0, 0];
  const B = [0, 0];
  // the anchor's two arms: from the pivot out to stones either side of the line to the wheel
  const reach = de - re * 0.92;
  const spread = re * 0.62;
  const arm = (side: number) => {
    const hw = re * 0.11;
    // a band along a bent arm: pivot -> elbow -> stone
    const pts: number[] = [];
    const path = [
      [0, side * hw * 1.2],
      [reach * 0.45, side * spread * 0.85],
      [reach * 0.98, side * spread],
    ];
    for (const [r, s] of path) {
      at(te, r, s - hw, A);
      pts.push(A[0], A[1]);
    }
    for (let i = path.length - 1; i >= 0; i--) {
      at(te, path[i][0], path[i][1] + hw, A);
      pts.push(A[0], A[1]);
    }
    for (let i = 0; i < pts.length / 2; i++) {
      pen.p(sk, pts[i * 2], pts[i * 2 + 1], PV);
      if (i === 0) pm(PV[0], PV[1], 0);
      else pl(PV[0], PV[1], 0);
    }
    pband(sk);
    // its edges
    for (const e of [-1, 1]) {
      for (let i = 0; i < path.length; i++) {
        at(te, path[i][0], path[i][1] + e * hw, A);
        const wv = (0.4 + 0.4 * pen.shade(0, e * side)) * W;
        if (i === 0) pen.m(sk, A[0], A[1], wv);
        else pen.l(sk, A[0], A[1], wv);
      }
      ink(sk, 0.12, 0.15, 0.2);
    }
    // the stone at its end: a small bright slab
    at(te, reach * 0.98 + re * 0.02, side * spread, A);
    at(te, reach * 0.98 + re * 0.2, side * spread * 0.98, B);
    pen.m(sk, A[0], A[1], 1.5 * W);
    pen.l(sk, B[0], B[1], 1.5 * W);
    ink(sk, 0.05, 0.05, 0);
  };
  arm(-1);
  arm(1);
  // the fork: a lever out to the balance, ending in two horns
  const hw = re * 0.09;
  const len = db - re * 0.55;
  for (let i = 0; i <= 3; i++) {
    at(tb, mix(0, len, i / 3), -hw * mix(1.3, 0.8, i / 3), A);
    if (i === 0) pen.m(sk, A[0], A[1], 0);
    else pen.l(sk, A[0], A[1], 0);
  }
  for (let i = 3; i >= 0; i--) {
    at(tb, mix(0, len, i / 3), hw * mix(1.3, 0.8, i / 3), A);
    pen.l(sk, A[0], A[1], 0);
  }
  pfill(sk);
  for (const e of [-1, 1]) {
    for (let i = 0; i <= 3; i++) {
      at(tb, mix(0, len, i / 3), e * hw * mix(1.3, 0.8, i / 3), A);
      const wv = (0.35 + 0.45 * pen.shade(0, e)) * W;
      if (i === 0) pen.m(sk, A[0], A[1], wv);
      else pen.l(sk, A[0], A[1], wv);
    }
    // the horn
    at(tb, len + re * 0.22, e * hw * 2.2, A);
    pen.l(sk, A[0], A[1], 0.45 * W);
    ink(sk, 0.15, 0.12, 0.2);
  }
  pen.disc(sk, a0, b0, re * 0.14, 10);
  pen.circle(sk, a0, b0, re * 0.14, 0.4 * W, 0.8 * W, 10);
}

/**
 * The balance at (a0, b0), radius r, turned by ang: a rim with timing screws, three arms,
 * the roller and its pin. The hairspring and the cock are drawn by their own calls.
 */
export function balance(
  sk: Sketch,
  pen: PlanePen,
  a0: number,
  b0: number,
  r: number,
  ang: number,
  W = 1,
): void {
  const rim = r * 0.13;
  const NN = 36;
  for (let i = 0; i <= NN; i++) {
    const t = (i / NN) * TAU;
    pen.p(sk, a0 + Math.cos(t) * (r + rim * 0.5), b0 + Math.sin(t) * (r + rim * 0.5), PV);
    if (i === 0) pm(PV[0], PV[1], 0);
    else pl(PV[0], PV[1], 0);
  }
  for (let i = NN; i >= 0; i--) {
    const t = (i / NN) * TAU;
    pen.p(sk, a0 + Math.cos(t) * (r - rim * 0.5), b0 + Math.sin(t) * (r - rim * 0.5), PV);
    pl(PV[0], PV[1], 0);
  }
  pband(sk);
  // three arms
  for (let s = 0; s < 3; s++) {
    const t = ang + (s / 3) * TAU;
    const ca = Math.cos(t);
    const sa = Math.sin(t);
    const hw = r * 0.06;
    pen.p(sk, a0 - sa * hw, b0 + ca * hw, PV);
    pm(PV[0], PV[1], 0);
    pen.p(sk, a0 + ca * r - sa * hw, b0 + sa * r + ca * hw, PV);
    pl(PV[0], PV[1], 0);
    pen.p(sk, a0 + ca * r + sa * hw, b0 + sa * r - ca * hw, PV);
    pl(PV[0], PV[1], 0);
    pen.p(sk, a0 + sa * hw, b0 - ca * hw, PV);
    pl(PV[0], PV[1], 0);
    pfill(sk);
    const sh = pen.shade(-sa, ca);
    pen.m(sk, a0 + ca * r * 0.12, b0 + sa * r * 0.12, (0.4 + 0.5 * sh) * W);
    pen.l(sk, a0 + ca * (r - rim * 0.5), b0 + sa * (r - rim * 0.5), (0.4 + 0.5 * sh) * W);
    ink(sk, 0.15, 0.1, 0.2);
  }
  pen.circle(sk, a0, b0, r + rim * 0.5, 0.5 * W, 1.3 * W, 32);
  pen.circle(sk, a0, b0, r - rim * 0.5, 0.35 * W, 0.7 * W, 28);
  // timing screws round the rim: small heads, a glint on the lit ones
  for (let s = 0; s < 10; s++) {
    const t = ang + (s / 10) * TAU + 0.31;
    const ca = Math.cos(t);
    const sa = Math.sin(t);
    const sh = pen.shade(ca, sa);
    const x = a0 + ca * (r + rim * 1.05);
    const y = b0 + sa * (r + rim * 1.05);
    pen.m(sk, a0 + ca * (r + rim * 0.55), b0 + sa * (r + rim * 0.55), (0.9 + 0.8 * (1 - sh)) * W);
    pen.l(sk, x + ca * rim * 0.5, y + sa * rim * 0.5, (0.9 + 0.8 * (1 - sh)) * W);
    ink(sk, 0, 0.05, 0);
  }
  // the roller and its impulse pin
  pen.disc(sk, a0, b0, r * 0.2, 12);
  pen.circle(sk, a0, b0, r * 0.2, 0.4 * W, 0.8 * W, 12);
  const pt = ang + Math.PI;
  pen.m(sk, a0 + Math.cos(pt) * r * 0.16, b0 + Math.sin(pt) * r * 0.16, 1.4 * W);
  pen.l(sk, a0 + Math.cos(pt) * r * 0.26, b0 + Math.sin(pt) * r * 0.26, 1.4 * W);
  ink(sk, 0, 0.05, 0);
}

/**
 * The hairspring: a flat spiral from the balance's collet (turning with it by ang) out to
 * its stud (fixed at angle stud), breathing as the balance swings.
 */
export function hairspring(
  sk: Sketch,
  pen: PlanePen,
  a0: number,
  b0: number,
  r0: number,
  r1: number,
  turns: number,
  ang: number,
  stud: number,
  W = 1,
): void {
  const n = Math.round(turns * 26);
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    // the inner end turns with the balance, the outer end is held: the coils between share it
    const t = stud - (1 - u) * turns * TAU + ang * (1 - u);
    const rr = mix(r1, r0, 1 - u) * (1 + 0.012 * Math.sin(ang * (1 - u) * 2));
    if (i === 0) pen.m(sk, a0 + Math.cos(t) * rr, b0 + Math.sin(t) * rr, 0.42 * W);
    else
      pen.l(
        sk,
        a0 + Math.cos(t) * rr,
        b0 + Math.sin(t) * rr,
        (0.42 + 0.12 * pen.shade(Math.cos(t), Math.sin(t))) * W,
      );
  }
  ink(sk, 0.04, 0.1, 0.15);
}

/** How much of a turn the cam's ramp takes (rad): the follower rises over it, then drops. */
export const RAMP = 1.2;

/** How far up the ramp the follower rides at cam angle a (0 at the foot, 1 at the step). */
export function camRise(a: number): number {
  const u = (((a / TAU) % 1) + 1) % 1;
  return clamp((u - (1 - RAMP / TAU)) / (RAMP / TAU), 0, 1);
}

/** The cam's radius under the follower at cam angle a: round, then a ramp, then the drop. */
export function snailR(a: number, r0: number, r1: number): number {
  const k = camRise(a);
  return mix(r0, r1, k * (2 - k));
}

/** A snail cam: solid, its edge rising round to a step. */
export function snail(
  sk: Sketch,
  pen: PlanePen,
  a0: number,
  b0: number,
  ang: number,
  r0: number,
  r1: number,
  W = 1,
): void {
  const NN = 60;
  for (let i = 0; i < NN; i++) {
    const t = (i / NN) * TAU;
    const rr = snailR(-t, r0, r1);
    pen.p(sk, a0 + Math.cos(t + ang) * rr, b0 + Math.sin(t + ang) * rr, PV);
    if (i === 0) pm(PV[0], PV[1], 0);
    else pl(PV[0], PV[1], 0);
  }
  pfill(sk);
  for (let i = 0; i <= NN; i++) {
    const t = (i / NN) * TAU * 0.999;
    const rr = snailR(-t, r0, r1);
    const sh = pen.shade(Math.cos(t + ang), Math.sin(t + ang));
    if (i === 0)
      pen.m(
        sk,
        a0 + Math.cos(t + ang) * rr,
        b0 + Math.sin(t + ang) * rr,
        (0.5 + 0.9 * sh * sh) * W,
      );
    else
      pen.l(
        sk,
        a0 + Math.cos(t + ang) * rr,
        b0 + Math.sin(t + ang) * rr,
        (0.5 + 0.9 * sh * sh) * W,
      );
  }
  // the step, back down to the start
  pen.l(sk, a0 + Math.cos(ang) * r0, b0 + Math.sin(ang) * r0, 0.9 * W);
  ink(sk, 0.04, 0.15, 0.2);
  // a turned ring and the arbor
  pen.circle(sk, a0, b0, r0 * 0.55, 0.3 * W, 0.6 * W, 14);
  pivot(sk, pen, a0, b0, r0 * 0.22, W);
}
