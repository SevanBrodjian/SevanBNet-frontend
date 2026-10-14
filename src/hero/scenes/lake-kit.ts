// A pen for the lake that the kit lacks: a 2D path (view units) with a width at every point,
// inked as Sketch inks (a quick start and a long lift, the hand's slow wander, pressure that
// wanders along it), and the band between two such paths cleared.

import { clamp, FILL, hash, INK, noise, type Sketch, TAU } from "../sketch";

const CAP = 4096;
const IX = new Float32Array(CAP);
const IY = new Float32Array(CAP);
const IW = new Float32Array(CAP);
const OX = new Float32Array(CAP);
const OY = new Float32Array(CAP);
const OW = new Float32Array(CAP);
let IN = 0;

/** Start a path at (x, y) (view units) with width w (CSS px). */
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

export function pcount(): number {
  return IN;
}

/** Ink the path with its own widths (taper: fraction lifting at each end; wob: CSS px). */
export function pink(sk: Sketch, taper = 0.12, wob = 0.5, press = 0.25, kind = INK): void {
  const id = sk.id++;
  const n = IN;
  if (n < 2) return;
  let x0 = 1e9;
  let y0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  let len = 0;
  for (let i = 0; i < n; i++) {
    const x = IX[i];
    const y = IY[i];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (i) len += Math.hypot(x - IX[i - 1], y - IY[i - 1]);
  }
  const A = sk.A + 0.05;
  if (x1 < -A || x0 > A || y1 < -1.05 || y0 > 1.05) return;
  const px = sk.px;
  const L = len * px;
  if (L < sk.minLen) return;
  const want = clamp(Math.ceil(L / 7) + 1, 2, 240);
  let m = n;
  if (want > n && len > 0) {
    m = want;
    const step = len / (m - 1);
    let j = 0;
    let acc = 0;
    let seg = Math.hypot(IX[1] - IX[0], IY[1] - IY[0]);
    for (let k = 0; k < m; k++) {
      const target = k * step;
      while (j < n - 2 && acc + seg < target) {
        acc += seg;
        j++;
        seg = Math.hypot(IX[j + 1] - IX[j], IY[j + 1] - IY[j]);
      }
      const t = seg > 0 ? clamp((target - acc) / seg, 0, 1) : 0;
      OX[k] = IX[j] + (IX[j + 1] - IX[j]) * t;
      OY[k] = IY[j] + (IY[j + 1] - IY[j]) * t;
      OW[k] = IW[j] + (IW[j + 1] - IW[j]) * t;
    }
  } else {
    for (let i = 0; i < n; i++) {
      OX[i] = IX[i];
      OY[i] = IY[i];
      OW[i] = IW[i];
    }
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
    if (i) acc += Math.hypot(OX[i] - OX[i - 1], OY[i] - OY[i - 1]);
    const s = len > 0 ? acc / len : 0;
    const a = i ? i - 1 : 0;
    const b = i < m - 1 ? i + 1 : m - 1;
    let nx = -(OY[b] - OY[a]);
    let ny = OX[b] - OX[a];
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const d =
      am * (Math.sin(TAU * fr * s + ph) * 0.8 + Math.sin(TAU * 2.3 * fr * s + ph * 1.7) * 0.3);
    let tp = 1;
    if (taper > 0) {
      tp = Math.min(1, s / (taper * 0.6), (1 - s) / taper);
      tp = 0.25 + 0.75 * Math.sqrt(tp > 0 ? tp : 0);
    }
    const pr = press > 0 ? 1 + press * (noise(s * pf + pph, id) * 0.8 + 0.25 * (1 - s)) : 1;
    f.put(OX[i] + nx * d, OY[i] + ny * d, Math.max(0, OW[i] * ws * tp * pr));
  }
  f.close();
}

/** Clear the band between two polylines of n points each (flat x, y lists, view units). */
export function strip(
  sk: Sketch,
  A: ArrayLike<number>,
  B: ArrayLike<number>,
  n: number,
  kind = FILL,
): void {
  if (n < 2) return;
  sk.m(A[0], A[1]);
  for (let i = 1; i < n; i++) sk.l(A[i * 2], A[i * 2 + 1]);
  for (let i = n - 1; i >= 0; i--) sk.l(B[i * 2], B[i * 2 + 1]);
  sk.band(kind);
}
