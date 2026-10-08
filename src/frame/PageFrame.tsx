import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { living, STILL } from "./live";
import { clamp } from "./util";

// The plain frame around the home page and About: a hairline bezel inset from the window.
// It holds still.
// With `glow`, one corner is warm: keep the pointer near the lower left corner and the
// border slowly lights blue from there; move away and it cools again. Under reduced
// motion it simply lights after a moment, without spreading.
// Rendered into <body>, so no view can transform it; the page's footer sits inside it.

/** Distance from the corner, in px, that counts as near. */
const NEAR = 150;
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
    const isNear = (x: number, y: number) => {
      const r = box.getBoundingClientRect();
      return Math.hypot(x - r.left, y - r.bottom) < NEAR;
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
