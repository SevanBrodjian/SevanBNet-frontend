// The cockpit: every setting a visitor can change, and the named views built from them.
//
// Each setting is written to <html> as a CSS custom property (--ck-<id>) so styles and
// canvases can react to it without React re-rendering the page. A view (Comfort,
// Wireframe, Broken, Reactive) is just a preset of these values: anything a view does,
// a visitor could reach by setting the controls by hand. Values persist across visits;
// reset() always returns to Comfort.

import { useSyncExternalStore } from "react";

export type Setting = {
  id: string;
  label: string;
  min: number;
  max: number;
  default: number;
  /** Values the control snaps to; it still moves continuously between them. */
  detents?: number[];
};

// The axes that define the four views. The full cockpit adds more settings here.
export const SETTINGS: Setting[] = [
  { id: "structure", label: "Structure", min: 0, max: 1, default: 0, detents: [0, 1] },
  { id: "fault", label: "Fault", min: 0, max: 1, default: 0, detents: [0, 1] },
  { id: "response", label: "Response", min: 0, max: 1, default: 0, detents: [0, 1] },
];

export type Values = Record<string, number>;

const DEFAULTS: Values = Object.fromEntries(SETTINGS.map((s) => [s.id, s.default]));

export const VIEWS: Record<string, { label: string; values: Values }> = {
  comfort: { label: "Comfort", values: DEFAULTS },
  wireframe: { label: "Wireframe", values: { ...DEFAULTS, structure: 1 } },
  broken: { label: "Broken", values: { ...DEFAULTS, fault: 1 } },
  reactive: { label: "Reactive", values: { ...DEFAULTS, response: 1 } },
};

const STORAGE_KEY = "cockpit.v1";
const byId = Object.fromEntries(SETTINGS.map((s) => [s.id, s]));
const clamp = (s: Setting, v: number) => Math.min(s.max, Math.max(s.min, v));

function load(): Values {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Values;
    const values = { ...DEFAULTS };
    for (const [id, v] of Object.entries(saved)) {
      if (byId[id] && Number.isFinite(v)) values[id] = clamp(byId[id], v);
    }
    return values;
  } catch {
    return { ...DEFAULTS };
  }
}

let values: Values = typeof window === "undefined" ? { ...DEFAULTS } : load();
const listeners = new Set<() => void>();

/** The named view the current values match exactly, or "custom". */
export function currentView(v: Values = values): string {
  const match = Object.entries(VIEWS).find(([, view]) =>
    SETTINGS.every((s) => Math.abs((view.values[s.id] ?? s.default) - v[s.id]) < 1e-6),
  );
  return match ? match[0] : "custom";
}

function apply() {
  const root = document.documentElement;
  for (const s of SETTINGS) root.style.setProperty(`--ck-${s.id}`, String(values[s.id]));
  root.dataset.view = currentView();
}

function commit(next: Values) {
  values = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Private mode or full storage: settings still work for this visit.
  }
  apply();
  for (const l of listeners) l();
}

export const setValue = (id: string, v: number) =>
  byId[id] && commit({ ...values, [id]: clamp(byId[id], v) });
export const setView = (name: string) => VIEWS[name] && commit({ ...VIEWS[name].values });
export const reset = () => commit({ ...DEFAULTS });

export function useCockpit(): Values {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => values,
  );
}

if (typeof window !== "undefined") apply();
