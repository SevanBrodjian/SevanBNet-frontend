// The automaton's eye: a ball in a riveted socket, an iris of fibres round a ragged pupil, a
// catchlight where the lamp shines back, and a brass lid that shuts over it. Drawn in 3D on
// the ball so it foreshortens as the head turns.

import { hash, mix, type Sketch, TAU } from "../sketch";
import { ink, pfill, pl, pm, Q, toLamp, wd } from "./machine-kit";

export interface EyeState {
  /** Lid: 0 shut, 1 open (may overshoot a little). */
  open: number;
  /** Gaze, unit direction in the world (the iris faces it). */
  gx: number;
  gy: number;
  gz: number;
  /** Pupil scale (1 rest). */
  pupil: number;
  /** Lower lid lift (0 rest, 1 up). */
  low: number;
  /** Light on the eye (0..1), for weights. */
  lit: number;
}

const E = [0, 0, 0];
const HX = [0, 0, 0];
const VU = [0, 0, 0];
const G = [0, 0, 0];
const GA = [0, 0, 0];
const GB = [0, 0, 0];
const M = [0, 0, 0];
const W = [0, 0, 0];
const V = [0, 0, 0];
const L = [0, 0, 0];
const P = [0, 0, 0];
const C2 = [0, 0, 0];

const norm = (v: number[]) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  v[0] /= l;
  v[1] /= l;
  v[2] /= l;
  return v;
};
const crossTo = (a: number[], b: number[], o: number[]) => {
  const x = a[1] * b[2] - a[2] * b[1];
  const y = a[2] * b[0] - a[0] * b[2];
  const z = a[0] * b[1] - a[1] * b[0];
  o[0] = x;
  o[1] = y;
  o[2] = z;
  return o;
};
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The ragged pupil's profile (fixed): harmonics and a few bumps. */
const PROF = ((): Float32Array => {
  const PROF = new Float32Array(48);
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU;
    PROF[i] =
      0.07 * Math.sin(3 * a + 1.1) + 0.05 * Math.sin(5 * a + 2.3) + 0.035 * Math.sin(11 * a + 0.4);
  }
  for (let s = 0; s < 6; s++) {
    const c = hash(s, 501) * TAU;
    const wdt = 0.08 + hash(s, 502) * 0.14;
    const ht = (0.1 + hash(s, 503) * 0.25) * (hash(s, 504) < 0.75 ? 1 : -0.5);
    for (let i = 0; i < 48; i++) {
      let d = Math.abs((i / 48) * TAU - c);
      d = Math.min(d, TAU - d);
      if (d < wdt) PROF[i] += ht * (1 - d / wdt);
    }
  }
  return PROF;
})();

/** A point on the ball: centre c, radius r, unit direction q -> projected into out. */
function onBall(
  sk: Sketch,
  c: number[],
  r: number,
  qx: number,
  qy: number,
  qz: number,
  out: number[],
): boolean {
  return sk.p3(c[0] + qx * r, c[1] + qy * r, c[2] + qz * r, out);
}

/**
 * Draw the eye. c: centre of the ball (world), ax: the socket's axis (unit, out of the
 * head), up: the head's up (unit), re: radius of the ball (m).
 */
export function eye(sk: Sketch, c: number[], ax: number[], up: number[], re: number, st: EyeState) {
  if (!sk.p3(c[0], c[1], c[2], C2)) return;
  // fixed ids for each part, whatever comes and goes in the others
  const base = sk.id;
  const depth = C2[2];
  const R = (re * sk.foc) / depth;
  const k = wd(sk, depth);
  // the eye's frame: axis, across, up
  E[0] = ax[0];
  E[1] = ax[1];
  E[2] = ax[2];
  crossTo(up, E, HX);
  norm(HX);
  crossTo(E, HX, VU);
  norm(VU);
  // toward us
  V[0] = sk.ex - c[0];
  V[1] = sk.ey - c[1];
  V[2] = sk.ez - c[2];
  norm(V);
  const facing = dot(E, V);
  if (facing < -0.2) return;
  toLamp(c[0], c[1], c[2], L);
  const lit = st.lit;
  // the socket: a riveted ring round the ball, behind it
  const ring = (rad: number, back: number, n: number, out: number[]) => {
    out.length = 0;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      const x = c[0] + (HX[0] * Math.cos(a) + VU[0] * Math.sin(a)) * rad - E[0] * back;
      const y = c[1] + (HX[1] * Math.cos(a) + VU[1] * Math.sin(a)) * rad - E[1] * back;
      const z = c[2] + (HX[2] * Math.cos(a) + VU[2] * Math.sin(a)) * rad - E[2] * back;
      sk.p3(x, y, z, Q);
      out.push(Q[0], Q[1]);
    }
  };
  const RO: number[] = [];
  ring(re * 1.1, re * 0.2, 40, RO);
  pm(RO[0], RO[1], 0);
  for (let i = 1; i < 40; i++) pl(RO[i * 2], RO[i * 2 + 1], 0);
  pfill(sk);
  sk.amp = 0.5;
  const la = Math.atan2(dot(L, VU), dot(L, HX));
  sk.amp = 0.8;
  const seam = hash(sk.id, sk.boil) * 40;
  for (const [pts, w0, w1] of [[RO, 0.45, 1.0]] as const) {
    const s0 = Math.floor(seam);
    for (let i = 0; i <= 42; i++) {
      const ii = (s0 + i) % 40;
      const a = (ii / 40) * TAU;
      const sh = 0.5 - 0.5 * Math.cos(a - la);
      if (i === 0) pm(pts[ii * 2], pts[ii * 2 + 1], mix(w0, w1, sh * sh) * k);
      else pl(pts[ii * 2], pts[ii * 2 + 1], mix(w0, w1, sh * sh) * k);
    }
    ink(sk, 0.06, 0.4, 0.25);
  }
  sk.amp = 1;

  // the ball: cleared, the white of it hatched on the lit side, along its curve
  pm(C2[0] + R * 1.03, C2[1], 0);
  for (let i = 1; i < 32; i++)
    pl(C2[0] + Math.cos((i / 32) * TAU) * R * 1.03, C2[1] + Math.sin((i / 32) * TAU) * R * 1.03, 0);
  pfill(sk);
  // gaze
  G[0] = st.gx;
  G[1] = st.gy;
  G[2] = st.gz;
  norm(G);
  // a frame round the gaze
  crossTo(VU, G, GA);
  norm(GA);
  crossTo(G, GA, GB);
  norm(GB);
  const iris = 0.6;
  const cosI = Math.cos(iris);
  sk.amp = 0.5;
  for (let i = 0; i < 26; i++) {
    // short strokes along latitude arcs of the ball, where lit, off the iris
    const lat = -0.9 + (i / 25) * 1.8 + (hash(i, 621) - 0.5) * 0.06;
    const a0 = -1.3 + hash(i, 622) * 0.5;
    const a1 = 1.3 - hash(i, 623) * 0.5;
    let open = false;
    for (let j = 0; j <= 8; j++) {
      const lo = mix(a0, a1, j / 8);
      const cl = Math.cos(lat);
      const qx = E[0] * cl * Math.cos(lo) + HX[0] * cl * Math.sin(lo) + VU[0] * Math.sin(lat);
      const qy = E[1] * cl * Math.cos(lo) + HX[1] * cl * Math.sin(lo) + VU[1] * Math.sin(lat);
      const qz = E[2] * cl * Math.cos(lo) + HX[2] * cl * Math.sin(lo) + VU[2] * Math.sin(lat);
      const lt = (qx * L[0] + qy * L[1] + qz * L[2]) * lit;
      const vis = qx * V[0] + qy * V[1] + qz * V[2] > 0.1;
      const off = qx * G[0] + qy * G[1] + qz * G[2] < cosI - 0.08;
      const on = vis && off && lt > 0.25 + 0.5 * hash(i * 9 + j, 624);
      if (on) {
        onBall(sk, c, re, qx, qy, qz, Q);
        if (!open) pm(Q[0], Q[1], (0.35 + 0.35 * lt) * k);
        else pl(Q[0], Q[1], (0.35 + 0.35 * lt) * k);
        open = true;
      } else if (open) {
        ink(sk, 0.3, 0.2, 0.2);
        open = false;
      }
    }
    if (open) ink(sk, 0.3, 0.2, 0.2);
  }
  // the iris: fibres from the pupil out to the rim, curling a little, heavier where lit
  sk.id = base + 300;
  const pr = 0.23 * st.pupil;
  const fib = 44;
  for (let i = 0; i < fib; i++) {
    const az = ((i + (hash(i, 631) - 0.5) * 0.6) / fib) * TAU;
    const long = i % 2 === 0 ? hash(i, 632) < 0.8 : hash(i, 632) < 0.2;
    const u0 = long ? hash(i, 633) * 0.12 : 0.3 + hash(i, 633) * 0.35;
    const u1 = 0.82 + hash(i, 634) * 0.16;
    const curl = (hash(i, 635) - 0.5) * 0.35;
    for (let j = 0; j <= 4; j++) {
      const u = mix(u0, u1, j / 4);
      const ang = mix(pr * 1.05, iris * 0.97, u);
      const a = az + curl * Math.sin(Math.PI * u);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const s = Math.sin(ang);
      const cc = Math.cos(ang);
      const qx = G[0] * cc + (GA[0] * ca + GB[0] * sa) * s;
      const qy = G[1] * cc + (GA[1] * ca + GB[1] * sa) * s;
      const qz = G[2] * cc + (GA[2] * ca + GB[2] * sa) * s;
      onBall(sk, c, re * 1.002, qx, qy, qz, Q);
      const lt = 0.5 + 0.5 * (qx * L[0] + qy * L[1] + qz * L[2]);
      const w = (long ? 0.62 : 0.5) * (0.75 + 0.5 * lt) * mix(1, 0.7, u) * k;
      if (j === 0) pm(Q[0], Q[1], w);
      else pl(Q[0], Q[1], w);
    }
    ink(sk, 0.25, 0.15, 0.2);
  }
  // the limbus: two loose passes
  sk.id = base + 400;
  sk.amp = 0.7;
  for (let pass = 0; pass < 2; pass++) {
    const a0 = hash(pass * 31 + 7, sk.boil) * TAU;
    const sweep = pass ? 2.6 + hash(pass, 641) * 1.5 : TAU + 0.35;
    const rr = iris * (pass ? 1.045 : 1.0);
    for (let j = 0; j <= 36; j++) {
      const a = a0 + (sweep * j) / 36;
      const s = Math.sin(rr);
      const cc = Math.cos(rr);
      const qx = G[0] * cc + (GA[0] * Math.cos(a) + GB[0] * Math.sin(a)) * s;
      const qy = G[1] * cc + (GA[1] * Math.cos(a) + GB[1] * Math.sin(a)) * s;
      const qz = G[2] * cc + (GA[2] * Math.cos(a) + GB[2] * Math.sin(a)) * s;
      onBall(sk, c, re * 1.003, qx, qy, qz, Q);
      const sh = 0.5 - 0.5 * (qx * L[0] + qy * L[1] + qz * L[2]);
      const w = (pass ? 0.65 : 0.95 + 0.7 * sh) * k;
      if (j === 0) pm(Q[0], Q[1], w);
      else pl(Q[0], Q[1], w);
    }
    ink(sk, pass ? 0.3 : 0.05, 0.3, 0.2);
  }
  // the pupil: a void with a ragged edge
  const pupilPt = (i: number, grow: number) => {
    const a = (i / 48) * TAU;
    const ang = pr * (1 + PROF[i % 48]) * grow;
    const s = Math.sin(ang);
    const cc = Math.cos(ang);
    const qx = G[0] * cc + (GA[0] * Math.cos(a) + GB[0] * Math.sin(a)) * s;
    const qy = G[1] * cc + (GA[1] * Math.cos(a) + GB[1] * Math.sin(a)) * s;
    const qz = G[2] * cc + (GA[2] * Math.cos(a) + GB[2] * Math.sin(a)) * s;
    onBall(sk, c, re * 1.004, qx, qy, qz, Q);
  };
  pupilPt(0, 1.08);
  pm(Q[0], Q[1], 0);
  for (let i = 1; i < 48; i++) {
    pupilPt(i, 1.08);
    pl(Q[0], Q[1], 0);
  }
  pfill(sk);
  sk.amp = 0.6;
  const ps = Math.floor(hash(sk.id, sk.boil) * 48);
  for (let i = 0; i <= 52; i++) {
    pupilPt(ps + i, 1);
    if (i === 0) pm(Q[0], Q[1], 0.9 * k);
    else pl(Q[0], Q[1], 0.9 * k);
  }
  ink(sk, 0.05, 0.2, 0.2);

  // the lid's plane: m (its pole) tilts from behind the ball (open) to in front (shut)
  const ell = mix(1.5, -1.05, Math.min(1.15, st.open));
  for (let i = 0; i < 3; i++) M[i] = Math.cos(ell) * VU[i] + Math.sin(ell) * E[i];
  norm(M);
  crossTo(HX, M, W);
  norm(W);
  if (dot(W, E) < 0) {
    W[0] = -W[0];
    W[1] = -W[1];
    W[2] = -W[2];
  }

  // the catchlight: the lamp shining back, where the half-vector meets the ball, unless lidded
  sk.id = base + 440;
  {
    P[0] = L[0] + V[0];
    P[1] = L[1] + V[1];
    P[2] = L[2] + V[2];
    norm(P);
    const under = dot(P, M) > -0.04;
    if (!under && dot(P, V) > 0.2) {
      onBall(sk, c, re, P[0], P[1], P[2], Q);
      const cr = R * 0.17;
      sk.amp = 0.15;
      sk.blot(Q[0], Q[1], cr * 1.9, cr * 1.6);
      sk.m(Q[0] + cr, Q[1]);
      for (let i = 1; i < 14; i++) {
        const a = (i / 14) * TAU;
        const rr = cr * (1 + 0.15 * (hash(i, sk.boil + 651) - 0.5));
        sk.l(Q[0] + Math.cos(a) * rr * 1.15, Q[1] + Math.sin(a) * rr * 0.8);
      }
      sk.solid();
      sk.amp = 1;
    }
  }

  // the lid: everything on the ball beyond the lid's edge (q.m > 0), as we see it
  sk.id = base + 460;
  lid(sk, c, re * 1.035, M, W, V, L, k, lit, false, st.open);
  // the lower lid: a narrow brass lip that rises a little in a blink
  {
    const el2 = mix(-1.28, -0.9, st.low) + 0.3 * Math.max(0, 0.2 - st.open);
    for (let i = 0; i < 3; i++) GA[i] = -Math.cos(el2) * VU[i] + Math.sin(el2) * E[i];
    norm(GA);
    crossTo(GA, HX, GB);
    norm(GB);
    if (dot(GB, E) < 0) {
      GB[0] = -GB[0];
      GB[1] = -GB[1];
      GB[2] = -GB[2];
    }
    sk.id = base + 600;
    lid(sk, c, re * 1.03, GA, GB, V, L, k, lit, true, st.open);
  }
  sk.id = base + 700;
  sk.amp = 1;
}

const LX: number[] = [];

/** One lid: its region on the ball (q.m > 0) seen from v, cleared; its edge; its engraving. */
function lid(
  sk: Sketch,
  c: number[],
  r: number,
  m: number[],
  w: number[],
  v: number[],
  l: number[],
  k: number,
  lit: number,
  lower: boolean,
  open: number,
) {
  // the edge: the great circle q.m = 0, through +-HX and w; keep the run that faces us
  const N = 40;
  LX.length = 0;
  let any = false;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI;
    const qx = HX[0] * Math.cos(t) + w[0] * Math.sin(t);
    const qy = HX[1] * Math.cos(t) + w[1] * Math.sin(t);
    const qz = HX[2] * Math.cos(t) + w[2] * Math.sin(t);
    const vis = qx * v[0] + qy * v[1] + qz * v[2] > -0.02;
    if (vis) any = true;
    LX.push(qx, qy, qz, vis ? 1 : 0);
  }
  // the lid's far rim: the half of the ball's outline on m's side
  const md = m[0] * v[0] + m[1] * v[1] + m[2] * v[2];
  if (!any && md < 0) return;
  // outline of the ball as seen (a circle round v), on m's side, from -HX's end round to +HX's
  // fill: the edge (visible part), then back along the outline
  const pts: number[] = [];
  let first = -1;
  let last = -1;
  for (let i = 0; i <= N; i++) {
    if (!LX[i * 4 + 3]) continue;
    if (first < 0) first = i;
    last = i;
    onBall(sk, c, r, LX[i * 4], LX[i * 4 + 1], LX[i * 4 + 2], Q);
    pts.push(Q[0], Q[1]);
  }
  // the outline: points q with q.v = 0, from the edge's last visible point round to its first,
  // on m's side
  const a1 = [0, 0, 0];
  const a2 = [0, 0, 0];
  crossTo(v, m, a1);
  if (Math.hypot(a1[0], a1[1], a1[2]) < 1e-4) return;
  norm(a1);
  crossTo(a1, v, a2); // a2: the outline's point most toward m
  norm(a2);
  const angOf = (qx: number, qy: number, qz: number) =>
    Math.atan2(qx * a2[0] + qy * a2[1] + qz * a2[2], qx * a1[0] + qy * a1[1] + qz * a1[2]);
  const eA = last >= 0 ? angOf(LX[last * 4], LX[last * 4 + 1], LX[last * 4 + 2]) : 0;
  const eB = first >= 0 ? angOf(LX[first * 4], LX[first * 4 + 1], LX[first * 4 + 2]) : Math.PI;
  // go from eA to eB through pi/2 (m's side)
  let s0 = eA;
  let s1 = eB;
  if (first < 0) {
    s0 = 0;
    s1 = TAU;
  } else {
    // pick the direction that passes pi/2
    const fwd = (((s1 - s0) % TAU) + TAU) % TAU;
    const mid = s0 + fwd / 2;
    if (Math.sin(mid) < 0) s1 = s0 - (TAU - fwd);
    else s1 = s0 + fwd;
  }
  for (let i = 1; i < 24; i++) {
    const a = mix(s0, s1, i / 24);
    const qx = a1[0] * Math.cos(a) + a2[0] * Math.sin(a);
    const qy = a1[1] * Math.cos(a) + a2[1] * Math.sin(a);
    const qz = a1[2] * Math.cos(a) + a2[2] * Math.sin(a);
    onBall(sk, c, r * 1.02, qx, qy, qz, Q);
    pts.push(Q[0], Q[1]);
  }
  if (pts.length < 6) return;
  pm(pts[0], pts[1], 0);
  for (let i = 1; i < pts.length / 2; i++) pl(pts[i * 2], pts[i * 2 + 1], 0);
  pfill(sk);
  // a single crease across the lid, parallel to its edge, broken where the light leaves it
  sk.amp = 0.5;
  const rows = lower ? 0 : 1;
  for (let j = 1; j <= rows; j++) {
    const off = 0.55;
    const so = Math.sin(off);
    const co = Math.cos(off);
    let open = false;
    for (let i = 3; i <= N - 3; i++) {
      const t = (i / N) * Math.PI;
      const qx = (HX[0] * Math.cos(t) + w[0] * Math.sin(t)) * co + m[0] * so;
      const qy = (HX[1] * Math.cos(t) + w[1] * Math.sin(t)) * co + m[1] * so;
      const qz = (HX[2] * Math.cos(t) + w[2] * Math.sin(t)) * co + m[2] * so;
      const vis = qx * v[0] + qy * v[1] + qz * v[2] > 0.08;
      const lt = (0.4 + 0.6 * (qx * l[0] + qy * l[1] + qz * l[2])) * lit;
      const on =
        vis &&
        lt > 0.18 + 0.3 * hash(j * 50 + i, 661) &&
        Math.abs(t - Math.PI / 2) < 1.35 - j * 0.12;
      if (on) {
        onBall(sk, c, r * 1.004, qx, qy, qz, Q);
        if (!open) pm(Q[0], Q[1], (0.4 + 0.3 * lt) * k);
        else pl(Q[0], Q[1], (0.4 + 0.3 * lt) * k);
        open = true;
      } else if (open) {
        ink(sk, 0.3, 0.2, 0.25);
        open = false;
      }
    }
    if (open) ink(sk, 0.3, 0.2, 0.25);
  }
  // the edge: the heaviest line in the creature, thinning at the corners; a thin second line
  // above it (the lid's thickness)
  sk.amp = 0.7;
  for (let pass = 0; pass < (lower || open > 0.6 ? 1 : 2); pass++) {
    let open = false;
    const off = pass ? 0.11 : 0;
    for (let i = 0; i <= N; i++) {
      if (!LX[i * 4 + 3]) {
        if (open) {
          ink(sk, 0.15, 0.3, 0.35);
          open = false;
        }
        continue;
      }
      const t = (i / N) * Math.PI;
      const so = Math.sin(off);
      const co = Math.cos(off);
      const qx = LX[i * 4] * co + m[0] * so;
      const qy = LX[i * 4 + 1] * co + m[1] * so;
      const qz = LX[i * 4 + 2] * co + m[2] * so;
      onBall(sk, c, r * 1.006, qx, qy, qz, Q);
      const mid = Math.sin(t);
      const wv = (lower ? 0.6 + 0.6 * mid : pass ? 0.55 : 0.9 + 1.7 * mid ** 0.8) * k;
      if (!open) pm(Q[0], Q[1], wv);
      else pl(Q[0], Q[1], wv);
      open = true;
    }
    if (open) ink(sk, pass ? 0.3 : 0.12, 0.3, 0.35);
  }
}
