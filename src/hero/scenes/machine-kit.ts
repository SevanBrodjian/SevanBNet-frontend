// Helpers for the machine scene: oriented frames, springs, the lamp (a pool of light with
// soft shadows), a pen that takes a width per point, and the outlines of wheels and pinions.
//
// World: metres, y down, the bench top at y = 0, z away from us.

import { clamp, FILL, hash, INK, INKFILL, mix, noise, type Sketch, smooth, TAU } from "../sketch";

// ---------------------------------------------------------------- frames

/** An oriented frame: origin o and axes f (forward), u (up), s (side: toward the open, near side). */
export class Basis {
  o = [0, 0, 0];
  f = [1, 0, 0];
  u = [0, -1, 0];
  s = [0, 0, -1];

  /** World point from local (a forward, b up, c side). */
  at(a: number, b: number, c: number, out: number[]): number[] {
    const o = this.o;
    const f = this.f;
    const u = this.u;
    const s = this.s;
    out[0] = o[0] + a * f[0] + b * u[0] + c * s[0];
    out[1] = o[1] + a * f[1] + b * u[1] + c * s[1];
    out[2] = o[2] + a * f[2] + b * u[2] + c * s[2];
    return out;
  }

  /** World direction from a local one. */
  dir(a: number, b: number, c: number, out: number[]): number[] {
    const f = this.f;
    const u = this.u;
    const s = this.s;
    out[0] = a * f[0] + b * u[0] + c * s[0];
    out[1] = a * f[1] + b * u[1] + c * s[1];
    out[2] = a * f[2] + b * u[2] + c * s[2];
    return out;
  }

  /** Local coordinates of a world point. */
  loc(x: number, y: number, z: number, out: number[]): number[] {
    const dx = x - this.o[0];
    const dy = y - this.o[1];
    const dz = z - this.o[2];
    out[0] = dx * this.f[0] + dy * this.f[1] + dz * this.f[2];
    out[1] = dx * this.u[0] + dy * this.u[1] + dz * this.u[2];
    out[2] = dx * this.s[0] + dy * this.s[1] + dz * this.s[2];
    return out;
  }

  /** Local direction of a world direction. */
  ldir(x: number, y: number, z: number, out: number[]): number[] {
    out[0] = x * this.f[0] + y * this.f[1] + z * this.f[2];
    out[1] = x * this.u[0] + y * this.u[1] + z * this.u[2];
    out[2] = x * this.s[0] + y * this.s[1] + z * this.s[2];
    return out;
  }

  copy(b: Basis): this {
    for (let i = 0; i < 3; i++) {
      this.o[i] = b.o[i];
      this.f[i] = b.f[i];
      this.u[i] = b.u[i];
      this.s[i] = b.s[i];
    }
    return this;
  }

  /**
   * Set from a parent frame (null: the world, facing +x, up -y, side -z): origin at the
   * parent's (a, b, c), turned by yaw (forward toward side), pitch (nose up), roll (top
   * toward side).
   */
  from(
    p: Basis | null,
    a: number,
    b: number,
    c: number,
    yaw: number,
    pitch: number,
    roll: number,
  ): this {
    const pf = p ? p.f : W_F;
    const pu = p ? p.u : W_U;
    const ps = p ? p.s : W_S;
    if (p) p.at(a, b, c, T0);
    else {
      T0[0] = a;
      T0[1] = b;
      T0[2] = c;
    }
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    for (let i = 0; i < 3; i++) {
      const f1 = pf[i] * cy + ps[i] * sy;
      const s1 = ps[i] * cy - pf[i] * sy;
      const u1 = pu[i];
      const f2 = f1 * cp + u1 * sp;
      const u2 = u1 * cp - f1 * sp;
      T1[i] = f2;
      T2[i] = u2 * cr + s1 * sr;
      T3[i] = s1 * cr - u2 * sr;
    }
    for (let i = 0; i < 3; i++) {
      this.o[i] = T0[i];
      this.f[i] = T1[i];
      this.u[i] = T2[i];
      this.s[i] = T3[i];
    }
    return this;
  }
}

const W_F = [1, 0, 0];
const W_U = [0, -1, 0];
const W_S = [0, 0, -1];
const T0 = [0, 0, 0];
const T1 = [0, 0, 0];
const T2 = [0, 0, 0];
const T3 = [0, 0, 0];

// ---------------------------------------------------------------- motion

/** A sub-stepped spring on a pair of numbers. */
export class Spr {
  x: number;
  v = 0;
  constructor(x = 0) {
    this.x = x;
  }
  set(x: number): this {
    this.x = x;
    this.v = 0;
    return this;
  }
  step(target: number, w: number, z: number, dt: number): number {
    const n = Math.max(1, Math.ceil((dt * w) / 0.15));
    const h = dt / n;
    let x = this.x;
    let v = this.v;
    for (let k = 0; k < n; k++) {
      v += (w * w * (target - x) - 2 * z * w * v) * h;
      x += v * h;
    }
    this.x = x;
    this.v = v;
    return x;
  }
}

/** Smooth 2D value noise in [-1, 1]. */
export function n2(x: number, y: number, seed = 0): number {
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
  return (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy) * 2 - 1;
}

// ---------------------------------------------------------------- the lamp

/** The lamp: where the bulb is, and which way the shade points (unit). */
export const LAMP = {
  x: -0.07,
  y: -0.36,
  z: -0.05,
  ax: 0,
  ay: 1,
  az: 0,
  on: 1,
  c0: 0.76,
  c1: 0.94,
};

/** Ellipsoids that cast shadows: an oriented frame and three radii. */
export interface Occ {
  b: Basis;
  ra: number;
  rb: number;
  rc: number;
  on: boolean;
}
export const OCC: Occ[] = [];

const O1 = [0, 0, 0];
const O2 = [0, 0, 0];

/** How much of the lamp reaches (x, y, z) past the occluders: 1 lit, 0 in shadow. */
export function shade(x: number, y: number, z: number, skip = -1, skip2 = -1): number {
  let k = 1;
  for (let i = 0; i < OCC.length; i++) {
    const oc = OCC[i];
    if (!oc.on || i === skip || i === skip2) continue;
    oc.b.loc(x, y, z, O1);
    oc.b.loc(LAMP.x, LAMP.y, LAMP.z, O2);
    const px = O1[0] / oc.ra;
    const py = O1[1] / oc.rb;
    const pz = O1[2] / oc.rc;
    const dx = O2[0] / oc.ra - px;
    const dy = O2[1] / oc.rb - py;
    const dz = O2[2] / oc.rc - pz;
    const dd = dx * dx + dy * dy + dz * dz;
    const t = clamp(-(px * dx + py * dy + pz * dz) / dd, 0, 1);
    if (t < 0.02) continue;
    const qx = px + dx * t;
    const qy = py + dy * t;
    const qz = pz + dz * t;
    const r = Math.sqrt(qx * qx + qy * qy + qz * qz);
    // a soft edge: the bulb is not a point
    k *= smooth(0.8, 1.15 + 0.1 * t, r);
    if (k <= 0.001) return 0;
  }
  return k;
}

/**
 * The lamp's light on a surface at (x, y, z) facing (nx, ny, nz): the shade's cone, a soft
 * wrap round the form, a gentle fall with distance, and the shadows of what is in the way.
 */
export function lamp(
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
  wrap = 0.3,
  skip = -1,
  skip2 = -1,
): number {
  const dx = LAMP.x - x;
  const dy = LAMP.y - y;
  const dz = LAMP.z - z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
  const lx = dx / d;
  const ly = dy / d;
  const lz = dz / d;
  const lam = (nx * lx + ny * ly + nz * lz + wrap) / (1 + wrap);
  if (lam <= 0) return 0;
  const ca = -(lx * LAMP.ax + ly * LAMP.ay + lz * LAMP.az);
  const cone = smooth(LAMP.c0, LAMP.c1, ca);
  if (cone <= 0) return 0;
  let k = lam * cone * clamp(0.4 / d, 0, 1.6) * LAMP.on;
  if (k > 0.01) k *= shade(x, y, z, skip, skip2);
  return clamp(k, 0, 1);
}

/** Unit direction toward the lamp from (x, y, z). */
export function toLamp(x: number, y: number, z: number, out: number[]): number[] {
  const dx = LAMP.x - x;
  const dy = LAMP.y - y;
  const dz = LAMP.z - z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
  out[0] = dx / d;
  out[1] = dy / d;
  out[2] = dz / d;
  return out;
}

// ---------------------------------------------------------------- the pen

const CAP = 4096;
const IX = new Float32Array(CAP);
const IY = new Float32Array(CAP);
const IW = new Float32Array(CAP);
const RX = new Float32Array(CAP);
const RY = new Float32Array(CAP);
const RW = new Float32Array(CAP);
let IN = 0;

/** Start a path in view units, with a width (CSS px) at this point. */
export function pm(x: number, y: number, w: number): void {
  IN = 0;
  pl(x, y, w);
}

/** Add a point and its width. */
export function pl(x: number, y: number, w: number): void {
  if (IN < CAP) {
    IX[IN] = x;
    IY[IN] = y;
    IW[IN] = w;
    IN++;
  }
}

export function pn(): number {
  return IN;
}

/**
 * Ink the path: widths per point (times the canvas's weight), a taper at each end, a hand's
 * slow wander baked per stroke, pressure that swells somewhere along it. kind: INK, or ERASE
 * for a clearing line.
 */
export function ink(sk: Sketch, taper = 0.2, wob = 0.6, press = 0.3, kind = INK): void {
  const id = sk.id++;
  const n = IN;
  if (n < 2) return;
  let len = 0;
  let x0 = 1e9;
  let x1 = -1e9;
  let y0 = 1e9;
  let y1 = -1e9;
  for (let i = 0; i < n; i++) {
    if (i) len += Math.hypot(IX[i] - IX[i - 1], IY[i] - IY[i - 1]);
    if (IX[i] < x0) x0 = IX[i];
    if (IX[i] > x1) x1 = IX[i];
    if (IY[i] < y0) y0 = IY[i];
    if (IY[i] > y1) y1 = IY[i];
  }
  const A = sk.A + 0.05;
  if (x1 < -A || x0 > A || y1 < -1.05 || y0 > 1.05) return;
  const px = sk.px;
  if (len * px < sk.minLen) return;
  // resample about every 6 px so the wander and the pressure have points to work with
  const want = clamp(Math.ceil((len * px) / 6) + 1, 2, 400);
  let m = n;
  if (want > n) {
    const step = len / (want - 1);
    let j = 0;
    let acc = 0;
    let seg = Math.hypot(IX[1] - IX[0], IY[1] - IY[0]);
    for (let k = 0; k < want; k++) {
      const target = k * step;
      while (j < n - 2 && acc + seg < target) {
        acc += seg;
        j++;
        seg = Math.hypot(IX[j + 1] - IX[j], IY[j + 1] - IY[j]);
      }
      const t = seg > 0 ? clamp((target - acc) / seg, 0, 1) : 0;
      RX[k] = IX[j] + (IX[j + 1] - IX[j]) * t;
      RY[k] = IY[j] + (IY[j + 1] - IY[j]) * t;
      RW[k] = IW[j] + (IW[j + 1] - IW[j]) * t;
    }
    m = want;
  } else {
    RX.set(IX.subarray(0, n));
    RY.set(IY.subarray(0, n));
    RW.set(IW.subarray(0, n));
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
    if (i) acc += Math.hypot(RX[i] - RX[i - 1], RY[i] - RY[i - 1]);
    const s = len > 0 ? acc / len : 0;
    const a = i ? i - 1 : 0;
    const b = i < m - 1 ? i + 1 : m - 1;
    let nx = -(RY[b] - RY[a]);
    let ny = RX[b] - RX[a];
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const d =
      am *
      (Math.sin(TAU * fr * s + ph) * 0.8 + Math.sin(TAU * 2.3 * fr * s + ph * 1.7) * 0.3) *
      Math.sin(Math.PI * s);
    let tp = 1;
    if (taper > 0) {
      tp = Math.min(1, s / (taper * 0.6), (1 - s) / taper);
      tp = 0.28 + 0.72 * Math.sqrt(tp > 0 ? tp : 0);
    }
    const pr = press > 0 ? 1 + press * (noise(s * pf + pph, id) * 0.8 + 0.2 * (1 - s)) : 1;
    f.put(RX[i] + nx * d, RY[i] + ny * d, Math.max(0, RW[i] * ws * tp * pr));
  }
  f.close();
}

/** Clear (or fill with solid ink) the polygon in the pen's path, fanned from its centroid. */
export function pfill(sk: Sketch, solid = false): void {
  sk.id++;
  const n = IN;
  if (n < 3) return;
  let cx = 0;
  let cy = 0;
  let x0 = 1e9;
  let x1 = -1e9;
  let y0 = 1e9;
  let y1 = -1e9;
  for (let i = 0; i < n; i++) {
    cx += IX[i];
    cy += IY[i];
    if (IX[i] < x0) x0 = IX[i];
    if (IX[i] > x1) x1 = IX[i];
    if (IY[i] < y0) y0 = IY[i];
    if (IY[i] > y1) y1 = IY[i];
  }
  const A = sk.A + 0.05;
  if (x1 < -A || x0 > A || y1 < -1.05 || y0 > 1.05) return;
  cx /= n;
  cy /= n;
  const f = sk.f;
  if (!f.room(n * 3)) return;
  f.open(sk.id, solid ? INKFILL : FILL);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    f.put(cx, cy, 0);
    f.put(IX[i], IY[i], 0);
    f.put(IX[j], IY[j], 0);
  }
  f.close();
}

/** Clear the band between the first half of the path and the second half (run back). */
export function pband(sk: Sketch, solid = false): void {
  sk.id++;
  const n = IN;
  if (n < 4 || n % 2) return;
  const h = n / 2;
  const f = sk.f;
  if (!f.room((h - 1) * 6)) return;
  f.open(sk.id, solid ? INKFILL : FILL);
  for (let i = 0; i + 1 < h; i++) {
    const a = i;
    const b = i + 1;
    const c = n - 1 - i;
    const d = n - 2 - i;
    f.put(IX[a], IY[a], 0);
    f.put(IX[b], IY[b], 0);
    f.put(IX[c], IY[c], 0);
    f.put(IX[b], IY[b], 0);
    f.put(IX[d], IY[d], 0);
    f.put(IX[c], IY[c], 0);
  }
  f.close();
}

// ---------------------------------------------------------------- projection

/** Whether a view point is well inside the drawing's ragged edge: solid marks (fills of ink)
 *  are not thinned by it the way lines are, so they are kept to where lines are whole. */
export function inFrame(sk: Sketch, x: number, y: number): boolean {
  return Math.hypot(x / (sk.A * 0.98), y / 0.98) < 0.78;
}

export const Q = [0, 0, 0];

/** Line weight for something at depth d (as Sketch's 3D lines are weighted). */
export function wd(sk: Sketch, d: number): number {
  return sk.depthW ? clamp((sk.depthRef / d) ** sk.depthW, 0.3, 2.4) : 1;
}

// ---------------------------------------------------------------- wheels

/** Wheel outlines in their own plane (a, b) around their centre, written into out (pairs). */
export type ToothKind = 0 | 1 | 2 | 3; // wheel, pinion, escape (club teeth), ratchet

/**
 * The outline of a toothed wheel: N teeth on pitch radius r, module m, turned by ang. Tooth
 * heights wander a little, as a hand cut them. Returns the number of points.
 */
export function teeth(
  kind: ToothKind,
  N: number,
  r: number,
  m: number,
  ang: number,
  seed: number,
  out: Float32Array,
): number {
  let k = 0;
  const p = TAU / N;
  const rt = r + m * (kind === 1 ? 0.9 : 1);
  const rr = r - m * (kind === 1 ? 1.35 : 1.2);
  const put = (a: number, rad: number) => {
    out[k++] = Math.cos(a) * rad;
    out[k++] = Math.sin(a) * rad;
  };
  for (let i = 0; i < N; i++) {
    const c = ang + i * p;
    const j = 1 + (hash(i, seed) - 0.5) * 0.06;
    if (kind === 0) {
      // cycloidal clock teeth: rounded tips, flat roots
      put(c - 0.5 * p, rr);
      put(c - 0.27 * p, rr);
      put(c - 0.22 * p, mix(rr, rt, 0.55) * j);
      put(c - 0.12 * p, rt * 0.985 * j);
      put(c, rt * j);
      put(c + 0.12 * p, rt * 0.985 * j);
      put(c + 0.22 * p, mix(rr, rt, 0.55) * j);
      put(c + 0.27 * p, rr);
    } else if (kind === 1) {
      // pinion leaves: round-ended, deep between
      put(c - 0.5 * p, rr);
      put(c - 0.28 * p, rr * 1.04);
      put(c - 0.2 * p, mix(rr, rt, 0.7));
      put(c - 0.1 * p, rt * 0.98);
      put(c + 0.1 * p, rt * 0.98);
      put(c + 0.2 * p, mix(rr, rt, 0.7));
      put(c + 0.28 * p, rr * 1.04);
    } else if (kind === 2) {
      // club teeth: a hooked, squared head leading (the wheel turns toward negative angles),
      // a long back trailing down to the root
      put(c - 0.2 * p, rr * 1.02);
      put(c - 0.12 * p, mix(rr, rt, 0.55));
      put(c - 0.16 * p, rt * 0.96);
      put(c - 0.06 * p, rt);
      put(c + 0.05 * p, rt * 0.97);
      put(c + 0.3 * p, mix(rr, rt, 0.35));
      put(c + 0.5 * p, rr);
    } else {
      // ratchet: sawtooth
      put(c - 0.5 * p, rr);
      put(c + 0.38 * p, rt * j);
      put(c + 0.44 * p, rt * 0.96 * j);
      put(c + 0.47 * p, rr);
    }
  }
  return k / 2;
}

/**
 * The angle a driven wheel (N2 teeth) takes when it meshes with a driver (N1 teeth, turned by
 * a1) whose centre is at angle `dir` from the driver's: a tooth of one in a gap of the other.
 */
export function mesh(a1: number, N1: number, N2: number, dir: number): number {
  return dir + Math.PI - Math.PI / N2 - (a1 - dir) * (N1 / N2);
}

export { clamp, mix, smooth, TAU };
