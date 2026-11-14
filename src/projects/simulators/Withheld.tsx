import { useEffect, useRef, useState } from "react";
import { living, STILL } from "../../frame/live";
import { TABLE16 } from "./data";
import "./inside.css";

// Withholding the viewpoint (section 5.1, A.17), as Sevan sketched it. Left, a small Rayworld
// seen from above, its frames rendered from one of eight viewpoints on a ring: the observer is
// the pose the next frame is rendered from, and its eight rays are that frame. Right, the two
// steps: the model takes a full step on the history and the current frame without knowing the
// pose, committing to a latent state, then renders the next frame from that state and the pose
// alone. Below, what it does to PI on 8-ray (Table 16).
// A schematic: the world is simulated here (straight lines, as in Rayworld), the frames are
// rendered from it exactly, and the prediction drawn is the true next frame. The latent's
// shades follow the world and never the pose, which is the point of the setup.

const RAYS = 8;
const RING = 1.62; // viewpoints' distance from the centre, in arena radii
const DISC = 0.24; // disc radius; at 8 rays a disc always covers at least one ray
const SHADE = [0.4, 0.8]; // reflectivity: the dim disc, the bright one
const FRAMES = 14; // frames per episode
const STEP_MS = 1100;
const HALF = Math.asin(1 / RING); // the fan's half-angle, so it just spans the arena

type World = { p: number[]; v: number[] }; // two discs: x0 z0 x1 z1, per frame
type Ep = { worlds: World[]; views: number[] };

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An episode whose two discs stay inside the arena and apart for every frame, each frame
 * seen from a viewpoint other than the last one's. */
function episode(r: () => number): Ep {
  for (let tries = 0; tries < 400; tries++) {
    const p: number[] = [];
    const v: number[] = [];
    for (let j = 0; j < 2; j++) {
      const a = r() * 2 * Math.PI;
      const d = Math.sqrt(r()) * (1 - DISC);
      p.push(d * Math.cos(a), d * Math.sin(a));
      const b = r() * 2 * Math.PI;
      const s = 0.05 + 0.05 * r();
      v.push(s * Math.cos(b), s * Math.sin(b));
    }
    const worlds: World[] = [];
    let ok = true;
    for (let t = 0; t < FRAMES && ok; t++) {
      const q = p.map((x, i) => x + v[i] * t);
      if (Math.hypot(q[0], q[1]) > 1 - DISC - 0.02) ok = false;
      if (Math.hypot(q[2], q[3]) > 1 - DISC - 0.02) ok = false;
      if (Math.hypot(q[0] - q[2], q[1] - q[3]) < 2.3 * DISC) ok = false;
      worlds.push({ p: q, v });
    }
    if (!ok) continue;
    const views = [Math.floor(r() * 8)];
    for (let t = 1; t < FRAMES; t++) views.push((views[t - 1] + 1 + Math.floor(r() * 7)) % 8);
    return { worlds, views };
  }
  throw new Error("withheld: no episode");
}

const viewAt = (k: number): [number, number] => {
  const a = (k * Math.PI) / 4 + (3 * Math.PI) / 4;
  return [RING * Math.cos(a), RING * Math.sin(a)];
};

type Ray = { x: number; y: number; hit: number };

/** The frame seen from viewpoint k: each ray's end and what it hit (-1 for nothing). Rays run
 * left to right as the observer sees them. */
function render(w: World, k: number): Ray[] {
  const [ox, oy] = viewAt(k);
  const base = Math.atan2(-oy, -ox);
  const out: Ray[] = [];
  for (let i = 0; i < RAYS; i++) {
    const a = base + HALF - ((i + 0.5) * 2 * HALF) / RAYS;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let best = Number.POSITIVE_INFINITY;
    let hit = -1;
    for (let j = 0; j < 2; j++) {
      const fx = ox - w.p[2 * j];
      const fy = oy - w.p[2 * j + 1];
      const b = fx * dx + fy * dy;
      const c = fx * fx + fy * fy - DISC * DISC;
      const disc = b * b - c;
      if (disc < 0) continue;
      const s = -b - Math.sqrt(disc);
      if (s > 0 && s < best) {
        best = s;
        hit = j;
      }
    }
    if (hit < 0) {
      // to the far side of the arena
      const b = ox * dx + oy * dy;
      const disc = Math.max(0, b * b - (ox * ox + oy * oy - 1));
      best = -b + Math.sqrt(disc);
    }
    out.push({ x: ox + dx * best, y: oy + dy * best, hit });
  }
  return out;
}

const values = (rays: Ray[]) => rays.map((r) => (r.hit < 0 ? 0 : SHADE[r.hit]));

/* ---------- drawing ---------- */

const S = 66; // px per arena radius in the orbit
const O = 130; // the orbit's centre
const px = (x: number) => O + x * S;
const py = (y: number) => O - y * S;

function Orbit({ w, k, rays }: { w: World; k: number; rays: Ray[] }) {
  const [ox, oy] = viewAt(k);
  const base = Math.atan2(-oy, -ox);
  const edge = (s: number) => {
    const a = base + s * HALF;
    const l = Math.sqrt(RING * RING - 1) + 0.55;
    return `M${px(ox)} ${py(oy)}L${px(ox + Math.cos(a) * l)} ${py(oy + Math.sin(a) * l)}`;
  };
  // the label just outside the ring, or above the observer at the ring's sides
  const side = Math.abs(oy) < 0.3;
  const lx = side ? px(ox) : px(ox * 1.2);
  const ly = side ? py(oy) - 16 : py(oy * 1.2) + (oy < 0 ? 12 : -4);
  return (
    <svg className="vf-orbit" viewBox="-24 -16 308 292" width={308} height={292} aria-hidden="true">
      <circle cx={O} cy={O} r={RING * S} className="vf-ring" />
      <circle cx={O} cy={O} r={S} className="vf-arena" />
      {rays.map((r, i) => (
        <path
          // biome-ignore lint/suspicious/noArrayIndexKey: the fan's fixed rays
          key={i}
          d={`M${px(ox)} ${py(oy)}L${px(r.x)} ${py(r.y)}`}
          className={r.hit < 0 ? "vf-ray" : "vf-ray vf-hit"}
        />
      ))}
      <path d={`${edge(1)}${edge(-1)}`} className="vf-edge" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((j) => {
        const [x, y] = viewAt(j);
        return j === k ? null : <circle key={j} cx={px(x)} cy={py(y)} r={5} className="vf-vp" />;
      })}
      {[0, 1].map((j) => (
        <circle
          key={j}
          cx={px(w.p[2 * j])}
          cy={py(w.p[2 * j + 1])}
          r={DISC * S}
          className={j ? "vf-disc vf-bright" : "vf-disc"}
        />
      ))}
      <circle cx={px(ox)} cy={py(oy)} r={8} className="vf-obs" />
      <text x={lx} y={ly} textAnchor="middle" className="vf-obs-l">
        observer
      </text>
    </svg>
  );
}

/** A frame as a strip of cells; `cell` wide each. */
function Strip({
  x,
  y,
  v,
  cell,
  h,
  out,
}: {
  x: number;
  y: number;
  v: number[] | null;
  cell: number;
  h: number;
  out?: boolean;
}) {
  return (
    <g>
      {Array.from({ length: RAYS }, (_, i) => {
        const val = v ? v[i] : 0;
        return (
          <rect
            // biome-ignore lint/suspicious/noArrayIndexKey: the frame's fixed cells
            key={i}
            x={x + i * cell}
            y={y}
            width={cell}
            height={h}
            style={{
              fill: `color-mix(in oklab, var(--tx) ${Math.round(val * 100)}%, var(--gs-well))`,
            }}
          />
        );
      })}
      <rect
        x={x - 0.5}
        y={y - 0.5}
        width={RAYS * cell + 1}
        height={h + 1}
        className={out ? "vf-sbox vf-out" : "vf-sbox"}
      />
    </g>
  );
}

/** An italic serif symbol with a subscript, its hat drawn as a path (the font's ô lives in a
 * subset this page does not load). Anchored at its baseline's start, or its end. */
function Sym({
  x,
  y,
  b,
  sub,
  hat,
  end,
  cls,
}: {
  x: number;
  y: number;
  b: string;
  sub: string;
  hat?: boolean;
  end?: boolean;
  cls?: string;
}) {
  const runs = sub.match(/[a-z]+|[^a-z]+/g) ?? [];
  return (
    <>
      <text x={x} y={y} textAnchor={end ? "end" : "start"} className={`vf-m ${cls ?? ""}`}>
        <tspan className="vf-it">{b}</tspan>
        {runs.map((t, i) => (
          <tspan
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed runs of one label
            key={i}
            dy={i === 0 ? 5 : undefined}
            className={/[a-z]/.test(t) ? "vf-sub vf-it" : "vf-sub"}
          >
            {t}
          </tspan>
        ))}
      </text>
      {hat && !end && (
        <path
          d={`M${x + 2} ${y - 13}L${x + 6} ${y - 17.5}L${x + 10} ${y - 13}`}
          className="vf-hat"
        />
      )}
    </>
  );
}

function Arrow({ x0, y0, x1, y1 }: { x0: number; y0: number; x1: number; y1: number }) {
  const dx = Math.sign(x1 - x0);
  const dy = Math.sign(y1 - y0);
  const l = 6;
  const w = 3.5;
  const bx = x1 - dx * l;
  const by = y1 - dy * l;
  return (
    <>
      <path d={`M${x0} ${y0}L${bx} ${by}`} className="vf-wire" />
      <path
        d={`M${x1} ${y1}L${bx - dy * w} ${by + dx * w}L${bx + dy * w} ${by - dx * w}Z`}
        className="vf-head"
      />
    </>
  );
}

function Box({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={9} className="vf-tf" />
      <text x={x + w / 2} y={y + h / 2 + 5} textAnchor="middle" className="vf-tf-t">
        Transformer
      </text>
    </g>
  );
}

function Latent({ x, y, shades }: { x: number; y: number; shades: number[] }) {
  return (
    <g>
      {shades.map((s, i) => (
        <rect
          // biome-ignore lint/suspicious/noArrayIndexKey: the latent's fixed cells
          key={i}
          x={x}
          y={y + i * 12}
          width={16}
          height={12}
          className="vf-lat"
          style={{ fillOpacity: s }}
        />
      ))}
      <rect x={x - 0.5} y={y - 0.5} width={17} height={61} className="vf-lat-box" />
    </g>
  );
}

type Frames = { hist: (number[] | null)[]; now: number[]; next: number[]; latent: number[] };

/** Stage one: the history and the current frame into the model, out comes the latent state. */
function StepOne({ f, x, y, cell }: { f: Frames; x: number; y: number; cell: number }) {
  const sw = RAYS * cell;
  const bx = x + sw + 40;
  const bw = 116;
  return (
    <g>
      <text x={x} y={y + 14} className="vf-stage">
        1 · Full step, observer unknown
      </text>
      {f.hist.map((v, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: three fixed rows of history
        <Strip key={i} x={x} y={y + 66 + i * 13} v={v} cell={cell} h={9} />
      ))}
      <text x={x + sw / 2} y={y + 126} textAnchor="middle" className="vf-lbl">
        history
      </text>
      <Arrow x0={x + sw + 6} y0={y + 84} x1={bx - 6} y1={y + 84} />
      <Box x={bx} y={y + 54} w={bw} h={60} />
      <Strip x={bx + bw / 2 - sw / 2} y={y + 160} v={f.now} cell={cell} h={14} />
      <Sym x={bx + bw / 2 - sw / 2 - 10} y={y + 172} b="o" sub="t" end />
      <Arrow x0={bx + bw / 2} y0={y + 154} x1={bx + bw / 2} y1={y + 120} />
      <Arrow x0={bx + bw + 4} y0={y + 84} x1={bx + bw + 26} y1={y + 84} />
      <Latent x={bx + bw + 32} y={y + 54} shades={f.latent} />
      <Sym x={bx + bw + 24} y={y + 44} b="latent" sub="t" cls="vf-amber" />
    </g>
  );
}

/** Stage two: the latent state and the pose into the model, out comes the next frame. */
function StepTwo({
  f,
  x,
  y,
  cell,
  latent,
}: {
  f: Frames;
  x: number;
  y: number;
  cell: number;
  latent: boolean;
}) {
  const sw = RAYS * cell;
  const lx = latent ? x + 4 : x - 48;
  const bx = lx + 48;
  const bw = 116;
  return (
    <g>
      <text x={latent ? x : bx} y={y + 14} className="vf-stage">
        2 · Render from pose
      </text>
      {latent && (
        <>
          <Latent x={lx} y={y + 54} shades={f.latent} />
          <Sym x={lx - 4} y={y + 44} b="latent" sub="t" cls="vf-amber" />
        </>
      )}
      <Arrow x0={lx + 22} y0={y + 84} x1={bx - 6} y1={y + 84} />
      <Box x={bx} y={y + 54} w={bw} h={60} />
      <circle cx={bx + bw / 2} cy={y + 168} r={8} className="vf-obs" />
      <Sym x={bx + bw / 2 - 16} y={y + 174} b="pose" sub="t+1" end cls="vf-amber" />
      <Arrow x0={bx + bw / 2} y0={y + 154} x1={bx + bw / 2} y1={y + 120} />
      <Arrow x0={bx + bw + 4} y0={y + 84} x1={bx + bw + 26} y1={y + 84} />
      <Strip x={bx + bw + 32} y={y + 76} v={f.next} cell={cell} h={16} out />
      <Sym x={bx + bw + 32 + sw / 2 - 10} y={y + 64} b="o" sub="t+1" hat />
    </g>
  );
}

function Pipeline({ f }: { f: Frames }) {
  return (
    <>
      <svg
        className="vf-pipe vf-wide"
        viewBox="0 0 584 196"
        width={584}
        height={196}
        aria-hidden="true"
      >
        <StepOne f={f} x={2} y={0} cell={12} />
        <StepTwo f={f} x={334} y={0} cell={12} latent={false} />
      </svg>
      <svg
        className="vf-pipe vf-narrow"
        viewBox="0 0 340 392"
        width={340}
        height={392}
        aria-hidden="true"
      >
        <StepOne f={f} x={2} y={0} cell={10.5} />
        <StepTwo f={f} x={2} y={200} cell={10.5} latent />
      </svg>
    </>
  );
}

const PI8 = TABLE16.filter((r) => r.model === "8-ray");
const BEFORE = PI8.find((r) => r.view === "single observer")?.pi;
const AFTER = PI8.find((r) => r.view === "withheld, one step")?.pi;

export default function Withheld() {
  const host = useRef<HTMLDivElement>(null);
  const ep = useRef<Ep | null>(null);
  const seed = useRef(7);
  const at = useRef(4);
  const [, setFrame] = useState(0);
  if (!ep.current) ep.current = episode(rng(seed.current));

  useEffect(() => {
    const el = host.current;
    if (!el || STILL) return;
    let acc = 0;
    const live = living({
      el,
      fps: 10,
      tick(dt) {
        acc += dt;
        if (acc < STEP_MS) return;
        acc = 0;
        if (at.current + 2 < FRAMES) at.current += 1;
        else {
          seed.current += 1;
          ep.current = episode(rng(seed.current));
          at.current = 3;
        }
        setFrame((k) => k + 1);
      },
    });
    return () => live.dispose();
  }, []);

  const e = ep.current;
  const n = at.current;
  // the frame to predict is n + 1, seen from its pose; the model has seen frames up to n
  const wNext = e.worlds[n + 1];
  const kNext = e.views[n + 1];
  const raysNext = render(wNext, kNext);
  const obs = (t: number) => (t >= 0 ? values(render(e.worlds[t], e.views[t])) : null);
  const w = e.worlds[n];
  const f: Frames = {
    hist: [obs(n - 3), obs(n - 2), obs(n - 1)],
    now: obs(n) ?? [],
    next: values(raysNext),
    // the latent follows the world alone: the discs' positions, and how far apart they are
    latent: [w.p[0], w.p[1], w.p[2], w.p[3], Math.hypot(w.p[0] - w.p[2], w.p[1] - w.p[3]) - 1].map(
      (x) => 0.2 + 0.8 * Math.min(1, Math.abs(x)),
    ),
  };

  return (
    <figure className="vf">
      <div
        ref={host}
        className="vf-top"
        role="img"
        aria-label="Left, Rayworld from above: two discs inside a circle, and a ring of eight viewpoints around it, one of them the observer, whose fan of eight rays renders the next frame. Right, the two steps. First the model takes a full step on the history and the current frame, o t, without knowing the observer, and commits to a latent state. Then a second step renders the next frame, o hat t plus 1, from that latent state and the pose alone."
      >
        <Orbit w={wNext} k={kNext} rays={raysNext} />
        <div className="vf-pipes">
          <Pipeline f={f} />
        </div>
      </div>
      {BEFORE && AFTER && (
        <table className="vf-score">
          <thead>
            <tr>
              <td />
              <th scope="col" className="lbl">
                Single observer
              </th>
              <td />
              <th scope="col" className="lbl">
                Viewpoint withheld
              </th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["Edit Index", BEFORE.index.v, AFTER.index.v],
                ["Edit Fidelity", BEFORE.fid.v, AFTER.fid.v],
              ] as const
            ).map(([name, was, now]) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                <td className="gr-lo">{was}</td>
                <td className="vf-go" aria-hidden="true">
                  <svg viewBox="0 0 64 14" width={64} height={14} aria-hidden="true">
                    <path d="M1 7H54" />
                    <path d="M63 7L51 1.5V12.5Z" />
                  </svg>
                </td>
                <td className="gr-hi">{now}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <figcaption className="cap">
        A schematic of the setup on <code>8-ray</code>, with PI's edits of continuous positions
        below it. The pose is the viewpoint the next frame is rendered from. In the model, one
        transformer alternates frame and viewpoint positions, and the viewpoint position reads only
        the frame position before it.
      </figcaption>
    </figure>
  );
}
