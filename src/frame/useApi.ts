import { useEffect, useState } from "react";
import { fetchApi } from "../api";

type State<T> = { data: T | null; failed: boolean; missing: boolean };

// Fetch one API path. `missing` is a confirmed 404, distinct from a failed request.
export default function useApi<T>(path: string | null): State<T> {
  const [state, setState] = useState<State<T>>({ data: null, failed: false, missing: false });
  useEffect(() => {
    if (!path) return;
    let live = true;
    setState({ data: null, failed: false, missing: false });
    fetchApi(path)
      .then((data: T) => live && setState({ data, failed: false, missing: false }))
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
