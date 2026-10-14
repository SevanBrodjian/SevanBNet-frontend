// 2. The jungle. Warm, bright, not Earth. First person, and nothing of us is seen: we stand in
// dense overgrowth, a curtain of great leaves across our way, flecked with sun, the clearing
// showing between them. We walk into them; they give against us, swing aside on their stems
// and spring back behind us, a hanging vine is pushed aside by our shoulder, and a pair of
// eyes just beyond the leaves shuts and ducks away. We come out into the clearing under a
// great limb hung with leaves: a giant cap growth at its heart standing in a pool of sun, a
// sheaf of light down through the canopy with spores turning in it, fiddleheads unrolling,
// pleated fans, pods hanging on threads, vines with rolled tips. Things live here and look at
// us: eyes in the undergrowth, a tall gentle grazer that lifts its head from the plants to
// watch us and gives us a long slow blink, small moth-winged fliers whose bodies are eyes, a
// little cap adrift in the air with an eye among its gills. We look up at the grazer, then
// walk on toward the heart.
//
// Ink is light: a surface is hatched where sun reaches it (through holes in the canopy, so the
// light is dappled) or where the bright floor throws light back onto it; shadow is bare black.
// Every object draws with its own fixed span of stroke ids, so nothing re-boils when
// something before it comes or goes.

import type { Scene } from "../engine";
import { clamp, hash, mix, noise, type Sketch, smooth, TAU } from "../sketch";
import {
  type Drifter,
  drifter,
  type Flier,
  flier,
  flierAt as flierFn,
  Grazer,
  grazer,
  stepWatcher,
  type Watcher,
  watcher,
  watcherGazes,
} from "./jungle-fauna";
import {
  type Cap,
  cap,
  type Fan,
  type Fiddle,
  fan,
  fiddle,
  type Mass,
  mass,
  type PodPlant,
  podPlant,
  type Trunk,
  trunk,
  tube,
  type Vine,
  vine,
} from "./jungle-flora";
import { Gaze, spring, vdc } from "./jungle-kit";
import {
  edgePoint,
  type Form,
  type Frame3,
  form,
  frame,
  frameTo,
  leaf,
  leafPoint,
  newFrame,
  rotTo,
  setBend,
  stem,
  turnTo,
  type V3,
} from "./jungle-leaf";
import {
  capShade,
  DX,
  DY,
  DZ,
  GH,
  GR,
  GX,
  GZ,
  groundLight,
  HOLES,
  leafLight,
  open,
  SHAFTS,
  SUN,
  setTime,
} from "./jungle-light";

const DUR = 14;
const FOC = 1.15;
const EYE_Y = -1.56;

/** Give an object its own span of stroke ids. */
const gid = (sk: Sketch, n: number) => {
  sk.id = n * 50021;
};

// ---------------------------------------------------------------- the leaves we walk through

interface Near {
  F: Frame3;
  form: Form;
  /** The axis it swings about (through its base), positive away from our path. */
  k: V3;
  /** Its stem: from where, bowed how, weights. */
  stem: V3 | null;
  bow: V3;
  sw: [number, number];
  /** Hatch strokes between veins; weight. */
  hatch: number;
  w: number;
  /** Points on it (relative to its base), for when our body meets it. */
  S: Float32Array;
}

function near(
  B: V3,
  dir: V3,
  face: V3,
  L: number,
  f: Partial<Form>,
  k: V3,
  st: V3 | null,
  hatch = 4,
  w = 1,
): Near {
  const F = frame(B, dir, face, L);
  const fm = form(f);
  const S = new Float32Array(11 * 3);
  const pts: [number, number][] = [
    [0.3, 0],
    [0.5, 0],
    [0.7, 0],
    [0.88, 0],
    [1.0, 0],
    [0.4, 0.8],
    [0.6, 0.85],
    [0.8, 0.7],
    [0.4, -0.8],
    [0.6, -0.85],
    [0.8, -0.7],
  ];
  const P = [0, 0, 0];
  pts.forEach(([x, y], i) => {
    leafPoint(F, fm, x, y * fm.W, P);
    S[i * 3] = P[0] - B[0];
    S[i * 3 + 1] = P[1] - B[1];
    S[i * 3 + 2] = P[2] - B[2];
  });
  const kn = Math.hypot(k[0], k[1], k[2]);
  const kk: V3 = [k[0] / kn, k[1] / kn, k[2] / kn];
  // turn the way that takes its tip away from our path (or forward, for an upright axis)
  const tip: V3 = [S[4 * 3], S[4 * 3 + 1], S[4 * 3 + 2]];
  const moved = rotTo(tip, kk, 0.2, [0, 0, 0]);
  const away =
    Math.abs(kk[1]) > 0.7 ? moved[2] - tip[2] : Math.abs(B[0] + moved[0]) - Math.abs(B[0] + tip[0]);
  if (away < 0) {
    kk[0] = -kk[0];
    kk[1] = -kk[1];
    kk[2] = -kk[2];
  }
  return {
    F,
    form: fm,
    k: kk,
    stem: st,
    bow: [0.05, 0.1, 0],
    sw: [3.4, 2.2],
    hatch,
    w,
    S,
  };
}

const NEAR: Near[] = [
  // a low strap frond rising on the left
  near(
    [-0.88, 0.02, 1.45],
    [0.1, -1, 0.12],
    [0.2, -0.1, -1],
    1.0,
    {
      W: 0.15,
      lobe: 0,
      p: 0.8,
      q: 0.8,
      droop: 0.05,
      keel: 0.2,
      veins: 9,
      slant: 0.45,
      curl: 0.9,
      seed: 21,
    },
    [0, 0, 1],
    null,
    3,
    0.95,
  ),
  // hanging into the top of the way
  near(
    [0.08, -2.85, 1.45],
    [0.12, 1, 0.05],
    [0.05, 0.1, -1],
    0.95,
    {
      W: 0.27,
      lobe: 0.4,
      p: 0.7,
      q: 0.85,
      droop: 0.1,
      keel: 0.15,
      veins: 9,
      slant: 0.36,
      arc: 0.12,
      seed: 25,
    },
    [0, 0, 1],
    [0.0, -3.4, 1.5],
    3,
    1,
  ),
  // the right side, three leaves: across, hanging, rising
  near(
    [1.12, -1.0, 1.35],
    [-1, -0.25, 0.02],
    [-0.15, 0.1, -1],
    0.85,
    {
      W: 0.3,
      lobe: 0.6,
      p: 0.68,
      q: 0.85,
      droop: 0.12,
      keel: 0.15,
      veins: 9,
      slant: 0.34,
      arc: -0.1,
      seed: 27,
    },
    [0, 0, 1],
    [1.5, -0.6, 1.4],
    3,
    1,
  ),
  near(
    [0.82, -2.45, 1.05],
    [-0.42, 0.9, 0.02],
    [-0.1, 0.15, -1],
    1.0,
    {
      W: 0.3,
      lobe: 0.35,
      p: 0.68,
      q: 0.85,
      droop: 0.08,
      keel: 0.16,
      wave: 0.05,
      veins: 10,
      slant: 0.34,
      arc: 0.1,
      seed: 23,
    },
    [0, 0, 1],
    [1.3, -3.2, 1.1],
    3,
    1,
  ),
  near(
    [0.76, -0.22, 0.95],
    [-0.36, -1, -0.02],
    [-0.12, 0.15, -1],
    1.0,
    {
      W: 0.29,
      lobe: 0.3,
      p: 0.7,
      q: 0.9,
      droop: -0.06,
      keel: 0.15,
      wave: 0.06,
      veins: 10,
      slant: 0.32,
      arc: -0.12,
      seed: 7,
    },
    [0, 0, 1],
    [0.95, 0.4, 1.0],
    3,
    1,
  ),
  // the left side: across, rising, hanging
  near(
    [-1.05, -1.5, 1.25],
    [1, 0.12, 0.04],
    [0.15, -0.1, -1],
    0.85,
    {
      W: 0.28,
      lobe: 0.5,
      p: 0.66,
      q: 0.85,
      droop: 0.1,
      keel: 0.16,
      veins: 9,
      slant: 0.34,
      arc: 0.1,
      seed: 29,
    },
    [0, 0, 1],
    [-1.5, -1.8, 1.3],
    3,
    1,
  ),
  near(
    [-0.72, -0.3, 1.1],
    [0.34, -1, 0.0],
    [0.12, -0.15, -1],
    0.92,
    {
      W: 0.3,
      lobe: 0.4,
      p: 0.7,
      q: 0.88,
      droop: -0.05,
      keel: 0.15,
      veins: 10,
      slant: 0.33,
      arc: 0.12,
      seed: 31,
    },
    [0, 0, 1],
    [-0.9, 0.4, 1.1],
    3,
    1,
  ),
  near(
    [-0.78, -2.35, 0.95],
    [0.45, 0.9, 0.04],
    [0.12, -0.18, -1],
    1.0,
    {
      W: 0.31,
      lobe: 0.35,
      p: 0.66,
      q: 0.85,
      droop: 0.08,
      keel: 0.16,
      cup: 0.06,
      wave: 0.05,
      veins: 10,
      slant: 0.34,
      arc: -0.1,
      seed: 3,
    },
    [0, 0, 1],
    [-1.3, -3.2, 1.0],
    3,
    1,
  ),
  // further along the way, brushed as we pass
  near(
    [0.78, -0.32, 2.45],
    [-0.6, -0.2, -0.32],
    [-0.1, -1, -0.2],
    0.85,
    {
      W: 0.33,
      lobe: 0.6,
      p: 0.7,
      q: 0.9,
      droop: 0.12,
      keel: 0.15,
      veins: 8,
      slant: 0.35,
      seed: 41,
    },
    [0, 1, 0],
    [0.95, 0.02, 2.6],
    4,
    0.95,
  ),
  near(
    [-0.98, 0.02, 3.6],
    [0.36, -1, 0.06],
    [0.3, -0.2, -1],
    1.25,
    {
      W: 0.13,
      p: 0.8,
      q: 0.8,
      droop: 0.04,
      keel: 0.22,
      veins: 9,
      slant: 0.45,
      curl: 1.2,
      seed: 33,
    },
    [0, 0, 1],
    null,
    3,
    0.9,
  ),
];

// ---------------------------------------------------------------- the clearing

const CAPS_: Cap[] = [
  { x: GX, z: GZ, h: GH, R: GR, dome: 0.5, sr: 0.24, lean: 0.25, gills: 120, threads: 12, seed: 3 },
  {
    x: GX + 1.55,
    z: GZ - 0.9,
    h: 2.15,
    R: 0.8,
    dome: 0.55,
    sr: 0.11,
    lean: -0.15,
    gills: 64,
    threads: 5,
    seed: 5,
  },
  {
    x: GX - 1.3,
    z: GZ - 0.7,
    h: 1.15,
    R: 0.55,
    dome: 0.7,
    sr: 0.075,
    lean: 0.1,
    gills: 40,
    threads: 0,
    seed: 7,
  },
];

const FIDDLES: Fiddle[] = [
  { x: -2.3, z: 7.3, L: 2.1, az: 0.3, r0: 0.06, u0: 0.25, du: 0.012, lean: 0.12, seed: 1 },
  { x: -2.6, z: 7.6, L: 1.5, az: -0.6, r0: 0.05, u0: 0.05, du: 0.01, lean: -0.15, seed: 2 },
  { x: -2.05, z: 7.0, L: 1.1, az: 0.9, r0: 0.04, u0: 0.5, du: 0.015, lean: 0.25, seed: 3 },
  { x: -2.75, z: 7.2, L: 0.8, az: 2.4, r0: 0.035, u0: 0.1, du: 0.01, lean: 0.1, seed: 4 },
  { x: 1.95, z: 6.2, L: 1.4, az: 2.6, r0: 0.045, u0: 0.3, du: 0.012, lean: -0.1, seed: 5 },
  { x: 2.2, z: 6.4, L: 0.95, az: 3.3, r0: 0.035, u0: 0.1, du: 0.01, lean: -0.2, seed: 6 },
  { x: -1.15, z: 4.7, L: 1.45, az: 0.1, r0: 0.05, u0: 0.15, du: 0.014, lean: 0.05, seed: 7 },
];

const FANS: Fan[] = [
  { x: 2.35, z: 5.3, h: 1.0, R: 0.85, span: 2.3, az: -1.9, tilt: 0.35, ribs: 16, seed: 11 },
  { x: -3.5, z: 10.5, h: 1.4, R: 1.15, span: 2.5, az: -1.3, tilt: 0.3, ribs: 20, seed: 12 },
  { x: 3.0, z: 9.3, h: 0.5, R: 0.85, span: 2.4, az: -2.0, tilt: 0.25, ribs: 16, seed: 13 },
  { x: 4.2, z: 9.9, h: 0.7, R: 1.0, span: 2.6, az: -1.6, tilt: 0.2, ribs: 18, seed: 14 },
];

const PODS: PodPlant[] = [
  {
    x: -3.4,
    z: 8.7,
    h: 2.5,
    reach: 1.45,
    az: 0.15,
    pods: [
      [0.56, 0.12, 0.42, 0.13],
      [0.78, 0.2, 0.5, 0.15],
      [0.97, 0.1, 0.36, 0.11],
    ],
    seed: 21,
  },
];

const TRUNKS: Trunk[] = [
  { x: -4.8, z: 9.2, r: 0.55, twist: 1.3, seed: 1 },
  { x: 6.4, z: 7.0, r: 0.5, twist: -1.4, seed: 4 },
];

const VINES: Vine[] = [
  { x: -2.3, z: 6.8, top: -7.5, len: 5.4, seed: 1 },
  { x: -1.05, z: 6.0, top: -7.5, len: 5.9, seed: 2 },
  { x: -0.25, z: 3.75, top: -7.5, len: 5.9, seed: 4 },
];
/** The vine hanging in our way. */
const VW = 2;

/** Broad leaves round the clearing: x, z, count, length, height, seed, form. */
const ROSETTES: [number, number, number, number, number, number, Partial<Form>][] = [
  [-1.75, 3.2, 3, 0.7, 0.25, 11, { W: 0.3, lobe: 0.8, veins: 8 }],
  [1.45, 3.1, 3, 0.65, 0.25, 12, { W: 0.3, lobe: 0.6, veins: 8, curl: 0.8 }],
  [3.5, 7.1, 4, 1.2, 0.7, 13, { W: 0.24, lobe: 0.2, veins: 10 }],
  [-1.6, 8.3, 3, 0.75, 0.3, 15, { W: 0.3, lobe: 0.5, veins: 8, curl: 0.9 }],
];

/** Foliage far off: clusters round the back and sides of the clearing, and the canopy above. */
const MASSES: Mass[] = (
  [
    // the back, low and high
    [-6.2, -0.3, 15.0, 2.0, 6, -1.6, 1.25],
    [-3.9, -0.4, 17.0, 2.3, 7, -1.55, 1.3],
    [-1.5, -0.3, 18.2, 2.4, 7, -1.6, 1.3],
    [1.0, -0.4, 18.0, 2.4, 7, -1.55, 1.3],
    [3.4, -0.3, 17.0, 2.3, 7, -1.6, 1.25],
    [5.8, -0.4, 15.2, 2.1, 6, -1.6, 1.25],
    [-2.8, -2.6, 19.0, 2.6, 5, -1.6, 1.0],
    [0.4, -3.0, 19.6, 2.7, 5, -1.55, 1.0],
    [3.6, -2.5, 18.8, 2.5, 5, -1.6, 1.0],
    // the far wall rising high above the clearing, in the sun
    [-5.6, -4.6, 18.6, 2.8, 5, -1.7, 1.1],
    [-2.2, -5.3, 20.6, 3.0, 5, -1.5, 1.1],
    [1.6, -5.0, 20.4, 3.0, 5, -1.65, 1.1],
    [5.2, -4.4, 18.4, 2.8, 5, -1.45, 1.1],
    [-3.9, -7.4, 21.4, 3.2, 5, -1.6, 1.0],
    [0.0, -8.0, 22.0, 3.3, 5, -1.55, 1.0],
    [3.8, -7.2, 21.2, 3.1, 5, -1.6, 1.0],
    // the sides
    [-5.4, -0.4, 7.4, 1.9, 6, -1.3, 1.2],
    [-5.0, -1.9, 10.6, 2.1, 6, -1.7, 1.2],
    [-6.0, -0.5, 12.6, 2.1, 6, -1.5, 1.2],
    [5.9, -0.4, 6.4, 1.9, 6, -1.85, 1.2],
    [6.4, -1.8, 9.4, 2.1, 6, -1.45, 1.2],
    [6.0, -0.4, 12.8, 2.1, 6, -1.6, 1.2],
  ] as const
).map(([x, y, z, L, n, dir, spread], i) => ({ x, y, z, L, n, dir, spread, seed: 500 + i * 17 }));

const massLight = (x: number, y: number, z: number) =>
  clamp(0.95 * open(x, y, z) * capShade(x, y, z), 0, 1);

/** A great limb from the left trunk, reaching over the clearing; leaves and vines hang from it. */
const LIMB: number[] = [];
{
  const P0 = [-4.55, -4.2, 9.1];
  const P1 = [-2.6, -6.4, 8.6];
  const P2 = [0.2, -5.6, 8.0];
  const P3 = [2.6, -6.0, 7.7];
  for (let i = 0; i <= 20; i++) {
    const s = i / 20;
    const u = 1 - s;
    const a = u * u * u;
    const b = 3 * u * u * s;
    const c = 3 * u * s * s;
    const d = s * s * s;
    LIMB.push(
      a * P0[0] + b * P1[0] + c * P2[0] + d * P3[0],
      a * P0[1] + b * P1[1] + c * P2[1] + d * P3[1] + 0.06 * Math.sin(s * 11),
      a * P0[2] + b * P1[2] + c * P2[2] + d * P3[2],
      mix(0.3, 0.07, s ** 0.8),
    );
  }
}
const LIMB_LEAVES = Array.from({ length: 7 }, (_, j) =>
  form({
    W: 0.26 + 0.08 * hash(j, 61),
    lobe: 0.6 * hash(j, 62),
    veins: 8,
    droop: -0.12,
    keel: 0.12,
    arc: (hash(j, 63) - 0.5) * 0.2,
    curl: hash(j, 64) < 0.3 ? 0.8 : 0,
    seed: 600 + j,
  }),
);
const LV = new Float32Array(4 * 21);

const WATCHERS: Watcher[] = [
  // a pair in the undergrowth on the left of the clearing
  {
    x: -2.25,
    y: -0.95,
    z: 6.5,
    r: 0.15,
    pair: 0.4,
    hide: -1,
    seed: 41,
    leaves: [
      [-0.9, 3.5, 6],
      [0.3, 2.6, 5],
      [2.6, 3.2, 7],
    ],
  },
  // one, low on the right
  {
    x: 3.25,
    y: -1.1,
    z: 6.7,
    r: 0.17,
    pair: 0,
    hide: -1,
    seed: 42,
    leaves: [
      [-1.9, 2.4, 5.5],
      [0.6, 2.2, 5],
    ],
  },
  // a pair just beyond the leaves we push through: they see us coming, shut, and are gone
  {
    x: -0.6,
    y: -1.25,
    z: 3.3,
    r: 0.085,
    pair: 0.23,
    hide: 4.25,
    seed: 44,
    leaves: [
      [-0.7, 2.8, 7],
      [2.2, 2.6, 6],
    ],
  },
  // in a hollow of the great trunk
  { x: -4.3, y: -2.55, z: 8.7, r: 0.2, pair: 0, hide: -1, seed: 45, leaves: [[1.2, 2.6, 4.5]] },
];

const FLIERS: Flier[] = [
  {
    x: 0.4,
    y: -2.3,
    z: 5.5,
    rx: 1.2,
    ry: 0.5,
    rz: 1.0,
    speed: 1,
    s: 0.085,
    seed: 51,
    run: [-1.7, -1.8, 3.1, 1.9, -2.2, 3.6, 1.2, 3.0],
  },
  { x: -0.2, y: -2.7, z: 9.2, rx: 1.6, ry: 0.6, rz: 1.3, speed: 0.9, s: 0.09, seed: 52 },
  {
    x: 2.7,
    y: -2.9,
    z: 8.2,
    rx: 1.3,
    ry: 0.5,
    rz: 1.0,
    speed: 1.1,
    s: 0.08,
    seed: 53,
    run: [2.6, -2.7, 8.2, -0.9, -1.95, 6.6, 11.0, 2.6],
  },
];

const DRIFT: Drifter = {
  r: 0.19,
  seed: 61,
  path: (t, o) => {
    const k = smooth(0, 14, t);
    o[0] = mix(2.9, -0.35, k) + 0.25 * noise(t * 0.3, 61);
    o[1] = mix(-3.2, -2.25, k) + 0.1 * Math.sin(t * 1.3) + 0.06 * Math.sin(t * 2.9 + 1);
    o[2] = mix(10.0, 7.9, k) + 0.3 * noise(t * 0.25, 62);
  },
};

// ---------------------------------------------------------------- state

class State {
  /** Camera: z; speed, its rate; yaw, v; pitch, v; roll, v. */
  w = new Float64Array(10);
  cx = 0;
  cy = EYE_Y;
  cz = 0;
  yaw = 0;
  pitch = 0;
  roll = 0;
  stepPh = 0;
  /** Each near leaf: angle, rate. */
  lv = new Float64Array(NEAR.length * 2);
  /** How hard we are pressing on leaves (for the walk and the hand's excitement). */
  press = 0;
  pressL = 0;
  pressR = 0;
  /** The vine in our way: x push, rate. */
  vp = new Float64Array(2);
  grazer = new Grazer();
  watch = watcherGazes(WATCHERS);
  fl = FLIERS.map((f) => new Gaze(f.seed, 0.8, 0.8, 0.35));
  dr = new Gaze(DRIFT.seed, 0.78, 0.6, 0.6);
  t = 0;

  reset() {
    this.w.fill(0);
    this.w[6] = 0.03;
    this.lv.fill(0);
    this.vp.fill(0);
    this.stepPh = 0;
    this.press = 0;
    this.pressL = 0;
    this.pressR = 0;
    this.t = 0;
    this.grazer.reset();
    for (const g of this.watch) for (const e of g) e.reset();
    for (const g of this.fl) g.reset();
    this.dr.reset();
    this.pose();
  }

  step(dt: number, t: number) {
    this.t = t;
    const w = this.w;
    // walking: still at first, then into the leaves (they slow us), out into the clearing
    const vt =
      t < 2.9
        ? 0
        : t < 5.6
          ? 0.55 - 0.3 * clamp(this.press, 0, 1)
          : t < 8.2
            ? 0.72
            : t < 10.8
              ? 0.38
              : 0.42;
    spring(w, 1, vt, 2.6, 1, dt);
    w[0] += w[1] * dt;
    // where we look
    const yt = t < 2.9 ? 0.02 * Math.sin(t * 0.8) : t < 7.4 ? -0.03 : t < 10.7 ? 0.22 : -0.02;
    spring(w, 3, yt, 2.3, 0.85, dt);
    const pt = t < 2.9 ? 0.04 : t < 5.6 ? 0.08 : t < 7.6 ? 0.0 : t < 10.9 ? -0.11 : 0.05;
    spring(w, 5, pt, 2.2, 0.85, dt);
    // pressing through, the body twists to the side that gives
    spring(w, 7, 0.035 * (this.pressR - this.pressL), 5, 0.6, dt);
    this.stepPh += w[1] * dt;
    this.pose();
    // the leaves: springs on their stems, wind in them, pushed aside by our body
    let press = 0;
    let pl = 0;
    let pr = 0;
    for (let i = 0; i < NEAR.length; i++) {
      const lf = NEAR[i];
      const rest = 0.035 * noise(t * 0.45 + i * 3.1, 11) + 0.015 * Math.sin(t * 1.3 + i);
      spring(this.lv, i * 2, rest, 3.3, 0.16, dt);
      const th0 = this.lv[i * 2];
      let th = th0;
      let guard = 0;
      while (guard++ < 70 && this.hits(lf, th)) th += 0.03;
      if (th > th0) {
        this.lv[i * 2] = th;
        this.lv[i * 2 + 1] = Math.max(
          this.lv[i * 2 + 1],
          Math.min((th - th0) / Math.max(dt, 1e-3), 3.2),
        );
        press += 1;
        if (lf.F.B[0] < 0) pl += 1;
        else pr += 1;
      }
    }
    this.press = this.press * Math.exp(-dt * 4) + press * (1 - Math.exp(-dt * 4)) * 0.6;
    this.pressL = this.pressL * Math.exp(-dt * 4) + pl * (1 - Math.exp(-dt * 4));
    this.pressR = this.pressR * Math.exp(-dt * 4) + pr * (1 - Math.exp(-dt * 4));
    // the vine in our way: our shoulder meets it and pushes it aside (a stiff contact on a
    // soft pendulum), and it swings back behind us
    {
      const V = VINES[VW];
      const n = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / n;
      for (let k = 0; k < n; k++) {
        const dz = Math.abs(this.cz + 0.1 - V.z);
        let a = -2.6 * 2.6 * this.vp[0] - 2 * 0.12 * 2.6 * this.vp[1];
        if (dz < 0.4) {
          const need = -(Math.sqrt(0.4 * 0.4 - dz * dz) - (this.cx - V.x));
          if (this.vp[0] > need)
            a += 900 * (need - this.vp[0]) - 30 * this.vp[1] * (this.vp[1] > 0 ? 1 : 0);
        }
        this.vp[1] += a * h;
        this.vp[0] += this.vp[1] * h;
      }
    }
    this.grazer.step(dt, t);
    WATCHERS.forEach((wt, i) => {
      stepWatcher(wt, this.watch[i], dt, t);
    });
    this.fl.forEach((g) => {
      g.step(dt, t);
    });
    this.dr.step(dt, t);
  }

  pose() {
    const w = this.w;
    const sp = clamp(w[1] / 0.4, 0, 1);
    const ph = (this.stepPh / 0.66) * Math.PI;
    const bob = 0.02 * sp * (1 - Math.cos(2 * ph)) * 0.5;
    const sway = 0.012 * sp * Math.sin(ph);
    const breath = 0.004 * Math.sin(this.t * 1.3) + 0.002 * Math.sin(this.t * 0.47 + 1);
    this.cx = sway;
    this.cy = EYE_Y + bob + breath;
    this.cz = w[0];
    this.yaw = w[3] + 0.012 * noise(this.t * 0.35, 7) + 0.004 * Math.sin(ph);
    this.pitch = w[5] + 0.008 * noise(this.t * 0.5, 8);
    this.roll = w[7] + 0.006 * Math.sin(ph) + 0.004 * noise(this.t * 0.3, 9);
  }

  /** Does leaf lf, turned by th, cut into our body? */
  hits(lf: Near, th: number): boolean {
    const B = lf.F.B;
    // our body as it leans into the leaves: wider about the head and shoulders, and reaching
    // ahead of the eye, so nothing is pushed into our face
    const bx = this.cx;
    const bz = this.cz + 0.12;
    for (let j = 0; j < 11; j++) {
      HV[0] = lf.S[j * 3];
      HV[1] = lf.S[j * 3 + 1];
      HV[2] = lf.S[j * 3 + 2];
      rotTo(HV, lf.k, th, HV);
      const y = B[1] + HV[1];
      if (y < -2.0 || y > 0.1) continue;
      const rx = y < -1.1 ? 0.43 : 0.34;
      const rz = y < -1.1 ? 0.55 : 0.42;
      const dx = (B[0] + HV[0] - bx) / rx;
      const dz = (B[2] + HV[2] - bz) / rz;
      if (dx * dx + dz * dz < 1) return true;
    }
    return false;
  }
}
const HV: V3 = [0, 0, 0];

// ---------------------------------------------------------------- the scene

export function jungle(): Scene {
  const S = new State();
  S.reset();
  return {
    t: 0,
    dur: DUR,
    exit: [-0.12, 0.2],
    still: 9.8,
    excite: 0,
    reset() {
      this.t = 0;
      S.reset();
    },
    step(dt) {
      this.t += dt;
      S.step(dt, this.t);
      this.excite = 0.35 * clamp(S.press, 0, 1);
    },
    draw(sk) {
      draw(sk, S, this.t);
    },
  };
}

interface Item {
  d: number;
  g: number;
  f: () => void;
  /** A sphere round it (world), for skipping what the near leaves hide; r 0 for none. */
  x: number;
  y: number;
  z: number;
  r: number;
}

const ITEMS: Item[] = [];
let NI = 0;
function item(d: number, g: number, f: () => void, x = 0, y = 0, z = 0, r = 0) {
  if (NI >= ITEMS.length) ITEMS.push({ d, g, f, x, y, z, r });
  else {
    const it = ITEMS[NI];
    it.d = d;
    it.g = g;
    it.f = f;
    it.x = x;
    it.y = y;
    it.z = z;
    it.r = r;
  }
  NI++;
}

// ---------------------------------------------------------------- what the near leaves hide

/** Corners of a coarse grid over the view, marked where a near leaf covers them. */
const CW = 44;
const CH = 36;
const COV = new Uint8Array((CW + 1) * (CH + 1));
let covDepth = 0;
let covOn = false;
const PX: number[] = [];
const PY: number[] = [];
const XS: number[] = [];
const EP = [0, 0, 0];
const EQ = [0, 0, 0];

/**
 * Mark what cannot be seen: beyond the oval where the drawing gives out, and (at the start)
 * behind the near leaves that are not being pushed.
 */
function coverage(sk: Sketch, S: State, leaves: boolean) {
  covOn = true;
  covDepth = 0;
  const A = sk.A;
  for (let r = 0; r <= CH; r++) {
    const y = -1 + (2 * r) / CH;
    for (let c = 0; c <= CW; c++) {
      const x = -A + (2 * A * c) / CW;
      COV[r * (CW + 1) + c] = Math.hypot(x / (A * 0.98), y / 0.98) > 0.97 ? 1 : 0;
    }
  }
  if (!leaves) return;
  for (let i = 0; i < NEAR.length; i++) {
    const th = S.lv[i * 2];
    if (Math.abs(th) > 0.08) continue;
    const lf = NEAR[i];
    turnTo(lf.F, lf.k, th, TF);
    PX.length = 0;
    PY.length = 0;
    let ok = true;
    for (let k = 0; k < 24 && ok; k++) {
      const side = k < 12 ? -1 : 1;
      const u = k < 12 ? k / 11 : (23 - k) / 11;
      edgePoint(TF, lf.form, 0.04 + 0.92 * u, side, EP);
      if (!sk.p3(EP[0], EP[1], EP[2], EQ)) ok = false;
      PX.push(EQ[0]);
      PY.push(EQ[1]);
      if (EQ[2] > covDepth) covDepth = EQ[2];
    }
    if (!ok) continue;
    // fill: for each row of corners, the spans inside the outline (pulled in a little)
    const n = PX.length;
    for (let r = 0; r <= CH; r++) {
      const y = -1 + (2 * r) / CH;
      XS.length = 0;
      for (let k = 0; k < n; k++) {
        const j = (k + 1) % n;
        const ya = PY[k];
        const yb = PY[j];
        if (ya <= y !== yb <= y) XS.push(PX[k] + ((y - ya) / (yb - ya)) * (PX[j] - PX[k]));
      }
      XS.sort((a, b) => a - b);
      for (let q = 0; q + 1 < XS.length; q += 2) {
        const x0 = XS[q] + 0.012;
        const x1 = XS[q + 1] - 0.012;
        if (x1 <= x0) continue;
        const c0 = Math.max(0, Math.ceil(((x0 + A) / (2 * A)) * CW));
        const c1 = Math.min(CW, Math.floor(((x1 + A) / (2 * A)) * CW));
        for (let c = c0; c <= c1; c++) COV[r * (CW + 1) + c] = 1;
      }
    }
  }
}

/** Is the item wholly behind the near leaves (or beyond the edge of the drawing)? */
function hidden(sk: Sketch, it: Item): boolean {
  return hiddenS(sk, it.x, it.y, it.z, it.r);
}

function hiddenS(sk: Sketch, x: number, y: number, z: number, r: number): boolean {
  if (!covOn || r <= 0) return false;
  if (!sk.p3(x, y, z, EQ)) return false;
  if (EQ[2] - r < covDepth + 0.1) return false;
  const rr = (r * sk.foc) / EQ[2] + 0.02;
  const A = sk.A;
  const c0 = Math.floor(((EQ[0] - rr + A) / (2 * A)) * CW);
  const c1 = Math.ceil(((EQ[0] + rr + A) / (2 * A)) * CW);
  const r0 = Math.floor(((EQ[1] - rr + 1) / 2) * CH);
  const r1 = Math.ceil(((EQ[1] + rr + 1) / 2) * CH);
  // off the view entirely: let the drawer decide
  if (c1 < 0 || c0 > CW || r1 < 0 || r0 > CH) return false;
  for (let r = Math.max(0, r0); r <= Math.min(CH, r1); r++) {
    for (let c = Math.max(0, c0); c <= Math.min(CW, c1); c++)
      if (!COV[r * (CW + 1) + c]) return false;
  }
  return true;
}

const TF = newFrame();

function draw(sk: Sketch, S: State, t: number) {
  setTime(t);
  sk.eye(S.cx, S.cy, S.cz, FOC, S.yaw, S.pitch, S.roll);
  sk.depthRef = 2.6;
  sk.depthW = 0.5;
  gid(sk, 1);
  ground(sk, S);
  NI = 0;
  // the jungle round the clearing
  TRUNKS.forEach((T, i) => {
    item(sk.depth(T.x, -2, T.z), 10 + i, () => trunk(sk, T));
  });
  MASSES.forEach((M, i) => {
    item(
      sk.depth(M.x, M.y, M.z) + 0.3,
      300 + i,
      () => mass(sk, M, t, massLight),
      M.x,
      M.y + (M.dir < 0 ? -M.L * 0.5 : M.L * 0.5),
      M.z,
      M.L,
    );
  });
  item(sk.depth(-1.2, -5.8, 8.4), 345, () => limb(sk, t), -1.0, -5.6, 8.4, 4.2);
  beams(sk, t);
  CAPS_.forEach((C, i) => {
    item(
      sk.depth(C.x, -C.h * 0.5, C.z),
      40 + i,
      () => cap(sk, C, t),
      C.x,
      -C.h * 0.6,
      C.z,
      C.R + C.h * 0.6,
    );
  });
  FIDDLES.forEach((F, i) => {
    item(
      sk.depth(F.x, -F.L * 0.5, F.z),
      50 + i,
      () => fiddle(sk, F, t),
      F.x,
      -F.L * 0.5,
      F.z,
      F.L * 0.75,
    );
  });
  FANS.forEach((F, i) => {
    item(
      sk.depth(F.x, -F.h, F.z) - 0.2,
      60 + i,
      () => fan(sk, F, t),
      F.x,
      -F.h * 0.8,
      F.z,
      F.R + F.h * 0.6,
    );
  });
  PODS.forEach((P, i) => {
    item(
      sk.depth(P.x + P.reach * 0.5, -P.h, P.z),
      70 + i,
      () => podPlant(sk, P, t),
      P.x + P.reach * 0.5,
      -P.h * 0.6,
      P.z,
      P.h,
    );
  });
  rosettes(sk, t);
  VINES.forEach((V, i) => {
    item(sk.depth(V.x, -3, V.z), 160 + i, () => vine(sk, V, t, i === VW ? S.vp[0] : 0, 0));
  });
  item(sk.depth(3.6, -2.5, 10.4), 130, () => grazer(sk, S.grazer, t), 3.4, -2.8, 10.2, 3.6);
  WATCHERS.forEach((W, i) => {
    item(
      sk.depth(W.x, W.y, W.z) - 0.05,
      140 + i,
      () => watcher(sk, W, S.watch[i], t),
      W.x,
      W.y + W.r * 1.5,
      W.z,
      W.r * 5 + W.pair * 0.6,
    );
  });
  FLIERS.forEach((F, i) => {
    const p = [0, 0, 0];
    flierFn(F, t, p);
    item(
      sk.depth(p[0], p[1], p[2]),
      150 + i,
      () => flier(sk, F, S.fl[i], t),
      p[0],
      p[1],
      p[2],
      F.s * 2.5,
    );
  });
  {
    const p = [0, 0, 0];
    DRIFT.path(t, p);
    item(
      sk.depth(p[0], p[1], p[2]),
      156,
      () => drifter(sk, DRIFT, S.dr, t),
      p[0],
      p[1] + DRIFT.r,
      p[2],
      DRIFT.r * 5,
    );
  }
  spores(sk, t);
  NEAR.forEach((lf, i) => {
    const th = S.lv[i * 2];
    const v = S.lv[i * 2 + 1];
    turnTo(lf.F, lf.k, th, TF);
    item(
      sk.depth(
        TF.B[0] + TF.a[0] * TF.L * 0.6,
        TF.B[1] + TF.a[1] * TF.L * 0.6,
        TF.B[2] + TF.a[2] * TF.L * 0.6,
      ),
      200 + i,
      () => {
        turnTo(lf.F, lf.k, th, TF);
        if (lf.stem) stem(sk, lf.stem, lf.F.B, lf.bow, lf.sw[0], lf.sw[1]);
        setBend(-(0.16 * clamp(th, 0, 1.4) + 0.04 * clamp(v, -2, 3)));
        leaf(sk, TF, lf.form, {
          light: leafLight,
          hatch: lf.hatch,
          floor: 0.1,
          edge: 1.5 * lf.w,
          w: lf.w,
          sun: SUN,
        });
        setBend(0);
      },
    );
  });
  coverage(sk, S, t < 6.2);
  const items = ITEMS.slice(0, NI).sort((a, b) => b.d - a.d);
  for (const it of items) {
    if ((it.g < 200 || it.g >= 230) && hidden(sk, it)) continue;
    gid(sk, it.g);
    it.f();
  }
}

// ---------------------------------------------------------------- the ground

/**
 * Level strokes on the ground, fixed in the world: rows across the way on a fine grid, each a
 * run of dashes drawn where the sun reaches the ground (the pool at the heart, the dapples),
 * more and heavier where it is brighter. Far off, fewer rows show (a well-spread subset, so
 * rows join one at a time as we come closer and nothing slides).
 */
const ROW = 0.07;
function ground(sk: Sketch, S: State) {
  const amp0 = sk.amp;
  sk.amp = 0.45;
  const base = sk.id;
  const cz = S.cz;
  const ty = Math.tan(S.yaw);
  const k0 = Math.max(0, Math.ceil((cz + 0.5) / ROW));
  const k1 = Math.floor(26 / ROW);
  for (let k = k0; k <= k1; k++) {
    const z = 0.3 + k * ROW;
    const dzc = z - cz;
    // rows on the view about 3.5 px apart at most
    const sp = (sk.px * FOC * 1.56 * ROW) / (dzc * dzc);
    const dens = Math.min(1, sp / 3.6);
    if (vdc(k) >= dens) continue;
    const half = ((sk.A + 0.25) * dzc) / FOC + 0.5;
    const xc = S.cx + ty * dzc;
    // dashes grow with distance from where we start, fixed per row
    const cl = 0.15 + 0.032 * Math.max(0, z - 2.5);
    const i0 = Math.floor((xc - half) / cl);
    const i1 = Math.ceil((xc + half) / cl);
    // each row has its own phase, so dashes never line up in columns
    const ph = hash(k, 77);
    for (let i = i0; i <= i1; i++) {
      const h1 = hash(i * 7 + 3, k * 13 + 1);
      const x0 = (i + ph + 0.45 * hash(i, k + 900)) * cl;
      const len = cl * (0.35 + 0.85 * h1 * h1);
      const xm = x0 + len * 0.5;
      const zz = z + (hash(i, k + 1900) - 0.5) * ROW * 0.8;
      const l = groundLight(xm, zz);
      const thr = 0.1 + 0.85 * hash(i * 3 + 1, k * 7 + 5);
      if (l < thr) continue;
      sk.id = base + k * 241 + (((i % 241) + 241) % 241);
      sk.m3(x0, 0, zz)
        .l3(xm, 0, zz + (hash(i, k + 2900) - 0.5) * ROW * 0.25, 0.8 + 0.6 * l)
        .l3(x0 + len, 0, zz, 0.7);
      sk.s3(0.45 + 0.35 * l, 0.35, 0.3);
    }
  }
  sk.amp = amp0;
}

// ---------------------------------------------------------------- shafts of sun

/**
 * Down each hole's column, a few long fine strokes through the air, broken where the haze
 * thins, stopping above the ground; the great opening over the heart gives a loose sheaf.
 */
function beams(sk: Sketch, t: number) {
  const sw = 0.09 * Math.sin(t * 0.37) + 0.035 * Math.sin(t * 0.91 + 1);
  const swz = 0.06 * Math.sin(t * 0.29 + 2) + 0.02 * Math.sin(t * 1.13);
  SHAFTS.forEach((b) => {
    const [gx, gz, r] = HOLES[b];
    const main = b === 0;
    const n = main ? 15 : Math.max(3, Math.round(r * 5));
    for (let i = 0; i < n; i++) {
      // the great sheaf keeps to the rim of its column, where the light is caught, and clear
      // of the creature on the right
      const a = main
        ? 0.5 + (TAU - 1.2) * ((i + 0.5) / n) + hash(i, b + 3) * 0.2
        : i * 2.39996 + hash(i, b + 3) * 0.5;
      const rr =
        r * (main ? 0.55 + 0.4 * Math.sqrt(hash(i, b + 4)) : 0.75 * Math.sqrt((i + 0.5) / n));
      const px = gx + Math.cos(a) * rr + sw;
      const pz = gz + Math.sin(a) * rr + swz;
      // none in front of the giant cap: a shaft over a solid thing reads as a line through it
      if (main && pz < GZ + 0.4 && Math.abs(px - GX) < GR + 1.2) continue;
      const y0 = -(5.2 + 2.2 * hash(i, b + 40));
      let y1 = -(1.4 + 1.8 * hash(i, b + 41));
      // the great sheaf thins out in the air above the clearing and gives out before it
      // reaches what stands in the light
      if (main) y1 = -(2.8 + 1.6 * hash(i, b + 41));
      // under a cap, the light stops on it
      for (let c = 0; c < CAPS_.length; c++) {
        const C = CAPS_[c];
        const top = -C.h - C.dome * C.R * 0.6;
        if (capShade(px, -0.1, pz) < 0.5 && y1 > top) y1 = Math.min(y1, top);
      }
      if (y1 - y0 < 1.2) continue;
      const ym = (y0 + y1) * 0.5;
      // each line is its own thing in the depth order, so what stands in front of it hides it
      item(sk.depth(px + (DX * ym) / DY, ym, pz + (DZ * ym) / DY), 20 + b, () => {
        const amp0 = sk.amp;
        sk.amp = 0.25;
        const base = sk.id;
        const piece = hash(i, b + 42) < 0.4;
        const ya = piece ? mix(y0, y1, 0.35 + 0.2 * hash(i, b + 43)) : y1;
        const yb = piece ? ya + 0.5 + 0.4 * hash(i, b + 44) : y1;
        const w = 0.32 + 0.2 * hash(i, b + 45);
        for (let p = 0; p < (piece ? 2 : 1); p++) {
          const s0 = p ? yb : y0;
          const s1 = p ? y1 : ya;
          if (s1 - s0 < 0.6) continue;
          sk.id = base + i * 4 + p;
          const yl = (s0 + s1) * 0.5;
          sk.m3(px + (DX * s0) / DY, s0, pz + (DZ * s0) / DY)
            .l3(px + (DX * yl) / DY + 0.01, yl, pz + (DZ * yl) / DY, 1)
            .l3(px + (DX * s1) / DY, s1, pz + (DZ * s1) / DY, 0.7);
          sk.s3(w, 0.5, 0.25, w * 0.6, 0, 0.5);
        }
        sk.amp = amp0;
      });
    }
  });
}

// ---------------------------------------------------------------- spores in the light

const NSP = 90;
function spores(sk: Sketch, t: number) {
  // in depth bands, so they pass behind what is near and in front of what is far
  for (let band = 0; band < 6; band++) {
    const zc = 2.5 + band * 2.2;
    item(sk.depth(0, -2, zc), 230 + band, () => {
      const base = sk.id;
      const amp0 = sk.amp;
      sk.amp = 0.2;
      const Q = [0, 0, 0];
      for (let i = band; i < NSP; i += 6) {
        const zz = zc - 1.1 + 2.2 * hash(i, 3) + 0.3 * noise(t * 0.13 + i, 3);
        const fall = 0.06 + 0.06 * hash(i, 5);
        const span = 4.5;
        let y = -0.4 - ((((hash(i, 2) * span - t * fall) % span) + span) % span);
        y += 0.08 * noise(t * 0.4 + i, 2);
        const x = -3.6 + 7.2 * hash(i, 1) + 0.25 * noise(t * 0.17 + i * 1.3, 1);
        const l = open(x, y, zz);
        if (l < 0.45) continue;
        if (!sk.p3(x, y, zz, Q)) continue;
        if (Math.abs(Q[0]) > sk.A || Math.abs(Q[1]) > 1) continue;
        const r = Math.max(0.6 / sk.px, (0.007 * FOC) / Q[2]) * (0.7 + 0.6 * l);
        sk.id = base + i * 2;
        // some catch the light as a glint, some turn and show as a speck
        if ((Math.floor(t * 4 + i * 1.7) + i) % 5 === 0)
          sk.line(Q[0] - r * 1.6, Q[1] + r * 0.4, Q[0] + r * 1.6, Q[1] - r * 0.4, 0.8, 0.3, 0.1);
        else {
          const hl = 0.45 / sk.px;
          sk.line(
            Q[0] - hl,
            Q[1],
            Q[0] + hl,
            Q[1] + hl * 0.3,
            Math.max(1.5, r * sk.px * 1.8),
            0,
            0.1,
          );
        }
      }
      sk.amp = amp0;
    });
  }
}

// ---------------------------------------------------------------- broad leaves round the clearing

const RFR = newFrame();
const RSA: V3 = [0, 0, 0];
const RSB: V3 = [0, -0.1, 0];
const ROS_STYLE = { light: leafLight, hatch: 2, floor: 0.12, edge: 1.1, sun: SUN };
const LIMB_STYLE = { light: leafLight, hatch: 2, floor: 0.12, edge: 1.1, sun: SUN };
const RF: Form[][] = ROSETTES.map(([, , n, , , seed, f]) =>
  Array.from({ length: n }, (_, j) => form({ ...f, seed: seed * 10 + j, droop: 0.22, keel: 0.18 })),
);

function rosettes(sk: Sketch, t: number) {
  ROSETTES.forEach(([x, z, n, L0, h0, seed], r) => {
    for (let j = 0; j < n; j++) {
      const az = (j / n) * TAU + hash(seed, j) * 0.8;
      const L = L0 * (0.75 + 0.4 * hash(seed, j + 20));
      const h = h0 * (0.6 + 0.7 * hash(seed, j + 30));
      const reach = 0.25 * L + 0.2 * hash(seed, j + 40);
      const ca = Math.cos(az);
      const sa = Math.sin(az);
      const B: V3 = [x + ca * reach, -h, z + sa * reach];
      const droop = 0.35 + 0.3 * hash(seed, j + 50);
      const sway =
        0.04 * Math.sin(t * (0.9 + 0.3 * hash(seed, j + 60)) + j) +
        0.02 * Math.sin(t * 2.1 + j * 1.7);
      item(
        sk.depth(B[0] + ca * L * 0.5, B[1], B[2] + sa * L * 0.5),
        400 + r * 12 + j,
        () => {
          const F = frameTo(B, ca, droop - 0.25 + sway, sa, ca * 0.4, -1, sa * 0.4, L, RFR);
          RSA[0] = x;
          RSA[2] = z;
          RSB[0] = ca * 0.05;
          RSB[2] = sa * 0.05;
          stem(sk, RSA, B, RSB, 1.3, 0.8);
          leaf(sk, F, RF[r][j], ROS_STYLE);
        },
        B[0] + ca * L * 0.5,
        B[1],
        B[2] + sa * L * 0.5,
        L * 0.6,
      );
    }
  });
}

const SF = newFrame();
const SPB: V3 = [0, 0, 0];

// ---------------------------------------------------------------- the limb over the clearing

function limb(sk: Sketch, t: number) {
  const base = sk.id;
  // it moves a little in the wind, more toward its end
  const n = LIMB.length / 4;
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1);
    LV[i * 4] = LIMB[i * 4] + 0.04 * s * s * Math.sin(t * 0.5);
    LV[i * 4 + 1] =
      LIMB[i * 4 + 1] + 0.06 * s * s * Math.sin(t * 0.43 + 1) + 0.02 * s * noise(t * 0.7, 9);
    LV[i * 4 + 2] = LIMB[i * 4 + 2];
    LV[i * 4 + 3] = LIMB[i * 4 + 3];
  }
  sk.id = base;
  tube(sk, LV, n, { edge: 1.2, hatch: 1.3, rings: 4, seed: 71 });
  // leaves hanging from it on short stalks, turning in the air
  for (let j = 0; j < 7; j++) {
    const s = 0.22 + (0.76 * (j + 0.5)) / 7;
    const fi = s * (n - 1);
    const i = Math.min(n - 2, Math.floor(fi));
    const u = fi - i;
    const bx = mix(LV[i * 4], LV[i * 4 + 4], u);
    const by = mix(LV[i * 4 + 1], LV[i * 4 + 5], u) + LV[i * 4 + 3] * 0.8;
    const bz = mix(LV[i * 4 + 2], LV[i * 4 + 6], u);
    const side = j % 2 ? 1 : -1;
    const sw = 0.1 * Math.sin(t * 0.8 + j * 1.9) + 0.05 * noise(t * 0.45 + j, 31);
    SPB[0] = bx;
    SPB[1] = by;
    SPB[2] = bz;
    frameTo(
      SPB,
      side * 0.35 + sw,
      1,
      0.15 * side,
      0.2 * side + sw,
      -0.15,
      -1,
      0.85 + 0.45 * hash(j, 65),
      SF,
    );
    if (
      hiddenS(
        sk,
        SF.B[0] + SF.a[0] * SF.L * 0.5,
        SF.B[1] + SF.a[1] * SF.L * 0.5,
        SF.B[2] + SF.a[2] * SF.L * 0.5,
        SF.L * 0.6,
      )
    )
      continue;
    sk.id = base + 1000 + j * 3001;
    leaf(sk, SF, LIMB_LEAVES[j], LIMB_STYLE);
  }
}
