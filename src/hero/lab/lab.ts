// A page for working on the hero outside the site (dev only, not built): one scene, or a
// hand-over between two, at a chosen size, on a clock the page drives.
//
//   /src/hero/lab/index.html?scene=door             plays door on a loop
//   ?scene=door&t=6                                  holds door at 6 s
//   ?from=door&to=jungle&u=0.4                       holds the hand-over at 0.4
//   &w=820&h=700                                     canvas size in CSS px (default 820 x 700)
//   window.lab.wake(u)                               the eyes opening on the first scene
// window.lab: pose(t), handover(u), play(), bench(n), stats()

import { HeroEngine, type SceneMaker } from "../engine";

const q = new URLSearchParams(location.search);
const W = +(q.get("w") ?? 820);
const H = +(q.get("h") ?? 700);
const box = document.getElementById("box") as HTMLDivElement;
box.style.width = `${W}px`;
box.style.height = `${H}px`;

const load = async (name: string): Promise<SceneMaker> => {
  const mod = (await import(`../scenes/${name}.ts`)) as Record<string, SceneMaker>;
  const make = mod[name];
  if (!make) throw new Error(`scenes/${name}.ts has no export ${name}`);
  return make;
};

const names = q.get("from")
  ? [q.get("from") as string, q.get("to") ?? (q.get("from") as string)]
  : [q.get("scene") ?? "door"];
const makers = await Promise.all(names.map(load));
const canvas = document.createElement("canvas");
box.append(canvas);
const engine = HeroEngine.create(canvas, makers);
if (!engine) throw new Error("no ink");
engine.setColor([0xee / 255, 0xeb / 255, 0xe4 / 255]);
engine.resize(W, H, Math.min(2, window.devicePixelRatio || 1));

let playing = false;
let last = 0;
const loop = (now: number) => {
  if (!playing) return;
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
  last = now;
  engine.step(dt);
  engine.render();
  requestAnimationFrame(loop);
};

const lab = {
  pose(t: number) {
    playing = false;
    engine.pose(0, t);
    engine.render();
  },
  handover(u: number) {
    playing = false;
    engine.poseHandover(0, u);
    engine.render();
  },
  wake(u: number) {
    playing = false;
    engine.poseWake(u);
    engine.render();
  },
  play() {
    playing = true;
    last = 0;
    requestAnimationFrame(loop);
  },
  bench(n = 300) {
    playing = false;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      engine.step(1 / 60);
      engine.render();
    }
    return { msPerFrame: (performance.now() - t0) / n, ...engine.stats() };
  },
  stats: () => engine.stats(),
};
(window as unknown as { lab: typeof lab; labReady: boolean }).lab = lab;
(window as unknown as { labReady: boolean }).labReady = true;

if (q.has("u")) lab.handover(+(q.get("u") as string));
else if (q.has("t")) lab.pose(+(q.get("t") as string));
else lab.play();
