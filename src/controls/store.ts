// The controls: one flat set of settings, persisted on this device.
//
// Each change is written to <html> as CSS custom properties (--k-<id>) and classes
// (k-<thing>), so styles react without React re-rendering the page; ./fx does the parts
// CSS cannot. The four views are presets of the core settings (./schema). Page areas add
// their own settings with registerGroup(); those get --k-<group>-<name> properties (numbers)
// or data-k-<group>-<name> attributes (choices) on <html>, and reset with everything else.

import { useSyncExternalStore } from "react";
import {
  blend,
  DEFAULTS,
  type Fmt,
  NAMES,
  ORDER,
  PRESETS,
  SPEC,
  type Spec,
  type Value,
  type Values,
  type View,
  valid,
  wrapPos,
} from "./schema";

export type { Value, Values, View } from "./schema";

const KEY = "controls.v1";
const browser = typeof window !== "undefined";
const root = () => document.documentElement;

// ---------------------------------------------------------------------------------
// Registered settings (page areas)

/** A setting a page area adds. `id` is local to the group; the full key is `group.id`. */
export type ControlDef = Spec & { id: string; label: string; fmt?: Fmt };
export type ControlGroup = { id: string; title: string; controls: ControlDef[] };

const extra: Record<string, Spec> = {};
const groups = new Map<string, ControlGroup>();
const specOf = (k: string): Spec | undefined => SPEC[k] ?? extra[k];

// ---------------------------------------------------------------------------------
// State

const values: Values = { ...DEFAULTS };
let pos: number | null = 0;
let seed = 1;
/** Saved values for settings whose group has not registered yet on this page load. */
let pending: Values = {};

type Saved = { v?: Values; pos?: unknown; seed?: unknown };

function load() {
  const q = new URLSearchParams(location.search);
  let saved: Saved | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    saved = null;
  }
  if (q.has("reset") || !saved || typeof saved !== "object" || !saved.v) return;
  for (const [k, v] of Object.entries(saved.v)) {
    const x = valid(specOf(k), v);
    if (x !== undefined) values[k] = x;
    else if (k.includes(".")) pending[k] = v;
  }
  pos = typeof saved.pos === "number" && Number.isFinite(saved.pos) ? wrapPos(saved.pos) : null;
  seed = Number(saved.seed) >>> 0 || 1;
}

function fromQuery() {
  const q = new URLSearchParams(location.search);
  const i = ORDER.indexOf(q.get("view") as View);
  if (i >= 0) {
    Object.assign(values, PRESETS[ORDER[i]]);
    pos = i;
  }
}

// ---------------------------------------------------------------------------------
// Writing the state to <html>

const UNITS: Record<string, string> = {
  wire: "",
  tags: "",
  xray: "",
  grid: "",
  media: "",
  grain: "",
  web: "",
  scan: "",
  bevel: "",
  radius: "px",
  vign: "",
  hair: "px",
  wdth: "",
  wght: "",
  track: "em",
  lead: "",
  misreg: "",
  zfight: "",
  drift: "",
  steps: "",
  horizon: "deg",
  hue: "deg",
  sat: "",
  contrast: "",
  defocus: "px",
  ground: "",
  temp: "",
  ink: "",
  phos: "",
  acc: "",
};

const num = (k: string) => Number(values[k]);
const cssName = (k: string) => k.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

function apply() {
  const html = root();
  const cl = html.classList;
  const st = html.style;
  for (const [k, unit] of Object.entries(UNITS)) {
    const v = k === "steps" ? Math.round(num(k)) : +num(k).toFixed(4);
    st.setProperty(`--k-${k}`, `${v}${unit}`);
  }
  st.setProperty("--k-invert", values.invert ? "1" : "0");
  const on = (c: string, b: unknown) => cl.toggle(c, !!b);
  on("k-wire", num("wire") > 0.001);
  on("k-xray", num("xray") > 0.001);
  on("k-grid", num("grid") > 0.001);
  on("k-media", num("media") < 0.999);
  on("k-rulers", values.rulers);
  on("k-hud", values.hud);
  on("k-inspect", values.inspect);
  on("k-grain", num("grain") > 0.001);
  on("k-web", num("web") > 0.001);
  on("k-scan", num("scan") > 0.001);
  on("k-bevel", num("bevel") > 0.001);
  on("k-radius", num("radius") > 0.5);
  on("k-vign", num("vign") > 0.001);
  on("k-hair", num("hair") > 1.01);
  on("k-wdth", Math.abs(num("wdth") - 100) > 0.5);
  on("k-track", Math.abs(num("track")) > 0.0005);
  on("k-lead", Math.abs(num("lead") - 1) > 0.005);
  on("k-wght", Math.abs(num("wght")) > 1);
  for (const o of ["serif", "mono", "system"]) on(`k-face-${o}`, values.face === o);
  for (const o of ["upper", "lower"]) on(`k-case-${o}`, values.case === o);
  for (const o of ["none", "name", "heads", "all"]) on(`k-br-${o}`, values.braces === o);
  for (const o of ["cross", "reticle", "cell"]) on(`k-cur-${o}`, values.cursor === o);
  on("k-mis", num("misreg") > 0.001);
  on("k-zf", num("zfight") > 0.001);
  on("k-drift", num("drift") > 0.001);
  on("k-steps", num("steps") >= 1);
  const hue = num("hue");
  on(
    "k-filter",
    (Math.abs(hue) > 0.5 && Math.abs(hue - 360) > 0.5) ||
      Math.abs(num("sat") - 1) > 0.005 ||
      Math.abs(num("contrast") - 1) > 0.005 ||
      values.invert ||
      num("defocus") > 0.01,
  );
  on("k-hor", Math.abs(num("horizon")) > 0.01);
  on("k-parity", values.parity);
  on("k-react", reactive());
  on("k-faults", faulty());
  on("k-ink", num("ink") > 0.001);
  for (const k of Object.keys(extra)) {
    const v = values[k];
    if (typeof v === "number") st.setProperty(`--k-${cssName(k)}`, String(v));
    else html.setAttribute(`data-k-${cssName(k)}`, v);
  }
  html.dataset.view = match() ?? "custom";
}

export const faulty = () =>
  ["misreg", "zfight", "drift", "fallback", "stuck", "overflow", "tear"].some(
    (k) => num(k) > 0.001,
  );
export const reactive = () =>
  ["field", "magnet", "inertia", "gravity", "tilt", "shock"].some((k) => num(k) > 0.001);

// ---------------------------------------------------------------------------------
// Persistence and change events

const same = (a: Value | undefined, b: Value | undefined) =>
  typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-6 : a === b;

const defaultOf = (k: string) => specOf(k)?.d;

export function isDefault() {
  for (const k of Object.keys(values)) if (!same(values[k], defaultOf(k))) return false;
  return true;
}

let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      if (isDefault() && seed === 1 && !Object.keys(pending).length) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, JSON.stringify({ v: { ...pending, ...values }, pos, seed }));
    } catch {
      // Private mode or full storage: settings still work for this visit.
    }
  }, 120);
}

export type How = "set" | "panel" | "pos" | "preset" | "reset" | "seed" | "register";
type Listener = (keys: string[], how: How) => void;
const listeners = new Set<Listener>();
let version = 0;

function emit(keys: string[], how: How) {
  version++;
  apply();
  save();
  for (const f of listeners) {
    try {
      f(keys, how);
    } catch (error) {
      console.error(error);
    }
  }
}

/** Called after every change with the keys that changed. Returns an unsubscribe. */
export function subscribe(f: Listener) {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

// ---------------------------------------------------------------------------------
// Reading and writing

export const get = (k: string): Value | undefined => values[k];
export const getNumber = (k: string) => Number(values[k] ?? 0);
export const currentPos = () => pos;
export const currentSeed = () => seed;

export function set(k: string, v: unknown, how: How = "set") {
  const x = valid(specOf(k), v);
  if (x === undefined) return;
  values[k] = x;
  if (SPEC[k]) pos = null;
  emit([k], how);
}

/** Move along the loop of views; between two views everything blends. */
export function setPos(p: number, how: How = "pos") {
  pos = wrapPos(p);
  Object.assign(values, blend(pos));
  emit(Object.keys(SPEC), how);
}

export function preset(view: View) {
  const i = ORDER.indexOf(view);
  if (i >= 0) setPos(i, "preset");
}

/** The view after the current one around the loop (Comfort after a custom state). */
export function nextView(): View {
  const m = match();
  if (m) return ORDER[(ORDER.indexOf(m) + 1) % 4];
  if (pos !== null) return ORDER[(Math.floor(pos) + 1) % 4];
  return "comfort";
}

const resetHooks = new Set<() => void>();
/** Run when everything is reset, e.g. to clear a page area's own saved state. */
export function onReset(f: () => void) {
  resetHooks.add(f);
  return () => {
    resetHooks.delete(f);
  };
}

export function reset() {
  for (const k of Object.keys(values)) {
    const d = defaultOf(k);
    if (d !== undefined) values[k] = d;
  }
  pending = {};
  pos = 0;
  seed = 1;
  emit(Object.keys(values), "reset");
  for (const f of resetHooks) {
    try {
      f();
    } catch (error) {
      console.error(error);
    }
  }
}

export function reroll() {
  seed = (Math.imul(seed, 48271) % 2147483647) >>> 0 || 7;
  emit(["seed"], "seed");
}

/** The view the current settings are exactly, or null when they are custom. */
export function match(): View | null {
  if (pos !== null) {
    const r = Math.round(pos);
    return Math.abs(pos - r) < 1e-3 ? ORDER[r % 4] : null;
  }
  for (const v of ORDER) {
    if (Object.keys(SPEC).every((k) => same(values[k], PRESETS[v][k]))) return v;
  }
  return null;
}

export function label() {
  const m = match();
  if (m) return NAMES[m];
  if (pos !== null) {
    const i = Math.floor(pos) % 4;
    const t = pos - Math.floor(pos);
    return `${NAMES[ORDER[i]]} → ${NAMES[ORDER[(i + 1) % 4]]} ${Math.round(t * 100)}%`;
  }
  return "Custom";
}

export const isDirty = (k: string) => !same(values[k], defaultOf(k));

// ---------------------------------------------------------------------------------
// Registration

const groupListeners = new Set<() => void>();
let groupVersion = 0;

/**
 * Add a group of settings to the controls panel. Keys are `${group.id}.${control.id}`.
 * Saved values come back on registration. Returns a function that removes the group
 * from the panel (its values stay, so they survive navigating away and back).
 */
export function registerGroup(group: ControlGroup) {
  const added: string[] = [];
  for (const c of group.controls) {
    const key = `${group.id}.${c.id}`;
    const { id: _id, label: _label, fmt: _fmt, ...spec } = c;
    extra[key] = spec as Spec;
    if (!(key in values)) {
      const saved = valid(extra[key], pending[key] ?? spec.d);
      values[key] = saved ?? spec.d;
      delete pending[key];
      added.push(key);
    }
  }
  groups.set(group.id, group);
  groupVersion++;
  for (const f of groupListeners) f();
  if (added.length && browser) emit(added, "register");
  return () => {
    if (groups.get(group.id) !== group) return;
    groups.delete(group.id);
    groupVersion++;
    for (const f of groupListeners) f();
  };
}

export const registeredGroups = () => [...groups.values()];
export const specFor = specOf;

// ---------------------------------------------------------------------------------
// The panel's open state. It has no visible entry point (see ./ViewToggle); ?controls
// in the URL also opens it.

let panelOpen = false;
let returnFocus: HTMLElement | null = null;
const panelListeners = new Set<() => void>();

export function openPanel(from?: HTMLElement | null) {
  if (panelOpen) return;
  returnFocus = from ?? (document.activeElement as HTMLElement | null);
  panelOpen = true;
  for (const f of panelListeners) f();
}

export function closePanel() {
  if (!panelOpen) return;
  panelOpen = false;
  for (const f of panelListeners) f();
  const el = returnFocus;
  returnFocus = null;
  if (el && document.contains(el)) el.focus({ preventScroll: true });
}

export const isPanelOpen = () => panelOpen;

// ---------------------------------------------------------------------------------
// React

const sub = (set: Set<() => void>) => (f: () => void) => {
  set.add(f);
  return () => {
    set.delete(f);
  };
};
const anyChange = (f: () => void) => subscribe(() => f());
const groupChange = sub(groupListeners);
const panelChange = sub(panelListeners);

/** Re-render on every settings change; returns a counter. */
export const useControlsVersion = () => useSyncExternalStore(anyChange, () => version);

/** One setting's value. */
export const useControl = (k: string) => useSyncExternalStore(anyChange, () => values[k]);

export const useGroups = () => {
  useSyncExternalStore(groupChange, () => groupVersion);
  return registeredGroups();
};

export const usePanelOpen = () => useSyncExternalStore(panelChange, () => panelOpen);

// ---------------------------------------------------------------------------------

if (browser) {
  load();
  fromQuery();
  apply();
  if (new URLSearchParams(location.search).has("controls")) queueMicrotask(() => openPanel());
}
