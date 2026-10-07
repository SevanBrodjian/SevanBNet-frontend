import { type RefObject, useEffect, useRef } from "react";
import { type Living, type LivingOptions, living } from "./live";

/**
 * Put an element on the shared animation loop (./live) for as long as the component is
 * mounted. `make` receives the element once and returns the options (fps, tick, ...);
 * read changing values through refs inside tick, or remount with a React key. The
 * returned ref holds the Living handle, e.g. to pause it while the pointer is away:
 * `handle.current?.setPaused(true)`.
 *
 *   const canvas = useRef<HTMLCanvasElement>(null);
 *   const live = useLiving(canvas, (el) => ({ fps: 30, tick: (dt) => draw(el, dt) }));
 */
export default function useLiving<E extends Element>(
  ref: RefObject<E | null>,
  make: (el: E) => Omit<LivingOptions, "el"> | null,
) {
  const handle = useRef<Living | null>(null);
  const makeRef = useRef(make);
  makeRef.current = make;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const options = makeRef.current(el);
    if (!options) return;
    const o = living({ ...options, el });
    handle.current = o;
    return () => {
      o.dispose();
      handle.current = null;
    };
  }, [ref]);
  return handle;
}
