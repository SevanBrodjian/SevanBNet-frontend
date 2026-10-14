// The jungle's plants, each drawn as ink draws it: solid (it clears what is behind it), hatched
// along its own form where the sun reaches it, outlined heavier on its shadow side. A tube (a
// stalk, a coil, a neck) is projected and drawn on the view, so its hatching runs across it
// like rings of light; caps, fans and pods are built in the world.
//
// Ids: every function counts its stroke ids from the id the caller set (sk.group), so what the
// light lets through on one frame never re-boils what follows.

import { clamp, hash, type Light, mix, noise, type Sketch, smooth, TAU } from "../sketch";
import { revolve, vdc } from "./jungle-kit";
import { bounce, capShade, DX, DY, DZ, fromFloor, open, sun } from "./jungle-light";

/** Line weight for something at camera depth z (as 3D strokes are weighted). */
export function dw(sk: Sketch, z: number): number {
  return clamp((sk.depthRef / Math.max(0.1, z)) ** sk.depthW, 0.3, 2.4);
}

// ---------------------------------------------------------------- tube

const MAXT = 72;
const PX = new Float32Array(MAXT);
const PY = new Float32Array(MAXT);
const PZ = new Float32Array(MAXT);
const PR = new Float32Array(MAXT);
const NX = new Float32Array(MAXT);
const NY = new Float32Array(MAXT);
const LT = new Float32Array(MAXT);
const SD = new Int8Array(MAXT);
const Q = [0, 0, 0];

export interface TubeStyle {
  /** Outline weight. */
  edge?: number;
  /** Hatch: how many across-strokes per point where fully lit (0..2). */
  hatch?: number;
  /** Below this light, no hatching. */
  floor?: number;
  light?: Light;
  /** Round off the far end. */
  capEnd?: boolean;
  /** Draw rings across it every k points (where lit). */
  rings?: number;
  /** Little hairs off its outer side, from this fraction along. */
  hairs?: number;
  seed?: number;
  /** Outline only from this fraction (a tube rising out of something). */
  from?: number;
  /** Strands along it on its lit side, broken into dashes. */
  along?: number;
}

/**
 * A tube through n spine points S (x, y, z, r, ...), drawn on the view. Returns false if it
 * is not on the view. Ids from sk.id to sk.id + 600.
 */
export function tube(sk: Sketch, S: ArrayLike<number>, n: number, st: TubeStyle = {}): boolean {
  const base = sk.id;
  sk.id = base + 600;
  n = Math.min(n, MAXT);
  const light = st.light ?? sun;
  let m = 0;
  let zs = 0;
  // project; stop where it goes behind us
  for (let i = 0; i < n; i++) {
    if (!sk.p3(S[i * 4], S[i * 4 + 1], S[i * 4 + 2], Q)) break;
    PX[m] = Q[0];
    PY[m] = Q[1];
    PZ[m] = Q[2];
    PR[m] = (S[i * 4 + 3] * sk.foc) / Q[2];
    zs += Q[2];
    m++;
  }
  if (m < 2) return false;
  let x0 = 1e9;
  let x1 = -1e9;
  let y0 = 1e9;
  let y1 = -1e9;
  for (let i = 0; i < m; i++) {
    x0 = Math.min(x0, PX[i] - PR[i]);
    x1 = Math.max(x1, PX[i] + PR[i]);
    y0 = Math.min(y0, PY[i] - PR[i]);
    y1 = Math.max(y1, PY[i] + PR[i]);
  }
  if (x1 < -sk.A - 0.1 || x0 > sk.A + 0.1 || y1 < -1.1 || y0 > 1.1) return false;
  const wd = dw(sk, zs / m);
  // normals on the view, the light on each section and which side of it is lit
  for (let i = 0; i < m; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(m - 1, i + 1);
    let tx = PX[b] - PX[a];
    let ty = PY[b] - PY[a];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    NX[i] = -ty;
    NY[i] = tx;
    if (i % 2 === 0 || i === m - 1) {
      // the side of the section that faces the sun
      let ax = S[b * 4] - S[a * 4];
      let ay = S[b * 4 + 1] - S[a * 4 + 1];
      let az = S[b * 4 + 2] - S[a * 4 + 2];
      const al = Math.hypot(ax, ay, az) || 1;
      ax /= al;
      ay /= al;
      az /= al;
      const d = -(DX * ax + DY * ay + DZ * az);
      let lx = -DX - d * ax;
      let ly = -DY - d * ay;
      let lz = -DZ - d * az;
      const ll = Math.hypot(lx, ly, lz) || 1;
      lx /= ll;
      ly /= ll;
      lz /= ll;
      const r = S[i * 4 + 3];
      const px = S[i * 4] + lx * r;
      const py = S[i * 4 + 1] + ly * r;
      const pz = S[i * 4 + 2] + lz * r;
      LT[i] = clamp(light(px, py, pz, lx, ly, lz), 0, 1);
      // which side of the drawn tube that is
      let sd = 1;
      if (sk.p3(px, py, pz, Q)) sd = (Q[0] - PX[i]) * NX[i] + (Q[1] - PY[i]) * NY[i] >= 0 ? 1 : -1;
      SD[i] = sd;
    } else {
      LT[i] = LT[i - 1];
      SD[i] = SD[i - 1];
    }
  }
  for (let i = 1; i < m - 1; i += 2) {
    LT[i] = (LT[i - 1] + LT[i + 1]) * 0.5;
  }
  // clear
  const g = 0.7 / sk.px;
  sk.id = base;
  sk.m(PX[0] + NX[0] * (PR[0] + g), PY[0] + NY[0] * (PR[0] + g));
  for (let i = 1; i < m; i++) sk.l(PX[i] + NX[i] * (PR[i] + g), PY[i] + NY[i] * (PR[i] + g));
  for (let i = m - 1; i >= 0; i--) sk.l(PX[i] - NX[i] * (PR[i] + g), PY[i] - NY[i] * (PR[i] + g));
  sk.band();
  const e = m - 1;
  if (st.capEnd) {
    sk.id = base + 1;
    sk.blot(PX[e], PY[e], PR[e] + g);
  }
  const seed = st.seed ?? 0;
  const floor = st.floor ?? 0.12;
  const hd = st.hatch ?? 1;
  const amp0 = sk.amp;
  // across-strokes on the lit side, like rings of light
  sk.amp = 0.5;
  const iFrom = Math.floor((st.from ?? 0) * (m - 1));
  for (let i = Math.max(1, iFrom); i < m; i++) {
    const rpx = PR[i] * sk.px;
    if (rpx < 1.2) continue;
    const reps = rpx > 7 ? 2 : 1;
    for (let k = 0; k < reps; k++) {
      const th = mix(floor, 1, hash(i * 3 + k, seed + 5)) / Math.max(0.2, hd);
      const l = LT[i];
      if (l < th) continue;
      const f = k ? 0.5 : 0;
      const j = Math.min(m - 1, i);
      const bx = mix(PX[i - 1], PX[j], 1 - f * 0.999);
      const by = mix(PY[i - 1], PY[j], 1 - f * 0.999);
      const r = mix(PR[i - 1], PR[j], 1 - f);
      const s = SD[i];
      const len = 0.45 + 0.75 * l * (0.7 + 0.6 * hash(i, seed + 6));
      const tx = NY[i];
      const ty = -NX[i];
      const bow = r * 0.35;
      sk.id = base + 10 + i * 2 + k;
      sk.m(bx + NX[i] * r * s * 0.96, by + NY[i] * r * s * 0.96)
        .q(
          bx + NX[i] * r * s * (0.96 - len * 0.5) + tx * bow,
          by + NY[i] * r * s * (0.96 - len * 0.5) + ty * bow,
          bx + NX[i] * r * s * (0.96 - len),
          by + NY[i] * r * s * (0.96 - len),
          4,
        )
        .s((0.45 + 0.25 * l) * wd, 0.3, 0.3);
    }
  }
  // strands along it, on its lit side
  if (st.along) {
    sk.amp = 0.55;
    const na = st.along;
    for (let j = 0; j < na; j++) {
      const f = 0.25 + (0.68 * (j + 0.5)) / na + (hash(j, seed + 31) - 0.5) * 0.08;
      const thr = mix(floor, 0.9, (j * 0.618034 + hash(seed, 33)) % 1);
      let open = false;
      let run = 0;
      let dash = 3 + Math.floor(hash(j, seed + 34) * 5);
      for (let i = 1; i < m; i++) {
        dash--;
        const gap = dash < 0;
        if (dash < -1 - Math.floor(hash(j * 31 + i, seed + 35) * 2))
          dash = 3 + Math.floor(hash(j * 17 + i, seed + 36) * 6);
        const on = !gap && LT[i] > thr;
        if (on) {
          const s = SD[i];
          const x = PX[i] + NX[i] * PR[i] * s * f;
          const y = PY[i] + NY[i] * PR[i] * s * f;
          if (!open) {
            sk.id = base + 240 + j * 12 + (run % 12);
            sk.m(x, y);
            open = true;
          } else sk.l(x, y);
        } else if (open) {
          if (sk.count >= 2) sk.s((0.45 + 0.2 * LT[i - 1]) * wd, 0.3, 0.3);
          open = false;
          run++;
        }
      }
      if (open && sk.count >= 2) sk.s(0.5 * wd, 0.3, 0.3);
    }
  }
  // rings: across the whole lit width
  if (st.rings) {
    sk.amp = 0.6;
    for (let i = st.rings; i < m - 1; i += st.rings) {
      const l = LT[i];
      if (l < floor * 1.5) continue;
      const r = PR[i];
      const tx = NY[i];
      const ty = -NX[i];
      const s = SD[i];
      sk.id = base + 160 + i;
      sk.m(PX[i] + NX[i] * r * s, PY[i] + NY[i] * r * s)
        .q(
          PX[i] + tx * r * 0.4,
          PY[i] + ty * r * 0.4,
          PX[i] - NX[i] * r * s * 0.6,
          PY[i] - NY[i] * r * s * 0.6,
          5,
        )
        .s(0.6 * wd, 0.25, 0.4);
    }
  }
  // hairs off the outer side of a coil
  if (st.hairs !== undefined) {
    sk.amp = 0.35;
    const h0 = Math.floor(st.hairs * m);
    for (let i = h0; i < m - 1; i++) {
      if (hash(i, seed + 9) < 0.35) continue;
      const r = PR[i];
      // the outside of the curve
      const cx = (PX[i + 1] + PX[i - 1]) * 0.5 - PX[i];
      const cy = (PY[i + 1] + PY[i - 1]) * 0.5 - PY[i];
      const s = cx * NX[i] + cy * NY[i] > 0 ? -1 : 1;
      const len = r * (0.8 + 0.8 * hash(i, seed + 10));
      const ox = PX[i] + NX[i] * r * s;
      const oy = PY[i] + NY[i] * r * s;
      sk.id = base + 310 + i;
      sk.m(ox, oy)
        .q(
          ox + NX[i] * s * len * 0.6,
          oy + NY[i] * s * len * 0.6,
          ox + NX[i] * s * len + NY[i] * len * 0.4,
          oy + NY[i] * s * len - NX[i] * len * 0.4,
          3,
        )
        .s(0.5 * wd, 0.4, 0.2);
    }
  }
  // the outline: each side, heavy where it turns from the light, lifting off where lit
  sk.amp = 0.85;
  const edge = st.edge ?? 1.1;
  const i0 = Math.floor((st.from ?? 0) * (m - 1));
  for (const side of [1, -1]) {
    let open = false;
    let runs = 0;
    for (let i = i0; i < m; i++) {
      const lit = SD[i] === side;
      const l = lit ? LT[i] : 0;
      const lost = lit && l > 0.6 && noise(i * 0.7 + side * 5, seed + 21) < -0.25;
      if (!lost) {
        const r = PR[i];
        const x = PX[i] + NX[i] * r * side;
        const y = PY[i] + NY[i] * r * side;
        const wm = lit ? mix(0.8, 0.5, l) : 1.35;
        if (!open) {
          sk.id = base + 400 + (side > 0 ? 0 : 50) + runs;
          sk.m(x, y);
          open = true;
        } else sk.l(x, y);
        void wm;
      } else if (open) {
        if (sk.count >= 2) sk.s(edge * wd * (SD[i] === side ? 0.75 : 1.3), 0.1, 0.6);
        open = false;
        runs++;
      }
    }
    if (open && sk.count >= 2) sk.s(edge * wd * (SD[e] === side ? 0.75 : 1.3), 0.08, 0.6);
  }
  if (st.capEnd) {
    const ea = Math.atan2(PY[e] - PY[e - 1], PX[e] - PX[e - 1]);
    sk.id = base + 500;
    sk.arc(PX[e], PY[e], PR[e], PR[e], ea - Math.PI / 2, ea + Math.PI / 2).s(
      edge * wd * 0.9,
      0.15,
      0.5,
    );
  }
  sk.amp = amp0;
  sk.id = base + 600;
  return true;
}

// ---------------------------------------------------------------- fiddleheads

export interface Fiddle {
  x: number;
  z: number;
  /** Length of the stalk and coil, metres. */
  L: number;
  /** Which way the coil faces (azimuth). */
  az: number;
  r0: number;
  /** How unrolled it is at t = 0, and how fast it unrolls. */
  u0: number;
  du: number;
  lean: number;
  seed: number;
}

const FS = new Float32Array(4 * 40);

/** A fiddlehead: a stalk rising out of the ground and rolling up into a coil at its tip. */
export function fiddle(sk: Sketch, F: Fiddle, t: number) {
  const K = 36;
  const u = clamp(F.u0 + F.du * t, 0, 1);
  const turn = mix(2.7 * Math.PI, 0.95 * Math.PI, u);
  const sway = 0.05 * noise(t * 0.4 + F.seed, 3) + 0.025 * Math.sin(t * 1.3 + F.seed);
  const hx = Math.cos(F.az);
  const hz = Math.sin(F.az);
  // curvature grows toward the tip
  let wsum = 0;
  for (let i = 0; i < K; i++) wsum += smooth(0.42, 1, (i + 0.5) / K) ** 2;
  let th = F.lean + sway;
  let a = 0;
  let b = 0;
  const ds = F.L / K;
  for (let i = 0; i <= K; i++) {
    const s = i / K;
    FS[i * 4] = F.x + hx * a;
    FS[i * 4 + 1] = -b;
    FS[i * 4 + 2] = F.z + hz * a;
    FS[i * 4 + 3] = F.r0 * (1 - 0.62 * s ** 0.8);
    th += (turn * smooth(0.42, 1, (i + 0.5) / K) ** 2) / wsum;
    a += Math.sin(th) * ds;
    b += Math.cos(th) * ds;
  }
  // fine detail only when it is near enough to see
  const near = sk.p3(F.x, -F.L * 0.5, F.z, Q) && (F.r0 * sk.foc * sk.px) / Q[2] > 2.2;
  tube(sk, FS, K + 1, {
    edge: 1.0,
    hatch: near ? 1.4 : 0.8,
    rings: near ? 4 : 0,
    hairs: near ? 0.45 : undefined,
    seed: F.seed,
    floor: 0.1,
  });
}

// ---------------------------------------------------------------- ribbed fans

export interface Fan {
  x: number;
  z: number;
  /** Height of the stalk. */
  h: number;
  R: number;
  /** The fan's opening, radians. */
  span: number;
  /** Which way it faces (azimuth), and how far it leans back. */
  az: number;
  tilt: number;
  ribs: number;
  seed: number;
}

const RT = new Float32Array(3 * 40);
const STK = new Float32Array(4 * 10);

/** A pleated fan on a stalk, ribs spreading from its foot; the pleats that face the sun are hatched. */
export function fan(sk: Sketch, F: Fan, t: number) {
  const base = sk.id;
  const sway = 0.06 * noise(t * 0.33 + F.seed, 7) + 0.03 * Math.sin(t * 0.9 + F.seed * 2);
  const az = F.az + sway * 0.6;
  const span = F.span * (1 + 0.04 * Math.sin(t * 0.5 + F.seed));
  // its frame: across (e1), up the fan (e2), its face (f)
  const fx = Math.cos(az);
  const fz = Math.sin(az);
  const e1x = -fz;
  const e1z = fx;
  const ct = Math.cos(F.tilt + sway * 0.3);
  const st = Math.sin(F.tilt + sway * 0.3);
  // up the fan, leaning back from its face
  const e2x = -fx * st;
  const e2y = -ct;
  const e2z = -fz * st;
  const nfx = fx * ct;
  const nfy = -st;
  const nfz = fz * ct;
  const cx = F.x + 0.15 * sway;
  const cy = -F.h;
  const cz = F.z;
  // the stalk
  for (let i = 0; i <= 8; i++) {
    const s = i / 8;
    STK[i * 4] = F.x + 0.15 * sway * s * s + 0.04 * Math.sin(s * 3 + F.seed);
    STK[i * 4 + 1] = -F.h * s;
    STK[i * 4 + 2] = F.z;
    STK[i * 4 + 3] = F.R * 0.05 * (1 - 0.4 * s);
  }
  sk.id = base;
  tube(sk, STK, 9, { edge: 0.9, hatch: 1, seed: F.seed });
  // rib tips, alternately in front of and behind the fan's plane (the pleats)
  const n = F.ribs;
  const pd = F.R * 0.07;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI / 2 - span / 2 + (span * i) / n + (hash(i, F.seed) - 0.5) * 0.04;
    const r = F.R * (0.92 + 0.12 * hash(i, F.seed + 1)) * (1 - 0.06 * Math.abs(Math.cos(a)));
    const p = (i % 2 ? 1 : -1) * pd;
    const ca = Math.cos(a) * r;
    const sa = Math.sin(a) * r;
    RT[i * 3] = cx + e1x * ca + e2x * sa + nfx * p;
    RT[i * 3 + 1] = cy + e2y * sa + nfy * p;
    RT[i * 3 + 2] = cz + e1z * ca + e2z * sa + nfz * p;
  }
  // clear the fan
  if (!sk.p3(cx, cy, cz, Q)) return;
  const C0 = [Q[0], Q[1], Q[2]];
  const wd = dw(sk, C0[2]);
  const Fpx = (F.R * sk.foc * sk.px) / C0[2];
  sk.id = base + 700;
  sk.m3(cx, cy, cz);
  for (let i = 0; i <= n; i++) sk.l3(RT[i * 3], RT[i * 3 + 1], RT[i * 3 + 2]);
  sk.fill3();
  // the pleats
  const amp0 = sk.amp;
  sk.amp = 0.55;
  for (let i = 0; i < n; i++) {
    const ax = RT[i * 3] - cx;
    const ay = RT[i * 3 + 1] - cy;
    const az2 = RT[i * 3 + 2] - cz;
    const bx = RT[i * 3 + 3] - cx;
    const by = RT[i * 3 + 4] - cy;
    const bz = RT[i * 3 + 5] - cz;
    let nx = ay * bz - az2 * by;
    let ny = az2 * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    // facing the eye
    const mx = cx + (ax + bx) * 0.45;
    const my = cy + (ay + by) * 0.45;
    const mz = cz + (az2 + bz) * 0.45;
    if (nx * (sk.ex - mx) + ny * (sk.ey - my) + nz * (sk.ez - mz) < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const l = sun(mx, my, mz, nx, ny, nz);
    const k = Math.round(1 + (Fpx > 110 ? 4 : Fpx > 60 ? 2.2 : 1) * l);
    for (let j = 0; j < 5; j++) {
      if (j >= k || l < 0.1 + 0.15 * j * hash(i * 7 + j, F.seed + 3)) continue;
      const f = (j + 0.3 + 0.4 * hash(i * 5 + j, F.seed + 4)) / 5;
      const r0 = 0.12 + 0.3 * hash(i * 11 + j, F.seed + 5);
      const r1 = 0.94 - 0.15 * hash(i * 13 + j, F.seed + 6);
      sk.id = base + 710 + i * 6 + j;
      sk.m3(cx + mix(ax, bx, f) * r0, cy + mix(ay, by, f) * r0, cz + mix(az2, bz, f) * r0)
        .l3(
          cx + mix(ax, bx, f) * (r0 + r1) * 0.5,
          cy + mix(ay, by, f) * (r0 + r1) * 0.5,
          cz + mix(az2, bz, f) * (r0 + r1) * 0.5,
          0.8 + 0.6 * l,
        )
        .l3(cx + mix(ax, bx, f) * r1, cy + mix(ay, by, f) * r1, cz + mix(az2, bz, f) * r1, 1)
        .s3(0.5, 0.3, 0.35);
    }
  }
  // ribs, and the scalloped rim
  sk.amp = 0.8;
  for (let i = 0; i <= n; i++) {
    const tx = RT[i * 3];
    const ty = RT[i * 3 + 1];
    const tz = RT[i * 3 + 2];
    const l = open(tx, ty, tz) * capShade(tx, ty, tz);
    // in shade a rib is barely there: only its outer part, fine
    const r0 = l > 0.15 ? 0.08 : 0.35 + 0.3 * hash(i, F.seed + 7);
    sk.id = base + 950 + i;
    sk.m3(cx + (tx - cx) * r0, cy + (ty - cy) * r0, cz + (tz - cz) * r0)
      .l3(
        cx + (tx - cx) * (0.5 + r0 * 0.5),
        cy + (ty - cy) * (0.5 + r0 * 0.5),
        cz + (tz - cz) * (0.5 + r0 * 0.5),
        1.1,
      )
      .l3(tx, ty, tz, 0.7)
      .s3(0.35 + 0.6 * l, 0.2, 0.4);
  }
  for (let i = 0; i < n; i++) {
    const ax = RT[i * 3];
    const ay = RT[i * 3 + 1];
    const az2 = RT[i * 3 + 2];
    const bx = RT[i * 3 + 3];
    const by = RT[i * 3 + 4];
    const bz = RT[i * 3 + 5];
    // the rim dips between ribs
    const mx = (ax + bx) * 0.5 + (cx - (ax + bx) * 0.5) * 0.06;
    const my = (ay + by) * 0.5 + (cy - (ay + by) * 0.5) * 0.06;
    const mz = (az2 + bz) * 0.5 + (cz - (az2 + bz) * 0.5) * 0.06;
    // heavier on the shadow side (the right, away from the sun)
    const sideW = 0.8 + 0.6 * clamp((i / n - 0.3) * 1.6, 0, 1);
    sk.id = base + 1000 + i;
    sk.m3(ax, ay, az2)
      .l3(mx, my, mz)
      .l3(bx, by, bz)
      .s3(sideW * 1.0, 0.1, 0.5);
  }
  sk.amp = amp0;
  void wd;
  sk.id = base + 1100;
}

// ---------------------------------------------------------------- hanging pods

export interface PodPlant {
  x: number;
  z: number;
  /** Height of the arch, how far it reaches, which way. */
  h: number;
  reach: number;
  az: number;
  /** Pods: where on the arch (0..1), hang length, pod length, pod radius. */
  pods: [number, number, number, number][];
  seed: number;
}

const AR = new Float32Array(4 * 30);

/** An arching stem with pods hanging from it on threads, swinging a little. */
export function podPlant(sk: Sketch, P: PodPlant, t: number) {
  const base = sk.id;
  const dx = Math.cos(P.az);
  const dz = Math.sin(P.az);
  const sway = 0.06 * noise(t * 0.3 + P.seed, 4) + 0.02 * Math.sin(t * 1.1 + P.seed);
  const K = 24;
  // the arch: up, over and drooping at its end
  const bez = (s: number, o: number[]) => {
    const u = 1 - s;
    const ax = 0;
    const ay = 0;
    const bx = P.reach * 0.05;
    const by = P.h * 1.15;
    const cx = P.reach * 0.65;
    const cy = P.h * 1.2;
    const ex = P.reach * (1 + sway);
    const ey = P.h * 0.82;
    const a = u * u * u;
    const b = 3 * u * u * s;
    const c = 3 * u * s * s;
    const d = s * s * s;
    o[0] = a * ax + b * bx + c * cx + d * ex;
    o[1] = a * ay + b * by + c * cy + d * ey;
  };
  const O2 = [0, 0];
  for (let i = 0; i <= K; i++) {
    const s = i / K;
    bez(s, O2);
    AR[i * 4] = P.x + dx * O2[0];
    AR[i * 4 + 1] = -O2[1];
    AR[i * 4 + 2] = P.z + dz * O2[0];
    AR[i * 4 + 3] = 0.06 * (1 - 0.7 * s);
  }
  sk.id = base;
  tube(sk, AR, K + 1, { edge: 1.0, hatch: 1.2, rings: 5, seed: P.seed });
  // the pods
  P.pods.forEach(([s, hang, len, r], k) => {
    bez(s, O2);
    const tx = P.x + dx * O2[0];
    const ty = -O2[1];
    const tz = P.z + dz * O2[0];
    const sw = 0.12 * noise(t * 0.5 + k * 3 + P.seed, 5) + 0.05 * Math.sin(t * 1.7 + k);
    const sx = sw * dz;
    const sz = -sw * dx * 0.5;
    sk.id = base + 700 + k * 3000;
    // the thread
    sk.m3(tx, ty, tz)
      .l3(tx + sx * 0.5, ty + hang * 0.5, tz + sz * 0.5)
      .l3(tx + sx, ty + hang, tz + sz)
      .s3(0.7, 0.1, 0.4);
    const px = tx + sx;
    const py = ty + hang;
    const pz = tz + sz;
    revolve(
      sk,
      (v, o) => {
        o[0] = px + sx * v * 0.6;
        o[1] = py + v * len;
        o[2] = pz + sz * v * 0.6;
      },
      (v) => r * (0.12 + Math.sin(Math.PI * v ** 0.75) ** 0.85) * (1 + 0.04 * Math.sin(v * 17 + k)),
      14,
      {
        light: sun,
        m: 14,
        w: 0.55,
        edge: 1.0,
        floor: 0.12,
        twist: 0.5,
        rings: 3,
        seed: P.seed * 7 + k,
      },
    );
  });
  sk.id = base + 700 + P.pods.length * 3000;
}

// ---------------------------------------------------------------- vines

export interface Vine {
  x: number;
  z: number;
  /** Where it hangs from (above the view), and its length. */
  top: number;
  len: number;
  seed: number;
}

const VN = new Float32Array(3 * 40);

/**
 * A vine hanging from the canopy, swaying with a wave that runs down it, small leaves along
 * it and its tip rolled up. push: how far something has pushed its lower part aside (x, z).
 */
export function vine(sk: Sketch, V: Vine, t: number, px = 0, pz = 0) {
  const base = sk.id;
  const K = 30;
  const ph = V.seed * 1.7;
  for (let i = 0; i <= K; i++) {
    const s = i / K;
    const w =
      0.12 * Math.sin(t * 0.8 - s * 2.4 + ph) * s ** 1.4 +
      0.05 * noise(t * 0.35 + s * 1.5, V.seed) * s;
    const w2 = 0.08 * Math.sin(t * 0.63 - s * 2.0 + ph * 2) * s ** 1.5;
    const push = s ** 1.6;
    VN[i * 3] = V.x + w + px * push;
    VN[i * 3 + 1] = V.top + s * V.len;
    VN[i * 3 + 2] = V.z + w2 + pz * push;
  }
  // the vine: a line, heavier where the sun is on it
  const amp0 = sk.amp;
  sk.amp = 0.8;
  sk.id = base;
  sk.m3(VN[0], VN[1], VN[2]);
  for (let i = 1; i <= K; i++) {
    const l = open(VN[i * 3], VN[i * 3 + 1], VN[i * 3 + 2]);
    sk.l3(VN[i * 3], VN[i * 3 + 1], VN[i * 3 + 2], 0.8 + 0.6 * l);
  }
  sk.s3(1.0, 0.04, 0.6, 0.7);
  // its tip, turning over at the end the way a growing tip does
  const e = K * 3;
  let hx = VN[e] - VN[e - 3];
  let hy = VN[e + 1] - VN[e - 2];
  const hl = Math.hypot(hx, hy) || 1;
  hx /= hl;
  hy /= hl;
  let h = Math.atan2(hy, hx);
  let x = VN[e];
  let y = VN[e + 1];
  const z = VN[e + 2];
  const dir = hash(V.seed, 3) < 0.5 ? 1 : -1;
  sk.id = base + 1;
  sk.m3(x, y, z);
  const r0 = 0.06 + 0.03 * hash(V.seed, 4);
  for (let i = 1; i <= 8; i++) {
    const u = i / 8;
    const step = r0 * 0.35 * (1 - 0.5 * u);
    h += dir * 0.32;
    x += Math.cos(h) * step;
    y += Math.sin(h) * step;
    sk.l3(x, y, z, 1 - 0.5 * u);
  }
  sk.s3(0.9, 0.2, 0.4);
  // leaves along it, alternating, drooping from little stalks
  sk.amp = 0.6;
  for (let i = 2; i < K - 1; i += 2) {
    const k = i / 2;
    const side = k % 2 ? 1 : -1;
    const lx = VN[i * 3];
    const ly = VN[i * 3 + 1];
    const lz = VN[i * 3 + 2];
    if (!sk.p3(lx, ly, lz, Q)) continue;
    const size = (0.11 * (0.7 + 0.6 * hash(k, V.seed + 5)) * sk.foc) / Q[2];
    if (size * sk.px < 3) continue;
    const ang =
      (side > 0 ? 0.6 : Math.PI - 0.6) +
      0.25 * Math.sin(t * 1.1 + k + V.seed) +
      (hash(k, V.seed + 6) - 0.5) * 0.5;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const bx = Q[0] + ca * size * 0.15;
    const by = Q[1] + sa * size * 0.15;
    const ex = bx + ca * size;
    const ey = by + sa * size;
    const wx = -sa * size * 0.32;
    const wy = ca * size * 0.32;
    const l = open(lx, ly, lz);
    sk.id = base + 10 + k * 5;
    sk.m(bx, by)
      .q(mix(bx, ex, 0.4) + wx, mix(by, ey, 0.4) + wy, ex, ey, 5)
      .q(mix(bx, ex, 0.4) - wx, mix(by, ey, 0.4) - wy, bx, by, 5);
    sk.fill();
    sk.m(Q[0], Q[1])
      .l(bx, by)
      .q(mix(bx, ex, 0.4) + wx, mix(by, ey, 0.4) + wy, ex, ey, 5)
      .q(mix(bx, ex, 0.4) - wx, mix(by, ey, 0.4) - wy, bx, by, 5);
    sk.s(0.75 * dw(sk, Q[2]), 0.08, 0.3);
    if (l > 0.3) {
      sk.m(bx, by)
        .l(mix(bx, ex, 0.85), mix(by, ey, 0.85))
        .s(0.5, 0.3, 0.2);
      sk.m(mix(bx, ex, 0.3) + wx * 0.5, mix(by, ey, 0.3) + wy * 0.5)
        .l(mix(bx, ex, 0.7) + wx * 0.25, mix(by, ey, 0.7) + wy * 0.25)
        .s(0.45, 0.3, 0.2);
    }
  }
  sk.amp = amp0;
  sk.id = base + 400;
}

// ---------------------------------------------------------------- cap growths

export interface Cap {
  x: number;
  z: number;
  /** Height of the rim, radius, height of the dome above the rim. */
  h: number;
  R: number;
  dome: number;
  /** Stalk radius at the top and its lean. */
  sr: number;
  lean: number;
  gills: number;
  threads: number;
  seed: number;
}

const HX2 = new Float32Array(2 * 200);
const HY2 = new Float32Array(2 * 200);
const RIM = new Float32Array(2 * 64);
const RIMZ = new Float32Array(64);
const RIMOK = new Uint8Array(64);

/** Convex hull of n points (view units) into oX/oY; returns its size (monotone chain). */
const HIDX: number[] = [];
const HST = new Int32Array(420);
let HSX: Float32Array = new Float32Array(0);
let HSY: Float32Array = new Float32Array(0);
const byX = (a: number, b: number) => HSX[a] - HSX[b] || HSY[a] - HSY[b];
function hull(
  X: Float32Array,
  Y: Float32Array,
  n: number,
  oX: Float32Array,
  oY: Float32Array,
): number {
  HIDX.length = n;
  for (let i = 0; i < n; i++) HIDX[i] = i;
  HSX = X;
  HSY = Y;
  HIDX.sort(byX);
  let m = 0;
  const cr = (o: number, a: number, b: number) =>
    (X[a] - X[o]) * (Y[b] - Y[o]) - (Y[a] - Y[o]) * (X[b] - X[o]);
  for (let k = 0; k < n; k++) {
    const p = HIDX[k];
    while (m >= 2 && cr(HST[m - 2], HST[m - 1], p) <= 0) m--;
    HST[m++] = p;
  }
  const lo = m + 1;
  for (let k = n - 2; k >= 0; k--) {
    const p = HIDX[k];
    while (m >= lo && cr(HST[m - 2], HST[m - 1], p) <= 0) m--;
    HST[m++] = p;
  }
  m--;
  for (let i = 0; i < m; i++) {
    oX[i] = X[HST[i]];
    oY[i] = Y[HST[i]];
  }
  return m;
}

const CXs = new Float32Array(200);
const CYs = new Float32Array(200);
const OXs = new Float32Array(200);
const OYs = new Float32Array(200);

/** Fill the convex hull of points (view units) and return the hull in OX/OY. */
export function hullFill(
  sk: Sketch,
  X: Float32Array,
  Y: Float32Array,
  n: number,
  grow = 0.8,
): number {
  const h = hull(X, Y, n, OXs, OYs);
  if (h < 3) return 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < h; i++) {
    cx += OXs[i];
    cy += OYs[i];
  }
  cx /= h;
  cy /= h;
  const g = grow / sk.px;
  for (let i = 0; i < h; i++) {
    const dx = OXs[i] - cx;
    const dy = OYs[i] - cy;
    const d = Math.hypot(dx, dy) || 1;
    if (i === 0) sk.m(OXs[i] + (dx / d) * g, OYs[i] + (dy / d) * g);
    else sk.l(OXs[i] + (dx / d) * g, OYs[i] + (dy / d) * g);
  }
  sk.fill();
  return h;
}
export { OXs as HULLX, OYs as HULLY };

/**
 * A cap growth on a stalk. Seen from below (its rim above the eye) it shows its gills, lit from
 * under by the sunlit floor; seen from above, its dome, hatched where the sun falls on it.
 * Threads hang from the rim of the big ones, swaying.
 */
export function cap(sk: Sketch, C: Cap, t: number) {
  const base = sk.id;
  const breath = 0.012 * Math.sin(t * 1.15 + C.seed) + 0.006 * Math.sin(t * 0.43);
  const sway = 0.03 * Math.sin(t * 0.5 + C.seed) + 0.015 * Math.sin(t * 1.27 + 1);
  const cx = C.x + C.lean + sway;
  const cz = C.z;
  const R = C.R * (1 + breath);
  const top = -C.h;
  const below = top < sk.ey;
  const NR = 40;
  // rim and dome points, projected
  let n = 0;
  for (let i = 0; i < NR; i++) {
    const a = (i / NR) * TAU;
    const rr = R * (1 + 0.045 * Math.sin(a * 3 + C.seed) + 0.025 * Math.sin(a * 7 + C.seed * 2));
    const y = top + 0.06 * R * Math.sin(a * 5 + t * 0.6 + C.seed);
    const ok = sk.p3(cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr, Q);
    RIMOK[i] = ok ? 1 : 0;
    RIM[i * 2] = Q[0];
    RIM[i * 2 + 1] = Q[1];
    RIMZ[i] = Q[2];
    if (ok) {
      CXs[n] = Q[0];
      CYs[n] = Q[1];
      n++;
    }
  }
  for (let k = 1; k <= 3; k++) {
    const f = k / 4;
    const rr = R * Math.sqrt(1 - f * f) * 0.98;
    const y = top - C.dome * R * f;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      if (sk.p3(cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr, Q)) {
        CXs[n] = Q[0];
        CYs[n] = Q[1];
        n++;
      }
    }
  }
  if (sk.p3(cx, top - C.dome * R, cz, Q)) {
    CXs[n] = Q[0];
    CYs[n] = Q[1];
    n++;
  }
  if (n < 8) return;
  let zc = 0;
  for (let i = 0; i < NR; i++) zc += RIMZ[i];
  zc /= NR;
  const wd = dw(sk, zc);
  // the stalk first when we look down on the cap (the cap hides its top); after, from below
  const stalk = () => {
    sk.id = base + 3000;
    revolve(
      sk,
      (v, o) => {
        o[0] =
          C.x +
          C.lean * (1 - v) ** 1.4 +
          sway * (1 - v) +
          0.08 * Math.sin(v * 3 + C.seed) * C.sr * 4;
        o[1] = mix(top + 0.05, 0.02, v);
        o[2] = C.z;
      },
      (v) =>
        C.sr *
        (1 +
          0.08 * Math.sin(v * 11 + C.seed) +
          1.1 * smooth(0.78, 1, v) ** 2 +
          0.25 * (1 - smooth(0, 0.12, v))),
      18,
      {
        light: fromFloor,
        m: Math.round(18 + C.sr * 70),
        dashes: 3,
        w: 0.6,
        edge: 1.2,
        floor: 0.1,
        twist: 0.9,
        rings: 5,
        seed: C.seed + 31,
      },
    );
  };
  if (!below) stalk();
  sk.id = base;
  hullFill(sk, CXs, CYs, n);
  const amp0 = sk.amp;
  // the dome: meridians from the rim toward the crown where they face us and the sun
  sk.amp = 0.55;
  const Rpx = (R * sk.foc * sk.px) / zc;
  const M = Math.round(14 + 18 * C.R);
  const Mon = Math.max(10, Rpx / 2.6);
  for (let s = 0; s < M; s++) {
    if (vdc(s) * M >= Mon) continue;
    const a = ((s + 0.5 + (hash(s, C.seed) - 0.5) * 0.5) / M) * TAU;
    const thr = mix(0.12, 1, (s * 0.618034 + hash(C.seed, 9)) % 1);
    let openRun = false;
    let run = 0;
    const steps = 7;
    for (let j = 0; j <= steps; j++) {
      const f = 0.02 + (j / steps) * 0.86;
      const rr = R * Math.sqrt(1 - f * f);
      const y = top - C.dome * R * f;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const x = cx + ca * rr;
      const z = cz + sa * rr;
      // the normal of a squashed sphere
      let nx = ca * Math.sqrt(1 - f * f) * C.dome;
      let ny = -f;
      let nz = sa * Math.sqrt(1 - f * f) * C.dome;
      const nl = Math.hypot(nx, ny, nz);
      nx /= nl;
      ny /= nl;
      nz /= nl;
      const facing = nx * (sk.ex - x) + ny * (sk.ey - y) + nz * (sk.ez - z);
      let on = false;
      let l = 0;
      if (facing > 0) {
        l = sun(x, y, z, nx, ny, nz);
        on = l > thr + (hash(s * 31 + j, C.seed + 3) - 0.5) * 0.1;
      }
      if (on) {
        if (!openRun) {
          sk.id = base + 20 + s * 4 + Math.min(3, run);
          sk.m3(x, y, z);
          openRun = true;
        } else sk.l3(x, y, z, 0.6 + 0.9 * l);
      } else if (openRun) {
        if (sk.count3 >= 2) sk.s3(0.55, 0.3, 0.4);
        openRun = false;
        run++;
      }
    }
    if (openRun && sk.count3 >= 2) sk.s3(0.55, 0.3, 0.4);
  }
  // from below: the underside, gills from the stalk to the rim, lit from under
  if (below) {
    sk.id = base + 300;
    let m = 0;
    for (let i = 0; i < NR; i++) {
      if (!RIMOK[i]) continue;
      if (m === 0) sk.m(RIM[i * 2], RIM[i * 2 + 1]);
      else sk.l(RIM[i * 2], RIM[i * 2 + 1]);
      m++;
    }
    if (m >= 3) sk.fill();
    sk.amp = 0.5;
    // as many gills as the cap's size on the view can hold: they join one by one as it nears
    const G = C.gills;
    const gOn = clamp(Rpx / 1.6, 24, G);
    for (let i = 0; i < G; i++) {
      const a = ((i + (hash(i, C.seed + 40) - 0.5) * 0.6) / G) * TAU;
      const long = i % 2 === 0 ? hash(i, C.seed + 41) < 0.85 : hash(i, C.seed + 41) < 0.25;
      const r0 = (long ? 1.25 + 0.4 * hash(i, C.seed + 42) : 2 + 2.5 * hash(i, C.seed + 42)) * C.sr;
      const r1 = R * (0.94 + 0.05 * hash(i, C.seed + 43));
      if (r1 - r0 < R * 0.12 || vdc(i) * G >= gOn) continue;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const ex = cx + ca * r1;
      const ez = cz + sa * r1;
      const l = clamp(0.35 + 0.75 * bounce(ex, top, ez, 0, 1, 0), 0, 1);
      if (hash(i, C.seed + 44) > l + 0.15) continue;
      const curl = (hash(i, C.seed + 45) - 0.5) * 0.12;
      sk.id = base + 600 + i;
      sk.m3(cx + ca * r0, top - 0.08 * R, cz + sa * r0)
        .l3(
          cx + Math.cos(a + curl) * mix(r0, r1, 0.5),
          top - 0.04 * R,
          cz + Math.sin(a + curl) * mix(r0, r1, 0.5),
          1,
        )
        .l3(ex, top + 0.01, ez, 0.8)
        .s3(long ? 0.6 : 0.5, 0.3, 0.3);
    }
  }
  // the outline: the hull, heavy on the shadow side (away from the upper left)
  sk.amp = 0.85;
  const h = hull(CXs, CYs, n, HX2, HY2);
  if (h >= 3) {
    let cxv = 0;
    let cyv = 0;
    for (let i = 0; i < h; i++) {
      cxv += HX2[i];
      cyv += HY2[i];
    }
    cxv /= h;
    cyv /= h;
    const s0 = Math.floor(hash(base, sk.boil) * h);
    sk.id = base + 2;
    let first = true;
    const extra = Math.max(2, Math.round(h * 0.06));
    for (let k = 0; k <= h + extra; k++) {
      const i = (s0 + k) % h;
      if (first) {
        sk.m(HX2[i], HY2[i]);
        first = false;
      } else sk.l(HX2[i], HY2[i]);
    }
    sk.s(1.25 * wd, 0.08, 0.8);
    // a second, heavier pass along the shadow side
    sk.id = base + 3;
    first = true;
    for (let i = 0; i < h; i++) {
      const sh = (HX2[i] - cxv) * 0.6 + (HY2[i] - cyv) * 0.8;
      if (sh > 0) {
        if (first) {
          sk.m(HX2[i], HY2[i]);
          first = false;
        } else sk.l(HX2[i], HY2[i]);
      } else if (!first) break;
    }
    if (!first && sk.count >= 2) sk.s(0.9 * wd, 0.25, 0.6);
  }
  // the rim's near edge, seen from below: the lip of the cap
  if (below) {
    sk.id = base + 4;
    let started = false;
    for (let i = 0; i <= NR; i++) {
      const k = i % NR;
      const a = (k / NR) * TAU;
      const near = Math.sin(a) < -0.05;
      if (near && RIMOK[k]) {
        if (!started) {
          sk.m(RIM[k * 2], RIM[k * 2 + 1]);
          started = true;
        } else sk.l(RIM[k * 2], RIM[k * 2 + 1]);
      }
    }
    if (started && sk.count >= 2) sk.s(1.0 * wd, 0.1, 0.6);
  }
  // threads from the rim, with beads and rolled ends
  if (C.threads > 0 && Rpx > 40) {
    sk.amp = 0.5;
    for (let k = 0; k < C.threads; k++) {
      const a = ((k + 0.5 + (hash(k, C.seed + 60) - 0.5) * 0.6) / C.threads) * TAU;
      // only along the near half of the rim: from the far side they would hang across the gills
      if (below && Math.sin(a) > -0.15) continue;
      const rr = R * (0.88 + 0.08 * hash(k, C.seed + 61));
      const len = R * (0.25 + 0.6 * hash(k, C.seed + 62) ** 1.5);
      const x0 = cx + Math.cos(a) * rr;
      const z0 = cz + Math.sin(a) * rr;
      const y0 = top + 0.02;
      sk.id = base + 400 + k * 3;
      sk.m3(x0, y0, z0);
      let x = x0;
      let y = y0;
      for (let i = 1; i <= 8; i++) {
        const s = i / 8;
        const w = 0.06 * R * Math.sin(t * 0.9 - s * 2.2 + k * 1.3) * s ** 1.3;
        x = x0 + w;
        y = y0 + len * s;
        sk.l3(x, y, z0, 1 - 0.4 * s);
      }
      sk.s3(0.65, 0.05, 0.4);
      // a rolled end
      if (sk.p3(x, y, z0, Q)) {
        const r = (0.025 * R * sk.foc) / Q[2];
        if (r * sk.px > 1.2) {
          const dir = hash(k, C.seed + 63) < 0.5 ? 1 : -1;
          sk.id = base + 401 + k * 3;
          sk.m(Q[0], Q[1]);
          let hx = Q[0];
          let hy = Q[1];
          let hh = Math.PI / 2;
          for (let i = 1; i <= 9; i++) {
            hh += dir * 0.7;
            const st = r * (1 - 0.06 * i);
            hx += Math.cos(hh) * st;
            hy += Math.sin(hh) * st;
            sk.l(hx, hy);
          }
          sk.s(0.6 * wd, 0.15, 0.2);
        }
      }
    }
  }
  sk.amp = amp0;
  if (below) stalk();
  sk.id = base + 8000;
}

// ---------------------------------------------------------------- trunks

export interface Trunk {
  x: number;
  z: number;
  r: number;
  twist: number;
  seed: number;
}

const RT2 = new Float32Array(4 * 12);

/** A great twisted trunk rising out of view, its roots buttressing out across the ground. */
export function trunk(sk: Sketch, T: Trunk) {
  const base = sk.id;
  const lean = (hash(T.seed, 3) - 0.5) * 0.5;
  // roots first: they run out behind and beside it
  const nr = 5;
  for (let k = 0; k < nr; k++) {
    const a = ((k + 0.3 * hash(k, T.seed + 1)) / nr) * TAU + T.seed;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const reach = T.r * (1.6 + 1.2 * hash(k, T.seed + 2));
    for (let i = 0; i <= 8; i++) {
      const s = i / 8;
      const d = T.r * 0.6 + reach * s;
      RT2[i * 4] = T.x + ca * d;
      RT2[i * 4 + 1] = -T.r * 1.4 * (1 - s) ** 1.8 + 0.02;
      RT2[i * 4 + 2] = T.z + sa * d;
      RT2[i * 4 + 3] = T.r * 0.28 * (1 - 0.75 * s);
    }
    // behind the trunk: draw now; in front: after
    if (sa > 0 || Math.abs(ca) > 0.6) {
      sk.id = base + 10 + k * 700;
      tube(sk, RT2, 9, { edge: 1.0, hatch: 1, seed: T.seed + k });
    }
  }
  sk.id = base + 5000;
  revolve(
    sk,
    (v, o) => {
      o[0] = T.x + lean * (1 - v) * 1.5 + 0.12 * Math.sin(v * 5 + T.seed);
      o[1] = mix(-11, 0.05, v);
      o[2] = T.z;
    },
    (v) =>
      T.r *
      (1 +
        0.12 * Math.sin(v * 9 + T.seed * 2) +
        0.7 * smooth(0.84, 1, v) ** 2 +
        0.06 * Math.sin(v * 23 + T.seed)),
    18,
    {
      light: sun,
      m: Math.round(22 + T.r * 14),
      dashes: 7,
      w: 0.6,
      edge: 0.8,
      floor: 0.1,
      twist: T.twist * 0.25,
      seed: T.seed + 40,
      rings: 5,
    },
  );
  for (let k = 0; k < nr; k++) {
    const a = ((k + 0.3 * hash(k, T.seed + 1)) / nr) * TAU + T.seed;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    if (sa > 0 || Math.abs(ca) > 0.6) continue;
    const reach = T.r * (1.6 + 1.2 * hash(k, T.seed + 2));
    for (let i = 0; i <= 8; i++) {
      const s = i / 8;
      const d = T.r * 0.6 + reach * s;
      RT2[i * 4] = T.x + ca * d;
      RT2[i * 4 + 1] = -T.r * 1.4 * (1 - s) ** 1.8 + 0.02;
      RT2[i * 4 + 2] = T.z + sa * d;
      RT2[i * 4 + 3] = T.r * 0.28 * (1 - 0.75 * s);
    }
    sk.id = base + 10 + k * 700;
    tube(sk, RT2, 9, { edge: 1.0, hatch: 1, seed: T.seed + k });
  }
  sk.id = base + 9000;
}

// ---------------------------------------------------------------- foliage far off

export interface Mass {
  /** Where the cluster grows from, how far its leaves reach, how many, which way it leans. */
  x: number;
  y: number;
  z: number;
  L: number;
  n: number;
  /** The fan of leaf directions (view angle, radians): centre and spread. */
  dir: number;
  spread: number;
  seed: number;
}

const ML = [0, 0, 0];

/**
 * A cluster of leaves seen from afar, drawn flat on the view (cheap enough to have many): each
 * a cleared leaf shape with a heavier edge on its shadow side, a midrib, and, where the sun
 * reaches it, strokes along it. Ids from sk.id to sk.id + 8 * n.
 */
export function mass(
  sk: Sketch,
  M: Mass,
  t: number,
  light: (x: number, y: number, z: number) => number,
) {
  const base = sk.id;
  if (!sk.p3(M.x, M.y, M.z, Q)) return;
  const cx = Q[0];
  const cy = Q[1];
  const zc = Q[2];
  const S = (M.L * sk.foc) / zc;
  if (cx < -sk.A - S * 1.2 || cx > sk.A + S * 1.2 || cy < -1 - S * 1.2 || cy > 1 + S * 1.2) return;
  const wd = dw(sk, zc);
  const amp0 = sk.amp;
  // a hanging cluster's branch
  if (M.dir > 0) {
    sk.amp = 0.8;
    sk.id = base + M.n * 8 + 1;
    sk.m(cx - S * 0.85, cy - S * 0.12)
      .q(cx, cy + S * 0.06, cx + S * 0.85, cy - S * 0.14, 6)
      .s(1.1 * wd, 0.1, 0.6);
  }
  // the far leaves first, the near (lower in the cluster) last
  for (let j = 0; j < M.n; j++) {
    const h = hash(j, M.seed);
    const a =
      M.dir +
      (((j + 0.5) / M.n - 0.5) * 2 + (h - 0.5) * 0.4) * M.spread +
      0.04 * Math.sin(t * (0.7 + h) + j);
    const len = S * (0.6 + 0.5 * hash(j, M.seed + 1));
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const off = S * 0.12 * hash(j, M.seed + 2);
    // a hanging cluster hangs from along its branch, not from one point
    const along = M.dir > 0 ? ((j + 0.5) / M.n - 0.5) * S * 1.4 : 0;
    const bx = cx + ca * off + along;
    const by = cy + sa * off + (S * 0.05 * j) / M.n - (M.dir > 0 ? Math.abs(along) * 0.15 : 0);
    const ex = bx + ca * len;
    const ey = by + sa * len;
    const wdt = len * (0.24 + 0.12 * hash(j, M.seed + 3));
    const nx = -sa * wdt;
    const ny = ca * wdt;
    const bend = (hash(j, M.seed + 4) - 0.5) * 0.3 * len;
    // the light on it: where its middle is in the world
    ML[0] = M.x + Math.cos(a) * M.L * 0.5 * 0.9;
    ML[1] = M.y + Math.sin(a) * M.L * 0.5;
    ML[2] = M.z;
    const l = light(ML[0], ML[1], ML[2]);
    const mx = (bx + ex) * 0.5 + nx * 0.15 + -sa * bend;
    const my = (by + ey) * 0.5 + ny * 0.15 + ca * bend;
    const qk = len * sk.px > 50 ? 6 : 4;
    sk.id = base + j * 8;
    sk.m(bx, by)
      .q(mx + nx, my + ny, ex, ey, qk)
      .q(mx - nx, my - ny, bx, by, qk);
    sk.fill();
    sk.amp = 0.8;
    // the edge: the upper side lighter, the lower side heavier
    const up = ny < 0 ? 1 : -1;
    // in shade only the lower edge shows (ink is light); in sun both, and the rib, and strokes
    if (up < 0 || l > 0.15) {
      sk.id = base + j * 8 + 1;
      sk.m(bx, by)
        .q(mx + nx, my + ny, ex, ey, qk)
        .s((up > 0 ? 0.55 : 1.0) * wd, 0.1, 0.5);
    }
    if (up > 0 || l > 0.15) {
      sk.id = base + j * 8 + 2;
      sk.m(ex, ey)
        .q(mx - nx, my - ny, bx, by, qk)
        .s((up > 0 ? 1.0 : 0.55) * wd, 0.1, 0.5);
    }
    sk.amp = 0.5;
    if (len * sk.px > 14 && l > 0.15) {
      sk.id = base + j * 8 + 3;
      sk.m(bx, by)
        .q(mx, my, mix(bx, ex, 0.9), mix(by, ey, 0.9), 4)
        .s(0.5 * wd, 0.3, 0.3);
    }
    // strokes along it where lit, from the midrib out, slanting toward the tip
    const kOn = l * (len * sk.px > 40 ? 4 : 2);
    for (let i = 0; i < 4; i++) {
      if (vdc(i) * 4 >= kOn) continue;
      const f = (i + 0.5) / 4;
      const side = i % 2 ? 1 : -1;
      const u0 = 0.15 + 0.5 * f;
      const px0 = mix(bx, ex, u0);
      const py0 = mix(by, ey, u0);
      const sw = side * (0.35 + 0.4 * hash(i, M.seed + j * 7));
      sk.id = base + j * 8 + 4 + Math.min(3, i);
      sk.m(px0 + nx * sw * 0.2, py0 + ny * sw * 0.2)
        .l(px0 + nx * sw + (ex - bx) * 0.12, py0 + ny * sw + (ey - by) * 0.12)
        .s(0.45 * wd, 0.3, 0.2);
      void sw;
    }
  }
  sk.amp = amp0;
  sk.id = base + M.n * 8 + 2;
}
