// Our own eyelids, seen from inside: they come down from above and up from below, lashes
// along their edges, and clear the world behind them. `shut` is 0 (open) to 1 (closed).

import { hash, mix, type Sketch } from "./sketch";

export function lids(sk: Sketch, shut: number, t: number) {
  if (shut <= 0.001) return;
  const A = sk.A + 0.1;
  sk.view(0, 0, 1);
  sk.group(900);
  const n = 28;
  // the edges: the upper lid bows down in the middle, the lower one up
  const top = (x: number) => {
    const k = 1 - (x / A) ** 2;
    return mix(-1.3, 0.035, shut) + 0.22 * k * (1 - shut * 0.75) + 0.012 * Math.sin(x * 9 + t);
  };
  const bot = (x: number) => {
    const k = 1 - (x / A) ** 2;
    return mix(1.3, 0.045, shut ** 1.15) - 0.12 * k * (1 - shut * 0.8);
  };
  for (const upper of [true, false]) {
    const edge = upper ? top : bot;
    const far = upper ? -1.4 : 1.4;
    // clear the lid
    sk.m(-A, far);
    for (let i = 1; i <= n; i++) sk.l(-A + (2 * A * i) / n, far);
    for (let i = n; i >= 0; i--) {
      const x = -A + (2 * A * i) / n;
      sk.l(x, edge(x));
    }
    sk.band();
    // its rim, heavy, and a softer line just inside it
    sk.m(-A, edge(-A));
    for (let i = 1; i <= n; i++) {
      const x = -A + (2 * A * i) / n;
      sk.l(x, edge(x));
    }
    sk.s(upper ? 2.6 : 1.8, 0.18, 1.2, upper ? 2.6 : 1.8, 0, 0.45);
    const inset = upper ? -0.035 : 0.03;
    sk.m(-A * 0.9, edge(-A * 0.9) + inset);
    for (let i = 1; i <= n; i++) {
      const x = -A * 0.9 + (1.8 * A * i) / n;
      sk.l(x, edge(x) + inset);
    }
    sk.s(0.8, 0.3, 0.8);
    // the skin of the lid: a few lines following its curve, fading away from the rim
    for (let k = 1; k <= 4; k++) {
      const off = (upper ? -1 : 1) * (0.08 + k * k * 0.035);
      const span = A * (0.75 - k * 0.1);
      sk.m(-span, edge(-span) + off);
      for (let i = 1; i <= 16; i++) {
        const x = -span + (2 * span * i) / 16;
        sk.l(x, edge(x) + off + 0.015 * Math.sin(x * 5 + k));
      }
      sk.s(0.6 - k * 0.08, 0.35, 0.8);
    }
    // lashes: fine curved hairs off the rim, in loose clumps, fanning outward from the middle
    const count = upper ? 34 : 20;
    for (let i = 0; i < count; i++) {
      const s = (i + 0.5 + (hash(i, upper ? 3 : 4) - 0.5) * 0.7) / count;
      const x = mix(-A * 0.8, A * 0.8, s);
      const y = edge(x);
      const fan = (x / A) * 0.9;
      const len =
        (upper ? 0.13 : 0.07) *
        Math.sin(Math.PI * (0.08 + 0.84 * s)) ** 0.6 *
        (0.6 + 0.6 * hash(i, 7));
      const dir = upper ? 1 : -1;
      const sway = 0.008 * Math.sin(t * 1.1 + i * 0.7);
      const curl = (0.35 + 0.3 * hash(i, 8)) * len;
      sk.m(x, y)
        .q(
          x + fan * len * 0.25,
          y + dir * len * 0.75,
          x + fan * len + curl * Math.sign(x || 1) + sway,
          y + dir * len * 0.95,
        )
        .s(0.85, 0.12, 0.25, 0.2);
    }
  }
}
