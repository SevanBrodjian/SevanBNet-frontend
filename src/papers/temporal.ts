// Training-Free Temporal Abstraction for General Video Understanding, in one picture:
// a video is a long strip of frames; the method finds where the content changes and
// keeps a few events. While active, a playhead runs through a new synthetic video, marks
// each change it passes, and drops every finished event into its own tile.
// The "video" is procedural: one place in one light, each event a little scene with
// something else in it (a house, a tree, someone walking by), panning slowly.

import { living, STILL } from "../frame/live";
import { clamp, rng } from "../frame/util";
import { type MountWidget, onControls, type Palette, type RGB, readPalette, Surface } from "./kit";

/** What an event is about: the change between events is in what is there, not the light. */
type Subject = "sun" | "house" | "tree" | "figure" | "car";
const SUBJECTS: Subject[] = ["sun", "house", "tree", "figure", "car"];

type Scene = {
  a: number; // first frame
  b: number; // one past the last frame
  sky: number;
  ground: number;
  horizon: number;
  slope: number;
  subject: Subject;
  sx: number; // where it stands, 0..1 across
  size: number;
  tone: number;
  pan: number;
};

const FRAME_MS = 115; // the playhead's pace
const HOLD_MS = 1900; // the finished picture, before the next video

/** A video: one place, one light, and a run of events that each show something else. */
function video(seed: number, n: number): Scene[] {
  const r = rng(seed);
  const sky = 0.22 + r() * 0.16;
  const ground = 0.32 + r() * 0.14;
  const horizon = 0.5 + r() * 0.16;
  const slope = (r() - 0.5) * 0.16;
  const out: Scene[] = [];
  let a = 0;
  while (a < n) {
    let len = 2 + Math.floor(r() * 6);
    if (n - a - len < 2) len = n - a;
    const prev = out[out.length - 1];
    const others = SUBJECTS.filter((k) => k !== prev?.subject);
    out.push({
      a,
      b: a + len,
      sky: clamp(sky + (r() - 0.5) * 0.06, 0, 1),
      ground: clamp(ground + (r() - 0.5) * 0.06, 0, 1),
      horizon: clamp(horizon + (r() - 0.5) * 0.08, 0.4, 0.75),
      slope,
      subject: others[Math.floor(r() * others.length)],
      sx: prev ? clamp(1 - prev.sx + (r() - 0.5) * 0.3, 0.18, 0.82) : 0.25 + r() * 0.5,
      size: 0.85 + r() * 0.3,
      tone: 0.62 + r() * 0.22,
      pan: (r() - 0.5) * 0.3,
    });
    a += len;
  }
  return out;
}

const mix = (a: RGB, b: RGB, t: number) =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;

/** One frame of a scene, `u` in 0..1 along the event (the camera pans). */
function drawScene(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  s: Scene,
  u: number,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const pan = (u - 0.5) * s.pan;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = mix(pal.well, pal.tx2, s.sky);
  ctx.fillRect(x, y, w, h);
  const hy = (px: number) => y + h * (s.horizon + s.slope * (px - 0.5));
  ctx.fillStyle = mix(pal.well, pal.tx2, s.ground);
  ctx.beginPath();
  ctx.moveTo(x, hy(0));
  ctx.lineTo(x + w, hy(1));
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.fill();
  // the subject, standing on the horizon where it is, drifting a little with the camera
  const cx = s.sx - pan;
  const X = x + cx * w;
  const base = hy(cx);
  const k = s.size * h;
  ctx.fillStyle = mix(pal.well, pal.tx, s.tone);
  switch (s.subject) {
    case "sun":
      ctx.beginPath();
      ctx.arc(X, y + h * s.horizon * 0.42, Math.max(1, k * 0.14), 0, Math.PI * 2);
      ctx.fill();
      break;
    case "house": {
      const bw = k * 0.34;
      const bh = k * 0.24;
      ctx.fillRect(X - bw / 2, base - bh, bw, bh + 1);
      ctx.beginPath();
      ctx.moveTo(X - bw * 0.6, base - bh);
      ctx.lineTo(X, base - bh - k * 0.16);
      ctx.lineTo(X + bw * 0.6, base - bh);
      ctx.fill();
      break;
    }
    case "tree":
      ctx.fillRect(X - k * 0.025, base - k * 0.14, k * 0.05, k * 0.14 + 1);
      ctx.beginPath();
      ctx.moveTo(X - k * 0.13, base - k * 0.12);
      ctx.lineTo(X, base - k * 0.46);
      ctx.lineTo(X + k * 0.13, base - k * 0.12);
      ctx.fill();
      break;
    case "figure":
      ctx.fillRect(X - k * 0.035, base - k * 0.24, k * 0.07, k * 0.24 + 1);
      ctx.beginPath();
      ctx.arc(X, base - k * 0.3, Math.max(1, k * 0.055), 0, Math.PI * 2);
      ctx.fill();
      break;
    case "car":
      ctx.fillRect(X - k * 0.2, base - k * 0.11, k * 0.4, k * 0.08);
      ctx.fillRect(X - k * 0.1, base - k * 0.17, k * 0.2, k * 0.07);
      ctx.fillStyle = mix(pal.well, pal.tx2, 0.12);
      for (const o of [-0.12, 0.12]) {
        ctx.beginPath();
        ctx.arc(X + o * k, base - k * 0.03, Math.max(1, k * 0.04), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
  }
  ctx.restore();
}

const mount: MountWidget = (host) => {
  const well = document.createElement("div");
  well.className = "pw-well live mx";
  host.append(well);
  let pal = readPalette(host);
  let seed = 7;
  let n = 0;
  let scenes: Scene[] = [];
  let clock = Number.POSITIVE_INFINITY; // finished picture until first played
  let on = false;

  const surface = new Surface(
    well,
    "A video as a strip of frames, grouped into a few events",
    () => {
      layout();
      draw();
    },
  );
  const { ctx } = surface;

  function layout() {
    const want = clamp(Math.round((surface.w - 28) / 38), 8, 12);
    if (want !== n) {
      n = want;
      scenes = video(seed, n);
    }
  }

  const css = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  function draw() {
    const W = surface.w;
    const H = surface.h;
    surface.reset();
    ctx.clearRect(0, 0, W, H);
    const pad = Math.round(clamp(W * 0.05, 14, 24));
    const gap = 3;
    const fw = (W - pad * 2 - gap * (n - 1)) / n;
    const fh = Math.round(Math.min(fw * 0.74, H * 0.22));
    const fy = Math.round(H * 0.15);
    const fx = (i: number) => pad + i * (fw + gap);
    const sweep = n * FRAME_MS;
    const p = clamp(clock / sweep, 0, 1) * n;

    // the film: a band with sprocket holes, frames shown once the playhead has passed
    const band = 8;
    ctx.fillStyle = css(pal.tx, 0.07);
    ctx.fillRect(pad - 6, fy - band, W - pad * 2 + 12, fh + band * 2);
    ctx.fillStyle = css(pal.well);
    for (let x = pad - 2; x < W - pad + 4; x += 7) {
      ctx.fillRect(Math.round(x), fy - band + 2, 3, 3);
      ctx.fillRect(Math.round(x), fy + fh + band - 5, 3, 3);
    }
    for (let i = 0; i < n; i++) {
      const x = Math.round(fx(i));
      const w = Math.round(fx(i) + fw) - x;
      if (i < p) {
        const s = scenes.find((e) => i >= e.a && i < e.b);
        if (s) drawScene(ctx, pal, s, (i - s.a + 0.5) / (s.b - s.a), x, fy, w, fh);
      } else {
        ctx.fillStyle = css(pal.well);
        ctx.fillRect(x, fy, w, fh);
      }
    }

    // events: one tile each, fed by the frames it stands for
    const k = scenes.length;
    const tg = Math.round(clamp(W * 0.03, 10, 16));
    const tw = (W - pad * 2 - tg * (k - 1)) / k;
    const th = Math.round(Math.min(tw * 0.68, H * 0.34));
    const ty = Math.round(H * 0.9 - th);
    const fb = fy + fh + band + 4;
    ctx.lineWidth = 1;
    for (let e = 0; e < k; e++) {
      const s = scenes[e];
      if (p < s.b) continue;
      const tl = Math.round(pad + e * (tw + tg));
      const tr = Math.round(pad + e * (tw + tg) + tw);
      const tc = (tl + tr) / 2;
      const spread = Math.min(tw * 0.4, (s.b - s.a) * 5);
      ctx.strokeStyle = css(pal.rule2);
      ctx.beginPath();
      for (let i = s.a; i < s.b; i++) {
        const x = Math.round(fx(i) + fw / 2) + 0.5;
        const u = s.b - s.a > 1 ? (i - s.a) / (s.b - s.a - 1) - 0.5 : 0;
        ctx.moveTo(x, fb);
        ctx.lineTo(Math.round(tc + u * spread) + 0.5, ty - 5);
      }
      ctx.stroke();
      drawScene(ctx, pal, s, 0.5, tl, ty, tr - tl, th);
    }

    // the changes the playhead has passed
    ctx.fillStyle = css(pal.acc);
    for (let e = 1; e < k; e++) {
      const b = scenes[e].a;
      if (p < b) continue;
      ctx.fillRect(Math.round(fx(b) - gap / 2 - 0.5), fy - band - 4, 1, fh + band * 2 + 8);
    }

    // the playhead
    if (p < n) {
      const x = Math.round(pad + (p / n) * (W - pad * 2));
      ctx.fillStyle = css(pal.tx);
      ctx.fillRect(x, fy - band - 6, 1, fh + band * 2 + 12);
    }
  }

  const live = living({
    el: well,
    fps: 30,
    paused: true,
    tick(dt) {
      clock += dt;
      if (clock > n * FRAME_MS + HOLD_MS) {
        seed = (Math.imul(seed, 48271) % 2147483647) >>> 0;
        scenes = video(seed, n);
        clock = 0;
      }
      draw();
    },
  });

  const offControls = onControls(() => {
    pal = readPalette(host);
    draw();
  });

  layout();
  draw();

  return {
    setActive(active) {
      if (active === on) return;
      on = active;
      if (STILL) return;
      if (on && !Number.isFinite(clock)) clock = n * FRAME_MS + HOLD_MS; // start on a new video
      live.setPaused(!on);
    },
    dispose() {
      live.dispose();
      offControls();
      surface.dispose();
    },
  };
};

export default mount;
