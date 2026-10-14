// The essays, from content/writing/*.md (compiled at build time by ./build.ts).

import { LOAD, POSTS, type PostMeta } from "virtual:writing";
import { useMemo } from "react";
import useApi from "../frame/useApi";
import type { Post } from "../types";
import { dekOf } from "./dek";

export type { PostMeta };

/**
 * The essays, newest first: as of the build, then as the control panel has them now, so
 * one hidden since is gone at once and edits to a title, date or description show.
 */
export function usePosts(): PostMeta[] {
  const { data } = useApi<Post[]>("posts/");
  return useMemo(() => {
    if (!data) return POSTS;
    const now = new Map(data.map((e) => [e.slug, e]));
    return POSTS.flatMap((p) => {
      const e = now.get(p.slug);
      if (!e) return p.draft ? [p] : [];
      const description = e.description ?? "";
      return [{ ...p, title: e.title, date: e.date, description, dek: dekOf(description) }];
    }).sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  }, [data]);
}

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

/** An essay's neighbours in time, in a list that is newest first. */
export function neighbours(posts: PostMeta[], slug: string) {
  const i = posts.findIndex((p) => p.slug === slug);
  return { earlier: posts[i + 1] ?? null, later: i > 0 ? posts[i - 1] : null };
}
