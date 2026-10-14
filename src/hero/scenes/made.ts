// 3. Made. A world that is built. Evening, a low sun behind us and to the left: we glide along
// a long causeway into a city of engineered forms, and as we come the city finishes itself.
// Out beyond the podium on our left a tower rises section by section out of its own base and
// puts up its mast; on the great wall to our right, modules slide out of their bays one after
// another and lock; and an open truss reaches out from the pylon and the wall over the
// causeway, its two halves meeting in the middle where their ends interlock. We pass under it,
// looking on toward the vanishing point, where one tower stands far taller than the rest.
// No one is with us: we are only an eye.
//
// Ink is light: faces the sun reaches are hatched along their own lines (walls in upright
// strands broken at every storey, with sparse storey lines across the faces square to the sun;
// the modules and the truss along the way they move; the deck in short staggered marks along
// its length that give out a few metres ahead of us), shadow is bare black, and cast shadows
// are found exactly: every block, module, truss member, lamp and post throws its shadow onto
// the deck and the great wall, and the strands stop where they enter it. Parts move on springs
// (a little overshoot, then they settle); nothing appears that was not already there, inside
// something else.

import type { Scene } from "../engine";
import { clamp, hash, mix, noise, type Sketch, smooth } from "../sketch";
import {
  boxC,
  type FaceInk,
  hatchFace,
  KIT,
  lam,
  Receiver,
  rank,
  SUN,
  solid,
  solidDepth,
} from "./made-kit";

const DUR = 13;
const FOC = 1.12;
const SPEED = 3.4; // m/s along the causeway
const EYE_X = -0.35;
const EYE_Y = -1.62;
const HALF = 3; // the deck's half-width

function sunUp() {
  const l = Math.hypot(0.48, 0.28, 0.8);
  SUN.x = -0.48 / l;
  SUN.y = -0.28 / l;
  SUN.z = -0.8 / l;
}
sunUp();

/** How much ink a face takes from the sun, from its normal (none at all when turned away). */
const toneOf = (nx: number, ny: number, nz: number) => {
  const l = lam(nx, ny, nz);
  return l <= 0.02 ? 0 : clamp(0.08 + l * 1.12, 0, 1);
};

/** Below the deck the city goes down into its own shade. */
const fadeDown = (y: number) => 1 - 0.9 * smooth(-1, 13, y);

/**
 * The step response of a spring (from 0 toward 1), tau seconds after it is let go: w its
 * stiffness (rad/s), z its damping ratio (under 1: it overshoots a little and settles).
 */
function S(tau: number, w: number, z: number): number {
  if (tau <= 0) return 0;
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * tau) * (Math.cos(wd * tau) + ((z * w) / wd) * Math.sin(wd * tau));
}

// ---------------------------------------------------------------- the camera

interface Cam {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
}

/** Where we look: the head turns toward what is happening, late and only partway. */
function cam(t: number, o: Cam) {
  o.z = SPEED * t;
  o.x = EYE_X + 0.04 * noise(t * 0.23, 3);
  o.y = EYE_Y + 0.01 * Math.sin(t * 1.7) + 0.005 * Math.sin(t * 2.9 + 1);
  const h = (t0: number) => S(t - t0, 2.1, 0.86);
  o.yaw = 0.03 - 0.22 * h(1.9) + 0.32 * h(5.0) - 0.15 * h(7.6) + 0.012 * noise(t * 0.37, 5);
  o.pitch =
    -0.07 -
    0.07 * h(1.9) +
    0.03 * h(5.0) -
    0.07 * h(7.4) +
    0.09 * h(10.2) +
    0.008 * noise(t * 0.41, 6);
  o.roll = 0.006 * noise(t * 0.3, 7);
}

// ---------------------------------------------------------------- the city

interface Block {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  id: number;
  /** Strand spacing (m), storey height (m), contour weight. */
  gap: number;
  storey: number;
  edge: number;
  /** Tiers: a dark gap every this many metres down its faces (0: none). */
  band: number;
  /** Clad in level bands rather than upright fins (its long faces). */
  level?: boolean;
  /** A part of the one great tower: storey lines only, thinning into the air with height. */
  col?: boolean;
}

const B = (
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  id: number,
  gap: number,
  storey = 3.6,
  edge = 1.3,
): Block => ({
  x0,
  y0,
  z0,
  x1,
  y1,
  z1,
  id,
  gap,
  storey,
  edge,
  band: 0,
});

// the corridor: a low podium on the left (the sun comes over it, we see out across it), the
// pylon that holds the span, and the great wall on the right
const L1 = B(-26, -0.9, 3, -7.5, 5, 31, 11, 0.22, 3.2);
const LP = B(-9.6, -10.5, 43.6, -6.5, 4.5, 48.8, 12, 0.16, 3.4);
const L2 = B(-30, -6.5, 53, -11, 7, 69, 13, 0.24, 3.4);
const R0 = { ...B(7, -10.5, 1, 16, 3.5, 20, 21, 0.34, 3.5), level: true };
const R1 = B(6.5, -46, 26, 20, 3.4, 60, 22, 0.235, 3.6, 1.5);

// the city around: out across the podium on the left, and on round the vanishing point
const FAR: Block[] = [];
{
  let id = 100;
  // the left, beyond the podium: towers whose faces toward us take the sun
  for (let i = 0; i < 6; i++) {
    const z0 = 26 + i * 19 + hash(i, 11) * 9;
    const x1 = -(34 + hash(i, 12) * 22);
    const w = 10 + hash(i, 13) * 12;
    const top = -(14 + hash(i, 14) ** 1.3 * 40);
    if (z0 < 112) continue; // the rising tower stands alone against the sky there
    FAR.push(B(x1 - w, top, z0, x1, 8, z0 + 8 + hash(i, 15) * 8, id++, 0.75, 7.6, 1.1));
  }
  // the right, beyond the great wall
  for (let i = 0; i < 4; i++) {
    const z0 = 66 + i * 16 + hash(i, 21) * 8;
    const x0 = 9 + hash(i, 22) * 14;
    const top = -(16 + hash(i, 24) ** 1.2 * 38);
    FAR.push(
      B(x0, top, z0, x0 + 10 + hash(i, 23) * 10, 8, z0 + 9 + hash(i, 25) * 6, id++, 1.35, 11, 1.1),
    );
  }
  // where the causeway goes: the city's middle, far off, and over it all one tower far
  // bigger than the rest, stepping back twice as it goes up out of sight
  id++;
  FAR.push({
    ...B(-44, -292, 430, 34, 8, 478, 150, 3.8, 3.8, 1.15),
    col: true,
  });
  FAR.push({
    ...B(-33, -505, 437, 22, -290, 471, 151, 3.8, 3.8, 1.05),
    col: true,
  });
  FAR.push({
    ...B(-22, -760, 444, 10, -503, 464, 152, 3.8, 3.8, 0.95),
    col: true,
  });
  FAR.push(B(-26, -44, 262, 4, 8, 290, id++, 1.8, 13, 0.9));
  FAR.push(B(9, -30, 248, 34, 8, 270, id++, 1.8, 13, 0.9));
  FAR.push(B(-48, -24, 236, -22, 8, 256, id++, 1.8, 13, 0.9));
  // round the vanishing point
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1;
    const z0 = 120 + i * 17 + hash(i, 1) * 9;
    const x0 = side * (6 + hash(i, 2) * 18);
    const w = 9 + hash(i, 3) * 15;
    const d = 8 + hash(i, 4) * 10;
    const top = -(12 + hash(i, 5) ** 1.4 * 60);
    FAR.push(
      B(
        side < 0 ? x0 - w : x0,
        top,
        z0,
        side < 0 ? x0 : x0 + w,
        8,
        z0 + d,
        id++,
        0.6 + z0 * 0.0055,
        10,
        1.0,
      ),
    );
  }
}

// the rising tower, out beyond the podium on the left, against the open sky: a base and five
// sections nested inside it
const T_BASE = B(-44, -10, 66, -24, 12, 84, 31, 0.29, 5.2);
const T_SEC = [8, 7.5, 7, 6.5, 6];
const T_AT = [2.45, 3.08, 3.62, 4.22, 4.78];
/** Its mast, last of all. */
const T_MAST = [7.5, 4.9];

/** The modules in the great wall's bays: z0, z1, top, bottom (y down), how far each comes
 *  out, and when. */
const MODS = [
  [33.2, 38.6, -6.3, -3.4, 1.8, 4.55],
  [28.6, 33.6, -9.4, -6.7, 1.9, 4.9],
  [35.5, 41.2, -12.4, -9.6, 2.2, 5.22],
  [44.2, 49.0, -13.0, -10.2, 2.9, 5.62],
  [32.6, 37.8, -18.6, -15.6, 3.3, 5.98],
  [40.8, 47.4, -19.3, -16.6, 2.4, 6.36],
  [50.2, 55.0, -17.2, -14.2, 2.0, 6.8],
];
const MOD_IN = 0.9; // how deep a module sits in its bay before it comes out

// the span between the pylon on the left and the great wall: an open truss in two halves, each
// two planes of chords and diagonals, that come out of the pylon and the wall
const SZ0 = 45.0;
const SZ1 = 47.4;
const STOP = -9.2;
const SBOT = -5.8;
const S_AT = [7.2, 7.75];
/** Half the gap: how far each half reaches. */
const REACH = (R1.x0 - LP.x1) / 2;
/** Chord depth, how deep each plane's members are (z), the step where the halves interlock. */
const CH = 0.4;
const PD = 0.38;
const TOOTH = 0.35;
const PAN = REACH / 3;

/** The right half's drive: stiffness and damping, and when it first reaches the middle. */
const SW = 2.6;
const SZ = 0.84;
const S_MEET = S_AT[1] + (Math.PI - Math.acos(SZ)) / (SW * Math.sqrt(1 - SZ * SZ));

/**
 * How far each half of the span has come (0..1 of its reach). The left half eases out to its
 * mark and waits; the right half comes on, slowing, and docks against it.
 */
function span(t: number): [number, number] {
  const k = Math.max(0, t - S_AT[0]) * 3.4;
  const a = Math.min(1, 1.012 * (1 - Math.exp(-k) * (1 + k)));
  const b = Math.min(1, S(t - S_AT[1], SW, SZ));
  return [a, b];
}

/** When each module first reaches its mark (s after it starts). */
const modW = (i: number) => 4.6 + 0.5 * hash(i, 41);
const MOD_Z = 0.62;
const modArrive = (i: number) => {
  const w = modW(i);
  return (Math.PI - Math.acos(MOD_Z)) / (w * Math.sqrt(1 - MOD_Z * MOD_Z));
};

// ---------------------------------------------------------------- drawing

const C8 = new Float64Array(24);
const CAM: Cam = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
const DECK = new Receiver();
const WALL = new Receiver();

/** How far the storey lines have been drawn in (they join, in rank order, as the drawing
 *  settles out of the incoming current). */
let STOREYS = 1;

/** Storey lines across a face square to the sun: sparse, broken, level (about one a floor). */
function storeys(b: Block, top: number, W: number, tone: number, aer: number): FaceInk | null {
  const ct = clamp((tone - 0.85) / 0.12, 0, 1) * 0.55 * aer * STOREYS;
  if (ct <= 0.02) return null;
  return {
    along: 0,
    gap: b.storey / 2,
    cells: Math.max(1, Math.round(W / 2.6)),
    toneAt: (u) => ct * fadeDown(top + u),
    pen: 0.75,
    stagger: 1,
    wander: 0.06,
    w0: 0.45,
    w1: 0.7,
  };
}

/** Ink for the faces of a block: upright strands broken at every storey, where lit. */
function blockInk(
  b: Block,
  top: number,
  wall: Receiver | null,
  holes: number[] | null,
  aer: number,
) {
  return (fi: number, _nx: number, ny: number, _nz: number, tone: number): FaceInk | null => {
    if (ny > 0.5 || tone <= 0.02) return null;
    if (ny < -0.5) {
      // a top we look down on: strands along the causeway
      return {
        along: 1,
        gap: b.gap * 1.2,
        cells: Math.max(1, Math.round((b.z1 - b.z0) / 4)),
        tone,
        pen: 0.3,
        w0: 0.45,
        w1: 0.8,
      };
    }
    const H = b.y1 - top;
    const W = fi < 2 ? b.z1 - b.z0 : b.x1 - b.x0;
    // which of the face's axes runs level, which upright
    const level = fi < 2 ? 1 : 0;
    const upright = fi < 2 ? 0 : 1;
    if (b.col) {
      // the great tower: level storey lines only, thinning into the evening air as it rises
      return {
        along: level,
        gap: b.storey,
        cells: Math.max(1, Math.round(W / 14)),
        toneAt: (u) => tone * mix(0.8, 0.08, smooth(-20, 640, -(top + u))),
        pen: 0.4,
        stagger: 1,
        wander: 0.05,
        w0: 0.4,
        w1: 0.75,
      };
    }
    if (b.level && fi < 2) {
      // clad in wider panels than the great wall, with a dark joint at every floor
      const joints: number[] = [];
      for (let v = b.storey; v < H; v += b.storey) joints.push(-1, v - 0.6, W + 1, v);
      return {
        along: upright,
        gap: b.gap,
        cells: Math.max(1, Math.round(H / b.storey)),
        toneAt: (_u, v) => tone * aer * fadeDown(top + v),
        holes: joints,
        pen: 0.2,
        wander: 0.1,
        w0: 0.4,
        w1: 1.05,
      };
    }
    // some of the far city is clad in level bands rather than upright fins
    if (b.id >= 100 && b.id % 3 === 1) {
      return {
        along: level,
        gap: b.gap * 1.25,
        cells: Math.max(1, Math.round(W / (b.storey * 0.8))),
        toneAt: (u) => tone * aer * fadeDown(top + u),
        pen: 0.4,
        w0: 0.4,
        w1: 1.05,
      };
    }
    // the tallest have their floors gathered into tiers, with a dark gap between each
    let bands: number[] | null = null;
    if (b.band > 0) {
      bands = [];
      for (let v = b.band; v < H - 4; v += b.band) bands.push(-1, v - 2.2, W + 1, v);
    }
    // a face square to the sun is bright enough without a break at every floor, and carries
    // a sparse second family of storey lines across its fins
    const per = tone > 0.85 ? 2 : 1;
    return {
      along: upright,
      gap: b.gap,
      cells: Math.max(1, Math.round(H / (b.storey * per))),
      toneAt: (_u, v) => tone * aer * fadeDown(top + v),
      rec: fi === 0 ? wall : null,
      holes: fi === 0 && holes ? holes : bands,
      pen: 0.32,
      w0: 0.4,
      w1: 1.15,
      cross: fi >= 4 ? storeys(b, top, W, tone, aer) : null,
    };
  };
}

function drawBlock(
  sk: Sketch,
  b: Block,
  top = b.y0,
  wall: Receiver | null = null,
  holes: number[] | null = null,
  hidden = 1 << 3,
) {
  sk.group(b.id);
  boxC(C8, b.x0, top, b.z0, b.x1, b.y1, b.z1);
  // the far city thins into the evening air
  const d = Math.hypot(
    Math.max(b.x0 - sk.ex, sk.ex - b.x1, 0),
    Math.max(b.z0 - sk.ez, sk.ez - b.z1, 0),
  );
  const aer = clamp(1.15 - d / 240, 0.32, 1);
  solid(sk, {
    C: C8,
    id: b.id,
    edge: b.edge * (0.7 + 0.3 * aer),
    ink: blockInk(b, top, wall, holes, aer),
    tone: toneOf,
    lost: 0.6,
    retrace: true,
    hidden,
  });
}

/** Each section of the rising tower: [x0, top, z0, x1, bottom, z1]. */
function towerSections(t: number, out: number[][]) {
  out.length = 0;
  let top = T_BASE.y0;
  let x0 = T_BASE.x0;
  let x1 = T_BASE.x1;
  let z0 = T_BASE.z0;
  let z1 = T_BASE.z1;
  for (let k = 0; k < T_SEC.length; k++) {
    const inset = 1.0 + 0.3 * hash(k, 31);
    x0 += inset;
    x1 -= inset;
    z0 += inset;
    z1 -= inset;
    const e = S(t - T_AT[k], 5.0 + 0.6 * hash(k, 32), 0.68);
    const h = T_SEC[k];
    const st = top - e * h;
    // each section is a sleeve longer than its rise, so it never leaves the one below
    out.push([x0, st, z0, x1, st + h + 2, z1, e]);
    top = st;
  }
}
const SEC: number[][] = [];

export function made(): Scene {
  const end: Cam = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
  cam(DUR, end);
  return {
    t: 0,
    dur: DUR,
    // the vanishing point ahead, as we see it at the end
    exit: [(-FOC * Math.tan(end.yaw)) / Math.cos(end.pitch), -FOC * Math.tan(end.pitch)],
    still: 10.4,
    excite: 0,
    reset() {
      this.t = 0;
      this.excite = 0;
    },
    step(dt) {
      this.t += dt;
      // the hand quickens a little as each part first reaches home
      let ex = 0;
      for (let i = 0; i < MODS.length; i++) {
        const ta = MODS[i][5] + modArrive(i);
        if (this.t > ta) ex = Math.max(ex, 0.15 * Math.exp(-(this.t - ta) * 4));
      }
      if (this.t > S_MEET) ex = Math.max(ex, 0.18 * Math.exp(-(this.t - S_MEET) * 3));
      this.excite = ex;
    },
    draw(sk) {
      draw(sk, this.t);
    },
  };
}

const HALF_L: Bar[] = [];
const HALF_R: Bar[] = [];

function draw(sk: Sketch, t: number) {
  sunUp();
  // a small canvas takes fewer strands per metre, so the walls do not saturate
  KIT.dens = clamp(sk.px / 340, 0.6, 1);
  STOREYS = smooth(0.9, 2.7, t);
  cam(t, CAM);
  sk.eye(CAM.x, CAM.y, CAM.z, FOC, CAM.yaw, CAM.pitch, CAM.roll);
  sk.depthRef = 12;
  sk.depthW = 0.45;
  const cz = CAM.z;

  towerSections(t, SEC);
  const [eL, eR] = span(t);
  const nL = trussHalf(0, eL, HALF_L, 0);
  trussHalf(1, eR, HALF_R, nL);

  // shadows: onto the great wall's face, and onto the deck
  WALL.set([R1.x0, R1.y0, R1.z0], [0, 0, 1], [0, 1, 0]);
  const PANEL = 6;
  const j0 = Math.floor((cz - 3) / PANEL);
  const dz0 = j0 * PANEL;
  DECK.set([-HALF, 0, dz0], [0, 0, 1], [1, 0, 0]);
  for (const b of [L1, LP, L2, T_BASE]) DECK.castBox(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
  for (const q of SEC) DECK.castBox(q[0], q[1], q[2], q[3], q[4], q[5]);
  for (const b of [L1, LP, L2]) WALL.castBox(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
  const modBox: number[][] = [];
  for (let i = 0; i < MODS.length; i++) {
    const m = MODS[i];
    const e = S(t - m[5], modW(i), MOD_Z);
    const xo = R1.x0 + MOD_IN - e * (m[4] + MOD_IN);
    modBox.push([xo, m[2], m[0], R1.x0, m[3], m[1], e]);
    if (xo < R1.x0 - 0.01) WALL.castBox(xo, m[2], m[0], R1.x0, m[3], m[1]);
  }
  for (const b of HALF_L) {
    DECK.cast(b.C);
    WALL.cast(b.C);
  }
  for (const b of HALF_R) WALL.cast(b.C);
  // the railing's posts on the left throw their shadows across the deck
  const POST = 2.5;
  const k0 = Math.ceil((cz + 0.3) / POST);
  const k1 = Math.floor((cz + 72) / POST);
  for (let k = k0; k <= k1; k++)
    DECK.castBox(-HALF + 0.02, -1.08, k * POST, -HALF + 0.1, 0, k * POST + 0.08);
  DECK.castBox(-HALF, -1.12, cz - 2, -HALF + 0.12, -1.04, cz + 90);
  // the lamps along the left edge throw long shadows right across the deck
  const m0 = Math.floor((cz - 12) / MAST);
  const m1 = Math.floor((cz + 110) / MAST);
  for (let k = m0; k <= m1; k++)
    DECK.castBox(MX - MW, MTOP, k * MAST + MOFF, MX + MW, 0, k * MAST + MOFF + 2 * MW);

  // far to near: a few long thin clouds low in the evening sky, the far city, the rising
  // tower, the blocks of the corridor
  strata(sk);
  const far = FAR.slice().sort((a, b) => depthOf(sk, b) - depthOf(sk, a));
  const wq = wallQuad(sk);
  for (const b of far) if (b.z0 > cz + 4 && !(wq && behindWall(sk, b))) drawBlock(sk, b);
  // the rising tower: its mast, then its highest section first, each lower one hiding what
  // is inside it
  {
    const top = SEC[SEC.length - 1];
    const e = S(t - T_MAST[1], 4.2, 0.55);
    if (e * T_MAST[0] > 0.05) {
      const mx = (top[0] + top[3]) / 2;
      const mz = (top[2] + top[5]) / 2;
      const mt = top[1] - e * T_MAST[0];
      const mast: Block = {
        ...T_BASE,
        x0: mx - 0.35,
        x1: mx + 0.35,
        z0: mz - 0.35,
        z1: mz + 0.35,
        y1: top[1] + 1,
        id: 38,
        gap: 0.12,
        storey: 2.5,
        edge: 1.0,
      };
      drawBlock(sk, mast, mt);
    }
  }
  for (let k = SEC.length - 1; k >= 0; k--) {
    const s = SEC[k];
    if (s[6] * T_SEC[k] < 0.02) continue;
    const sec: Block = {
      ...T_BASE,
      x0: s[0],
      z0: s[2],
      x1: s[3],
      y1: s[4],
      z1: s[5],
      id: 32 + k,
      gap: 0.33,
    };
    drawBlock(sk, sec, s[1], null, null, 1 << 3);
  }
  drawBlock(sk, T_BASE);

  const near = [L2, LP, L1, R0, R1].sort((a, b) => depthOf(sk, b) - depthOf(sk, a));
  for (const b of near) {
    if (b === R1) drawBlock(sk, b, b.y0, WALL, bays());
    else if (b === R0) {
      // a dark reveal where the near slab stands against the great wall
      sk.group(29);
      sk.m3(R0.x0, R0.y0 - 0.45, R0.z0)
        .l3(R0.x0, R0.y0 - 0.45, R0.z1 + 0.45)
        .l3(R0.x0, R0.y1, R0.z1 + 0.45)
        .l3(R0.x0, R0.y1, R0.z0)
        .fill3();
      drawBlock(sk, b);
    } else drawBlock(sk, b);
  }

  // the corridor: modules, the truss's two halves and the lamps, far to near
  const parts: { d: number; f: () => void }[] = [];
  for (let i = 0; i < modBox.length; i++) {
    const m = modBox[i];
    parts.push({
      d: Math.hypot(
        (m[0] + m[3]) / 2 - sk.ex,
        (m[1] + m[4]) / 2 - sk.ey,
        (m[2] + m[5]) / 2 - sk.ez,
      ),
      f: () => module(sk, i, m),
    });
  }
  if (HALF_L.length)
    parts.push({
      d: Math.hypot(LP.x1 + (eL * REACH) / 2 - sk.ex, (STOP + SBOT) / 2 - sk.ey, SZ0 - sk.ez),
      f: () => {
        for (const b of HALF_L) drawBar(sk, b);
      },
    });
  if (HALF_R.length)
    parts.push({
      d: Math.hypot(R1.x0 - (eR * REACH) / 2 - sk.ex, (STOP + SBOT) / 2 - sk.ey, SZ0 - sk.ez),
      f: () => {
        for (const b of HALF_R) drawBar(sk, b);
      },
    });
  for (let k = m0; k <= m1; k++) {
    const z = k * MAST + MOFF;
    if (z - cz < 0.6) continue;
    parts.push({
      d: Math.hypot(MX - sk.ex, MTOP / 2 - sk.ey, z - sk.ez),
      f: () => lamp(sk, k, cz),
    });
  }
  parts.sort((a, b) => b.d - a.d);
  for (const p of parts) p.f();

  // the deck we travel on, its railings
  deck(sk, cz, dz0);
  railing(sk, cz, k0, k1, POST);
}

// ---------------------------------------------------------------- the sky

/** Long thin clouds low over the left, lit only along their undersides: x from, x to,
 *  height and distance ahead (m from the eye; they are so far off that they stay put). Each
 *  is a long lit underside with shorter lines above it, as the light gives out upward. */
const CLOUDS = [
  [-2700, -1100, 820, 3200],
  [-2000, -900, 1250, 3000],
  [-3500, -2000, 560, 3700],
  [-1500, -650, 1650, 3300],
];

function strata(sk: Sketch) {
  sk.group(90);
  sk.amp = 0.5;
  for (let i = 0; i < CLOUDS.length; i++) {
    const [x0, x1, h, d] = CLOUDS[i];
    const half = (x1 - x0) / 2;
    for (let k = 0; k < 4; k++) {
      const key = i * 8 + k;
      const len = (1 - 0.24 * k) * (0.85 + 0.25 * hash(key, 91));
      const mid = (x0 + x1) / 2 + (hash(key, 92) - 0.5) * half * 0.4;
      const xa = mid - half * len;
      const xb = mid + half * len;
      const y = -(h + k * 30 + 8 * hash(key, 93));
      sk.id = 9000 + key;
      for (let q = 0; q <= 8; q++) {
        const x = mix(xa, xb, q / 8);
        const yy = y + 7 * noise(x * 0.004 + i * 5, 94 + k);
        if (q === 0) sk.m3(sk.ex + x, sk.ey + yy, sk.ez + d);
        else sk.l3(sk.ex + x, sk.ey + yy, sk.ez + d);
      }
      sk.s3(k === 0 ? 0.62 : 0.5 - 0.05 * k, 0.45, 0.5);
    }
  }
  sk.amp = 1;
}

// ---------------------------------------------------------------- what the great wall hides

const OQ = new Float64Array(8);
const PQ = [0, 0, 0];

/** The great wall's face toward the corridor, on the view (false if it is not all in front). */
function wallQuad(sk: Sketch): boolean {
  const pts = [
    [R1.x0, R1.y0, R1.z0],
    [R1.x0, R1.y0, R1.z1],
    [R1.x0, R1.y1, R1.z1],
    [R1.x0, R1.y1, R1.z0],
  ];
  for (let i = 0; i < 4; i++) {
    if (!sk.p3(pts[i][0], pts[i][1], pts[i][2], PQ)) return false;
    OQ[i * 2] = PQ[0];
    OQ[i * 2 + 1] = PQ[1];
  }
  return true;
}

function inQuad(x: number, y: number): boolean {
  let sgn = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const c =
      (OQ[j * 2] - OQ[i * 2]) * (y - OQ[i * 2 + 1]) -
      (OQ[j * 2 + 1] - OQ[i * 2 + 1]) * (x - OQ[i * 2]);
    const s = c > 0 ? 1 : -1;
    if (sgn === 0) sgn = s;
    else if (s !== sgn) return false;
  }
  return true;
}

/** Whether a block beyond the great wall is wholly hidden by it. */
function behindWall(sk: Sketch, b: Block): boolean {
  if (b.x0 < R1.x0) return false;
  for (let i = 0; i < 8; i++) {
    const x = i & 1 ? b.x1 : b.x0;
    const y = i & 2 ? b.y1 : b.y0;
    const z = i & 4 ? b.z1 : b.z0;
    if (!sk.p3(x, y, z, PQ) || !inQuad(PQ[0], PQ[1])) return false;
  }
  return true;
}

function depthOf(sk: Sketch, b: Block) {
  boxC(C8, b.x0, b.y0, b.z0, b.x1, Math.min(b.y1, 0), b.z1);
  return solidDepth(sk, C8);
}

/** The great wall's bays, in its face's own coordinates (u along z, v down from its top):
 *  one for each module, and the slot the truss comes out of. */
function bays(): number[] {
  const H: number[] = [];
  for (const m of MODS) H.push(m[0] - R1.z0, m[2] - R1.y0, m[1] - R1.z0, m[3] - R1.y0);
  H.push(SZ0 - R1.z0, STOP - R1.y0, SZ1 - R1.z0, SBOT - R1.y0);
  return H;
}

/**
 * A module in its bay. While it sits back in the wall we see its end through the opening,
 * lit, with the shadows of the bay's near side and head across it; as it comes out those
 * shadows close up to nothing, and what has come out is drawn whole.
 */
function module(sk: Sketch, i: number, m: number[]) {
  const [xo, top, z0, xw, bot, z1] = m;
  const id = 60 + i;
  sk.group(id);
  const H = bot - top;
  const W = z1 - z0;
  const back = xo - xw; // how deep it still sits (> 0), or how far it has come out (< 0)
  const inBay = back > 0.001;
  const out = smooth(0, 0.25, -back);
  const full = MODS[i][4] + MOD_IN;
  if (!inBay) {
    // what has come out of the wall, cleared: its end, its front, its underside
    sk.m3(xo, top, z0).l3(xo, bot, z0).l3(xo, bot, z1).l3(xo, top, z1).fill3();
    sk.m3(xo, top, z0).l3(xw, top, z0).l3(xw, bot, z0).l3(xo, bot, z0).fill3();
    if (sk.ey > bot) sk.m3(xo, bot, z0).l3(xw, bot, z0).l3(xw, bot, z1).l3(xo, bot, z1).fill3();
  }
  // its end faces into the corridor and takes the sun obliquely: strands down it, fixed to
  // the module. In the bay, the near side and the head of the opening shade it (the light
  // comes in toward +x, +y, +z), and the near side and the sill hide some of it.
  let uMin = -1e9;
  let vMax = 1e9;
  let holes: number[] | null = null;
  if (inBay) {
    const dx = R1.x0 - sk.ex;
    uMin = (back * (z0 - sk.ez)) / dx;
    vMax = H - (back * (sk.ey - bot)) / dx;
    holes = [-1, -1, (back * SUN.z) / SUN.x, H + 1, -1, -1, W + 1, (back * SUN.y) / SUN.x];
  }
  hatchFace(sk, [xo, top, z0], [0, 0, 1], W, [0, 1, 0], H, {
    id: id * 8 + 1,
    n: Math.round(W / 0.16),
    cells: 2,
    tone: toneOf(-1, 0, 0),
    stagger: 0.6,
    pen: 0.3,
    wander: 0.1,
    w0: 0.45,
    w1: 0.9,
    uMin,
    vMax,
    holes,
  });
  if (inBay && back > 0.04) {
    // the far side of the opening, square to the sun, in a narrow strip
    hatchFace(sk, [xw, top, z1 - 0.002], [1, 0, 0], MOD_IN, [0, 1, 0], H, {
      id: id * 8 + 5,
      n: 6,
      cells: 1,
      tone: 0.85,
      uMax: back,
      vLo: (k) => (((k + 0.5) / 6) * MOD_IN * SUN.y) / SUN.x,
      pen: 0.3,
      w0: 0.4,
      w1: 0.7,
    });
  }
  const len = xw - xo;
  if (!inBay) {
    // its front faces the sun: strands along it, the way it slides, fixed to the module from
    // its end and cut where it still runs into the wall
    hatchFace(sk, [xo, top, z0], [0, 1, 0], H, [1, 0, 0], full, {
      id: id * 8 + 2,
      n: Math.max(2, Math.round(H / 0.15)),
      cells: 2,
      tone: toneOf(0, 0, -1),
      vMax: len - 0.02,
      stagger: 0.8,
      pen: 0.35,
      wander: 0.1,
      w0: 0.5,
      w1: 1.0,
    });
    // its underside is in its own shade, but takes a little light thrown up from the deck
    if (sk.ey > bot)
      hatchFace(sk, [xo, bot, z0], [0, 0, 1], W, [1, 0, 0], full, {
        id: id * 8 + 3,
        n: Math.round(W / 0.22),
        cells: 3,
        tone: 0.22,
        vMax: len - 0.02,
        stagger: 0.8,
        pen: 0.6,
        wander: 0.1,
        w0: 0.4,
        w1: 0.55,
        amp: 0.4,
      });
  }
  // its edges (in the bay: the opening's), heavy along the dark underside
  const xe = inBay ? xw : xo;
  sk.amp = 1;
  sk.id = id * 64;
  sk.m3(xw, top, z0)
    .l3(xe, top, z0)
    .l3(xe, bot, z0)
    .l3(xw, bot, z0)
    .s3(mix(1.1, 1.3, out), 0.06, 0.7, mix(1.1, 1.3, out), 1.2);
  sk.id = id * 64 + 1;
  sk.m3(xe, top, z0).l3(xe, top, z1).s3(1.0, 0.1, 0.7, 1.0, 1.2);
  sk.id = id * 64 + 2;
  sk.m3(xe, bot, z0)
    .l3(xe, bot, z1)
    .s3(mix(0.75, 1.7, out), 0.06, 0.8, mix(0.75, 1.5, out), 1.2);
  if (!inBay) {
    // the far edge of the underside: lighter, and the pen lifts partway
    const g = 0.35 + 0.3 * hash(id, 3);
    sk.id = id * 64 + 3;
    sk.m3(xo, bot, z1)
      .l3(mix(xo, xw, g), bot, z1)
      .s3(0.9, 0.15, 0.7);
    sk.id = id * 64 + 4;
    sk.m3(mix(xo, xw, g + 0.12), bot, z1)
      .l3(xw, bot, z1)
      .s3(0.8, 0.2, 0.7);
  } else {
    // the inner corners of the opening, where the end meets its head and its far side
    const f = smooth(0, 0.25, back);
    sk.id = id * 64 + 6;
    sk.m3(xo, top, z0 + Math.max(0, uMin))
      .l3(xo, top, z1)
      .s3(0.7 * f, 0.2, 0.5);
    sk.id = id * 64 + 7;
    sk.m3(xo, top, z1)
      .l3(xo, top + Math.min(H, vMax), z1)
      .s3(0.6 * f, 0.2, 0.5);
  }
}

// ---------------------------------------------------------------- the truss

/** A bar of the truss: its corners (solid's order: 1 along it, 2 across, 4 in depth), full
 *  length, how much of it has come out, its direction from its tip end, its half thickness,
 *  its depth, and what it is (0 top chord, 1 bottom chord, 2 diagonal, 3 floor beam, 4 end
 *  post). */
interface Bar {
  C: Float64Array;
  id: number;
  len: number;
  vis: number;
  tx: number;
  ty: number;
  hw: number;
  za: number;
  zb: number;
  kind: number;
  back: boolean;
}
const POOL: Bar[] = [];
function barAt(k: number): Bar {
  if (!POOL[k])
    POOL[k] = {
      C: new Float64Array(24),
      id: 0,
      len: 0,
      vis: 0,
      tx: 0,
      ty: 0,
      hw: 0,
      za: 0,
      zb: 0,
      kind: 0,
      back: false,
    };
  return POOL[k];
}

/**
 * Corners of a bar from A (its tip end) toward B, hw thick to each side in the x-y plane and
 * za..zb deep, cut where it goes into the root (open side: dir * (x - root) > 0). Returns how
 * much of its length has come out (0: none).
 */
function barCorners(
  C: Float64Array,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  hw: number,
  za: number,
  zb: number,
  root: number,
  dir: number,
): number {
  const L = Math.hypot(bx - ax, by - ay);
  const tx = (bx - ax) / L;
  const ty = (by - ay) / L;
  const nx = -ty;
  const ny = tx;
  let vis = 0;
  let out = -1e9;
  for (let i = 0; i < 8; i++) {
    const sb = i & 2 ? 1 : -1;
    const x0 = ax + nx * hw * sb;
    const y0 = ay + ny * hw * sb;
    // where this long edge meets the root's face (a bar square to the face is cut across
    // its thickness instead)
    const open = dir * (x0 - root);
    const into = -dir * tx;
    let s = L;
    if (into > 1e-6) s = open <= 0 ? 0 : Math.min(L, open / into);
    const si = i & 1 ? s : 0;
    let x = x0 + tx * si;
    if (dir * (x - root) < 0) x = root;
    C[i * 3] = x;
    C[i * 3 + 1] = y0 + ty * si;
    C[i * 3 + 2] = i & 4 ? zb : za;
    if (i & 1 && s > vis) vis = s;
    out = Math.max(out, dir * (x - root));
  }
  return out < 0.02 ? 0 : vis;
}

/** One half of the truss as it stands at extension e, as bars in drawing order (far plane
 *  first; in each plane the diagonals before the chords that cover their ends). Returns the
 *  next free bar in the pool. */
function trussHalf(side: number, e: number, out: Bar[], pool0: number): number {
  out.length = 0;
  if (e < 0.001) return pool0;
  const dir = side === 0 ? 1 : -1;
  const root = side === 0 ? LP.x1 : R1.x0;
  const tip = root + dir * e * REACH;
  const xs = (s: number) => tip - dir * s;
  const yT = STOP + CH / 2;
  const yB = SBOT - CH / 2;
  // where the halves interlock: the left's top chord runs on past its tip, the right's
  // bottom chord does
  const tT = side === 0 ? -TOOTH : TOOTH;
  const tB = -tT;
  // each half ends in a post between its chords; the first diagonal springs from its head
  const n0 = TOOTH;
  let k = pool0;
  const add = (
    kind: number,
    id: number,
    sA: number,
    yA: number,
    sB: number,
    yB2: number,
    hw: number,
    za: number,
    zb: number,
    back: boolean,
  ) => {
    const b = barAt(k);
    const ax = xs(sA);
    const bx = xs(sB);
    b.vis = barCorners(b.C, ax, yA, bx, yB2, hw, za, zb, root, dir);
    if (b.vis < 0.03) return;
    k++;
    b.id = id;
    b.len = Math.hypot(bx - ax, yB2 - yA);
    b.tx = (bx - ax) / b.len;
    b.ty = (yB2 - yA) / b.len;
    b.hw = hw;
    b.za = za;
    b.zb = zb;
    b.kind = kind;
    b.back = back;
    out.push(b);
  };
  for (const back of [true, false]) {
    const za = back ? SZ1 - PD : SZ0;
    const zb = back ? SZ1 : SZ0 + PD;
    const base = 300 + side * 100 + (back ? 50 : 0);
    for (let j = 0; j < 3; j++) {
      const s0 = j === 0 ? n0 : j * PAN;
      const s1 = (j + 1) * PAN;
      add(2, base + 2 + j, s0, j % 2 ? yB : yT, s1, j % 2 ? yT : yB, 0.11, za, zb, back);
    }
    add(4, base + 6, n0, yT, n0, yB, 0.1, za, zb, back);
    add(0, base, tT, yT, REACH + 0.8, yT, CH / 2, za, zb, back);
    add(1, base + 1, tB, yB, REACH + 0.8, yB, CH / 2, za, zb, back);
    if (back) {
      // floor beams across between the two planes' bottom chords
      const yb = SBOT - 0.17;
      for (let j = 0; j < 4; j++) {
        const sb = j === 0 ? tB + 0.2 : j === 3 ? REACH - 0.3 : j * PAN;
        add(3, base + 10 + j, sb - 0.12, yb, sb + 0.12, yb, 0.17, SZ0 + PD, SZ1 - PD, true);
      }
    }
  }
  return k;
}

function drawBar(sk: Sketch, b: Bar) {
  sk.group(b.id);
  solid(sk, {
    C: b.C,
    id: b.id,
    edge: (b.kind === 2 || b.kind === 4 ? 0.85 : b.kind === 3 ? 0.7 : 1.05) * (b.back ? 0.8 : 1),
    ink: undefined,
    tone: toneOf,
    lost: 0.7,
    retrace: b.kind < 2,
  });
  const C = b.C;
  // its face toward us takes the sun: strands along the bar, fixed to it from its tip end
  // (the far plane's diagonals and posts, half hidden behind the near plane's, go without)
  if (b.kind !== 3 && !(b.back && b.kind >= 2) && sk.ez < b.za) {
    hatchFace(sk, [C[0], C[1], C[2]], [-b.ty, b.tx, 0], 2 * b.hw, [b.tx, b.ty, 0], b.len, {
      id: b.id * 8 + 1,
      n: b.kind >= 2 ? 2 : 3,
      cells: Math.max(1, Math.round(b.len / 1.3)),
      tone: b.back ? 0.45 : 0.95,
      vMax: b.vis,
      stagger: 0.9,
      pen: 0.45,
      wander: 0.08,
      w0: 0.45,
      w1: 0.9,
    });
  }
  // a bottom chord's underside is in its own shade, but takes a little light thrown up from
  // the deck: short marks along it
  if (b.kind === 1 && !b.back && sk.ey > SBOT) {
    hatchFace(sk, [C[0], SBOT, b.za], [0, 0, 1], b.zb - b.za, [b.tx, 0, 0], b.len, {
      id: b.id * 8 + 3,
      n: 3,
      cells: Math.max(1, Math.round(b.len / 0.9)),
      tone: 0.22,
      vMax: b.vis,
      stagger: 0.8,
      pen: 0.65,
      w0: 0.4,
      w1: 0.55,
      amp: 0.4,
    });
  }
}

// ---------------------------------------------------------------- the deck

const DIV = new Float64Array(256);

/**
 * The deck: level lines across it where the sun falls, broken into staggered lengths, kept
 * about the same distance apart on the view however far off they are (each line has a rank,
 * and joins, thickening from a hairline, as it comes near enough for its rank); the slabs
 * take the sun a little differently, and the lines give out raggedly a few metres ahead of us.
 * Shadows cut the lines (DECK's frame: u along the causeway from dz0, v across from the left
 * edge).
 */
function deck(sk: Sketch, cz: number, dz0: number) {
  const PANEL = 6;
  const DZ = 0.3;
  const CELL = 1.5;
  const zf = cz + 110;
  sk.group(200);
  sk.m3(-HALF - 0.3, 0.02, cz + 0.2)
    .l3(HALF + 0.3, 0.02, cz + 0.2)
    .l3(HALF + 0.3, 0.02, zf)
    .l3(-HALF - 0.3, 0.02, zf)
    .fill3();
  // the share of lines that keeps them about S px apart on the view at distance D
  const K = (FOC * -EYE_Y * sk.px * DZ) / 3.1;
  const edge = (u: number) => 2.8 + 0.5 * (1 + noise(u * 0.6 + 2, 17));
  const prevAmp = sk.amp;
  sk.amp = 0.45;
  const kA = Math.ceil((cz + 2.2) / DZ);
  const kB = Math.floor(zf / DZ);
  for (let k = kA; k <= kB; k++) {
    const z = k * DZ + (hash(k, 211) - 0.5) * DZ * 0.4;
    const D = z - cz;
    const f = Math.min(1, K / (D * D)) * (1 - 0.5 * smooth(30, 110, D)) * KIT.dens;
    const g = rank(k, 212);
    if (f < g - 0.06) continue;
    const panel = Math.floor(z / PANEL);
    const ns = DECK.along(z - dz0, DIV);
    const ph = hash(k, 213);
    for (let j = -1; j < 4; j++) {
      const key = k * 8 + j + 1;
      const c0 = (j + ph) * CELL;
      const a = Math.max(0, c0 + CELL * 0.2 * hash(key, 214));
      const b = Math.min(2 * HALF, c0 + CELL - CELL * 0.32 * hash(key, 215));
      if (b - a < 0.12) continue;
      const um = (a + b) / 2;
      const tone = 0.7 + 0.24 * hash(panel * 3 + Math.floor(um / 2), 5);
      const near = smooth(0, 2.6, D - edge(um) - 1.2 * hash(key, 216));
      const x = f * tone * near - g - (hash(key, 217) - 0.5) * 0.08;
      if (x <= 0) continue;
      const w =
        mix(0.45, 0.85, tone) *
        smooth(0, 0.12, x) *
        mix(0.4, 1, near) *
        (0.85 + 0.3 * hash(key, 218));
      if (w < 0.08) continue;
      // cut out the shadows, their edges wavering by hand (keyed by where the shadow is)
      let np = 1;
      PA[0] = a;
      PB[0] = b;
      for (let q = 0; q < ns && np > 0; q++) {
        const s0r = DIV[q * 2];
        const s1r = DIV[q * 2 + 1];
        if (s0r - 0.06 >= b || s1r + 0.06 <= a) continue;
        const rag = Math.min(0.12, (s1r - s0r) * 0.35);
        const sk0 = key + ((s0r * 5) | 0);
        const s0 = s0r + (hash(sk0, 219) - 0.5) * rag;
        const s1 = s1r + (hash(sk0, 220) - 0.5) * rag;
        let m = 0;
        for (let p = 0; p < np; p++) {
          const pa = PA[p];
          const pb = PB[p];
          if (s1 <= pa || s0 >= pb) {
            PA[m] = pa;
            PB[m++] = pb;
            continue;
          }
          if (s0 > pa && m < 15) {
            PA[m] = pa;
            PB[m++] = s0;
          }
          if (s1 < pb && m < 15) {
            PA[m] = s1;
            PB[m++] = pb;
          }
        }
        np = m;
      }
      for (let p = 0; p < np; p++) {
        if (PB[p] - PA[p] < 0.08) continue;
        sk.id = 2010000 + key * 8 + p;
        sk.m3(-HALF + PA[p], 0, z)
          .l3(-HALF + PB[p], 0, z)
          .s3(w, 0.3, 0.35);
      }
    }
  }
  sk.amp = prevAmp;
  // the deck's edges, far on to the vanishing point
  sk.group(210);
  for (const side of [-1, 1]) {
    for (let k = Math.floor(cz / 12); k < Math.floor(cz / 12) + 30; k++) {
      const za = k * 12 + (hash(k, side + 7) - 0.5) * 1.2;
      const zb =
        (k + 1) * 12 + (hash(k + 1, side + 7) - 0.5) * 1.2 + (hash(k, side + 9) < 0.5 ? 0.8 : -0.6);
      if (zb < cz + 0.5) continue;
      sk.id = 2100 + k * 4 + (side + 1);
      sk.m3(side * HALF, 0, Math.max(za, cz + 0.3))
        .l3(side * HALF, 0, zb)
        .s3(1.1, 0.08, 0.6, 1.1, 0);
    }
  }
}
const PA = new Float64Array(16);
const PB = new Float64Array(16);

// ---------------------------------------------------------------- lamps and railings

/** The lamps: slender square shafts every MAST metres along the left edge, MTOP high, each
 *  with an arm out over the deck's edge and the lamp at its end (not lit yet: the sun is
 *  still up). */
const MAST = 20;
const MOFF = 11;
const MX = -HALF - 0.45;
const MW = 0.08;
const MTOP = -5.3;
const ARM = 1.2;

function lamp(sk: Sketch, k: number, cz: number) {
  const z = k * MAST + MOFF;
  const d = z - cz;
  sk.group(4000 + k);
  const xo = MX - MW;
  const xi = MX + MW;
  const z1 = z + 2 * MW;
  const zc = z + MW;
  sk.m3(xo, MTOP, z).l3(xi, MTOP, z).l3(xi, 0, z).l3(xo, 0, z).fill3();
  sk.m3(xi, MTOP, z).l3(xi, MTOP, z1).l3(xi, 0, z1).l3(xi, 0, z).fill3();
  const base = 40000 + k * 32;
  sk.amp = 0.9;
  // its outline, heavier down its shaded inner side
  sk.id = base;
  sk.m3(xo, 0, z).l3(xo, MTOP, z).l3(xi, MTOP, z).l3(xi, MTOP, z1).s3(0.7, 0.05, 0.6, 0.7, 1);
  sk.id = base + 1;
  sk.m3(xi, MTOP, z1).l3(xi, 0, z1).s3(1.0, 0.05, 0.7);
  sk.id = base + 2;
  sk.m3(xi, MTOP + 0.05, z)
    .l3(xi, 0, z)
    .s3(0.5, 0.15, 0.5);
  // the sun down its face toward us
  if (d < 40) {
    sk.amp = 0.5;
    sk.id = base + 3;
    sk.m3(MX, MTOP + 0.3 + 0.3 * hash(k, 1), z - 0.003)
      .l3(MX, -0.4 * hash(k, 2), z - 0.003)
      .s3(0.5, 0.25, 0.3);
  }
  // the arm, rising a little as it reaches out, and the lamp under its end: a flat lit top
  // edge, a dark underside
  const xa = MX + ARM;
  const ya = MTOP - 0.12;
  sk.m3(xi, MTOP + 0.06, zc - 0.03)
    .l3(xa, ya + 0.04, zc - 0.03)
    .l3(xa, ya - 0.02, zc - 0.03)
    .l3(xi, MTOP - 0.01, zc - 0.03)
    .fill3();
  sk.amp = 0.7;
  sk.id = base + 5;
  sk.m3(xi, MTOP - 0.01, zc - 0.03)
    .l3(xa, ya - 0.02, zc - 0.03)
    .s3(0.55, 0.2, 0.4);
  sk.id = base + 6;
  sk.m3(xi, MTOP + 0.06, zc - 0.03)
    .l3(xa, ya + 0.04, zc - 0.03)
    .s3(0.85, 0.15, 0.4);
  const h0 = xa - 0.48;
  const h1 = xa + 0.03;
  const ht = ya + 0.03;
  const hb = ya + 0.13;
  sk.m3(h0, ht, zc - 0.09)
    .l3(h1, ht, zc - 0.09)
    .l3(h1, hb, zc - 0.09)
    .l3(h0, hb, zc - 0.09)
    .fill3();
  sk.m3(h0, hb, zc - 0.09)
    .l3(h1, hb, zc - 0.09)
    .l3(h1, hb, zc + 0.09)
    .l3(h0, hb, zc + 0.09)
    .fill3();
  sk.id = base + 7;
  sk.m3(h0 + 0.02, ht, zc - 0.09)
    .l3(h1, ht, zc - 0.09)
    .s3(0.55, 0.2, 0.4);
  sk.id = base + 8;
  sk.m3(h0, ht + 0.02, zc - 0.09)
    .l3(h0, hb, zc - 0.09)
    .l3(h1, hb, zc - 0.09)
    .l3(h1, hb, zc + 0.09)
    .s3(1.0, 0.1, 0.5, 0.9, 0.8);
  sk.id = base + 9;
  sk.m3(h0 + 0.04, ht + 0.045, zc - 0.091)
    .l3(h1 - 0.06, ht + 0.045, zc - 0.091)
    .s3(0.45, 0.3, 0.3);
  sk.amp = 1;
}

/** A railing post: a square bar, its face toward us in the sun, its inner side lit on the
 *  right (in shade on the left); drawn more simply the farther off it is. Every mark has its
 *  own id, so nothing re-rolls when the near detail comes and goes. */
function post(sk: Sketch, side: number, k: number, z: number, d: number) {
  const W = 0.08;
  const xo = side < 0 ? -HALF + 0.02 : HALF - 0.02; // outer face
  const xi = xo - side * W; // inner face, toward the deck
  const top = -1.08;
  const z1 = z + W;
  const base = 30000 + k * 16 + (side > 0 ? 8 : 0);
  sk.amp = 0.8;
  if (d < 26) {
    sk.m3(xo, top, z).l3(xi, top, z).l3(xi, 0, z).l3(xo, 0, z).fill3();
    sk.m3(xi, top, z).l3(xi, top, z1).l3(xi, 0, z1).l3(xi, 0, z).fill3();
  }
  // its outline: the outer edge, the far inner edge, the corner between the two faces
  sk.id = base;
  sk.m3(xo, 0, z).l3(xo, top, z).l3(xi, top, z).l3(xi, top, z1).s3(0.95, 0.06, 0.6, 0.95, 0.8);
  sk.id = base + 1;
  sk.m3(xi, top, z1)
    .l3(xi, 0, z1)
    .s3(side < 0 ? 1.3 : 0.9, 0.08, 0.6);
  if (d < 26) {
    sk.id = base + 2;
    sk.m3(xi, top + 0.02, z)
      .l3(xi, -0.02, z)
      .s3(0.7, 0.2, 0.5);
    // light on the face toward us, and on the right-hand posts' inner sides
    sk.amp = 0.5;
    for (let i = 0; i < 2; i++) {
      const f = 0.3 + 0.4 * i + (hash(i, k * 7) - 0.5) * 0.1;
      const a = top + 0.05 + 0.1 * hash(i, k * 3);
      sk.id = base + 3 + i * 2;
      sk.m3(mix(xo, xi, f), a, z - 0.002)
        .l3(mix(xo, xi, f), -0.04 - 0.1 * hash(i, k * 5), z - 0.002)
        .s3(0.55, 0.3, 0.3);
      sk.id = base + 4 + i * 2;
      if (side > 0)
        sk.m3(xi + 0.002, a, mix(z, z1, f))
          .l3(xi + 0.002, -0.05, mix(z, z1, f))
          .s3(0.5, 0.3, 0.3);
    }
  }
  sk.amp = 1;
}

/** The railings: posts along both edges, a rail along their tops. */
function railing(sk: Sketch, cz: number, k0: number, k1: number, POST: number) {
  for (let k = k1; k >= k0; k--) {
    for (const side of [-1, 1]) {
      const z = k * POST;
      sk.group(3000 + k * 2 + (side > 0 ? 1 : 0));
      post(sk, side, k, z, z - cz);
    }
  }
  // the top rails, in lengths
  sk.group(3900);
  for (const side of [-1, 1]) {
    const x = side < 0 ? -HALF + 0.06 : HALF - 0.06;
    for (let k = Math.floor(cz / 9); k < Math.floor(cz / 9) + 12; k++) {
      const za = k * 9 + (hash(k, side + 3) - 0.5) * 0.8;
      const zb = (k + 1) * 9 + (hash(k + 1, side + 3) - 0.5) * 0.8 + 0.5;
      if (zb < cz + 0.3) continue;
      sk.id = 39000 + k * 4 + (side + 1);
      sk.m3(x, -1.1, Math.max(za, cz + 0.2))
        .l3(x, -1.1, zb)
        .s3(1.3, 0.06, 0.6, 1.3, 0);
      sk.id = 39000 + k * 4 + (side + 1) + 2;
      if (side > 0)
        sk.m3(x - 0.06, -1.06, Math.max(za, cz + 0.2))
          .l3(x - 0.06, -1.06, zb)
          .s3(0.6, 0.2, 0.4, 0.6, 0);
    }
  }
}
