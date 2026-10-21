// Shapes of the backend API responses (see the backend's docs/api.md). Optional text
// left blank in the control panel arrives as null. Dates are YYYY-MM-DD.

/** What sits at the top of a project's default page. */
export type Media =
  | {
      kind: "image";
      src: string;
      alt: string | null;
      width: number | null;
      height: number | null;
    }
  | {
      kind: "video";
      src: string;
      poster: string | null;
      width: number | null;
      height: number | null;
    }
  | { kind: "youtube"; id: string | null }
  | { kind: "code"; text: string };

/** Every visible project; the Projects page shows the `listed` ones. */
export type Project = {
  slug: string;
  title: string;
  listed: boolean;
  /** A page that stands on its own (a paper's): no navbar, a link home, a plain ground.
   *  Missing from older APIs. */
  standalone?: boolean;
  rank: number | null;
  start: string | null;
  end: string | null;
  summary: string | null;
  thumbnail: string | null;
  glow: string | null;
  media: Media | null;
  source: string | null;
  description: string | null;
  description_html: string | null;
};

export type Paper = {
  id: number;
  /** Which widget in src/papers/registry.ts belongs to this paper. */
  key: string | null;
  title: string;
  authors: string | null;
  venue: string | null;
  status: string | null;
  date: string | null;
  paper_url: string | null;
  /** The paper's code (its own field; missing from older APIs). */
  code_url?: string | null;
  /** The project page on this site; null when there is none or it is hidden. */
  project: { slug: string; title: string; source: string | null } | null;
  /** A project page hosted elsewhere. */
  project_url: string | null;
  bibtex: string | null;
  description: string | null;
  rank: number | null;
};

/** An essay's metadata; its text is content/writing/<slug>.md. */
export type Post = {
  slug: string;
  title: string;
  description: string | null;
  date: string;
};

/** Site-wide text, edited under Site settings. */
export type Site = {
  home_line: string;
  role: string;
  /** The About page, one string per paragraph (plain, for crawlers and fallbacks). */
  about: string[];
  /** The About page from its Markdown, sanitized by the backend. Missing from older APIs. */
  about_html?: string;
  /** The note at the top of the Writing page; empty for none. Missing from older APIs. */
  writing_note?: string;
  /** The note from its Markdown, sanitized by the backend. */
  writing_note_html?: string;
};
