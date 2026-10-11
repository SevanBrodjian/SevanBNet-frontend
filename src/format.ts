// Small text rules shared by the app and the build-time pages (seo.ts).

type Venued = { venue: string | null; status: string | null };

/** A paper's "Venue · Status" exactly as written in the control panel, or just the status. */
export function venueLine({ venue, status }: Venued) {
  return [venue, status].filter(Boolean).join(" · ");
}

/** Sevan's name in an author list, however it is written (Sevan Brodjian, S. Brodjian). */
export const SEVAN = /(\b(?:Sevan|S\.?)\s*Brodjian\b)/;
