import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { living, STILL } from "./live";
import { clamp } from "./util";

// The plain frame around the home page and About: a hairline bezel inset from the window.
// It holds still.
// With `glow`, the border behaves like metal warmed by the pointer: hold the pointer near
// it and the nearest stretch of border slowly heats and glows blue. The heat stays where
// it was made; when the pointer moves on, that spot cools in place while a new one warms.
// Under reduced motion the warm spot simply appears after a moment and clears on leaving.
// Rendered into <body>, so no view can transform it; the page's footer sits inside it.

/** Distance from the border, in px, within which the pointer warms it. */
const NEAR = 120;
/** Length of border, in px, per simulated cell. */
const CELL = 6;
/** Width (px, standard deviation) of the spot the pointer warms. */
const SPOT = 24;
/** Heating at the centre of the spot, per second (about 3 s to full). */
const HEAT = 0.33;
/** How fast heat spreads along the border, px^2 per second. */
const SPREAD = 260;
/** Cooling time constant, seconds. */
const COOL = 2.4;
/** Room around the border for the glow to fall outside it. */
const PAD = 48;
/** Fallback accent, the default --acc in sRGB. */
const ACCENT: [number, number, number] = [35, 177, 199];

/** The page's current accent colour as RGB (it can be changed in the controls). */
function accent(): [number, number, number] {
  try {
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    const g = probe.getContext("2d");
    const css = getComputedStyle(document.documentElement).getPropertyValue("--acc").trim();
    if (!g || !css) return ACCENT;
    g.fillStyle = css;
    g.fillRect(0, 0, 1, 1);
    const [r, gr, b, a] = g.getImageData(0, 0, 1, 1).data;
    return a ? [r, gr, b] : ACCENT;
  } catch {
    return ACCENT;
  }
}

export default function PageFrame({ glow = false }: { glow?: boolean }) {
  const frame = useRef<HTMLDivElement>(null);
  const heat = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const html = document.documentElement;
    html.dataset.framed = "";
    return () => {
      delete html.dataset.framed;
    };
  }, []);

  useEffect(() => {
    const box = frame.current;
    const canvas = heat.current;
    const ctx = canvas?.getContext("2d");
    if (!glow || !box || !canvas || !ctx) return;

    let W = 0;
    let H = 0;
    let P = 0;
    let dpr = 1;
    let h = new Float32Array(0);
    let tmp = new Float32Array(0);
    let rgb = ACCENT;
    /** Where the pointer is warming the border (perimeter position, px), or null. */
    let source: number | null = null;
    let pressed = false;
    let hold = 0;

    // Perimeter position s (px, clockwise from the top left) to a point on the border.
    const at = (s: number): [number, number] => {
      s = ((s % P) + P) % P;
      if (s < W) return [s, 0];
      if (s < W + H) return [W, s - W];
      if (s < 2 * W + H) return [W - (s - W - H), H];
      return [0, H - (s - 2 * W - H)];
    };

    const layout = () => {
      const r = box.getBoundingClientRect();
      W = r.width;
      H = r.height;
      P = 2 * (W + H);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round((W + 2 * PAD) * dpr);
      canvas.height = Math.round((H + 2 * PAD) * dpr);
      canvas.style.width = `${W + 2 * PAD}px`;
      canvas.style.height = `${H + 2 * PAD}px`;
      h = new Float32Array(Math.max(1, Math.ceil(P / CELL)));
      tmp = new Float32Array(h.length);
    };

    // The look: the border's own 1px line turning blue, a soft haze on both sides of it
    // (like the CSS box-shadows this replaced), and a wide bloom where it is hottest.
    // Every part is scaled by the local heat, so cool border is untouched.
    const OUT = 16; // px of haze outside the border
    const IN = 20; // px of haze inside it
    const strip = (len: number, peak: number, atStart: boolean, vertical: boolean) => {
      const c = document.createElement("canvas");
      c.width = vertical ? 1 : len;
      c.height = vertical ? len : 1;
      const g = c.getContext("2d");
      if (!g) return c;
      const grad = vertical
        ? g.createLinearGradient(0, 0, 0, len)
        : g.createLinearGradient(0, 0, len, 0);
      const [r, gr, b] = rgb;
      const near = `rgba(${r},${gr},${b},${peak})`;
      const far = `rgba(${r},${gr},${b},0)`;
      grad.addColorStop(0, atStart ? near : far);
      grad.addColorStop(1, atStart ? far : near);
      g.fillStyle = grad;
      g.fillRect(0, 0, c.width, c.height);
      return c;
    };
    let strips: Record<string, HTMLCanvasElement> = {};
    const buildStrips = () => {
      strips = {
        outV0: strip(OUT, 0.34, true, true),
        outV1: strip(OUT, 0.34, false, true),
        outH0: strip(OUT, 0.34, true, false),
        outH1: strip(OUT, 0.34, false, false),
        inV0: strip(IN, 0.17, true, true),
        inV1: strip(IN, 0.17, false, true),
        inH0: strip(IN, 0.17, true, false),
        inH1: strip(IN, 0.17, false, false),
      };
    };

    /** Draw one straight piece of border [s0, s1] (all on one edge) at heat v. */
    const piece = (s0: number, s1: number, v: number) => {
      const [x0, y0] = at(s0);
      const [x1, y1] = at(s1 - 1e-6);
      ctx.globalAlpha = v;
      if (s0 < W) {
        // top edge: line on the border's first pixel row
        const x = Math.min(x0, x1);
        const len = Math.abs(x1 - x0);
        ctx.drawImage(strips.outV1, x, -OUT, len, OUT);
        ctx.drawImage(strips.inV0, x, 1, len, IN);
        ctx.fillRect(x, 0, len, 1);
      } else if (s0 < W + H) {
        const y = Math.min(y0, y1);
        const len = Math.abs(y1 - y0);
        ctx.drawImage(strips.outH0, W, y, OUT, len);
        ctx.drawImage(strips.inH1, W - 1 - IN, y, IN, len);
        ctx.fillRect(W - 1, y, 1, len);
      } else if (s0 < 2 * W + H) {
        const x = Math.min(x0, x1);
        const len = Math.abs(x1 - x0);
        ctx.drawImage(strips.outV0, x, H, len, OUT);
        ctx.drawImage(strips.inV1, x, H - 1 - IN, len, IN);
        ctx.fillRect(x, H - 1, len, 1);
      } else {
        const y = Math.min(y0, y1);
        const len = Math.abs(y1 - y0);
        ctx.drawImage(strips.outH1, -OUT, y, OUT, len);
        ctx.drawImage(strips.inH0, 1, y, IN, len);
        ctx.fillRect(0, y, 1, len);
      }
    };

    const draw = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, PAD * dpr, PAD * dpr);
      const [r, g, b] = rgb;
      const n = h.length;
      // The line itself: the accent mixed a little toward the text colour, as before.
      ctx.fillStyle = `rgb(${Math.round(0.9 * r + 24)},${Math.round(0.9 * g + 24)},${Math.round(0.9 * b + 23)})`;
      const corners = [0, W, W + H, 2 * W + H, P];
      for (let i = 0; i < n; i++) {
        // a well-warmed spot reaches the full look; a barely warm one stays faint
        const v = Math.min(1, h[i] * 1.6);
        if (v < 0.015) continue;
        const s0 = i * CELL;
        const s1 = Math.min(P, s0 + CELL);
        // split a cell that wraps a corner into its two edges
        let a = s0;
        for (const c of corners) {
          if (c > a && c < s1) {
            piece(a, c, v);
            a = c;
          }
        }
        piece(a, s1, v);
      }
      ctx.globalAlpha = 1;
      // A soft bloom where the metal is hottest (local peaks only).
      const R = Math.round(36 / CELL);
      for (let i = 0; i < n; i++) {
        const v = h[i];
        if (v < 0.12) continue;
        let peak = true;
        for (let j = -R; j <= R && peak; j++) if (j && h[(i + j + n) % n] > v) peak = false;
        if (!peak) continue;
        const [x, y] = at((i + 0.5) * CELL);
        const rad = 160;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
        grad.addColorStop(0, `rgba(${r},${g},${b},${(0.24 * Math.min(1, v * 1.6)).toFixed(3)})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(x - rad, y - rad, 2 * rad, 2 * rad);
      }
    };

    const step = (s: number) => {
      const n = h.length;
      if (source !== null) {
        const reach = 4 * SPOT;
        for (let d = -reach; d <= reach; d += CELL) {
          const i = Math.floor(((((source + d) % P) + P) % P) / CELL) % n;
          h[i] += s * HEAT * Math.exp(-(d * d) / (2 * SPOT * SPOT));
        }
      }
      // Diffusion along the border, in stable sub-steps.
      const c = (SPREAD * s) / (CELL * CELL);
      const sub = Math.max(1, Math.ceil(c / 0.4));
      for (let k = 0; k < sub; k++) {
        const ck = c / sub;
        for (let i = 0; i < n; i++)
          tmp[i] = h[i] + ck * (h[(i - 1 + n) % n] - 2 * h[i] + h[(i + 1) % n]);
        const t = h;
        h = tmp;
        tmp = t;
      }
      const decay = Math.exp(-s / COOL);
      let max = 0;
      for (let i = 0; i < n; i++) {
        const v = Math.min(1, h[i] * decay);
        h[i] = v < 0.003 ? 0 : v;
        if (h[i] > max) max = h[i];
      }
      return max;
    };

    const live = living({
      always: true,
      fps: 30,
      paused: true,
      tick(dt) {
        const max = step(Math.min(0.1, dt / 1000));
        draw();
        if (max === 0 && source === null) live.setPaused(true);
      },
    });

    // The perimeter position nearest the pointer, or null when it is not near the border.
    const nearest = (x: number, y: number): number | null => {
      // The navbar sits just above the top edge; using it should not warm the frame.
      const hdr = document.querySelector(".hdr")?.getBoundingClientRect();
      if (hdr && y < hdr.bottom) return null;
      const r = box.getBoundingClientRect();
      let px = clamp(x, r.left, r.right) - r.left;
      let py = clamp(y, r.top, r.bottom) - r.top;
      const lx = x - r.left;
      const ly = y - r.top;
      if (px === lx && py === ly) {
        // inside the frame: project onto the closest edge
        const edges = [lx, W - lx, ly, H - ly];
        const k = edges.indexOf(Math.min(...edges));
        if (k === 0) px = 0;
        else if (k === 1) px = W;
        else if (k === 2) py = 0;
        else py = H;
      }
      if (Math.hypot(lx - px, ly - py) >= NEAR) return null;
      if (py === 0) return px;
      if (px === W) return W + py;
      if (py === H) return W + H + (W - px);
      return 2 * W + H + (H - py);
    };

    const warm = (s: number | null) => {
      const was = source;
      source = s;
      if (STILL) {
        // No gradual heating: the spot appears after a moment and clears on leaving.
        clearTimeout(hold);
        if (s === null) {
          h.fill(0);
          draw();
        } else if (was === null || Math.abs(s - was) > SPOT) {
          hold = window.setTimeout(() => {
            h.fill(0);
            for (let d = -3 * SPOT; d <= 3 * SPOT; d += CELL) {
              const i = Math.floor(((((s + d) % P) + P) % P) / CELL) % h.length;
              h[i] = Math.max(h[i], 0.85 * Math.exp(-(d * d) / (2 * (SPOT * 1.6) ** 2)));
            }
            draw();
          }, 1000);
        }
        return;
      }
      if (s !== null && was === null) {
        rgb = accent();
        buildStrips();
      }
      if (s !== null) live.setPaused(false);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || pressed) warm(nearest(e.clientX, e.clientY));
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      const s = nearest(e.clientX, e.clientY);
      if (s !== null) {
        pressed = true;
        warm(s);
      }
    };
    const onUp = () => {
      if (!pressed) return;
      pressed = false;
      warm(null);
    };
    const onLeave = () => warm(null);
    const ro = new ResizeObserver(() => {
      layout();
      draw();
    });

    layout();
    buildStrips();
    ro.observe(box);
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("pointerdown", onDown, { passive: true });
    addEventListener("pointerup", onUp, { passive: true });
    addEventListener("pointercancel", onUp, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      live.dispose();
      ro.disconnect();
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
      {glow && <canvas ref={heat} className="pframe-heat" />}
    </div>,
    document.body,
  );
}
