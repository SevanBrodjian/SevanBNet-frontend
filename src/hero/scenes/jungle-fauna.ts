// What lives in the jungle and looks at us: a tall, gentle grazer across the clearing that
// lifts its head from the plants to watch us come; eyes in the dark undergrowth, in pairs and
// alone, peering between leaves; small fliers whose bodies are an eye, moth wings flicking; a
// little cap that drifts in the air trailing threads, an eye under it.
//
// Eyes are dreamlog's: iris fibres round a torn pupil, a catchlight with a black moat, lids
// that blink with real timing (fast shut, slow open, sometimes doubled, sometimes slow), gaze
// that holds and jumps and comes back to us.

import { clamp, hash, mix, noise, type Sketch, smooth, TAU } from "../sketch";
import { dw, HULLX, HULLY, hullFill, tube } from "./jungle-flora";
import { eye, Gaze, type Look, spring, vdc } from "./jungle-kit";
import { form, frame, leaf } from "./jungle-leaf";
import { DX, DY, DZ, open, sun } from "./jungle-light";

const Q = [0, 0, 0];
const LK: Look = { gx: 0, gy: 0, open: 1, low: 0, pupil: 1 };

// ---------------------------------------------------------------- an ellipsoid, drawn

const BX = new Float32Array(200);
const BY = new Float32Array(200);

export interface BlobStyle {
  /** Strands along the long axis. */
  m: number;
  edge?: number;
  w?: number;
  floor?: number;
  seed: number;
  /** Small round markings along the top, where lit. */
  spots?: number;
  /** Rings round its girth (cross-contour strokes), drawn where it is lit, and from what light. */
  girth?: number;
  gfloor?: number;
  /** Swell or pinch the cross-section: (cos along, cos round, sin round) -> scale. */
  bulge?: (cv: number, cu: number, su: number) => number;
}

/**
 * An ellipsoid with orthogonal semi-axes A1 (long), A2, A3 about C: cleared, hatched along its
 * long axis where it faces us and the sun reaches it, outlined heavy on its shadow side.
 * Ids from sk.id to sk.id + 500.
 */
export function blob(
  sk: Sketch,
  C: number[],
  A1: number[],
  A2: number[],
  A3: number[],
  st: BlobStyle,
): boolean {
  const base = sk.id;
  sk.id = base + 500;
  // outline points, for the clearing and the silhouette
  let n = 0;
  let zs = 0;
  for (let j = 1; j < 9; j++) {
    const v = (j / 9) * Math.PI;
    const cv = Math.cos(v);
    const sv = Math.sin(v);
    for (let i = 0; i < 12; i++) {
      const u = (i / 12) * TAU;
      const kb = st.bulge ? st.bulge(cv, Math.cos(u), Math.sin(u)) : 1;
      const cu = Math.cos(u) * sv * kb;
      const su = Math.sin(u) * sv * kb;
      if (
        !sk.p3(
          C[0] + A1[0] * cv + A2[0] * cu + A3[0] * su,
          C[1] + A1[1] * cv + A2[1] * cu + A3[1] * su,
          C[2] + A1[2] * cv + A2[2] * cu + A3[2] * su,
          Q,
        )
      )
        continue;
      BX[n] = Q[0];
      BY[n] = Q[1];
      zs += Q[2];
      n++;
    }
  }
  for (const s of [-1, 1]) {
    if (sk.p3(C[0] + A1[0] * s, C[1] + A1[1] * s, C[2] + A1[2] * s, Q)) {
      BX[n] = Q[0];
      BY[n] = Q[1];
      zs += Q[2];
      n++;
    }
  }
  if (n < 10) return false;
  let x0 = 1e9;
  let x1 = -1e9;
  let y0 = 1e9;
  let y1 = -1e9;
  for (let i = 0; i < n; i++) {
    x0 = Math.min(x0, BX[i]);
    x1 = Math.max(x1, BX[i]);
    y0 = Math.min(y0, BY[i]);
    y1 = Math.max(y1, BY[i]);
  }
  if (x1 < -sk.A - 0.1 || x0 > sk.A + 0.1 || y1 < -1.1 || y0 > 1.1) return false;
  const wd = dw(sk, zs / n);
  sk.id = base;
  const h = hullFill(sk, BX, BY, n);
  const amp0 = sk.amp;
  // strands along the long axis
  const l1 = Math.hypot(A1[0], A1[1], A1[2]);
  const l2 = Math.hypot(A2[0], A2[1], A2[2]);
  const l3 = Math.hypot(A3[0], A3[1], A3[2]);
  sk.amp = 0.55;
  const floor = st.floor ?? 0.12;
  const w = st.w ?? 0.55;
  for (let s = 0; s < st.m; s++) {
    const u = ((s + 0.5 + (hash(s, st.seed) - 0.5) * 0.5) / st.m) * TAU;
    const thr = mix(floor, 1, (s * 0.618034 + hash(st.seed, 9)) % 1);
    const cu = Math.cos(u);
    const su = Math.sin(u);
    let on0 = false;
    let run = 0;
    const steps = 10;
    for (let j = 1; j < steps; j++) {
      const v = (j / steps) * Math.PI;
      const cv = Math.cos(v);
      const sv = Math.sin(v) * (st.bulge ? st.bulge(cv, cu, su) : 1);
      const x = C[0] + A1[0] * cv + (A2[0] * cu + A3[0] * su) * sv;
      const y = C[1] + A1[1] * cv + (A2[1] * cu + A3[1] * su) * sv;
      const z = C[2] + A1[2] * cv + (A2[2] * cu + A3[2] * su) * sv;
      let nx =
        (A1[0] / (l1 * l1)) * cv + ((A2[0] / (l2 * l2)) * cu + (A3[0] / (l3 * l3)) * su) * sv;
      let ny =
        (A1[1] / (l1 * l1)) * cv + ((A2[1] / (l2 * l2)) * cu + (A3[1] / (l3 * l3)) * su) * sv;
      let nz =
        (A1[2] / (l1 * l1)) * cv + ((A2[2] / (l2 * l2)) * cu + (A3[2] / (l3 * l3)) * su) * sv;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      const fx = sk.ex - x;
      const fy = sk.ey - y;
      const fz = sk.ez - z;
      const facing = (nx * fx + ny * fy + nz * fz) / (Math.hypot(fx, fy, fz) || 1);
      let on = false;
      let l = 0;
      if (facing > 0.08) {
        l = sun(x, y, z, nx, ny, nz);
        on = l > thr + (hash(s * 31 + j, st.seed + 3) - 0.5) * 0.12;
      }

      if (on) {
        if (!on0) {
          sk.id = base + 10 + s * 6 + (run % 6);
          sk.m3(x, y, z);
          on0 = true;
        } else sk.l3(x, y, z, 0.6 + 0.9 * l);
      } else if (on0) {
        if (sk.count3 >= 2) sk.s3(w, 0.3, 0.4);
        on0 = false;
        run++;
      }
    }
    if (on0 && sk.count3 >= 2) sk.s3(w, 0.3, 0.4);
  }
  // rings round its girth, the way a hand shades a barrel: broken where the light breaks
  if (st.girth) {
    sk.amp = 0.5;
    const R = st.girth;
    // as many rings as its size on the view can hold (they join one at a time as it nears)
    let ext = 0;
    for (let i = 1; i < n; i++)
      ext = Math.max(ext, Math.abs(BX[i] - BX[0]) + Math.abs(BY[i] - BY[0]));
    const Ron = Math.max(5, (ext * sk.px) / 9);
    for (let k = 0; k < R; k++) {
      if (vdc(k) * R >= Ron) continue;
      const v = Math.PI * (0.2 + (0.52 * (k + 0.5 + (hash(k, st.seed + 60) - 0.5) * 0.6)) / R);
      const cv = Math.cos(v);
      const sv = Math.sin(v);
      const thr = mix(st.gfloor ?? 0.12, 0.85, ((k * 0.618034 + hash(st.seed, 61)) % 1) ** 1.4);
      const u0 = hash(k, st.seed + 62) * TAU;
      let on0 = false;
      let run = 0;
      const steps = 16;
      for (let j = 0; j <= steps; j++) {
        const u = u0 + (j / steps) * TAU;
        const cu = Math.cos(u);
        const su = Math.sin(u);
        const svb = sv * (st.bulge ? st.bulge(cv, cu, su) : 1);
        const x = C[0] + A1[0] * cv + (A2[0] * cu + A3[0] * su) * svb;
        const y = C[1] + A1[1] * cv + (A2[1] * cu + A3[1] * su) * svb;
        const z = C[2] + A1[2] * cv + (A2[2] * cu + A3[2] * su) * svb;
        let nx =
          (A1[0] / (l1 * l1)) * cv + ((A2[0] / (l2 * l2)) * cu + (A3[0] / (l3 * l3)) * su) * sv;
        let ny =
          (A1[1] / (l1 * l1)) * cv + ((A2[1] / (l2 * l2)) * cu + (A3[1] / (l3 * l3)) * su) * sv;
        let nz =
          (A1[2] / (l1 * l1)) * cv + ((A2[2] / (l2 * l2)) * cu + (A3[2] / (l3 * l3)) * su) * sv;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl;
        ny /= nl;
        nz /= nl;
        const fx = sk.ex - x;
        const fy = sk.ey - y;
        const fz = sk.ez - z;
        const facing = (nx * fx + ny * fy + nz * fz) / (Math.hypot(fx, fy, fz) || 1);
        let on = false;
        let l = 0;
        if (facing > 0.06) {
          l = sun(x, y, z, nx, ny, nz);
          on =
            l > thr + (hash(k * 41 + j, st.seed + 63) - 0.5) * 0.25 &&
            hash(k * 7 + j, st.seed + 64) > 0.12;
        }

        if (on) {
          if (!on0) {
            sk.id = base + 260 + k * 6 + (run % 6);
            sk.m3(x, y, z);
            on0 = true;
          } else sk.l3(x, y, z, 0.6 + 0.9 * l);
        } else if (on0) {
          if (sk.count3 >= 2) sk.s3(w, 0.3, 0.4);
          on0 = false;
          run++;
        }
      }
      if (on0 && sk.count3 >= 2) sk.s3(w, 0.3, 0.4);
    }
  }
  // markings along the top: small loose rings, where the sun shows them
  if (st.spots) {
    sk.amp = 0.4;
    for (let k = 0; k < st.spots; k++) {
      const v =
        mix(0.25, 0.8, (k + 0.5) / st.spots) * Math.PI + (hash(k, st.seed + 50) - 0.5) * 0.15;
      const u = -Math.PI / 2 + (hash(k, st.seed + 51) - 0.5) * 1.6;
      const cv = Math.cos(v);
      const sv = Math.sin(v);
      const cu = Math.cos(u);
      const su = Math.sin(u);
      const x = C[0] + A1[0] * cv + (A2[0] * cu + A3[0] * su) * sv;
      const y = C[1] + A1[1] * cv + (A2[1] * cu + A3[1] * su) * sv;
      const z = C[2] + A1[2] * cv + (A2[2] * cu + A3[2] * su) * sv;
      if (open(x, y, z) < 0.3 || !sk.p3(x, y, z, Q)) continue;
      const r = ((0.05 + 0.04 * hash(k, st.seed + 52)) * sk.foc) / Q[2];
      if (r * sk.px < 1.5) continue;
      sk.id = base + 430 + k;
      sk.ring(Q[0], Q[1], r * 1.2, r * 0.8, 0.6 * wd);
    }
  }
  // the silhouette: heavy away from the light (lower right)
  sk.amp = 0.85;
  if (h >= 3) {
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < h; i++) {
      cx += HULLX[i];
      cy += HULLY[i];
    }
    cx /= h;
    cy /= h;
    const s0 = Math.floor(hash(base, sk.boil) * h);
    sk.id = base + 2;
    for (let k = 0; k <= h + 2; k++) {
      const i = (s0 + k) % h;
      if (k === 0) sk.m(HULLX[i], HULLY[i]);
      else sk.l(HULLX[i], HULLY[i]);
    }
    sk.s((st.edge ?? 1.1) * wd, 0.06, 0.8);
    sk.id = base + 3;
    let first = true;
    let started = false;
    for (let k = 0; k <= h; k++) {
      const i = (k + Math.floor(h * 0.75)) % h;
      const sh = (HULLX[i] - cx) * 0.55 + (HULLY[i] - cy) * 0.83;
      if (sh > 0) {
        if (first) {
          sk.m(HULLX[i], HULLY[i]);
          first = false;
          started = true;
        } else sk.l(HULLX[i], HULLY[i]);
      } else if (started) break;
    }
    if (started && sk.count >= 2) sk.s(0.9 * wd, 0.2, 0.6);
  }
  sk.amp = amp0;
  sk.id = base + 500;
  return true;
}

// ---------------------------------------------------------------- the grazer

const NK = new Float32Array(4 * 30);
const LG = new Float32Array(4 * 12);

const norm3 = (v: number[]) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  v[0] /= l;
  v[1] /= l;
  v[2] /= l;
  return v;
};

/** The grazer's state: how far its head is lifted, and its ear-fronds' lag. */
export class Grazer {
  lift = new Float64Array(2);
  ear = new Float64Array(4);
  gaze = new Gaze(71, 0.64, 0.55, 0.55);
  t = 0;
  hp = [0, 0, 0];
  hpPrev = [0, 0, 0];

  reset() {
    this.lift.fill(0);
    this.ear.fill(0);
    this.gaze.reset();
    this.t = 0;
    this.headAt(0, this.hp);
    this.hpPrev[0] = this.hp[0];
    this.hpPrev[1] = this.hp[1];
    this.hpPrev[2] = this.hp[2];
  }

  /** Where its head is for a lift k. */
  headAt(k: number, o: number[]) {
    const nod = (1 - k) * 0.035 * Math.sin(this.t * 7.1) * (0.5 + 0.5 * Math.sin(this.t * 1.3));
    o[0] = mix(2.15, 1.95, k) + 0.04 * Math.sin(this.t * 0.6);
    o[1] = mix(-0.85, -4.75, k) + nod + 0.03 * Math.sin(this.t * 0.9);
    o[2] = mix(9.7, 9.45, k);
  }

  step(dt: number, t: number) {
    this.t = t;
    // it lifts its head as we come out and watches us pass, settling a little as it goes on
    const want = t > 7.3 ? (t < 11.4 ? 1 : 0.5) : 0;
    spring(this.lift, 0, want, want ? 2.1 : 1.4, 0.78, dt);
    this.hpPrev[0] = this.hp[0];
    this.hpPrev[1] = this.hp[1];
    this.hpPrev[2] = this.hp[2];
    this.headAt(clamp(this.lift[0], -0.05, 1.1), this.hp);
    // the fronds on its head trail its movement
    const vx = (this.hp[0] - this.hpPrev[0]) / Math.max(dt, 1e-3);
    const vy = (this.hp[1] - this.hpPrev[1]) / Math.max(dt, 1e-3);
    spring(this.ear, 0, -vx * 0.12, 9, 0.35, dt);
    spring(this.ear, 2, -vy * 0.12, 9, 0.35, dt);
    // its eyes: on the plants, then on us
    const k = this.lift[0];
    if (k > 0.55) {
      if (t < 8.8) {
        this.gaze.forceX = 0;
        this.gaze.forceY = 0;
        this.gaze.forceUntil = 8.8;
      }
    } else {
      this.gaze.forceX = 0.1;
      this.gaze.forceY = 0.55;
      this.gaze.forceUntil = t + 0.2;
    }
    this.gaze.step(dt, t);
    // a long, slow blink at us once it has looked a while
    if (t >= 10.1 && t - dt < 10.1) this.gaze.blink(t, 1);
  }
}

/** Draw the grazer: legs, body, neck, head, eyes, the fronds on its head. */
export function grazer(sk: Sketch, G: Grazer, t: number) {
  const base = sk.id;
  const br = 1 + 0.018 * Math.sin(t * 1.05) + 0.008 * Math.sin(t * 2.3 + 1);
  // the body: long axis toward its head (to our left and toward us)
  const C = [4.4, -3.05, 10.75];
  const A1 = norm3([-0.95, -0.06, -0.24]);
  const A3 = norm3([A1[2], 0, -A1[0]]);
  const s1 = 1.7 * br;
  const s2 = 0.95 * br;
  const s3 = 0.85 * br;
  const a1 = [A1[0] * s1, A1[1] * s1, A1[2] * s1];
  const a2 = [0, -s2, 0];
  const a3 = [A3[0] * s3, A3[1] * s3, A3[2] * s3];
  // legs: the far ones first
  const leg = (fx: number, side: number, id: number, near = false) => {
    const hx = C[0] + A1[0] * fx * s1 + A3[0] * side * 0.5;
    const hz = C[2] + A1[2] * fx * s1 + A3[2] * side * 0.5;
    const sway = 0.03 * Math.sin(t * 0.7 + id);
    for (let i = 0; i <= 8; i++) {
      const s = i / 8;
      const knee = Math.sin(Math.PI * s) * 0.14;
      LG[i * 4] = hx + A1[0] * knee + sway * s;
      LG[i * 4 + 1] = mix(C[1] + 0.55, 0, s);
      LG[i * 4 + 2] = hz + A1[2] * knee;
      LG[i * 4 + 3] =
        mix(0.17, 0.085, s ** 0.7) * (1 + 0.35 * Math.exp(-(((s - 0.55) / 0.08) ** 2)));
    }
    sk.id = base + 100 + id * 700;
    tube(sk, LG, 9, { edge: 1.1, hatch: 1.2, seed: 80 + id, from: near ? 0.22 : 0 });
  };
  const farSide = A3[0] * (sk.ex - C[0]) + A3[2] * (sk.ez - C[2]) > 0 ? -1 : 1;
  leg(0.62, farSide, 0);
  leg(-0.68, farSide, 1);
  // a long tail, behind, its tip rolled
  sk.id = base + 3000;
  {
    const tx = C[0] - A1[0] * s1 * 0.95;
    const ty = C[1] - 0.25;
    const tz = C[2] - A1[2] * s1 * 0.95;
    let x = tx;
    let y = ty;
    let z = tz;
    sk.m3(x, y, z);
    for (let i = 1; i <= 14; i++) {
      const s = i / 14;
      const sw = 0.3 * Math.sin(t * 0.8 - s * 2.2) * s;
      x = tx - A1[0] * s * 1.3 + sw * A3[0];
      y = ty + s * 1.0 - s * s * 0.35;
      z = tz - A1[2] * s * 1.3 + sw * A3[2];
      sk.l3(x, y, z, 1 - 0.6 * s);
    }
    sk.s3(1.3, 0.05, 0.5);
  }
  // the body: one form, but never a plain oval: a deep chest and shoulder hump in front, a
  // waist, a rounded haunch, the belly hanging a little
  sk.id = base + 3100;
  blob(sk, C, a1, a2, a3, { m: 22, floor: 0.7, girth: 26, edge: 1.4, seed: 81, bulge: BODY });
  leg(0.62, -farSide, 2, true);
  leg(-0.68, -farSide, 3, true);
  // the neck: up from the front of the body to the head
  const hp = G.hp;
  const k = clamp(G.lift[0], 0, 1.1);
  const n0 = [C[0] + A1[0] * s1 * 0.72, C[1] - 0.45, C[2] + A1[2] * s1 * 0.72];
  // the neck rises toward the head, but never above it (y is down): when the head comes down
  // the curve comes down with it instead of arching up over the head
  const c1 = [
    n0[0] + A1[0] * 0.55,
    Math.max(n0[1] - 0.7 - 1.3 * k, G.hp[1] + 0.15),
    n0[2] + A1[2] * 0.55,
  ];
  // the head's direction: down into the plants, then toward us
  // turned partway toward us (three-quarters), not full face
  const toUs = norm3([sk.ex - hp[0], (sk.ey - hp[1]) * 0.3, sk.ez - hp[2]]);
  const tw = [toUs[0] * 0.7 + A1[0] * 0.55, toUs[1] * 0.7 + 0.12, toUs[2] * 0.7 + A1[2] * 0.55];
  const hd = norm3([mix(-0.35, tw[0], k), mix(0.95, tw[1], k), mix(-0.12, tw[2], k)]);
  const c2 = [
    hp[0] - hd[0] * 0.5 + 0.1,
    hp[1] - hd[1] * 0.5 + mix(-0.6, 0.45, k),
    hp[2] - hd[2] * 0.5,
  ];
  const NKn = 18;
  for (let i = 0; i <= NKn; i++) {
    const s = i / NKn;
    const u = 1 - s;
    const a = u * u * u;
    const b = 3 * u * u * s;
    const c = 3 * u * s * s;
    const d = s * s * s;
    NK[i * 4] = a * n0[0] + b * c1[0] + c * c2[0] + d * hp[0];
    NK[i * 4 + 1] = a * n0[1] + b * c1[1] + c * c2[1] + d * hp[1];
    NK[i * 4 + 2] = a * n0[2] + b * c1[2] + c * c2[2] + d * hp[2];
    NK[i * 4 + 3] = mix(0.34, 0.13, s ** 0.75);
  }
  sk.id = base + 4150;
  tube(sk, NK, NKn + 1, { edge: 1.3, hatch: 1.1, seed: 83, from: 0.12 });
  // a soft mane of fronds along the top of its neck and back, each rolled at the tip
  {
    const amp0 = sk.amp;
    sk.amp = 0.5;
    const tuft = (
      x: number,
      y: number,
      z: number,
      bx: number,
      by: number,
      bz: number,
      len: number,
      id: number,
    ) => {
      if (!sk.p3(x, y, z, Q)) return;
      const ax = Q[0];
      const ay = Q[1];
      const az = Q[2];
      if (!sk.p3(x + bx, y + by, z + bz, Q)) return;
      const l = (len * sk.foc) / az;
      if (l * sk.px < 3) return;
      // up, leaning back the way (bx, bz) points, rolled at the end
      let hx = Q[0] - ax;
      let hy = Q[1] - ay;
      const hl = Math.hypot(hx, hy) || 1;
      hx /= hl;
      hy /= hl;
      const sw = 0.25 * Math.sin(t * 1.4 + id * 0.9);
      let h = Math.atan2(-1 + hy * 0.6, hx * 0.6) + sw * 0.3;
      let px = ax;
      let py = ay;
      sk.id = base + 4800 + id;
      sk.m(px, py);
      for (let i = 1; i <= 7; i++) {
        const st = (l / 7) * (1 - 0.06 * i);
        h += i > 3 ? 0.45 * (hx >= 0 ? 1 : -1) : 0.06 * (hx >= 0 ? 1 : -1);
        px += Math.cos(h) * st;
        py += Math.sin(h) * st;
        sk.l(px, py);
      }
      sk.s(0.65 * dw(sk, az), 0.15, 0.3);
    };
    for (let i = 3; i < NKn - 2; i++) {
      const r = NK[i * 4 + 3];
      const bx = NK[i * 4 - 4] - NK[i * 4];
      const by = NK[i * 4 - 3] - NK[i * 4 + 1];
      const bz = NK[i * 4 - 2] - NK[i * 4 + 2];
      tuft(
        NK[i * 4],
        NK[i * 4 + 1] - r * 0.92,
        NK[i * 4 + 2],
        bx,
        by,
        bz,
        r * (1.3 + 0.5 * hash(i, 87)),
        i,
      );
    }
    for (let j = 0; j < 9; j++) {
      const v = (0.22 + 0.62 * (j / 8)) * Math.PI;
      const x = C[0] + A1[0] * Math.cos(v) * s1 * 0.97;
      const z = C[2] + A1[2] * Math.cos(v) * s1 * 0.97;
      const y = C[1] - s2 * Math.sin(v) * 0.98;
      tuft(x, y, z, -A1[0], 0, -A1[2], 0.22 + 0.1 * hash(j, 88), 40 + j);
    }
    sk.amp = amp0;
  }
  // the head: a soft long skull, a rounded muzzle
  const side = norm3([hd[2], 0, -hd[0]]);
  const hu = norm3([
    side[1] * hd[2] - side[2] * hd[1],
    side[2] * hd[0] - side[0] * hd[2],
    side[0] * hd[1] - side[1] * hd[0],
  ]);
  if (hu[1] > 0) {
    hu[0] = -hu[0];
    hu[1] = -hu[1];
    hu[2] = -hu[2];
  }
  const hc = [hp[0] + hd[0] * 0.12, hp[1] + hd[1] * 0.12, hp[2] + hd[2] * 0.12];
  // long soft ears, hanging back from the top of its head and swinging after it
  const earFor = (sd: number) => {
    const bx = hc[0] - hd[0] * 0.18 + side[0] * sd * 0.17 + hu[0] * 0.17;
    const by = hc[1] - hd[1] * 0.18 + side[1] * sd * 0.17 + hu[1] * 0.17;
    const bz = hc[2] - hd[2] * 0.18 + side[2] * sd * 0.17 + hu[2] * 0.17;
    const sw = 0.12 * Math.sin(t * 1.3 + sd) + G.ear[0] * sd * 0.5;
    // up and back from the crown, a little out to the side, trailing the head's movement
    const dir: [number, number, number] = [
      -hd[0] * 0.6 + hu[0] * 0.75 + side[0] * sd * (0.35 + sw) + G.ear[0],
      -hd[1] * 0.6 + hu[1] * 0.75 + G.ear[2],
      -hd[2] * 0.6 + hu[2] * 0.75 + side[2] * sd * (0.35 + sw),
    ];
    return frame([bx, by, bz], dir, [side[0] * sd, -0.2, side[2] * sd - 0.3], 0.5);
  };
  // the far ear behind the head
  const farEar = side[0] * (sk.ex - hc[0]) + side[2] * (sk.ez - hc[2]) > 0 ? -1 : 1;
  sk.id = base + 12000;
  leaf(sk, earFor(farEar), EAR, { light: sun, hatch: 3, floor: 0.1, edge: 1.2, veins: false });
  // the muzzle first, low at the front; the skull over it
  const mc = [
    hc[0] + hd[0] * 0.33 - hu[0] * 0.1,
    hc[1] + hd[1] * 0.33 - hu[1] * 0.1,
    hc[2] + hd[2] * 0.33 - hu[2] * 0.1,
  ];
  sk.id = base + 6500;
  blob(
    sk,
    mc,
    [hd[0] * 0.22, hd[1] * 0.22, hd[2] * 0.22],
    [hu[0] * 0.13, hu[1] * 0.13, hu[2] * 0.13],
    [side[0] * 0.14, side[1] * 0.14, side[2] * 0.14],
    { m: 8, floor: 0.5, girth: 5, edge: 1.0, seed: 86 },
  );
  sk.id = base + 6000;
  blob(
    sk,
    hc,
    [hd[0] * 0.4, hd[1] * 0.4, hd[2] * 0.4],
    [hu[0] * 0.25, hu[1] * 0.25, hu[2] * 0.25],
    [side[0] * 0.21, side[1] * 0.21, side[2] * 0.21],
    { m: 12, floor: 0.5, girth: 9, edge: 1.3, seed: 85 },
  );
  // nostrils
  {
    const nx = mc[0] + hd[0] * 0.2 + hu[0] * 0.03;
    const ny = mc[1] + hd[1] * 0.2 + hu[1] * 0.03;
    const nz = mc[2] + hd[2] * 0.2 + hu[2] * 0.03;
    for (const sd of [-1, 1]) {
      sk.id = base + 6900 + (sd > 0 ? 1 : 0);
      if (
        !sk.p3(
          nx + side[0] * sd * 0.05 + hu[0] * 0.03,
          ny + side[1] * sd * 0.07 + hu[1] * 0.03,
          nz + side[2] * sd * 0.07 + hu[2] * 0.03,
          Q,
        )
      )
        continue;
      const r = (0.018 * sk.foc) / Q[2];
      sk.arc(Q[0], Q[1], r * 1.3, r, 0.3, 3.6).s(0.7, 0.2, 0.2);
    }
  }
  // its eyes, big and dark, on the sides of its head; they see us when it turns to us
  const look = G.gaze.look(t, LK);
  for (const sd of [-1, 1]) {
    const en = norm3([
      side[0] * sd * 0.8 + hd[0] * 0.5 + hu[0] * 0.15,
      side[1] * sd * 0.8 + hd[1] * 0.5 + hu[1] * 0.15,
      side[2] * sd * 0.8 + hd[2] * 0.5 + hu[2] * 0.15,
    ]);
    const ex = hc[0] + en[0] * 0.21 + hu[0] * 0.04 + hd[0] * 0.04;
    const ey = hc[1] + en[1] * 0.21 + hu[1] * 0.04 + hd[1] * 0.04;
    const ez = hc[2] + en[2] * 0.21 + hu[2] * 0.04 + hd[2] * 0.04;
    const fx = sk.ex - ex;
    const fy = sk.ey - ey;
    const fz = sk.ez - ez;
    const facing = (en[0] * fx + en[1] * fy + en[2] * fz) / (Math.hypot(fx, fy, fz) || 1);
    sk.id = base + 7000 + (sd > 0 ? 200 : 0);
    if (facing < 0.12 || !sk.p3(ex, ey, ez, Q)) continue;
    const R = (0.088 * sk.foc) / Q[2];
    eye(
      sk,
      Q[0],
      Q[1],
      R,
      0.2 * sd,
      look,
      { seed: 90 + sd, fib: 16, w: 1.0, iris: 0.8, ring: false },
      clamp(facing * 1.15, 0.4, 1),
    );
    // a few lashes along the upper lid
    if (R * sk.px > 6) {
      const amp0 = sk.amp;
      sk.amp = 0.3;
      const lid = clamp((2 * look.open - 1) * 1.45, -1.52, 1.52);
      const sl = Math.sin(lid);
      for (let j = 0; j < 5; j++) {
        const a = Math.PI * (0.25 + 0.5 * (j / 4));
        const lx = Q[0] + Math.cos(a) * R * clamp(facing * 1.15, 0.4, 1) * -sd;
        const ly = Q[1] - sl * Math.sin(a) * R;
        sk.id = base + 7500 + (sd > 0 ? 10 : 0) + j;
        sk.m(lx, ly)
          .q(
            lx - sd * R * 0.1,
            ly - R * 0.3,
            lx - sd * R * 0.3 * (j / 4 - 0.5) - sd * R * 0.15,
            ly - R * 0.42,
            3,
          )
          .s(0.7, 0.2, 0.2);
      }
      sk.amp = amp0;
    }
  }
  sk.id = base + 15000;
  leaf(sk, earFor(-farEar), EAR, { light: sun, hatch: 3, floor: 0.1, edge: 1.2, veins: false });
  sk.id = base + 18000;
}

const BODY = (cv: number, cu: number, su: number) =>
  1 +
  0.2 * Math.exp(-(((cv - 0.42) / 0.32) ** 2)) * (0.6 + 0.4 * Math.max(0, cu)) +
  0.08 * Math.exp(-(((cv + 0.55) / 0.3) ** 2)) -
  0.1 * Math.exp(-((cv / 0.22) ** 2)) +
  0.07 * Math.max(0, -cu) * (1 - cv * cv) +
  0.02 * su;

const EAR = form({
  W: 0.26,
  lobe: 0,
  p: 0.55,
  q: 0.8,
  droop: 0.15,
  keel: 0.25,
  cup: 0.15,
  veins: 5,
  slant: 0.5,
  seed: 77,
});

// ---------------------------------------------------------------- watchers in the undergrowth

export interface Watcher {
  x: number;
  y: number;
  z: number;
  /** Eye radius (m), and the gap between a pair (0 for one eye). */
  r: number;
  pair: number;
  /** When it closes its eyes and is gone (or never). */
  hide: number;
  seed: number;
  /** Leaves in front of it: angle, distance (in eye radii), size (in eye radii). */
  leaves: [number, number, number][];
}

/** Their gaze, one per eye. */
export function watcherGazes(W: Watcher[]): Gaze[][] {
  return W.map((w) =>
    w.pair > 0
      ? [new Gaze(w.seed, 0.72, 0.6, 0.6), new Gaze(w.seed, 0.72, 0.6, 0.6)]
      : [new Gaze(w.seed, 0.74, 0.7, 0.55)],
  );
}

/** Step a watcher's eyes; a pair shares one mind (the second follows the first's plan). */
export function stepWatcher(w: Watcher, g: Gaze[], dt: number, t: number) {
  g[0].step(dt, t);
  if (g.length > 1) {
    g[1].s[0] = g[0].s[0];
    g[1].s[2] = g[0].s[2];
    g[1].s[4] = g[0].s[4];
    g[1].s[6] = g[0].s[6];
    g[1].bt = g[0].bt;
    g[1].kind = g[0].kind;
    g[1].dbl = g[0].dbl;
  }
  void w;
}

/** A watcher: its eyes, the faint rim of a brow above them, and leaves in front. */
export function watcher(sk: Sketch, w: Watcher, g: Gaze[], t: number) {
  const base = sk.id;
  sk.id = base + 1000;
  if (!sk.p3(w.x, w.y, w.z, Q)) return;
  const cx = Q[0];
  const cy = Q[1];
  const R = (w.r * sk.foc) / Q[2];
  if (R * sk.px < 2 || Math.abs(cx) > sk.A + 0.2 || Math.abs(cy) > 1.2) return;
  const wd = dw(sk, Q[2]);
  // shutting for good
  // hiding: it narrows its eyes and ducks down behind the leaf in front of it
  const gone = w.hide > 0 ? smooth(w.hide, w.hide + 0.4, t) : 0;
  const duck = w.hide > 0 ? R * 1.5 * smooth(w.hide + 0.1, w.hide + 0.6, t) ** 1.5 : 0;
  const sep = (w.pair * sk.foc) / Q[2];
  const n = w.pair > 0 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const look = g[i].look(t, LK);
    look.open *= 1 - gone;
    look.low = Math.max(look.low, gone);
    // the head's tilt
    const tilt = 0.12 * Math.sin(w.seed) + 0.05 * noise(t * 0.3, w.seed);
    const ex = cx + (n > 1 ? (i ? 0.5 : -0.5) * sep : 0) * Math.cos(tilt);
    const ey =
      cy +
      (n > 1 ? (i ? 0.5 : -0.5) * sep : 0) * Math.sin(tilt) +
      (n > 1 && i ? R * 0.08 : 0) +
      duck;
    if (duck > R * 1.45) continue;
    sk.id = base + i * 130;
    eye(sk, ex, ey, R * (n > 1 && i ? 0.94 : 1), tilt, look, {
      seed: w.seed * 3 + i,
      fib: 30,
      w: 0.9,
      ring: false,
      lidLines: clamp((R * sk.px) / 6, 1, 2.4),
    });
  }
  // the brow of whatever this is, caught by a little light
  if (n > 1 && duck < R * 1.4) {
    sk.amp = 0.6;
    sk.id = base + 300;
    sk.m(cx - sep * 1.05, cy - R * 0.9 + duck)
      .q(cx - sep * 0.5, cy - R * 2.3 + duck, cx, cy - R * 1.9 + duck, 6)
      .q(cx + sep * 0.5, cy - R * 2.4 + duck, cx + sep * 1.1, cy - R * 1.1 + duck, 6)
      .s(0.7 * wd, 0.35, 0.5);
    sk.amp = 1;
  }
  // leaves in front, dark, a rim of light along one edge: one low across, so the eyes peek
  // over it, and others rising beside
  const amp0 = sk.amp;
  const half = n > 1 ? sep * 0.5 : 0;
  const lv = (bx: number, by: number, ang: number, L: number, wf: number, k: number) => {
    const sw = 0.05 * Math.sin(t * 0.9 + k * 2 + w.seed) + 0.03 * noise(t * 0.5 + k, w.seed);
    const a = ang + sw;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const ex = bx + ca * L;
    const ey = by + sa * L;
    const wx = -sa * L * wf;
    const wy = ca * L * wf;
    const bend = 0.08 * L;
    sk.id = base + 400 + k * 6;
    sk.m(bx, by)
      .q(mix(bx, ex, 0.45) + wx + bend * ca, mix(by, ey, 0.45) + wy + bend * sa, ex, ey, 5)
      .q(mix(bx, ex, 0.45) - wx, mix(by, ey, 0.45) - wy, bx, by, 5);
    sk.fill();
    sk.amp = 0.8;
    sk.id = base + 401 + k * 6;
    sk.m(bx, by)
      .q(mix(bx, ex, 0.45) + wx + bend * ca, mix(by, ey, 0.45) + wy + bend * sa, ex, ey, 5)
      .s(0.9 * wd, 0.08, 0.6);
    sk.id = base + 402 + k * 6;
    sk.m(ex, ey)
      .q(mix(bx, ex, 0.45) - wx, mix(by, ey, 0.45) - wy, bx, by, 5)
      .s(0.55 * wd, 0.3, 0.5);
    sk.amp = 0.5;
    sk.id = base + 403 + k * 6;
    sk.m(bx, by)
      .q(
        mix(bx, ex, 0.5) + bend * ca * 0.5,
        mix(by, ey, 0.5) + bend * sa * 0.5,
        mix(bx, ex, 0.88),
        mix(by, ey, 0.88),
        5,
      )
      .s(0.5 * wd, 0.3, 0.3);
  };
  const flip = hash(w.seed, 5) < 0.5 ? 1 : -1;
  lv(
    cx - flip * (half + R * 3.2),
    cy + R * 1.35,
    flip > 0 ? -0.1 : Math.PI + 0.1,
    2 * half + R * 6.8,
    0.17,
    0,
  );
  if (w.leaves.length > 1)
    lv(cx - half - R * 1.7, cy + R * 3.4, -Math.PI / 2 - 0.5, R * 5.2, 0.24, 1);
  if (w.leaves.length > 2)
    lv(cx + half + R * 1.5, cy + R * 3.6, -Math.PI / 2 + 0.55, R * 5.8, 0.24, 2);
  sk.amp = amp0;
  sk.id = base + 1000;
}

// ---------------------------------------------------------------- fliers

export interface Flier {
  /** Where it flies about, how far it wanders, how fast. */
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  speed: number;
  /** Size (m, half-span). */
  s: number;
  seed: number;
  /** A straight run across, if any: from, to, start time, duration. */
  run?: [number, number, number, number, number, number, number, number];
}

/** Where a flier is at t. */
export function flierAt(F: Flier, t: number, o: number[]) {
  const s = F.seed;
  const v = F.speed;
  o[0] = F.x + F.rx * (0.7 * noise(t * 0.31 * v, s) + 0.3 * Math.sin(t * 0.9 * v + s));
  o[1] = F.y + F.ry * (0.6 * noise(t * 0.43 * v, s + 1) + 0.4 * Math.sin(t * 1.7 * v + s * 2));
  o[2] = F.z + F.rz * noise(t * 0.27 * v, s + 2);
  if (F.run) {
    const [x0, y0, z0, x1, y1, z1, t0, d] = F.run;
    const k = smooth(t0, t0 + d, t);
    const w = 0.2 * Math.sin(t * 2.3 + s);
    o[0] = mix(o[0], mix(x0, x1, k), smooth(t0 - 1, t0, t) * (1 - smooth(t0 + d, t0 + d + 1, t)));
    o[1] = mix(
      o[1],
      mix(y0, y1, k) + w * 0.4,
      smooth(t0 - 1, t0, t) * (1 - smooth(t0 + d, t0 + d + 1, t)),
    );
    o[2] = mix(o[2], mix(z0, z1, k), smooth(t0 - 1, t0, t) * (1 - smooth(t0 + d, t0 + d + 1, t)));
  }
}

const FP = [0, 0, 0];
const FP2 = [0, 0, 0];

/** A small flier: a body that is an eye, two pairs of moth wings flicking. */
export function flier(sk: Sketch, F: Flier, g: Gaze, t: number) {
  const base = sk.id;
  sk.id = base + 300;
  flierAt(F, t, FP);
  flierAt(F, t + 0.05, FP2);
  if (!sk.p3(FP[0], FP[1], FP[2], Q)) return;
  const cx = Q[0];
  const cy = Q[1];
  const z = Q[2];
  const S = (F.s * sk.foc) / z;
  if (S * sk.px < 3 || Math.abs(cx) > sk.A + 0.1 || Math.abs(cy) > 1.1) return;
  const wd = dw(sk, z) * clamp((S * sk.px) / 14, 0.6, 1.3);
  // heading on the view
  const c2 = [0, 0, 0];
  let hx = 1;
  let hy = 0;
  if (sk.p3(FP2[0], FP2[1], FP2[2], c2)) {
    hx = c2[0] - cx;
    hy = c2[1] - cy;
    const l = Math.hypot(hx, hy) || 1;
    hx /= l;
    hy /= l;
  }
  const bank = clamp(hx * 0.4, -0.4, 0.4) + 0.1 * Math.sin(t * 2.1 + F.seed);
  // wings flick between two drawings, on the boil
  const up = (sk.boil + F.seed) % 2 === 0;
  const lit = open(FP[0], FP[1], FP[2]);
  const amp0 = sk.amp;
  sk.amp = 0.45;
  sk.push(cx, cy, bank, S, S);
  // hind wings first, then the fore wings over them: each a broad rounded lobe, cleared, its
  // edge scalloped, veins fanning from the root, an eyespot on the fore wing where it is lit
  for (const hind of [1, 0]) {
    for (const sd of [-1, 1]) {
      const ang0 = hind ? (up ? 0.25 : 0.6) : up ? -0.75 : -0.3;
      const ang = sd > 0 ? ang0 : Math.PI - ang0;
      const len = (hind ? 0.68 : 1.0) * (up ? 0.92 : 1.0);
      const wid = (hind ? 0.42 : 0.56) * len;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const rx = sd * 0.16;
      const ry = hind ? 0.08 : -0.05;
      const cxw = rx + ca * len * 0.52;
      const cyw = ry + sa * len * 0.52;
      const P: number[] = [];
      for (let i = 0; i <= 12; i++) {
        const th = (i / 12) * TAU;
        const outer = Math.max(0, Math.cos(th));
        const sc =
          1 + 0.05 * Math.sin(3 * th + F.seed) - 0.07 * outer * Math.abs(Math.sin(th * 4.5));
        const u = Math.cos(th) * len * 0.5 * sc;
        const v = Math.sin(th) * wid * 0.5 * sc * (1 + 0.25 * Math.cos(th));
        P.push(cxw + ca * u - sa * v, cyw + sa * u + ca * v);
      }
      const k = base + (hind ? 60 : 0) + (sd > 0 ? 0 : 30);
      sk.id = k;
      sk.m(P[0], P[1]);
      for (let i = 1; i < P.length / 2; i++) sk.l(P[i * 2], P[i * 2 + 1]);
      sk.fill();
      sk.id = k + 1;
      sk.m(P[0], P[1]);
      for (let i = 1; i < P.length / 2; i++) sk.l(P[i * 2], P[i * 2 + 1]);
      sk.l(P[2], P[3]);
      sk.s((hind ? 0.6 : 0.75) * wd, 0.08, 0.4);
      for (let v = 0; v < 2; v++) {
        const f = (v - 0.5) * 0.8;
        sk.id = k + 2 + v;
        const ex = cxw + ca * len * 0.38 - sa * wid * 0.32 * f;
        const ey = cyw + sa * len * 0.38 + ca * wid * 0.32 * f;
        sk.m(rx + ca * len * 0.06, ry + sa * len * 0.06)
          .q(cxw - sa * wid * 0.1 * f, cyw + ca * wid * 0.1 * f, ex, ey, 4)
          .s(0.45 * wd, 0.35, 0.25);
      }
      if (!hind && lit > 0.25) {
        sk.id = k + 6;
        sk.ring(cxw + ca * len * 0.15, cyw + sa * len * 0.15, wid * 0.16, wid * 0.13, 0.55 * wd);
      }
    }
  }
  sk.pop();
  sk.amp = amp0;
  // the body: an eye, looking about and at us
  sk.id = base + 100;
  eye(sk, cx, cy, S * 0.34, bank, g.look(t, LK), {
    seed: F.seed * 5,
    fib: 20,
    w: 0.8,
    lidLines: 1,
  });
  // legs trailing
  sk.amp = 0.3;
  for (let k = 0; k < 3; k++) {
    const a = Math.PI / 2 + (k - 1) * 0.35 + bank;
    sk.id = base + 250 + k;
    sk.m(cx + Math.cos(a) * S * 0.3, cy + Math.sin(a) * S * 0.3)
      .l(cx + Math.cos(a) * S * 0.6 + 0.1 * S * Math.sin(t * 3 + k), cy + Math.sin(a) * S * 0.62)
      .s(0.5 * wd, 0.2, 0.2);
  }
  sk.amp = amp0;
  sk.id = base + 300;
}

// ---------------------------------------------------------------- the drifting cap

export interface Drifter {
  path: (t: number, o: number[]) => void;
  /** Cap radius, m. */
  r: number;
  seed: number;
}

const DP = [0, 0, 0];

/** A little cap adrift in the air: gills under it, an eye hanging in them, threads trailing. */
export function drifter(sk: Sketch, D: Drifter, g: Gaze, t: number) {
  const base = sk.id;
  sk.id = base + 300;
  D.path(t, DP);
  if (!sk.p3(DP[0], DP[1], DP[2], Q)) return;
  const cx = Q[0];
  const cy = Q[1];
  const S = (D.r * sk.foc) / Q[2];
  if (S * sk.px < 3 || Math.abs(cx) > sk.A + 0.3 || Math.abs(cy) > 1.3) return;
  const wd = dw(sk, Q[2]);
  // seen a little from below when it is above our eye
  const below = clamp(((sk.ey - DP[1]) / Math.max(0.5, Q[2])) * 1.2, -0.4, 0.6);
  const tilt = 0.08 * Math.sin(t * 0.7 + D.seed) + 0.05 * noise(t * 0.5, D.seed);
  const breath = 1 + 0.04 * Math.sin(t * 1.6 + D.seed);
  const lit = Math.max(open(DP[0], DP[1], DP[2]), 0.25);
  const ry = 0.18 + 0.32 * Math.abs(below);
  const amp0 = sk.amp;
  sk.push(cx, cy, tilt, S * breath, S);
  // threads first: they hang behind the eye
  sk.amp = 0.4;
  const nt = 7;
  for (let k = 0; k < nt; k++) {
    const x0 = -0.85 + (1.7 * (k + 0.5)) / nt + (hash(k, D.seed) - 0.5) * 0.1;
    const y0 = ry * 0.6 * Math.sqrt(Math.max(0, 1 - x0 * x0));
    const len = 0.8 + 1.4 * hash(k, D.seed + 1) ** 1.3;
    sk.id = base + 10 + k * 2;
    sk.m(x0, y0);
    let x = x0;
    let y = y0;
    for (let i = 1; i <= 7; i++) {
      const s = i / 7;
      x = x0 + 0.18 * Math.sin(t * 1.2 - s * 2.5 + k * 1.7) * s + 0.1 * s * (x0 * 0.5);
      y = y0 + len * s;
      sk.l(x, y);
    }
    sk.s(0.6 * wd, 0.1, 0.3);
    if (hash(k, D.seed + 2) < 0.6) {
      const dir = hash(k, D.seed + 3) < 0.5 ? 1 : -1;
      sk.id = base + 11 + k * 2;
      sk.m(x, y);
      let h = Math.PI / 2;
      for (let i = 1; i <= 8; i++) {
        h += dir * 0.75;
        x += Math.cos(h) * 0.06 * (1 - 0.08 * i);
        y += Math.sin(h) * 0.06 * (1 - 0.08 * i);
        sk.l(x, y);
      }
      sk.s(0.55 * wd, 0.15, 0.2);
    }
  }
  // the cap: dome and underside, cleared
  sk.id = base + 40;
  sk.m(-1, 0).q(-0.95, -0.75, 0, -0.72, 8).q(0.95, -0.75, 1, 0, 8);
  sk.arc(0, 0, 1, ry, 0, Math.PI, false);
  sk.fill();
  // the dome's light: strokes down its lit (upper left) side
  sk.amp = 0.5;
  const nd = Math.round(5 + 9 * lit);
  for (let i = 0; i < nd; i++) {
    const f = (i + 0.5) / 14;
    const x = -0.92 + f * 1.4;
    const ytop = -0.72 * Math.sqrt(Math.max(0, 1 - x * x)) * 1.02;
    sk.id = base + 50 + i;
    sk.m(x, ytop + 0.05)
      .q(x - 0.05, ytop * 0.5, x - 0.02 + 0.05 * f, -0.03, 4)
      .s(0.5 * wd, 0.35, 0.25);
  }
  // gills, seen from below
  if (below > 0.05) {
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI;
      sk.id = base + 70 + i;
      sk.m(Math.cos(a) * 0.25, Math.sin(a) * ry * 0.25)
        .l(Math.cos(a) * 0.95, Math.sin(a) * ry * 0.95)
        .s(0.45 * wd, 0.3, 0.2);
    }
  }
  // its outline: the dome heavier on the shadow side, the rim
  sk.amp = 0.8;
  sk.id = base + 100;
  sk.m(-1, 0)
    .q(-0.95, -0.75, 0, -0.72, 8)
    .q(0.95, -0.75, 1, 0, 8)
    .s(1.0 * wd, 0.06, 0.5, 1.5 * wd);
  sk.id = base + 101;
  sk.arc(0, 0, 1, ry, -0.1, Math.PI + 0.1).s(0.85 * wd, 0.1, 0.5);
  sk.pop();
  sk.amp = amp0;
  // the eye, hanging among the gills
  sk.id = base + 150;
  eye(sk, cx, cy + S * (ry * 0.6 + 0.12), S * 0.36, tilt, g.look(t, LK), {
    seed: D.seed * 7,
    fib: 24,
    w: 0.85,
    lidLines: 1,
  });
  sk.id = base + 300;
}

void DX;
void DY;
void DZ;
