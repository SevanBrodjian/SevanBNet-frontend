// The paper's numbers, transcribed from "When Generative Models Act as Simulators"
// (arXiv 2610.12847v1). Each row is written as the paper prints it, left to right: strings
// exactly as printed (sign, decimals, the true minus −), † where the paper has a dagger.
// Nothing here is computed or read off a figure.

/** A printed number; `dag`: seed standard deviation above 0.1 (the paper's †). */
export type Cell = { v: string; dag?: true };

/** A printed number as a JS number ("−0.93" → -0.93, "+0.82" → 0.82). */
export const num = (s: string) => Number(s.replace("−", "-").replace("+", ""));

/** One printed row: numbers separated by spaces, a † after any that carries one. */
const cells = (line: string): Cell[] =>
  line
    .trim()
    .split(/\s+/)
    .map((t) => (t.endsWith("†") ? { v: t.slice(0, -1), dag: true } : { v: t }));

/** A variant: its name in the typewriter face, then a note in roman, as the paper sets it. */
export type Variant = { name: string; note?: string };

/* ---------- Table 2 (p. 8): editability ----------
   Each editor's highest Edit Index across residual points and step sizes among settings
   with Edit Fidelity ≥ 0, with the Edit Fidelity at that setting (the highest Fidelity
   where none reaches 0). Averaged over 1000 edit cases; one training run each. */

export type Editor = "pi" | "gs" | "im";
export type Pair = { index: Cell; fid: Cell };
export type EditRow = Variant & { unedited: Cell; pi: Pair; gs: Pair; im: Pair };
export type EditGroup = { id: string; label: string; sub?: string; rows: EditRow[] };

export const EDITORS: { id: Editor; short: string; name: string }[] = [
  { id: "pi", short: "PI", name: "pseudoinverse injection along a linear probe" },
  { id: "gs", short: "GS", name: "gradient steering on an MLP probe" },
  { id: "im", short: "IM", name: "the inverse map" },
];

/** Columns: Unedited Index | PI Index, Fid. | GS Index, Fid. | IM Index, Fid. */
function edit(name: string, note: string, line: string): EditRow {
  const [u, pi, pf, gi, gf, ii, imf] = cells(line);
  return {
    name,
    ...(note ? { note } : {}),
    unedited: u,
    pi: { index: pi, fid: pf },
    gs: { index: gi, fid: gf },
    im: { index: ii, fid: imf },
  };
}

// biome-ignore format: the rows stay as the paper prints them
export const TABLE2: EditGroup[] = [
  {
    id: "othello",
    label: "Othello",
    rows: [
      edit("standard",        "",          "−0.93   +0.82  0.70    +0.83  0.72    +0.81  0.62"),
      edit("adjacent-flip",   "",          "−0.96   +0.35† 0.17    −0.06  0.21    +0.66  0.49†"),
      edit("adjacent-noflip", "",          "−0.96   −0.23† 0.19    −0.96 −0.01    −0.03† 0.26"),
      edit("standard-noflip", "",          "−0.98   −0.95  0.00    −0.97 −0.01    −0.93 −0.01"),
    ],
  },
  {
    id: "ray-cont",
    label: "Rayworld",
    sub: "continuous",
    rows: [
      edit("standard",        "128 rays",  "−0.93   −0.10  0.04    −0.16  0.04    +0.59  0.66"),
      edit("blink",           "128 rays",  "−0.92   +0.02  0.01    −0.09  0.02    +0.51  0.55"),
      edit("128-ray",         "big discs", "−0.94   −0.02  0.02    −0.10  0.03    +0.57  0.68"),
      edit("16-ray",          "",          "−0.91   +0.16  0.04    −0.10  0.10    +0.66  0.71"),
      edit("8-ray",           "",          "−0.90   +0.21  0.00    −0.07  0.12    +0.71  0.73"),
      edit("5-ray",           "",          "−0.89   +0.14  0.15    −0.10  0.14    +0.81  0.77"),
    ],
  },
  {
    id: "ray-cat",
    label: "Rayworld",
    sub: "categorical",
    rows: [
      edit("128-ray",         "3736 bins", "−0.94   −0.31  0.02    +0.31  0.21    +0.64  0.71"),
      edit("16-ray",          "77 bins",   "−0.91   −0.06  0.04    +0.28  0.15    +0.82  0.71"),
      edit("8-ray",           "30 bins",   "−0.90   +0.38  0.05    +0.46  0.46    +0.87  0.73"),
      edit("5-ray",           "14 bins",   "−0.91   +0.51  0.30    +0.60  0.54    +0.91  0.75"),
    ],
  },
];

/* ---------- Table 10 (p. 21): by residual point ----------
   standard Othello and standard Rayworld. Probe Skill is the MLP probe's; Inverse R² is
   the held-out fit of g from simulator state to latent state at that point; IM Index and
   Fid. are the Edit Index and Edit Fidelity of the overwrite z* = g(s*) written there.
   Point k is the residual stream after block k; point 0 is the embedding. */

export type DepthRow = { skill: string; r2: string; index: string; fid: string };
export type Model = "othello" | "rayworld";

/** Columns: Probe Skill, Inverse R², IM Index, IM Fid. */
function depth(line: string): DepthRow {
  const [skill, r2, index, fid] = cells(line).map((c) => c.v);
  return { skill, r2, index, fid };
}

// biome-ignore format: the rows stay as the paper prints them
export const TABLE10: Record<Model, DepthRow[]> = {
  othello: [
    "0.346 0.393 −0.23 −1.07", // 0 (embedding)
    "0.810 0.682 −0.20 −0.99", // 1
    "0.879 0.769 −0.03 −0.64", // 2
    "0.927 0.796 +0.26 −0.14", // 3
    "0.952 0.818 +0.57  0.51", // 4
    "0.966 0.827 +0.81  0.62", // 5
    "0.974 0.753 +0.39 −0.21", // 6
    "0.975 0.728 +0.22 −1.03", // 7
    "0.976 0.884 +0.16 −2.08", // 8
  ].map(depth),
  rayworld: [
    "0.940 0.741 −0.23  0.25", // 0 (embedding)
    "0.965 0.340 +0.06  0.43", // 1
    "0.968 0.310 +0.29  0.54", // 2
    "0.969 0.284 +0.44  0.61", // 3
    "0.970 0.298 +0.54  0.67", // 4
    "0.971 0.343 +0.57  0.66", // 5
    "0.972 0.339 +0.59  0.66", // 6
    "0.972 0.342 +0.58  0.64", // 7
    "0.973 0.344 +0.55  0.60", // 8
  ].map(depth),
};

export const MODELS: { id: Model; label: string }[] = [
  { id: "othello", label: "Othello" },
  { id: "rayworld", label: "Rayworld" },
];

/** Residual points 0 (the embedding) to 8. */
export const POINTS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

/** Where IM lands on standard Othello (Edit Fidelity ≥ 0): the bottleneck (A.7). */
export const BOTTLENECK = [4, 5];

/* ---------- Table 1 (p. 8): decodability ----------
   Probe Skill at the trained model's best residual point, with random-initialization and
   observation baselines fit with the same probes on the same sequences. The inverse map
   columns give its R² in predicting latent state from simulator state, at its best
   residual point and at the point where it edits best. Rayworld here is continuous. */

type LinMlp = { lin: string; mlp: string };
export type DecodeRow = Variant & {
  group: Model;
  obs: LinMlp;
  rand: LinMlp;
  trained: LinMlp;
  inverse: { best: string; edit: string };
};

/** Columns: Observation Lin., MLP | Random init Lin., MLP | Trained Lin., MLP |
    Inverse Map MLP Best Point, Edit Point. */
function decode(group: Model, name: string, note: string, line: string): DecodeRow {
  const [ol, om, rl, rm, tl, tm, ib, ie] = cells(line).map((c) => c.v);
  return {
    group,
    name,
    ...(note ? { note } : {}),
    obs: { lin: ol, mlp: om },
    rand: { lin: rl, mlp: rm },
    trained: { lin: tl, mlp: tm },
    inverse: { best: ib, edit: ie },
  };
}

// biome-ignore format: the rows stay as the paper prints them
export const TABLE1: DecodeRow[] = [
  decode("othello",  "standard",        "",          "0.792 0.809  0.577 0.583  0.975 0.976  0.884 0.827"),
  decode("othello",  "adjacent-flip",   "",          "0.888 0.914  0.674 0.700  0.947 0.970  0.968 0.959"),
  decode("othello",  "adjacent-noflip", "",          "0.988 0.983  0.581 0.588  0.988 0.990  0.978 0.855"),
  decode("othello",  "standard-noflip", "",          "1.000 1.000  1.000 1.000  1.000 1.000  0.947 0.855"),
  decode("rayworld", "standard",        "128 rays",  "0.305 0.885  0.738 0.945  0.872 0.973  0.741 0.339"),
  decode("rayworld", "blink",           "128 rays",  "0.216 0.809  0.608 0.870  0.907 0.979  0.613 0.338"),
  decode("rayworld", "128-ray",         "big discs", "0.377 0.919  0.859 0.970  0.914 0.981  0.652 0.321"),
  decode("rayworld", "16-ray",          "",          "0.360 0.907  0.890 0.949  0.892 0.965  0.554 0.516"),
  decode("rayworld", "8-ray",           "",          "0.329 0.877  0.883 0.919  0.886 0.932  0.585 0.580"),
  decode("rayworld", "5-ray",           "",          "0.277 0.829  0.855 0.871  0.850 0.883  0.617 0.469"),
];

/** Table 1's trained MLP probe skill per variant (the paper's "at least 0.88"). */
export const MLP_SKILL = TABLE1.map(({ group, name, note, trained }) => ({
  group,
  name,
  note,
  skill: trained.mlp,
}));
