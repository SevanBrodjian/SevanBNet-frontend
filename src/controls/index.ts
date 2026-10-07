// What page areas use from the controls. See docs/FRAME.md.
//
//   import { registerGroup, useControl, set } from "../controls";
//
//   const WRITING = {
//     id: "writing",
//     title: "Writing",
//     controls: [
//       { id: "biome", label: "Biome", k: "s", d: "auto", o: ["auto", "meadow", "understory", "mycelium"] },
//       { id: "tempo", label: "Growth", k: "n", d: 1, min: 0.25, max: 4, st: 0.05, fmt: "x" },
//     ],
//   } satisfies ControlGroup;
//   registerGroup(WRITING);                   // in the panel on every page, or
//   useControlGroup(WRITING);                 // only while a component is mounted
//   const biome = useControl("writing.biome"); // re-renders when it changes
//   set("writing.biome", "meadow");           // e.g. from a small on-page toggle
//   onReset(() => ...);                       // clear anything else the area keeps

export type { Fmt, Spec, View } from "./schema";
export { NAMES, ORDER } from "./schema";
export type { ControlDef, ControlGroup, How, Value } from "./store";
export {
  get,
  getNumber,
  isDefault,
  label,
  match,
  onReset,
  openPanel,
  preset,
  registerGroup,
  reset,
  set,
  subscribe,
  useControl,
  useControlGroup,
  useControlsVersion,
} from "./store";
