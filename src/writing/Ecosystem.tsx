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
  const start = useRef({ biome, dark });
  start.current = { biome, dark };

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const e = createEco({
      host: el,
      column: () => el.querySelector(column),
      night: start.current.dark,
      biome: start.current.biome,
      phase,
      cycle,
      tempo,
    });
    eco.current = e;
    if (import.meta.env.DEV) (window as unknown as { eco?: Eco }).eco = e;
    return () => {
      e.dispose();
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
