import { type RefObject, useEffect, useRef } from "react";
import { get, getNumber, useControl } from "../controls";
import { createEco, type Eco } from "./eco/engine";
import { FIXED_PHASE, todayPhase, useBiome } from "./settings";

const phase = () => {
  const s = String(get("writing.season") ?? "today");
  return FIXED_PHASE[s] ?? todayPhase();
};
const cycle = () => get("writing.season") === "cycle";
const tempo = () => getNumber("writing.tempo") || 1;

/**
 * The ecosystem in the margins of `host`, on either side of the element matching
 * `column`. `night` for essays; the controls' Light setting can override it.
 */
export default function Ecosystem({
  host,
  column,
  night,
}: {
  host: RefObject<HTMLElement | null>;
  column: string;
  night: boolean;
}) {
  const biome = useBiome();
  const season = useControl("writing.season");
  const light = useControl("writing.light");
  const dark = light === "night" ? true : light === "day" ? false : night;
  const eco = useRef<Eco | null>(null);
  const begin = useRef({ biome, dark });
  begin.current = { biome, dark };

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let e: Eco | null = null;
    // After the page has painted: the text first, then the garden.
    const start = () => {
      e = createEco({
        host: el,
        column: () => el.querySelector(column),
        night: begin.current.dark,
        biome: begin.current.biome,
        phase,
        cycle,
        tempo,
      });
      eco.current = e;
      if (import.meta.env.DEV) (window as unknown as { eco?: Eco }).eco = e;
    };
    const idle = "requestIdleCallback" in window;
    const id = idle ? requestIdleCallback(start, { timeout: 500 }) : window.setTimeout(start, 60);
    return () => {
      if (idle) cancelIdleCallback(id);
      else clearTimeout(id);
      e?.dispose();
      eco.current = null;
    };
  }, [host, column]);

  useEffect(() => {
    eco.current?.setBiome(biome);
  }, [biome]);
  useEffect(() => {
    eco.current?.setNight(dark);
  }, [dark]);
  useEffect(() => {
    if (season !== undefined) eco.current?.seasonChanged();
  }, [season]);

  return null;
}
