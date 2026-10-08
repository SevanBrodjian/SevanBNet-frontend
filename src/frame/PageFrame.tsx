import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { living, STILL } from "./live";
import { clamp } from "./util";

// The plain frame around the home page and About: a hairline bezel inset from the window.
// It holds still.
// With `glow`, the border is warm: keep the pointer near it and the border slowly lights
// blue around the nearest point, following the pointer along it; move away and it cools
// again. Under reduced motion it simply lights after a moment, without spreading.
// Rendered into <body>, so no view can transform it; the page's footer sits inside it.

/** Distance from the border, in px, that counts as near. */
const NEAR = 120;
/** Seconds of holding near to light the whole border, and to cool from full. */
const RISE = 7;
const FALL = 2.6;

export default function PageFrame({ glow = false }: { glow?: boolean }) {
  const frame = useRef<HTMLDivElement>(null);
  const lit = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const html = document.documentElement;
    html.dataset.framed = "";
    return () => {
      delete html.dataset.framed;
    };
  }, []);

  useEffect(() => {
    const box = frame.current;
    const light = lit.current;
    if (!glow || !box || !light) return;
    let level = 0;
    let near = false;
    let pressed = false;
    let hold = 0;
    const show = (v: number) => {
      level = clamp(v, 0, 1);
      light.style.setProperty("--lit", level.toFixed(4));
    };
    const live = living({
      always: true,
      fps: 30,
      paused: true,
      tick(dt) {
        const s = dt / 1000;
        show(level + (near || pressed ? s / RISE : -s / FALL));
        if ((level <= 0 && !near && !pressed) || (level >= 1 && (near || pressed)))
          live.setPaused(true);
      },
    });
    // The point on the border nearest the pointer: it becomes the centre of the light.
    const isNear = (x: number, y: number) => {
      const r = box.getBoundingClientRect();
      // The navbar sits just above the top edge; using it should not light the frame.
      const hdr = document.querySelector(".hdr")?.getBoundingClientRect();
      if (hdr && y < hdr.bottom) return false;
      let px = clamp(x, r.left, r.right);
      let py = clamp(y, r.top, r.bottom);
      if (px === x && py === y) {
        // inside the frame: project onto the closest edge
        const edges = [x - r.left, r.right - x, y - r.top, r.bottom - y];
        const k = edges.indexOf(Math.min(...edges));
        if (k === 0) px = r.left;
        else if (k === 1) px = r.right;
        else if (k === 2) py = r.top;
        else py = r.bottom;
      }
      const close = Math.hypot(x - px, y - py) < NEAR;
      if (close) {
        light.style.setProperty("--gx", `${(px - r.left).toFixed(1)}px`);
        light.style.setProperty("--gy", `${(py - r.top).toFixed(1)}px`);
      }
      return close;
    };
    const update = (next: boolean) => {
      if (next === near) return;
      near = next;
      if (!STILL) {
        live.setPaused(false);
        return;
      }
      clearTimeout(hold);
      if (near) hold = window.setTimeout(() => show(1), 1200);
      else show(0);
    };
    const onMove = (e: PointerEvent) => update(isNear(e.clientX, e.clientY));
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && isNear(e.clientX, e.clientY)) {
        pressed = true;
        update(true);
      }
    };
    const onUp = () => {
      if (!pressed) return;
      pressed = false;
      update(false);
    };
    const onLeave = () => update(false);
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("pointerdown", onDown, { passive: true });
    addEventListener("pointerup", onUp, { passive: true });
    addEventListener("pointercancel", onUp, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      live.dispose();
      clearTimeout(hold);
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerdown", onDown);
      removeEventListener("pointerup", onUp);
      removeEventListener("pointercancel", onUp);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [glow]);

  return createPortal(
    <div ref={frame} className="pframe" aria-hidden="true">
      {glow && <i ref={lit} className="pframe-lit" />}
    </div>,
    document.body,
  );
}
