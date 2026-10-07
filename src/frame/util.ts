// Small helpers shared by the frame, the controls and page areas.

export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A seeded generator in [0, 1) (mulberry32). Same seed, same sequence. */
export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable hash of a string in [0, 1), varied by seed. */
export function hash(s: string, seed = 0) {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

/** True for http(s) links that leave this site. */
export function isExternal(href: string) {
  if (!/^https?:\/\//i.test(href)) return false;
  try {
    return new URL(href).host !== location.host;
  } catch {
    return false;
  }
}

/** Save-Data is on: load less, move nothing. */
export const SAVE_DATA =
  typeof navigator !== "undefined" &&
  !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;

/** OKLCH (L 0..1, C, h in degrees) to sRGB bytes, for canvases. */
export function oklch(L: number, C: number, h: number): [number, number, number] {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const f = (x: number) => {
    const y = clamp(x, 0, 1);
    return Math.round((y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055) * 255);
  };
  return [
    f(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    f(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    f(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}
