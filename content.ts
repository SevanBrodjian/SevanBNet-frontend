// The site's content from the backend API, fetched once when the site is built (and when
// `vite` starts). The essays' metadata, the site text baked into the app, and the
// crawler pages, sitemap and llms.txt (seo.ts) all come from here.
//
// If the API can't be reached, or answers with something that isn't content, each part
// falls back to content/api-snapshot.json: the last answer from the production API,
// rewritten by every build that reaches it. A backend outage never empties the site; it
// holds the site at its last good state.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import type { Paper, Post, Project, Site } from "./src/types.ts";

/** The one place the backend's addresses live: its API in each Railway environment... */
export const API_BASES: Record<string, string> = {
  production: "https://admin.sevanb.net/api",
  development: "https://dev-admin.sevanb.net/api",
};
/** ...and the local backend's fixed address, where `vite` forwards /api by default. */
export const LOCAL_BACKEND = "http://localhost:8000";

export type Content = { site: Site; projects: Project[]; papers: Paper[]; posts: Post[] };

const SNAPSHOT = resolve(import.meta.dirname, "content/api-snapshot.json");

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const listOf = (key: string) => (x: unknown) =>
  Array.isArray(x) && x.every((item) => isObject(item) && typeof item[key] === "string");

const PARTS = {
  site: {
    path: "site/",
    valid: (x: unknown) => isObject(x) && typeof x.home_line === "string" && Array.isArray(x.about),
  },
  projects: { path: "projects/", valid: listOf("slug") },
  papers: { path: "papers/", valid: listOf("title") },
  posts: { path: "posts/", valid: listOf("slug") },
};
type Part = keyof typeof PARTS;

function readSnapshot(): Content {
  return JSON.parse(readFileSync(SNAPSHOT, "utf8")) as Content;
}

async function fetchPart(api: string, part: Part): Promise<unknown> {
  const { path, valid } = PARTS[part];
  const response = await fetch(`${api}/${path}`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data: unknown = await response.json();
  if (!valid(data)) throw new Error("the answer isn't in the expected shape");
  return data;
}

const loads = new Map<string, Promise<Content>>();

/**
 * Everything visible on the site, from `api` (a base URL ending in /api). With `save`, a
 * complete answer is written to the snapshot (only for the production API).
 */
export function loadContent(api: string, { save = false } = {}): Promise<Content> {
  let load = loads.get(api);
  if (!load) {
    load = (async () => {
      const snapshot = readSnapshot();
      let fresh = 0;
      const entries = await Promise.all(
        (Object.keys(PARTS) as Part[]).map(async (part) => {
          try {
            const data = await fetchPart(api, part);
            fresh++;
            return [part, data] as const;
          } catch (error) {
            console.warn(
              `[content] couldn't fetch ${PARTS[part].path} from ${api} (${error}); using content/api-snapshot.json`,
            );
            return [part, snapshot[part]] as const;
          }
        }),
      );
      const content = Object.fromEntries(entries) as Content;
      if (save && fresh === entries.length) {
        const text = `${JSON.stringify(content, null, 2)}\n`;
        if (!existsSync(SNAPSHOT) || readFileSync(SNAPSHOT, "utf8") !== text) {
          writeFileSync(SNAPSHOT, text);
          console.info("[content] content/api-snapshot.json updated from the production API");
        }
      }
      return content;
    })();
    loads.set(api, load);
  }
  return load;
}

/** `virtual:site`: the site text as of the build, so the first render already has it. */
export function siteText(site: Site): Plugin {
  const ID = "virtual:site";
  return {
    name: "site-text",
    resolveId(id) {
      if (id === ID) return `\0${ID}`;
    },
    load(id) {
      if (id === `\0${ID}`) return `export const SITE = ${JSON.stringify(site)};`;
    },
  };
}
