// The margins' settings. Visitors never see a panel for them: the season follows today's
// date, and the biome is drawn at random and kept for some days, so most people meet only
// one. Everything is in the hidden controls (group "writing"); the end of each essay has a
// small biome toggle.

import { useSyncExternalStore } from "react";
import { type ControlGroup, get, registerGroup, set, subscribe } from "../controls";

export const BIOMES = ["meadow", "understory", "mycelium"] as const;
export type Biome = (typeof BIOMES)[number];
export const BIOME_NAMES: Record<Biome, string> = {
  meadow: "Meadow",
  understory: "Understory",
  mycelium: "Mycelium",
};

export const WRITING: ControlGroup = {
  id: "writing",
  title: "Writing",
  controls: [
    { id: "biome", label: "Biome", k: "s", d: "auto", o: ["auto", ...BIOMES] },
    {
      id: "season",
      label: "Season",
      k: "s",
      d: "today",
      o: ["today", "spring", "summer", "autumn", "winter", "cycle"],
    },
    { id: "light", label: "Light", k: "s", d: "auto", o: ["auto", "day", "night"] },
    { id: "tempo", label: "Growth", k: "n", d: 1, min: 0.25, max: 4, st: 0.05, fmt: "x" },
  ],
};

registerGroup(WRITING);

// ---------------------------------------------------------------------------------
// The biome roll: one biome per visitor for 4 to 9 days, then a different one.

const KEY = "writing.biome.v1";
const DAY = 864e5;
type Roll = { b: Biome; until: number };
const isBiome = (v: unknown): v is Biome => BIOMES.includes(v as Biome);

let roll: Roll | null = null;
const rollListeners = new Set<() => void>();

function save(r: Roll, notify = true) {
  roll = r;
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    // Private mode: the roll lasts this visit.
  }
  if (notify) for (const f of rollListeners) f();
}

function rolled(): Biome {
  if (roll && roll.until > Date.now()) return roll.b;
  let saved: Partial<Roll> | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    saved = null;
  }
  if (saved && isBiome(saved.b) && Number(saved.until) > Date.now()) {
    roll = { b: saved.b, until: Number(saved.until) };
    return roll.b;
  }
  const last = saved && isBiome(saved.b) ? saved.b : null;
  const pool = BIOMES.filter((b) => b !== last);
  const b = pool[Math.floor(Math.random() * pool.length)];
  // Read while rendering: store it without telling anyone (nothing has changed for them).
  save({ b, until: Date.now() + (4 + Math.random() * 5) * DAY }, false);
  return b;
}

/** The biome in the margins: the controls' choice, or this visitor's roll. */
export function currentBiome(): Biome {
  const v = get("writing.biome");
  return isBiome(v) ? v : rolled();
}

/** The next biome, from the toggle at the end of an essay. */
export function cycleBiome() {
  const next = BIOMES[(BIOMES.indexOf(currentBiome()) + 1) % BIOMES.length];
  if (isBiome(get("writing.biome"))) set("writing.biome", next);
  else save({ b: next, until: Date.now() + (4 + Math.random() * 5) * DAY });
}

const subscribeBiome = (f: () => void) => {
  rollListeners.add(f);
  const off = subscribe((keys) => {
    if (keys.includes("writing.biome")) f();
  });
  return () => {
    rollListeners.delete(f);
    off();
  };
};

export const useBiome = () =>
  useSyncExternalStore<Biome>(subscribeBiome, currentBiome, () => "meadow");

// ---------------------------------------------------------------------------------
// Seasons: a year of 4, starting at the beginning of spring (0) through winter (3..4).

// Time zones south of the equator get the other half of the year.
const SOUTH =
  /^(Australia\/|Antarctica\/|Pacific\/(Auckland|Chatham|Fiji|Tongatapu|Noumea)|America\/(Argentina|Santiago|Montevideo|Asuncion|Sao_Paulo|Punta_Arenas)|Africa\/(Johannesburg|Maputo|Windhoek|Harare|Lusaka|Gaborone|Maseru|Mbabane)|Indian\/(Mauritius|Reunion))/;

function hemisphereShift() {
  try {
    return SOUTH.test(Intl.DateTimeFormat().resolvedOptions().timeZone) ? 2 : 0;
  } catch {
    return 0;
  }
}

/** Where today falls in the year, 0..4 (0 = start of spring, March 1). */
export function todayPhase(d = new Date()) {
  const months = (d.getMonth() - 2 + 12) % 12;
  return (months / 3 + (d.getDate() - 1) / 31 / 3 + hemisphereShift()) % 4;
}

export const FIXED_PHASE: Record<string, number> = {
  spring: 0.45,
  summer: 1.45,
  autumn: 2.45,
  winter: 3.45,
};
