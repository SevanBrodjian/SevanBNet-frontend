// A small ecosystem in the margins of the writing pages, never under the text.
//
// Two cell grids (3 px cells, 2 px on phones), one per margin, each kept in an offscreen
// canvas that is only painted where something changed. Every frame the part of the page
// being read is copied to the visible canvas and the moving things are drawn over it.
// - Plants root on the outer wall and climb toward the text, branching and setting leaves.
//   New growth is pale and darkens as it matures; gusts of wind flip leaves to their pale
//   undersides as they pass.
// - Tips end in buds; buds open when the season allows; bees carry pollen between open
//   flowers of one species; pollinated flowers drop their petals and set fruit, which
//   ripens, falls and becomes a seed that germinates where it lands.
// - Plants age and die: leaves dry, stems dry, then crumble into litter that rots away.
// - Seasons follow the date (see ../settings): growth, bloom, leaf colour, leaf fall, snow.
// - Three biomes: Meadow (flowering vines, bees, butterflies, beetles), Understory (ferns,
//   moss, fungi on dead wood, springtails), Mycelium (hyphae, mushrooms, spores).
// - Night (the essays): the grids are lit only by the moon, a little lamp at the pointer,
//   and what glows: fireflies that fall into step with each other and glow-worms in the
//   meadow; foxfire on dead wood and glow-worm threads under the fronds in the understory;
//   pulses that run along the hyphae and glowing caps in the mycelium. Moths come to the
//   lamp.
// Bounded: cell, plant, creature and particle caps; it only lives near the part of the
// page being read; one step costs well under a millisecond. Still (reduced motion,
// Save-Data): grown in idle slices, then drawn once.

import { living, STILL } from "../../frame/live";
import { clamp } from "../../frame/util";
import {
  BIOME_DEFS,
  type BiomeDef,
  C,
  LIGHT,
  type RGB,
  type SeasonKey,
  SP,
  type Species,
  TAB,
} from "./species";

export type EcoOptions = {
  /** The room: the margins are positioned inside it. */
  host: HTMLElement;
  /** The text column; the margins are what is left on either side. */
  column: () => Element | null;
  night: boolean;
  biome: string;
  /** Where in the year (0 start of spring .. 4). */
  phase: () => number;
  /** Fixed season, or the year turning by itself. */
  cycle: () => boolean;
  /** Growth speed (1 = natural). */
  tempo: () => number;
};

export type Eco = {
  setBiome: (b: string) => void;
  setNight: (n: boolean) => void;
  seasonChanged: () => void;
  dispose: () => void;
  stats: () => {
    plants: number;
    flowers: number;
    creatures: number;
    cost: number;
    steps: number;
    /** Fireflies lit now, and all of them. */
    fireflies: [number, number];
  };
};

// cell types
const STEM = 1;
const LEAF = 2;
const PET = 3;
const CEN = 4;
const FRU = 5;
const DRY = 6;
const LIT = 7;
const MOSS = 8;
const SEED = 9;
const SNOW = 10;
const CAP = 11;
const HYP = 12;

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const rgb = (c: RGB) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const rgba = (c: RGB, a: number) =>
  `rgba(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0},${a.toFixed(3)})`;
/** A stable hash of a cell index, in [0, 1). */
const hh = (i: number) => {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

type Tip = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  age: number;
  life: number;
  since: number;
  side: number;
  g: number;
};
type Plant = {
  id: number;
  sp: string;
  s: Side;
  cells: number[];
  tips: Tip[];
  age: number;
  life: number;
  dying: boolean;
  di: number;
  cr: number;
  base: number;
  order: number[];
  fung: boolean;
};
type Flower = {
  i: number;
  x: number;
  y: number;
  pid: number;
  sp: string;
  st: "bud" | "open" | "fruit" | "ripe";
  t: number;
  pet: number[];
  pol: boolean;
};
type SeedT = { i: number; x: number; y: number; sp: string; t: number };
type PartKind = "spore" | "fruit" | "snow" | "leaf" | "petal" | "litter";
type Part = {
  x: number;
  y: number;
  /** Spores from a glowing cap glow too. */
  glow?: boolean;
  vx: number;
  vy: number;
  kind: PartKind;
  c: RGB;
  sp?: string;
  t: number;
  ph: number;
};
type CritKind = "bee" | "butterfly" | "beetle" | "spring" | "firefly" | "moth";
type Crit = {
  k: CritKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  tgt: Flower | null;
  vis: number;
  pol: { sp: string; i: number } | null;
  n: number;
  d: number;
  /** Fireflies: phase of the flash cycle, its rate, and how long the light stays on. */
  th: number;
  w: number;
  on: number;
  /** Butterflies: which kind. */
  kind: number;
};
/** Only some caps glow at night, as only some fungi do. */
type Shroom = { x: number; y: number; cells: number[]; t: number; life: number; glow: boolean };
/** Something that glows where it sits: a glow-worm on a stem, foxfire on dead wood. */
type Glow = { i: number; k: "worm" | "fox"; ph: number };
/** A glow-worm's thread hanging under a frond, beaded with light. */
type Thread = { anchor: number; x: number; y: number; len: number; ph: number };
/** A pulse running out along the hyphae from where it started. */
type Pulse = { front: number[]; hist: number[][]; seen: Set<number>; t: number };
type Light = { x: number; y: number; r: number; c: RGB; k: number };

type Side = {
  name: "l" | "r";
  box: HTMLDivElement;
  view: HTMLCanvasElement;
  vx: CanvasRenderingContext2D;
  base: HTMLCanvasElement;
  bx: CanvasRenderingContext2D;
  lc: HTMLCanvasElement | null;
  lx: CanvasRenderingContext2D | null;
  cols: number;
  rows: number;
  T: Uint8Array;
  P: Uint16Array;
  A: Uint8Array;
  cells: number;
  dirIn: 1 | -1;
  x0: number;
  ok: boolean;
  flowers: Flower[];
  seeds: SeedT[];
  leaves: number[];
  snow: number[];
  litter: number[];
  dead: number[];
  moss: number[];
  parts: Part[];
  crit: Crit[];
  shrooms: Shroom[];
  fresh: number[];
  glows: Glow[];
  threads: Thread[];
  pulses: Pulse[];
  lights: Light[];
};

const ctx2d = (c: HTMLCanvasElement) => {
  const x = c.getContext("2d");
  if (!x) throw new Error("no 2d canvas");
  return x;
};

export function createEco(o: EcoOptions): Eco {
  const host = o.host;
  const NARROW = matchMedia("(max-width: 760px)").matches;
  const CS = NARROW ? 2 : 3;
  const GUT = NARROW ? 3 : 34;
  let night = o.night;
  let bio: BiomeDef = BIOME_DEFS[o.biome] ?? BIOME_DEFS.meadow;
  let seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0 || 1;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T>(a: T[]): T | undefined => a[Math.floor(rnd() * a.length)];

  let phase = o.phase();
  const phaseNow = () => (o.cycle() ? phase : o.phase());
  const seas = (k: SeasonKey) => {
    const s8 = (((phaseNow() * 2) % 8) + 8) % 8;
    const i = Math.floor(s8);
    const t = s8 - i;
    const T = TAB[k];
    return T[i] + (T[(i + 1) % 8] - T[i]) * t;
  };

  // ---------- sides ----------
  let sides: Side[] = [];
  const plants = new Map<number, Plant>();
  let nextId = 1;
  let frame = 0;
  let ptr: { s: Side; x: number; y: number } | null = null;
  let lastInput = performance.now();
  let disposed = false;
  /** While the garden is grown before it is shown, nothing is new. */
  let pregrowing = false;
  const FRESH = () => (pregrowing ? 0 : 255);
  const freshen = (s: Side, i: number) => {
    if (!pregrowing) s.fresh.push(i);
  };

  function makeSide(name: "l" | "r"): Side {
    const box = document.createElement("div");
    box.className = `growth ${name}`;
    box.setAttribute("aria-hidden", "true");
    const view = document.createElement("canvas");
    view.className = "eco-cv";
    box.append(view);
    host.prepend(box);
    const base = document.createElement("canvas");
    return {
      name,
      box,
      view,
      vx: ctx2d(view),
      base,
      bx: ctx2d(base),
      lc: null,
      lx: null,
      cols: 0,
      rows: 0,
      T: new Uint8Array(1),
      P: new Uint16Array(1),
      A: new Uint8Array(1),
      cells: 0,
      dirIn: name === "l" ? 1 : -1,
      x0: 0,
      ok: false,
      flowers: [],
      seeds: [],
      leaves: [],
      snow: [],
      litter: [],
      dead: [],
      moss: [],
      parts: [],
      crit: [],
      shrooms: [],
      fresh: [],
      glows: [],
      threads: [],
      pulses: [],
      lights: [],
    };
  }

  function clearSide(s: Side) {
    s.flowers = [];
    s.seeds = [];
    s.leaves = [];
    s.snow = [];
    s.litter = [];
    s.dead = [];
    s.moss = [];
    s.parts = [];
    s.crit = [];
    s.shrooms = [];
    s.fresh = [];
    s.glows = [];
    s.threads = [];
    s.pulses = [];
    s.lights = [];
  }

  /** Fit the grids to the margins. True when they changed (and were emptied). */
  function layout(force: boolean) {
    const c = o.column();
    if (!c) return false;
    const hr = host.getBoundingClientRect();
    const cr = c.getBoundingClientRect();
    const hgt = Math.max(0, Math.round(hr.height));
    const L = { x0: 4, w: Math.floor(cr.left - hr.left - GUT - 4) };
    const rx = Math.ceil(cr.right - hr.left + GUT);
    const R = { x0: rx, w: Math.floor(hr.width - 4 - rx) };
    if (!sides.length) sides = [makeSide("l"), makeSide("r")];
    let changed = false;
    let grown = false;
    [L, R].forEach((g, k) => {
      const s = sides[k];
      const cols = Math.max(0, Math.floor(g.w / CS));
      const rows = Math.max(0, Math.floor(hgt / CS));
      s.box.style.cssText = `left:${g.x0}px;width:${cols * CS}px;height:${rows * CS}px;display:${cols >= 3 ? "block" : "none"}`;
      s.x0 = g.x0;
      if (!force && s.cols === cols && s.rows === rows) return;
      const n = Math.max(1, cols * rows);
      if (!force && s.cols === cols && s.T.length > 1) {
        // Only the height changed (an image loaded, a line wrapped): keep the garden.
        const keep = Math.min(s.T.length, n);
        const T = new Uint8Array(n);
        const P = new Uint16Array(n);
        const A = new Uint8Array(n);
        T.set(s.T.subarray(0, keep));
        P.set(s.P.subarray(0, keep));
        A.set(s.A.subarray(0, keep));
        s.T = T;
        s.P = P;
        s.A = A;
        const old = document.createElement("canvas");
        old.width = s.base.width;
        old.height = s.base.height;
        ctx2d(old).drawImage(s.base, 0, 0);
        s.rows = rows;
        s.ok = cols >= 3 && rows > 10;
        for (const cv of [s.view, s.base]) cv.height = Math.max(1, rows);
        s.bx.drawImage(old, 0, 0);
        let cells = 0;
        for (let i = 0; i < n; i++) if (T[i]) cells++;
        s.cells = cells;
        grown = true;
        return;
      }
      changed = true;
      s.cols = cols;
      s.rows = rows;
      s.ok = cols >= 3 && rows > 10;
      s.T = new Uint8Array(n);
      s.P = new Uint16Array(n);
      s.A = new Uint8Array(n);
      s.cells = 0;
      clearSide(s);
      for (const cv of [s.view, s.base]) {
        cv.width = Math.max(1, cols);
        cv.height = Math.max(1, rows);
      }
      s.vx.clearRect(0, 0, s.view.width, s.view.height);
      s.bx.clearRect(0, 0, s.base.width, s.base.height);
    });
    if (changed) plants.clear();
    else if (grown && ready) queueRedraw();
    return changed;
  }

  /** The rows near what is on screen: everything outside rests. */
  function band(): [number, number] {
    const hr = host.getBoundingClientRect();
    const top = Math.max(0, -hr.top);
    const bot = Math.min(hr.height, innerHeight - hr.top);
    return [Math.floor((top - 140) / CS), Math.ceil((bot + 140) / CS)];
  }
  const inB = (y: number, b: [number, number]) => y >= b[0] && y <= b[1];
  const cap = (s: Side) => s.cols * s.rows * (NARROW ? 0.24 : 0.24);
  const at = (s: Side, x: number, y: number) =>
    x < 0 || y < 0 || x >= s.cols || y >= s.rows ? -1 : y * s.cols + x;

  // ---------- colour of a cell ----------
  function leafCol(sp: Species, i: number): RGB {
    const v = clamp(seas("leaf") + (hh(i) - 0.5) * 0.35, 0, 2);
    const L = sp.leafC;
    const c = v < 1 ? mix(L[0], L[1], v) : mix(L[1], hh(i * 7) < 0.45 ? sp.leaf2C : L[2], v - 1);
    return shade(c, 0.88 + hh(i * 3) * 0.24);
  }
  function colorOf(s: Side, i: number): RGB | null {
    const t = s.T[i];
    if (!t) return null;
    const pl = s.P[i] ? plants.get(s.P[i]) : undefined;
    const sp = pl ? SP[pl.sp] : undefined;
    const h = hh(i);
    const a = s.A[i] / 255;
    switch (t) {
      case STEM:
        return sp ? mix(shade(sp.stemC, 0.85 + h * 0.3), C.fresh, a * 0.55) : C.dry[0];
      case HYP:
        return mix(shade(SP.hypha.stemC, 0.42 + h * 0.36), C.wing, a * 0.3);
      case LEAF:
        return sp ? mix(leafCol(sp, i), C.fresh, a * 0.5) : C.dry[0];
      case PET:
        return sp?.petC ? shade(sp.petC, 0.9 + h * 0.15) : C.dry[0];
      case CEN:
        return sp?.cenC && a > 0 ? sp.cenC : C.bud;
      case FRU:
        return sp?.fruC ? mix(sp.fruC[0], sp.fruC[1], a) : C.seed;
      case DRY:
        return mix(C.dry[0], C.dry[1], a);
      case LIT:
        return mix(C.lit[0], C.lit[1], h);
      case MOSS:
        return shade(C.moss[(h * 3) | 0], 0.9 + h * 0.2);
      case SEED:
        return C.seed;
      case SNOW:
        return shade(C.snow, 0.85 + h * 0.15);
      case CAP:
        return a > 0.9 ? C.stalk : C.cap[((a * 40) | 0) % 4];
    }
    return null;
  }
  function paint(s: Side, i: number) {
    const c = colorOf(s, i);
    const x = i % s.cols;
    const y = (i / s.cols) | 0;
    if (!c) s.bx.clearRect(x, y, 1, 1);
    else {
      s.bx.fillStyle = rgb(c);
      s.bx.fillRect(x, y, 1, 1);
    }
  }
  function put(s: Side, i: number, t: number, pid = 0, a = 0) {
    if (!s.T[i]) s.cells++;
    s.T[i] = t;
    s.P[i] = pid;
    s.A[i] = a;
    paint(s, i);
  }
  function clear(s: Side, i: number) {
    if (s.T[i]) s.cells--;
    s.T[i] = 0;
    s.P[i] = 0;
    s.A[i] = 0;
    paint(s, i);
  }
  const hasN = (s: Side, q: number) => {
    const x = q % s.cols;
    const y = (q / s.cols) | 0;
    for (const [dx, dy] of [
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
    ]) {
      const r = at(s, x + dx, y + dy);
      if (r >= 0 && s.T[r]) return true;
    }
    return false;
  };

  // ---------- plants ----------
  function newPlant(s: Side, x: number, y: number, kind?: string) {
    const i = at(s, x, y);
    if (i < 0 || s.T[i] || plants.size > 260) return null;
    const spk = kind ?? pick(bio.sp) ?? "vetch";
    const sp = SP[spk];
    nextId = (nextId % 65000) + 1;
    const id = nextId;
    const pl: Plant = {
      id,
      sp: spk,
      s,
      cells: [i],
      tips: [],
      age: 0,
      life: (1500 + rnd() * 2400) * (spk === "hypha" ? 1.4 : 1),
      dying: false,
      di: 0,
      cr: 0,
      base: y,
      order: [],
      fung: false,
    };
    const a = (rnd() - 0.5) * 0.9;
    pl.tips.push({
      x,
      y,
      dx: Math.cos(a) * s.dirIn * 0.6,
      dy: -0.8 + Math.sin(a) * 0.3,
      age: 0,
      life: sp.life[0] + rnd() * (sp.life[1] - sp.life[0]),
      since: 0,
      side: 1,
      g: 0,
    });
    put(s, i, sp.thin ? HYP : STEM, id, FRESH());
    freshen(s, i);
    plants.set(id, pl);
    return pl;
  }

  /** Leaf shapes, in cells, along the normal (n) and the growth direction (d). */
  const LEAVES: Record<string, [number, number][]> = {
    blade: [
      [1, 0],
      [2, 0],
      [2, 1],
      [3, 1],
      [3, 0],
    ],
    clover: [
      [1, 0],
      [2, 0],
      [2, 1],
      [2, -1],
      [3, 0],
    ],
    pinnate: [
      [1, 0],
      [2, 1],
    ],
  };
  function placeLeaf(s: Side, pl: Plant, t: Tip, side: number) {
    const sp = SP[pl.sp];
    const nx = -t.dy * side;
    const ny = t.dx * side;
    const shape: [number, number][] = sp.frond
      ? Array.from({ length: sp.lf }, (_, k) => [k + 1, (k + 1) * 0.45] as [number, number])
      : (LEAVES[sp.leafStyle ?? "blade"] ?? LEAVES.blade);
    let first = true;
    for (const [a, b] of shape) {
      const x = Math.round(t.x + nx * a + t.dx * b);
      const y = Math.round(t.y + ny * a + t.dy * b - (sp.frond ? 0 : a * 0.18));
      const i = at(s, x, y);
      if (i < 0 || s.T[i]) {
        if (first) return;
        continue;
      }
      first = false;
      put(s, i, LEAF, pl.id, FRESH());
      pl.cells.push(i);
      s.leaves.push(i);
      freshen(s, i);
    }
    if (sp.leafStyle === "pinnate" && side > 0) placeLeaf(s, pl, t, -1);
  }
  function growTip(s: Side, pl: Plant, t: Tip) {
    const sp = SP[pl.sp];
    const dirIn = s.dirIn;
    const near = t.age > t.life * 0.75 && !!sp.curlEnd;
    const ang = (rnd() - 0.5) * 2 * sp.wander;
    let dx = t.dx * Math.cos(ang) - t.dy * Math.sin(ang);
    let dy = t.dx * Math.sin(ang) + t.dy * Math.cos(ang);
    const cu = (sp.curl + (near ? (sp.curlEnd ?? 0) : 0)) * dirIn;
    if (cu) {
      const ndx = dx * Math.cos(cu) - dy * Math.sin(cu);
      dy = dx * Math.sin(cu) + dy * Math.cos(cu);
      dx = ndx;
    }
    if (!near) {
      dx += sp.trop[0] * dirIn * 0.5;
      dy += sp.trop[1] * 0.5;
    }
    if (s.cols < 14) {
      dx *= 0.25;
      dy += sp.thin ? 0.3 : -0.5;
    }
    // Growth leans toward the pointer (the light), a little.
    if (ptr && ptr.s === s && !sp.thin) {
      const px = ptr.x - t.x;
      const py = ptr.y - t.y;
      const d = Math.hypot(px, py);
      if (d < 26 && d > 0) {
        dx += (px / d) * 0.45;
        dy += (py / d) * 0.45;
      }
    }
    const l = Math.hypot(dx, dy) || 1;
    t.dx = dx / l;
    t.dy = dy / l;
    const nx = Math.round(t.x + t.dx);
    const ny = Math.round(t.y + t.dy);
    if (nx === Math.round(t.x) && ny === Math.round(t.y)) {
      t.x += t.dx;
      t.y += t.dy;
      return true;
    }
    const i = at(s, nx, ny);
    if (i < 0 || s.T[i]) return false;
    if (sp.avoid !== false) {
      let crowd = 0;
      for (let j = -1; j <= 1; j++)
        for (let k = -1; k <= 1; k++) {
          if (!j && !k) continue;
          const q = at(s, nx + k, ny + j);
          if (
            q >= 0 &&
            s.T[q] &&
            s.P[q] !== pl.id &&
            !(nx + k === Math.round(t.x) && ny + j === Math.round(t.y))
          )
            crowd++;
        }
      if (crowd > 1) return false;
    }
    put(s, i, sp.thin ? HYP : STEM, pl.id, FRESH());
    freshen(s, i);
    pl.cells.push(i);
    t.x = nx;
    t.y = ny;
    t.age++;
    t.since++;
    if (sp.node && t.since >= sp.node) {
      t.since = 0;
      t.side = -t.side;
      placeLeaf(s, pl, t, t.side);
      if (sp.frond) placeLeaf(s, pl, t, -t.side);
      // a flower bud in the other axil, now and then
      if (sp.flower && t.age > 8 && rnd() < 0.2) {
        const bx = Math.round(t.x + t.dy * t.side * 2);
        const by = Math.round(t.y - t.dx * t.side * 2 - 1);
        const bi = at(s, bx, by);
        if (bi >= 0 && !s.T[bi] && hasN(s, bi)) bud(s, pl, bx, by);
      }
    }
    if (rnd() < sp.branch && pl.tips.length < 6 && s.cells < cap(s)) {
      const sg = rnd() < 0.5 ? 1 : -1;
      const a = (sp.thin ? 0.9 : 0.7) * (0.6 + rnd() * 0.6) * sg;
      pl.tips.push({
        x: t.x,
        y: t.y,
        dx: t.dx * Math.cos(a) - t.dy * Math.sin(a),
        dy: t.dx * Math.sin(a) + t.dy * Math.cos(a),
        age: 0,
        life: t.life * (0.45 + rnd() * 0.3),
        since: 0,
        side: -t.side,
        g: t.g + 1,
      });
    }
    return t.age < t.life;
  }
  function tipEnds(s: Side, pl: Plant, t: Tip) {
    const sp = SP[pl.sp];
    if (sp.flower && t.age > 6) bud(s, pl, Math.round(t.x), Math.round(t.y));
    else if (sp.thin && rnd() < 0.3) shroom(s, Math.round(t.x), Math.round(t.y), pl.id);
  }
  function grow(s: Side, b: [number, number], pre: boolean) {
    const g = pre ? Math.max(0.75, seas("grow")) : seas("grow") * (night ? 0.55 : 1);
    for (const pl of plants.values()) {
      if (pl.s !== s || pl.dying || !pl.tips.length) continue;
      const next: Tip[] = [];
      for (const t of pl.tips) {
        if (!inB(t.y, b) || rnd() > g * 0.9 || s.cells >= cap(s)) {
          next.push(t);
          continue;
        }
        if (growTip(s, pl, t)) next.push(t);
        else tipEnds(s, pl, t);
      }
      pl.tips = next;
    }
  }
  /** New growth is pale; it darkens over a few seconds. */
  function mature(s: Side) {
    if (frame % 5) return;
    const out: number[] = [];
    for (const i of s.fresh) {
      const t = s.T[i];
      if (t !== STEM && t !== LEAF && t !== HYP) continue;
      const a = s.A[i];
      if (a <= 36) {
        s.A[i] = 0;
        paint(s, i);
        continue;
      }
      s.A[i] = a - 36;
      paint(s, i);
      out.push(i);
    }
    s.fresh = out.length > 3000 ? out.slice(-3000) : out;
  }

  // ---------- flowers, fruit, seed ----------
  function bud(s: Side, pl: Plant, x: number, y: number) {
    const i = at(s, x, y);
    if (i < 0) return;
    if (!s.T[i]) s.cells++;
    s.T[i] = CEN;
    s.A[i] = 0;
    s.P[i] = pl.id;
    paint(s, i);
    s.flowers.push({ i, x, y, pid: pl.id, sp: pl.sp, st: "bud", t: 0, pet: [], pol: false });
  }
  function dropPetals(s: Side, f: Flower, fall: boolean) {
    for (const q of f.pet)
      if (s.T[q] === PET) {
        const c = colorOf(s, q);
        clear(s, q);
        if (fall && c && rnd() < 0.7) spawn(s, q % s.cols, (q / s.cols) | 0, "petal", c);
      }
    f.pet = [];
  }
  function flowers(s: Side, b: [number, number], pre: boolean) {
    const bl = pre ? Math.max(0.5, seas("bloom")) : seas("bloom");
    const out: Flower[] = [];
    for (const f of s.flowers) {
      const pl = plants.get(f.pid);
      const want = f.st === "fruit" || f.st === "ripe" ? FRU : CEN;
      if (!pl || pl.dying || s.T[f.i] !== want) {
        dropPetals(s, f, false);
        continue;
      }
      if (!inB(f.y, b)) {
        out.push(f);
        continue;
      }
      f.t++;
      if (f.st === "bud") {
        if (!night && rnd() < bl * (pre ? 0.03 : 0.014)) {
          f.st = "open";
          f.t = 0;
          s.A[f.i] = 255;
          paint(s, f.i);
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const q = at(s, f.x + dx, f.y + dy);
            if (q >= 0 && !s.T[q]) {
              put(s, q, PET, f.pid);
              f.pet.push(q);
            }
          }
        }
      } else if (f.st === "open") {
        if (pre && rnd() < 0.0022) f.pol = true;
        if (f.pol) {
          dropPetals(s, f, true);
          f.st = "fruit";
          f.t = 0;
          s.T[f.i] = FRU;
          s.A[f.i] = 0;
          paint(s, f.i);
        } else if (f.t > 640) {
          for (const q of f.pet)
            if (s.T[q] === PET) {
              s.T[q] = DRY;
              s.A[q] = 90;
              paint(s, q);
            }
          f.pet = [];
          s.T[f.i] = DRY;
          s.A[f.i] = 140;
          paint(s, f.i);
          continue;
        }
      } else if (f.st === "fruit") {
        s.A[f.i] = Math.min(255, s.A[f.i] + 2);
        paint(s, f.i);
        if (s.A[f.i] >= 255) {
          f.st = "ripe";
          f.t = 0;
        }
      } else if (f.t > 90 + hh(f.i) * 200 && rnd() < 0.05) {
        const fru = SP[f.sp].fruC;
        clear(s, f.i);
        spawn(s, f.x, f.y, "fruit", fru ? fru[1] : C.seed, f.sp);
        continue;
      }
      out.push(f);
    }
    s.flowers = out;
  }
  function seeds(s: Side, b: [number, number]) {
    const g = seas("grow");
    const out: SeedT[] = [];
    for (const sd of s.seeds) {
      if (s.T[sd.i] !== SEED) continue;
      if (!inB(sd.y, b)) {
        out.push(sd);
        continue;
      }
      sd.t--;
      if (sd.t > 0 || g < 0.3 || rnd() > g * 0.3) {
        out.push(sd);
        continue;
      }
      clear(s, sd.i);
      newPlant(s, sd.x, sd.y, sd.sp);
    }
    s.seeds = out;
  }

  // ---------- fungi and moss ----------
  function shroom(s: Side, x: number, y: number, pid: number) {
    const h = 2 + ((rnd() * 3) | 0);
    const w = 1 + ((rnd() * 2) | 0);
    const col = Math.floor(rnd() * 4) / 40 + 0.001;
    const cells: number[] = [];
    for (let k = 1; k <= h; k++) {
      const i = at(s, x, y - k);
      if (i < 0 || s.T[i]) return;
      cells.push(i);
    }
    const top = y - h - 1;
    const capC: number[] = [];
    for (let k = -w; k <= w; k++) {
      const i = at(s, x + k, top);
      if (i < 0 || s.T[i]) return;
      capC.push(i);
    }
    for (const i of cells) put(s, i, CAP, pid, 250);
    for (const i of capC) put(s, i, CAP, pid, Math.round(col * 255));
    s.shrooms.push({
      x,
      y: top,
      cells: cells.concat(capC),
      t: 0,
      life: 500 + rnd() * 900,
      glow: hh(x * 7919 + top * 31) < 0.4,
    });
  }
  function fungi(s: Side, b: [number, number]) {
    const out: Shroom[] = [];
    for (const m of s.shrooms) {
      if (!inB(m.y, b)) {
        out.push(m);
        continue;
      }
      m.t++;
      if (bio.shrooms && m.t > 60 && rnd() < 0.03 && s.parts.length < 90) {
        spawn(s, m.x + (rnd() < 0.5 ? -1 : 1), m.y - 1, "spore", C.spore);
        const p = s.parts[s.parts.length - 1];
        if (p && p.kind === "spore") p.glow = m.glow;
      }
      if (m.t > m.life) {
        for (const i of m.cells)
          if (s.T[i] === CAP) {
            s.T[i] = DRY;
            s.A[i] = 60 + rnd() * 120;
            paint(s, i);
            s.dead.push(i);
          }
        continue;
      }
      out.push(m);
    }
    s.shrooms = out;
  }
  function mossGrow(s: Side, b: [number, number]) {
    if (!bio.moss) return;
    if (s.moss.length < 3 || (rnd() < 0.02 && s.moss.length < 260)) {
      const y = clamp(Math.floor(b[0] + rnd() * (b[1] - b[0])), 2, s.rows - 2);
      const i = at(s, s.dirIn > 0 ? 0 : s.cols - 1, y);
      if (i >= 0 && !s.T[i]) {
        put(s, i, MOSS);
        s.moss.push(i);
      }
    }
    for (let k = 0; k < 3; k++) {
      if (!s.moss.length || s.cells >= cap(s) || s.moss.length > 600) break;
      const i = s.moss[Math.floor(rnd() * s.moss.length)];
      if (s.T[i] !== MOSS) continue;
      const x = i % s.cols;
      const y = (i / s.cols) | 0;
      if (!inB(y, b)) continue;
      const q = at(s, x + Math.round((rnd() - 0.5) * 2.2), y + Math.round((rnd() - 0.5) * 2.6));
      if (q < 0 || s.T[q]) continue;
      const qx = q % s.cols;
      const qy = (q / s.cols) | 0;
      const wall = s.dirIn > 0 ? qx : s.cols - 1 - qx;
      let nb = 0;
      let wood = false;
      for (let j = -1; j <= 1; j++)
        for (let k2 = -1; k2 <= 1; k2++) {
          if (!j && !k2) continue;
          const r = at(s, qx + k2, qy + j);
          if (r >= 0 && s.T[r]) {
            nb++;
            if (s.T[r] !== MOSS) wood = true;
          }
        }
      if (nb > 3 || (wall > 3 + hh(q) * 4 && !wood)) continue;
      put(s, q, MOSS);
      s.moss.push(q);
    }
  }

  // ---------- ageing, death, decay ----------
  function ageing(s: Side, b: [number, number]) {
    const winter = seas("grow") < 0.12;
    for (const pl of plants.values()) {
      if (pl.s !== s || pl.base < b[0] - 220 || pl.base > b[1] + 220) continue;
      pl.age += winter ? 2.5 : 1;
      if (!pl.dying && pl.age > pl.life) {
        pl.dying = true;
        pl.tips = [];
        pl.order = pl.cells.slice().sort(() => rnd() - 0.5);
      }
      if (!pl.dying) continue;
      // first everything dries, then it crumbles
      for (let k = 0; k < 3 && pl.di < pl.order.length; k++, pl.di++) {
        const i = pl.order[pl.di];
        if (s.P[i] === pl.id && s.T[i] && s.T[i] !== DRY) {
          s.T[i] = DRY;
          s.A[i] = Math.floor(rnd() * 255);
          paint(s, i);
        }
      }
      if (pl.di < pl.order.length) continue;
      if (bio.deadFungi && !pl.fung && rnd() < bio.deadFungi) {
        pl.fung = true;
        const i = pick(pl.order) ?? -1;
        if (i >= 0 && s.P[i] === pl.id) shroom(s, i % s.cols, (i / s.cols) | 0, 0);
      }
      for (let k = 0; k < 2 && pl.cr < pl.order.length; k++, pl.cr++) {
        const i = pl.order[pl.cr];
        if (s.P[i] !== pl.id || !s.T[i]) continue;
        const c = colorOf(s, i);
        clear(s, i);
        if (c && rnd() < 0.3) spawn(s, i % s.cols, (i / s.cols) | 0, "litter", c);
      }
      if (pl.cr >= pl.order.length) plants.delete(pl.id);
    }
    // litter and dry fungus rot away
    for (const L of [s.litter, s.dead])
      for (let k = 0; k < 2 && L.length; k++) {
        const j = Math.floor(rnd() * L.length);
        const i = L[j];
        const t = s.T[i];
        if ((t === LIT || t === DRY) && rnd() < 0.05) {
          clear(s, i);
          L[j] = L[L.length - 1];
          L.pop();
        } else if (t !== LIT && t !== DRY) {
          L[j] = L[L.length - 1];
          L.pop();
        }
      }
  }

  // ---------- wind ----------
  // A gust runs down the page every so often: leaves show their pale undersides as it
  // passes, falling things drift with it, and in autumn it takes leaves with it.
  let gust: { y: number; v: number; dir: number; k: number } | null = null;
  let nextGust = 60 + Math.random() * 200;
  function wind(b: [number, number]) {
    if (gust) {
      gust.y += gust.v;
      if (gust.y > b[1] + 10) gust = null;
    } else if (--nextGust <= 0) {
      nextGust = 300 + rnd() * 600;
      gust = { y: b[0] + 20, v: 3 + rnd() * 3, dir: rnd() < 0.5 ? -1 : 1, k: 0.5 + rnd() * 0.5 };
    }
  }
  const inGust = (y: number) => !!gust && Math.abs(y - gust.y) < 5;

  // ---------- the season acting on leaves and snow ----------
  function seasonal(s: Side, b: [number, number]) {
    const fall = seas("fall");
    const sn = seas("snow");
    const melt = seas("melt");
    for (let k = 0; k < 14 && s.leaves.length; k++) {
      const j = Math.floor(rnd() * s.leaves.length);
      const i = s.leaves[j];
      if (s.T[i] !== LEAF) {
        s.leaves[j] = s.leaves[s.leaves.length - 1];
        s.leaves.pop();
        continue;
      }
      const y = (i / s.cols) | 0;
      if (!inB(y, b)) continue;
      if (rnd() < fall * 3 * (inGust(y) ? 4 : 1)) {
        const c = colorOf(s, i);
        clear(s, i);
        s.leaves[j] = s.leaves[s.leaves.length - 1];
        s.leaves.pop();
        if (c) spawn(s, i % s.cols, y, "leaf", c);
      } else paint(s, i);
    }
    let flakes = 0;
    for (const p of s.parts) if (p.kind === "snow") flakes++;
    if (sn > 0.05 && rnd() < sn * 0.35 && flakes < (s.cols < 14 ? 8 : 34)) {
      const top = Math.max(0, b[0] + 46);
      spawn(
        s,
        Math.floor(rnd() * s.cols),
        top + Math.floor(rnd() * Math.max(10, b[1] - top - 60)),
        "snow",
        C.snow,
      );
    }
    for (let k = 0; k < 3 && s.snow.length; k++) {
      const j = Math.floor(rnd() * s.snow.length);
      const i = s.snow[j];
      if (s.T[i] !== SNOW || rnd() < melt) {
        if (s.T[i] === SNOW) clear(s, i);
        s.snow[j] = s.snow[s.snow.length - 1];
        s.snow.pop();
      }
    }
  }

  // ---------- falling things ----------
  function spawn(s: Side, x: number, y: number, kind: PartKind, c: RGB, sp?: string) {
    if (s.parts.length > 110) return;
    s.parts.push({
      x,
      y,
      vx: (rnd() - 0.5) * 0.2,
      vy: kind === "spore" ? -0.06 : 0,
      kind,
      c,
      sp,
      t: 0,
      ph: rnd() * 6,
    });
  }
  function settle(s: Side, p: Part, x: number, y: number) {
    const i = at(s, x, y);
    if (i < 0 || s.T[i]) return;
    if (p.kind === "fruit") {
      put(s, i, SEED);
      s.seeds.push({ i, x, y, sp: p.sp ?? "vetch", t: 120 + rnd() * 300 });
    } else if (p.kind === "snow") {
      put(s, i, SNOW);
      s.snow.push(i);
    } else if (p.kind !== "spore" && rnd() < 0.65 && s.cells < cap(s) * 1.1) {
      put(s, i, LIT);
      s.litter.push(i);
    }
  }
  function particles(s: Side) {
    const out: Part[] = [];
    for (const p of s.parts) {
      p.t++;
      if (p.kind === "spore") {
        p.vx += (rnd() - 0.5) * 0.06 + s.dirIn * 0.004;
        p.vy += (rnd() - 0.5) * 0.03 - 0.002;
        if (p.t > 160) continue;
      } else {
        const g = p.kind === "fruit" ? 0.045 : p.kind === "snow" ? 0.006 : 0.012;
        const top = p.kind === "fruit" ? 1.2 : p.kind === "snow" ? 0.22 : 0.35;
        p.vy = Math.min(top, p.vy + g);
        p.vx =
          p.kind === "fruit" ? 0 : Math.sin(p.t * 0.12 + p.ph) * (p.kind === "snow" ? 0.12 : 0.22);
      }
      if (gust && inGust(p.y) && p.kind !== "fruit") p.vx += gust.dir * gust.k * 0.6;
      const nx = p.x + p.vx;
      const ny = p.y + p.vy;
      const X = Math.round(nx);
      const Y = Math.round(ny);
      const i = at(s, X, Y);
      if (i < 0) {
        if (Y >= s.rows) settle(s, p, clamp(Math.round(p.x), 0, s.cols - 1), s.rows - 1);
        continue;
      }
      if (s.T[i]) {
        if (p.kind !== "spore") settle(s, p, Math.round(p.x), Math.round(p.y));
        else if (
          bio.sp[0] === "hypha" &&
          (s.T[i] === DRY || s.T[i] === LIT || s.T[i] === MOSS) &&
          rnd() < 0.3
        )
          newPlant(s, Math.round(p.x), Math.round(p.y), "hypha");
        continue;
      }
      p.x = nx;
      p.y = ny;
      out.push(p);
    }
    s.parts = out;
  }

  // ---------- creatures ----------
  function newCrit(k: CritKind, x: number, y: number): Crit {
    return {
      k,
      x,
      y,
      vx: 0,
      vy: 0,
      t: 0,
      tgt: null,
      vis: 0,
      pol: null,
      n: 0,
      d: 0,
      th: rnd(),
      w: 1 / (34 + rnd() * 8),
      on: 0,
      kind: Math.floor(rnd() * C.fly.length),
    };
  }
  function wanted(s: Side, openF: Flower[]): Partial<Record<CritKind, number>> {
    const small = s.cols < 14;
    if (night)
      return {
        firefly: bio.sp[0] === "vetch" ? (small ? 1 : 5) : 0,
        moth: bio.sp[0] !== "hypha" ? (small ? 0 : 2) : 0,
      };
    const poll = seas("poll");
    return {
      bee: bio.bees ? Math.min(5, Math.ceil(openF.length * poll * 0.6)) : 0,
      butterfly:
        bio.butterflies && !small ? Math.min(2, Math.floor(openF.length * poll * 0.25)) : 0,
      beetle: Math.round(bio.beetles * (small ? 0.5 : 1)),
      spring: bio.springtails ? 3 : 0,
    };
  }
  function creatures(s: Side, b: [number, number]) {
    const openF = s.flowers.filter((f) => f.st === "open" && inB(f.y, b));
    const want = wanted(s, openF);
    const have: Partial<Record<CritKind, number>> = {};
    for (const c of s.crit) have[c.k] = (have[c.k] ?? 0) + 1;
    for (const [k, n] of Object.entries(want) as [CritKind, number][]) {
      if ((have[k] ?? 0) >= n || rnd() > 0.04) continue;
      const y = clamp(b[0] + 30 + rnd() * Math.max(10, b[1] - b[0] - 60), 2, s.rows - 3);
      if (k === "beetle" || k === "spring") {
        const i = pick(s.leaves) ?? -1;
        if (i < 0 || !inB((i / s.cols) | 0, b)) continue;
        s.crit.push(newCrit(k, i % s.cols, (i / s.cols) | 0));
      } else if (k === "firefly") s.crit.push(newCrit(k, Math.floor(rnd() * s.cols), y));
      else s.crit.push(newCrit(k, s.dirIn > 0 ? 0 : s.cols - 1, y));
    }
    const out: Crit[] = [];
    for (const c of s.crit) {
      c.t++;
      if (c.y < b[0] - 20 || c.y > b[1] + 20 || c.x < -2 || c.x > s.cols + 1) continue;
      // Nothing that belongs to the other half of the day stays.
      if (night !== (c.k === "firefly" || c.k === "moth")) continue;
      const near = ptr && ptr.s === s ? Math.hypot(ptr.x - c.x, ptr.y - c.y) : 1e9;
      if (c.k === "bee" || c.k === "butterfly") {
        if (!pollinator(s, c, near, openF)) continue;
      } else if (c.k === "moth") moth(s, c, near);
      else if (c.k === "firefly") {
        c.vx = c.vx * 0.96 + (rnd() - 0.5) * 0.05;
        c.vy = c.vy * 0.96 + (rnd() - 0.5) * 0.05 - 0.002;
        c.x += c.vx;
        c.y += c.vy;
        if (c.x < 1) c.vx += 0.05;
        if (c.x > s.cols - 2) c.vx -= 0.05;
        if (c.on > 0) c.on--;
      } else {
        // beetles walk along plants; springtails hop
        const beetle = c.k === "beetle";
        if (beetle ? c.t % 3 === 0 : c.t % (18 + (c.d % 20)) === 0) {
          const opts: [number, number][] = [];
          const R = beetle ? 1 : 3;
          for (let j = -R; j <= R; j++)
            for (let k = -R; k <= R; k++) {
              if (!j && !k) continue;
              const q = at(s, Math.round(c.x) + k, Math.round(c.y) + j);
              if (q < 0) continue;
              const t = s.T[q];
              if (beetle ? t === STEM || t === LEAF || t === DRY || t === HYP : !t && hasN(s, q))
                opts.push([k, j]);
            }
          const mv = pick(opts);
          if (mv) {
            c.x = Math.round(c.x) + mv[0];
            c.y = Math.round(c.y) + mv[1];
            c.d++;
          }
          if (beetle && near < 6 && rnd() < 0.5) continue;
        }
        if (c.t > 2400 && rnd() < 0.002) continue;
      }
      out.push(c);
    }
    s.crit = out;
  }
  /** Bees and butterflies: visit open flowers, carry pollen, keep away from the pointer. */
  function pollinator(s: Side, c: Crit, near: number, openF: Flower[]) {
    const bfly = c.k === "butterfly";
    if (ptr && near < (bfly ? 14 : 10)) {
      c.tgt = null;
      c.vx += ((c.x - ptr.x) / near) * 0.5;
      c.vy += ((c.y - ptr.y) / near) * 0.5;
    } else if (c.vis > 0) {
      c.vis--;
      if (!c.vis) {
        const f = c.tgt;
        if (f && f.st === "open") {
          if (c.pol && c.pol.sp === f.sp && c.pol.i !== f.i) f.pol = true;
          c.pol = { sp: f.sp, i: f.i };
        }
        c.tgt = null;
        c.n++;
      }
    } else {
      if (c.tgt?.st !== "open") {
        c.tgt = c.n > (bfly ? 5 : 7) ? null : (pick(openF) ?? null);
        if (!c.tgt) c.vx += -s.dirIn * 0.08;
      }
      if (c.tgt) {
        const dx = c.tgt.x - c.x;
        const dy = c.tgt.y - 1 - c.y;
        const d = Math.hypot(dx, dy);
        if (d < 1.2) {
          c.vis = (bfly ? 30 : 12) + Math.floor(rnd() * 22);
          c.vx = 0;
          c.vy = 0;
          c.x = c.tgt.x;
          c.y = c.tgt.y - 1;
        } else {
          c.vx += (dx / d) * (bfly ? 0.07 : 0.12);
          c.vy += (dy / d) * (bfly ? 0.07 : 0.12);
        }
      }
    }
    if (bfly) {
      // the dipping, bobbing flight of a butterfly
      c.vx += (rnd() - 0.5) * 0.12;
      c.vy += Math.sin(c.t * 0.35) * 0.09 + (rnd() - 0.5) * 0.08;
    } else {
      c.vx += (rnd() - 0.5) * 0.18;
      c.vy += (rnd() - 0.5) * 0.18 + Math.sin(c.t * 0.5) * 0.03;
    }
    const sp = Math.hypot(c.vx, c.vy);
    const mx = bfly ? 0.55 : 0.75;
    if (sp > mx) {
      c.vx *= mx / sp;
      c.vy *= mx / sp;
    }
    if (!c.vis) {
      c.x += c.vx;
      c.y += c.vy;
      c.vx *= 0.9;
      c.vy *= 0.9;
    }
    return !(c.n > (bfly ? 6 : 8) && (c.x < -1 || c.x > s.cols));
  }
  /** Moths go to the lamp, or to the brightest thing that glows nearby. */
  function moth(s: Side, c: Crit, near: number) {
    let tx = s.dirIn > 0 ? s.cols - 3 : 2;
    let ty = c.y + Math.sin(c.t * 0.03) * 6;
    if (ptr && ptr.s === s && near < 60) {
      tx = ptr.x;
      ty = ptr.y;
    } else {
      let best = 30;
      for (const l of s.lights) {
        const d = Math.hypot(l.x - c.x, l.y - c.y) / (0.4 + l.k);
        if (d < best) {
          best = d;
          tx = l.x;
          ty = l.y;
        }
      }
    }
    const dx = tx - c.x + Math.cos(c.t * 0.21) * 4;
    const dy = ty - c.y + Math.sin(c.t * 0.27) * 4;
    const d = Math.hypot(dx, dy) || 1;
    c.vx = c.vx * 0.85 + (dx / d) * 0.14 + (rnd() - 0.5) * 0.3;
    c.vy = c.vy * 0.85 + (dy / d) * 0.14 + (rnd() - 0.5) * 0.3;
    c.x += c.vx;
    c.y += c.vy;
  }
  /**
   * Fireflies are pulse-coupled oscillators: each flash nudges the others' clocks
   * forward, so over a minute or two they fall into step, across both margins.
   */
  function fireflySync() {
    const all: Crit[] = [];
    for (const s of sides) for (const c of s.crit) if (c.k === "firefly") all.push(c);
    const flashed: Crit[] = [];
    for (const c of all) {
      c.th += c.w;
      if (c.th >= 1) flashed.push(c);
    }
    for (const c of flashed) {
      c.th = 0;
      c.on = 4 + Math.floor(rnd() * 3);
      for (const o2 of all) if (o2 !== c && o2.th > 0) o2.th = Math.min(1, o2.th + 0.02);
    }
  }

  // ---------- what glows at night ----------
  function glowing(s: Side, b: [number, number]) {
    const small = s.cols < 14;
    // glow-worms on stems (meadow), foxfire on dead wood and moss (understory)
    s.glows = s.glows.filter((g) => {
      const t = s.T[g.i];
      return g.k === "worm" ? t === STEM || t === LEAF : t === DRY || t === LIT || t === MOSS;
    });
    const inBand = s.glows.filter((g) => inB((g.i / s.cols) | 0, b)).length;
    const kind = bio.sp[0] === "vetch" ? "worm" : bio.moss ? "fox" : null;
    const want = kind === "worm" ? (small ? 1 : 2) : kind === "fox" ? (small ? 2 : 6) : 0;
    if (kind && inBand < want && rnd() < 0.05) {
      const pool =
        kind === "worm"
          ? [...plants.values()].filter((p) => p.s === s && !p.dying).flatMap((p) => p.cells)
          : [...s.dead, ...s.litter, ...s.moss];
      const i = pick(pool) ?? -1;
      const y = (i / s.cols) | 0;
      if (i >= 0 && inB(y, b)) s.glows.push({ i, k: kind, ph: rnd() * 6.28 });
    }
    // glow-worm threads under fronds (understory)
    s.threads = s.threads.filter((th) => s.T[th.anchor] === LEAF);
    if (bio.moss && s.threads.filter((th) => inB(th.y, b)).length < (small ? 1 : 4)) {
      const i = pick(s.leaves) ?? -1;
      if (i >= 0 && s.T[i] === LEAF && rnd() < 0.05) {
        const x = i % s.cols;
        const y = (i / s.cols) | 0;
        let len = 0;
        while (len < 4 + Math.floor(rnd() * 9)) {
          const q = at(s, x, y + len + 1);
          if (q < 0 || s.T[q]) break;
          len++;
        }
        if (len >= 3 && inB(y, b)) s.threads.push({ anchor: i, x, y, len, ph: rnd() * 6.28 });
      }
    }
    // pulses along the hyphae (mycelium)
    if (bio.shrooms) {
      if (s.pulses.length < (small ? 1 : 2) && rnd() < 0.02) {
        const pl = pick([...plants.values()].filter((p) => p.s === s && inB(p.base, b)));
        const i = pl ? (pick(pl.cells) ?? -1) : -1;
        if (i >= 0 && s.T[i] === HYP) pulse(s, i);
      }
      s.pulses = s.pulses.filter((p) => spread(s, p));
    }
  }
  function pulse(s: Side, i: number) {
    if (s.pulses.length > 5) return;
    s.pulses.push({ front: [i], hist: [], seen: new Set([i]), t: 0 });
  }
  function spread(s: Side, p: Pulse) {
    p.t++;
    const next: number[] = [];
    for (const i of p.front) {
      const x = i % s.cols;
      const y = (i / s.cols) | 0;
      for (let j = -1; j <= 1; j++)
        for (let k = -1; k <= 1; k++) {
          const q = at(s, x + k, y + j);
          if (q >= 0 && s.T[q] === HYP && !p.seen.has(q)) {
            p.seen.add(q);
            next.push(q);
          }
        }
    }
    p.hist.unshift(p.front);
    if (p.hist.length > 4) p.hist.pop();
    p.front = next.length > 24 ? next.filter(() => rnd() < 24 / next.length) : next;
    return (p.front.length > 0 || p.hist.some((h) => h.length)) && p.t < 90 && p.seen.size < 900;
  }
  /** Everything that gives light this frame, in cell coordinates. */
  function collectLights(s: Side, b: [number, number]) {
    const L: Light[] = [];
    const tt = frame * 0.06;
    if (ptr && ptr.s === s) L.push({ x: ptr.x, y: ptr.y, r: 12, c: LIGHT.lamp, k: 0.5 });
    for (const c of s.crit)
      if (c.k === "firefly" && c.on > 0) L.push({ x: c.x, y: c.y, r: 7, c: LIGHT.firefly, k: 1 });
    for (const g of s.glows) {
      const y = (g.i / s.cols) | 0;
      if (!inB(y, b)) continue;
      const breath = 0.75 + 0.25 * Math.sin(tt * 0.5 + g.ph);
      L.push(
        g.k === "worm"
          ? { x: g.i % s.cols, y, r: 5, c: LIGHT.glowworm, k: 0.8 * breath }
          : { x: g.i % s.cols, y, r: 4, c: LIGHT.foxfire, k: 0.55 * breath },
      );
    }
    for (const th of s.threads) {
      if (!inB(th.y, b)) continue;
      L.push({
        x: th.x,
        y: th.y + th.len * 0.6,
        r: 4,
        c: LIGHT.thread,
        k: 0.45 + 0.15 * Math.sin(tt + th.ph),
      });
    }
    for (const m of s.shrooms)
      if (m.glow && bio.shrooms && inB(m.y, b))
        L.push({ x: m.x, y: m.y, r: 5, c: LIGHT.cap, k: 0.6 });
    for (const p of s.pulses)
      for (const i of p.front.slice(0, 6))
        L.push({ x: i % s.cols, y: (i / s.cols) | 0, r: 3, c: LIGHT.pulse, k: 0.5 });
    s.lights = L;
  }

  /** Keep a few plants alive near the reader. */
  function ensure(s: Side, b: [number, number], pre: boolean) {
    const g = pre ? 1 : seas("grow");
    if (g < 0.15 || s.cells >= cap(s)) return;
    const b0 = Math.max(0, b[0]);
    const b1 = Math.min(s.rows, b[1]);
    let n = 0;
    for (const pl of plants.values())
      if (pl.s === s && !pl.dying && pl.base >= b0 && pl.base <= b1) n++;
    const want = Math.max(2, Math.round((b1 - b0) / (s.cols < 14 ? 110 : 28)));
    if (n < want && rnd() < (pre ? 0.6 : 0.14 * g)) {
      const y = clamp(Math.floor(b0 + 20 + rnd() * Math.max(8, b1 - b0 - 30)), 3, s.rows - 3);
      newPlant(s, s.dirIn > 0 ? 0 : s.cols - 1, y);
    }
  }

  // ---------- one step ----------
  let steps = 0;
  function stepAll(b: [number, number], pre: boolean) {
    frame++;
    steps++;
    if (o.cycle()) phase = (phase + 0.00045) % 4;
    if (!pre) wind(b);
    for (const s of sides) {
      if (!s.ok) continue;
      grow(s, b, pre);
      flowers(s, b, pre);
      seeds(s, b);
      ageing(s, b);
      fungi(s, b);
      mossGrow(s, b);
      seasonal(s, b);
      if (!pre) {
        particles(s);
        creatures(s, b);
        mature(s);
      } else if (s.parts.length) {
        for (const p of s.parts) settle(s, p, Math.round(p.x), Math.round(p.y));
        s.parts.length = 0;
      }
      ensure(s, b, pre);
      if (night) glowing(s, b);
    }
    if (night && !pre) fireflySync();
  }

  // ---------- drawing ----------
  function dot(s: Side, x: number, y: number, c: RGB | string) {
    const X = Math.round(x);
    const Y = Math.round(y);
    if (X < 0 || Y < 0 || X >= s.cols || Y >= s.rows) return;
    s.vx.fillStyle = typeof c === "string" ? c : rgb(c);
    s.vx.fillRect(X, Y, 1, 1);
  }
  /** How lit a spot is at night (for things that do not glow themselves). */
  function lightAt(s: Side, x: number, y: number) {
    let k = LIGHT.moon[1];
    for (const l of s.lights) {
      const d = Math.hypot(l.x - x, l.y - y);
      if (d < l.r) k += l.k * (1 - d / l.r);
    }
    return Math.min(1, k);
  }
  function drawCritters(s: Side, y0: number, y1: number) {
    const lit = (c: RGB, x: number, y: number) => (night ? shade(c, lightAt(s, x, y)) : c);
    for (const p of s.parts) {
      if (p.y < y0 || p.y > y1) continue;
      if (night && p.glow) dot(s, p.x, p.y, shade(LIGHT.cap, 120));
      else dot(s, p.x, p.y, lit(p.c, p.x, p.y));
    }
    for (const c of s.crit) {
      if (c.y < y0 - 2 || c.y > y1 + 2) continue;
      if (c.k === "bee") {
        dot(s, c.x, c.y, C.bee);
        if (frame & 1) dot(s, c.x, c.y - 1, C.wing);
        else dot(s, c.x - s.dirIn, c.y - 1, shade(C.wing, 0.7));
      } else if (c.k === "butterfly") {
        const [wing, edge] = C.fly[c.kind];
        const open = c.vis ? frame % 6 < 2 : frame % 3 !== 0;
        dot(s, c.x, c.y, edge);
        if (open) {
          dot(s, c.x - 1, c.y, wing);
          dot(s, c.x + 1, c.y, wing);
          dot(s, c.x - 1, c.y - 1, shade(wing, 0.85));
          dot(s, c.x + 1, c.y - 1, shade(wing, 0.85));
        } else dot(s, c.x, c.y - 1, wing);
      } else if (c.k === "moth") {
        const m = lit(C.moth, c.x, c.y);
        dot(s, c.x, c.y, m);
        if (frame & 1) {
          dot(s, c.x - 1, c.y, shade(m, 0.8));
          dot(s, c.x + 1, c.y, shade(m, 0.8));
        } else dot(s, c.x, c.y - 1, shade(m, 0.7));
      } else if (c.k === "firefly") {
        if (c.on > 0) {
          dot(s, c.x, c.y, "#F4FFB0");
          const g = rgb(shade(LIGHT.firefly, 150));
          dot(s, c.x - 1, c.y, g);
          dot(s, c.x + 1, c.y, g);
          dot(s, c.x, c.y - 1, g);
          dot(s, c.x, c.y + 1, g);
        } else dot(s, c.x, c.y, "#2A2C1E");
      } else if (c.k === "beetle") dot(s, c.x, c.y, C.beetle);
      else dot(s, c.x, c.y, C.spring);
    }
  }
  function drawGlows(s: Side, y0: number, y1: number) {
    const v = s.vx;
    // halos in the air around what glows
    v.globalCompositeOperation = "lighter";
    for (const l of s.lights) {
      if (l.y < y0 - l.r || l.y > y1 + l.r) continue;
      const g = v.createRadialGradient(l.x + 0.5, l.y + 0.5, 0, l.x + 0.5, l.y + 0.5, l.r * 0.9);
      g.addColorStop(0, rgba(l.c, 0.16 * l.k));
      g.addColorStop(1, rgba(l.c, 0));
      v.fillStyle = g;
      v.fillRect(l.x - l.r, l.y - l.r, l.r * 2 + 1, l.r * 2 + 1);
    }
    v.globalCompositeOperation = "source-over";
    const tt = frame * 0.06;
    for (const g of s.glows) {
      const y = (g.i / s.cols) | 0;
      if (y < y0 || y > y1) continue;
      const breath = 0.75 + 0.25 * Math.sin(tt * 0.5 + g.ph);
      dot(s, g.i % s.cols, y, shade(g.k === "worm" ? LIGHT.glowworm : LIGHT.foxfire, 220 * breath));
    }
    for (const th of s.threads) {
      if (th.y < y0 || th.y > y1) continue;
      for (let k = 1; k <= th.len; k++) {
        const tw = 0.5 + 0.5 * Math.sin(tt * 1.3 + th.ph + k * 1.7);
        const bead = (k + Math.floor(th.ph * 3)) % 2 === 0;
        dot(s, th.x, th.y + k, shade(LIGHT.thread, bead ? 90 + 120 * tw : 30 + 16 * tw));
      }
    }
    for (const m of s.shrooms) {
      if (!m.glow || !bio.shrooms || m.y < y0 || m.y > y1) continue;
      for (const i of m.cells)
        if (s.A[i] < 230) dot(s, i % s.cols, (i / s.cols) | 0, shade(LIGHT.cap, 150));
    }
    for (const p of s.pulses)
      p.hist.forEach((h, n) => {
        for (const i of h) dot(s, i % s.cols, (i / s.cols) | 0, shade(LIGHT.pulse, 200 - n * 45));
      });
    for (const i of pulseHead(s)) dot(s, i % s.cols, (i / s.cols) | 0, "#E8FFFF");
  }
  const pulseHead = (s: Side) => s.pulses.flatMap((p) => p.front);
  const MOON = rgb(shade(LIGHT.moon, 255));
  function render(b: [number, number]) {
    for (const s of sides) {
      if (!s.ok) continue;
      const y0 = clamp(b[0], 0, s.rows);
      const y1 = clamp(b[1], 0, s.rows);
      const h = y1 - y0;
      if (h <= 0) continue;
      const v = s.vx;
      if (!night) {
        v.clearRect(0, y0, s.cols, h);
        v.drawImage(s.base, 0, y0, s.cols, h, 0, y0, s.cols, h);
        if (gust) {
          // the garden bends as the gust passes: rows near it shift a cell downwind
          const g0 = Math.max(y0, Math.floor(gust.y - 7));
          const g1 = Math.min(y1, Math.ceil(gust.y + 7));
          for (let y = g0; y < g1; y++) {
            const k = 1 - Math.abs(y - gust.y) / 7;
            const off = Math.round(gust.dir * gust.k * k * 1.6);
            if (!off) continue;
            v.clearRect(0, y, s.cols, 1);
            v.drawImage(s.base, 0, y, s.cols, 1, off, y, s.cols, 1);
          }
          // leaves turned to their pale undersides
          for (let y = Math.max(y0, Math.floor(gust.y - 4)); y <= Math.min(y1, gust.y + 4); y++)
            for (let x = 0; x < s.cols; x++) {
              const i = y * s.cols + x;
              if (s.T[i] === LEAF && hh(i + frame) < 0.55) {
                const c = colorOf(s, i);
                if (c) dot(s, x, y, mix(c, C.wing, 0.32));
              }
            }
        }
        drawCritters(s, y0, y1);
        continue;
      }
      if (!s.lc || !s.lx || s.lc.width !== s.cols || s.lc.height < h) {
        s.lc = document.createElement("canvas");
        s.lc.width = Math.max(1, s.cols);
        s.lc.height = h + 64;
        s.lx = ctx2d(s.lc);
      }
      const L = s.lx;
      L.globalCompositeOperation = "source-over";
      L.fillStyle = MOON;
      L.fillRect(0, 0, s.cols, h);
      L.globalCompositeOperation = "lighter";
      for (const l of s.lights) {
        if (l.y < y0 - l.r || l.y > y1 + l.r) continue;
        const cx = l.x + 0.5;
        const cy = l.y - y0 + 0.5;
        const g = L.createRadialGradient(cx, cy, 0, cx, cy, l.r);
        g.addColorStop(0, rgba(l.c, l.k));
        g.addColorStop(0.4, rgba(l.c, l.k * 0.45));
        g.addColorStop(1, rgba(l.c, 0));
        L.fillStyle = g;
        L.fillRect(cx - l.r, cy - l.r, l.r * 2, l.r * 2);
      }
      // the garden as the light falls on it: copy, multiply by the light, keep its shape
      v.globalCompositeOperation = "copy";
      v.drawImage(s.base, 0, y0, s.cols, h, 0, y0, s.cols, h);
      v.globalCompositeOperation = "multiply";
      v.drawImage(s.lc, 0, 0, s.cols, h, 0, y0, s.cols, h);
      v.globalCompositeOperation = "destination-in";
      v.drawImage(s.base, 0, y0, s.cols, h, 0, y0, s.cols, h);
      v.globalCompositeOperation = "source-over";
      drawGlows(s, y0, y1);
      drawCritters(s, y0, y1);
    }
  }

  // ---------- running ----------
  let acc = 0;
  let lastCost = 0;
  let bornAt = performance.now();
  let ready = false;
  const STEP = 66;
  const live = living({
    el: host,
    fps: 15,
    budget: 6,
    paused: true,
    slow() {
      live.fps = Math.max(6, live.fps - 3);
    },
    tick(dt) {
      if (!ready || disposed) return;
      const t0 = performance.now();
      const b = band();
      // after three minutes without a touch, slow to a crawl
      live.fps = performance.now() - lastInput > 180000 ? 5 : 15;
      // a day garden grows in quickly as you arrive, then settles to its own pace
      const since = performance.now() - bornAt;
      const boost = night ? 1 : 1 + 2 * Math.exp(-since / 9000);
      acc += dt * clamp(o.tempo(), 0.1, 8) * boost;
      let n = 0;
      while (acc >= STEP && n < 4) {
        stepAll(b, false);
        acc -= STEP;
        n++;
      }
      if (acc > STEP * 4) acc = 0;
      if (night && n) for (const s of sides) if (s.ok) collectLights(s, b);
      render(b);
      lastCost = performance.now() - t0;
    },
  });

  /** Run a generator in small slices so a long job never blocks the page. */
  function chunk(gen: Generator<void>, budget: number) {
    return new Promise<void>((resolve) => {
      const run = () => {
        if (disposed) return resolve();
        const t0 = performance.now();
        while (performance.now() - t0 < budget) {
          if (gen.next().done) return resolve();
        }
        setTimeout(run, 0);
      };
      setTimeout(run, 0);
    });
  }
  /** Grow n steps over the whole page; stops early if a newer garden replaces this one. */
  function* pregrow(n: number, token: number): Generator<void> {
    const b: [number, number] = [0, Math.max(10, ...sides.map((s) => s.rows))];
    for (let k = 0; k < n && token === growing; k++) {
      pregrowing = true;
      stepAll(b, true);
      pregrowing = false;
      if (k % 4 === 3) yield;
    }
  }

  // pointer: pollinators flee it, moths come to it, it is a lamp at night; a press plants
  // a seed (or, in the mycelium at night, sends a pulse along the hyphae)
  function regionHit(e: PointerEvent) {
    const hr = host.getBoundingClientRect();
    const x = e.clientX - hr.left;
    const y = e.clientY - hr.top;
    for (const s of sides) {
      const x1 = s.x0 + s.cols * CS;
      if (s.ok && x >= s.x0 && x < x1 && y >= 0 && y < s.rows * CS)
        return { s, x: Math.floor((x - s.x0) / CS), y: Math.floor(y / CS) };
    }
    return null;
  }
  /** The nearest hypha within r cells, or -1. */
  function nearHypha(s: Side, x: number, y: number, r: number) {
    for (let d = 0; d <= r; d++)
      for (let j = -d; j <= d; j++)
        for (let k = -d; k <= d; k++) {
          const q = at(s, x + k, y + j);
          if (q >= 0 && s.T[q] === HYP) return q;
        }
    return -1;
  }
  let nudge = 0;
  const onMove = (e: PointerEvent) => {
    ptr = regionHit(e);
    lastInput = performance.now();
    if (night && ptr && bio.shrooms && performance.now() - nudge > 400) {
      const q = nearHypha(ptr.s, ptr.x, ptr.y, 2);
      if (q >= 0) {
        nudge = performance.now();
        pulse(ptr.s, q);
      }
    }
    if (STILL && night && ready) redraw();
  };
  const onOut = (e: MouseEvent) => {
    if (!e.relatedTarget) ptr = null;
  };
  const onScroll = () => {
    lastInput = performance.now();
    if (ready) queueRedraw();
  };
  let lastSeed = 0;
  const onDown = (e: PointerEvent) => {
    const h = regionHit(e);
    if (!h) return;
    const now = performance.now();
    if (now - lastSeed < 300) return;
    lastSeed = now;
    const i = at(h.s, h.x, h.y);
    if (night && bio.shrooms && i >= 0) {
      const q = nearHypha(h.s, h.x, h.y, 4);
      if (q >= 0) {
        pulse(h.s, q);
        return;
      }
    }
    const pl = newPlant(h.s, h.x, h.y);
    if (pl && STILL)
      chunk(
        (function* () {
          for (let k = 0; k < 80; k++) {
            stepAll([h.y - 60, h.y + 60], true);
            if (k % 8 === 7) yield;
          }
          redraw();
        })(),
        4,
      );
  };
  addEventListener("pointermove", onMove, { passive: true });
  addEventListener("pointerdown", onDown, { passive: true });
  document.addEventListener("mouseout", onOut);
  addEventListener("scroll", onScroll, { passive: true });

  let rq = 0;
  function redraw() {
    const b = band();
    if (night) for (const s of sides) if (s.ok) collectLights(s, b);
    render(b);
  }
  function queueRedraw() {
    if (rq) return;
    rq = requestAnimationFrame(() => {
      rq = 0;
      if (!disposed) redraw();
    });
  }

  // layout: grow a garden for the space there is, then let it live
  let lastW = 0;
  let lastH = 0;
  let growing = 0;
  function relayout(force: boolean) {
    const r = host.getBoundingClientRect();
    if (!force && Math.abs(r.width - lastW) < 1 && Math.abs(r.height - lastH) < 1) return;
    lastW = r.width;
    lastH = r.height;
    if (!layout(force) && !force) {
      if (ready) queueRedraw();
      return;
    }
    const my = ++growing;
    ready = false;
    live.setPaused(true);
    // nights start grown; days start young and grow in (still: grown, then drawn once)
    const n = night || STILL ? (NARROW ? 300 : 420) : NARROW ? 160 : 200;
    chunk(pregrow(n, my), 4).then(() => {
      if (growing !== my || disposed) return;
      ready = true;
      bornAt = performance.now();
      if (night) seedNight();
      redraw();
      if (!STILL) live.setPaused(false);
    });
  }
  /** A night begins with what already glows (and, held still, a few fireflies mid-flash). */
  function seedNight() {
    const b: [number, number] = [0, Math.max(...sides.map((s) => s.rows))];
    for (let k = 0; k < 40; k++) for (const s of sides) if (s.ok) glowing(s, b);
    if (!STILL || bio.sp[0] !== "vetch") return;
    for (const s of sides) {
      if (!s.ok || s.cols < 14) continue;
      for (let y = 40 + rnd() * 120; y < s.rows - 10; y += 90 + rnd() * 160) {
        const c = newCrit("firefly", 2 + rnd() * (s.cols - 4), y);
        c.on = rnd() < 0.6 ? 1 : 0;
        s.crit.push(c);
      }
    }
  }
  let rt = 0;
  const ro = new ResizeObserver(() => {
    clearTimeout(rt);
    rt = window.setTimeout(() => relayout(false), 220);
  });
  ro.observe(host);
  relayout(true);

  function reseed() {
    plants.clear();
    for (const s of sides) s.cols = 0;
    relayout(true);
  }

  return {
    setBiome(b: string) {
      const next = BIOME_DEFS[b] ?? BIOME_DEFS.meadow;
      if (next === bio) return;
      bio = next;
      reseed();
    },
    setNight(n: boolean) {
      if (n === night) return;
      night = n;
      for (const s of sides) {
        s.crit = [];
        s.glows = [];
        s.threads = [];
        s.pulses = [];
        s.lights = [];
      }
      if (n && ready) seedNight();
      if (ready) redraw();
    },
    seasonChanged() {
      for (const s of sides) for (const i of s.leaves) if (s.T[i] === LEAF) paint(s, i);
      if (ready) redraw();
    },
    dispose() {
      disposed = true;
      live.dispose();
      ro.disconnect();
      clearTimeout(rt);
      cancelAnimationFrame(rq);
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerdown", onDown);
      document.removeEventListener("mouseout", onOut);
      removeEventListener("scroll", onScroll);
      for (const s of sides) s.box.remove();
      sides = [];
      plants.clear();
    },
    stats() {
      let pc = 0;
      let fo = 0;
      let cr = 0;
      for (const p of plants.values()) if (!p.dying) pc++;
      for (const s of sides) {
        fo += s.flowers.filter((f) => f.st === "open").length;
        cr += s.crit.length;
      }
      let lit = 0;
      let ff = 0;
      for (const s of sides)
        for (const c of s.crit)
          if (c.k === "firefly") {
            ff++;
            if (c.on > 0) lit++;
          }
      return {
        plants: pc,
        flowers: fo,
        creatures: cr,
        cost: lastCost,
        steps,
        fireflies: [lit, ff],
      };
    },
  };
}
