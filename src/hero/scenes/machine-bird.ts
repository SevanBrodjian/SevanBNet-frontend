// The automaton: a small clockwork bird of brass shell and steel. Its flank is cut open in a
// window so its movement shows (a barrel, a train of wheels, the escape wheel and pallet, the
// balance breathing on its hairspring, a snail cam lifting a follower); a round head on a
// ringed neck with one glass eye on each side; wings of hinged metal slats that fan open; a
// slatted tail; thin legs gripping its stand.
//
// Body frame (Basis): f forward (toward the beak), u up, s toward the open flank. Metres.

import { clamp, hash, mix, type Sketch, smooth, TAU } from "../sketch";
import { type EyeState, eye } from "./machine-eye";
import {
  balance,
  camRise,
  hairspring,
  PlanePen,
  pallet,
  pinion,
  pivot,
  snail,
  snailR,
  type WheelSpec,
  wheel,
} from "./machine-gear";
import {
  type Basis,
  inFrame,
  ink,
  LAMP,
  lamp,
  mesh,
  pband,
  pfill,
  pl,
  pm,
  wd,
} from "./machine-kit";

export const RA = 0.046;
export const RB = 0.0275;
export const RC = 0.025;
export const RH = 0.0128;
/** The head is drawn out toward the beak and a little flattened. */
export const RHF = 0.0165;
const RHV = 0.0119;
/** Fuller at the breast, slim to the tail. */
const gk = (px: number) => 1 + 0.12 * px - 0.19 * px * px;

export interface BirdPose {
  body: Basis;
  head: Basis;
  /** Wings: 0 folded, 1 open; elevation of the stroke (rad, + up); how far the slats fan (0..1). */
  wing: number;
  beat: number;
  fan: number;
  /** Tail: fan (0..1) and lift (rad). */
  tail: number;
  tailLift: number;
  /** Legs: 0 standing on the perch, 1 tucked; the perch's top (world y). */
  tuck: number;
  perch: number;
  crouch: number;
  eyeN: EyeState;
  eyeF: EyeState;
  /** The movement: escape wheel, pallet, balance angles; the cam's offset; the follower. */
  esc: number;
  pal: number;
  bal: number;
  camOff: number;
  /** Presence of the drawing (0..1): it thins as the bird leaves the light. */
  pres: number;
}

// ---------------------------------------------------------------- small vector things

const V0 = [0, 0, 0];
const V1 = [0, 0, 0];
const V2 = [0, 0, 0];
const V3 = [0, 0, 0];
const LP = [0, 0, 0];
const VP = [0, 0, 0];

function nrm(v: number[]): number[] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  v[0] /= l;
  v[1] /= l;
  v[2] /= l;
  return v;
}

/** A body point from a unit-sphere direction (local), deformed into the egg. */
function bodyAt(b: Basis, px: number, py: number, pz: number, out: number[], grow = 1): number[] {
  const k = gk(px) * grow;
  return b.at(RA * px * grow, RB * py * k, RC * pz * k, out);
}

// ---------------------------------------------------------------- the window in the flank

const WC = nrm([0.1, -0.2, 1]);
const WE1 = nrm([1 - WC[0] * WC[0], -WC[0] * WC[1], -WC[0] * WC[2]]);
const WE2 = nrm([
  WC[1] * WE1[2] - WC[2] * WE1[1],
  WC[2] * WE1[0] - WC[0] * WE1[2],
  WC[0] * WE1[1] - WC[1] * WE1[0],
]);
const WTA = 0.92;
const WTB = 0.6;
const wShape0 = (t: number) =>
  1 + 0.07 * Math.cos(t) + 0.035 * Math.cos(2 * t + 0.5) - 0.02 * Math.sin(3 * t);
/** Where the notch in the window's lower rim is (an angle round the window), set with the stop. */
let TN = 2.23;
const NOTCH_W = 0.07;
const wShape = (t: number) => {
  let d = Math.abs(t - TN);
  d = Math.min(d, TAU - d);
  return wShape0(t) + 0.13 * (1 - smooth(NOTCH_W * 0.55, NOTCH_W, d));
};
/** The window's edge sampled as i of n: denser round the notch. */
const wT = (i: number, n: number) => {
  const s = (i / n) * TAU + TN;
  return s - 0.82 * Math.sin(s - TN);
};

/** The window's edge at angle t, a unit-sphere direction (local). */
function windowDir(t: number, out: number[], grow = 1, shape = wShape): number[] {
  const k = shape(t) * grow;
  const x = WTA * Math.cos(t) * k;
  const y = -WTB * Math.sin(t) * k;
  out[0] = WC[0] + x * WE1[0] + y * WE2[0];
  out[1] = WC[1] + x * WE1[1] + y * WE2[1];
  out[2] = WC[2] + x * WE1[2] + y * WE2[2];
  return nrm(out);
}

/** How far inside the window a unit direction is (< 1 inside). */
function inWindow(px: number, py: number, pz: number): number {
  const d = px * WC[0] + py * WC[1] + pz * WC[2];
  if (d <= 0.05) return 9;
  const x = (px * WE1[0] + py * WE1[1] + pz * WE1[2]) / d / WTA;
  const y = -(px * WE2[0] + py * WE2[1] + pz * WE2[2]) / d / WTB;
  const t = Math.atan2(y, x);
  return Math.hypot(x, y) / wShape(t < 0 ? t + TAU : t);
}

// ---------------------------------------------------------------- the movement's layout

const MOD = 0.00049;
const MC = 0.0092; // the plate's depth toward the open flank
const SPEC = {
  barrel: {
    kind: 0,
    N: 40,
    r: (MOD * 40) / 2,
    m: MOD,
    spokes: 5,
    rim: 0.0012,
    hub: 0.0022,
    seed: 1,
  } as WheelSpec,
  centre: {
    kind: 0,
    N: 36,
    r: (MOD * 36) / 2,
    m: MOD,
    spokes: 4,
    rim: 0.0011,
    hub: 0.0016,
    seed: 2,
  } as WheelSpec,
  third: {
    kind: 0,
    N: 30,
    r: (MOD * 30) / 2,
    m: MOD,
    spokes: 4,
    rim: 0.001,
    hub: 0.0014,
    seed: 3,
  } as WheelSpec,
  escape: {
    kind: 2,
    N: 15,
    r: 0.005,
    m: 0.00054,
    spokes: 4,
    rim: 0.0007,
    hub: 0.0009,
    seed: 4,
  } as WheelSpec,
};
const PIN = { centre: 8, third: 7, escape: 6 };
const pr = (n: number) => (MOD * n) / 2;
const DIR = { bc: 2.85, c3: 3.42, e3: 1.75 };
// positions, laid along the train from the barrel
const MB = [0.0215, -0.0095];
const MCn = [
  MB[0] + Math.cos(DIR.bc) * (SPEC.barrel.r + pr(PIN.centre)),
  MB[1] + Math.sin(DIR.bc) * (SPEC.barrel.r + pr(PIN.centre)),
];
const M3 = [
  MCn[0] + Math.cos(DIR.c3) * (SPEC.centre.r + pr(PIN.third)),
  MCn[1] + Math.sin(DIR.c3) * (SPEC.centre.r + pr(PIN.third)),
];
const ME = [
  M3[0] + Math.cos(DIR.e3) * (SPEC.third.r + pr(PIN.escape)),
  M3[1] + Math.sin(DIR.e3) * (SPEC.third.r + pr(PIN.escape)),
];
const MP = [ME[0] - 0.0072, ME[1] + 0.0008];
const BR = 0.0072;
/** The balance: low in the window, a few millimetres above its lower edge, where the lever's
 *  finger comes up through a notch to hold it. */
export const MBAL = [-0.0125, -0.003];
const BAL_C = MC + 0.0058;
const FP = [0.0045, 0.0085]; // the follower's pivot
/** Where the follower's roller meets the cam (angle round the third arbor). */
const CAM_TA = Math.atan2(FP[1] - M3[1], FP[0] - M3[0]) - 0.55;

/** How far the follower has been lifted (0..1), from the third wheel's angle and the cam's offset. */
export function followerLift(a3: number, camOff: number): number {
  return camRise(a3 + camOff - CAM_TA);
}

/** The cam's angle (third wheel's angle plus offset) at which its step comes round under the follower. */
export const CAM_STEP = CAM_TA;

const SD = [0, 0, 0];

/**
 * Where the stop's tip rests: under the balance's rim at its lowest point (as the bird stands,
 * body frame b), just in front of the balance. Also sets the notch in the window's rim there.
 */
export function stopTip(b: Basis, out: number[]): number[] {
  // straight down in the body's plane
  b.ldir(0, 1, 0, SD);
  const l = Math.hypot(SD[0], SD[1]) || 1;
  const da = SD[0] / l;
  const db = SD[1] / l;
  b.at(MBAL[0] + da * BR * 1.1, MBAL[1] + db * BR * 1.1, BAL_C + 0.0005, out);
  // the notch: where the window's (un-notched) lower rim passes under the tip
  let best = 1e9;
  for (let i = 0; i <= 240; i++) {
    const t = 1.3 + (i / 240) * 2.0;
    windowDir(t, V0, 1, wShape0);
    bodyAt(b, V0[0], V0[1], V0[2], V1);
    const d = Math.abs(V1[0] - out[0]);
    if (d < best) {
      best = d;
      TN = t;
    }
  }
  return out;
}

/** The angles of the train from the escape wheel's: wheels mesh, tooth in gap. */
export function train(esc: number, out: number[]): number[] {
  // escape pinion drives (kinematically) the third wheel, and so on down to the barrel
  const d3 = Math.atan2(M3[1] - ME[1], M3[0] - ME[0]);
  const a3 = mesh(esc, PIN.escape, SPEC.third.N, d3);
  const dc = Math.atan2(MCn[1] - M3[1], MCn[0] - M3[0]);
  const ac = mesh(a3 + 0.2, PIN.third, SPEC.centre.N, dc);
  const db = Math.atan2(MB[1] - MCn[1], MB[0] - MCn[0]);
  const ab = mesh(ac + 0.1, PIN.centre, SPEC.barrel.N, db);
  out[0] = a3;
  out[1] = ac;
  out[2] = ab;
  return out;
}
const TR = [0, 0, 0];

// ---------------------------------------------------------------- silhouettes

const SX = new Float32Array(160);
const SY = new Float32Array(160);
const SN = new Float32Array(480);

/**
 * The outline of an ellipsoid (b, radii) as the eye sees it, deformed by the body's egg when
 * egg is set: n points into SX, SY (view), SN (the unit-sphere directions). Returns false
 * if the eye is inside.
 */
function outline(
  sk: Sketch,
  b: Basis,
  ra: number,
  rb: number,
  rc: number,
  n: number,
  egg: boolean,
  grow = 1,
): boolean {
  b.loc(sk.ex, sk.ey, sk.ez, LP);
  const ex = LP[0] / ra;
  const ey = LP[1] / rb;
  const ez = LP[2] / rc;
  const d = Math.hypot(ex, ey, ez);
  if (d < 1.02) return false;
  const nx = ex / d;
  const ny = ey / d;
  const nz = ez / d;
  // a frame round n
  let t1x = -nz;
  let t1y = 0;
  let t1z = nx;
  let tl = Math.hypot(t1x, t1y, t1z);
  if (tl < 1e-3) {
    t1x = 0;
    t1y = nz;
    t1z = -ny;
    tl = Math.hypot(t1x, t1y, t1z);
  }
  t1x /= tl;
  t1y /= tl;
  t1z /= tl;
  const t2x = ny * t1z - nz * t1y;
  const t2y = nz * t1x - nx * t1z;
  const t2z = nx * t1y - ny * t1x;
  const c = 1 / d;
  const r = Math.sqrt(1 - c * c);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU;
    const px = nx * c + r * (Math.cos(t) * t1x + Math.sin(t) * t2x);
    const py = ny * c + r * (Math.cos(t) * t1y + Math.sin(t) * t2y);
    const pz = nz * c + r * (Math.cos(t) * t1z + Math.sin(t) * t2z);
    SN[i * 3] = px;
    SN[i * 3 + 1] = py;
    SN[i * 3 + 2] = pz;
    if (egg) bodyAt(b, px, py, pz, V0, grow);
    else b.at(ra * px * grow, rb * py * grow, rc * pz * grow, V0);
    sk.p3(V0[0], V0[1], V0[2], VP);
    SX[i] = VP[0];
    SY[i] = VP[1];
  }
  return true;
}

/**
 * Ink an outline (SX, SY, n points, closed) heavier away from the light (lx, ly on the view).
 * fade (0..1): as the light leaves, the lit side goes first and the shadow side breaks up, so
 * what is left is a broken heavy contour on the dark side.
 */
function inkOutline(
  sk: Sketch,
  n: number,
  cx: number,
  cy: number,
  lx: number,
  ly: number,
  w0: number,
  w1: number,
  k: number,
  lost = 0.6,
  fade = 1,
): void {
  const base = sk.id;
  const s0 = Math.floor(hash(sk.id, sk.boil + 1) * n);
  const over = Math.round(n * 0.06);
  const litOn = smooth(0.35, 0.85, fade);
  const lostAt = mix(-0.35, lost, smooth(0.25, 0.8, fade));
  const brk = 0.55 * (1 - smooth(0.25, 0.75, fade));
  let open = false;
  for (let i = 0; i <= n + over; i++) {
    const j = (s0 + i) % n;
    let nx = SX[j] - cx;
    let ny = SY[j] - cy;
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    const lit = nx * lx + ny * ly;
    const sh = 0.5 - 0.5 * lit;
    // lost edges: toward the light the line lifts off now and then; as the light leaves, the
    // lit side lifts off altogether and the dark side breaks
    const seg = Math.floor((j / n) * 9);
    const gone =
      (lit > lostAt && hash(seg, sk.id + 3) < 0.45 + 0.55 * (1 - litOn)) ||
      hash(Math.floor((j / n) * 23), sk.id + 5) < brk;
    if (gone) {
      if (open) ink(sk, 0.12, 0.6, 0.3);
      open = false;
      continue;
    }
    const w = mix(w0 * litOn, w1, sh * sh) * k;
    if (!open) {
      sk.id = base + 1 + j;
      pm(SX[j], SY[j], w);
      open = true;
    } else pl(SX[j], SY[j], w);
  }
  if (open) ink(sk, 0.06, 0.6, 0.3);
  sk.id = base + n + 2;
}

// ---------------------------------------------------------------- glints and engraving

const GH = [0, 0, 0];
const GL = [0, 0, 0];

/**
 * The lamp shining back off polished metal: where an ellipsoid (b, radii) turns its normal to
 * the half-vector between the lamp and us, a small bright sliver, long along the frame's
 * forward axis (the way the form curves least), with a black moat. skip(p) can veto a spot
 * (a window). Returns nothing; draws nothing if the spot faces away.
 */
function glint(
  sk: Sketch,
  b: Basis,
  ra: number,
  rb: number,
  rc: number,
  size: number,
  pres: number,
  skip?: (lx: number, ly: number, lz: number) => boolean,
): void {
  const o = b.o;
  const lx = LAMP.x - o[0];
  const ly = LAMP.y - o[1];
  const lz = LAMP.z - o[2];
  const ll = Math.hypot(lx, ly, lz) || 1;
  const vx = sk.ex - o[0];
  const vy = sk.ey - o[1];
  const vz = sk.ez - o[2];
  const vl = Math.hypot(vx, vy, vz) || 1;
  GH[0] = lx / ll + vx / vl;
  GH[1] = ly / ll + vy / vl;
  GH[2] = lz / ll + vz / vl;
  nrm(GH);
  // the half-vector in the frame
  b.ldir(GH[0], GH[1], GH[2], GL);
  const nx = GL[0];
  const ny = GL[1];
  const nz = GL[2];
  const d = Math.sqrt(ra * ra * nx * nx + rb * rb * ny * ny + rc * rc * nz * nz) || 1;
  const px = (ra * ra * nx) / d;
  const py = (rb * rb * ny) / d;
  const pz = (rc * rc * nz) / d;
  if (skip?.(px / ra, py / rb, pz / rc)) return;
  const lit = lamp(o[0], o[1], o[2], GH[0], GH[1], GH[2], 0.2, -1);
  if (lit < 0.2) return;
  b.at(px - size, py, pz, V0);
  b.at(px + size, py, pz, V1);
  if (!sk.p3(V0[0], V0[1], V0[2], VP)) return;
  const ax = VP[0];
  const ay = VP[1];
  if (!sk.p3(V1[0], V1[1], V1[2], VP)) return;
  const bx = VP[0];
  const by = VP[1];
  let tx = bx - ax;
  let ty = by - ay;
  const L = Math.hypot(tx, ty) || 1e-6;
  tx /= L;
  ty /= L;
  const w = Math.max(L * 0.11, 1.2 / sk.px);
  // moat, then the sliver
  sk.amp = 0.15;
  sk.m(ax - tx * L * 0.1, ay - ty * L * 0.1)
    .l(bx + tx * L * 0.1, by + ty * L * 0.1)
    .e(w * sk.px * 2.6);
  sk.m(ax, ay);
  for (let i = 1; i <= 6; i++) {
    const u = i / 6;
    const h = Math.sin(u * Math.PI) ** 0.7 * w * (0.9 + 0.2 * hash(i, sk.boil));
    sk.l(ax + tx * L * u - ty * h, ay + ty * L * u + tx * h);
  }
  for (let i = 5; i >= 1; i--) {
    const u = i / 6;
    const h = Math.sin(u * Math.PI) ** 0.7 * w * 0.8;
    sk.l(ax + tx * L * u + ty * h, ay + ty * L * u - tx * h);
  }
  sk.solid();
  // and its tail: a broken stroke running on along the form
  sk.amp = 0.3;
  sk.m(bx + tx * L * 0.35, by + ty * L * 0.35)
    .l(bx + tx * L * 0.9, by + ty * L * 0.9)
    .s(1.1 * pres, 0.5, 0.2);
  sk.amp = 1;
}

// ---------------------------------------------------------------- light helpers

const LB = [0, 0, 0];

/** The light's direction projected into a frame's plane (f, u): into out[0], out[1]. */
function planeLight(b: Basis, out: number[]): number[] {
  const o = b.o;
  const dx = LAMP.x - o[0];
  const dy = LAMP.y - o[1];
  const dz = LAMP.z - o[2];
  out[0] = dx * b.f[0] + dy * b.f[1] + dz * b.f[2];
  out[1] = dx * b.u[0] + dy * b.u[1] + dz * b.u[2];
  return out;
}

/** Light on the view: the direction toward the lamp from a view point (unit, view units). */
function viewLight(sk: Sketch, x: number, y: number, z: number, out: number[]): number[] {
  sk.p3(x, y, z, V1);
  const a = [V1[0], V1[1]];
  // a point a little toward the lamp
  const dx = LAMP.x - x;
  const dy = LAMP.y - y;
  const dz = LAMP.z - z;
  const l = Math.hypot(dx, dy, dz) || 1;
  sk.p3(x + (dx / l) * 0.01, y + (dy / l) * 0.01, z + (dz / l) * 0.01, V1);
  let vx = V1[0] - a[0];
  let vy = V1[1] - a[1];
  const vl = Math.hypot(vx, vy) || 1;
  vx /= vl;
  vy /= vl;
  out[0] = vx;
  out[1] = vy;
  return out;
}

// ---------------------------------------------------------------- the bird

const ID = (sk: Sketch, g: number) => sk.group(g);
const PL = new PlanePen();
const LV = [0, 0];

/**
 * Draw the bird. g0: the first of the id groups it may use (it uses g0 .. g0 + 60).
 * Parts are drawn far to near: the far wing, the far leg, the tail, the body (with its open
 * movement), the near leg, the head, the near wing (their order flips with the view).
 */
export function drawBird(sk: Sketch, P: BirdPose, g0: number): void {
  const b = P.body;
  // which flank faces us
  const toEye = [sk.ex - b.o[0], sk.ey - b.o[1], sk.ez - b.o[2]];
  const side = toEye[0] * b.s[0] + toEye[1] * b.s[1] + toEye[2] * b.s[2] >= 0 ? 1 : -1;
  const dHead = sk.depth(P.head.o[0], P.head.o[1], P.head.o[2]);
  const headFirst = dHead > sk.depth(b.o[0], b.o[1], b.o[2]) + 0.012;
  // the near wing against the head: whichever is nearer is drawn after the other
  wingAxes(P, side);
  b.at(RA * 0.34, RB * 0.66, side * RC * 0.66, V3);
  b.dir(DA[0], DA[1], DA[2], V2);
  const dWing = sk.depth(
    V3[0] + V2[0] * ARM * 0.35,
    V3[1] + V2[1] * ARM * 0.35,
    V3[2] + V2[2] * ARM * 0.35,
  );
  const wingLast = headFirst || dWing < dHead;
  // id groups (each part uses a fixed span): far wing 0-4, far leg 6-12, tail 14-15, body
  // 16-28, near leg 30-36, head 38-53, near wing 56-60
  ID(sk, g0);
  wingDraw(sk, P, -side, g0 + 1);
  ID(sk, g0 + 6);
  legDraw(sk, P, -side, g0 + 6);
  ID(sk, g0 + 14);
  tailDraw(sk, P, g0 + 14);
  if (headFirst) headDraw(sk, P, g0 + 38);
  ID(sk, g0 + 16);
  bodyDraw(sk, P, side, g0 + 16);
  ID(sk, g0 + 30);
  legDraw(sk, P, side, g0 + 30);
  if (!wingLast) {
    ID(sk, g0 + 56);
    wingDraw(sk, P, side, g0 + 56);
  }
  if (!headFirst) headDraw(sk, P, g0 + 38);
  if (wingLast) {
    ID(sk, g0 + 56);
    wingDraw(sk, P, side, g0 + 56);
  }
}

// ---------------------------------------------------------------- body

const BX = new Float32Array(200);
const BY = new Float32Array(200);
const WX = new Float32Array(200);
const WY = new Float32Array(200);

function bodyDraw(sk: Sketch, P: BirdPose, side: number, g: number): void {
  const b = P.body;
  const pres = P.pres;
  if (!outline(sk, b, RA, RB, RC, 72, true)) return;
  const n = 72;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    cx += SX[i];
    cy += SY[i];
  }
  cx /= n;
  cy /= n;
  for (let i = 0; i < n; i++) {
    BX[i] = SX[i];
    BY[i] = SY[i];
  }
  // clear the whole body
  sk.group(g);
  pm(BX[0], BY[0], 0);
  for (let i = 1; i < n; i++) pl(BX[i], BY[i], 0);
  pfill(sk);
  const dv = sk.depth(b.o[0], b.o[1], b.o[2]);
  const k = wd(sk, dv);
  viewLight(sk, b.o[0], b.o[1], b.o[2], LV);

  // the open flank, if it faces us
  const sx = b.s[0] * side;
  const sy = b.s[1] * side;
  const sz = b.s[2] * side;
  const facing =
    ((sk.ex - b.o[0]) * sx + (sk.ey - b.o[1]) * sy + (sk.ez - b.o[2]) * sz) /
    (Math.hypot(sk.ex - b.o[0], sk.ey - b.o[1], sk.ez - b.o[2]) || 1);
  const open = side > 0 && facing > 0.2;
  // the window's edge, on the view
  const NW = 88;
  let wcx = 0;
  let wcy = 0;
  if (open) {
    let ws = 0;
    for (let i = 0; i < NW; i++) {
      windowDir(wT(i, NW), V2);
      bodyAt(b, V2[0], V2[1], V2[2], V0);
      sk.p3(V0[0], V0[1], V0[2], VP);
      WX[i] = VP[0];
      WY[i] = VP[1];
      // (the samples crowd round the notch: weight them back to even)
      const wgt = 1 - 0.82 * Math.cos((i / NW) * TAU);
      wcx += VP[0] * wgt;
      wcy += VP[1] * wgt;
      ws += wgt;
    }
    wcx /= ws;
    wcy /= ws;
    sk.group(g + 1);
    movement(sk, P, g + 1);
    // the shell round the window clears what of the movement runs under it
    sk.group(g + 7);
    shellBand(sk, n, NW, wcx, wcy);
  }

  // the shell: meridians from breast to tail, where the lamp reaches, broken at the window
  sk.group(g + 9);
  const eyeX = sk.ex;
  const eyeY = sk.ey;
  const eyeZ = sk.ez;
  sk.amp = 0.8;
  sk.surf(
    (u, v, o) => {
      const ps = Math.PI * (0.13 + 0.74 * v);
      const ph = u * TAU;
      const px = -Math.cos(ps);
      const r = Math.sin(ps);
      bodyAt(b, px, r * Math.cos(ph), r * Math.sin(ph), o);
    },
    16,
    12,
    {
      dir: 0,
      n: 70,
      dashes: 4,
      w: 0.6,
      floor: 0.14,
      ragged: 0.5,
      cross: 2,
      seed: 61,
      light: (x, y, z) => {
        b.loc(x, y, z, LB);
        const ux = LB[0] / RA;
        const kk = gk(ux);
        const uy = LB[1] / (RB * kk);
        const uz = LB[2] / (RC * kk);
        // outward normal (of the ellipsoid, near enough), facing us?
        const ax = ux / RA;
        const ay = uy / (RB * kk);
        const az = uz / (RC * kk);
        const nx = ax * b.f[0] + ay * b.u[0] + az * b.s[0];
        const ny = ax * b.f[1] + ay * b.u[1] + az * b.s[1];
        const nz = ax * b.f[2] + ay * b.u[2] + az * b.s[2];
        const nl = Math.hypot(nx, ny, nz) || 1;
        if (((eyeX - x) * nx + (eyeY - y) * ny + (eyeZ - z) * nz) / nl < 0.02) return 0;
        if (open && inWindow(ux, uy, uz) < 1.06) return 0;
        return 1.15 * lamp(x, y, z, nx / nl, ny / nl, nz / nl, 0.25, 0, 1) * (0.5 + 0.5 * pres);
      },
    },
  );
  sk.amp = 1;
  if (open) {
    // the window's cut edge: the rim, and inside it the shell's thickness where it turns away
    sk.group(g + 8);
    rim(sk, P, NW, wcx, wcy, k);
  }
  // the outline, heavy on the side away from the lamp
  sk.group(g + 10);
  for (let i = 0; i < n; i++) {
    SX[i] = BX[i];
    SY[i] = BY[i];
  }
  sk.amp = 0.9;
  // the body's silhouette stays whole enough to hold the wings and tail to it, even as it
  // leaves the light (they keep theirs)
  inkOutline(
    sk,
    n,
    cx,
    cy,
    LV[0],
    LV[1],
    0.9,
    2.6 * (0.6 + 0.4 * pres),
    k,
    0.55,
    Math.max(pres, 0.8),
  );
  // a second, partial pass on the shadow side
  sk.group(g + 11);
  {
    const s0 = Math.floor(n * 0.5 + hash(3, sk.boil) * 6);
    let open2 = false;
    for (let i = 0; i < n * 0.45; i++) {
      const j = (s0 + i + Math.round((Math.atan2(-LV[1], -LV[0]) / TAU) * n) + n * 2) % n;
      const nx = BX[j] - cx;
      const ny = BY[j] - cy;
      const l = Math.hypot(nx, ny) || 1;
      const sh = 0.5 - 0.5 * ((nx / l) * LV[0] + (ny / l) * LV[1]);
      const x = BX[j] - (nx / l) * 0.0045;
      const y = BY[j] - (ny / l) * 0.0045;
      if (!open2) {
        pm(x, y, 0.55 * sh * k * smooth(0.45, 0.9, pres));
        open2 = true;
      } else pl(x, y, 0.55 * sh * k * smooth(0.45, 0.9, pres));
    }
    if (open2) ink(sk, 0.3, 0.5, 0.3);
  }
  // the seam along the back, with rivets where the light finds them
  sk.group(g + 12);
  seam(sk, P, k);
  // the breast plate's seam: a girth line round the front of the shell, riveted
  sk.group(g + 13);
  plateSeam(sk, P, k, open);
  sk.amp = 1;
}

const GX = new Float32Array(64);
const GY = new Float32Array(64);
const GLt = new Float32Array(64);

/**
 * A groove engraved round a form: n + 1 points already in GX, GY (view), GLt (light, -1 where
 * hidden): cut dark through the hatching where it shows, with a fine lit lip along it where
 * the light is full. The ids are fixed from base.
 */
function groove(sk: Sketch, n: number, base: number, k: number, lipX: number, lipY: number): void {
  sk.amp = 0.4;
  let run = 0;
  let open = false;
  for (let i = 0; i <= n; i++) {
    if (GLt[i] > 0.04) {
      if (!open) {
        sk.id = base + run * 2;
        sk.m(GX[i], GY[i]);
        open = true;
      } else sk.l(GX[i], GY[i]);
    } else if (open) {
      sk.e(1.6 * k);
      open = false;
      run++;
    }
  }
  if (open) sk.e(1.6 * k);
  sk.amp = 0.5;
  run = 0;
  open = false;
  for (let i = 0; i <= n; i++) {
    const lt = GLt[i];
    if (lt > 0.3) {
      const w = (0.3 + 0.35 * lt) * k;
      if (!open) {
        sk.id = base + 100 + run * 2;
        pm(GX[i] + lipX, GY[i] + lipY, w);
        open = true;
      } else pl(GX[i] + lipX, GY[i] + lipY, w);
    } else if (open) {
      ink(sk, 0.3, 0.3, 0.3);
      open = false;
      run++;
    }
  }
  if (open) ink(sk, 0.3, 0.3, 0.3);
  sk.id = base + 200;
}

/** The seam where the breast plate meets the shell: a groove round the body at px, on the
 *  side we see; a few small rivets along it where lit. */
function plateSeam(sk: Sketch, P: BirdPose, k: number, open: boolean): void {
  const b = P.body;
  const base = sk.id;
  const px = 0.6;
  const r = Math.sqrt(1 - px * px);
  const vis = (ph: number, o: number[]) => {
    const dy = r * Math.cos(ph);
    const dz = r * Math.sin(ph);
    if (open && inWindow(px, dy, dz) < 1.1) return -1;
    bodyAt(b, px, dy, dz, o, 1.004);
    const kk = gk(px);
    const nx = (px / RA) * b.f[0] + (dy / (RB * kk)) * b.u[0] + (dz / (RC * kk)) * b.s[0];
    const ny = (px / RA) * b.f[1] + (dy / (RB * kk)) * b.u[1] + (dz / (RC * kk)) * b.s[1];
    const nz = (px / RA) * b.f[2] + (dy / (RB * kk)) * b.u[2] + (dz / (RC * kk)) * b.s[2];
    const nl = Math.hypot(nx, ny, nz) || 1;
    if ((sk.ex - o[0]) * nx + (sk.ey - o[1]) * ny + (sk.ez - o[2]) * nz < 0.0004) return -1;
    return lamp(o[0], o[1], o[2], nx / nl, ny / nl, nz / nl, 0.3, 0) * P.pres;
  };
  const n = 40;
  for (let i = 0; i <= n; i++) {
    GLt[i] = vis((i / n) * TAU, V0);
    sk.p3(V0[0], V0[1], V0[2], VP);
    GX[i] = VP[0];
    GY[i] = VP[1];
  }
  // the lip on the breast's side of the groove (toward the beak, on the view)
  b.at(RA, 0, 0, V0);
  sk.p3(V0[0], V0[1], V0[2], VP);
  const fx = VP[0];
  const fy = VP[1];
  b.at(0, 0, 0, V0);
  sk.p3(V0[0], V0[1], V0[2], VP);
  const fl = Math.hypot(fx - VP[0], fy - VP[1]) || 1;
  const off = 1.4 / sk.px;
  groove(sk, n, base, k, ((fx - VP[0]) / fl) * off, ((fy - VP[1]) / fl) * off);
  // rivets
  sk.amp = 0.5;
  for (let j = 0; j < 4; j++) {
    sk.id = base + 300 + j * 3;
    const ph = 0.55 + j * 0.42;
    const lt = vis(ph, V0);
    if (lt < 0.25 || !sk.p3(V0[0], V0[1], V0[2], VP)) continue;
    const rr = (0.0005 * sk.foc) / VP[2];
    sk.ring(
      VP[0] - ((fx - VP[0]) / fl) * off * 1.5,
      VP[1] - ((fy - VP[1]) / fl) * off * 1.5,
      rr,
      rr,
      0.5 * k,
      Number.NaN,
      TAU,
    );
  }
  sk.id = base + 400;
}

const SBM = 120;
const SBA = new Float32Array(SBM * 2);
const SBB = new Float32Array(SBM * 2);

/** Clear the near shell between the outline (BX) and the window (WX). */
function shellBand(sk: Sketch, n: number, nw: number, wcx: number, wcy: number): void {
  // resample both by angle round the window's centre
  const M = SBM;
  const A = SBA;
  const B = SBB;
  const pick = (X: Float32Array, Y: Float32Array, cnt: number, out: Float32Array) => {
    for (let k = 0; k < M; k++) {
      const t = (k / M) * TAU - Math.PI;
      // the polygon edge crossed by the ray from the centre at angle t
      const dx = Math.cos(t);
      const dy = Math.sin(t);
      let best = 1e9;
      let bx = wcx;
      let by = wcy;
      for (let i = 0; i < cnt; i++) {
        const j = (i + 1) % cnt;
        const ax = X[i] - wcx;
        const ay = Y[i] - wcy;
        const ex = X[j] - X[i];
        const ey = Y[j] - Y[i];
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-12) continue;
        const s = (ax * ey - ay * ex) / den;
        const u = (ax * dy - ay * dx) / den;
        if (s > 0 && u >= -1e-6 && u <= 1 + 1e-6 && s < best) {
          best = s;
          bx = wcx + dx * s;
          by = wcy + dy * s;
        }
      }
      out[k * 2] = bx;
      out[k * 2 + 1] = by;
    }
  };
  pick(WX, WY, nw, A);
  pick(BX, BY, n, B);
  // grow the outer edge a hair so nothing leaks at the outline
  pm(B[0] + (B[0] - wcx) * 0.02, B[1] + (B[1] - wcy) * 0.02, 0);
  for (let k = 1; k <= M; k++) {
    const j = k % M;
    pl(B[j * 2] + (B[j * 2] - wcx) * 0.02, B[j * 2 + 1] + (B[j * 2 + 1] - wcy) * 0.02, 0);
  }
  for (let k = M; k >= 0; k--) {
    const j = k % M;
    pl(A[j * 2], A[j * 2 + 1], 0);
  }
  pband(sk);
}

/** The window's rim: its edge on the shell, heavy where it turns from the light, and the cut face. */
function rim(sk: Sketch, P: BirdPose, nw: number, wcx: number, wcy: number, k: number): void {
  const b = P.body;
  const pres = P.pres;
  // the cut face: the band between the edge and the edge pushed in by the shell's thickness,
  // seen on the window's far side; hatched across where lit
  sk.amp = 0.7;
  const s0 = Math.floor(hash(sk.id, sk.boil + 9) * nw);
  for (let i = 0; i <= nw + 3; i++) {
    const j = (s0 + i) % nw;
    const t = wT(j, nw);
    windowDir(t, V2);
    bodyAt(b, V2[0], V2[1], V2[2], V0);
    // which way this edge faces on the view: toward the light, thin
    const nx = WX[j] - wcx;
    const ny = WY[j] - wcy;
    const l = Math.hypot(nx, ny) || 1;
    const lit = -((nx / l) * LV[0] + (ny / l) * LV[1]);
    const w = mix(0.7, 1.9, smooth(-0.6, 0.8, -lit)) * k * (0.4 + 0.6 * pres);
    if (i === 0) pm(WX[j], WY[j], w);
    else pl(WX[j], WY[j], w);
  }
  ink(sk, 0.05, 0.5, 0.3);
  // the shell's thickness: an inner line on the side where we see into the cut, and ticks
  // across the cut face where the light is on it
  sk.amp = 0.6;
  const base = sk.id;
  let open = false;
  const IX: number[] = [];
  for (let i = 0; i <= nw; i++) {
    const j = i % nw;
    const t = wT(j, nw);
    windowDir(t, V2);
    bodyAt(b, V2[0], V2[1], V2[2], V0, 0.93);
    sk.p3(V0[0], V0[1], V0[2], VP);
    const ox = WX[j] - wcx;
    const oy = WY[j] - wcy;
    const ix = VP[0] - wcx;
    const iy = VP[1] - wcy;
    const inside = Math.hypot(ix, iy) < Math.hypot(ox, oy) * 0.985;
    IX.push(inside ? 1 : 0, VP[0], VP[1]);
    if (inside) {
      if (!open) {
        sk.id = base + i;
        pm(VP[0], VP[1], 0.6 * k * pres);
        open = true;
      } else pl(VP[0], VP[1], 0.6 * k * pres);
    } else if (open) {
      ink(sk, 0.15, 0.4, 0.3);
      open = false;
    }
  }
  if (open) ink(sk, 0.15, 0.4, 0.3);
  for (let j = 0; j < nw; j += 3) {
    sk.id = base + 40 + j;
    if (!IX[j * 3]) continue;
    const ox = WX[j] - wcx;
    const oy = WY[j] - wcy;
    const ol = Math.hypot(ox, oy) || 1;
    const lt = -((ox / ol) * LV[0] + (oy / ol) * LV[1]);
    if (lt < 0.1) continue;
    pm(IX[j * 3 + 1], IX[j * 3 + 2], 0.45 * k * pres);
    pl(mix(IX[j * 3 + 1], WX[j], 0.85), mix(IX[j * 3 + 2], WY[j], 0.85), 0.4 * k * pres);
    ink(sk, 0.3, 0.1, 0.2);
  }
  sk.id = base + 40 + nw + 4;
  sk.amp = 1;
}

/** The dorsal seam: a line along the top of the shell, riveted. */
function seam(sk: Sketch, P: BirdPose, k: number): void {
  const b = P.body;
  const base = sk.id;
  sk.amp = 0.6;
  let open = false;
  for (let i = 0; i <= 18; i++) {
    const ps = Math.PI * mix(0.12, 0.9, i / 18);
    const px = -Math.cos(ps);
    const r = Math.sin(ps);
    const ph = 1.35; // just over the top, toward the open flank
    const dy = r * Math.sin(ph);
    const dz = r * Math.cos(ph);
    bodyAt(b, px, dy, dz, V0, 1.004);
    // visible?
    const nx = (px / RA) * b.f[0] + (dy / RB) * b.u[0] + (dz / RC) * b.s[0];
    const ny = (px / RA) * b.f[1] + (dy / RB) * b.u[1] + (dz / RC) * b.s[1];
    const nz = (px / RA) * b.f[2] + (dy / RB) * b.u[2] + (dz / RC) * b.s[2];
    const vis = (sk.ex - V0[0]) * nx + (sk.ey - V0[1]) * ny + (sk.ez - V0[2]) * nz > 0;
    const lt = vis
      ? lamp(
          V0[0],
          V0[1],
          V0[2],
          nx / Math.hypot(nx, ny, nz),
          ny / Math.hypot(nx, ny, nz),
          nz / Math.hypot(nx, ny, nz),
          0.3,
          0,
        )
      : 0;
    if (lt > 0.12) {
      sk.p3(V0[0], V0[1], V0[2], VP);
      if (!open) {
        sk.id = base + i;
        pm(VP[0], VP[1], 0.55 * k * P.pres);
        open = true;
      } else pl(VP[0], VP[1], 0.55 * k * P.pres);
    } else if (open) {
      ink(sk, 0.2, 0.3, 0.3);
      open = false;
    }
  }
  if (open) ink(sk, 0.2, 0.3, 0.3);
  sk.amp = 1;
}

// ---------------------------------------------------------------- the movement

function movement(sk: Sketch, P: BirdPose, g: number): void {
  const b = P.body;
  planeLight(b, LB);
  const lit = lamp(b.o[0], b.o[1], b.o[2], b.s[0], b.s[1], b.s[2], 0.4, 0) * (0.5 + 0.5 * P.pres);
  const pres = 0.55 + 0.45 * P.pres;
  train(P.esc, TR);
  const [a3, ac, ab] = TR;
  // the plate: brushed brass, struck along its length where the light gets in through the window
  sk.group(g);
  PL.set(sk, b, MC, LB[0], LB[1], lit, pres);
  sk.amp = 0.5;
  sk.surf(
    (u, v, o) => {
      b.at(mix(-0.045, 0.045, u), mix(-0.028, 0.026, v), MC, o);
    },
    10,
    6,
    {
      dir: 1,
      n: 26,
      dashes: 6,
      w: 0.5,
      floor: 0.12,
      ragged: 0.7,
      cross: 2,
      seed: 71,
      light: (x, y, z) => {
        b.loc(x, y, z, V3);
        // the window lets the light in on the upper part, the lower lies in the shell's shade
        const k = smooth(-0.022, -0.006, V3[1]) * (0.75 + 0.25 * Math.sin(V3[0] * 140 + 1));
        return 0.85 * k * lit;
      },
    },
  );
  sk.amp = 0.45;
  // the barrel at the back, then the train toward us
  sk.group(g + 1);
  PL.set(sk, b, MC + 0.0006, LB[0], LB[1], lit, pres);
  wheel(sk, PL, MB[0], MB[1], ab, SPEC.barrel, 1);
  // the barrel's drum, on its wheel
  PL.set(sk, b, MC + 0.0012, LB[0], LB[1], lit, pres);
  sk.group(g + 2);
  PL.disc(sk, MB[0], MB[1], SPEC.barrel.r * 0.62, 24);
  PL.circle(sk, MB[0], MB[1], SPEC.barrel.r * 0.62, 0.5, 1.2, 28);
  PL.circle(sk, MB[0], MB[1], SPEC.barrel.r * 0.56, 0.3, 0.55, 26, TAU * 0.7);
  // its cover's ratchet and click
  {
    const N = 18;
    const rr = SPEC.barrel.r * 0.36;
    for (let i = 0; i <= N * 3; i++) {
      const t = ab + (i / (N * 3)) * TAU;
      const tooth = ((i % 3) / 3) * 0.18;
      const rad = rr * (1 + tooth);
      if (i === 0) PL.m(sk, MB[0] + Math.cos(t) * rad, MB[1] + Math.sin(t) * rad, 0.45);
      else
        PL.l(
          sk,
          MB[0] + Math.cos(t) * rad,
          MB[1] + Math.sin(t) * rad,
          0.45 + 0.4 * PL.shade(Math.cos(t), Math.sin(t)),
        );
    }
    ink(sk, 0.03, 0.1, 0.2);
    pivot(sk, PL, MB[0], MB[1], rr * 0.35);
  }
  // the centre wheel and its pinion (meshing with the barrel)
  sk.group(g + 3);
  PL.set(sk, b, MC + 0.0012, LB[0], LB[1], lit, pres);
  pinion(sk, PL, MCn[0], MCn[1], ac + 0.1, PIN.centre, pr(PIN.centre), MOD, 5);
  PL.set(sk, b, MC + 0.0024, LB[0], LB[1], lit, pres);
  wheel(sk, PL, MCn[0], MCn[1], ac, SPEC.centre, 1);
  // the third wheel and its pinion
  sk.group(g + 4);
  PL.set(sk, b, MC + 0.0024, LB[0], LB[1], lit, pres);
  pinion(sk, PL, M3[0], M3[1], a3 + 0.2, PIN.third, pr(PIN.third), MOD, 6);
  PL.set(sk, b, MC + 0.0036, LB[0], LB[1], lit, pres);
  wheel(sk, PL, M3[0], M3[1], a3, SPEC.third, 1);
  // the escape pinion and wheel
  sk.group(g + 5);
  PL.set(sk, b, MC + 0.0036, LB[0], LB[1], lit, pres);
  pinion(sk, PL, ME[0], ME[1], P.esc, PIN.escape, pr(PIN.escape), MOD, 7);
  PL.set(sk, b, MC + 0.0046, LB[0], LB[1], lit, pres);
  wheel(sk, PL, ME[0], ME[1], P.esc, SPEC.escape, 1.05);
  // the pallet fork
  sk.group(g + 6 + 1000);
  PL.set(sk, b, MC + 0.0052, LB[0], LB[1], lit, pres);
  pallet(sk, PL, MP[0], MP[1], P.pal, ME[0], ME[1], MBAL[0], MBAL[1], SPEC.escape.r, 1);
  // the balance, its hairspring, its cock
  sk.group(g + 7 + 1000);
  PL.set(sk, b, BAL_C, LB[0], LB[1], lit, pres);
  balance(sk, PL, MBAL[0], MBAL[1], BR, P.bal, 1.05);
  PL.set(sk, b, MC + 0.0066, LB[0], LB[1], lit, pres);
  hairspring(sk, PL, MBAL[0], MBAL[1], BR * 0.16, BR * 0.72, 6.5, P.bal, 2.3, 1);
  sk.group(g + 8 + 1000);
  PL.set(sk, b, MC + 0.0074, LB[0], LB[1], lit, pres);
  cock(sk, PL, MBAL[0], MBAL[1]);
  // the snail cam on the third arbor, and its follower riding it
  sk.group(g + 9 + 1000);
  PL.set(sk, b, MC + 0.0062, LB[0], LB[1], lit, pres);
  const camA = a3 + P.camOff;
  const c0 = 0.0026;
  const c1 = 0.0047;
  snail(sk, PL, M3[0], M3[1], camA, c0, c1, 1);
  sk.group(g + 10 + 1000);
  PL.set(sk, b, MC + 0.007, LB[0], LB[1], lit, pres);
  follower(sk, PL, camA, c0, c1);
  sk.amp = 1;
}

/** The balance cock: a curved bridge from the plate's edge to over the balance's arbor. */
function cock(sk: Sketch, pen: PlanePen, a0: number, b0: number): void {
  const foot = [a0 - 0.006, b0 + 0.0135];
  const hw0 = 0.0024;
  const hw1 = 0.0013;
  const N = 8;
  const pt = (u: number, s: number, o: number[]) => {
    const x = mix(foot[0], a0, u) + Math.sin(u * Math.PI) * 0.0018;
    const y = mix(foot[1], b0, u);
    const tx = a0 - foot[0];
    const ty = b0 - foot[1];
    const tl = Math.hypot(tx, ty);
    const hw = mix(hw0, hw1, u);
    o[0] = x - (ty / tl) * hw * s;
    o[1] = y + (tx / tl) * hw * s;
    return o;
  };
  const A = [0, 0];
  for (let i = 0; i <= N; i++) {
    pt(i / N, -1, A);
    if (i === 0) pen.m(sk, A[0], A[1], 0);
    else pen.l(sk, A[0], A[1], 0);
  }
  for (let i = N; i >= 0; i--) {
    pt(i / N, 1, A);
    pen.l(sk, A[0], A[1], 0);
  }
  pband(sk);
  pen.disc(sk, a0, b0, hw1 * 1.25, 14);
  for (const s of [-1, 1]) {
    for (let i = 0; i <= N; i++) {
      pt(i / N, s, A);
      const w = 0.45 + 0.6 * pen.shade(0, s);
      if (i === 0) pen.m(sk, A[0], A[1], w);
      else pen.l(sk, A[0], A[1], w);
    }
    ink(sk, 0.1, 0.2, 0.25);
  }
  pen.circle(sk, a0, b0, hw1 * 1.25, 0.5, 1, 14);
  // the jewel, and a screw at the foot
  pen.circle(sk, a0, b0, hw1 * 0.45, 0.6, 0.9, 10, TAU + 0.2, 0.05);
  pen.circle(sk, foot[0], foot[1], hw0 * 0.45, 0.45, 0.8, 10);
  pen.m(sk, foot[0] - hw0 * 0.35, foot[1] + hw0 * 0.1, 0.5);
  pen.l(sk, foot[0] + hw0 * 0.35, foot[1] - hw0 * 0.1, 0.5);
  ink(sk, 0, 0.05, 0);
  // engraving on the lit part of the cock
  if (pen.lit > 0.3) {
    for (let i = 0; i < 3; i++) {
      const u = 0.18 + i * 0.16;
      pt(u, -0.5, A);
      const B = [0, 0];
      pt(u + 0.08, 0.5, B);
      pen.m(sk, A[0], A[1], 0.32);
      pen.l(sk, B[0], B[1], 0.32);
      ink(sk, 0.3, 0.1, 0.2);
    }
  }
}

/** The follower: a lever pivoted at FP, its roller on the snail, its far end up to the neck. */
function follower(sk: Sketch, pen: PlanePen, camA: number, c0: number, c1: number): void {
  // where the roller sits: on the cam's edge along the line from the cam to the pivot side
  const ta = CAM_TA;
  const rr = snailR(camA - ta, c0, c1) + 0.0009;
  const rx = M3[0] + Math.cos(ta) * rr;
  const ry = M3[1] + Math.sin(ta) * rr;
  const dx = FP[0] - rx;
  const dy = FP[1] - ry;
  const L = Math.hypot(dx, dy);
  const ux = dx / L;
  const uy = dy / L;
  const far = 0.019;
  const ex = FP[0] + ux * far;
  const ey = FP[1] + uy * far * 0.6 + 0.004;
  const hw = 0.0007;
  // its band
  pen.m(sk, rx - uy * hw, ry + ux * hw, 0);
  pen.l(sk, FP[0] - uy * hw * 1.6, FP[1] + ux * hw * 1.6, 0);
  pen.l(sk, ex - uy * hw * 0.8, ey + ux * hw * 0.8, 0);
  pen.l(sk, ex + uy * hw * 0.8, ey - ux * hw * 0.8, 0);
  pen.l(sk, FP[0] + uy * hw * 1.6, FP[1] - ux * hw * 1.6, 0);
  pen.l(sk, rx + uy * hw, ry - ux * hw, 0);
  pfill(sk);
  for (const s of [-1, 1]) {
    const w = 0.45 + 0.55 * pen.shade(-uy * s, ux * s);
    pen.m(sk, rx - uy * hw * s, ry + ux * hw * s, w);
    pen.l(sk, FP[0] - uy * hw * 1.6 * s, FP[1] + ux * hw * 1.6 * s, w);
    pen.l(sk, ex - uy * hw * 0.8 * s, ey + ux * hw * 0.8 * s, w);
    ink(sk, 0.1, 0.2, 0.25);
  }
  // the roller and the pivot
  pen.disc(sk, rx, ry, 0.0011, 10);
  pen.circle(sk, rx, ry, 0.0011, 0.45, 0.9, 12);
  pen.disc(sk, FP[0], FP[1], 0.0012, 10);
  pen.circle(sk, FP[0], FP[1], 0.0012, 0.5, 1, 12);
  pivot(sk, pen, FP[0], FP[1], 0.0005);
}

// ---------------------------------------------------------------- head

const HX = new Float32Array(80);
const HY = new Float32Array(80);

function headDraw(sk: Sketch, P: BirdPose, g: number): void {
  const h = P.head;
  const pres = P.pres;
  const dv = sk.depth(h.o[0], h.o[1], h.o[2]);
  const k = wd(sk, dv);
  // the neck: rings from the body up to the head
  sk.group(g);
  neck(sk, P, k);
  // the beak behind the head, if it points away
  const tip = h.at(RHF + 0.0135, -0.0035, 0, [0, 0, 0]);
  const beakBehind = sk.depth(tip[0], tip[1], tip[2]) > dv + 0.004;
  if (beakBehind) {
    sk.group(g + 2);
    beak(sk, P, k);
  }
  sk.group(g + 3);
  if (!outline(sk, h, RHF, RHV, RH, 48, false)) return;
  for (let i = 0; i < 48; i++) {
    HX[i] = SX[i];
    HY[i] = SY[i];
  }
  pm(SX[0], SY[0], 0);
  for (let i = 1; i < 48; i++) pl(SX[i] + (SX[i] - SX[0]) * 0, SY[i], 0);
  pfill(sk);
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < 48; i++) {
    cx += HX[i];
    cy += HY[i];
  }
  cx /= 48;
  cy /= 48;
  viewLight(sk, h.o[0], h.o[1], h.o[2], LV);
  // engraving: lines streaming back from the beak, where lit
  sk.group(g + 4);
  const ex = sk.ex;
  const ey = sk.ey;
  const ez = sk.ez;
  sk.amp = 0.6;
  sk.surf(
    (u, v, o) => {
      const ps = Math.PI * (0.16 + 0.68 * v);
      const ph = u * TAU;
      h.at(
        Math.cos(ps) * RHF,
        Math.sin(ps) * Math.cos(ph) * RHV,
        Math.sin(ps) * Math.sin(ph) * RH,
        o,
      );
    },
    12,
    8,
    {
      dir: 0,
      n: 56,
      dashes: 3,
      w: 0.55,
      floor: 0.14,
      ragged: 0.5,
      cross: 2,
      seed: 81,
      light: (x, y, z) => {
        h.loc(x, y, z, LB);
        h.dir(LB[0] / (RHF * RHF), LB[1] / (RHV * RHV), LB[2] / (RH * RH), V3);
        nrm(V3);
        const nx = V3[0];
        const ny = V3[1];
        const nz = V3[2];
        if ((ex - x) * nx + (ey - y) * ny + (ez - z) * nz < 0.0005) return 0;
        // not over the eyes' sockets
        for (const s of [-1, 1]) {
          h.dir(0.3, 0.12, s, V3);
          nrm(V3);
          if (nx * V3[0] + ny * V3[1] + nz * V3[2] > 0.82) return 0;
        }
        return 1.4 * lamp(x, y, z, nx, ny, nz, 0.3, 1, 0) * (0.5 + 0.5 * pres);
      },
    },
  );
  sk.amp = 1;
  // the seam round the head, behind the eyes, where its two halves meet
  sk.group(g + 5);
  headSeam(sk, P, k);
  // the glint on the head
  sk.group(g + 15);
  glint(sk, h, RHF, RHV, RH, 0.0022, pres, (x, y, z) => {
    // not on the eyes
    for (const s2 of [-1, 1]) {
      h.dir(0.3, 0.12, s2, V3);
      nrm(V3);
      if (x * V3[0] + y * V3[1] + z * V3[2] > 0.7) return true;
    }
    return false;
  });
  // outline
  sk.group(g + 6);
  for (let i = 0; i < 48; i++) {
    SX[i] = HX[i];
    SY[i] = HY[i];
  }
  sk.amp = 0.85;
  inkOutline(sk, 48, cx, cy, LV[0], LV[1], 0.85, 2.3 * (0.6 + 0.4 * pres), k, 0.5, pres);
  sk.amp = 1;
  // the eyes: only the one turned toward us shows
  for (const s of [-1, 1]) {
    sk.group(g + 7 + (s > 0 ? 0 : 3));
    h.dir(0.3, 0.12, s, V3);
    nrm(V3);
    const re = 0.0042;
    const ecx = h.o[0] + V3[0] * (RH - re * 0.5);
    const ecy = h.o[1] + V3[1] * (RH - re * 0.5);
    const ecz = h.o[2] + V3[2] * (RH - re * 0.5);
    const toE = [ex - ecx, ey - ecy, ez - ecz];
    const tl = Math.hypot(toE[0], toE[1], toE[2]);
    if ((toE[0] * V3[0] + toE[1] * V3[1] + toE[2] * V3[2]) / tl < 0.12) continue;
    const st = s > 0 ? P.eyeN : P.eyeF;
    st.lit =
      clamp(lamp(ecx, ecy, ecz, V3[0], V3[1], V3[2], 0.5, 1) * 1.4, 0.15, 1) * (0.4 + 0.6 * pres);
    eye(sk, [ecx, ecy, ecz], V3, [h.u[0], h.u[1], h.u[2]], re, st);
  }
  if (!beakBehind) {
    sk.group(g + 14);
    beak(sk, P, k);
  }
}

/** The groove where the head's two halves meet: square to the beak, a little behind the
 *  eyes; cut where it shows, a lit lip on its face side. */
function headSeam(sk: Sketch, P: BirdPose, k: number): void {
  const h = P.head;
  const base = sk.id;
  const px = -0.22;
  const r = Math.sqrt(1 - px * px);
  const n = 36;
  for (let i = 0; i <= n; i++) {
    const ph = (i / n) * TAU;
    const dy = r * Math.cos(ph);
    const dz = r * Math.sin(ph);
    h.at(px * RHF * 1.01, dy * RHV * 1.01, dz * RH * 1.01, V0);
    h.dir(px / RHF, dy / RHV, dz / RH, V3);
    nrm(V3);
    const vis =
      (sk.ex - V0[0]) * V3[0] + (sk.ey - V0[1]) * V3[1] + (sk.ez - V0[2]) * V3[2] > 0.0003;
    GLt[i] = vis ? lamp(V0[0], V0[1], V0[2], V3[0], V3[1], V3[2], 0.3, 1, 0) * P.pres : -1;
    sk.p3(V0[0], V0[1], V0[2], VP);
    GX[i] = VP[0];
    GY[i] = VP[1];
  }
  h.at(RHF, 0, 0, V0);
  sk.p3(V0[0], V0[1], V0[2], VP);
  const fx = VP[0];
  const fy = VP[1];
  sk.p3(h.o[0], h.o[1], h.o[2], VP);
  const fl = Math.hypot(fx - VP[0], fy - VP[1]) || 1;
  const off = 1.3 / sk.px;
  groove(sk, n, base, k, ((fx - VP[0]) / fl) * off, ((fy - VP[1]) / fl) * off);
}

/** The neck: a short tapered collar from the body up into the head, cleared and edged, with
 *  the joint of the turning head as a ring round it. */
function neck(sk: Sketch, P: BirdPose, k: number): void {
  const b = P.body;
  const h = P.head;
  const base = b.at(RA * 0.66, RB * 0.62, 0, [0, 0, 0]);
  const top = h.at(-RHF * 0.45, -RHV * 0.3, 0, [0, 0, 0]);
  const lt = lamp(
    mix(base[0], top[0], 0.5),
    mix(base[1], top[1], 0.5),
    mix(base[2], top[2], 0.5),
    0,
    -0.4,
    -0.9,
    0.5,
    0,
  );
  rod3(sk, base, top, 0.0105, 0.0082, 0.6 * P.pres, lt);
  // a ring at the joint, the near half only
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = Math.PI * (0.05 + (0.9 * i) / n);
    h.at(-RHF * 0.6, -RHV * 0.32 + Math.cos(t) * 0.0088, Math.sin(t) * 0.0088, V0);
    sk.p3(V0[0], V0[1], V0[2], VP);
    if (i === 0) pm(VP[0], VP[1], 0.45 * k * P.pres);
    else pl(VP[0], VP[1], (0.45 + 0.4 * Math.sin(t)) * k * P.pres);
  }
  ink(sk, 0.15, 0.3, 0.3);
}

function beak(sk: Sketch, P: BirdPose, k: number): void {
  const h = P.head;
  const pres = P.pres;
  // a cone from an ellipse on the head's front to the tip, curving down a little
  const pts: number[] = [];
  const tip = h.at(RHF + 0.0128, -RHV * 0.3, 0, [0, 0, 0]);
  sk.p3(tip[0], tip[1], tip[2], VP);
  const tx = VP[0];
  const ty = VP[1];
  const N = 16;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * TAU;
    h.at(RHF * 0.86, -RHV * 0.14 + Math.cos(t) * 0.0036, Math.sin(t) * 0.004, V0);
    sk.p3(V0[0], V0[1], V0[2], VP);
    pts.push(VP[0], VP[1]);
  }
  // the outline: hull of base and tip (angle sort round the base centre)
  let bx = 0;
  let by = 0;
  for (let i = 0; i < N; i++) {
    bx += pts[i * 2];
    by += pts[i * 2 + 1];
  }
  bx /= N;
  by /= N;
  const dx = tx - bx;
  const dy = ty - by;
  const dl = Math.hypot(dx, dy) || 1;
  // the base points furthest either side of the axis
  let iL = 0;
  let iR = 0;
  let sL = -1e9;
  let sR = 1e9;
  for (let i = 0; i < N; i++) {
    const s = ((pts[i * 2] - bx) * -dy + (pts[i * 2 + 1] - by) * dx) / dl;
    if (s > sL) {
      sL = s;
      iL = i;
    }
    if (s < sR) {
      sR = s;
      iR = i;
    }
  }
  // fill: tip, left base point, round the back of the base, right base point
  pm(tx, ty, 0);
  const lx = pts[iL * 2];
  const ly = pts[iL * 2 + 1];
  const rx = pts[iR * 2];
  const ry = pts[iR * 2 + 1];
  // curve the edges a touch (the beak bows)
  const bow = 0.12;
  for (let i = 1; i <= 6; i++) {
    const u = i / 6;
    pl(
      mix(tx, lx, u) + (-dy / dl) * Math.sin(u * Math.PI) * dl * bow * 0.3,
      mix(ty, ly, u) + (dx / dl) * Math.sin(u * Math.PI) * dl * bow * 0.3,
      0,
    );
  }
  pl(bx, by, 0);
  pl(rx, ry, 0);
  for (let i = 5; i >= 1; i--) {
    const u = i / 6;
    pl(
      mix(tx, rx, u) - (-dy / dl) * Math.sin(u * Math.PI) * dl * bow * 0.1,
      mix(ty, ry, u) - (dx / dl) * Math.sin(u * Math.PI) * dl * bow * 0.1,
      0,
    );
  }
  pfill(sk);
  viewLight(sk, h.o[0], h.o[1], h.o[2], LV);
  sk.amp = 0.7;
  for (const [ex, ey, s, bw] of [
    [lx, ly, 1, 0.3],
    [rx, ry, -1, -0.1],
  ] as const) {
    const sh = 0.5 - 0.5 * ((-dy / dl) * s * LV[0] + (dx / dl) * s * LV[1]);
    for (let i = 0; i <= 6; i++) {
      const u = i / 6;
      const x = mix(tx, ex, u) + (-dy / dl) * Math.sin(u * Math.PI) * dl * bow * bw;
      const y = mix(ty, ey, u) + (dx / dl) * Math.sin(u * Math.PI) * dl * bow * bw;
      if (i === 0) pm(x, y, 0.7 * k * pres);
      else pl(x, y, mix(0.7, 0.8 + 1.3 * sh, u) * k * pres);
    }
    ink(sk, 0.08, 0.3, 0.3);
  }
  // the two mandibles: where they part, a straight line along the beak from the gape to near
  // the tip, a hinge pin at the gape (not when the beak points at us: then it is only a cone)
  const base = sk.id;
  const nearSide =
    sk.depth(h.o[0] + h.s[0], h.o[1] + h.s[1], h.o[2] + h.s[2]) < sk.depth(h.o[0], h.o[1], h.o[2])
      ? 1
      : -1;
  const b0 = h.at(RHF * 0.86, -RHV * 0.14, 0, [0, 0, 0]);
  const ax3 = tip[0] - b0[0];
  const ay3 = tip[1] - b0[1];
  const az3 = tip[2] - b0[2];
  const bl = Math.hypot(ax3, ay3, az3) || 1;
  const vx = sk.ex - b0[0];
  const vy = sk.ey - b0[1];
  const vz = sk.ez - b0[2];
  const vl = Math.hypot(vx, vy, vz) || 1;
  const along = (ax3 * vx + ay3 * vy + az3 * vz) / (bl * vl);
  if (along < 0.8) {
    const side = 1 - smooth(0.6, 0.8, along);
    const gape = h.at(RHF * 0.9, -RHV * 0.24, 0.0031 * nearSide, [0, 0, 0]);
    const end = h.at(RHF + 0.0108, -RHV * 0.31, 0.0006 * nearSide, [0, 0, 0]);
    sk.m3(gape[0], gape[1], gape[2])
      .l3(mix(gape[0], end[0], 0.5), mix(gape[1], end[1], 0.5), mix(gape[2], end[2], 0.5))
      .l3(end[0], end[1], end[2]);
    sk.s3(0.75 * pres * side, 0.25, 0.2, 0.35 * pres * side);
    sk.id = base + 5;
    if (sk.p3(gape[0], gape[1], gape[2], VP)) {
      const r = (0.00075 * sk.foc) / VP[2];
      sk.blot(VP[0], VP[1], r * 1.4);
      sk.ring(VP[0], VP[1], r, r, 0.6 * k * pres * side);
    }
  }
  sk.id = base + 10;
  const mid = h.at(RHF * 0.86, -RH * 0.12, 0, [0, 0, 0]);
  const lt = lamp(mid[0], mid[1], mid[2], h.u[0], h.u[1], h.u[2], 0.3, 1);
  if (lt > 0.15) {
    for (let i = 0; i < 4; i++) {
      const u = 0.2 + i * 0.15;
      const ax = mix(lx, tx, u);
      const ay = mix(ly, ty, u);
      pm(ax, ay, 0.4 * pres);
      pl(mix(ax, mix(rx, tx, u), 0.4), mix(ay, mix(ry, ty, u), 0.4), 0.35 * pres);
      ink(sk, 0.3, 0.1, 0.2);
    }
  }
  sk.id = base + 20;
  sk.amp = 1;
}

// ---------------------------------------------------------------- wings

const NSL = 10;
const SL_ROOT = [0.0, 0.1, 0.2, 0.3, 0.42, 0.54, 0.66, 0.78, 0.9, 1.0];
const SL_LEN = [0.03, 0.032, 0.034, 0.036, 0.039, 0.042, 0.046, 0.05, 0.053, 0.05];
const SL_WID = [0.0062, 0.0062, 0.0062, 0.006, 0.0058, 0.0056, 0.0054, 0.0052, 0.005, 0.0047];
const ARM = 0.044;

const DA = [0, 0, 0];
const DB = [0, 0, 0];
const DN = [0, 0, 0];

/**
 * The wing's frame (in the body's local axes): the spar's direction and the trailing
 * direction, for side s (+1 the open flank).
 */
function wingAxes(P: BirdPose, s: number): void {
  const u = smooth(0, 1, P.wing);
  // folded: back along the upper flank; open: up and out, raised by the beat
  const fa = [-1, 0.02, s * 0.12];
  const fb = [0.0, -0.62, s * 0.78];
  const el = P.beat;
  const oa = [-0.18, Math.sin(el), s * Math.cos(el) * 0.95];
  const ob = [-1, -0.25, 0];
  for (let i = 0; i < 3; i++) {
    DA[i] = mix(fa[i], oa[i], u);
    DB[i] = mix(fb[i], ob[i], u);
  }
  nrm(DA);
  // trailing direction, square to the spar
  const d = DB[0] * DA[0] + DB[1] * DA[1] + DB[2] * DA[2];
  for (let i = 0; i < 3; i++) DB[i] -= DA[i] * d;
  nrm(DB);
  DN[0] = DA[1] * DB[2] - DA[2] * DB[1];
  DN[1] = DA[2] * DB[0] - DA[0] * DB[2];
  DN[2] = DA[0] * DB[1] - DA[1] * DB[0];
}

const SLP = new Float32Array(64 * 3);

function wingDraw(sk: Sketch, P: BirdPose, s: number, g: number): void {
  const b = P.body;
  wingAxes(P, s);
  const u = smooth(0, 1, P.wing);
  // the shoulder
  const sh = [RA * 0.34, RB * 0.66, s * RC * 0.66];
  // world directions
  const wa = b.dir(DA[0], DA[1], DA[2], [0, 0, 0]);
  const wb = b.dir(DB[0], DB[1], DB[2], [0, 0, 0]);
  const wn = b.dir(DN[0], DN[1], DN[2], [0, 0, 0]);
  const S = b.at(sh[0], sh[1], sh[2], [0, 0, 0]);
  // which face we see, and the light on it
  const toEye = [sk.ex - S[0], sk.ey - S[1], sk.ez - S[2]];
  const facing = toEye[0] * wn[0] + toEye[1] * wn[1] + toEye[2] * wn[2];
  const fs = facing >= 0 ? 1 : -1;
  const lit =
    lamp(S[0], S[1], S[2], wn[0] * fs, wn[1] * fs, wn[2] * fs, 0.35, -1) * (0.45 + 0.55 * P.pres);
  const k = wd(sk, sk.depth(S[0], S[1], S[2]));
  // slats: drawn so the ones nearer us come last
  const order: number[] = [];
  for (let i = 0; i < NSL; i++) order.push(fs > 0 ? i : NSL - 1 - i);
  for (const i of order) {
    sk.group(g + 1 + i * 0 + 0);
    sk.id = (g + 1) * 10007 + i * 41;
    // the slat's root on the spar, and its direction: fanning open slat by slat
    const ui = smooth(0, 1, clamp((u - 0.28 * (1 - i / (NSL - 1))) / 0.72, 0, 1));
    const fanA = mix(mix(0.3, 0.03, i / (NSL - 1)), mix(1.45, 0.3, i / (NSL - 1)), ui * P.fan);
    const ca = Math.cos(fanA);
    const sa = Math.sin(fanA);
    const rx = S[0] + wa[0] * ARM * SL_ROOT[i] * mix(0.8, 1, u);
    const ry = S[1] + wa[1] * ARM * SL_ROOT[i] * mix(0.8, 1, u);
    const rz = S[2] + wa[2] * ARM * SL_ROOT[i] * mix(0.8, 1, u);
    const lift = (NSL - i) * 0.00026 * fs;
    const dx = wa[0] * ca + wb[0] * sa;
    const dy = wa[1] * ca + wb[1] * sa;
    const dz = wa[2] * ca + wb[2] * sa;
    // across the slat, in the wing's plane
    const cx = wb[0] * ca - wa[0] * sa;
    const cy = wb[1] * ca - wa[1] * sa;
    const cz = wb[2] * ca - wa[2] * sa;
    slat(
      sk,
      rx + wn[0] * lift,
      ry + wn[1] * lift,
      rz + wn[2] * lift,
      dx,
      dy,
      dz,
      cx,
      cy,
      cz,
      wn,
      SL_LEN[i] * mix(0.92, 1, u),
      SL_WID[i],
      lit,
      k,
      P.pres,
      i,
    );
  }
  // the spar over them: a jointed bar from the shoulder to the last slat's root
  sk.group(g + 3);
  const reach = ARM * mix(0.8, 1, u);
  const E = [S[0] + wa[0] * reach, S[1] + wa[1] * reach, S[2] + wa[2] * reach];
  const lift = NSL * 0.00026 * fs + 0.0005 * fs;
  sk.m3(S[0] + wn[0] * lift, S[1] + wn[1] * lift, S[2] + wn[2] * lift);
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    sk.l3(
      mix(S[0], E[0], t) + wn[0] * lift,
      mix(S[1], E[1], t) + wn[1] * lift,
      mix(S[2], E[2], t) + wn[2] * lift,
    );
  }
  sk.s3((0.8 + 0.7 * (1 - lit)) * smooth(0.2, 0.7, P.pres), 0.1, 0.4);
  // its hinge pins, small, over slat roots
  for (const t of [0, 0.42, 0.78]) {
    const x = mix(S[0], E[0], t) + wn[0] * lift;
    const y = mix(S[1], E[1], t) + wn[1] * lift;
    const z = mix(S[2], E[2], t) + wn[2] * lift;
    if (!sk.p3(x, y, z, VP)) {
      sk.id += 2;
      continue;
    }
    const r = (0.0008 * sk.foc) / VP[2];
    sk.blot(VP[0], VP[1], r * 1.35);
    sk.ring(VP[0], VP[1], r, r, 0.5 * P.pres);
  }
}

/** One slat: a long blade with a rounded tip; cleared, edged, ribbed, struck where lit. */
function slat(
  sk: Sketch,
  rx: number,
  ry: number,
  rz: number,
  dx: number,
  dy: number,
  dz: number,
  cx: number,
  cy: number,
  cz: number,
  _wn: number[],
  len: number,
  wid: number,
  lit: number,
  k: number,
  pres: number,
  i: number,
): void {
  const N = 9;
  // leading edge (toward -c) then trailing edge back; a slight curve toward the trailing side
  const at = (t: number, e: number, o: number[]) => {
    const prof =
      Math.sin(Math.min(1, t * 1.05) * Math.PI * 0.5) ** 0.6 *
      (t > 0.82 ? Math.sqrt(Math.max(0, 1 - ((t - 0.82) / 0.2) ** 2)) : 1);
    const hw = wid * 0.5 * (0.35 + 0.65 * prof);
    const bend = 0.06 * len * t * t;
    const off = e > 0 ? hw * 1.15 : -hw * 0.75;
    o[0] = rx + dx * len * t + cx * (off + bend);
    o[1] = ry + dy * len * t + cy * (off + bend);
    o[2] = rz + dz * len * t + cz * (off + bend);
    return o;
  };
  for (let j = 0; j <= N; j++) {
    at(j / N, -1, V0);
    sk.p3(V0[0], V0[1], V0[2], VP);
    SLP[j * 2] = VP[0];
    SLP[j * 2 + 1] = VP[1];
  }
  for (let j = 0; j <= N; j++) {
    at(j / N, 1, V0);
    sk.p3(V0[0], V0[1], V0[2], VP);
    SLP[(N + 1 + j) * 2] = VP[0];
    SLP[(N + 1 + j) * 2 + 1] = VP[1];
  }
  // fill
  pm(SLP[0], SLP[1], 0);
  for (let j = 1; j <= N; j++) pl(SLP[j * 2], SLP[j * 2 + 1], 0);
  for (let j = N; j >= 0; j--) pl(SLP[(N + 1 + j) * 2], SLP[(N + 1 + j) * 2 + 1], 0);
  pband(sk);
  // edges: the trailing one heavier, round the tip in one stroke
  const pe = mix(0.5, 1, pres);
  const wL = (0.45 + 0.35 * (1 - lit)) * k * pe;
  const wTr = (0.7 + 0.9 * (1 - lit)) * k * pe;
  pm(SLP[0], SLP[1], wL * 0.7);
  for (let j = 1; j <= N; j++) pl(SLP[j * 2], SLP[j * 2 + 1], wL);
  for (let j = N; j >= 0; j--)
    pl(SLP[(N + 1 + j) * 2], SLP[(N + 1 + j) * 2 + 1], mix(wTr * 0.6, wTr, j / N));
  sk.amp = 0.7;
  ink(sk, 0.06, 0.35, 0.3);
  // the rib
  sk.amp = 0.45;
  for (let j = 0; j <= 4; j++) {
    const t = 0.05 + (j / 4) * 0.8;
    at(t, -1, V1);
    at(t, 1, V2);
    sk.p3(mix(V1[0], V2[0], 0.4), mix(V1[1], V2[1], 0.4), mix(V1[2], V2[2], 0.4), VP);
    if (j === 0) pm(VP[0], VP[1], 0.45 * k * pres);
    else pl(VP[0], VP[1], 0.4 * k * pres);
  }
  ink(sk, 0.2, 0.2, 0.2);
  // barbs: short strokes angled from the rib out to the trailing edge, toward the tip, where
  // the light is on the vane; a few, unevenly spaced
  const base = sk.id;
  for (let j = 0; j < 6; j++) {
    sk.id = base + j;
    const t = 0.22 + j * 0.12 + (hash(i * 13 + j, 91) - 0.5) * 0.07;
    if (hash(i * 7 + j, 92) > lit * 1.25 || t > 0.86) continue;
    at(t, -1, V1);
    at(t, 1, V2);
    sk.p3(mix(V1[0], V2[0], 0.45), mix(V1[1], V2[1], 0.45), mix(V1[2], V2[2], 0.45), VP);
    pm(VP[0], VP[1], 0.42 * pres);
    at(t + 0.09, 1, V2);
    at(t + 0.09, -1, V1);
    sk.p3(mix(V1[0], V2[0], 0.93), mix(V1[1], V2[1], 0.93), mix(V1[2], V2[2], 0.93), VP);
    pl(VP[0], VP[1], 0.32 * pres);
    ink(sk, 0.35, 0.1, 0.2);
  }
  sk.id = base + 7;
  sk.amp = 1;
}

// ---------------------------------------------------------------- tail

function tailDraw(sk: Sketch, P: BirdPose, g: number): void {
  const b = P.body;
  const root = b.at(-RA * 0.82, RB * 0.15, 0, [0, 0, 0]);
  const N = 7;
  const spread = mix(0.12, 0.55, P.tail);
  const lift = P.tailLift;
  // in flight the fan rolls a little about its length, so it never shows only its edge
  const roll = 0.3 * smooth(0, 1, P.tuck);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const up = b.dir(0, cr, sr, [0, 0, 0]);
  const toEye = [sk.ex - root[0], sk.ey - root[1], sk.ez - root[2]];
  const fs = toEye[0] * up[0] + toEye[1] * up[1] + toEye[2] * up[2] >= 0 ? 1 : -1;
  const k = wd(sk, sk.depth(root[0], root[1], root[2]));
  const lit =
    lamp(root[0], root[1], root[2], up[0] * fs, up[1] * fs, up[2] * fs, 0.4, 0) *
    (0.5 + 0.5 * P.pres);
  // the fan spreads sideways (along s); the slats overlap toward the middle
  const order = [0, 6, 1, 5, 2, 4, 3];
  for (const j of order) {
    sk.id = (g + 1) * 10007 + j * 41;
    const ang = mix(-spread, spread, j / (N - 1));
    const lenj = 0.052 * (1 - 0.18 * Math.abs(j / (N - 1) - 0.5) * 2);
    const ld = [-Math.cos(ang) * Math.cos(lift), Math.sin(lift) * Math.cos(ang), Math.sin(ang)];
    const d = b.dir(ld[0], ld[1] * cr - ld[2] * sr, ld[1] * sr + ld[2] * cr, [0, 0, 0]);
    // across: in the fan's plane
    const cl = [Math.sin(ang), 0, Math.cos(ang)];
    const c = b.dir(cl[0], -cl[2] * sr, cl[2] * cr, [0, 0, 0]);
    const lz = (3 - Math.abs(j - 3)) * 0.0006 * fs;
    slat(
      sk,
      root[0] + up[0] * lz,
      root[1] + up[1] * lz,
      root[2] + up[2] * lz,
      d[0],
      d[1],
      d[2],
      c[0],
      c[1],
      c[2],
      up,
      lenj,
      0.0085,
      lit,
      k,
      P.pres,
      20 + j,
    );
  }
}

// ---------------------------------------------------------------- legs

const LA = [0, 0, 0];
const LBp = [0, 0, 0];
const LV2 = [0, 0];

/** A tapered rod between two points: cleared, edged (heavier away from the lamp). */
function rod3(
  sk: Sketch,
  A: number[],
  B: number[],
  r0: number,
  r1: number,
  w: number,
  lit: number,
): void {
  if (!sk.p3(A[0], A[1], A[2], LA) || !sk.p3(B[0], B[1], B[2], LBp)) return;
  const ra = (r0 * sk.foc) / LA[2];
  const rb = (r1 * sk.foc) / LBp[2];
  let nx = -(LBp[1] - LA[1]);
  let ny = LBp[0] - LA[0];
  const nl = Math.hypot(nx, ny) || 1;
  nx /= nl;
  ny /= nl;
  pm(LA[0] + nx * ra, LA[1] + ny * ra, 0);
  pl(LBp[0] + nx * rb, LBp[1] + ny * rb, 0);
  pl(LBp[0] - nx * rb, LBp[1] - ny * rb, 0);
  pl(LA[0] - nx * ra, LA[1] - ny * ra, 0);
  pfill(sk);
  const k = wd(sk, LA[2]);
  // the edge facing the lamp on the view is the thin one
  const m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
  viewLight(sk, m[0], m[1], m[2], LV2);
  const up = nx * LV2[0] + ny * LV2[1] > 0 ? 1 : -1;
  pm(LA[0] + nx * ra * up, LA[1] + ny * ra * up, w * 0.55 * k);
  pl(LBp[0] + nx * rb * up, LBp[1] + ny * rb * up, w * 0.5 * k);
  ink(sk, 0.1, 0.2, 0.2);
  pm(LA[0] - nx * ra * up, LA[1] - ny * ra * up, w * (0.9 + 0.5 * (1 - lit)) * k);
  pl(LBp[0] - nx * rb * up, LBp[1] - ny * rb * up, w * (0.9 + 0.5 * (1 - lit)) * k);
  ink(sk, 0.1, 0.2, 0.2);
}

const LEG_A = 0.0071;
const LEG_B = 0.0079;
const HIP = [0, 0, 0];
const ANK = [0, 0, 0];
const FOOT = [0, 0, 0];

/**
 * A leg: from the hip in the belly (under the body's weight) down to the ankle, which bends
 * backward, and on to the foot, nearly upright; three toes forward and one back on the stand's
 * top, a knuckle on each. Off the perch the foot hangs; in flight it tucks up.
 */
function legDraw(sk: Sketch, P: BirdPose, s: number, g: number): void {
  const b = P.body;
  const tuck = smooth(0, 1, P.tuck);
  b.at(-RA * 0.15, -RB * 0.84, s * RC * 0.3, HIP);
  // the body's forward, level
  let fx = b.f[0];
  let fz = b.f[2];
  const fl = Math.hypot(fx, fz) || 1;
  fx /= fl;
  fz /= fl;
  let sx = b.s[0];
  let sz = b.s[2];
  const sl = Math.hypot(sx, sz) || 1;
  sx /= sl;
  sz /= sl;
  // the foot: on the perch below the hip if the hip is low enough, else hanging
  const reach = (LEG_A + LEG_B) * 0.985;
  const stand = [
    HIP[0] + fx * 0.0012,
    Math.min(P.perch, HIP[1] + reach * 0.99),
    HIP[2] + fz * 0.0012,
  ];
  const tucked = b.at(-RA * 0.42, -RB * 1.02, s * RC * 0.28, [0, 0, 0]);
  FOOT[0] = mix(stand[0], tucked[0], tuck);
  FOOT[1] = mix(stand[1], tucked[1], tuck);
  FOOT[2] = mix(stand[2], tucked[2], tuck);
  // the ankle: two bones, the joint bending back
  {
    let dx = FOOT[0] - HIP[0];
    let dy = FOOT[1] - HIP[1];
    let dz = FOOT[2] - HIP[2];
    let D = Math.hypot(dx, dy, dz) || 1e-6;
    dx /= D;
    dy /= D;
    dz /= D;
    D = Math.min(D, reach);
    // backward, square to hip-foot
    let px = -b.f[0];
    let py = -b.f[1];
    let pz = -b.f[2];
    const pd = px * dx + py * dy + pz * dz;
    px -= dx * pd;
    py -= dy * pd;
    pz -= dz * pd;
    const pl2 = Math.hypot(px, py, pz) || 1;
    px /= pl2;
    py /= pl2;
    pz /= pl2;
    const x = (LEG_A * LEG_A - LEG_B * LEG_B + D * D) / (2 * D);
    const h = Math.sqrt(Math.max(0, LEG_A * LEG_A - x * x));
    ANK[0] = HIP[0] + dx * x + px * h;
    ANK[1] = HIP[1] + dy * x + py * h;
    ANK[2] = HIP[2] + dz * x + pz * h;
  }
  const lt =
    lamp(ANK[0], ANK[1], ANK[2], LAMP.x - ANK[0], -0.5, LAMP.z - ANK[2], 0.6, 0) *
    (0.4 + 0.6 * P.pres);
  const w = mix(0.55, 1, P.pres);
  sk.amp = 0.6;
  sk.group(g);
  rod3(sk, HIP, ANK, 0.0015, 0.0012, 0.9 * w, lt);
  sk.group(g + 1);
  rod3(sk, ANK, FOOT, 0.001, 0.0008, 1.0 * w, lt);
  // the joint: a small pin
  sk.group(g + 2);
  if (sk.p3(ANK[0], ANK[1], ANK[2], VP)) {
    const r = (0.0013 * sk.foc) / VP[2];
    sk.blot(VP[0], VP[1], r * 1.2);
    sk.ring(VP[0], VP[1], r, r, 0.6 * w);
  }
  // toes: three forward, one back; flat on the stand's top, their tips pressed down, a
  // knuckle in each; curled under when tucked
  for (let t = 0; t < 4; t++) {
    sk.group(g + 3 + t);
    const back = t === 3;
    const ang = back ? Math.PI : (t - 1) * 0.5;
    const L = back ? 0.0042 : 0.0062 - Math.abs(t - 1) * 0.0009;
    const dx = fx * Math.cos(ang) + sx * Math.sin(ang) * s;
    const dz = fz * Math.cos(ang) + sz * Math.sin(ang) * s;
    const curl = mix(0, 0.0032, tuck);
    const y0 = FOOT[1] - 0.0004;
    const kx = FOOT[0] + dx * L * 0.5;
    const ky = y0 - 0.0006 + curl * 0.4;
    const kz = FOOT[2] + dz * L * 0.5;
    sk.m3(FOOT[0], y0, FOOT[2])
      .l3(kx, ky, kz)
      .l3(FOOT[0] + dx * L * 0.86, y0 - 0.0002 + curl, FOOT[2] + dz * L * 0.86)
      .l3(
        FOOT[0] + dx * L * mix(1, 0.7, tuck),
        y0 + 0.0003 + curl * 1.3,
        FOOT[2] + dz * L * mix(1, 0.7, tuck),
      )
      .s3((back ? 0.75 : 0.95) * w, 0.12, 0.25);
    if (sk.p3(kx, ky, kz, VP) && inFrame(sk, VP[0], VP[1]) && P.pres > 0.5) {
      const r = (0.00042 * sk.foc) / VP[2];
      sk.dot(VP[0], VP[1], r);
    } else sk.id++;
  }
  sk.amp = 1;
}
