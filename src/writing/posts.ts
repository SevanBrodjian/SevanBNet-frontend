// The essays, from content/writing/*.md (compiled at build time by ./build.ts).

import { LOAD, POSTS, type PostMeta } from "virtual:writing";

export type { PostMeta };
export { POSTS };

const bodies = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

/** An essay's HTML if it has already been loaded. */
export const loadedBody = (slug: string) => bodies.get(slug);

/** Load an essay's HTML (one small chunk per essay); repeated calls share one request. */
export function loadBody(slug: string): Promise<string> {
  const have = bodies.get(slug);
  if (have !== undefined) return Promise.resolve(have);
  let p = pending.get(slug);
  if (!p) {
    const load = LOAD[slug];
    p = load
      ? load().then(
          (m) => {
            bodies.set(slug, m.html);
            pending.delete(slug);
            return m.html;
          },
          (error) => {
            pending.delete(slug);
            throw error;
          },
        )
      : Promise.reject(new Error(`no essay ${slug}`));
    pending.set(slug, p);
  }
  return p;
}

/** Start loading an essay before it is opened (on hover or focus of a link to it). */
export const prefetch = (slug: string) => {
  loadBody(slug).catch(() => {});
};

/** Oldest first: an essay's neighbours in time. */
export function neighbours(slug: string) {
  const i = POSTS.findIndex((p) => p.slug === slug);
  return { earlier: POSTS[i + 1] ?? null, later: i > 0 ? POSTS[i - 1] : null };
}
