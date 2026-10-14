// Kuramoto Orientation Diffusion Models: an orientation field (fingerprints, flows, wood
// grain, crystal domains, textures) written as oscillator phases, phi = 2 theta, and the
// forward process run on it: a stochastic Kuramoto system on the grid where neighbours
// couple, a reference phase pulls harder as t grows, noise is added, and the field falls
// into synchrony. The trajectory is integrated once per sample, in slices; t scrubs it
// either way. Nothing here is learned or generated: the paper trains the model that runs
// it backward. While active it plays: data, the fall into sync, then the next sample.

import { living, STILL } from "../frame/live";
import { clamp, rng } from "../frame/util";
import { gauss, type MountWidget, onControls, readPalette, rgba, Surface, slice } from "./kit";

const TAU = Math.PI * 2;
const wrap = (a: number) => a - TAU * Math.floor((a + Math.PI) / TAU);
const P = { cell: 9, K: 2.4, Kref: 1.3, D: 0.045, local: 0.85, steps: 120, len: 0.8 };
const PLAY_MS = 2900; // data to sync
const HOLD_DATA = 1000;
const HOLD_SYNC = 800;

type Field = (u: number, v: number) => number; // orientation at (u, v), radians

/** Orientation fields with real structure. u in 0..1 across, v in 0..aspect down. */
const FAMILIES: ((r: () => number, aspect: number) => Field)[] = [
  // fingerprint: cores and deltas (a zero-pole model); a whorl or a loop
  (r, asp) => {
    const whorl = r() < 0.55;
    const cx = 0.42 + r() * 0.16;
    const cy = asp * (0.34 + r() * 0.14);
    const sp = 0.08 + r() * 0.08;
    const dy = asp * (0.42 + r() * 0.12);
    const poles: [number, number, number][] = whorl
      ? [
          [cx - sp, cy, 1],
          [cx + sp, cy + (r() - 0.5) * 0.06, 1],
          [cx - 0.34 - r() * 0.06, cy + dy, -1],
          [cx + 0.34 + r() * 0.06, cy + dy, -1],
        ]
      : [
          [cx, cy, 1],
          [cx + (r() < 0.5 ? -1 : 1) * (0.18 + r() * 0.12), cy + dy * 0.8, -1],
        ];
    const w = r() * 6;
    return (u, v) => {
      let th = 0;
      for (const [px, py, s] of poles) th += 0.5 * s * Math.atan2(v - py, u - px);
      return th + 0.08 * Math.sin(u * 9 + w) * Math.cos(v * 7 - w);
    };
  },
  // flow: streamlines around a few vortices in a drifting current
  (r, asp) => {
    const vs = Array.from({ length: 3 + Math.floor(r() * 3) }, () => [
      r(),
      r() * asp,
      (r() < 0.5 ? -1 : 1) * (0.6 + r()),
      0.12 + r() * 0.16,
    ]);
    const drift = (r() - 0.5) * 1.2;
    return (u, v) => {
      let fx = drift;
      let fy = 0.25;
      for (const [x, y, a, s] of vs) {
        const dx = u - x;
        const dy = v - y;
        const e = (a * Math.exp(-(dx * dx + dy * dy) / (s * s))) / (s * s);
        fx += -dy * e;
        fy += dx * e;
      }
      return Math.atan2(fy, fx);
    };
  },
  // wood grain: level lines of a wavy field, swirling around knots
  (r, asp) => {
    const knots = Array.from({ length: 2 + Math.floor(r() * 3) }, () => [
      0.1 + r() * 0.8,
      (0.1 + r() * 0.8) * asp,
      0.06 + r() * 0.07,
      (0.06 + r() * 0.08) * (r() < 0.5 ? -1 : 1),
    ]);
    const ph = r() * 6;
    const f = 4 + r() * 4;
    return (u, v) => {
      let gx = 0.3 * Math.cos(u * f + ph);
      let gy = 1;
      for (const [x, y, s, a] of knots) {
        const dx = u - x;
        const dy = v - y;
        const e = (-2 * a * Math.exp(-(dx * dx + dy * dy) / (s * s))) / (s * s);
        gx += dx * e;
        gy += dy * e;
      }
      return Math.atan2(gy, gx) + Math.PI / 2;
    };
  },
  // crystal domains: Voronoi grains, each with its own gently curving orientation
  (r, asp) => {
    const grains = Array.from({ length: 7 + Math.floor(r() * 6) }, () => [
      r(),
      r() * asp,
      r() * Math.PI,
      (r() - 0.5) * 6,
    ]);
    return (u, v) => {
      let best = 1e9;
      let th = 0;
      for (const [x, y, a, k] of grains) {
        const d = (u - x) ** 2 + (v - y) ** 2;
        if (d < best) {
          best = d;
          th = a + k * (u - x) * (v - y);
        }
      }
      return th;
    };
  },
  // texture: level lines of a few crossed waves (labyrinths, saddles, whorls)
  (r) => {
    const waves = Array.from({ length: 3 }, () => {
      const a = r() * Math.PI;
      const f = 5 + r() * 7;
      return [Math.cos(a) * f, Math.sin(a) * f, r() * TAU, 0.5 + r() * 0.5];
    });
    return (u, v) => {
      let gx = 0;
      let gy = 0;
      for (const [kx, ky, p, a] of waves) {
        const c = a * Math.cos(kx * u + ky * v + p);
        gx += kx * c;
        gy += ky * c;
      }
      return Math.atan2(gy, gx) + Math.PI / 2;
    };
  },
];

/** A family's field, turned by a random angle about the middle, so no two samples sit alike. */
function field(family: number, r: () => number, asp: number): Field {
  const f = FAMILIES[family % FAMILIES.length](r, asp);
  const a = (r() - 0.5) * Math.PI * 0.9;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const mx = 0.5;
  const my = asp / 2;
  return (u, v) => {
    const x = u - mx;
    const y = v - my;
    return f(mx + c * x + s * y, my - s * x + c * y) + a;
  };
}

const mount: MountWidget = (host) => {
  const well = document.createElement("div");
  well.className = "pw-well live mx";
  host.append(well);

  const bar = document.createElement("div");
  bar.className = "pw-bar";
  const play = document.createElement("button");
  play.type = "button";
  play.className = "btn pw-play";
  play.append(document.createElement("i"));
  const range = document.createElement("input");
  range.type = "range";
  range.min = "0";
  range.max = "1";
  range.step = "0.001";
  range.value = "0";
  range.setAttribute("aria-label", "Diffusion time t, from data to synchrony");
  const out = document.createElement("output");
  out.textContent = "t 0.00";
  const next = document.createElement("button");
  next.type = "button";
  next.className = "btn";
  next.textContent = "New";
  const end = (text: string) => {
    const s = document.createElement("span");
    s.textContent = text;
    s.setAttribute("aria-hidden", "true");
    return s;
  };
  bar.append(play, end("Data"), range, end("Sync"), out, next);
  host.append(bar);

  let pal = readPalette(host);
  let nx = 0;
  let ny = 0;
  let N = 0;
  const FR = P.steps;
  let traj = new Float32Array(0);
  let done = 0;
  let seed = 11;
  let family = 0;
  let tt = 0;
  let anim: 1 | -1 | 0 = 0; // playing forward, back, or not
  let auto = false; // playing on its own (pointer over the paper)
  let manual = false; // someone took the controls; no autoplay until the next visit
  let hold = 0;
  let job = 0;
  let alive = true;

  const surface = new Surface(
    well,
    "An orientation field drawn as short strokes, one per oscillator",
    () => compute(),
  );
  const { ctx } = surface;

  function sample(r: () => number) {
    const asp = ny / nx;
    const f = field(family, r, asp);
    const ph = new Float32Array(N);
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) ph[y * nx + x] = wrap(2 * f((x + 0.5) / nx, (y + 0.5) / nx));
    return ph;
  }

  function compute() {
    const my = ++job;
    const r = rng(seed);
    nx = Math.max(8, Math.floor(surface.w / P.cell));
    ny = Math.max(5, Math.floor(surface.h / P.cell));
    N = nx * ny;
    traj = new Float32Array(N * (FR + 1));
    const ph = sample(r);
    traj.set(ph, 0);
    done = 0;
    const dt = 12 / FR;
    const nxt = new Float32Array(N);
    const stepOnce = (s: number) => {
      const q = s / FR;
      const Kt = P.K * (0.25 + 0.75 * q);
      const Kr = P.Kref * q * q;
      const amp = Math.sqrt(2 * P.D * dt);
      let mc = 0;
      let ms = 0;
      for (let i = 0; i < N; i++) {
        mc += Math.cos(ph[i]);
        ms += Math.sin(ph[i]);
      }
      mc /= N;
      ms /= N;
      const R = Math.hypot(mc, ms);
      const psi = Math.atan2(ms, mc);
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          const i = y * nx + x;
          const p = ph[i];
          let sl = 0;
          let c = 0;
          if (x > 0) {
            sl += Math.sin(ph[i - 1] - p);
            c++;
          }
          if (x < nx - 1) {
            sl += Math.sin(ph[i + 1] - p);
            c++;
          }
          if (y > 0) {
            sl += Math.sin(ph[i - nx] - p);
            c++;
          }
          if (y < ny - 1) {
            sl += Math.sin(ph[i + nx] - p);
            c++;
          }
          const coup = P.local * (sl / c) + (1 - P.local) * R * Math.sin(psi - p);
          nxt[i] = wrap(p + (Kt * coup + Kr * Math.sin(-p)) * dt + amp * gauss(r));
        }
      ph.set(nxt);
      traj.set(ph, s * N);
      done = s;
    };
    slice(
      (function* () {
        for (let s = 1; s <= FR; s++) {
          if (my !== job) return;
          stepOnce(s);
          if (s % 3 === 0) yield;
        }
      })(),
      () => alive && my === job,
    ).then((ok) => {
      if (ok && tt > 0) draw();
    });
    draw();
  }

  function phaseAt(i: number, f: number) {
    const g = Math.min(f, done);
    const a = Math.floor(g);
    const b = Math.min(done, a + 1);
    const u = g - a;
    const p0 = traj[a * N + i];
    return p0 + wrap(traj[b * N + i] - p0) * u;
  }

  function draw() {
    if (!N) return;
    const W = surface.w;
    const H = surface.h;
    surface.reset();
    ctx.clearRect(0, 0, W, H);
    const f = tt * FR;
    const gx = W / nx;
    const gy = H / ny;
    const L = Math.min(gx, gy) * P.len * 0.5;
    ctx.lineWidth = 1.1;
    ctx.lineCap = "butt";
    ctx.strokeStyle = rgba(pal.tx, 0.86);
    const path = new Path2D();
    for (let i = 0; i < N; i++) {
      const x = i % nx;
      const y = (i / nx) | 0;
      const th = phaseAt(i, f) / 2;
      const cx = (x + 0.5) * gx;
      const cy = (y + 0.5) * gy;
      const dx = Math.cos(th) * L;
      const dy = Math.sin(th) * L;
      path.moveTo(cx - dx, cy - dy);
      path.lineTo(cx + dx, cy + dy);
    }
    ctx.stroke(path);
    out.textContent = `t ${tt.toFixed(2)}`;
    if (document.activeElement !== range) range.value = String(tt);
  }

  function icon() {
    const going = anim !== 0 || auto;
    const fwd = tt < 0.999;
    play.dataset.state = going ? "pause" : fwd ? "play" : "rew";
    play.setAttribute("aria-label", going ? "Pause" : fwd ? "Play forward" : "Rewind");
  }

  function newSample() {
    seed = (Math.imul(seed, 48271) % 2147483647) >>> 0;
    family++;
    tt = 0;
    compute();
  }

  const live = living({
    el: well,
    fps: 60,
    paused: true,
    tick(dt) {
      if (auto) {
        // data, the fall into sync, a moment of sync, the next sample
        if (hold > 0) {
          hold -= dt;
          if (hold > 0) return;
          if (tt >= 1) {
            newSample();
            hold = HOLD_DATA;
            icon();
            return;
          }
        }
        tt = clamp(tt + dt / PLAY_MS, 0, 1);
        if (tt >= 1) hold = HOLD_SYNC;
        draw();
        return;
      }
      if (!anim) {
        live.setPaused(true);
        return;
      }
      tt = clamp(tt + (anim * dt) / PLAY_MS, 0, 1);
      draw();
      if ((anim > 0 && tt >= 1) || (anim < 0 && tt <= 0)) {
        anim = 0;
        live.setPaused(true);
        icon();
      }
    },
  });

  /** Someone used the controls: stop playing on our own until the pointer comes back. */
  function takeOver() {
    manual = true;
    auto = false;
    hold = 0;
  }

  play.addEventListener("click", () => {
    const going = anim !== 0 || auto;
    takeOver();
    if (going) {
      anim = 0;
      live.setPaused(true);
      icon();
      return;
    }
    const dir = tt < 0.999 ? 1 : -1;
    if (STILL) {
      tt = dir > 0 ? 1 : 0;
      draw();
      icon();
      return;
    }
    anim = dir;
    icon();
    live.setPaused(false);
  });
  range.addEventListener("input", () => {
    takeOver();
    anim = 0;
    live.setPaused(true);
    tt = Number(range.value);
    draw();
    icon();
  });
  next.addEventListener("click", () => {
    takeOver();
    anim = 0;
    live.setPaused(true);
    newSample();
    icon();
  });

  const offControls = onControls(() => {
    pal = readPalette(host);
    draw();
  });

  compute();
  icon();

  return {
    setActive(on) {
      if (!on) {
        manual = false;
        auto = false;
        anim = 0;
        live.setPaused(true);
        icon();
        return;
      }
      if (STILL || manual || auto) return;
      auto = true;
      // A finished run starts on a new sample; otherwise carry on from here.
      if (tt >= 1) {
        newSample();
        hold = HOLD_DATA;
      } else hold = tt === 0 ? HOLD_DATA * 0.5 : 0;
      icon();
      live.setPaused(false);
    },
    dispose() {
      alive = false;
      job++;
      live.dispose();
      offControls();
      surface.dispose();
    },
  };
};

export default mount;
