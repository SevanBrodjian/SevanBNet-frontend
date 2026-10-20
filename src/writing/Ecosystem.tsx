import { useEffect, useLayoutEffect, useRef } from "react";
import { get, getNumber, useControl } from "../controls";
import { createEco, type Eco } from "./eco/engine";
import { FIXED_PHASE, todayPhase, useBiome } from "./settings";

const phase = () => {
  const s = String(get("writing.season") ?? "today");
  return FIXED_PHASE[s] ?? todayPhase();
};
const cycle = () => get("writing.season") === "cycle";
const tempo = () => getNumber("writing.tempo") || 1;

// ---------------------------------------------------------------------------------
// One garden for the whole visit. The list and every essay show the same one (by day on
// the list, by night in an essay), it keeps its growth while the reader is elsewhere on
// the site and across a reload, and it starts again from sprouts once they have been
// away for a while.

const KEY = "writing.garden.v1";
/** Away longer than this (tab hidden, or closed), and the garden starts over. */
const AWAY = 30 * 60e3;
type Saved = { seen: number; grown: number };

let eco: Eco | null = null;
let hiddenAt = 0;

function saved(): Saved | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Saved> | null;
    return s && typeof s.seen === "number" && typeof s.grown === "number" ? (s as Saved) : null;
  } catch {
    return null;
  }
}

function remember() {
  if (!eco) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ seen: Date.now(), grown: eco.grown() }));
  } catch {
    // Private mode: the garden lasts this visit.
  }
}

function garden(biome: string): Eco {
  if (eco) return eco;
  const s = saved();
  const resume = s && Date.now() - s.seen < AWAY ? s.grown : 0;
  eco = createEco({
    biome,
    phase,
    cycle,
    tempo,
    resume,
    overgrowth: () => getNumber("overgrowth"),
    frenzy: () => getNumber("frenzy"),
  });
  if (import.meta.env.DEV) (window as unknown as { eco?: Eco }).eco = eco;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      remember();
    } else if (hiddenAt && Date.now() - hiddenAt > AWAY) eco?.reset();
  });
  addEventListener("pagehide", remember);
  window.setInterval(() => {
    if (!document.hidden) remember();
  }, 20e3);
  return eco;
}

/** Day and night change over the garden's dusk; the room's ground follows it. The site
 *  turns CSS transitions off everywhere (frame.css), so the root opts in for the while. */
let duskTimer = 0;
function dusk() {
  const html = document.documentElement;
  html.classList.add("dusk");
  html.setAttribute("data-motion", "");
  clearTimeout(duskTimer);
  duskTimer = window.setTimeout(() => {
    html.classList.remove("dusk");
    html.removeAttribute("data-motion");
  }, 2600);
}

/** Phones held upright: the margins are too narrow for a garden worth having. */
const UPRIGHT_PHONE = "(max-width: 760px)";
let lastDark: boolean | null = null;

/**
 * The garden in the margins of the element this sits in (the page's room), on either side
 * of the element matching `column`. `night` for essays; the controls' Light setting can
 * override it.
 */
export default function Ecosystem({ column, night }: { column: string; night: boolean }) {
  const mark = useRef<HTMLElement>(null);
  const biome = useBiome();
  const season = useControl("writing.season");
  const light = useControl("writing.light");
  const dark = light === "night" ? true : light === "day" ? false : night;

  // Before paint, and before Layout changes the room's colours: the garden moves into
  // this page in the same frame the last one leaves, so it never blinks out. (The room is
  // found from a mark inside it: a parent's ref is not set yet when this runs.)
  // biome-ignore lint/correctness/useExhaustiveDependencies: biome and night are applied by the effects below; this only moves the garden
  useLayoutEffect(() => {
    const el = mark.current?.parentElement;
    if (!el || matchMedia(UPRIGHT_PHONE).matches) return;
    if (lastDark !== null && lastDark !== dark) dusk();
    lastDark = dark;
    const g = garden(biome);
    g.attach(el, () => el.querySelector(column), dark);
    return () => {
      remember();
      g.detach(el);
    };
  }, [column]);

  useEffect(() => {
    eco?.setBiome(biome);
  }, [biome]);
  useEffect(() => {
    if (lastDark !== null && lastDark !== dark) dusk();
    lastDark = dark;
    eco?.setNight(dark);
  }, [dark]);
  useEffect(() => {
    if (season !== undefined) eco?.seasonChanged();
  }, [season]);

  return <i ref={mark} hidden />;
}
