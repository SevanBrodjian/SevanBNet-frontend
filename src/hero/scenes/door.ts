// 1. The door. Night, a narrow hall, first person. Moonlight falls through a window onto the
// floor and the far wall, with the shadows of branches moving in it and of dried flowers in a
// vase; at the end of the hall a door, light leaking round its edges and under it, and once
// something passes on the other side. We walk toward it and stop; the latch gives, and the
// door drifts open on its own: light comes into the hall, lighting it as it spreads, and we
// walk on into it.
//
// Everything is drawn by light: a surface is hatched only where light reaches it, so the
// hall is dark until the moon or the door shows it to us.

import type { Scene } from "../engine";
import { clamp, hash, INKFILL, type Light, mix, noise, type Sketch, smooth, TAU } from "../sketch";

const HW = 0.95; // half-width of the hall
const CEIL = -2.75;
const DZ = 6.2; // the door's plane
const DW = 0.92;
const DH = 2.12;
// the window, on the left wall
const WZ0 = 2.3;
const WZ1 = 3.5;
const WY0 = -2.25;
const WY1 = -0.85;
const MZ = 2.9;
const MY = -1.55;
// moonlight: the way it travels (in through the window, down and on)
const ML = Math.hypot(0.55, 0.78, 0.3);
const DX = 0.55 / ML;
const DY = 0.78 / ML;
const DZM = 0.3 / ML;
// where the light beyond the door comes from
const LX = 0.15;
const LY = -1.5;
const LZ = DZ + 1.3;
// when the latch gives
const T_OPEN = 8.9;

const P = [0, 0, 0];
const Q = [0, 0, 0];

// ---------------------------------------------------------------- what moves, as functions of time

function walk(t: number): number {
  return 0.3 + 4.15 * smooth(0.2, 8.3, t) + 1.05 * smooth(10.6, 13.8, t);
}

function doorAngle(t: number): number {
  // the latch gives with a small knock, then the door drifts open and slows
  const knock =
    0.014 * smooth(T_OPEN - 0.35, T_OPEN - 0.2, t) * (1 - smooth(T_OPEN - 0.2, T_OPEN, t));
  const k = Math.max(0, t - T_OPEN);
  return knock + 1.3 * (1 - Math.exp(-0.8 * k)) * smooth(0, 0.4, k);
}

/** Branches outside the window: segments (x, y, z, x, y, z, radius) swaying in the wind. */
function branches(t: number, out: number[]) {
  out.length = 0;
  const bx = -HW - 0.9;
  const sway = 0.05 * Math.sin(t * 0.9) + 0.025 * Math.sin(t * 2.3 + 1) + 0.012 * Math.sin(t * 5.1);
  const seg = (y0: number, z0: number, y1: number, z1: number, r: number, k: number) =>
    out.push(
      bx,
      y0 + sway * k * 0.4,
      z0 + sway * k,
      bx,
      y1 + sway * (k + 0.5) * 0.4,
      z1 + sway * (k + 0.5),
      r,
    );
  // a limb across the upper window, twigs off it
  seg(-3.4, 1.7, -2.6, 2.6, 0.045, 0);
  seg(-2.6, 2.6, -2.35, 3.4, 0.032, 0.5);
  seg(-2.35, 3.4, -2.2, 4.2, 0.022, 1);
  seg(-2.6, 2.6, -2.05, 2.75, 0.016, 1);
  seg(-2.05, 2.75, -1.8, 2.7, 0.01, 1.5);
  seg(-2.45, 3.0, -1.95, 3.25, 0.014, 1.2);
  seg(-1.95, 3.25, -1.75, 3.15, 0.009, 1.8);
  seg(-2.3, 3.6, -1.9, 3.85, 0.012, 1.5);
  seg(-1.9, 3.85, -1.6, 3.8, 0.008, 2);
  seg(-2.25, 3.9, -2.6, 4.3, 0.01, 1.4);
}

/** The vase's dried flowers: stems (x, y, z, x, y, z, radius) and their seed heads. */
const VASE = [0.8, -0.82, 4.3];
function stems(t: number, out: number[]) {
  out.length = 0;
  const draft = Math.sin(t * 0.7) * 0.012;
  for (let i = 0; i < 5; i++) {
    const a = -0.5 + i * 0.25 + hash(i, 3) * 0.1;
    const len = 0.55 + hash(i, 4) * 0.25;
    const tip = [
      VASE[0] + Math.sin(a) * 0.08 - 0.05,
      VASE[1] - 0.28 - len,
      VASE[2] + Math.sin(a) * len * 0.6 + draft * (1 + i * 0.3),
    ];
    out.push(VASE[0], VASE[1] - 0.28, VASE[2], tip[0], tip[1], tip[2], 0.006);
  }
}

const BR: number[] = [];
const ST: number[] = [];

/** Distance from the ray (p, -D) to segment (a, b), and whether the segment is toward the light. */
function rayToSeg(px: number, py: number, pz: number, s: number[], o: number): number {
  // closest points between the line p + t*(-D) (t >= 0) and the segment
  const ux = -DX;
  const uy = -DY;
  const uz = -DZM;
  const vx = s[o + 3] - s[o];
  const vy = s[o + 4] - s[o + 1];
  const vz = s[o + 5] - s[o + 2];
  const wx = px - s[o];
  const wy = py - s[o + 1];
  const wz = pz - s[o + 2];
  const a = 1;
  const b = ux * vx + uy * vy + uz * vz;
  const c = vx * vx + vy * vy + vz * vz;
  const d = ux * wx + uy * wy + uz * wz;
  const e = vx * wx + vy * wy + vz * wz;
  const den = a * c - b * b;
  let sc = den > 1e-9 ? (b * e - c * d) / den : 0;
  let tc = den > 1e-9 ? (a * e - b * d) / den : 0;
  if (sc < 0) {
    sc = 0;
    tc = e / c;
  }
  tc = clamp(tc, 0, 1);
  const dx = wx + sc * ux - tc * vx;
  const dy = wy + sc * uy - tc * vy;
  const dz = wz + sc * uz - tc * vz;
  return Math.hypot(dx, dy, dz);
}

// ---------------------------------------------------------------- light

interface Lit {
  t: number;
  open: number; // how far the light beyond is let in, 0..1
  a: number; // door angle
  xEdge: number; // where the door's free edge falls on the door plane, seen from the light
}

function moon(
  _L: Lit,
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
): number {
  const lam = -(nx * DX + ny * DY + nz * DZM);
  if (lam <= 0) return 0;
  const tt = (x + HW) / DX;
  if (tt <= 0.02) return 0;
  const wy = y - DY * tt;
  const wz = z - DZM * tt;
  const e = Math.min(wy - WY0, WY1 - wy, wz - WZ0, WZ1 - wz);
  if (e <= 0) return 0;
  let k = smooth(0, 0.05, e);
  k *= smooth(0.018, 0.04, Math.min(Math.abs(wz - MZ), Math.abs(wy - MY)));
  if (k <= 0) return 0;
  // branches (beyond the window) and the vase's flowers (in the room) in the way
  for (let i = 0; i < BR.length; i += 7) {
    const d = rayToSeg(x, y, z, BR, i);
    const r = BR[i + 6] * 1.6;
    if (d < r * 1.6) k *= smooth(r * 0.8, r * 1.6, d);
  }
  if (x > 0.3) {
    for (let i = 0; i < ST.length; i += 7) {
      const d = rayToSeg(x, y, z, ST, i);
      if (d < 0.03) k *= smooth(0.008, 0.03, d);
    }
    // the vase itself
    const vx = x - DX * ((x - VASE[0]) / DX);
    const vt = (x - VASE[0]) / DX;
    if (vt > 0) {
      const yy = y - DY * vt;
      const zz = z - DZM * vt;
      const r = Math.hypot(vx - VASE[0], zz - VASE[2]);
      if (yy > VASE[1] - 0.3 && yy < VASE[1] && r < 0.09) k *= 0.05;
    }
  }
  return 1.2 * k * lam ** 0.4;
}

function glow(L: Lit, x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
  const g = (1 - L.open) * (0.82 + 0.18 * noise(L.t * 2.1, 5));
  if (g <= 0.01) return 0;
  let v = 0;
  // under the door: a fan of light across the floor
  if (ny < -0.7 && z > DZ - 2.0 && z < DZ) {
    const dz = DZ - z;
    const w = 0.44 + dz * 0.42;
    let k = smooth(w, w - 0.1, Math.abs(x)) * (1 - dz / 2.0) ** 1.7;
    // something passes on the other side
    const sx = mix(-1.2, 1.2, smooth(5.3, 7.0, L.t));
    if (L.t > 5.2 && L.t < 7.2)
      k *= 1 - 0.9 * Math.exp(-(((x - sx * (1 + dz * 0.4)) / (0.16 + dz * 0.08)) ** 2));
    v += 0.95 * k;
  }
  // round the frame, on the end wall and the walls near it
  const dz = Math.abs(DZ - z);
  if (dz < 1.4) {
    const ex = Math.max(Math.abs(x) - DW / 2, 0);
    const ey = Math.max(-DH - y, y - 0, 0);
    const near = Math.abs(x) < DW / 2 && y > -DH;
    const de = near ? Math.min(DW / 2 - Math.abs(x), y + DH) : Math.hypot(ex, ey);
    v += 0.5 * Math.exp(-de / 0.18) * Math.exp(-dz / 0.5) * (near ? 0 : 1);
  }
  // a little everywhere toward the door
  const dd = Math.hypot(x, y + 1.06, z - DZ);
  const lam = Math.max(0, (nx * -x + ny * (-1.06 - y) + nz * (DZ - z)) / (dd || 1));
  v += 0.22 * Math.exp(-dd / 1.5) * (0.3 + 0.7 * lam);
  return g * v;
}

function beam(L: Lit, x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
  if (L.open <= 0.001 || z >= DZ) return 0;
  const s = (DZ - LZ) / (z - LZ);
  const qx = LX + (x - LX) * s;
  const qy = LY + (y - LY) * s;
  const inside =
    smooth(L.xEdge, L.xEdge + 0.05, qx) *
    smooth(DW / 2 + 0.01, DW / 2 - 0.04, qx) *
    smooth(-DH - 0.01, -DH + 0.05, qy) *
    smooth(0.05, -0.02, qy);
  if (inside <= 0) return 0;
  const vx = LX - x;
  const vy = LY - y;
  const vz = LZ - z;
  const vl = Math.hypot(vx, vy, vz);
  const lam = Math.max(0, (nx * vx + ny * vy + nz * vz) / vl);
  const dq = Math.hypot(x - qx, y - qy, z - DZ);
  return L.open * inside * (0.45 + 0.55 * lam) * (1.3 / (1 + 0.05 * dq * dq));
}

/** Light thrown about the hall from the open door: walls, ceiling, all of it, nearer brighter. */
function spill(
  L: Lit,
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
): number {
  if (L.open <= 0.001 || z > DZ + 0.02) return 0;
  const vx = 0.1 - x;
  const vy = -1.06 - y;
  const vz = DZ - z;
  const d = Math.hypot(vx, vy, vz);
  const lam = Math.max(0, (nx * vx + ny * vy + nz * vz) / d);
  return L.open * 0.95 * Math.exp(-d / 2.8) * (0.25 + 0.75 * lam);
}

function lightFor(L: Lit): Light {
  return (x, y, z, nx, ny, nz) =>
    clamp(
      moon(L, x, y, z, nx, ny, nz) +
        glow(L, x, y, z, nx, ny, nz) +
        beam(L, x, y, z, nx, ny, nz) +
        spill(L, x, y, z, nx, ny, nz),
      0,
      1,
    );
}

// ---------------------------------------------------------------- the scene

export function door(): Scene {
  return {
    t: 0,
    dur: 13.6,
    exit: [0.05, -0.12],
    still: 11.2,
    reset() {
      this.t = 0;
    },
    step(dt) {
      this.t += dt;
    },
    draw(sk) {
      draw(sk, this.t);
    },
  };
}

function draw(sk: Sketch, t: number) {
  const z = walk(t);
  // footsteps: a bob and a sway, gone when we stand still
  const sp = clamp((walk(t + 0.05) - walk(t - 0.05)) / 0.1 / 0.75, 0, 1);
  const ph = ((z - 0.2) / 0.72) * Math.PI;
  const bob = 0.02 * sp * (1 - Math.cos(2 * ph)) * 0.5;
  const sway = 0.014 * sp * Math.sin(ph);
  const look = 0.36 * smooth(1.6, 3.2, t) * (1 - smooth(4.3, 5.9, t));
  const yaw = -look + 0.03 * noise(t * 0.35, 7) + 0.004 * Math.sin(ph);
  const pitch =
    0.04 +
    0.13 * smooth(1.2, 2.6, t) * (1 - smooth(3.6, 5.4, t)) -
    0.05 * smooth(9.5, 12, t) +
    0.01 * noise(t * 0.5, 8);
  sk.eye(sway, -1.62 + bob, z, 1.15, yaw, pitch, 0.006 * Math.sin(ph) + 0.004 * noise(t * 0.3, 9));
  sk.depthRef = 2.2;

  const a = doorAngle(t);
  const ex = -DW / 2 + DW * Math.cos(a);
  const ez = DZ + DW * Math.sin(a);
  const s = (DZ - LZ) / (ez - LZ);
  const L: Lit = {
    t,
    open: smooth(0.02, 0.5, a),
    a,
    xEdge: a > 0.003 ? LX + (ex - LX) * s : DW / 2,
  };
  branches(t, BR);
  stems(t, ST);
  const light = lightFor(L);

  sk.group(1);
  beyond(sk, t, L);
  sk.group(10);
  reveal(sk, L);
  sk.group(2);
  doorSlab(sk, t, a, L, light);
  sk.group(3);
  endWall(sk, light);
  sk.group(4);
  outside(sk, t);
  sk.group(5);
  hall(sk, light);
  sk.group(6);
  windowFrame(sk, light);
  sk.group(7);
  table(sk, t, light);
  sk.group(8);
  dust(sk, t, L);
}

// ---------------------------------------------------------------- beyond the door

function beyond(sk: Sketch, t: number, L: Lit) {
  if (L.open <= 0.01) return;
  // the room beyond is all light: a far wall and a floor, drawn close and crossed, so the
  // opening reads bright; it breathes a little, as daylight does
  const glow = (x: number, y: number, z: number) =>
    0.9 + 0.08 * noise(x * 1.3 + y * 0.7 + t * 0.15, 61) - 0.05 * smooth(DZ + 0.5, DZ + 2.4, z);
  sk.surf(
    (u, v, o) => {
      o[0] = mix(-1.6, 1.6, u);
      o[1] = mix(-3.2, 0, v);
      o[2] = DZ + 2.2;
    },
    6,
    6,
    {
      light: (x, y, z) => glow(x, y, z),
      n: 150,
      dir: 1,
      cross: 1.1,
      dashes: 2,
      w: 0.9,
      floor: 0.1,
      ragged: 0.15,
      seed: 61,
    },
  );
  sk.surf(
    (u, v, o) => {
      o[0] = mix(-1.6, 1.6, u);
      o[1] = 0;
      o[2] = mix(DZ, DZ + 2.2, v);
    },
    6,
    8,
    {
      light: (x, y, z) => glow(x, y, z) - 0.06,
      n: 60,
      dashes: 0,
      w: 0.55,
      floor: 0.1,
      cross: 0.9,
      ragged: 0.2,
      seed: 62,
    },
  );
}

// ---------------------------------------------------------------- the door

function doorSlab(sk: Sketch, t: number, a: number, L: Lit, light: Light) {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  // a point on the door: u across from the hinge, y down, w toward us off its face
  const at = (u: number, y: number, w: number, o: number[]) => {
    o[0] = -DW / 2 + u * ca - w * sa;
    o[1] = y;
    o[2] = DZ + u * sa - w * ca;
  };
  // its face
  const dim: Light = (x, y, z, nx, ny, nz) => 0.18 + 0.6 * light(x, y, z, nx, ny, nz);
  sk.surf((u, v, o) => at(u * DW, mix(-DH, 0, v), 0.0, o), 6, 10, {
    fill: true,
    light: dim,
    n: 16,
    dashes: 7,
    w: 0.55,
    floor: 0.12,
    edge: 1.3,
    seed: 3,
  });
  // its panels: two tall, two short, each a recessed frame
  const panel = (u0: number, u1: number, y0: number, y1: number) => {
    for (const inset of [0, 0.025]) {
      at(u0 + inset, y0 + inset, 0.01, P);
      sk.m3(P[0], P[1], P[2]);
      at(u1 - inset, y0 + inset, 0.01, P);
      sk.l3(P[0], P[1], P[2]);
      at(u1 - inset, y1 - inset, 0.01, P);
      sk.l3(P[0], P[1], P[2]);
      at(u0 + inset, y1 - inset, 0.01, P);
      sk.l3(P[0], P[1], P[2]);
      at(u0 + inset, y0 + inset, 0.01, P);
      sk.l3(P[0], P[1], P[2]);
      sk.s3(inset ? 0.5 : 0.8, 0.08, 0.5, inset ? 0.5 : 0.8, 1);
    }
  };
  panel(0.12, 0.43, -1.95, -1.25);
  panel(0.49, 0.8, -1.95, -1.25);
  panel(0.12, 0.43, -1.1, -0.15);
  panel(0.49, 0.8, -1.1, -0.15);
  // its free edge, once it turns
  if (a > 0.02) {
    at(DW, -DH, 0, P);
    at(DW, -DH, -0.045, Q);
    sk.m3(P[0], P[1], P[2]).l3(Q[0], Q[1], Q[2]);
    at(DW, 0, -0.045, Q);
    sk.l3(Q[0], Q[1], Q[2]);
    at(DW, 0, 0, Q);
    sk.l3(Q[0], Q[1], Q[2]).fill3();
    at(DW, -DH, -0.045, P);
    at(DW, 0, -0.045, Q);
    sk.line3(P[0], P[1], P[2], Q[0], Q[1], Q[2], 1.4);
  }
  // the knob and the keyhole, which glows while the door is shut
  const kn = [0, 0, 0];
  at(DW - 0.085, -0.98, 0.06, kn);
  const c = [0, 0, 0];
  if (sk.p3(kn[0], kn[1], kn[2], c)) {
    const r = (0.034 * sk.foc) / c[2];
    const turn = smooth(9.0, 9.35, t) * 0.9;
    sk.blot(c[0], c[1], r);
    sk.arc(c[0], c[1], r, r, -2.2 + turn, -2.2 + turn + TAU + 0.3).s(1.2, 0.1, 0.4);
    sk.arc(c[0] - r * 0.15, c[1] - r * 0.2, r * 0.5, r * 0.45, Math.PI * 1.1, Math.PI * 1.7).s(
      0.7,
      0.2,
      0.2,
    );
  }
  at(DW - 0.085, -0.86, 0.005, kn);
  if (L.open < 0.5 && sk.p3(kn[0], kn[1], kn[2], c)) {
    const r = (0.012 * sk.foc) / c[2];
    sk.m(c[0] - r * 0.5, c[1] - r)
      .l(c[0] + r * 0.5, c[1] - r)
      .l(c[0] + r * 0.3, c[1] + r * 1.4)
      .l(c[0] - r * 0.3, c[1] + r * 1.4)
      .solid();
  }
  // light at the cracks while it is shut: a bright slit along the top and the latch side,
  // and under it
  if (L.open < 0.6) {
    const g = (1 - L.open / 0.6) * (0.85 + 0.15 * noise(t * 2.1, 5));
    const slit = (x0: number, y0: number, x1: number, y1: number, th: number) => {
      sk.m3(x0, y0, DZ + 0.004)
        .l3(x1, y1, DZ + 0.004)
        .l3(x1 + (y0 === y1 ? 0 : th), y1 + (y0 === y1 ? th : 0), DZ + 0.004)
        .l3(x0 + (y0 === y1 ? 0 : th), y0 + (y0 === y1 ? th : 0), DZ + 0.004);
      sk.fill3(INKFILL);
    };
    const th = 0.009 * g;
    slit(-DW / 2, -DH - th, DW / 2, -DH - th, th);
    slit(DW / 2 + 0.002 + a * 0.6, -DH, DW / 2 + 0.002 + a * 0.6, 0, th + a * 0.5);
    const under = (0.016 + 0.01 * noise(t * 3, 6)) * g;
    slit(-DW / 2, -under * 0.2, DW / 2, -under * 0.2, under);
  }
}

/** The wall's thickness inside the opening: the jambs and the head, lit from the room beyond
 *  once the door is open (and hidden behind the door until then). */
const REVEAL = 0.14;
function reveal(sk: Sketch, L: Lit) {
  if (L.open <= 0.01) return;
  const lit: Light = (x, y, z, nx, ny, nz) => {
    const vx = LX - x;
    const vy = LY - y;
    const vz = LZ - z;
    const d = Math.hypot(vx, vy, vz);
    return L.open * (0.35 + 0.6 * Math.max(0, (nx * vx + ny * vy + nz * vz) / d));
  };
  const st = { fill: true, light: lit, w: 0.6, floor: 0.12, edge: 0.9, seed: 15 };
  for (const side of [-1, 1]) {
    const x = (side * DW) / 2;
    sk.group(10 + (side + 1) / 2);
    sk.surf(
      (u, v, o) => {
        o[0] = x;
        o[1] = mix(-DH, 0, v);
        o[2] = DZ + u * REVEAL;
      },
      2,
      8,
      { ...st, n: 4, dir: 1, dashes: 6, edges: 2 },
    );
  }
  sk.group(12);
  sk.surf(
    (u, v, o) => {
      o[0] = mix(-DW / 2, DW / 2, u);
      o[1] = -DH;
      o[2] = DZ + v * REVEAL;
    },
    6,
    2,
    { ...st, n: 14, dir: 0, dashes: 0, edges: 8 },
  );
}

function endWall(sk: Sketch, light: Light) {
  const st = { fill: true, light, dashes: 9, w: 0.6, floor: 0.16, exact: false, seed: 11 };
  const wall = (x0: number, x1: number, y0: number, y1: number, n: number, seed: number) =>
    sk.surf(
      (u, v, o) => {
        o[0] = mix(x0, x1, u);
        o[1] = mix(y0, y1, v);
        o[2] = DZ;
      },
      4,
      10,
      { ...st, n, seed },
    );
  // solid right up to the opening, so nothing beyond shows except through it
  wall(-HW, -DW / 2, CEIL, 0, 14, 12);
  wall(DW / 2, HW, CEIL, 0, 14, 13);
  wall(-DW / 2, DW / 2, CEIL, -DH, 24, 14);
  // the casing: a moulding standing a little proud of the wall round the opening, solid,
  // lit by what comes through and spills from it
  const C = 0.09;
  const band = (
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    n: number,
    dir: 0 | 1,
    seed: number,
  ) =>
    sk.surf(
      (u, v, o) => {
        o[0] = mix(x0, x1, u);
        o[1] = mix(y0, y1, v);
        o[2] = DZ - 0.02;
      },
      dir ? 2 : 1,
      dir ? 1 : 8,
      { fill: true, light, n, dir, dashes: dir ? 0 : 5, w: 0.55, floor: 0.2, seed },
    );
  sk.group(16);
  band(-DW / 2 - C, -DW / 2, -DH - C, 0, 3, 0, 16);
  sk.group(17);
  band(DW / 2, DW / 2 + C, -DH - C, 0, 3, 0, 17);
  sk.group(18);
  band(-DW / 2 - C, DW / 2 + C, -DH - C, -DH, 3, 1, 18);
  sk.group(19);
  for (const k of [0, C]) {
    sk.m3(-DW / 2 - k, 0, DZ - 0.02)
      .l3(-DW / 2 - k, -DH - k, DZ - 0.02)
      .l3(DW / 2 + k, -DH - k, DZ - 0.02)
      .l3(DW / 2 + k, 0, DZ - 0.02);
    sk.s3(k ? 0.9 : 1.3, 0.05, 0.5, k ? 0.9 : 1.3, 1);
  }
}

// ---------------------------------------------------------------- the hall

/** A 3D polyline inked only where light reaches it, heavier where there is more. */
function litLine(
  sk: Sketch,
  light: Light,
  pts: number[],
  nx: number,
  ny: number,
  nz: number,
  w: number,
  k = 24,
) {
  let open = false;
  const n = pts.length / 3;
  for (let seg = 0; seg < n - 1; seg++) {
    for (let i = seg ? 1 : 0; i <= k; i++) {
      const s = i / k;
      const x = mix(pts[seg * 3], pts[seg * 3 + 3], s);
      const y = mix(pts[seg * 3 + 1], pts[seg * 3 + 4], s);
      const z = mix(pts[seg * 3 + 2], pts[seg * 3 + 5], s);
      const l = light(x, y, z, nx, ny, nz);
      if (l > 0.1) {
        if (!open) {
          sk.m3(x, y, z);
          open = true;
        } else sk.l3(x, y, z, 0.5 + l);
      } else if (open) {
        if (sk.count3 > 1) sk.s3(w, 0.3, 0.6);
        open = false;
      }
    }
  }
  if (open && sk.count3 > 1) sk.s3(w, 0.3, 0.6);
}

function hall(sk: Sketch, light: Light) {
  const Z0 = -0.6;
  // the floor: boards running down the hall
  sk.surf(
    (u, v, o) => {
      o[0] = mix(-HW, HW, u);
      o[1] = 0;
      o[2] = mix(Z0, DZ, v);
    },
    14,
    44,
    {
      light,
      n: 70,
      dashes: 5,
      w: 0.75,
      floor: 0.16,
      cross: 0.97,
      exact: true,
      ragged: 0.6,
      seed: 21,
    },
  );
  // ceiling
  sk.surf(
    (u, v, o) => {
      o[0] = mix(-HW, HW, u);
      o[1] = CEIL;
      o[2] = mix(Z0, DZ, v);
    },
    6,
    24,
    { light, n: 30, dashes: 14, w: 0.55, floor: 0.18, seed: 22 },
  );
  // walls: strands up and down; the left one around the window
  const wall = (
    x: number,
    z0: number,
    z1: number,
    y0: number,
    y1: number,
    n: number,
    seed: number,
  ) =>
    sk.surf(
      (u, v, o) => {
        o[0] = x;
        o[1] = mix(y0, y1, v);
        o[2] = mix(z0, z1, u);
      },
      Math.max(2, Math.round((z1 - z0) * 6)),
      12,
      {
        fill: x < 0,
        light,
        n,
        dashes: 2,
        w: 0.6,
        floor: 0.16,
        exact: true,
        cross: 0.82,
        ragged: 0.5,
        seed,
      },
    );
  wall(HW, Z0, DZ, CEIL, 0, 150, 31);
  wall(-HW, Z0, WZ0, CEIL, 0, 64, 32);
  wall(-HW, WZ1, DZ, CEIL, 0, 60, 33);
  wall(-HW, WZ0, WZ1, CEIL, WY0, 26, 34);
  wall(-HW, WZ0, WZ1, WY1, 0, 26, 35);
  // the hall's edges, its rail and skirting, its panels: drawn only where light finds them
  for (const side of [-1, 1]) {
    const x = side * HW;
    const nx = -side;
    litLine(sk, light, [x, 0, Z0, x, 0, DZ], nx * 0.5, -0.5, 0, 1.2);
    litLine(sk, light, [x, CEIL, Z0, x, CEIL, DZ], nx * 0.5, 0.5, 0, 1);
    litLine(sk, light, [x, -0.92, Z0, x, -0.92, side < 0 ? WZ0 - 0.1 : DZ], nx, 0, 0, 1);
    litLine(sk, light, [x, -0.14, Z0, x, -0.14, DZ], nx, 0, 0, 0.8);
    if (side < 0) litLine(sk, light, [x, -0.92, WZ1 + 0.1, x, -0.92, DZ], nx, 0, 0, 1);
    for (let z = 0.2; z < DZ - 0.5; z += 1.15) {
      if (side < 0 && z + 0.95 > WZ0 - 0.1 && z < WZ1 + 0.1) continue;
      litLine(
        sk,
        light,
        [x, -0.8, z, x, -0.28, z, x, -0.28, z + 0.95, x, -0.8, z + 0.95, x, -0.8, z],
        nx,
        0,
        0,
        0.7,
        10,
      );
    }
  }
}

function outside(sk: Sketch, t: number) {
  // the night sky beyond the window, pale with moonlight: long level strokes
  const sx = -HW - 2.5;
  sk.surf(
    (u, v, o) => {
      o[0] = sx;
      o[1] = mix(-4.5, 1.2, v);
      o[2] = mix(0.5, 6, u);
    },
    6,
    8,
    {
      dir: 1,
      n: 40,
      dashes: 5,
      w: 0.5,
      floor: 0.1,
      ragged: 0.6,
      light: (_x, y, z) => 0.55 + 0.25 * Math.sin(y * 1.3 + z * 0.4) - 0.2 * smooth(-1.5, 0.5, y),
      seed: 51,
    },
  );
  // branches, black against it, a thin edge of moonlight along their tops
  const a = [0, 0, 0];
  const b = [0, 0, 0];
  for (let i = 0; i < BR.length; i += 7) {
    if (!sk.p3(BR[i], BR[i + 1], BR[i + 2], a) || !sk.p3(BR[i + 3], BR[i + 4], BR[i + 5], b))
      continue;
    const r0 = ((BR[i + 6] * 2 * sk.foc) / a[2]) * sk.px;
    const r1 = ((BR[i + 6] * 1.4 * sk.foc) / b[2]) * sk.px;
    sk.m(a[0], a[1])
      .l(mix(a[0], b[0], 0.5) + 0.004, mix(a[1], b[1], 0.5))
      .l(b[0], b[1])
      .e(Math.max(2.5, (r0 + r1) * 0.5 + 3));
    sk.m(a[0], a[1] - (r0 * 0.5) / sk.px)
      .l(b[0], b[1] - (r1 * 0.5) / sk.px)
      .s(0.6, 0.2, 0.4);
  }
  void t;
}

function windowFrame(sk: Sketch, light: Light) {
  const x = -HW + 0.005;
  // casing and sill
  for (const k of [0, 0.07]) {
    sk.m3(x, WY1 + k, WZ0 - k)
      .l3(x, WY0 - k, WZ0 - k)
      .l3(x, WY0 - k, WZ1 + k)
      .l3(x, WY1 + k, WZ1 + k)
      .l3(x, WY1 + k, WZ0 - k);
    sk.s3(k ? 0.8 : 1.3, 0.05, 0.5, k ? 0.8 : 1.3, 1);
  }
  sk.line3(x + 0.12, WY1 + 0.02, WZ0 - 0.12, x + 0.12, WY1 + 0.02, WZ1 + 0.12, 1.1);
  sk.line3(x, WY1 + 0.02, WZ0 - 0.12, x + 0.12, WY1 + 0.02, WZ0 - 0.12, 0.8);
  sk.line3(x, WY1 + 0.02, WZ1 + 0.12, x + 0.12, WY1 + 0.02, WZ1 + 0.12, 0.8);
  // the glazing bars: solid, so the sky stops at them
  const bar = (y0: number, z0: number, y1: number, z1: number) => {
    const h = 0.018;
    if (y0 === y1)
      sk.m3(x, y0 - h, z0)
        .l3(x, y0 - h, z1)
        .l3(x, y0 + h, z1)
        .l3(x, y0 + h, z0)
        .fill3();
    else
      sk.m3(x, y0, z0 - h)
        .l3(x, y1, z0 - h)
        .l3(x, y1, z0 + h)
        .l3(x, y0, z0 + h)
        .fill3();
    sk.line3(x, y0, z0, x, y1, z1, 0.9);
  };
  bar(MY, WZ0, MY, WZ1);
  bar(WY0, MZ, WY1, MZ);
  // the sill catches the moon
  litLine(
    sk,
    light,
    [x + 0.12, WY1 + 0.02, WZ0 - 0.1, x + 0.12, WY1 + 0.02, WZ1 + 0.1],
    0,
    -1,
    0,
    1,
  );
}

function table(sk: Sketch, t: number, light: Light) {
  // a narrow table against the right wall, in the moonlight, and a vase of dried flowers
  const x0 = HW - 0.32;
  const top = -0.82;
  const z0 = 3.95;
  const z1 = 4.65;
  for (const [lx, lz] of [
    [x0 + 0.03, z0 + 0.04],
    [x0 + 0.03, z1 - 0.04],
  ]) {
    sk.m3(lx, top + 0.04, lz)
      .l3(lx + 0.01, 0, lz)
      .s3(1.1, 0.05, 0.5);
  }
  sk.surf(
    (u, v, o) => {
      o[0] = mix(x0, HW, u);
      o[1] = top;
      o[2] = mix(z0, z1, v);
    },
    3,
    6,
    { fill: true, light, n: 7, w: 0.6, edge: 1.2, edges: 1 | 4 | 8, exact: true, seed: 41 },
  );
  sk.m3(x0, top, z0)
    .l3(x0, top + 0.05, z0)
    .l3(x0, top + 0.05, z1)
    .l3(x0, top, z1)
    .fill3();
  sk.line3(x0, top + 0.05, z0, x0, top + 0.05, z1, 1);
  // the vase: a surface of revolution
  const prof = (v: number) => 0.035 + 0.055 * Math.sin(Math.PI * clamp(v * 1.15, 0, 1)) ** 0.8;
  sk.surf(
    (u, v, o) => {
      const a = Math.PI * 0.5 + u * Math.PI;
      const r = prof(v);
      o[0] = VASE[0] + Math.cos(a) * r;
      o[1] = VASE[1] - 0.28 * (1 - v);
      o[2] = VASE[2] + Math.sin(a) * r;
    },
    10,
    8,
    { fill: true, light, n: 12, dir: 1, w: 0.6, edge: 1.2, edges: 1 | 2, exact: true, seed: 42 },
  );
  // stems and seed heads
  for (let i = 0; i < ST.length; i += 7) {
    const k = i / 7;
    sk.m3(ST[i], ST[i + 1], ST[i + 2]);
    sk.l3(
      mix(ST[i], ST[i + 3], 0.5) + 0.01 * Math.sin(k),
      mix(ST[i + 1], ST[i + 4], 0.5),
      mix(ST[i + 2], ST[i + 5], 0.5),
    );
    sk.l3(ST[i + 3], ST[i + 4], ST[i + 5]).s3(0.8, 0.1, 0.4);
    const c = [0, 0, 0];
    if (sk.p3(ST[i + 3], ST[i + 4], ST[i + 5], c)) {
      const r = (0.025 * sk.foc) / c[2];
      for (let j = 0; j < 7; j++) {
        const a = (j / 7) * TAU + k + Math.sin(t * 0.7) * 0.1;
        sk.line(
          c[0],
          c[1],
          c[0] + Math.cos(a) * r,
          c[1] + Math.sin(a) * r * 1.2 - r * 0.3,
          0.55,
          0.3,
          0.1,
        );
      }
    }
  }
}

function dust(sk: Sketch, t: number, L: Lit) {
  if (L.open <= 0.05) return;
  const c = [0, 0, 0];
  for (let i = 0; i < 70; i++) {
    const x = (hash(i, 1) - 0.5) * 1.6 + 0.08 * noise(t * 0.15 + i, 1);
    const y = -0.1 - hash(i, 2) * 2.3 + 0.1 * noise(t * 0.1 + i, 2) - t * 0.01 * hash(i, 5);
    const z = DZ - 0.3 - hash(i, 3) * 3.2 + 0.08 * noise(t * 0.12 + i, 3);
    const lit = beam(L, x, y, z, 0, 0, -1);
    if (lit < 0.3) continue;
    if (!sk.p3(x, y, z, c)) continue;
    const r = Math.max(0.003, (0.006 * sk.foc) / c[2]);
    const tw = Math.floor(t * 10 + i * 3) % 4;
    if (tw === 0) sk.line(c[0] - r, c[1], c[0] + r, c[1], 0.9, 0, 0.2);
    else sk.dot(c[0], c[1], r * 0.5);
  }
}
