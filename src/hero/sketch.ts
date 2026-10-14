// The drawing kit the scenes are written with. Every mark is resolved to a polyline in view
// units (the canvas's half-height is 1, y down) with a width in CSS px per point, and
// collected in a Frame; the renderer boils and inks a Frame, the transitions carry one
// Frame into another.
//
// Scenes draw in first person through a 3D camera (eye, yaw, pitch, roll): lines are clipped
// at the near plane and thicken as they come closer, and surfaces are shaded the way the
// ink wants: white ink on black means light is drawn and shadow is left bare, so a surface
// is hatched along its own curvature, more densely where more light falls on it.
//
// Occlusion is painter's order: draw far things first; anything solid clears what is behind
// it (fill, fill3, surf with fill) before inking its own lines, so lines never show through.

export const MAXP = 1 << 17;
export const MAXS = 1 << 14;

/** Ink: a white line. Fill: clears what is behind (triangles). Erase: a clearing line.
 *  Inkfill: solid white (triangles). */
export const INK = 0;
export const FILL = 1;
export const ERASE = 2;
export const INKFILL = 3;

export class Frame {
  X = new Float32Array(MAXP);
  Y = new Float32Array(MAXP);
  W = new Float32Array(MAXP);
  /** Per stroke: first point, point count, id, kind. */
  S = new Int32Array(MAXS * 4);
  /** Per stroke: how much it boils (1 for structure, less for fine detail). */
  B = new Float32Array(MAXS);
  np = 0;
  ns = 0;

  clear(): void {
    this.np = 0;
    this.ns = 0;
  }

  /** Room for n more points in one more stroke. */
  room(n: number): boolean {
    return this.ns < MAXS && this.np + n <= MAXP;
  }

  open(id: number, kind: number, boil = 1): void {
    const o = this.ns * 4;
    this.S[o] = this.np;
    this.S[o + 1] = 0;
    this.S[o + 2] = id;
    this.S[o + 3] = kind;
    this.B[this.ns] = boil;
  }

  put(x: number, y: number, w: number): void {
    const i = this.np++;
    this.X[i] = x;
    this.Y[i] = y;
    this.W[i] = w;
  }

  close(): void {
    const o = this.ns * 4;
    this.S[o + 1] = this.np - this.S[o];
    if (this.S[o + 1] > 0) this.ns++;
    else this.np = this.S[o];
  }

  copy(from: Frame): void {
    this.np = from.np;
    this.ns = from.ns;
    this.X.set(from.X.subarray(0, from.np));
    this.Y.set(from.Y.subarray(0, from.np));
    this.W.set(from.W.subarray(0, from.np));
    this.S.set(from.S.subarray(0, from.ns * 4));
    this.B.set(from.B.subarray(0, from.ns));
  }
}

// ---------------------------------------------------------------- randomness and easing

function mix32(x: number): number {
  x |= 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** A fixed random number in [0, 1) for (a, b). */
export const hash = (a: number, b = 0): number =>
  mix32(Math.imul(a | 0, 0x27d4eb2d) ^ mix32((b | 0) + 0x165667b1)) / 4294967296;

/** Smooth 1D value noise in [-1, 1]. */
export function noise(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return (hash(i, seed) * (1 - u) + hash(i + 1, seed) * u) * 2 - 1;
}

export const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const TAU = Math.PI * 2;

// ---------------------------------------------------------------- the kit

/** Scratch for one path at a time: world (P), view (Q), resampled (R), per-point weight (M). */
const N = 8192;
const PX = new Float32Array(N);
const PY = new Float32Array(N);
const PM = new Float32Array(N);
const QX = new Float32Array(N);
const QY = new Float32Array(N);
const QM = new Float32Array(N);
const RX = new Float32Array(N);
const RY = new Float32Array(N);
const RM = new Float32Array(N);
// camera space, for 3D paths
const CX = new Float32Array(N);
const CY = new Float32Array(N);
const CZ = new Float32Array(N);
const CM = new Float32Array(N);

type Affine = [number, number, number, number, number, number];

/** A light: how much falls on a point with a normal (facing the eye), 0..1. */
export type Light = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => number;

export interface SurfaceStyle {
  /** Light on the surface (default: a soft light from above and in front). */
  light?: Light;
  /** Strands across the surface: a fixed count keeps the hatching fixed to the surface as
   *  the eye moves (use it whenever the camera moves). Without it, strands are spaced `gap`
   *  CSS px apart on screen, which only suits a still camera. */
  n?: number;
  /** Hatch spacing on screen, CSS px (when n is not given). */
  gap?: number;
  /** Strands run along v (0), along u (1), or both (2). */
  dir?: 0 | 1 | 2;
  /** Above this light, strands in the other direction cross the first. */
  cross?: number;
  /** Hatch weight, CSS px. */
  w?: number;
  /** Outline weight (0: none) and which edges: 1 u=0, 2 u=1, 4 v=0, 8 v=1. */
  edge?: number;
  edges?: number;
  /** Clear what is behind the surface. */
  fill?: boolean;
  /** Below this light nothing is drawn (the dark keeps it). */
  floor?: number;
  /** How unevenly strands stop where the light gives out (0..1). */
  ragged?: number;
  /** Break each strand into this many dashes along its length (fixed to the surface); 0 for
   *  unbroken strands. */
  dashes?: number;
  /** Evaluate the light at every point along a strand instead of interpolating the grid:
   *  for sharp light and shadow (a window's light, a branch's shadow) on a coarse grid. */
  exact?: boolean;
  seed?: number;
}

const defaultLight: Light = (_x, _y, _z, _nx, ny, nz) => clamp(0.55 - 0.45 * ny - 0.25 * nz, 0, 1);

export class Sketch {
  f: Frame;
  /** Half-width of the view in view units (the half-height is 1). */
  A = 1;
  /** CSS px per view unit. */
  px = 200;
  /** Line weight multiplier for the canvas size. */
  ws = 1;
  /** Stroke ids drive the boil; a group gives a part of the drawing stable ids. */
  id = 0;
  /** Strokes shorter than this (CSS px) are skipped. */
  minLen = 1.6;
  /** How much a hand's pressure wanders along each stroke (0: even). */
  press = 0.3;
  /** How much the strokes being drawn boil: 1 for structure, 0.5 for detail, 0.2 for glyphs. */
  amp = 1;
  /** The boil frame (steps about 10 times a second): for things a hand redraws each time,
   *  like where a loop's seam falls. */
  boil = 0;

  // 2D camera and the local transform stack, composed into M (world -> view)
  private cam: Affine = [1, 0, 0, 1, 0, 0];
  private stack: Affine[] = [];
  private loc: Affine = [1, 0, 0, 1, 0, 0];
  private M: Affine = [1, 0, 0, 1, 0, 0];
  /** World scale of the current 2D transform (for screen-size decisions). */
  scale = 1;

  // 3D camera: eye, basis (right, down, forward), focal length
  ex = 0;
  ey = 0;
  ez = 0;
  foc = 1;
  near = 0.08;
  /** Lines thicken toward the eye: weight x (depthRef / depth)^depthW, within limits. */
  depthRef = 3;
  depthW = 0.5;
  private rx = 1;
  private ry = 0;
  private rz = 0;
  private dx = 0;
  private dy = 1;
  private dz = 0;
  private fx = 0;
  private fy = 0;
  private fz = 1;

  private n = 0;
  private n3 = 0;
  private usePM = false;

  constructor(f: Frame) {
    this.f = f;
  }

  begin(f: Frame, A: number, px: number): void {
    this.f = f;
    this.A = A;
    this.px = px;
    this.ws = clamp(px / 300, 0.85, 1.4);
    this.id = 1;
    this.stack.length = 0;
    this.loc = [1, 0, 0, 1, 0, 0];
    this.view(0, 0, 1);
    this.eye(0, 0, 0, 1.2);
    this.depthRef = 3;
    this.depthW = 0.5;
    this.near = 0.08;
    this.press = 0.3;
    this.amp = 1;
  }

  group(g: number): void {
    this.id = g * 10007;
  }

  /** 2D camera: world (x, y) at the view centre, z view units per world unit, roll. */
  view(x: number, y: number, z: number, roll = 0): void {
    const c = Math.cos(roll) * z;
    const s = Math.sin(roll) * z;
    this.cam = [c, s, -s, c, -(c * x - s * y), -(s * x + c * y)];
    this.compose();
  }

  private compose(): void {
    const a = this.cam;
    const b = this.loc;
    this.M = [
      a[0] * b[0] + a[2] * b[1],
      a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3],
      a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4],
      a[1] * b[4] + a[3] * b[5] + a[5],
    ];
    this.scale = Math.sqrt(Math.abs(this.M[0] * this.M[3] - this.M[1] * this.M[2]));
  }

  /** Enter a local 2D frame: translate, rotate, scale (a negative sx mirrors). */
  push(x: number, y: number, rot = 0, sx = 1, sy = sx): void {
    this.stack.push(this.loc);
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const b = this.loc;
    const m: Affine = [c * sx, s * sx, -s * sy, c * sy, x, y];
    this.loc = [
      b[0] * m[0] + b[2] * m[1],
      b[1] * m[0] + b[3] * m[1],
      b[0] * m[2] + b[2] * m[3],
      b[1] * m[2] + b[3] * m[3],
      b[0] * m[4] + b[2] * m[5] + b[4],
      b[1] * m[4] + b[3] * m[5] + b[5],
    ];
    this.compose();
  }

  pop(): void {
    this.loc = this.stack.pop() ?? [1, 0, 0, 1, 0, 0];
    this.compose();
  }

  /** World to view, x and y. */
  vx(x: number, y: number): number {
    return this.M[0] * x + this.M[2] * y + this.M[4];
  }
  vy(x: number, y: number): number {
    return this.M[1] * x + this.M[3] * y + this.M[5];
  }

  // ---------------------------------------------------------------- 2D paths

  /** Start a path at (x, y). */
  m(x: number, y: number): this {
    this.n = 0;
    this.usePM = false;
    return this.l(x, y);
  }

  /** Add a point. */
  l(x: number, y: number): this {
    if (this.n < N) {
      PX[this.n] = x;
      PY[this.n] = y;
      PM[this.n] = 1;
      this.n++;
    }
    return this;
  }

  /** Quadratic curve to (x, y). */
  q(cx: number, cy: number, x: number, y: number, k = 8): this {
    const x0 = PX[this.n - 1];
    const y0 = PY[this.n - 1];
    for (let i = 1; i <= k; i++) {
      const t = i / k;
      const u = 1 - t;
      this.l(u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y);
    }
    return this;
  }

  /** Cubic curve to (x, y). */
  c(ax: number, ay: number, bx: number, by: number, x: number, y: number, k = 12): this {
    const x0 = PX[this.n - 1];
    const y0 = PY[this.n - 1];
    for (let i = 1; i <= k; i++) {
      const t = i / k;
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const d = 3 * u * t * t;
      const e = t * t * t;
      this.l(a * x0 + b * ax + d * bx + e * x, a * y0 + b * ay + d * by + e * y);
    }
    return this;
  }

  /** An elliptical arc about (x, y) from angle a0 to a1. */
  arc(x: number, y: number, rx: number, ry: number, a0: number, a1: number, first = true): this {
    const k = clamp(
      Math.ceil((Math.abs(a1 - a0) * Math.max(rx, ry) * this.scale * this.px) / 5),
      Math.ceil(Math.abs(a1 - a0) * 2.6),
      96,
    );
    for (let i = 0; i <= k; i++) {
      const a = a0 + ((a1 - a0) * i) / k;
      const px = x + Math.cos(a) * rx;
      const py = y + Math.sin(a) * ry;
      if (i === 0 && first) this.m(px, py);
      else this.l(px, py);
    }
    return this;
  }

  /** Points in the current path. */
  get count(): number {
    return this.n;
  }

  /**
   * Ink the current path. w, w1: CSS px at the ends; taper: fraction of the length that
   * thins at each end; wob: the hand's slow wander (CSS px); over: overshoot at the ends
   * (CSS px); press: how much the pressure wanders along it (default sk.press).
   */
  s(w = 1, taper = 0.25, wob = 1, w1 = w, over = 0, press = this.press): this {
    this.emit(w, w1, taper, wob, over, press, INK);
    return this;
  }

  /** Clear along the current path (a gap that separates what is in front from behind). */
  e(w = 4): this {
    this.emit(w, w, 0, 0.4, 0, 0, ERASE);
    return this;
  }

  private emit(
    w: number,
    w1: number,
    taper: number,
    wob: number,
    over: number,
    press: number,
    kind: number,
  ) {
    const id = this.id++;
    const n = this.n;
    if (n < 2) return;
    const f = this.f;
    const M = this.M;
    let x0 = 1e9;
    let y0 = 1e9;
    let x1 = -1e9;
    let y1 = -1e9;
    let len = 0;
    for (let i = 0; i < n; i++) {
      const x = M[0] * PX[i] + M[2] * PY[i] + M[4];
      const y = M[1] * PX[i] + M[3] * PY[i] + M[5];
      QX[i] = x;
      QY[i] = y;
      QM[i] = this.usePM ? PM[i] : 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (i) len += Math.hypot(x - QX[i - 1], y - QY[i - 1]);
    }
    const A = this.A + 0.05;
    if (x1 < -A || x0 > A || y1 < -1.05 || y0 > 1.05) return;
    const px = this.px;
    const L = len * px;
    if (L < this.minLen) return;
    // resample evenly so the wander and the pressure have points to work with (~7 px)
    const want = clamp(Math.ceil(L / 7) + 1, 2, 240);
    const m = this.resample(n, want, len);
    if (!f.room(m)) return;
    const ws = this.ws;
    const ph = hash(id, 11) * TAU;
    const fr = 0.6 + hash(id, 12) * 1.1;
    const am = (wob * ws * (0.5 + hash(id, 13))) / px;
    const ov = (over * ws * (0.4 + hash(id, 14))) / px;
    const pph = hash(id, 15) * 10;
    const pf = 1.2 + hash(id, 16) * 1.6;
    f.open(id, kind, this.amp);
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
        am * (Math.sin(TAU * fr * s + ph) * 0.8 + Math.sin(TAU * 2.3 * fr * s + ph * 1.7) * 0.3);
      let x = RX[i] + nx * d;
      let y = RY[i] + ny * d;
      if (ov && (i === 0 || i === m - 1)) {
        const j = i === 0 ? 1 : m - 2;
        const tx = RX[i] - RX[j];
        const ty = RY[i] - RY[j];
        const tl = Math.hypot(tx, ty) || 1;
        x += (tx / tl) * ov;
        y += (ty / tl) * ov;
      }
      let tp = 1;
      if (taper > 0) {
        // a quick start and a long lift, as a pen leaves the page
        tp = Math.min(1, s / (taper * 0.6), (1 - s) / taper);
        tp = 0.25 + 0.75 * Math.sqrt(tp > 0 ? tp : 0);
      }
      const pr = press > 0 ? 1 + press * (noise(s * pf + pph, id) * 0.8 + 0.25 * (1 - s)) : 1;
      f.put(x, y, Math.max(0, (w + (w1 - w) * s) * ws * tp * pr * RM[i]));
    }
    f.close();
  }

  /** Resample Q (n points, length len) evenly along its length into R (at least n points). */
  private resample(n: number, m: number, len: number): number {
    if (m <= n || len <= 0) {
      for (let i = 0; i < n; i++) {
        RX[i] = QX[i];
        RY[i] = QY[i];
        RM[i] = QM[i];
      }
      return n;
    }
    const step = len / (m - 1);
    let j = 0;
    let acc = 0;
    let seg = Math.hypot(QX[1] - QX[0], QY[1] - QY[0]);
    for (let k = 0; k < m; k++) {
      const target = k * step;
      while (j < n - 2 && acc + seg < target) {
        acc += seg;
        j++;
        seg = Math.hypot(QX[j + 1] - QX[j], QY[j + 1] - QY[j]);
      }
      const t = seg > 0 ? clamp((target - acc) / seg, 0, 1) : 0;
      RX[k] = QX[j] + (QX[j + 1] - QX[j]) * t;
      RY[k] = QY[j] + (QY[j + 1] - QY[j]) * t;
      RM[k] = QM[j] + (QM[j + 1] - QM[j]) * t;
    }
    return m;
  }

  /** Clear the inside of the current path (fanned from its centroid; keep it star-shaped). */
  fill(): this {
    return this.fan(FILL);
  }

  /** Fill the inside of the current path with solid ink. */
  solid(): this {
    return this.fan(INKFILL);
  }

  private fan(kind: number): this {
    const n = this.n;
    this.id++;
    if (n < 3) return this;
    const M = this.M;
    let cx = 0;
    let cy = 0;
    let x0 = 1e9;
    let x1 = -1e9;
    let y0 = 1e9;
    let y1 = -1e9;
    for (let i = 0; i < n; i++) {
      const x = M[0] * PX[i] + M[2] * PY[i] + M[4];
      const y = M[1] * PX[i] + M[3] * PY[i] + M[5];
      QX[i] = x;
      QY[i] = y;
      cx += x;
      cy += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    const A = this.A + 0.05;
    if (x1 < -A || x0 > A || y1 < -1.05 || y0 > 1.05) return this;
    cx /= n;
    cy /= n;
    const f = this.f;
    if (!f.room(n * 3)) return this;
    f.open(this.id, kind);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      f.put(cx, cy, 0);
      f.put(QX[i], QY[i], 0);
      f.put(QX[j], QY[j], 0);
    }
    f.close();
    return this;
  }

  /** Clear a band: the current path is the top edge, then the bottom edge back the other way. */
  band(kind = FILL): this {
    const n = this.n;
    this.id++;
    if (n < 4 || n % 2) return this;
    const h = n / 2;
    const M = this.M;
    const f = this.f;
    if (!f.room((h - 1) * 6)) return this;
    for (let i = 0; i < n; i++) {
      QX[i] = M[0] * PX[i] + M[2] * PY[i] + M[4];
      QY[i] = M[1] * PX[i] + M[3] * PY[i] + M[5];
    }
    f.open(this.id, kind);
    for (let i = 0; i + 1 < h; i++) {
      const a = i;
      const b = i + 1;
      const c = n - 1 - i;
      const d = n - 2 - i;
      f.put(QX[a], QY[a], 0);
      f.put(QX[b], QY[b], 0);
      f.put(QX[c], QY[c], 0);
      f.put(QX[b], QY[b], 0);
      f.put(QX[d], QY[d], 0);
      f.put(QX[c], QY[c], 0);
    }
    f.close();
    return this;
  }

  // ---------------------------------------------------------------- 2D shapes

  line(x0: number, y0: number, x1: number, y1: number, w = 1, taper = 0.25, wob = 1, over = 0) {
    this.m(x0, y0).l(x1, y1).s(w, taper, wob, w, over);
  }

  /** A loose, hand-closed ellipse: starts and ends a little past itself, the seam wherever
   *  the hand put it this time. */
  ring(x: number, y: number, rx: number, ry = rx, w = 1, a0 = Number.NaN, sweep = TAU + 0.35) {
    const a = Number.isNaN(a0) ? -1.9 + (hash(this.id, this.boil) - 0.5) * 1.2 : a0;
    this.arc(x, y, rx, ry, a, a + sweep).s(w, 0.15, 0.7);
  }

  /** Clear an ellipse. */
  blot(x: number, y: number, rx: number, ry = rx) {
    this.arc(x, y, rx, ry, 0, TAU - 0.01).fill();
  }

  /** A solid white ellipse. */
  dot(x: number, y: number, rx: number, ry = rx) {
    this.arc(x, y, rx, ry, 0, TAU - 0.01).solid();
  }

  /**
   * A tube along a spine: points (x, y, r) as a flat list. Clears its inside, then inks
   * both sides; capEnd rounds the far end. shade: strokes across the right-hand side.
   */
  tube(P: readonly number[], w = 1, capEnd = true, shade = 0, capStart = false) {
    const k = P.length / 3;
    if (k < 2) return;
    const L: number[] = [];
    const R: number[] = [];
    for (let i = 0; i < k; i++) {
      const a = Math.max(0, i - 1) * 3;
      const b = Math.min(k - 1, i + 1) * 3;
      let tx = P[b] - P[a];
      let ty = P[b + 1] - P[a + 1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const r = P[i * 3 + 2];
      L.push(P[i * 3] - ty * r, P[i * 3 + 1] + tx * r);
      R.push(P[i * 3] + ty * r, P[i * 3 + 1] - tx * r);
    }
    const ex = P[(k - 1) * 3];
    const ey = P[(k - 1) * 3 + 1];
    const er = P[(k - 1) * 3 + 2];
    const ea = Math.atan2(ey - P[(k - 2) * 3 + 1], ex - P[(k - 2) * 3]);
    this.m(L[0], L[1]);
    for (let i = 1; i < k; i++) this.l(L[i * 2], L[i * 2 + 1]);
    for (let i = k - 1; i >= 0; i--) this.l(R[i * 2], R[i * 2 + 1]);
    this.band();
    if (capEnd) this.blot(ex, ey, er);
    if (capStart) this.blot(P[0], P[1], P[2]);
    this.m(L[0], L[1]);
    for (let i = 1; i < k; i++) this.l(L[i * 2], L[i * 2 + 1]);
    if (capEnd) this.arc(ex, ey, er, er, ea + Math.PI / 2, ea - Math.PI / 2, false);
    this.s(w, 0.08, 0.6);
    this.m(R[0], R[1]);
    for (let i = 1; i < k; i++) this.l(R[i * 2], R[i * 2 + 1]);
    this.s(w * 0.9, 0.12, 0.6);
    if (capStart) this.arc(P[0], P[1], P[2], P[2], 0, TAU).s(w * 0.8, 0.2, 0.5);
    if (shade > 0) {
      const ns = Math.max(1, Math.round(k * shade * 2));
      for (let j = 0; j < ns; j++) {
        const t = (j + 0.5) / ns;
        const fi = t * (k - 1);
        const i = Math.min(k - 2, Math.floor(fi));
        const u = fi - i;
        const rx = mix(R[i * 2], R[i * 2 + 2], u);
        const ry = mix(R[i * 2 + 1], R[i * 2 + 3], u);
        const cx = mix(P[i * 3], P[i * 3 + 3], u);
        const cy = mix(P[i * 3 + 1], P[i * 3 + 4], u);
        this.line(rx, ry, mix(rx, cx, 0.55), mix(ry, cy, 0.55), w * 0.55, 0.3, 0.2);
      }
    }
  }

  /**
   * Parallel hatching inside a polygon (flat x, y list), at angle ang, gap apart (world).
   * The gap opens up when it would be too fine on screen. ragged: how unevenly the lines
   * stop short of the edges. zigzag: join the lines into one scribble, back and forth.
   */
  hatch(
    poly: readonly number[],
    ang: number,
    gap: number,
    w = 0.6,
    ragged = 0.25,
    seed = 0,
    zigzag = false,
  ) {
    const n = poly.length / 2;
    if (n < 3) return;
    const minGap = 3.2 / (this.scale * this.px);
    if (gap < minGap) gap *= Math.ceil(minGap / gap);
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    let v0 = 1e9;
    let v1 = -1e9;
    const U: number[] = [];
    const V: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = poly[i * 2];
      const y = poly[i * 2 + 1];
      const u = x * c + y * s;
      const v = -x * s + y * c;
      U.push(u);
      V.push(v);
      if (v < v0) v0 = v;
      if (v > v1) v1 = v;
    }
    const xs: number[] = [];
    let row = 0;
    let open = false;
    for (let v = v0 + gap * (0.3 + 0.4 * hash(seed, 1)); v < v1; v += gap, row++) {
      xs.length = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const va = V[i];
        const vb = V[j];
        if (va <= v !== vb <= v) xs.push(U[i] + ((v - va) / (vb - va)) * (U[j] - U[i]));
      }
      xs.sort((a, b) => a - b);
      if (xs.length < 2) continue;
      if (zigzag) {
        const span = xs[xs.length - 1] - xs[0];
        let a = xs[0] + span * ragged * hash(seed + row, 3);
        let b = xs[xs.length - 1] - span * ragged * hash(seed + row, 4);
        if (row % 2) [a, b] = [b, a];
        const vv = v + (hash(seed + row, 5) - 0.5) * gap * 0.6;
        if (!open) {
          this.m(a * c - vv * s, a * s + vv * c);
          open = true;
        } else this.l(a * c - vv * s, a * s + vv * c);
        this.l(b * c - vv * s, b * s + vv * c);
        continue;
      }
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const span = xs[k + 1] - xs[k];
        const a = xs[k] + span * ragged * hash(seed + row, k);
        const b = xs[k + 1] - span * ragged * hash(seed + row, k + 7);
        if (b - a <= 0) continue;
        this.line(a * c - v * s, a * s + v * c, b * c - v * s, b * s + v * c, w, 0.35, 0.25);
      }
    }
    if (zigzag && open) this.s(w, 0.1, 0.5);
  }

  // ---------------------------------------------------------------- 3D

  /**
   * The eye: at (x, y, z) (y down, z forward), turned by yaw (right positive), pitch (down
   * positive) and roll; f is the focal length in view units (the view's half-height is 1).
   */
  eye(x: number, y: number, z: number, f: number, yaw = 0, pitch = 0, roll = 0): void {
    this.ex = x;
    this.ey = y;
    this.ez = z;
    this.foc = f;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const fx = sy * cp;
    const fy = sp;
    const fz = cy * cp;
    const r0x = cy;
    const r0y = 0;
    const r0z = -sy;
    const d0x = fy * r0z - fz * r0y;
    const d0y = fz * r0x - fx * r0z;
    const d0z = fx * r0y - fy * r0x;
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    this.rx = r0x * cr + d0x * sr;
    this.ry = r0y * cr + d0y * sr;
    this.rz = r0z * cr + d0z * sr;
    this.dx = d0x * cr - r0x * sr;
    this.dy = d0y * cr - r0y * sr;
    this.dz = d0z * cr - r0z * sr;
    this.fx = fx;
    this.fy = fy;
    this.fz = fz;
  }

  /** Camera-space depth of a world point (positive in front). */
  depth(x: number, y: number, z: number): number {
    return (x - this.ex) * this.fx + (y - this.ey) * this.fy + (z - this.ez) * this.fz;
  }

  /** Project a world point to the view. Writes x, y and depth; false behind the eye. */
  p3(x: number, y: number, z: number, out: number[]): boolean {
    const ax = x - this.ex;
    const ay = y - this.ey;
    const az = z - this.ez;
    const cz = ax * this.fx + ay * this.fy + az * this.fz;
    if (cz < this.near) return false;
    const cx = ax * this.rx + ay * this.ry + az * this.rz;
    const cy = ax * this.dx + ay * this.dy + az * this.dz;
    const wx = (cx * this.foc) / cz;
    const wy = (cy * this.foc) / cz;
    out[0] = this.vx(wx, wy);
    out[1] = this.vy(wx, wy);
    out[2] = cz;
    return true;
  }

  /** Start a 3D path. */
  m3(x: number, y: number, z: number): this {
    this.n3 = 0;
    return this.l3(x, y, z);
  }

  /** Add a 3D point (kept in camera space until the path is inked); wm weights the line there. */
  l3(x: number, y: number, z: number, wm = 1): this {
    if (this.n3 >= N) return this;
    const ax = x - this.ex;
    const ay = y - this.ey;
    const az = z - this.ez;
    const i = this.n3++;
    CX[i] = ax * this.rx + ay * this.ry + az * this.rz;
    CY[i] = ax * this.dx + ay * this.dy + az * this.dz;
    CZ[i] = ax * this.fx + ay * this.fy + az * this.fz;
    CM[i] = wm;
    return this;
  }

  /** Points in the current 3D path. */
  get count3(): number {
    return this.n3;
  }

  private put2(cx: number, cy: number, cz: number, wm = 1) {
    if (this.n >= N) return;
    PX[this.n] = (cx * this.foc) / cz;
    PY[this.n] = (cy * this.foc) / cz;
    PM[this.n] = (this.depthW ? clamp((this.depthRef / cz) ** this.depthW, 0.3, 2.4) : 1) * wm;
    this.n++;
  }

  /** Ink the current 3D path, clipped at the near plane (it may break into pieces). */
  s3(w = 1, taper = 0.25, wob = 0.8, w1 = w, over = 0, press = this.press): this {
    const n = this.n3;
    const nr = this.near;
    const base = this.id;
    let pieces = 0;
    let inRun = false;
    const flush = () => {
      if (this.n >= 2) {
        this.usePM = true;
        this.id = base + pieces * 7919;
        this.emit(w, w1, taper, wob, over, press, INK);
        pieces++;
      }
      this.n = 0;
      inRun = false;
    };
    this.n = 0;
    for (let i = 0; i < n; i++) {
      const z = CZ[i];
      if (z >= nr) {
        if (!inRun && i > 0 && CZ[i - 1] < nr) {
          const t = (nr - CZ[i - 1]) / (z - CZ[i - 1]);
          this.put2(
            mix(CX[i - 1], CX[i], t),
            mix(CY[i - 1], CY[i], t),
            nr,
            mix(CM[i - 1], CM[i], t),
          );
        }
        inRun = true;
        this.put2(CX[i], CY[i], z, CM[i]);
      } else if (inRun) {
        const t = (nr - CZ[i - 1]) / (z - CZ[i - 1]);
        this.put2(mix(CX[i - 1], CX[i], t), mix(CY[i - 1], CY[i], t), nr, mix(CM[i - 1], CM[i], t));
        flush();
      }
    }
    flush();
    this.usePM = false;
    this.id = base + 1;
    return this;
  }

  /** Clear (or, with INKFILL, fill solid) the current 3D path's polygon, clipped at the near plane. */
  fill3(kind = FILL): this {
    const n = this.n3;
    const nr = this.near;
    this.n = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const za = CZ[i];
      const zb = CZ[j];
      if (za >= nr) this.put2(CX[i], CY[i], za);
      if (za >= nr !== zb >= nr) {
        const t = (nr - za) / (zb - za);
        this.put2(mix(CX[i], CX[j], t), mix(CY[i], CY[j], t), nr);
      }
    }
    if (this.n >= 3) this.fan(kind);
    else this.id++;
    return this;
  }

  /** A straight 3D line, clipped at the near plane. */
  line3(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    w = 1,
    taper = 0.2,
    wob = 0.8,
  ) {
    this.m3(x0, y0, z0).l3(x1, y1, z1).s3(w, taper, wob);
  }

  /** A 3D path through k + 1 points sampled from fn(t), t in [0, 1]. */
  curve3(fn: (t: number, out: number[]) => void, k: number, w = 1, taper = 0.25, wob = 0.8) {
    const P = this.p;
    for (let i = 0; i <= k; i++) {
      fn(i / k, P);
      if (i === 0) this.m3(P[0], P[1], P[2]);
      else this.l3(P[0], P[1], P[2]);
    }
    this.s3(w, taper, wob);
  }

  private p = [0, 0, 0];
  private sx = new Float32Array(100);
  private sy = new Float32Array(100);
  private sz = new Float32Array(100);
  private sw = new Float32Array(100);
  private G = new Float32Array(3 * 65 * 65);
  private GN = new Float32Array(3 * 65 * 65);
  private GL = new Float32Array(65 * 65);
  private GV = new Uint8Array(65 * 65);

  /**
   * A surface fn(u, v) -> (x, y, z), u and v in [0, 1], drawn as ink draws it: optionally
   * clearing what is behind, outlined at chosen edges, and hatched along its own curvature,
   * the strands denser where more light falls (and crossed where it is brightest).
   */
  surf(
    fn: (u: number, v: number, out: number[]) => void,
    nu: number,
    nv: number,
    st: SurfaceStyle = {},
  ) {
    nu = clamp(Math.round(nu), 1, 64);
    nv = clamp(Math.round(nv), 1, 64);
    // every mark of a surface takes its id from what it is (which strand, which dash), and the
    // surface always uses the same span of ids, so nothing elsewhere re-boils when strands come
    // and go with the light
    const base = this.id;
    this.surface(fn, nu, nv, st, base);
    this.id = base + 400009;
  }

  private surface(
    fn: (u: number, v: number, out: number[]) => void,
    nu: number,
    nv: number,
    st: SurfaceStyle,
    base: number,
  ) {
    const light = st.light ?? defaultLight;
    const G = this.G;
    const GN = this.GN;
    const GL = this.GL;
    const P = this.p;
    const cols = nu + 1;
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        fn(i / nu, j / nv, P);
        const k = (j * cols + i) * 3;
        G[k] = P[0];
        G[k + 1] = P[1];
        G[k + 2] = P[2];
      }
    }
    // which grid points are on (or near) the view: parts of the surface away from it are skipped
    const GV = this.GV;
    let anyVis = false;
    for (let i = 0; i < cols * (nv + 1); i++) {
      const ok = this.p3(G[i * 3], G[i * 3 + 1], G[i * 3 + 2], this.p);
      GV[i] = ok && Math.abs(this.p[0]) < this.A + 0.7 && Math.abs(this.p[1]) < 1.7 ? 1 : 0;
      if (GV[i]) anyVis = true;
    }
    if (!anyVis) return;
    // normals, turned to face the eye, and the light on each
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const a = (j * cols + Math.min(nu, i + 1)) * 3;
        const b = (j * cols + Math.max(0, i - 1)) * 3;
        const c = (Math.min(nv, j + 1) * cols + i) * 3;
        const d = (Math.max(0, j - 1) * cols + i) * 3;
        const ux = G[a] - G[b];
        const uy = G[a + 1] - G[b + 1];
        const uz = G[a + 2] - G[b + 2];
        const vx = G[c] - G[d];
        const vy = G[c + 1] - G[d + 1];
        const vz = G[c + 2] - G[d + 2];
        let nx = uy * vz - uz * vy;
        let ny = uz * vx - ux * vz;
        let nz = ux * vy - uy * vx;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl;
        ny /= nl;
        nz /= nl;
        const k = (j * cols + i) * 3;
        const tx = this.ex - G[k];
        const ty = this.ey - G[k + 1];
        const tz = this.ez - G[k + 2];
        if (nx * tx + ny * ty + nz * tz < 0) {
          nx = -nx;
          ny = -ny;
          nz = -nz;
        }
        GN[k] = nx;
        GN[k + 1] = ny;
        GN[k + 2] = nz;
        GL[j * cols + i] = clamp(light(G[k], G[k + 1], G[k + 2], nx, ny, nz), 0, 1);
      }
    }
    if (st.fill) {
      for (let j = 0; j < nv; j++) {
        for (let i = 0; i < nu; i++) {
          this.id = base + 1 + j * 65 + i;
          const k0 = (j * cols + i) * 3;
          const k1 = (j * cols + i + 1) * 3;
          const k2 = ((j + 1) * cols + i + 1) * 3;
          const k3 = ((j + 1) * cols + i) * 3;
          this.m3(G[k0], G[k0 + 1], G[k0 + 2])
            .l3(G[k1], G[k1 + 1], G[k1 + 2])
            .l3(G[k2], G[k2 + 1], G[k2 + 2])
            .l3(G[k3], G[k3 + 1], G[k3 + 2])
            .fill3();
        }
      }
    }
    const seed = st.seed ?? 0;
    const w = st.w ?? 0.6;
    const floor = st.floor ?? 0.08;
    const ragged = st.ragged ?? 0.35;
    const gap = st.gap ?? 5;
    const dir = st.dir ?? 0;
    const cross = st.cross ?? 0.75;
    const at = (u: number, v: number) => {
      const fu = u * nu;
      const fv = v * nv;
      const i = Math.min(nu - 1, Math.floor(fu));
      const j = Math.min(nv - 1, Math.floor(fv));
      const a = fu - i;
      const b = fv - j;
      return mix(
        mix(GL[j * cols + i], GL[j * cols + i + 1], a),
        mix(GL[(j + 1) * cols + i], GL[(j + 1) * cols + i + 1], a),
        b,
      );
    };
    const Q = [0, 0, 0];
    /** The surface's extent on screen across the strands, over the gap: how many strands. */
    const span = (across: 0 | 1) => {
      let L = 0;
      let prev = false;
      let qx = 0;
      let qy = 0;
      for (let i = 0; i <= 8; i++) {
        if (across === 0) fn(i / 8, 0.5, P);
        else fn(0.5, i / 8, P);
        const ok = this.p3(P[0], P[1], P[2], Q);
        if (ok && prev) L += Math.hypot(Q[0] - qx, Q[1] - qy);
        prev = ok;
        qx = Q[0];
        qy = Q[1];
      }
      return (L * this.px) / gap;
    };
    const dashes = st.dashes ?? 0;
    const exact = !!st.exact;
    const SX = this.sx;
    const SY = this.sy;
    const SZ = this.sz;
    const SW = this.sw;
    /** The light at (u, v): the grid's, or (exact) the light function's, with the grid's normal. */
    const lightAt = (u: number, v: number, x: number, y: number, z: number) => {
      const fu = Math.min(nu - 1, Math.floor(u * nu));
      const fv = Math.min(nv - 1, Math.floor(v * nv));
      const c0 = fv * cols + fu;
      // off the view, nothing to draw
      if (!(GV[c0] | GV[c0 + 1] | GV[c0 + cols] | GV[c0 + cols + 1])) return 0;
      if (!exact) return at(u, v);
      // where the grid around is dark, the light function need not be asked
      if (GL[c0] < 0.02 && GL[c0 + 1] < 0.02 && GL[c0 + cols] < 0.02 && GL[c0 + cols + 1] < 0.02)
        return 0;
      const i = Math.min(nu, Math.round(u * nu));
      const j = Math.min(nv, Math.round(v * nv));
      const k = (j * cols + i) * 3;
      return clamp(light(x, y, z, GN[k], GN[k + 1], GN[k + 2]), 0, 1);
    };
    // strands along v sit at fixed u (spread across u), and the other way about: fixed to the
    // surface, each a run of dashes (or unbroken runs) wherever the light admits it; brighter
    // light admits more strands, and thicker ones
    // the brightest light on the surface: strands that need more are never drawn
    let maxL = 0;
    for (let i = 0; i < cols * (nv + 1); i++) if (GL[i] > maxL) maxL = GL[i];
    if (exact) maxL = Math.min(1, maxL + 0.35);
    const strands = (along: 0 | 1, lo: number, wt: number, sd: number) => {
      if (maxL <= Math.max(lo, floor)) return;
      const count = st.n
        ? Math.round(along === 0 ? st.n : st.n * (nv / Math.max(1, nu)))
        : clamp(Math.round(span(along === 0 ? 0 : 1)), 0, 180);
      const steps = clamp((along === 0 ? nv : nu) * 3, 6, 96);
      for (let s = 0; s < Math.min(count, 240); s++) {
        const c = (s + 0.5 + (hash(s, sd) - 0.5) * 0.45) / count;
        const thr = mix(Math.max(lo, floor), 1, (s * 0.6180339 + hash(sd, 9)) % 1);
        if (thr - ragged * 0.15 > maxL) continue;
        for (let q = 0; q <= steps; q++) {
          const t = q / steps;
          const u = along === 0 ? c : t;
          const v = along === 0 ? t : c;
          fn(u, v, P);
          SX[q] = P[0];
          SY[q] = P[1];
          SZ[q] = P[2];
          SW[q] = lightAt(u, v, P[0], P[1], P[2]);
        }
        // pieces along the strand, in its own parameter: dashes, or the whole strand
        const D = dashes > 0 ? dashes : 1;
        const shift = hash(s, sd + 5) / D;
        for (let k = -1; k < D; k++) {
          this.id = base + 5000 + (along * 2 + (lo > 0 ? 1 : 0)) * 90001 + s * 331 + (k + 1) * 3;
          const c0 = k / D + shift;
          const len = (1 / D) * (0.8 + 0.4 * hash(s * 37 + k, sd + 6));
          const d0 = Math.max(0, dashes > 0 ? c0 + len * 0.3 * hash(s * 41 + k, sd + 7) : 0);
          const d1 = Math.min(
            1,
            dashes > 0 ? c0 + len * (0.55 + 0.45 * hash(s * 43 + k, sd + 8)) : 1,
          );
          if (d1 <= d0) continue;
          // the lit parts of [d0, d1], interpolating between samples
          let q = Math.min(steps - 1, Math.floor(d0 * steps));
          let d = d0;
          let open = false;
          for (let guard = 0; guard < steps + 2; guard++) {
            const tt = clamp(d * steps - q, 0, 1);
            const lit = mix(SW[q], SW[q + 1], tt);
            const jag = ragged * (hash(s * 131 + q, sd + 3) - 0.5) * 0.3;
            if (lit > thr + jag) {
              const x = mix(SX[q], SX[q + 1], tt);
              const y = mix(SY[q], SY[q + 1], tt);
              const z = mix(SZ[q], SZ[q + 1], tt);
              const wm = 0.55 + 0.9 * lit;
              if (!open) {
                this.m3(x, y, z);
                CM[0] = wm;
                open = true;
              } else this.l3(x, y, z, wm);
            } else if (open) {
              if (this.n3 >= 2) this.s3(wt, 0.3, 0.45);
              open = false;
            }
            if (d >= d1 - 1e-6) break;
            if ((q + 1) / steps < d1 && q < steps - 1) {
              q++;
              d = q / steps;
            } else d = d1;
          }
          if (open && this.n3 >= 2) this.s3(wt, 0.3, 0.45);
        }
      }
    };
    if (dir === 0 || dir === 2) strands(0, 0, w, seed);
    if (dir === 1 || dir === 2) strands(1, dir === 2 ? cross : 0, w * 0.85, seed + 17);
    if (dir === 0) strands(1, cross, w * 0.8, seed + 17);
    else if (dir === 1) strands(0, cross, w * 0.8, seed);
    // outline: heavy on the shadow side, light (and broken: lost edges) where it is lit
    const edge = st.edge ?? 0;
    if (edge > 0) {
      const edges = st.edges ?? 15;
      const iso = (fixed: 0 | 1, val: number, e: number) => {
        const k = clamp((fixed === 0 ? nv : nu) * 3, 6, 96);
        let open = false;
        this.id = base + 380000 + e * 4001;
        for (let q = 0; q <= k; q++) {
          const t = q / k;
          const u = fixed === 0 ? val : t;
          const v = fixed === 0 ? t : val;
          const lit = at(u, v);
          const lost = lit > 0.62 && noise(t * 7 + e * 3.1, seed + 21) < -0.25;
          if (!lost) {
            fn(u, v, P);
            const wm = mix(1.5, 0.6, lit);
            if (!open) {
              this.m3(P[0], P[1], P[2]);
              CM[0] = wm;
              open = true;
            } else this.l3(P[0], P[1], P[2], wm);
          } else if (open) {
            if (this.n3 >= 2) this.s3(edge, 0.1, 0.8);
            open = false;
          }
        }
        if (open && this.n3 >= 2) this.s3(edge, 0.1, 0.8);
      };
      if (edges & 1) iso(0, 0, 1);
      if (edges & 2) iso(0, 1, 2);
      if (edges & 4) iso(1, 0, 3);
      if (edges & 8) iso(1, 1, 4);
    }
  }
}
