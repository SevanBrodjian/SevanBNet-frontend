// Which paper gets which widget, and the arXiv id every paper is keyed by.

import type { Publication } from "../types";
import type { MountWidget } from "./kit";
import { OVERRIDES } from "./overrides";

type Loader = () => Promise<{ default: MountWidget }>;

/** One module per paper, loaded only when its entry comes near the screen. */
export const WIDGETS: Record<string, Loader> = {
  "2608.27929": () => import("./temporal"),
  "2605.24195": () => import("./sonar"),
  "2509.15328": () => import("./kuramoto"),
};

/** Widgets with a row of controls under the well (so the page can hold their place). */
export const WITH_BAR = new Set(["2509.15328"]);

/** The arXiv id from a paper's URL or DOI (2608.27929), if it has one. */
export function arxivId(p: Publication) {
  const m = `${p.url ?? ""} ${p.doi ?? ""}`.match(/arxiv[^0-9]*(\d{4}\.\d{4,5})/i);
  return m ? m[1] : null;
}

/** The API's paper with anything from the overrides file applied. */
export function withOverrides(p: Publication) {
  const id = arxivId(p);
  const o = (id && OVERRIDES[id]) || {};
  const citation = (o.citation ?? p.citation ?? "").replace(/\r\n?/g, "\n").trim();
  return { ...p, arxiv: id, citation, code: o.code ?? null };
}

export type Paper = ReturnType<typeof withOverrides>;
