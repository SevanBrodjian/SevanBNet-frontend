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

declare module "virtual:site" {
  /** The site text (home line, role, About) as the API had it when the site was built. */
  export const SITE: import("../types").Site;
}
