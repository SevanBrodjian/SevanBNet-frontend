// Small text rules shared by the app and the build-time pages (seo.ts).

type Venued = { venue: string | null; status: string | null };

/**
 * A paper's "Venue · Status", or just the status without a venue. An accepted paper with
 * a venue shows its kind instead (Poster, Oral) when the status names one.
 */
export function venueLine({ venue, status }: Venued) {
  const s = status ?? "";
  if (!venue) return s;
  const kind = /accept/i.test(s) ? (s.match(/\(([^)]+)\)/)?.[1] ?? "Accepted") : s;
  return [venue, kind].filter(Boolean).join(" · ");
}

/** Sevan's name in an author list, however it is written (Sevan Brodjian, S. Brodjian). */
export const SEVAN = /(\b(?:Sevan|S\.?)\s*Brodjian\b)/;
