import { type ComponentType, lazy, useState } from "react";

type Module = { default: ComponentType };

export type RouteComponent = ComponentType & { preload: () => Promise<Module> };

/**
 * A page loaded only when it is needed. `preload()` fetches it ahead of time (on hover or
 * focus of a link to it, and for the first page before the app mounts). A page that is
 * already loaded renders at once; otherwise React waits for it, and since navigations are
 * transitions the current page stays on screen until the next one arrives.
 */
export function route(load: () => Promise<Module>): RouteComponent {
  let loaded: Module | undefined;
  let pending: Promise<Module> | undefined;
  const preload = () => {
    pending ??= load().then(
      (m) => {
        loaded = m;
        return m;
      },
      (error) => {
        pending = undefined;
        throw error;
      },
    );
    return pending;
  };
  const Lazy = lazy(preload);
  function Route() {
    // Decided once per mount, so a page never remounts when its chunk arrives.
    const [Page] = useState<ComponentType>(() => loaded?.default ?? Lazy);
    return <Page />;
  }
  return Object.assign(Route, { preload });
}
