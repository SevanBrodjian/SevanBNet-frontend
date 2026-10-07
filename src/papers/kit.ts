// Shared by the paper widgets: the contract, colours read from the page's tokens, a canvas
// that tracks its box, and a way to do heavy work in slices so the page never blocks.

import { subscribe } from "../controls/store";

/** What a widget module gives the page. */
export type Widget = {
  /** True while the pointer is over the paper (or focus is inside it, or it was tapped). */
  setActive: (on: boolean) => void;
  dispose: () => void;
};
export type MountWidget = (host: HTMLElement) => Widget;

export type RGB = readonly [number, number, number];
export const rgba = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export type Palette = {
  tx: RGB;
  tx2: RGB;
  tx3: RGB;
  tx4: RGB;
  rule: RGB;
  rule2: RGB;
  acc: RGB;
  /** The widget's own ground (the well). */
  well: RGB;
};

const KEYS: Record<keyof Palette, string> = {
  tx: "--tx",
  tx2: "--tx2",
  tx3: "--tx3",
  tx4: "--tx4",
  rule: "--rule",
  rule2: "--rule2",
  acc: "--acc",
  well: "--pw-well",
};

let probe: CanvasRenderingContext2D | null = null;

/** Any CSS colour (oklab, color-mix results...) as sRGB bytes. */
function toRGB(css: string): RGB {
  probe ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!probe) return [200, 200, 200];
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#c8c8c8";
  probe.fillStyle = css;
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}

/** The page's colours as they are right now (they follow the views and the controls). */
export function readPalette(el: HTMLElement): Palette {
  const span = document.createElement("span");
  span.style.display = "none";
  el.append(span);
  const out = {} as Record<keyof Palette, RGB>;
  for (const [k, v] of Object.entries(KEYS) as [keyof Palette, string][]) {
    span.style.color = `var(${v})`;
    out[k] = toRGB(getComputedStyle(span).color);
  }
  span.remove();
  return out;
}

/** Call `f` (at most once a frame) whenever a control changes; returns an unsubscribe. */
export function onControls(f: () => void) {
  let raf = 0;
  const off = subscribe(() => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      f();
    });
  });
  return () => {
    cancelAnimationFrame(raf);
    off();
  };
}

/** A canvas sized to its box at the device's pixel ratio (capped at 2). */
export class Surface {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** Size in CSS pixels. */
  w = 0;
  h = 0;
  dpr = 1;
  private ro: ResizeObserver;
  private timer = 0;

  constructor(parent: HTMLElement, label: string, onResize: () => void) {
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", label);
    parent.append(this.canvas);
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;
    this.fit();
    this.ro = new ResizeObserver(() => {
      clearTimeout(this.timer);
      this.timer = window.setTimeout(() => {
        if (this.fit()) onResize();
      }, 90);
    });
    this.ro.observe(this.canvas);
  }

  /** Match the backing store to the box; true if it changed. */
  fit() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w === this.w && h === this.h && dpr === this.dpr) return false;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    return true;
  }

  /** Draw in CSS pixels from here on. */
  reset() {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  dispose() {
    clearTimeout(this.timer);
    this.ro.disconnect();
  }
}

/**
 * Run a generator in slices of `budget` ms, yielding to the page between slices.
 * Resolves true when it finished, false if `alive()` turned false first.
 */
export function slice(gen: Generator<unknown, void>, alive: () => boolean, budget = 4) {
  return new Promise<boolean>((resolve) => {
    const step = () => {
      if (!alive()) return resolve(false);
      const t0 = performance.now();
      while (performance.now() - t0 < budget) {
        if (gen.next().done) return resolve(true);
      }
      setTimeout(step, 0);
    };
    setTimeout(step, 0);
  });
}

/** Standard normal from a uniform generator. */
export const gauss = (r: () => number) =>
  Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
