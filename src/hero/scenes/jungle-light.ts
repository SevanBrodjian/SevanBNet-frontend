// The jungle's light. One sun, high and to our upper left, coming down through a canopy that is
// closed except for holes: a great opening over the heart of the clearing, smaller ones about
// it, and flecks everywhere. Each hole lets down a column of sun, so the pools on the ground,
// the dapples on the plants and the shafts we see in the air all come from the same openings.
// The canopy moves a little in the wind, and the light moves with it. The giant cap at the
// heart shades the ground under it; the sunlit floor throws a warm light back up.
//
// Ink is light: these functions say how much light falls on a point, and the drawing hatches
// it in proportion; where they say nothing, the paper stays black.

import { clamp, hash, type Light, noise, smooth } from "../sketch";

/** The way the sun's light travels (down, to the right, and away from us: it is behind us). */
const SL = Math.hypot(0.36, 0.78, 0.5);
export const DX = 0.36 / SL;
export const DY = 0.78 / SL;
export const DZ = 0.5 / SL;
export const SUN: [number, number, number] = [DX, DY, DZ];

/** The heart of the clearing (on the ground), and the giant cap there. */
export const HX = -0.45;
export const HZ = 10.6;
export const GX = -0.6;
export const GZ = 11.2;
/** Height of the giant cap's rim, and its radius. */
export const GH = 3.7;
export const GR = 1.75;

/** Holes in the canopy, by where their light lands on the ground: x, z, radius. */
export const HOLES: [number, number, number][] = [
  [HX + 0.3, HZ + 0.6, 4.5],
  // over the fiddleheads and pods on the left
  [-1.6, 8.2, 0.85],
  // the fan on the right
  [3.0, 6.2, 0.62],
  // the grazer's back and head
  [5.5, 11.9, 2.3],
  [1.15, 4.3, 0.42],
  [-0.9, 3.0, 0.36],
  [-3.7, 9.6, 0.55],
  // the far side of the clearing, open to the sun
  [-0.3, 21.0, 5.0],
  [-4.6, 12.6, 0.7],
  // dapples on the way into the clearing
  [0.35, 5.2, 0.32],
  [-0.55, 5.9, 0.26],
  [0.95, 6.1, 0.22],
  [-1.3, 4.8, 0.24],
  [0.0, 4.4, 0.2],
  // on the leaves round us at the start
  [0.45, 1.25, 0.32],
  [-0.05, 1.6, 0.34],
  [1.55, 1.45, 0.3],
  [-0.45, 2.0, 0.26],
  [2.0, 1.9, 0.3],
];

/** The holes whose shafts we see in the air. */
export const SHAFTS = [0, 4];

/** Light up a stalk from the sunlit floor about it (strongest low down, on the side toward us). */
export const fromFloor = (
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
): number => {
  const f = smooth(-2.6, -0.1, y);
  return clamp(sun(x, y, z, nx, ny, nz) + 0.75 * f * (0.4 + 0.6 * Math.max(0, -nz)), 0, 1);
};

/** Small caps that also shade: x, z, height of the rim, radius. */
export const CAPS: [number, number, number, number][] = [
  [GX + 0.25, GZ, GH, GR],
  [GX + 1.55 - 0.15, GZ - 0.9, 2.15, 0.8],
  [GX - 1.3 + 0.1, GZ - 0.7, 1.15, 0.55],
];

let SX = 0;
let SZ = 0;

/** Set the time: the canopy sways. */
let T = 0;
let FSX = 0;
export function setTime(t: number) {
  T = t;
  FSX = 0.04 * Math.sin(T * 0.6) + 0.02 * Math.sin(T * 1.7 + 1);
  SX = 0.09 * Math.sin(t * 0.37) + 0.035 * Math.sin(t * 0.91 + 1);
  SZ = 0.06 * Math.sin(t * 0.29 + 2) + 0.02 * Math.sin(t * 1.13);
}

/** How open the canopy is above ground point (gx, gz), worked out exactly. */
function openRaw(gx: number, gz: number): number {
  let o = 0;
  for (let i = 0; i < HOLES.length; i++) {
    const H = HOLES[i];
    const dx = gx - H[0];
    const dz = gz - H[1];
    const r = H[2];
    const d2 = dx * dx + dz * dz;
    const R = r * 1.35;
    if (d2 > R * R) continue;
    const d = Math.sqrt(d2);
    const an = Math.atan2(dz, dx);
    const rag = r * (1 + 0.14 * noise(an * 1.9 + i * 3, 5) + 0.07 * noise(an * 5.3 + i, 6));
    const e = 0.12 + r * 0.08;
    const v = smooth(rag + e, rag - e, d);
    if (v > o) o = v;
  }
  if (o > 0.95) return o;
  // flecks: one small hole in some cells of a grid
  const C = 0.72;
  const cx = Math.floor(gx / C);
  const cz = Math.floor(gz / C);
  const hh = hash(cx * 73 + 11, cz);
  if (hh < 0.36) {
    const fx = (cx + 0.25 + 0.5 * hash(cx, cz + 77)) * C;
    const fz = (cz + 0.25 + 0.5 * hash(cx + 31, cz)) * C;
    const fr = 0.07 + 0.16 * hash(cz, cx + 5);
    const d = Math.hypot(gx - fx, gz - fz);
    const v = 0.85 * smooth(fr + 0.05, fr - 0.05, d);
    if (v > o) o = v;
  }
  return o;
}

// the same, kept on a grid filled in as it is asked for
const G0X = -11;
const G0Z = -3;
const GS = 0.06;
const GW = 440;
const GHt = 560;
const GRID = new Float32Array(GW * GHt).fill(-1);

function node(k: number): number {
  let v = GRID[k];
  if (v < 0) {
    const i = k % GW;
    const j = (k - i) / GW;
    v = openRaw(G0X + i * GS, G0Z + j * GS);
    GRID[k] = v;
  }
  return v;
}

/** How open the way to the sun is from (x, y, z): 0 shade, 1 full sun. */
export function open(x: number, y: number, z: number): number {
  // where the point's column of sun meets the ground
  const h = -y / DY;
  const fx = (x + DX * h - SX - G0X) / GS;
  const fz = (z + DZ * h - SZ - G0Z) / GS;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= GW - 1 || j >= GHt - 1) return 0;
  const a = fx - i;
  const b = fz - j;
  const k = j * GW + i;
  let v0 = GRID[k];
  let v1 = GRID[k + 1];
  let v2 = GRID[k + GW];
  let v3 = GRID[k + GW + 1];
  if (v0 < 0) v0 = node(k);
  if (v1 < 0) v1 = node(k + 1);
  if (v2 < 0) v2 = node(k + GW);
  if (v3 < 0) v3 = node(k + GW + 1);
  return (v0 + (v1 - v0) * a) * (1 - b) + (v2 + (v3 - v2) * a) * b;
}

/** Shade from the caps (1 lit, 0 in a cap's shadow). */
export function capShade(x: number, y: number, z: number): number {
  // nowhere near the caps' shadows
  if (z < 7.5 || x < -4 || x > 4.5) return 1;
  let s = 1;
  for (let i = 0; i < CAPS.length; i++) {
    const c = CAPS[i];
    const top = -c[2] - 0.25;
    if (y <= top) continue;
    const k = (y - top) / DY;
    const px = x - DX * k - c[0];
    const pz = z - DZ * k - c[1];
    s = Math.min(s, smooth(c[3] * 0.82, c[3] * 1.04, Math.sqrt(px * px + pz * pz)));
  }
  return s;
}

/** The sunlit floor throws light back onto what faces it. */
export function bounce(
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
): number {
  const dx = HX - x;
  const dy = -0.4 - y;
  const dz = HZ - z;
  const d = Math.hypot(dx, dy, dz) || 1;
  const f = (nx * dx + ny * dy + nz * dz) / d;
  if (f <= 0) return 0;
  return 0.85 * f * Math.exp(-d / 7.5);
}

const lam = (nx: number, ny: number, nz: number) => Math.max(0, -(nx * DX + ny * DY + nz * DZ));

/** Sun on a surface, and the clearing's light. */
export const sun: Light = (x, y, z, nx, ny, nz) => {
  const l = lam(nx, ny, nz);
  const s = l > 0.01 ? 1.3 * l * open(x, y, z) * capShade(x, y, z) : 0;
  return clamp(s + bounce(x, y, z, nx, ny, nz), 0, 1);
};

/** Sun on the ground. */
export const groundLight = (x: number, z: number): number =>
  clamp(1.05 * open(x, 0, z) * capShade(x, 0, z), 0, 1);

/** Flecks of sun on the leaves round us at the start: x, y, z, radius. */
const FLECKS: [number, number, number, number][] = [
  [-0.5, -1.95, 1.0, 0.34],
  [0.52, -1.9, 1.1, 0.3],
  [0.42, -0.8, 1.0, 0.3],
  [-0.62, -1.25, 1.25, 0.26],
  [0.1, -2.35, 1.45, 0.22],
  [-0.35, -0.75, 1.1, 0.2],
  [0.95, -1.2, 1.35, 0.22],
];

function fleck(x: number, y: number, z: number): number {
  let o = 0;
  for (let i = 0; i < FLECKS.length; i++) {
    const F = FLECKS[i];
    const R = F[3] * 1.4;
    const dx = x - F[0] - FSX;
    if (dx > R || dx < -R) continue;
    const dy = y - F[1];
    if (dy > R || dy < -R) continue;
    const dz = (z - F[2]) * 0.5;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > R * R) continue;
    const d = Math.sqrt(d2);
    const an = Math.atan2(dy, dx);
    const r = F[3] * (1 + 0.18 * noise(an * 1.6 + i * 2, 13) + 0.08 * noise(an * 4.3 + i, 14));
    const v = smooth(r, r * 0.6, d);
    if (v > o) o = v;
  }
  return 0.95 * o;
}

/** Through a leaf: sun from either side where it comes in, and the clearing's glow. */
export const leafLight: Light = (x, y, z, nx, ny, nz) => {
  const tr = Math.abs(nx * DX + ny * DY + nz * DZ);
  let o = open(x, y, z);
  // round us at the start, the sun comes through the leaves above in flecks
  if (z < 2.4 && o < 0.9) o = Math.max(o, fleck(x, y, z));
  const dx = HX - x;
  const dz = HZ - z;
  const g = 0.3 * Math.exp(-Math.hypot(dx, dz) / 6.5);
  return clamp(o * (0.35 + 0.85 * tr) * capShade(x, y, z) + g, 0, 1);
};

/** Under the giant cap: lit from below by the sunlit floor. */
export const under: Light = (x, _y, z) => {
  const dx = x - GX;
  const dz = z - GZ;
  const r = Math.hypot(dx, dz) / GR;
  return clamp(0.35 + 0.65 * smooth(0.25, 1.05, r), 0, 1);
};
