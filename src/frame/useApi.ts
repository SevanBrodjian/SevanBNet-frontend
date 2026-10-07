import { useEffect, useState } from "react";
import { fetchApi } from "../api";

type State<T> = { data: T | null; failed: boolean; missing: boolean };

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

const known = <T>(path: string | null): State<T> => ({
  data: path && answers.has(path) ? (answers.get(path) as T) : null,
  failed: false,
  missing: false,
});

// Fetch one API path. `missing` is a confirmed 404, distinct from a failed request.
export default function useApi<T>(path: string | null): State<T> {
  const [state, setState] = useState<State<T>>(() => known<T>(path));
  useEffect(() => {
    if (!path) return;
    if (answers.has(path)) {
      setState((s) => (s.data === answers.get(path) ? s : known<T>(path)));
      return;
    }
    let live = true;
    setState({ data: null, failed: false, missing: false });
    ask(path)
      .then((data) => live && setState({ data: data as T, failed: false, missing: false }))
      .catch((error: { status?: number }) => {
        console.error(`Couldn't fetch ${path}:`, error);
        if (live) setState({ data: null, failed: true, missing: error.status === 404 });
      });
    return () => {
      live = false;
    };
  }, [path]);
  return state;
}
