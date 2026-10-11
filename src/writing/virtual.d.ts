// Modules generated at build time: the essays by the writing plugin (./build.ts), from
// content/writing/*.md and the control panel's posts; the site text by content.ts.

declare module "virtual:writing" {
  export type PostMeta = {
    slug: string;
    title: string;
    /** YYYY-MM-DD */
    date: string;
    description: string;
    /** The description as one short paragraph. */
    dek: string;
    series?: string;
    /** Not in the control panel yet: shown only by `npm run dev`. */
    draft?: true;
  };
  /** Newest first. */
  export const POSTS: PostMeta[];
  /** One chunk per post. */
  export const LOAD: Record<string, () => Promise<{ html: string }>>;
}

// The content as the API had it when the site was built (content.ts, builtContent).
declare module "virtual:site" {
  /** The site text: home line, role, About. */
  export const SITE: import("../types").Site;
}

declare module "virtual:projects" {
  /** Every visible project, listed or not; `description` is null (use description_html). */
  export const PROJECTS: import("../types").Project[];
}

declare module "virtual:papers" {
  export const PAPERS: import("../types").Paper[];
}
