import { type ComponentType, lazy, useState } from "react";

type Module<P> = { default: ComponentType<P> };

export type RouteComponent<P extends object = object> = ComponentType<P> & {
  preload: () => Promise<Module<P>>;
};

/**
 * A page loaded only when it is needed. `preload()` fetches it ahead of time (on hover or
 * focus of a link to it, and for the first page before the app mounts). A page that is
 * already loaded renders at once; otherwise React waits for it, and since navigations are
 * transitions the current page stays on screen until the next one arrives.
 */
export function route<P extends object = object>(
  load: () => Promise<Module<P>>,
): RouteComponent<P> {
  let loaded: Module<P> | undefined;
  let pending: Promise<Module<P>> | undefined;
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
  const Lazy = lazy(preload) as unknown as ComponentType<P>;
  function Route(props: P) {
    // Decided once per mount, so a page never remounts when its chunk arrives.
    const [Page] = useState<ComponentType<P>>(() => loaded?.default ?? Lazy);
    return <Page {...props} />;
  }
  return Object.assign(Route, { preload });
}
