// Which paper gets which widget, by the paper's widget key (set in the control panel).

import type { MountWidget } from "./kit";

type Loader = () => Promise<{ default: MountWidget }>;

/** One module per paper, loaded only when its entry comes near the screen. */
export const WIDGETS: Record<string, Loader> = {
  temporal: () => import("./temporal"),
  sonar: () => import("./sonar"),
  kuramoto: () => import("./kuramoto"),
  simulators: () => import("./simulators"),
};

/** Widgets with a row of controls under the well (so the page can hold their place). */
export const WITH_BAR = new Set(["kuramoto"]);
