// What lives in the margins: species, biomes, colours and the shape of the year.

export type RGB = [number, number, number];

export const hx = (h: string): RGB => [
  Number.parseInt(h.slice(1, 3), 16),
  Number.parseInt(h.slice(3, 5), 16),
  Number.parseInt(h.slice(5, 7), 16),
];

export type Species = {
  k: string;
  leafStyle?: "pinnate" | "blade" | "clover";
  frond?: boolean;
  thin?: boolean;
  flower: boolean;
  /** Tropism (outward, up), wandering, curl, curl near the end, branching per step. */
  trop: [number, number];
  wander: number;
  curl: number;
  curlEnd?: number;
  branch: number;
  /** A tip's length, in cells. */
  life: [number, number];
  /** Cells between leaf nodes, and leaf length. */
  node: number;
  lf: number;
  /** Crowding is allowed (hyphae weave through everything). */
  avoid?: boolean;
  stemC: RGB;
  leafC: [RGB, RGB, RGB];
  leaf2C: RGB;
  petC?: RGB;
  cenC?: RGB;
  fruC?: [RGB, RGB];
};

type Def = Omit<Species, "k" | "stemC" | "leafC" | "leaf2C" | "petC" | "cenC" | "fruC"> & {
  stem: string;
  leaf?: [string, string, string];
  leaf2?: string;
  petal?: string;
  cen?: string;
  fru?: [string, string];
};

const DEFS: Record<string, Def> = {
  vetch: {
    leafStyle: "pinnate",
    stem: "#5C6A3A",
    leaf: ["#93A657", "#6E8040", "#B48A3A"],
    leaf2: "#9C4A2C",
    petal: "#B5A3D3",
    cen: "#E6D59C",
    fru: ["#6E8040", "#6A2F52"],
    trop: [0.28, -0.72],
    wander: 0.42,
    curl: 0.05,
    branch: 0.05,
    life: [40, 110],
    node: 4,
    lf: 2,
    flower: true,
  },
  campion: {
    leafStyle: "blade",
    stem: "#566238",
    leaf: ["#9DAA62", "#76874A", "#AE7A38"],
    leaf2: "#8F5A2A",
    petal: "#E8E0CF",
    cen: "#C8A44C",
    fru: ["#7A8A4A", "#B4542E"],
    trop: [0.2, -0.88],
    wander: 0.3,
    curl: 0,
    branch: 0.035,
    life: [30, 85],
    node: 5,
    lf: 3,
    flower: true,
  },
  trefoil: {
    leafStyle: "clover",
    stem: "#4D5832",
    leaf: ["#83944B", "#62743A", "#A65A30"],
    leaf2: "#C08A2E",
    petal: "#D8B248",
    cen: "#AD772C",
    fru: ["#62743A", "#3E2A1E"],
    trop: [0.42, -0.42],
    wander: 0.55,
    curl: -0.04,
    branch: 0.07,
    life: [25, 70],
    node: 3,
    lf: 2,
    flower: true,
  },
  fern: {
    stem: "#4B5A34",
    leaf: ["#7A9649", "#56703A", "#8E6A32"],
    leaf2: "#6E4A26",
    frond: true,
    trop: [0.3, -0.78],
    wander: 0.22,
    curl: 0.02,
    curlEnd: 0.5,
    branch: 0.018,
    life: [35, 90],
    node: 2,
    lf: 3,
    flower: false,
  },
  bracken: {
    stem: "#5A5A36",
    leaf: ["#86984F", "#64763E", "#A47A30"],
    leaf2: "#7E5226",
    frond: true,
    trop: [0.46, -0.5],
    wander: 0.32,
    curl: -0.03,
    curlEnd: -0.42,
    branch: 0.028,
    life: [30, 70],
    node: 2,
    lf: 2,
    flower: false,
  },
  hypha: {
    stem: "#B7AE98",
    thin: true,
    trop: [0.34, 0.04],
    wander: 0.75,
    curl: 0,
    branch: 0.12,
    life: [60, 210],
    node: 0,
    lf: 0,
    flower: false,
    avoid: false,
  },
};

const BLACK: RGB = [0, 0, 0];

export const SP: Record<string, Species> = Object.fromEntries(
  Object.entries(DEFS).map(([k, d]) => {
    const { stem, leaf, leaf2, petal, cen, fru, ...rest } = d;
    const s: Species = {
      ...rest,
      k,
      stemC: hx(stem),
      leafC: leaf ? [hx(leaf[0]), hx(leaf[1]), hx(leaf[2])] : [BLACK, BLACK, BLACK],
      leaf2C: leaf2 ? hx(leaf2) : BLACK,
      ...(petal && cen && fru
        ? { petC: hx(petal), cenC: hx(cen), fruC: [hx(fru[0]), hx(fru[1])] as [RGB, RGB] }
        : {}),
    };
    return [k, s];
  }),
);

export type BiomeDef = {
  sp: string[];
  bees: boolean;
  butterflies: boolean;
  beetles: number;
  /** Chance a dead plant grows a fungus. */
  deadFungi: number;
  moss: boolean;
  shrooms: boolean;
  springtails: boolean;
};

export const BIOME_DEFS: Record<string, BiomeDef> = {
  meadow: {
    sp: ["vetch", "campion", "trefoil"],
    bees: true,
    butterflies: true,
    beetles: 1,
    deadFungi: 0,
    moss: false,
    shrooms: false,
    springtails: false,
  },
  understory: {
    sp: ["fern", "bracken"],
    bees: false,
    butterflies: false,
    beetles: 3,
    deadFungi: 0.05,
    moss: true,
    shrooms: false,
    springtails: true,
  },
  mycelium: {
    sp: ["hypha"],
    bees: false,
    butterflies: false,
    beetles: 0,
    deadFungi: 0.08,
    moss: false,
    shrooms: true,
    springtails: true,
  },
};

export const C = {
  dry: [hx("#7A6648"), hx("#4E4335")] as [RGB, RGB],
  lit: [hx("#3A3024"), hx("#2C251C")] as [RGB, RGB],
  seed: hx("#7A5A34"),
  snow: hx("#DCD8CF"),
  moss: [hx("#5F7A3A"), hx("#4A6230"), hx("#78893E")],
  cap: [hx("#D9CDB2"), hx("#B07A44"), hx("#8C3E26"), hx("#C9A35A")],
  stalk: hx("#CFC4AA"),
  bee: hx("#D9A93A"),
  wing: hx("#ECE9E2"),
  beetle: hx("#8A3424"),
  moth: hx("#CDBFA6"),
  spring: hx("#9C978A"),
  spore: hx("#E3DCC8"),
  bud: hx("#7C8A48"),
  fresh: hx("#C4D67A"),
  /** Butterflies: a few kinds, wing and edge. */
  fly: [
    [hx("#E0C060"), hx("#5A4020")],
    [hx("#D8D4C8"), hx("#4A4A40")],
    [hx("#C87838"), hx("#3A2418")],
  ] as [RGB, RGB][],
};

/** Light, as multipliers: moonlight, and what glows at night in each biome. */
export const LIGHT = {
  moon: [0.13, 0.145, 0.19] as RGB,
  lamp: [1, 0.84, 0.6] as RGB,
  firefly: [1, 0.92, 0.38] as RGB,
  glowworm: [0.55, 1, 0.42] as RGB,
  foxfire: [0.42, 1, 0.5] as RGB,
  thread: [0.45, 0.86, 1] as RGB,
  pulse: [0.5, 0.95, 1] as RGB,
  cap: [0.55, 1, 0.58] as RGB,
};

/**
 * The year in 8 steps from early spring, interpolated: growth, bloom, pollinators, leaf
 * fall, snow, melt and leaf colour (0 fresh, 1 summer, 2 autumn).
 */
export const TAB = {
  grow: [0.9, 1, 1, 0.8, 0.5, 0.28, 0.06, 0.3],
  bloom: [0.3, 0.85, 1, 0.9, 0.6, 0.3, 0, 0.02],
  poll: [0.35, 0.75, 1, 1, 0.65, 0.3, 0, 0.05],
  fall: [0, 0, 0, 0, 0.004, 0.02, 0.035, 0.006],
  snow: [0, 0, 0, 0, 0, 0, 1, 0.5],
  melt: [0.07, 0.12, 0.25, 0.25, 0.05, 0, 0, 0],
  leaf: [0, 0.45, 1, 1, 1.45, 1.95, 2, 0.25],
};
export type SeasonKey = keyof typeof TAB;
