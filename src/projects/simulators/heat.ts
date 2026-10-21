// The tables' colour scale, as in the paper: a diverging red / neutral / green gradient,
// per metric, continuous and linear. Measured from the paper's rendered tables (pp. 8, 21):
// each metric runs from full red at `lo` through neutral at the midpoint to full green at
// `hi`, and clamps beyond. Fidelity's neutral is 0.375, not 0, so a Fid. near 0 reads red.
//
// On this dark page the poles are translucent tints of --gs-bad and --gs-good over the
// ground, mixed toward a faint neutral (--hb, --hg, --hm in results.css).

import type { CSSProperties } from "react";
import { num } from "./data";

export type Scale = "index" | "fid" | "skill";

export const RANGE: Record<Scale, [lo: number, hi: number]> = {
  index: [-1, 1], // Edit Index: −1 matches the unedited observation, +1 the edited one
  fid: [-0.25, 1], // Edit Fidelity: 0 is no better than no edit
  skill: [0, 1], // Probe Skill and R²
};

/** Where a value sits on its scale: −1 full red, 0 neutral, +1 full green. */
export function tone(value: string | number, scale: Scale): number {
  const v = typeof value === "number" ? value : num(value);
  const [lo, hi] = RANGE[scale];
  const t = (2 * (v - lo)) / (hi - lo) - 1;
  return t < -1 ? -1 : t > 1 ? 1 : t;
}

/** A cell's background on the paper's scale. */
export function heat(value: string | number, scale: Scale): CSSProperties {
  const t = tone(value, scale);
  const pct = Math.round(Math.abs(t) * 1000) / 10;
  return {
    backgroundColor: `color-mix(in oklab, var(${t < 0 ? "--hb" : "--hg"}) ${pct}%, var(--hm))`,
  };
}
