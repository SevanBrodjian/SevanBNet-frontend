// A grey heron standing in the shallows, seen side on against the lit water: black, its edges
// toward the moon caught by it, and again upside down in the water, wavering. It stands as
// herons stand, the head held still and then moved, quickly, to somewhere new; the plumes on
// its head and breast stir in the air.

import { clamp, hash, mix, noise, type Sketch } from "../sketch";
import { pink, pl, pm } from "./lake-kit";

/** Where it stands (m), facing along +x, and how deep in the water. */
export const HX = -2.1;
export const HZ = 5.0;
const DEEP = 0.25;

/** Head poses it moves between: [time it moves, tilt down (rad), reach forward (m), turn]. */
const POSES: readonly [number, number, number, number][] = [
  [-9, 0, 0, 0],
  [2.7, 0.22, 0.015, 0.1],
  [6.4, -0.08, -0.01, 0],
  [7.9, 0.04, 0, 0.55],
  [11.3, 0.12, 0.01, 0.15],
];

export class Heron {
  // tilt, reach, turn: each a stiff spring with its velocity
  s = new Float64Array(6);

  reset() {
    this.s.fill(0);
  }

  step(t: number, h: number) {
    let p = POSES[0];
    for (const q of POSES) if (t >= q[0]) p = q;
    for (let k = 0; k < 3; k++) {
      // a bird's head: it jumps to where it is going, and stops there
      const w = k === 2 ? 10 : 17;
      this.s[k * 2 + 1] +=
        (w * w * (p[k + 1] - this.s[k * 2]) - 2 * 0.85 * w * this.s[k * 2 + 1]) * h;
      this.s[k * 2] += this.s[k * 2 + 1] * h;
    }
  }
}

// The silhouette, side on, facing right (m; y up from its feet), traced from the tip of the
// bill over the crown, down the back of the neck (an S), along the back to the tail, under
// the deep belly, up the full breast and the front of the neck, to the chin: counter-clockwise.
const OUT: readonly number[] = [
  // 0-6: bill, crown, nape
  0.46, 0.93, 0.37, 0.95, 0.31, 0.968, 0.275, 0.985, 0.245, 0.988, 0.218, 0.972, 0.2, 0.945,
  // 7-11: back of the neck, curving back and then down to its base
  0.175, 0.9, 0.14, 0.855, 0.112, 0.81, 0.104, 0.77, 0.105, 0.735,
  // 12-16: the hunched back, to the tail
  0.04, 0.728, -0.06, 0.712, -0.155, 0.68, -0.24, 0.628, -0.325, 0.56,
  // 17-21: under the tail, the belly
  -0.25, 0.528, -0.15, 0.48, -0.04, 0.452, 0.065, 0.458, 0.145, 0.5,
  // 22-25: the breast, the base of the neck
  0.195, 0.565, 0.212, 0.635, 0.195, 0.695, 0.163, 0.745,
  // 26-31: the front of the neck, out to the chin
  0.152, 0.79, 0.165, 0.835, 0.193, 0.878, 0.228, 0.91, 0.262, 0.928, 0.298, 0.94,
];
const N = OUT.length / 2;
const TAIL = 16;
/** How much each point moves with the head. */
const HEADW = new Float32Array(N);
for (let i = 0; i < N; i++) HEADW[i] = clamp((OUT[i * 2 + 1] - 0.84) / 0.1, 0, 1);
/** Where the head turns about. */
const PIVOT = [0.165, 0.84];

const L = new Float32Array(OUT.length);

function pose(hr: Heron, t: number) {
  const breathe = 0.004 * Math.sin(t * 1.3);
  const tilt = hr.s[0];
  const reach = hr.s[2];
  const turn = clamp(hr.s[4], 0, 1);
  for (let i = 0; i < N; i++) {
    let x = OUT[i * 2];
    let y = OUT[i * 2 + 1] + breathe;
    const w = HEADW[i];
    if (w > 0) {
      // the bill shortens as the head turns toward us
      if (x > 0.29) x = 0.29 + (x - 0.29) * Math.cos(turn * 1.1);
      const a = -tilt * w;
      const dx = x - PIVOT[0];
      const dy = y - PIVOT[1];
      x = PIVOT[0] + dx * Math.cos(a) - dy * Math.sin(a) + reach * w;
      y = PIVOT[1] + dx * Math.sin(a) + dy * Math.cos(a);
    }
    L[i * 2] = x;
    L[i * 2 + 1] = y;
  }
}

const P3 = [0, 0, 0];
// each leg: from the body, back to the ankle, forward to the foot
const LEGS = [
  0.02,
  0.47,
  -0.028,
  0.345,
  0.012,
  DEEP - 0.01,
  0.075,
  0.47,
  0.048,
  0.35,
  0.098,
  DEEP - 0.01,
];

/**
 * Draw it, or (mirror) its image in the water: wobble(h) gives the sideways shift (m) of the
 * image of a point h above the water. (mx, my): the moon's direction on the view. rim: how
 * strongly the moon catches its edges.
 */
export function heron(
  sk: Sketch,
  hr: Heron,
  t: number,
  mirror: boolean,
  wobble: (h: number) => number,
  mx: number,
  my: number,
  rim: number,
  dusk: number,
) {
  pose(hr, t);
  const sgn = mirror ? 1 : -1;
  const at = (x: number, y: number) => {
    const h = Math.max(-0.01, y - DEEP);
    sk.p3(HX + x + (mirror ? wobble(h) : 0), sgn * h, HZ, P3);
    return P3;
  };
  const base = mirror ? 16_100_000 : 16_000_000;
  // the dark of it: the body and the head fanned, the neck as a band
  const fan = (ids: readonly number[], id: number) => {
    sk.id = id;
    ids.forEach((i, k) => {
      const q = at(L[i * 2], L[i * 2 + 1]);
      if (k === 0) sk.m(q[0], q[1]);
      else sk.l(q[0], q[1]);
    });
    sk.fill();
  };
  fan([11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25], base);
  // the neck: the back of it (5-11) against the front (31-25)
  sk.id = base + 1;
  for (let k = 0; k <= 6; k++) {
    const q = at(L[(5 + k) * 2], L[(5 + k) * 2 + 1]);
    if (k === 0) sk.m(q[0], q[1]);
    else sk.l(q[0], q[1]);
  }
  for (let k = 6; k >= 0; k--) {
    const q = at(L[(31 - k) * 2], L[(31 - k) * 2 + 1]);
    sk.l(q[0], q[1]);
  }
  sk.band();
  fan([0, 1, 2, 3, 4, 5, 6, 30, 31], base + 2);
  // legs, dark against the water
  for (let k = 0; k < 2; k++) {
    sk.id = base + 4 + k;
    for (let j = 0; j < 3; j++) {
      const q = at(LEGS[k * 6 + j * 2], LEGS[k * 6 + j * 2 + 1]);
      if (j === 0) sk.m(q[0], q[1]);
      else sk.l(q[0], q[1]);
    }
    sk.e(2.4);
  }
  if (mirror) {
    // its image: the edges the moon catches, broken by the water into level dashes
    sk.amp = 0.35;
    for (let i = 0; i < N; i++) {
      if (hash(i, 405) > 0.75 * rim) continue;
      const q = at(L[i * 2], L[i * 2 + 1]);
      const len = (2 + 3 * hash(i, 406)) / sk.px;
      sk.id = base + 40 + i;
      sk.line(q[0] - len, q[1], q[0] + len, q[1], 0.6, 0.3, 0.1);
    }
    return;
  }
  // its outline in two strokes, heavier where the moon catches the edge
  sk.amp = 0.55;
  const stroke = (i0: number, i1: number, id: number) => {
    let open = false;
    for (let i = i0; i <= i1; i++) {
      const b = at(L[Math.min(N - 1, i + 1) * 2], L[Math.min(N - 1, i + 1) * 2 + 1]);
      const bx = b[0];
      const by = b[1];
      const c = at(L[Math.max(0, i - 1) * 2], L[Math.max(0, i - 1) * 2 + 1]);
      // outward, on the view (y down there, so the outline runs clockwise)
      let nx = -(by - c[1]);
      let ny = bx - c[0];
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl;
      ny /= nl;
      const lit = clamp((nx * mx + ny * my) * 1.3 + 0.25, 0, 1) * rim;
      // away from the moon the edge thins, and the hand loses it here and there
      const on = lit > 0.2 || hash(id * 31 + i, 409) < 0.55;
      const q = at(L[i * 2], L[i * 2 + 1]);
      const w = 0.3 + 1.25 * lit;
      if (on) {
        if (!open) {
          sk.id = id + i * 7;
          pm(q[0], q[1], w);
          open = true;
        } else pl(q[0], q[1], w);
      }
      if (open && (!on || i === i1)) {
        if (on) pl(q[0], q[1], w);
        pink(sk, 0.08, 0.35, 0.25);
        open = false;
      }
    }
  };
  stroke(0, TAIL, base + 10);
  stroke(TAIL, N - 1, base + 11);
  // under the bill, to its tip
  const tip = at(L[0], L[1]);
  const tx = tip[0];
  const ty = tip[1];
  const ch = at(L[(N - 1) * 2], L[(N - 1) * 2 + 1]);
  sk.id = base + 12;
  sk.line(ch[0], ch[1], tx, ty, 0.8, 0.3, 0.2);
  // the folded wing, a line along the body
  sk.amp = 0.45;
  sk.id = base + 13;
  const wing = [0.13, 0.672, 0.01, 0.632, -0.11, 0.598, -0.24, 0.566];
  for (let k = 0; k < 4; k++) {
    const q = at(wing[k * 2], wing[k * 2 + 1]);
    if (k === 0) pm(q[0], q[1], 0.5);
    else pl(q[0], q[1], 0.75 - 0.1 * k);
  }
  pink(sk, 0.3, 0.3, 0.2);
  // while the dusk lasts, a little of it on the folded wing
  sk.amp = 0.4;
  const nh = Math.round(9 * dusk);
  for (let k = 0; k < nh; k++) {
    const u = (k + 0.5 + (hash(k, 410) - 0.5) * 0.5) / 9;
    const x0 = mix(0.08, -0.2, u);
    const y0 = mix(0.645, 0.575, u) - 0.012 - 0.02 * hash(k, 411);
    const len = 0.05 + 0.05 * hash(k, 412);
    const a = at(x0, y0);
    const ax = a[0];
    const ay = a[1];
    const b = at(x0 - len, y0 - len * 0.28);
    sk.id = base + 50 + k;
    sk.line(ax, ay, b[0], b[1], 0.5, 0.35, 0.2);
  }
  // where the legs go into the water, the water rings them
  for (let k = 0; k < 2; k++) {
    const lx = LEGS[k * 6 + 4];
    for (let r = 0; r < 2; r++) {
      const rr = 0.025 + 0.025 * r + 0.006 * Math.sin(t * 1.7 + k * 2 + r);
      sk.id = base + 60 + k * 4 + r;
      for (let i = 0; i <= 8; i++) {
        const ang = Math.PI * (0.05 + (0.9 * i) / 8);
        sk.p3(HX + lx + Math.cos(ang) * rr, 0, HZ - Math.sin(ang) * rr * 0.6, P3);
        if (i === 0) pm(P3[0], P3[1], 0.45);
        else pl(P3[0], P3[1], 0.55 - 0.15 * r);
      }
      pink(sk, 0.3, 0.2, 0.1);
    }
  }
  // legs: a thin line on the moon's side
  sk.amp = 0.4;
  for (let k = 0; k < 2; k++) {
    sk.id = base + 20 + k;
    for (let j = 0; j < 3; j++) {
      const q = at(LEGS[k * 6 + j * 2] + 0.007, LEGS[k * 6 + j * 2 + 1]);
      if (j === 0) pm(q[0], q[1], 0.5 + 0.4 * rim);
      else pl(q[0], q[1], 0.45 + 0.3 * rim);
    }
    pink(sk, 0.2, 0.2, 0.2);
  }
  // plumes: two trailing from the back of the head, a few hanging from the breast
  sk.amp = 0.35;
  const air = 0.025 * noise(t * 0.6, 401) + 0.012 * Math.sin(t * 2.3);
  const plume = (ox: number, oy: number, dx: number, dy: number, sag: number, id: number) => {
    sk.id = id;
    for (let i = 0; i <= 5; i++) {
      const u = i / 5;
      const q = at(ox + dx * u + air * u * u, oy + dy * u - sag * u * u);
      if (i === 0) pm(q[0], q[1], 0.65);
      else pl(q[0], q[1], 0.65 - 0.08 * i);
    }
    pink(sk, 0.4, 0.2, 0.15);
  };
  plume(L[8], L[9], -0.11, -0.01, 0.02, base + 30);
  plume(L[10], L[11], -0.13, -0.02, 0.03, base + 31);
  for (let k = 0; k < 4; k++) {
    const i = 23 + (k >> 1);
    const f = (k & 1) * 0.5;
    const ox = mix(L[i * 2], L[(i + 1) * 2], f) - 0.005;
    const oy = mix(L[i * 2 + 1], L[(i + 1) * 2 + 1], f);
    plume(ox, oy, 0.02 + 0.01 * k, -(0.07 + 0.025 * hash(k, 402)), 0, base + 32 + k);
  }
}
