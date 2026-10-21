// Small helpers the two environment demos (EditWorlds) share: canvas sizing at a capped pixel
// ratio, pointer positions through any CSS transform, a tap's reach, and the page's colours as
// canvas colours.

import { oklch } from "../../frame/util";

/** How far a finger may move, in CSS pixels, and still tap. */
export const SLOP = 10;

/** Device pixels per CSS pixel, capped at 2: crisp on retina, cheap on dense phones. */
export const dprOf = () => Math.min(window.devicePixelRatio || 1, 2);

/** Give a canvas its box's size in device pixels. True when the size changed. */
export function fit(cv: HTMLCanvasElement): boolean {
  const d = dprOf();
  const w = Math.max(2, Math.round(cv.clientWidth * d));
  const h = Math.max(2, Math.round(cv.clientHeight * d));
  if (cv.width === w && cv.height === h) return false;
  cv.width = w;
  cv.height = h;
  return true;
}

/** Where a pointer is, in the canvas's device pixels. offsetX/Y are local to the element, so
 * this holds under the views' rotations, drifts and mirrors. */
export function local(cv: HTMLCanvasElement, e: MouseEvent): [number, number] {
  const sx = cv.width / Math.max(1, cv.clientWidth);
  const sy = cv.height / Math.max(1, cv.clientHeight);
  return [e.offsetX * sx, e.offsetY * sy];
}

/** The same for a touch, from the box on screen (only used to decide whether to keep a touch
 * from scrolling the page). */
export function localTouch(cv: HTMLCanvasElement, t: Touch): [number, number] {
  const b = cv.getBoundingClientRect();
  return [
    ((t.clientX - b.left) * cv.width) / Math.max(1, b.width),
    ((t.clientY - b.top) * cv.height) / Math.max(1, b.height),
  ];
}

const OKLCH = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*\)$/i;

/** A CSS colour a canvas can take: oklch() is turned into rgb() (not every canvas parses it). */
export function canvasColor(css: string, fallback: string): string {
  const s = css.trim();
  const m = OKLCH.exec(s);
  if (m) {
    const [r, g, b] = oklch(Number(m[1]) / (m[2] ? 100 : 1), Number(m[3]), Number(m[4]));
    return `rgb(${r},${g},${b})`;
  }
  return /^(#|rgb|hsl)/i.test(s) ? s : fallback;
}

/** The page's edit colours: cyan where a thing was, magenta where the edit put it, red refused. */
export type Tones = { readonly pre: string; readonly post: string; readonly bad: string };

export function tones(el: Element): Tones {
  const cs = getComputedStyle(el);
  return {
    pre: canvasColor(cs.getPropertyValue("--gs-pre"), "#44d4e2"),
    post: canvasColor(cs.getPropertyValue("--gs-post"), "#f45fb0"),
    bad: canvasColor(cs.getPropertyValue("--gs-bad"), "#e5484d"),
  };
}

/** Pack a colour for a little-endian ImageData word. */
export const u32 = (r: number, g: number, b: number, a = 255) =>
  (((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;

/** Four small corners around a box: the site's mark for the thing you are about to press. */
export function carets(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  len: number,
  lw: number,
) {
  const r = x + w - lw;
  const b = y + h - lw;
  ctx.fillRect(x, y, len, lw);
  ctx.fillRect(x, y, lw, len);
  ctx.fillRect(r - len + lw, y, len, lw);
  ctx.fillRect(r, y, lw, len);
  ctx.fillRect(x, b, len, lw);
  ctx.fillRect(x, b - len + lw, lw, len);
  ctx.fillRect(r - len + lw, b, len, lw);
  ctx.fillRect(r, b - len + lw, lw, len);
}
