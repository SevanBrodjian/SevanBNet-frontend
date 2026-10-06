import { FLAGSHIPS } from "./projects/meta";
import type { Publication } from "./types";

// API dates are calendar dates; pin to UTC so nobody sees them a day early.
export const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

export const monthYear = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "long" })
    : null;

// Where a publication lives on this site, if anywhere. Old paths map to their new home.
const LEGACY = Object.fromEntries(
  FLAGSHIPS.filter((p) => p.legacyPath).map((p) => [p.legacyPath, `/projects/${p.slug}`]),
);
export const onSitePath = (p: Publication) =>
  p.site_path ? (LEGACY[p.site_path] ?? p.site_path) : null;
export const paperUrl = (p: Publication) => p.url ?? (p.doi ? `https://doi.org/${p.doi}` : null);
