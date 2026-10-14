// How one world gives way to the next.
//
// Flow: the last frame of the old world is caught in a slow current of ink (a smooth curl
// field, the same everywhere), carried off and swelling past us, and un-drawn from where we
// are heading; the new world is drawn on, stroke by stroke, out of the same current, its
// lines settling as the current lets them go. The new world is live the whole time, its own
// strokes at full detail, so when the current has gone it simply is the next scene: nothing
// is swapped at the end.
//
// Blink: eyelids close over the old world and open on the new one.

import { ERASE, FILL, type Frame, hash, INKFILL, smooth } from "./sketch";

/** The current: a stream function of a few travelling waves; velocity is its curl. */
const WAVES = [
  [1.7, 0.6, 0.0, 0.55],
  [2.9, 2.3, 1.7, 0.28],
  [4.6, 4.1, 4.2, 0.12],
];

/** The waves' directions and phases for the current seed (set once per frame by flow()). */
const WC = new Float64Array(3);
const WS = new Float64Array(3);
const WP = new Float64Array(3);
let wseed = Number.NaN;
function turn(seed: number) {
  if (seed === wseed) return;
  wseed = seed;
  for (let i = 0; i < 3; i++) {
    WC[i] = Math.cos(WAVES[i][1] + seed);
    WS[i] = Math.sin(WAVES[i][1] + seed);
    WP[i] = WAVES[i][2] + seed * 3;
  }
}

/** Displace (x, y) along the current by amount s (two midpoint steps). */
function drift(x: number, y: number, s: number, out: number[]) {
  const h = s / 2;
  for (let k = 0; k < 2; k++) {
    let vx = 0;
    let vy = 0;
    // velocity at the midpoint
    for (let pass = 0; pass < 2; pass++) {
      const px = pass ? x + vx * h * 0.5 : x;
      const py = pass ? y + vy * h * 0.5 : y;
      vx = 0;
      vy = 0;
      for (let i = 0; i < 3; i++) {
        const f = WAVES[i][0];
        const c = Math.cos(f * (px * WC[i] + py * WS[i]) + WP[i]) * WAVES[i][3] * f;
        // psi = amp * sin(f (p . d) + ph): v = (dpsi/dy, -dpsi/dx)
        vx += c * WS[i];
        vy -= c * WC[i];
      }
    }
    x += vx * h;
    y += vy * h;
  }
  out[0] = x;
  out[1] = y;
}

const D = [0, 0];

/** Where in the flow the new world starts to be drawn on. */
export const FLOW_IN = 0.14;

/** Copy the visible part [a, b] of stroke s (fractions of its length), displaced, into out. */
function emitPart(
  f: Frame,
  s: number,
  a: number,
  b: number,
  disp: number,
  seed: number,
  scale: number,
  ox: number,
  oy: number,
  wMul: number,
  tip: boolean,
  out: Frame,
) {
  const o = f.S[s * 4];
  const n = f.S[s * 4 + 1];
  const id = f.S[s * 4 + 2];
  const kind = f.S[s * 4 + 3];
  if (n < 2 || b <= a || !out.room(n + 2)) return;
  // lengths along the stroke
  let len = 0;
  for (let i = 1; i < n; i++)
    len += Math.hypot(f.X[o + i] - f.X[o + i - 1], f.Y[o + i] - f.Y[o + i - 1]);
  if (len <= 0) return;
  const la = a * len;
  const lb = b * len;
  out.open(id, kind, f.B[s]);
  let acc = 0;
  const put = (x: number, y: number, w: number, at: number) => {
    let px = ox + (x - ox) * scale;
    let py = oy + (y - oy) * scale;
    if (disp > 1e-4) {
      turn(seed);
      drift(px, py, disp, D);
      px = D[0];
      py = D[1];
    }
    // a drawing tip thins toward the pen
    const t = tip ? Math.min(1, (lb - at) / Math.max(1e-6, Math.min(0.08, (lb - la) * 0.4))) : 1;
    out.put(px, py, w * wMul * (0.35 + 0.65 * t));
  };
  for (let i = 0; i < n - 1; i++) {
    const x0 = f.X[o + i];
    const y0 = f.Y[o + i];
    const x1 = f.X[o + i + 1];
    const y1 = f.Y[o + i + 1];
    const sl = Math.hypot(x1 - x0, y1 - y0);
    const s0 = acc;
    const s1 = acc + sl;
    acc = s1;
    if (s1 < la || s0 > lb) continue;
    if (s0 >= la && i === 0) put(x0, y0, f.W[o + i], s0);
    else if (s0 < la) {
      const t = (la - s0) / (sl || 1);
      put(
        x0 + (x1 - x0) * t,
        y0 + (y1 - y0) * t,
        f.W[o + i] + (f.W[o + i + 1] - f.W[o + i]) * t,
        la,
      );
    } else if (i > 0 && s0 >= la) {
      // already emitted as the previous segment's end
    }
    if (s1 <= lb) put(x1, y1, f.W[o + i + 1], s1);
    else {
      const t = (lb - s0) / (sl || 1);
      put(
        x0 + (x1 - x0) * t,
        y0 + (y1 - y0) * t,
        f.W[o + i] + (f.W[o + i + 1] - f.W[o + i]) * t,
        lb,
      );
      break;
    }
  }
  out.close();
}

/** Copy fill s, its triangles drawn toward their centre by `grow` (0 gone, 1 whole), displaced. */
function emitFill(
  f: Frame,
  s: number,
  grow: number,
  disp: number,
  seed: number,
  scale: number,
  ox: number,
  oy: number,
  out: Frame,
) {
  const o = f.S[s * 4];
  const n = f.S[s * 4 + 1];
  if (grow <= 0.001 || !out.room(n)) return;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    cx += f.X[o + i];
    cy += f.Y[o + i];
  }
  cx /= n;
  cy /= n;
  out.open(f.S[s * 4 + 2], f.S[s * 4 + 3], f.B[s]);
  for (let i = 0; i < n; i++) {
    let x = cx + (f.X[o + i] - cx) * grow;
    let y = cy + (f.Y[o + i] - cy) * grow;
    x = ox + (x - ox) * scale;
    y = oy + (y - oy) * scale;
    if (disp > 1e-4) {
      turn(seed);
      drift(x, y, disp, D);
      x = D[0];
      y = D[1];
    }
    out.put(x, y, 0);
  }
  out.close();
}

function centroid(f: Frame, s: number, out: number[]) {
  const o = f.S[s * 4];
  const n = f.S[s * 4 + 1];
  const k = Math.max(1, n >> 2);
  let x = 0;
  let y = 0;
  let c = 0;
  for (let i = 0; i < n; i += k) {
    x += f.X[o + i];
    y += f.Y[o + i];
    c++;
  }
  out[0] = x / c;
  out[1] = y / c;
}

const C = [0, 0];

/**
 * The flow at u in [0, 1] from a (the old world's last frame) into b (the new world, live),
 * into out. (ox, oy): where we are heading in the old world, view units; A: half-width.
 */
export function flow(
  u: number,
  a: Frame,
  b: Frame,
  ox: number,
  oy: number,
  A: number,
  seed: number,
  out: Frame,
) {
  out.clear();
  const AMP = 0.55;
  // the old world: swells past us, caught in the current, un-drawn from where we head
  const ua = smooth(0, 0.8, u);
  if (ua < 1) {
    const scale = 1 + 0.45 * ua * ua;
    const disp = AMP * ua;
    const far = Math.hypot(A, 1) * 1.2;
    for (let s = 0; s < a.ns; s++) {
      const kind = a.S[s * 4 + 3];
      if (kind === FILL || kind === INKFILL) {
        emitFill(a, s, 1 - smooth(0.05, 0.45, ua), disp, seed, scale, ox, oy, out);
        continue;
      }
      centroid(a, s, C);
      const d = Math.hypot(C[0] - ox, C[1] - oy) / far;
      const k = hash(a.S[s * 4 + 2], 41);
      const start = smooth(0, 1, (ua - 0.1 - d * 0.35 - k * 0.2) / 0.5);
      if (start >= 1) continue;
      emitPart(a, s, start, 1, disp, seed, scale, ox, oy, 1 - 0.4 * ua, false, out);
    }
  }
  // the new world: drawn on out of the current, from its middle outward
  const ub = smooth(FLOW_IN, 0.97, u);
  if (ub > 0) {
    const scale = 0.82 + 0.18 * ub;
    const disp = AMP * (1 - ub) ** 1.6;
    const far = Math.hypot(A, 1);
    for (let s = 0; s < b.ns; s++) {
      const kind = b.S[s * 4 + 3];
      if (kind === FILL || kind === INKFILL) {
        emitFill(b, s, smooth(0.45, 0.95, ub), disp, seed + 1, scale, 0, 0, out);
        continue;
      }
      centroid(b, s, C);
      const d = Math.hypot(C[0], C[1]) / far;
      const k = hash(b.S[s * 4 + 2], 43);
      const end = smooth(0, 1, (ub - d * 0.35 - k * 0.15) / 0.5);
      if (end <= 0) continue;
      emitPart(
        b,
        s,
        0,
        end,
        disp,
        seed + 1,
        scale,
        0,
        0,
        kind === ERASE ? 1 : 0.6 + 0.4 * ub,
        end < 1,
        out,
      );
    }
  }
}

/** How far the lids are shut at u in [0, 1] of a blink: close, hold, open. */
export function lidsAt(u: number): number {
  if (u < 0.42) return smooth(0, 0.42, u) ** 1.4;
  if (u < 0.58) return 1;
  return 1 - smooth(0.58, 1, u) ** 0.8;
}
