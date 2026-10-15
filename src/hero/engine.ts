// Plays the scenes in order and carries one into the next: the flow (./flow) between worlds,
// and from the last back to the first, a blink. The next scene is live under every
// transition. Owns the canvas, the ink and the clock; the Hero component owns when it runs.

import { FLOW_IN, flow, lidsAt } from "./flow";
import { CanvasInk, GLInk, type InkTarget, Pen, releaseGL } from "./ink";
import { lids } from "./lids";
import { ERASE, FILL, Frame, hash, INKFILL, Sketch, smooth } from "./sketch";

export interface Scene {
  /** Seconds since it began. */
  t: number;
  /** Seconds it plays before handing over. */
  dur: number;
  /** Back to its first moment. */
  reset(): void;
  step(dt: number): void;
  draw(sk: Sketch): void;
  /** Where we are heading as it ends (view units): the flow opens from here. */
  exit: [number, number];
  /** A moment that stands for the scene, for still frames (seconds). */
  still: number;
  /** How it hands over to the next: the flow (default) or a blink. */
  out?: "flow" | "blink";
  /** Excitement, 0..1: the hand redraws faster and looser at dramatic beats. */
  excite?: number;
  /** Heavy setup done a little at a time, up to `ms` per frame, from the start of the hero
   *  (the scene must still finish it itself before it first draws). */
  prepare?(ms: number): void;
}

export type SceneMaker = () => Scene;

/** Seconds a flow takes; seconds a blink takes; seconds the eyes take to first open. */
const FLOW = 3.2;
const BLINK = 2.6;
const OPEN = 1.6;
/** Boil frames per second. */
const BOIL_HZ = 10;

const X = new Float32Array(8192);
const Y = new Float32Array(8192);
const W = new Float32Array(8192);

type Phase = "play" | "flow" | "blink" | "open";

export class HeroEngine {
  private ink: InkTarget;
  private pen: Pen;
  private frame = new Frame();
  private fa = new Frame();
  private fb = new Frame();
  private sk = new Sketch(this.frame);
  private scenes: Scene[];
  private idx = 0;
  private phase: Phase = "play";
  private u = 0;
  private swapped = false;
  private boil = 0;
  private clock = 0;
  private cssW = 1;
  private cssH = 1;
  private dpr = 1;

  /** WebGL ink, or the 2D canvas when `flat` (or WebGL is missing). Null when WebGL took the
   *  canvas but failed, e.g. a context lost as it was made: try again flat, on a new canvas. */
  static create(canvas: HTMLCanvasElement, makers: SceneMaker[], flat = false): HeroEngine | null {
    if (!flat) {
      const gl = canvas.getContext("webgl2", {
        alpha: true,
        antialias: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: "low-power",
      });
      if (gl) {
        const ink = gl.isContextLost() ? null : GLInk.create(gl);
        if (ink) return new HeroEngine(canvas, ink, makers);
        releaseGL(gl);
        return null;
      }
    }
    const g = canvas.getContext("2d");
    return g ? new HeroEngine(canvas, new CanvasInk(g), makers) : null;
  }

  private constructor(
    readonly canvas: HTMLCanvasElement,
    ink: InkTarget,
    makers: SceneMaker[],
  ) {
    this.ink = ink;
    this.pen = new Pen(ink);
    this.scenes = makers.map((make) => make());
    this.scenes[0].reset();
  }

  /** The GPU gave a lost context back: its buffers went with it, so build the ink again on
   *  the same context rather than taking a new one. False when that isn't possible. */
  restore(): boolean {
    if (!(this.ink instanceof GLInk)) return false;
    const ink = GLInk.create(this.ink.gl);
    if (!ink) return false;
    ink.color = this.ink.color;
    this.ink = ink;
    this.pen = new Pen(ink);
    return true;
  }

  /** Done with this canvas: give its GPU context back at once. */
  release(): void {
    this.ink.release?.();
  }

  setColor(rgb: [number, number, number]): void {
    this.ink.color = rgb;
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  get A(): number {
    return this.cssW / this.cssH;
  }

  private get next(): number {
    return (this.idx + 1) % this.scenes.length;
  }

  /** Open the eyes on the first scene (the first thing a visitor sees). */
  wake(): void {
    this.phase = "open";
    this.u = 0;
  }

  /** Advance by dt seconds. */
  step(dt: number): void {
    for (const s of this.scenes) s.prepare?.(1.5);
    const ex = this.scenes[this.idx].excite ?? 0;
    this.boil += dt * BOIL_HZ * (1 + 0.5 * ex);
    this.clock += dt;
    const cur = this.scenes[this.idx];
    switch (this.phase) {
      case "play":
        cur.step(dt);
        if (cur.t >= cur.dur && this.scenes.length > 1) this.begin();
        break;
      case "open":
        cur.step(dt);
        this.u += dt / OPEN;
        if (this.u >= 1) this.phase = "play";
        break;
      case "flow":
        // the new world is live under the flow
        this.scenes[this.next].step(dt);
        this.u += dt / FLOW;
        if (this.u >= 1) {
          this.idx = this.next;
          this.phase = "play";
        }
        break;
      case "blink":
        this.u += dt / BLINK;
        if (!this.swapped && lidsAt(this.u) >= 1) {
          this.idx = this.next;
          this.scenes[this.idx].reset();
          this.swapped = true;
        }
        this.scenes[this.idx].step(dt);
        if (this.u >= 1) this.phase = "play";
        break;
    }
  }

  /** Hand over to the next scene. */
  private begin(): void {
    const a = this.scenes[this.idx];
    this.u = 0;
    if (a.out === "blink") {
      this.phase = "blink";
      this.swapped = false;
      return;
    }
    this.drawScene(a, this.fa);
    this.scenes[this.next].reset();
    this.phase = "flow";
  }

  private drawScene(s: Scene, f: Frame): void {
    f.clear();
    this.sk.begin(f, this.A, this.cssH / 2);
    this.sk.boil = Math.floor(this.boil);
    s.draw(this.sk);
  }

  /** Draw the current moment. */
  render(still = false): void {
    const f = this.frame;
    if (this.phase === "flow") {
      const a = this.scenes[this.idx];
      // the new world only starts to be drawn on once the current has the old one moving
      if (this.u > FLOW_IN) this.drawScene(this.scenes[this.next], this.fb);
      else this.fb.clear();
      flow(this.u, this.fa, this.fb, a.exit[0], a.exit[1], this.A, this.idx * 1.7, f);
    } else {
      this.drawScene(this.scenes[this.idx], f);
      const shut =
        this.phase === "blink"
          ? lidsAt(this.u)
          : this.phase === "open"
            ? 1 - smooth(0, 1, this.u) ** 0.8
            : 0;
      if (shut > 0) {
        this.sk.begin(f, this.A, this.cssH / 2);
        lids(this.sk, shut, this.clock);
      }
    }
    this.ink.begin();
    const ex = this.scenes[this.idx].excite ?? 0;
    this.pen.setup(this.dpr, still ? 0 : Math.floor(this.boil), still ? 0.6 : 1 + 0.35 * ex);
    this.inkFrame(f);
    this.ink.flush(this.canvas.width, this.canvas.height);
  }

  /** Strokes and points in the last frame drawn (checks). */
  stats(): { strokes: number; points: number } {
    return { strokes: this.frame.ns, points: this.frame.np };
  }

  /** Jump to scene i at time t (seconds) and hold: reduced motion, and checks. */
  pose(i: number, t?: number): void {
    const n = this.scenes.length;
    this.idx = ((i % n) + n) % n;
    this.phase = "play";
    const s = this.scenes[this.idx];
    s.reset();
    const end = t ?? s.still;
    for (let k = 0; k < end * 60; k++) s.step(1 / 60);
  }

  /** Hold the first opening of the eyes at u in [0, 1] (checks). */
  poseWake(u: number): void {
    this.pose(0, 0);
    this.wake();
    for (let k = 0; k < u * OPEN * 60; k++) this.step(1 / 60);
  }

  /** Jump into the hand-over after scene i, at u in [0, 1] (checks). */
  poseHandover(i: number, u: number): void {
    const n = this.scenes.length;
    const s = this.scenes[((i % n) + n) % n];
    this.pose(i, s.dur - 1e-3);
    this.begin();
    const total = s.out === "blink" ? BLINK : FLOW;
    for (let k = 0; k < u * total * 60; k++) this.step(1 / 60);
  }

  private inkFrame(f: Frame): void {
    const px = this.cssH / 2;
    const cx = this.cssW / 2;
    const cy = this.cssH / 2;
    const A = this.A;
    const d = this.dpr;
    const ink = this.ink;
    for (let s = 0; s < f.ns; s++) {
      const o = f.S[s * 4];
      const n = f.S[s * 4 + 1];
      const kind = f.S[s * 4 + 3];
      if (kind === FILL || kind === INKFILL) {
        for (let i = 0; i + 2 < n; i += 3) {
          const a = o + i;
          ink.tri(
            (f.X[a] * px + cx) * d,
            (f.Y[a] * px + cy) * d,
            (f.X[a + 1] * px + cx) * d,
            (f.Y[a + 1] * px + cy) * d,
            (f.X[a + 2] * px + cx) * d,
            (f.Y[a + 2] * px + cy) * d,
            kind === INKFILL,
          );
        }
        continue;
      }
      const m = Math.min(n, 8192);
      const id = f.S[s * 4 + 2];
      // the drawing gives out toward the edges, like a sketch on a page: lines thin, then
      // stop at a ragged oval that shifts as things move
      const cut = 0.84 + 0.1 * hash(id, 3);
      for (let i = 0; i < m; i++) {
        const x = f.X[o + i];
        const y = f.Y[o + i];
        const r = Math.hypot(x / (A * 0.98), y / 0.98);
        X[i] = x * px + cx;
        Y[i] = y * px + cy;
        W[i] = r > cut ? 0 : f.W[o + i] * (1 - 0.55 * smooth(0.6, cut, r));
      }
      this.pen.stroke(X, Y, W, m, id, kind === ERASE, f.B[s]);
    }
  }
}
