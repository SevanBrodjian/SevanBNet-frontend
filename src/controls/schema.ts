// Every setting a visitor can change, and the four views built from them.
//
// A view (Comfort, Wireframe, Broken, Reactive) is only a preset of these values: Comfort
// is every default, the others set a handful. Anything a view does can be reached one
// control at a time in the controls panel. Page areas can add their own settings with
// registerGroup() in ./store; those live alongside these but are never part of a view.

/** n: number, h: hue in degrees (wraps), s: one of a set, b: on/off. */
export type Spec =
  | { k: "n" | "h"; d: number; min: number; max: number; st: number }
  | { k: "s"; d: string; o: readonly string[] }
  | { k: "b"; d: number };

export type Value = number | string;
export type Values = Record<string, Value>;

const n = (d: number, min: number, max: number, st = 0.01): Spec => ({ k: "n", d, min, max, st });
const h = (d: number): Spec => ({ k: "h", d, min: 0, max: 360, st: 1 });
const s = (d: string, o: readonly string[]): Spec => ({ k: "s", d, o });
const b = (): Spec => ({ k: "b", d: 0 });

export const SPEC: Record<string, Spec> = {
  // skeleton
  wire: n(0, 0, 1),
  tags: n(0, 0, 1),
  grid: n(0, 0, 1),
  xray: n(0, 0, 1),
  phos: h(190),
  ink: n(0, 0, 1),
  media: n(1, 0, 1),
  rulers: b(),
  hud: b(),
  inspect: b(),
  // surface
  ground: n(0, -1, 1),
  temp: n(0, -1, 1),
  acc: h(211),
  grain: n(0.35, 0, 1),
  grainhz: s("0", ["0", "6", "12", "24"]),
  web: n(0, 0, 1),
  scan: n(0, 0, 1),
  bevel: n(0, 0, 1),
  radius: n(0, 0, 28, 1),
  vign: n(0, 0, 1),
  hair: n(1, 1, 4, 0.5),
  // type
  wdth: n(100, 62, 125, 1),
  wght: n(0, -250, 300, 10),
  track: n(0, -0.04, 0.2, 0.005),
  lead: n(1, 0.8, 1.7),
  face: s("sans", ["sans", "serif", "mono", "system"]),
  case: s("as", ["as", "upper", "lower"]),
  braces: s("name", ["none", "name", "heads", "all"]),
  epoch: s("dot", ["dot", "iso", "unix", "julian"]),
  // faults
  misreg: n(0, 0, 1),
  zfight: n(0, 0, 1),
  drift: n(0, 0, 1),
  fallback: n(0, 0, 1),
  stuck: n(0, 0, 1),
  overflow: n(0, 0, 1),
  tear: n(0, 0, 1),
  // dynamics
  field: n(0, 0, 1),
  magnet: n(0, 0, 1),
  inertia: n(0, 0, 1),
  gravity: n(0, 0, 1),
  tilt: n(0, 0, 1),
  shock: n(0, 0, 1),
  // mechanics
  clack: n(0, 0, 1),
  steps: n(0, 0, 8, 1),
  baud: s("off", ["off", "1200", "300", "75"]),
  cursor: s("auto", ["auto", "cross", "reticle", "cell"]),
  trail: n(0, 0, 1),
  fps: s("60", ["60", "30", "12", "4"]),
  tempo: n(1, 0.25, 4, 0.05),
  // optics: filters on the page body, never on the header or the panel
  hue: h(0),
  sat: n(1, 0, 2),
  contrast: n(1, 0.6, 1.6),
  invert: b(),
  defocus: n(0, 0, 2, 0.05),
  horizon: n(0, -3, 3, 0.05),
  parity: b(),
};

export const DEFAULTS: Values = Object.fromEntries(Object.entries(SPEC).map(([k, v]) => [k, v.d]));

export const ORDER = ["comfort", "wireframe", "broken", "reactive"] as const;
export type View = (typeof ORDER)[number];
export const NAMES: Record<View, string> = {
  comfort: "Comfort",
  wireframe: "Wireframe",
  broken: "Broken",
  reactive: "Reactive",
};

const PRESET_CHANGES: Record<View, Values> = {
  comfort: {},
  wireframe: {
    wire: 1,
    tags: 1,
    grid: 0.5,
    xray: 0.3,
    phos: 148,
    ink: 0.92,
    media: 0.3,
    rulers: 1,
    hud: 1,
    inspect: 1,
    ground: -0.3,
    grain: 0.12,
    braces: "all",
    epoch: "iso",
    cursor: "cross",
  },
  broken: {
    misreg: 0.55,
    zfight: 0.7,
    drift: 0.45,
    fallback: 0.4,
    stuck: 0.45,
    overflow: 0.3,
    tear: 0.8,
    wire: 0.16,
    tags: 0.22,
    phos: 8,
    scan: 0.35,
    grain: 0.6,
    grainhz: "12",
    bevel: 0.7,
    wdth: 90,
    epoch: "unix",
    braces: "heads",
    horizon: 0.4,
    contrast: 1.08,
  },
  reactive: {
    field: 0.6,
    magnet: 0.55,
    inertia: 0.65,
    gravity: 0.16,
    tilt: 0.5,
    shock: 0.8,
    steps: 4,
    cursor: "reticle",
    trail: 0.3,
  },
};

export const PRESETS = Object.fromEntries(
  ORDER.map((v) => [v, { ...DEFAULTS, ...PRESET_CHANGES[v] }]),
) as Record<View, Values>;

/** Keep a value inside its spec; undefined for unknown keys. */
export function valid(spec: Spec | undefined, v: unknown): Value | undefined {
  if (!spec) return undefined;
  if (spec.k === "s") return spec.o.includes(String(v)) ? String(v) : spec.d;
  if (spec.k === "b") return v ? 1 : 0;
  const x = Number(v);
  if (!Number.isFinite(x)) return spec.d;
  if (spec.k === "h") return ((x % 360) + 360) % 360;
  return Math.min(spec.max, Math.max(spec.min, x));
}

export const wrapPos = (p: number) => ((p % 4) + 4) % 4;

/** The core values at a position on the loop: 0 Comfort, 1 Wireframe, 2 Broken, 3 Reactive. */
export function blend(pos: number): Values {
  const p = wrapPos(pos);
  const i = Math.floor(p + 1e-9) % 4;
  const t = p - Math.floor(p + 1e-9);
  const a = PRESETS[ORDER[i]];
  const z = PRESETS[ORDER[(i + 1) % 4]];
  const out: Values = {};
  for (const [k, spec] of Object.entries(SPEC)) {
    const x = a[k];
    const y = z[k];
    if (t < 1e-6) out[k] = x;
    else if (spec.k === "n") out[k] = (x as number) + ((y as number) - (x as number)) * t;
    else if (spec.k === "h") {
      const d = x === y ? 0 : (((y as number) - (x as number) + 540) % 360) - 180;
      out[k] = ((x as number) + d * t + 360) % 360;
    } else out[k] = t < 0.5 ? x : y;
  }
  return out;
}

export type Fmt = "pct" | "deg" | "px" | "x" | "sgn" | "em" | "lr" | "hor" | "n";

export const FORMAT: Record<Fmt, (v: number) => string> = {
  pct: (v) => `${Math.round(v * 100)}%`,
  deg: (v) => `${Math.round(v)}°`,
  px: (v) => `${v.toFixed(v % 1 ? 1 : 0)}px`,
  x: (v) => `${v.toFixed(2)}×`,
  sgn: (v) => `${v > 0 ? "+" : ""}${Math.round(v)}`,
  em: (v) => `${v > 0 ? "+" : ""}${v.toFixed(3)}`,
  lr: (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`,
  hor: (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}°`,
  n: (v) => String(Math.round(v)),
};

/** One row in the panel. `guarded` controls need a guard lifted before they switch. */
export type ControlRow = { id: string; label: string; fmt?: Fmt; guarded?: boolean };
export type PanelGroup = { id: string; title: string; rows: (ControlRow | { action: "reroll" })[] };

export const CORE_GROUPS: PanelGroup[] = [
  {
    id: "skeleton",
    title: "Skeleton",
    rows: [
      { id: "wire", label: "Outline", fmt: "pct" },
      { id: "tags", label: "Tag density", fmt: "pct" },
      { id: "grid", label: "Column grid", fmt: "pct" },
      { id: "xray", label: "X-ray depth", fmt: "pct" },
      { id: "phos", label: "Phosphor", fmt: "deg" },
      { id: "ink", label: "Phosphor ink", fmt: "pct" },
      { id: "media", label: "Media", fmt: "pct" },
      { id: "rulers", label: "Rulers" },
      { id: "hud", label: "HUD" },
      { id: "inspect", label: "Inspector" },
    ],
  },
  {
    id: "surface",
    title: "Surface",
    rows: [
      { id: "ground", label: "Ground L", fmt: "lr" },
      { id: "temp", label: "Temperature", fmt: "lr" },
      { id: "acc", label: "Accent", fmt: "deg" },
      { id: "grain", label: "Grain", fmt: "pct" },
      { id: "grainhz", label: "Grain rate Hz" },
      { id: "web", label: "Cosmic web", fmt: "pct" },
      { id: "scan", label: "Scanlines", fmt: "pct" },
      { id: "bevel", label: "Bevel", fmt: "pct" },
      { id: "radius", label: "Corners", fmt: "px" },
      { id: "vign", label: "Vignette", fmt: "pct" },
      { id: "hair", label: "Hairline", fmt: "px" },
    ],
  },
  {
    id: "type",
    title: "Type",
    rows: [
      { id: "wdth", label: "Width", fmt: "n" },
      { id: "wght", label: "Weight", fmt: "sgn" },
      { id: "track", label: "Tracking", fmt: "em" },
      { id: "lead", label: "Leading", fmt: "x" },
      { id: "face", label: "Face" },
      { id: "case", label: "Case" },
      { id: "braces", label: "Braces" },
      { id: "epoch", label: "Calendar" },
    ],
  },
  {
    id: "faults",
    title: "Faults",
    rows: [
      { id: "misreg", label: "Misregistration", fmt: "pct" },
      { id: "zfight", label: "Z-fight", fmt: "pct" },
      { id: "drift", label: "Drift", fmt: "pct" },
      { id: "fallback", label: "Fallback fonts", fmt: "pct" },
      { id: "stuck", label: "Stuck states", fmt: "pct" },
      { id: "overflow", label: "Overflow", fmt: "pct" },
      { id: "tear", label: "Tear on scroll", fmt: "pct" },
      { action: "reroll" },
    ],
  },
  {
    id: "dynamics",
    title: "Dynamics",
    rows: [
      { id: "field", label: "Displacement", fmt: "pct" },
      { id: "magnet", label: "Magnetism", fmt: "pct" },
      { id: "inertia", label: "Scroll inertia", fmt: "pct" },
      { id: "gravity", label: "Gravity", fmt: "pct" },
      { id: "tilt", label: "Tilt", fmt: "pct" },
      { id: "shock", label: "Shockwave", fmt: "pct" },
    ],
  },
  {
    id: "mechanics",
    title: "Mechanics",
    rows: [
      { id: "clack", label: "Click", fmt: "pct" },
      { id: "steps", label: "Steps", fmt: "n" },
      { id: "baud", label: "Baud" },
      { id: "cursor", label: "Cursor" },
      { id: "trail", label: "Persistence", fmt: "pct" },
      { id: "fps", label: "Clock Hz" },
      { id: "tempo", label: "Tempo", fmt: "x" },
    ],
  },
  {
    id: "optics",
    title: "Optics",
    rows: [
      { id: "hue", label: "Hue", fmt: "deg" },
      { id: "sat", label: "Saturation", fmt: "x" },
      { id: "contrast", label: "Contrast", fmt: "x" },
      { id: "invert", label: "Invert", guarded: true },
      { id: "defocus", label: "Defocus", fmt: "px" },
      { id: "horizon", label: "Horizon", fmt: "hor" },
      { id: "parity", label: "Parity" },
    ],
  },
];

/** Annunciator lamps: lit when any of their settings is off its default. */
export const LAMPS: { label: string; keys: string[]; tone?: "r" | "a" }[] = [
  {
    label: "SKEL",
    keys: ["wire", "tags", "grid", "xray", "ink", "media", "rulers", "hud", "inspect"],
  },
  {
    label: "SURF",
    keys: [
      "ground",
      "temp",
      "acc",
      "grain",
      "grainhz",
      "web",
      "scan",
      "bevel",
      "radius",
      "vign",
      "hair",
    ],
  },
  { label: "TYPE", keys: ["wdth", "wght", "track", "lead", "face", "case", "braces", "epoch"] },
  {
    label: "FAULT",
    keys: ["misreg", "zfight", "drift", "fallback", "stuck", "overflow", "tear"],
    tone: "r",
  },
  { label: "DYN", keys: ["field", "magnet", "inertia", "gravity", "tilt", "shock"] },
  { label: "MECH", keys: ["steps", "baud", "cursor", "trail", "fps", "tempo"] },
  { label: "AUDIO", keys: ["clack"], tone: "a" },
  { label: "OPTIC", keys: ["hue", "sat", "contrast", "invert", "defocus", "horizon", "parity"] },
];
