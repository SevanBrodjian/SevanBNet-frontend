import { useEffect, useRef, useState } from "react";
import { living, STILL, TIER } from "../../frame/live";
import { clamp } from "../../frame/util";
import { adam, makeSonar, type Sonar } from "./model";

// The reduced renderer, live: Adam fits a height field to one simulated sonar frame,
// starting from flat ground. It starts by itself the first time it comes into view and
// stops after MAX steps. Drag the height field (or use the arrow keys) to turn it.
// - all set-up work is sliced so the page never blocks; one to three steps a frame
// - on the shared loop: capped, paused offscreen and in hidden tabs
// - reduced motion: nothing starts by itself; Fit computes the result and shows it

const CONFIG = {
  NB: 48,
  NS: 96,
  NR: 96,
  H: 2.2,
  d0: 1.6,
  d1: 12,
  TH: 14,
  sig: 0.9,
  K: 4,
  G: 1.5,
  bumps: 7,
  amp: 1,
  channel: 1,
  ripple: 0.025,
};
const MAX = 300;
const LR = 0.01;
const PRIOR: [number, number, number] = [5e-3, 5e-3, 1e-4];
const SPECKLE = 0.65;

/** Run a generator in slices of a few milliseconds, yielding to the page between them. */
function slices(gen: Generator, alive: () => boolean, ms = 6) {
  return new Promise<void>((resolve) => {
    const run = () => {
      if (!alive()) return;
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        if (gen.next().done) {
          resolve();
          return;
        }
      }
      setTimeout(run, 0);
    };
    run();
  });
}

/** Pack a colour for a little-endian ImageData word. */
const u32 = (r: number, g: number, b: number) =>
  ((255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;

type Fan = {
  lut: Int32Array;
  img: ImageData;
  buf: Uint32Array;
  ax: number;
  ay: number;
  R0: number;
  r0: number;
};

type Api = { toggle: () => void; reset: () => void; renew: () => void };

export default function SonarDemo() {
  const grid = useRef<HTMLDivElement>(null);
  const cvT = useRef<HTMLCanvasElement>(null);
  const cvR = useRef<HTMLCanvasElement>(null);
  const cvM = useRef<HTMLCanvasElement>(null);
  const rStep = useRef<HTMLElement>(null);
  const rLoss = useRef<HTMLElement>(null);
  const rErr = useRef<HTMLElement>(null);
  const api = useRef<Api | null>(null);
  const [run, setRun] = useState<"fit" | "pause" | "resume" | "again">("fit");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = grid.current;
    const tC = cvT.current;
    const rC = cvR.current;
    const mC = cvM.current;
    if (!host || !tC || !rC || !mC) return;
    let alive = true;
    const isAlive = () => alive;

    let S: Sonar | null = null;
    let seed = 7;
    let truth = new Float32Array(0);
    let target = new Float32Array(0);
    let h = new Float32Array(0);
    let g = new Float32Array(0);
    let R = new Float32Array(0);
    let step: (x: Float32Array, g: Float32Array) => void = () => {};
    let n = 0;
    let loss = Number.NaN;
    let err = 0;
    let norm = 1;
    let running = false;
    let started = false;
    let yaw = -0.62;
    let pitch = 0.52;
    const fans = new Map<HTMLCanvasElement, Fan>();

    const measure = () => {
      let e = 0;
      for (let k = 0; k < h.length; k++) e += (h[k] - truth[k]) ** 2;
      err = Math.sqrt(e / Math.max(1, h.length));
    };

    function reset(newSeed: boolean) {
      if (!S) return;
      if (newSeed) seed = (seed * 7919 + 101) % 99991;
      truth = S.terrain(seed);
      target = S.sensor(truth, seed, SPECKLE);
      h = new Float32Array(truth.length);
      g = new Float32Array(truth.length);
      R = new Float32Array(S.NB * S.NR);
      step = adam(h.length, LR);
      n = 0;
      norm = 0;
      for (const v of target) norm = Math.max(norm, v);
      norm ||= 1;
      S.render(h, R);
      loss = S.lossGrad(h, target, g, PRIOR);
      measure();
      fitKey = "";
      draw(true);
    }

    function one() {
      if (!S) return;
      const L = S.lossGrad(h, target, g, PRIOR);
      if (!Number.isFinite(L)) {
        reset(false);
        return;
      }
      step(h, g);
      for (let k = 0; k < h.length; k++) h[k] = clamp(h[k], -2, 2);
      n++;
      loss = L;
    }

    const dprOf = () => Math.min(devicePixelRatio || 1, 2);
    function size(cv: HTMLCanvasElement) {
      const dpr = dprOf();
      const W = Math.max(2, Math.round(cv.clientWidth * dpr));
      const H = Math.max(2, Math.round(cv.clientHeight * dpr));
      if (cv.width !== W || cv.height !== H) {
        cv.width = W;
        cv.height = H;
        fans.delete(cv);
      }
      return dpr;
    }

    // Which data cell each pixel of a fan shows, built a few rows at a time.
    function* lutGen(cv: HTMLCanvasElement): Generator {
      if (!S) return;
      const dpr = size(cv);
      const W = cv.width;
      const Hh = cv.height;
      const TH = S.TH;
      const top = 30 * dpr;
      const bot = 12 * dpr;
      const ax = W / 2;
      const ay = Hh - bot;
      const R0 = Math.max(10, Math.min(ay - top, (W / 2 - 8 * dpr) / Math.sin(TH)));
      const r0 = (R0 * S.rmin) / S.rmax;
      const lut = new Int32Array(W * Hh).fill(-1);
      const { NB, NR } = S;
      for (let y = Math.max(0, Math.floor(ay - R0)); y < ay; y++) {
        for (let x = 0; x < W; x++) {
          const dx = x - ax;
          const dy = ay - y;
          const r = Math.hypot(dx, dy);
          const th = Math.atan2(dx, dy);
          if (r >= r0 && r <= R0 && Math.abs(th) <= TH) {
            const j = Math.min(NB - 1, Math.round(((th + TH) / (2 * TH)) * (NB - 1)));
            const q = Math.min(NR - 1, (((r - r0) / (R0 - r0)) * NR) | 0);
            lut[y * W + x] = j * NR + q;
          }
        }
        if ((y & 15) === 15) yield;
      }
      const img = cv.getContext("2d")?.createImageData(W, Hh);
      if (!img) return;
      fans.set(cv, { lut, img, buf: new Uint32Array(img.data.buffer), ax, ay, R0, r0 });
    }

    let lutToken = 0;
    function luts() {
      const token = ++lutToken;
      return slices(
        (function* () {
          yield* lutGen(tC as HTMLCanvasElement);
          yield* lutGen(rC as HTMLCanvasElement);
        })(),
        () => alive && token === lutToken,
        5,
      ).then(() => draw(true));
    }

    const BG = u32(5, 5, 6);
    function fan(cv: HTMLCanvasElement, data: Float32Array) {
      const F = fans.get(cv);
      const ctx = cv.getContext("2d");
      if (!F || !ctx || !S) return;
      const { lut, buf } = F;
      for (let q = 0; q < lut.length; q++) {
        const k = lut[q];
        if (k < 0) {
          buf[q] = BG;
          continue;
        }
        const v = Math.min(1, (data[k] / norm) * 1.15);
        buf[q] = u32(10 + v * 200, 10 + v * 206, 10 + v * 212);
      }
      ctx.putImageData(F.img, 0, 0);
      const { ax, ay, R0, r0 } = F;
      const TH = S.TH;
      ctx.strokeStyle = "rgba(236,233,226,.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 1; k <= 3; k++) {
        const rr = r0 + ((R0 - r0) * k) / 3;
        ctx.moveTo(ax + Math.sin(-TH) * rr, ay - Math.cos(TH) * rr);
        ctx.arc(ax, ay, rr, -Math.PI / 2 - TH, -Math.PI / 2 + TH);
      }
      ctx.stroke();
    }

    // The height field as a wireframe, framed once per view so it does not jump.
    let fitKey = "";
    let fv = [1, 0, 0];
    function mesh() {
      const ctx = mC?.getContext("2d");
      if (!S || !mC || !ctx) return;
      const dpr = size(mC);
      const W = mC.width;
      const Hh = mC.height;
      ctx.fillStyle = "#050506";
      ctx.fillRect(0, 0, W, Hh);
      const cx = 6.9;
      const Z = 2.5;
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const ct = Math.cos(pitch);
      const st = Math.sin(pitch);
      const dist = 13;
      const { NB, NS, D, TJ } = S;
      const cam = (d: number, th: number, zz: number) => {
        const x0 = d * Math.cos(th) - cx;
        const y0 = d * Math.sin(th);
        const z = zz * Z;
        const x = x0 * cy - y0 * sy;
        const y = x0 * sy + y0 * cy;
        const dep = x * ct - z * st + dist;
        return [y / dep, (x * st + z * ct) / dep];
      };
      const key = `${yaw}|${pitch}|${seed}|${W}|${Hh}`;
      if (fitKey !== key) {
        let a = 1e9;
        let b = -1e9;
        let c = 1e9;
        let e = -1e9;
        for (let j = 0; j < NB; j += 3)
          for (let i = 0; i < NS; i += 3) {
            const [u, v] = cam(D[i], TJ[j], truth[j * NS + i]);
            a = Math.min(a, u);
            b = Math.max(b, u);
            c = Math.min(c, v);
            e = Math.max(e, v);
          }
        const ff = Math.min((W * 0.84) / (b - a), (Hh * 0.62) / (e - c));
        fv = [ff, W / 2 - (ff * (a + b)) / 2, Hh * 0.55 + (ff * (c + e)) / 2];
        fitKey = key;
      }
      const [f, oX, oY] = fv;
      const P = new Float32Array(NB * NS * 2);
      for (let j = 0; j < NB; j++)
        for (let i = 0; i < NS; i++) {
          const [u, v] = cam(D[i], TJ[j], h[j * NS + i]);
          const k = (j * NS + i) * 2;
          P[k] = oX + f * u;
          P[k + 1] = oY - f * v;
        }
      ctx.lineWidth = Math.max(1, dpr * 0.75);
      ctx.strokeStyle = "rgba(232,162,58,.82)";
      ctx.beginPath();
      for (let j = 0; j < NB; j++)
        for (let i = 0; i < NS; i++) {
          const k = (j * NS + i) * 2;
          if (i) ctx.lineTo(P[k], P[k + 1]);
          else ctx.moveTo(P[k], P[k + 1]);
        }
      for (let i = 0; i < NS; i += 2)
        for (let j = 0; j < NB; j++) {
          const k = (j * NS + i) * 2;
          if (j) ctx.lineTo(P[k], P[k + 1]);
          else ctx.moveTo(P[k], P[k + 1]);
        }
      ctx.stroke();
      const [su, sv] = cam(0, 0, S.H);
      ctx.fillStyle = "#ECE9E2";
      ctx.fillRect(oX + f * su - 2 * dpr, oY - f * sv - 2 * dpr, 4 * dpr, 4 * dpr);
    }

    function draw(all: boolean) {
      if (!S || !target.length) return;
      if (all) fan(tC as HTMLCanvasElement, target);
      fan(rC as HTMLCanvasElement, R);
      mesh();
      if (rStep.current) rStep.current.textContent = String(n).padStart(3, "0");
      if (rLoss.current)
        rLoss.current.textContent = Number.isFinite(loss) ? loss.toExponential(2) : "–";
      if (rErr.current) rErr.current.textContent = `${(err * 100).toFixed(1)} cm`;
    }

    const label = () => (running ? "pause" : n >= MAX ? "again" : n ? "resume" : "fit");
    function setRunning(on: boolean) {
      running = on && n < MAX && !!S;
      loop.setPaused(!running);
      setRun(label());
    }

    const loop = living({
      el: host,
      fps: TIER === "C" ? 15 : TIER === "B" ? 24 : 30,
      budget: 9,
      paused: true,
      slow() {
        loop.fps = Math.max(10, Math.round(loop.fps * 0.66));
      },
      onVisible(visible) {
        // The first time it is seen, it starts fitting by itself.
        if (visible && !started && S && !STILL) {
          started = true;
          setRunning(true);
        }
      },
      tick(dt) {
        if (!running || !S) return;
        const k = clamp(Math.round(dt / (1000 / loop.fps)), 1, 3);
        for (let i = 0; i < k && n < MAX; i++) one();
        S.render(h, R);
        measure();
        draw(false);
        if (n >= MAX) setRunning(false);
      },
    });

    // Under reduced motion, Fit computes the whole fit in slices and shows the end.
    let computing = false;
    function fitStill() {
      if (computing) return;
      computing = true;
      slices(
        (function* () {
          while (n < MAX) {
            one();
            yield;
          }
        })(),
        isAlive,
      ).then(() => {
        computing = false;
        if (!S) return;
        S.render(h, R);
        measure();
        draw(false);
        setRun(label());
      });
    }

    api.current = {
      toggle() {
        if (!S) return;
        started = true;
        if (n >= MAX) reset(false);
        if (STILL) fitStill();
        else setRunning(!running);
      },
      reset() {
        if (!S) return;
        started = true;
        setRunning(false);
        reset(false);
        setRun(label());
      },
      renew() {
        if (!S) return;
        started = true;
        const was = running;
        reset(true);
        setRunning(was);
        if (!was) setRun(label());
      },
    };

    // Orbit the height field.
    let drag: [number, number] | null = null;
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag = [e.clientX, e.clientY];
      try {
        mC.setPointerCapture(e.pointerId);
      } catch {
        // Capture is a nicety; dragging still works without it.
      }
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      yaw += (e.clientX - drag[0]) * 0.008;
      pitch = clamp(pitch + (e.clientY - drag[1]) * 0.004, 0.1, 1.3);
      drag = [e.clientX, e.clientY];
      mesh();
    };
    const up = () => {
      drag = null;
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      yaw += e.key === "ArrowLeft" ? -0.1 : 0.1;
      mesh();
    };
    mC.addEventListener("pointerdown", down);
    mC.addEventListener("pointermove", move);
    mC.addEventListener("pointerup", up);
    mC.addEventListener("pointercancel", up);
    mC.addEventListener("lostpointercapture", up);
    mC.addEventListener("keydown", key);

    let rt = 0;
    let first = true;
    const ro = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      clearTimeout(rt);
      rt = window.setTimeout(() => {
        if (!S) return;
        fitKey = "";
        luts();
        mesh();
      }, 120);
    });
    ro.observe(host);

    // The model and the first frame, in slices.
    slices(
      (function* () {
        S = makeSonar(CONFIG);
        yield;
        truth = S.terrain(seed);
        yield;
        reset(false);
        yield;
      })(),
      isAlive,
    )
      .then(luts)
      .then(() => {
        if (!alive) return;
        setReady(true);
        if (loop.visible && !STILL && !started) {
          started = true;
          setRunning(true);
        }
      });

    return () => {
      alive = false;
      loop.dispose();
      ro.disconnect();
      clearTimeout(rt);
      mC.removeEventListener("pointerdown", down);
      mC.removeEventListener("pointermove", move);
      mC.removeEventListener("pointerup", up);
      mC.removeEventListener("pointercancel", up);
      mC.removeEventListener("lostpointercapture", up);
      mC.removeEventListener("keydown", key);
      api.current = null;
    };
  }, []);

  const runLabel = { fit: "Fit", pause: "Pause", resume: "Resume", again: "Again" }[run];
  return (
    <div className="sn">
      <div className="sn-panes" ref={grid}>
        <div className="live mx sn-pane">
          <canvas ref={cvT} role="img" aria-label="Simulated sonar frame of a seafloor" />
          <span className="osd">Sensor</span>
        </div>
        <div className="live mx sn-pane">
          <canvas ref={cvR} role="img" aria-label="Frame rendered from the current estimate" />
          <span className="osd">Render</span>
        </div>
        <div className="live mx sn-pane sn-mesh">
          <canvas
            ref={cvM}
            role="img"
            tabIndex={0}
            aria-label="Estimated height field. Drag, or use the left and right arrow keys, to turn it."
          />
          <span className="osd">Height field</span>
        </div>
      </div>
      <div className="sn-bar">
        <button
          type="button"
          className="btn"
          disabled={!ready}
          onClick={() => api.current?.toggle()}
        >
          {runLabel}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!ready}
          onClick={() => api.current?.reset()}
        >
          Reset
        </button>
        <button
          type="button"
          className="btn"
          disabled={!ready}
          onClick={() => api.current?.renew()}
        >
          New seafloor
        </button>
        <p className="sn-rd" aria-live="off">
          <span>
            step <b ref={rStep}>000</b>
          </span>
          <span>
            loss <b ref={rLoss}>–</b>
          </span>
          <span>
            height error <b ref={rErr}>–</b>
          </span>
        </p>
      </div>
    </div>
  );
}
