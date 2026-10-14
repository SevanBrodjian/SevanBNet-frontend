import { useEffect, useState } from "react";
import { fetchApi } from "../api";

type State<T> = { data: T | null; failed: boolean; missing: boolean; fresh: boolean };

// Answers already fetched in this visit, and requests on their way: coming back to a page
// (or a second component asking for the same list) renders at once, without refetching.
const answers = new Map<string, unknown>();
const asking = new Map<string, Promise<unknown>>();

function ask(path: string) {
  let p = asking.get(path);
  if (!p) {
    p = fetchApi(path).then(
      (data: unknown) => {
        answers.set(path, data);
        asking.delete(path);
        return data;
      },
      (error: unknown) => {
        asking.delete(path);
        throw error;
      },
    );
    asking.set(path, p);
  }
  return p;
}

/** Start fetching an API path ahead of time (with the page that shows it). */
export function prefetchApi(path: string) {
  if (!answers.has(path)) ask(path).catch(() => {});
}

const known = <T>(path: string | null, built?: T): State<T> => {
  const fresh = path !== null && answers.has(path);
  const data = fresh ? (answers.get(path) as T) : (built ?? null);
  return { data, failed: false, missing: false, fresh };
};

/**
 * Fetch one API path. `built` is the same content as of the build (content.ts): shown at
 * once, then replaced by the API's answer, and kept if the API can't be reached. `fresh`
 * means the data is the API's answer; `missing` is a confirmed 404.
 */
export default function useApi<T>(path: string | null, built?: T): State<T> {
  const [state, setState] = useState<State<T>>(() => known<T>(path, built));
  useEffect(() => {
    if (!path) return;
    if (answers.has(path)) {
      setState((s) => (s.data === answers.get(path) ? s : known<T>(path)));
      return;
    }
    let live = true;
    setState((s) => (s.data === (built ?? null) && !s.fresh ? s : known<T>(path, built)));
    ask(path)
      .then(
        (data) => live && setState({ data: data as T, failed: false, missing: false, fresh: true }),
      )
      .catch((error: { status?: number }) => {
        console.error(`Couldn't fetch ${path}:`, error);
        if (live) {
          const missing = error.status === 404;
          setState({ data: built ?? null, failed: true, missing, fresh: false });
        }
      });
    return () => {
      live = false;
    };
  }, [path, built]);
  return state;
}
