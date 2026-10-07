// Single-View Seafloor Recovery from Imaging Sonar: the fit, live. On the left, the frame
// the sensor saw and the frame rendered from the current estimate; on the right, the
// estimated seafloor as hidden-line ridges (after design B). It rests on a finished fit;
// while active, a new floor is fitted from flat ground by gradient descent, holds, and the
// next one starts. Drag the ridges to turn them.

import { living, STILL, TIER } from "../frame/live";
import { clamp } from "../frame/util";
import {
  type MountWidget,
  onControls,
  type Palette,
  type RGB,
  readPalette,
  rgba,
  Surface,
  slice,
} from "./kit";
import { adam, makeSonar, SMALL } from "./sonar-model";

const MAX = 180; // steps to a fit
const HOLD_MS = 1700;
const LAM: [number, number, number] = [5e-3, 5e-3, 1e-4];
const DH = 0.42; // the fans' drawn half-angle (wider than the sensor's, for legibility)
const SPREAD = 2.3; // the same for the ridges
const EX = 3; // height exaggeration on the ridges

// Sonar colours (design B): deep water to a warm return.
const STOPS: [number, string][] = [
  [0, "#0b0d0e"],
  [0.24, "#0d2730"],
  [0.5, "#11706c"],
  [0.76, "#d9a441"],
  [1, "#fff2d4"],
];
const RAMP = new Uint32Array(256);
{
  const hex = (s: string) => [1, 3, 5].map((i) => Number.parseInt(s.slice(i, i + 2), 16));
  const little = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < STOPS.length - 2 && t > STOPS[k + 1][0]) k++;
    const [t0, c0] = STOPS[k];
    const [t1, c1] = STOPS[k + 1];
    const u = clamp((t - t0) / (t1 - t0), 0, 1);
    const a = hex(c0);
    const b = hex(c1);
    const r = Math.round(a[0] + (b[0] - a[0]) * u);
    const g = Math.round(a[1] + (b[1] - a[1]) * u);
    const bl = Math.round(a[2] + (b[2] - a[2]) * u);
    RAMP[i] = little
      ? ((255 << 24) | (bl << 16) | (g << 8) | r) >>> 0
      : ((r << 24) | (g << 16) | (bl << 8) | 255) >>> 0;
  }
}

type Fan = {
  x: number; // device px
  y: number;
  w: number;
  h: number;
  idx: Int32Array;
  fm: Float32Array;
  fj: Float32Array;
  img: ImageData;
  buf: Uint32Array;
  ax: number;
  ay: number;
  r0: number;
  r1: number;
};

const mount: MountWidget = (host) => {
  const well = document.createElement("div");
  well.className = "pw-well live mx";
  host.append(well);
  let pal: Palette = readPalette(host);
  let wellPx = 0;

  const S = makeSonar(SMALL);
  const n = S.NB * S.NS;
  let seed = 7;
  let target = new Float32Array(S.NB * S.NR);
  const est = new Float32Array(n);
  const grad = new Float32Array(n);
  const rendered = new Float32Array(S.NB * S.NR);
  let opt = adam(n);
  let norm = 1;
  let step = 0;
  let held = 0;
  let ready = false;
  let on = false;
  let alive = true;
  let yaw = 0;

  const surface = new Surface(well, "A seafloor fitted to one sonar frame", () => {
    fans = [];
    draw();
  });
  const { ctx, canvas } = surface;
  canvas.style.touchAction = "pan-y";
  let fans: Fan[] = [];

  function newFloor(next: boolean) {
    if (next) seed = (seed * 7919 + 101) % 99991;
    const truth = S.terrain(seed);
    target = S.sensor(truth, seed, 0.65);
    norm = 0;
    for (const v of target) norm = Math.max(norm, v);
    norm ||= 1;
    est.fill(0);
    opt = adam(n);
    step = 0;
    held = 0;
    S.render(est, rendered);
  }

  function one() {
    const L = S.lossGrad(est, target, grad, LAM);
    if (!Number.isFinite(L)) {
      est.fill(0);
      opt = adam(n);
      return;
    }
    opt(est, grad);
    for (let k = 0; k < n; k++) est[k] = clamp(est[k], -2, 2);
    step++;
  }

  // ---- layout: fans down the left, ridges on the right
  function regions() {
    const W = surface.w;
    const H = surface.h;
    const pad = Math.round(clamp(W * 0.03, 8, 14));
    const lw = Math.round(W * 0.3);
    return {
      pad,
      fanA: [pad, pad, lw - pad, (H - pad * 3) / 2],
      fanB: [pad, pad * 2 + (H - pad * 3) / 2, lw - pad, (H - pad * 3) / 2],
      ridge: [lw + pad, pad, W - lw - pad * 2, H - pad * 2],
    };
  }

  function makeFan(r: number[]): Fan {
    const d = surface.dpr;
    const x = Math.round(r[0] * d);
    const y = Math.round(r[1] * d);
    const w = Math.max(2, Math.round(r[2] * d));
    const h = Math.max(2, Math.round(r[3] * d));
    const pad = 3 * d;
    const r1 = Math.max(4, Math.min(h - pad * 2, (w / 2 - pad) / Math.sin(DH)));
    const r0 = (r1 * S.rmin) / S.rmax;
    const ax = w / 2;
    const ay = h - pad - (h - pad * 2 - r1) / 2;
    const idx = new Int32Array(w * h).fill(-1);
    const fm = new Float32Array(w * h);
    const fj = new Float32Array(w * h);
    for (let py = 0; py < h; py++)
      for (let px = 0; px < w; px++) {
        const dx = px + 0.5 - ax;
        const dy = ay - (py + 0.5);
        const rr = Math.hypot(dx, dy);
        const a = Math.atan2(dx, dy);
        if (rr < r0 || rr > r1 || Math.abs(a) > DH) continue;
        const m = ((rr - r0) / (r1 - r0)) * (S.NR - 1);
        const j = ((a + DH) / (2 * DH)) * (S.NB - 1);
        const m0 = Math.min(S.NR - 2, m | 0);
        const j0 = Math.min(S.NB - 2, j | 0);
        const p = py * w + px;
        idx[p] = j0 * S.NR + m0;
        fm[p] = m - m0;
        fj[p] = j - j0;
      }
    const img = ctx.createImageData(w, h);
    return { x, y, w, h, idx, fm, fj, img, buf: new Uint32Array(img.data.buffer), ax, ay, r0, r1 };
  }

  function paintFan(f: Fan, data: Float32Array) {
    const { idx, fm, fj, buf } = f;
    const NR = S.NR;
    const k1 = 230 / norm;
    for (let p = 0; p < idx.length; p++) {
      const k = idx[p];
      if (k < 0) {
        buf[p] = wellPx;
        continue;
      }
      const a = fm[p];
      const b = fj[p];
      const v =
        (data[k] * (1 - a) + data[k + 1] * a) * (1 - b) +
        (data[k + NR] * (1 - a) + data[k + NR + 1] * a) * b;
      buf[p] = RAMP[clamp((v * k1) | 0, 0, 255)];
    }
    ctx.putImageData(f.img, f.x, f.y);
    // range rings and edges, in CSS px
    const d = surface.dpr;
    const ax = (f.x + f.ax) / d;
    const ay = (f.y + f.ay) / d;
    const r0 = f.r0 / d;
    const r1 = f.r1 / d;
    ctx.strokeStyle = rgba(pal.tx, 0.16);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const s of [-1, 1]) {
      ctx.moveTo(ax + s * Math.sin(DH) * r0, ay - Math.cos(DH) * r0);
      ctx.lineTo(ax + s * Math.sin(DH) * r1, ay - Math.cos(DH) * r1);
    }
    for (const q of [0.5, 1]) {
      const rr = r0 + (r1 - r0) * q;
      ctx.moveTo(ax + Math.sin(-DH) * rr, ay - Math.cos(DH) * rr);
      ctx.arc(ax, ay, rr, -Math.PI / 2 - DH, -Math.PI / 2 + DH);
    }
    ctx.stroke();
  }

  // ---- the ridges: rows of constant range, nearest last, each hiding what is behind it
  const P = new Float32Array(S.NB * 2);
  function ridge(r: number[]) {
    const [rx, ry, rw, rh] = r;
    const pitch = 0.52;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const fy = Math.cos(pitch);
    const fz = -Math.sin(pitch);
    const cam = 15;
    const mid = (S.D[0] + S.D[S.NS - 1]) / 2;
    const raw = (X: number, Y: number, Z: number, out: Float32Array, o: number) => {
      const qy = Y - mid;
      const vx = X * cy - qy * sy;
      const ry2 = X * sy + qy * cy;
      const vy = ry2 + cam * fy;
      const vz = Z + cam * fz;
      const depth = vy * fy + vz * fz;
      out[o] = vx / depth;
      out[o + 1] = -(vy * -fz + vz * fy) / depth;
    };
    // fit the footprint (with headroom for relief) to the region; independent of the floor
    let x0 = 1e9;
    let x1 = -1e9;
    let y0 = 1e9;
    let y1 = -1e9;
    const q = new Float32Array(2);
    for (const i of [0, S.NS - 1])
      for (let j = 0; j < S.NB; j += 3)
        for (const z of [-0.25, 0.55]) {
          const th = S.TJ[j] * SPREAD;
          raw(S.D[i] * Math.sin(th), S.D[i] * Math.cos(th), z * EX, q, 0);
          x0 = Math.min(x0, q[0]);
          x1 = Math.max(x1, q[0]);
          y0 = Math.min(y0, q[1]);
          y1 = Math.max(y1, q[1]);
        }
    const F = Math.min(rw / (x1 - x0), rh / (y1 - y0));
    const ox = rx + rw / 2 - ((x0 + x1) / 2) * F;
    const oy = ry + rh / 2 - ((y0 + y1) / 2) * F;
    const line = (h: Float32Array, i: number) => {
      for (let j = 0; j < S.NB; j++) {
        const th = S.TJ[j] * SPREAD;
        raw(S.D[i] * Math.sin(th), S.D[i] * Math.cos(th), h[j * S.NS + i] * EX, P, j * 2);
        P[j * 2] = ox + P[j * 2] * F;
        P[j * 2 + 1] = oy + P[j * 2 + 1] * F;
      }
    };
    ctx.save();
    ctx.beginPath();
    ctx.rect(rx, ry, rw, rh);
    ctx.clip();
    const st = rh < 220 ? 3 : 2;
    const bottom = ry + rh + 2;
    ctx.lineWidth = 1;
    for (let i = S.NS - 1; i >= 0; i -= st) {
      line(est, i);
      ctx.beginPath();
      ctx.moveTo(P[0], P[1]);
      for (let j = 1; j < S.NB; j++) ctx.lineTo(P[j * 2], P[j * 2 + 1]);
      ctx.lineTo(P[(S.NB - 1) * 2], bottom);
      ctx.lineTo(P[0], bottom);
      ctx.closePath();
      ctx.fillStyle = rgba(pal.well);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(P[0], P[1]);
      for (let j = 1; j < S.NB; j++) ctx.lineTo(P[j * 2], P[j * 2 + 1]);
      ctx.strokeStyle = rgba(pal.tx, 0.32 + 0.6 * (1 - i / S.NS));
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    if (!ready) return;
    const W = surface.w;
    const H = surface.h;
    surface.reset();
    ctx.clearRect(0, 0, W, H);
    const r = regions();
    if (!fans.length) fans = [makeFan(r.fanA), makeFan(r.fanB)];
    paintFan(fans[0], target);
    paintFan(fans[1], rendered);
    ridge(r.ridge);
  }

  function setWell() {
    const [r, g, b] = pal.well as RGB;
    wellPx = new Uint32Array(new Uint8ClampedArray([r, g, b, 255]).buffer)[0];
  }

  const live = living({
    el: well,
    fps: TIER === "A" ? 30 : 24,
    paused: true,
    budget: 12,
    slow() {
      live.fps = Math.max(12, Math.round(live.fps * 0.7));
    },
    tick(dt) {
      if (!ready) return;
      if (step >= MAX) {
        held += dt;
        if (held < HOLD_MS) return;
        newFloor(true);
      } else {
        // One step a frame while the floor first rises, then quicker.
        const k = clamp(Math.round(dt / (1000 / live.fps)), 1, 2) * (step < 40 ? 1 : 2);
        for (let i = 0; i < k && step < MAX; i++) one();
        S.render(est, rendered);
      }
      draw();
    },
  });

  // Turn the ridges by dragging.
  let drag: number | null = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    drag = e.clientX;
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (drag === null) return;
    yaw = clamp(yaw + (e.clientX - drag) * 0.006, -0.8, 0.8);
    drag = e.clientX;
    if (live.paused) draw();
  });
  const undrag = () => {
    drag = null;
  };
  canvas.addEventListener("pointerup", undrag);
  canvas.addEventListener("pointercancel", undrag);

  const offControls = onControls(() => {
    pal = readPalette(host);
    setWell();
    draw();
  });

  // The model and a finished fit for the still frame, in slices so the page never blocks.
  setWell();
  slice(
    (function* () {
      newFloor(false);
      yield;
      while (step < MAX) {
        one();
        if (step % 3 === 0) yield;
      }
      S.render(est, rendered);
    })(),
    () => alive,
  ).then((done) => {
    if (!done) return;
    ready = true;
    draw();
    if (on) start();
  });

  /** Run (a finished fit starts over on a new floor, from flat ground). Still: stay put. */
  function start() {
    if (STILL) return;
    if (step >= MAX) {
      newFloor(true);
      draw();
    }
    live.setPaused(false);
  }

  return {
    setActive(active) {
      if (active === on) return;
      on = active;
      if (!ready) return;
      if (on) start();
      else live.setPaused(true);
    },
    dispose() {
      alive = false;
      live.dispose();
      offControls();
      surface.dispose();
    },
  };
};

export default mount;
