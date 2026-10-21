import "katex/dist/katex.min.css";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import * as tex from "./tex";
import "./loop.css";

// The test, as the paper's figure 2 draws it, with figure 1(b)'s two ways to transfer an
// edit: choose an editor and the diagram shows what it reads and where it writes.
// Wide containers get the paper's left-to-right layout; narrow ones the same graph turned
// on its side (time runs down). Lines sit on pixel centres so the 1px strokes stay crisp.

export type EditorId = "pi" | "gs" | "im";

/** Every word the diagram and its controls show. */
export const LOOP_WORDS = {
  control: "Editor",
  groups: { steer: "Steering through probes", inverse: "Inverse map" },
  editors: {
    pi: {
      abbr: "PI",
      name: "Pseudoinverse injection",
      line: "The smallest change to the latent state that moves the linear probe's reading onto the target, scaled by α, written once at a single residual point.",
    },
    gs: {
      abbr: "GS",
      name: "Gradient steering",
      line: "A hundred gradient steps on the latent state, pulling the MLP probe's reading toward the target, written at a starting point and again at every later one.",
    },
    im: {
      abbr: "IM",
      name: "Inverse map",
      line: "The probe run in reverse: a map fit from simulator state to latent state, written over the residual stream at one point without reading what it replaces.",
    },
  } satisfies Record<EditorId, { abbr: string; name: string; line: string }>,
  sim: ["Environment", "simulator"],
  model: "Generative model",
  render: "Render",
  edit: "Edit",
  editor: "Editor",
  probe: "Probe",
  measure: "Measure",
  decodability: "decodability",
  editability: "editability",
  steps: "×100",
  /** What a screen reader hears for the diagram. */
  alt: (e: EditorId) =>
    `The test. The environment simulator renders its state s t into an observation o t. The frozen generative model encodes the observations into a latent state z t and decodes it into the next prediction, o hat t plus 1. A probe reads the simulator state back out of the latent state: decodability. An edit changes s t to a target s star t, and the editor, here ${LOOP_WORDS.editors[e].name.toLowerCase()}, turns ${e === "im" ? "s star t alone" : "s star t and z t"} into an edited latent state z star t. The model decodes it into o hat star t plus 1, which is compared with o star t plus 1, rendered from s star t advanced one step: editability.`,
};

const ORDER: EditorId[] = ["pi", "gs", "im"];
const TEX: Record<EditorId, string> = { pi: tex.pi, gs: tex.gs, im: tex.im };

// ---------- the graph, in logical coordinates: c runs along time's arrow, r down the rows ----------

/** A symbol: base, subscript, superscript; `up` sets the subscript upright (\mathrm), `hat`
 *  draws a circumflex over the base (as a path: the font's ŝ lives in a subset this page
 *  would otherwise not load). */
type Sym = { b: string; sub?: string; sup?: string; up?: boolean; hat?: boolean };
type Tone = "pre" | "post" | "mute";
type BoxKind = "render" | "g" | "probe" | "edit" | "editor";

type At = { id: string; c: number; r: number; tone: Tone };
type BoxSpec = At & { box: BoxKind; m?: Sym };
type Node = (At & { sym: Sym }) | BoxSpec;

const NODES: Node[] = [
  { id: "s0", c: 1, r: 0, tone: "mute", sym: { b: "s", sub: "t−1" } },
  { id: "R0", c: 2, r: 0, tone: "mute", box: "render" },
  { id: "o0", c: 3, r: 0, tone: "mute", sym: { b: "o", sub: "t−1" } },
  { id: "E0", c: 4, r: 0, tone: "mute", box: "g", m: { b: "G", sub: "E" } },
  { id: "z0", c: 5, r: 0, tone: "mute", sym: { b: "z", sub: "t−1" } },
  { id: "P", c: 7, r: 0, tone: "mute", box: "probe" },
  { id: "sh", c: 8, r: 0, tone: "mute", sym: { b: "s", sub: "t−1", hat: true } },

  { id: "ed", c: 0, r: 1, tone: "post", box: "edit" },
  { id: "s1", c: 1, r: 1, tone: "pre", sym: { b: "s", sub: "t" } },
  { id: "R1", c: 2, r: 1, tone: "pre", box: "render" },
  { id: "o1", c: 3, r: 1, tone: "pre", sym: { b: "o", sub: "t" } },
  { id: "E1", c: 4, r: 1, tone: "pre", box: "g", m: { b: "G", sub: "E" } },
  { id: "z1", c: 5, r: 1, tone: "pre", sym: { b: "z", sub: "t" } },
  { id: "D1", c: 6, r: 1, tone: "pre", box: "g", m: { b: "G", sub: "D" } },
  { id: "oh", c: 7, r: 1, tone: "pre", sym: { b: "o", sub: "t+1", hat: true } },

  { id: "ss", c: 0, r: 2, tone: "post", sym: { b: "s", sub: "t", sup: "*" } },
  { id: "X", c: 3, r: 2, tone: "post", box: "editor" },
  { id: "zs", c: 5, r: 2, tone: "post", sym: { b: "z", sub: "t", sup: "*" } },
  { id: "D2", c: 6, r: 2, tone: "post", box: "g", m: { b: "G", sub: "D" } },
  { id: "ohs", c: 7, r: 2, tone: "post", sym: { b: "o", sub: "t+1", sup: "*", hat: true } },

  { id: "s3", c: 1, r: 3, tone: "post", sym: { b: "s", sub: "t+1", sup: "*" } },
  { id: "R3", c: 2, r: 3, tone: "post", box: "render" },
  { id: "o3", c: 3, r: 3, tone: "post", sym: { b: "o", sub: "t+1", sup: "*" } },
];

type EdgeTone = Tone | "off" | "measure";
type Edge = {
  pts: [number, number][];
  from?: string;
  to?: string;
  tone: EdgeTone;
  arrow?: boolean;
};

/** The edges for one editor; `e2` is the lane z_t takes down to the editor. */
function edges(e: EditorId, e2: number): Edge[] {
  const chain = (ids: string[], tone: Tone): Edge[] =>
    ids.slice(1).map((to, i) => {
      const a = NODES.find((n) => n.id === ids[i]) as Node;
      const b = NODES.find((n) => n.id === to) as Node;
      return {
        pts: [
          [a.c, a.r],
          [b.c, b.r],
        ],
        from: a.id,
        to,
        tone,
        arrow: true,
      };
    });
  // biome-ignore format: one edge per line reads like the figure
  return [
    // Measurements first, so the solid paths draw over them.
    { pts: [[1, 0], [1, -0.9], [8, -0.9], [8, 0]], from: "s0", to: "sh", tone: "measure" },
    { pts: [[3, 3], [7.6, 3], [7.6, 1], [7, 1]], from: "o3", to: "oh", tone: "measure" },
    { pts: [[7, 2], [7, 3]], from: "ohs", tone: "measure" },
    ...chain(["s0", "R0", "o0", "E0", "z0", "P", "sh"], "mute"),
    { pts: [[1, 0], [1, 1]], from: "s0", to: "s1", tone: "mute", arrow: true },
    { pts: [[5, 0], [5, 0.5], [4, 0.5], [4, 1]], from: "z0", to: "E1", tone: "mute", arrow: true },
    ...chain(["s1", "R1", "o1", "E1", "z1", "D1", "oh"], "pre"),
    { pts: [[1, 1], [0, 1]], from: "s1", to: "ed", tone: "pre", arrow: true },
    { pts: [[0, 1], [0, 2]], from: "ed", to: "ss", tone: "post", arrow: true },
    {
      pts: [[5, 1], [5, e2], [3, e2], [3, 2]],
      from: "z1",
      to: "X",
      tone: e === "im" ? "off" : "pre",
      arrow: e !== "im",
    },
    { pts: [[0, 2], [3, 2]], from: "ss", to: "X", tone: "post", arrow: true },
    ...chain(["X", "zs", "D2", "ohs"], "post"),
    { pts: [[0, 2], [0, 3], [1, 3]], from: "ss", to: "s3", tone: "post", arrow: true },
    ...chain(["s3", "R3", "o3"], "post"),
  ];
}

// ---------- geometry: logical coordinates to pixels ----------

type Geo = {
  vert: boolean;
  /** The smallest phones: the simulator's label shortens to one word. */
  tight: boolean;
  w: number;
  h: number;
  at: (c: number, r: number) => [number, number];
  fs: number;
  mono: number;
  tag: number;
  arrow: [number, number];
  box: Record<BoxKind, [number, number]>;
  e2: number;
  sim: [number, number, number, number];
  model: [number, number, number, number];
};

/** Rounds to a pixel centre, where a 1px line is crisp. */
const sn = (v: number) => Math.round(v - 0.5) + 0.5;

/** The layout for a width. Its two heights (325 wide, 484 narrow) are reserved in loop.css. */
function geo(width: number): Geo {
  if (width >= 820) {
    const w = Math.min(width, 1120);
    const pc = (w - 66) / 8.48;
    const pr = 64;
    const ox = 22 + 0.48 * pc;
    const oy = 84;
    return {
      vert: false,
      tight: false,
      w,
      h: Math.round(oy + 3.42 * pr) + 22,
      at: (c, r) => [sn(ox + c * pc), sn(oy + r * pr)],
      fs: 18,
      mono: 12,
      tag: 11,
      arrow: [7, 3.5],
      box: { render: [76, 30], g: [54, 30], probe: [112, 30], edit: [50, 28], editor: [92, 38] },
      e2: 1.42,
      sim: [-0.48, 2.48, -0.5, 3.42],
      model: [3.52, 6.48, -0.5, 2.46],
    };
  }
  // Narrow: four lanes across; boxes and type shrink a little on the smallest phones.
  const w = Math.max(260, Math.min(width, 500));
  const pr = (w - 46) / 3.9;
  const tight = pr < 76;
  const bw = Math.round(Math.min(62, pr - 10));
  const rw = Math.round(Math.min(56, pr - 12));
  const pc = 54;
  const ox = 10 + 0.9 * pr;
  const oy = 34;
  return {
    vert: true,
    tight,
    w,
    h: oy + 8 * pc + 18,
    at: (c, r) => [sn(ox + r * pr), sn(oy + c * pc)],
    fs: tight ? 15 : 16,
    mono: tight ? 10 : 11,
    tag: tight ? 9.5 : 10,
    arrow: [6, 3],
    box: { render: [rw, 26], g: [44, 26], probe: [bw, 38], edit: [46, 24], editor: [bw, 38] },
    e2: 1.4,
    sim: [-0.52, 2.5, -0.45, 3 + (rw / 2 + 6) / pr],
    model: [3.55, 6.5, -0.45, 2 + 42 / pr],
  };
}

/** Half the size of a node, for where edges stop. */
function half(n: Node, g: Geo): [number, number] {
  if ("box" in n) {
    const [w, h] = g.box[n.box];
    return [w / 2, h / 2];
  }
  const s = n.sym;
  const sub = (s.sub?.length ?? 0) * 0.42 + (s.sup ? 0.4 : 0);
  return [(0.52 + sub) * g.fs * 0.5 + 1, g.fs * 0.5];
}

// ---------- drawing ----------

/** Rough advance widths (em) of the symbols' glyphs, to place a hat over its letter. */
const EM: Record<string, number> = {
  s: 0.4,
  o: 0.48,
  t: 0.32,
  "+": 0.6,
  "−": 0.6,
  "1": 0.5,
  "*": 0.5,
};
const em = (t: string) => [...t].reduce((a, ch) => a + (EM[ch] ?? 0.5), 0);

/** A symbol in italic serif; digits and signs in the subscript stand upright, as in TeX. */
function SymText({ x, y, s, fs, cls }: { x: number; y: number; s: Sym; fs: number; cls?: string }) {
  const sz = Math.round(fs * 0.7);
  const down = fs * 0.26;
  const runs = s.sub ? (s.up ? [s.sub] : s.sub.match(/[a-zA-Z]+|[^a-zA-Z]+/g)) : null;
  const text = (
    <text x={x} y={y} className={cls ? `gl-m ${cls}` : "gl-m"} fontSize={fs} textAnchor="middle">
      {s.b}
      {runs?.map((t, i) => (
        <tspan
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed runs of one label
          key={i}
          dy={i === 0 ? down : undefined}
          fontSize={sz}
          className={s.up || /[^a-zA-Z]/.test(t) ? "gl-up" : undefined}
        >
          {t}
        </tspan>
      ))}
      {s.sup && (
        <tspan dy={s.sub ? -down - fs * 0.04 : -fs * 0.3} fontSize={sz} className="gl-up">
          {s.sup}
        </tspan>
      )}
    </text>
  );
  if (!s.hat) return text;
  // The hat: over the base letter, nudged right with the italic.
  const wb = em(s.b) * fs;
  const total = wb + em((s.sub ?? "") + (s.sup ?? "")) * sz;
  const hx = Math.round(x - total / 2 + wb / 2 + fs * 0.09) + 0.5;
  const hw = Math.max(2.5, fs * 0.14);
  const hy = Math.round(y - fs * 0.475 - 3 - hw * 0.9) + 0.5;
  return (
    <>
      {text}
      <path
        d={`M${hx - hw} ${hy + hw * 0.9}L${hx} ${hy}L${hx + hw} ${hy + hw * 0.9}`}
        className={`gl-hat ${cls ?? ""}`}
      />
    </>
  );
}

/** A small snowflake: the paper's mark for a frozen model. */
function Flake({ x, y, r }: { x: number; y: number; r: number }) {
  const arms = [0, 60, 120].map((a) => {
    const t = (a * Math.PI) / 180;
    return [Math.cos(t), Math.sin(t)];
  });
  const b = r * 0.55;
  const k = r * 0.34;
  let d = "";
  for (const [cx, cy] of arms) d += `M${x - cx * r} ${y - cy * r}L${x + cx * r} ${y + cy * r}`;
  for (let i = 0; i < 6; i++) {
    const t = (i * Math.PI) / 3;
    const [ux, uy] = [Math.cos(t), Math.sin(t)];
    const [px, py] = [x + ux * b, y + uy * b];
    for (const s of [-1, 1]) {
      const tt = t + (s * Math.PI) / 4;
      d += `M${px} ${py}L${px + Math.cos(tt) * k} ${py + Math.sin(tt) * k}`;
    }
  }
  return <path d={d} className="gl-flake" />;
}

/** A path through logical points, stopped short of the nodes it joins, with its arrow. */
function Wire({ e, g, nodes }: { e: Edge; g: Geo; nodes: Map<string, Node> }) {
  const pts = e.pts.map(([c, r]) => g.at(c, r));
  const gap = 5;
  const trim = (i: number, j: number, id?: string, extra = 0) => {
    const n = id ? nodes.get(id) : undefined;
    if (!n) return;
    const [hw, hh] = half(n, g);
    const dx = Math.sign(pts[j][0] - pts[i][0]);
    const dy = Math.sign(pts[j][1] - pts[i][1]);
    const d = (dx ? hw : hh) + gap + extra;
    pts[i] = [pts[i][0] + dx * d, pts[i][1] + dy * d];
  };
  trim(0, 1, e.from);
  const last = pts.length - 1;
  trim(last, last - 1, e.to, 0);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join("");
  let head: ReactNode = null;
  if (e.arrow) {
    const [x, y] = pts[last];
    const dx = Math.sign(x - pts[last - 1][0]);
    const dy = Math.sign(y - pts[last - 1][1]);
    const [l, w] = g.arrow;
    const bx = x - dx * l;
    const by = y - dy * l;
    head = (
      <path
        d={`M${x} ${y}L${bx - dy * w} ${by + dx * w}L${bx + dy * w} ${by - dx * w}Z`}
        className="gl-head"
      />
    );
  }
  return (
    <g className={`gl-w gl-${e.tone}`}>
      <path d={d} className="gl-line" />
      {head}
    </g>
  );
}

function BoxNode({ n, g, e }: { n: BoxSpec; g: Geo; e: EditorId }) {
  const [cx, cy] = g.at(n.c, n.r);
  const [w, h] = g.box[n.box];
  const x = cx - w / 2;
  const y = cy - h / 2;
  const base = cy + g.mono * 0.36;
  let body: ReactNode;
  let lit = false;
  if (n.box === "render") {
    body = (
      <text x={cx} y={base} fontSize={g.mono} textAnchor="middle" className="gl-bt">
        {LOOP_WORDS.render}
      </text>
    );
  } else if (n.box === "edit") {
    body = (
      <text x={cx} y={base} fontSize={g.mono} textAnchor="middle" className="gl-bt">
        {LOOP_WORDS.edit}
      </text>
    );
  } else if (n.box === "g" && n.m) {
    body = <SymText x={cx} y={cy + g.fs * 0.22} s={n.m} fs={g.fs - 2} />;
  } else if (n.box === "probe") {
    lit = e !== "im";
    const f: Sym = { b: "f", sub: e === "pi" ? "Lin" : "MLP", up: true };
    if (!lit) {
      body = (
        <text x={cx} y={base} fontSize={g.mono} textAnchor="middle" className="gl-bt">
          {LOOP_WORDS.probe}
        </text>
      );
    } else if (g.vert) {
      // Narrow: the word over the probe's symbol, like the editor.
      body = (
        <>
          <text x={cx} y={cy - h * 0.12} fontSize={g.tag} textAnchor="middle" className="gl-tag">
            {LOOP_WORDS.probe}
          </text>
          <SymText x={cx} y={cy + h * 0.3} s={f} fs={g.fs - 2} cls="gl-tpost" />
        </>
      );
    } else {
      body = (
        <>
          <text x={x + 10} y={base} fontSize={g.mono} className="gl-bt">
            {LOOP_WORDS.probe}
          </text>
          <SymText x={x + w - 24} y={cy + g.fs * 0.2} s={f} fs={g.fs - 1} cls="gl-tpost" />
        </>
      );
    }
  } else if (n.box === "editor") {
    lit = true;
    body = (
      <>
        <text x={cx} y={cy - h * 0.12} fontSize={g.tag} textAnchor="middle" className="gl-tag">
          {LOOP_WORDS.editor}
        </text>
        <text
          x={cx}
          y={cy + h * 0.31}
          fontSize={g.mono + 2}
          textAnchor="middle"
          className="gl-abbr"
        >
          {LOOP_WORDS.editors[e].abbr}
        </text>
        {e === "gs" && <Loopback x={x} y={y} w={w} h={h} g={g} />}
      </>
    );
  }
  const tone = n.box === "edit" || lit ? "post" : n.tone === "mute" ? "mute" : "plain";
  return (
    <g className={`gl-box gl-b${tone}`}>
      <rect x={x} y={y} width={w} height={h} />
      {body}
    </g>
  );
}

/** Gradient steering's repeated step: a loop off the editor's corner, and its count. */
function Loopback({ x, y, w, h, g }: { x: number; y: number; w: number; h: number; g: Geo }) {
  const r = g.vert ? 6 : 7;
  const [l, aw] = g.arrow;
  if (g.vert) {
    // Out of the right side and back in, the count above it.
    const xr = x + w;
    const y0 = y + h / 2 - r;
    const y1 = y + h / 2 + r;
    return (
      <g className="gl-w gl-post">
        <path
          d={`M${xr + 1} ${y0}H${xr + r}A${r} ${r} 0 0 1 ${xr + r} ${y1}H${xr + 1 + l}`}
          className="gl-line"
        />
        <path d={`M${xr} ${y1}L${xr + l} ${y1 - aw}L${xr + l} ${y1 + aw}Z`} className="gl-head" />
        <text x={xr + 3} y={y0 - 5} fontSize={g.tag - 0.5} className="gl-tag gl-tpost">
          {LOOP_WORDS.steps}
        </text>
      </g>
    );
  }
  // Out of the bottom and back in, the count beside it.
  const yb = y + h;
  const x1 = x + w - 12;
  const x0 = x1 - 2 * r;
  return (
    <g className="gl-w gl-post">
      <path
        d={`M${x1} ${yb + 1}V${yb + r}A${r} ${r} 0 0 1 ${x0} ${yb + r}V${yb + 1 + l}`}
        className="gl-line"
      />
      <path d={`M${x0} ${yb}L${x0 - aw} ${yb + l}L${x0 + aw} ${yb + l}Z`} className="gl-head" />
      <text x={x1 + 6} y={yb + r + 4} fontSize={g.tag} className="gl-tag gl-tpost">
        {LOOP_WORDS.steps}
      </text>
    </g>
  );
}

/** A measurement's name, set on its dashed line with a gap behind it. */
function MeasureLabel({
  x,
  y,
  word,
  g,
  rot = false,
}: {
  x: number;
  y: number;
  word: string;
  g: Geo;
  rot?: boolean;
}) {
  const fs = g.tag + 1;
  const wd = (LOOP_WORDS.measure.length + word.length + 1) * fs * 0.56 + 14;
  return (
    <g transform={rot ? `rotate(-90 ${x} ${y})` : undefined}>
      <rect x={x - wd / 2} y={y - fs * 0.8} width={wd} height={fs * 1.6} className="gl-gap" />
      <text x={x} y={y + fs * 0.36} fontSize={fs} textAnchor="middle" className="gl-meas">
        {LOOP_WORDS.measure} <tspan className="gl-measb">{word}</tspan>
      </text>
    </g>
  );
}

function Diagram({ g, e }: { g: Geo; e: EditorId }) {
  const nodes = new Map(NODES.map((n) => [n.id, n]));
  const region = ([c0, c1, r0, r1]: [number, number, number, number]) => {
    const [xa, ya] = g.at(c0, r0);
    const [xb, yb] = g.at(c1, r1);
    return {
      x: Math.min(xa, xb),
      y: Math.min(ya, yb),
      w: Math.abs(xb - xa),
      h: Math.abs(yb - ya),
    };
  };
  const sim = region(g.sim);
  const mod = region(g.model);
  const [dx0, dy0] = g.at(1, -0.9);
  const [dx1] = g.at(8, -0.9);
  const [ex0, ey0] = g.at(3, 3);
  const [ex1] = g.at(7.6, 3);
  const s0y = g.at(0, 0)[1];
  const lh = g.tag + 3;
  return (
    <svg
      className="gl-svg"
      width={g.w}
      height={g.h}
      viewBox={`0 0 ${g.w} ${g.h}`}
      role="img"
      aria-label={LOOP_WORDS.alt(e)}
    >
      <rect {...sim} width={sim.w} height={sim.h} className="gl-reg" />
      <rect {...mod} width={mod.w} height={mod.h} className="gl-reg" />
      {/* the regions' names */}
      {g.vert ? (
        <>
          {g.tight ? (
            <text x={sim.x + 7} y={s0y + g.tag * 0.36} fontSize={g.tag} className="gl-rl gl-rlv">
              {LOOP_WORDS.sim[1]}
            </text>
          ) : (
            <text x={sim.x + 7} y={s0y - 2} fontSize={g.tag} className="gl-rl gl-rlv">
              <tspan x={sim.x + 7}>{LOOP_WORDS.sim[0]}</tspan>
              <tspan x={sim.x + 7} dy={lh}>
                {LOOP_WORDS.sim[1]}
              </tspan>
            </text>
          )}
          <g transform={`rotate(-90 ${mod.x + mod.w - 11} ${mod.y + mod.h / 2})`}>
            <text
              x={mod.x + mod.w - 11 - 8}
              y={mod.y + mod.h / 2 + g.tag * 0.36}
              fontSize={g.tag}
              textAnchor="middle"
              className="gl-rl"
            >
              {LOOP_WORDS.model}
            </text>
            <Flake x={mod.x + mod.w - 11 + 58} y={mod.y + mod.h / 2} r={5} />
          </g>
        </>
      ) : (
        <>
          <text x={sim.x + 12} y={s0y - 4} fontSize={g.tag} className="gl-rl">
            <tspan x={sim.x + 12}>{LOOP_WORDS.sim[0]}</tspan>
            <tspan x={sim.x + 12} dy={lh}>
              {LOOP_WORDS.sim[1]}
            </tspan>
          </text>
          <text
            x={mod.x + mod.w - 30}
            y={mod.y + 17}
            fontSize={g.tag}
            textAnchor="end"
            className="gl-rl"
          >
            {LOOP_WORDS.model}
          </text>
          <Flake x={mod.x + mod.w - 17} y={mod.y + 13} r={6} />
        </>
      )}
      {edges(e, g.e2).map((ed) => (
        <Wire key={`${ed.pts.join(";")}`} e={ed} g={g} nodes={nodes} />
      ))}
      {g.vert ? (
        <>
          <MeasureLabel
            x={dx0}
            y={(g.at(1, 0)[1] + g.at(8, 0)[1]) / 2}
            word={LOOP_WORDS.decodability}
            g={g}
            rot
          />
          <MeasureLabel
            x={(g.at(7.6, 1)[0] + g.at(7.6, 3)[0]) / 2}
            y={g.at(7.6, 1)[1]}
            word={LOOP_WORDS.editability}
            g={g}
          />
        </>
      ) : (
        <>
          <MeasureLabel x={(dx0 + dx1) / 2} y={dy0} word={LOOP_WORDS.decodability} g={g} />
          <MeasureLabel x={(ex0 + ex1) / 2} y={ey0} word={LOOP_WORDS.editability} g={g} />
        </>
      )}
      {NODES.map((n) => {
        if ("box" in n) return <BoxNode key={n.id} n={n} g={g} e={e} />;
        const [x, y] = g.at(n.c, n.r);
        return (
          <SymText key={n.id} x={x} y={y + g.fs * 0.24} s={n.sym} fs={g.fs} cls={`gl-t${n.tone}`} />
        );
      })}
    </svg>
  );
}

/** The test's diagram; `initial` is the editor shown first. */
export default function Loop({ initial = "pi" }: { initial?: EditorId }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [ed, setEd] = useState<EditorId>(initial);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const g = width ? geo(width - 2) : null;
  const W = LOOP_WORDS;
  const button = (e: EditorId) => (
    <button key={e} type="button" className="btn" aria-pressed={ed === e} onClick={() => setEd(e)}>
      {W.editors[e].abbr}
      <span className="vh"> {W.editors[e].name}</span>
    </button>
  );

  return (
    <div className="gl">
      <div ref={ref} className="gl-well">
        {g && <Diagram g={g} e={ed} />}
      </div>
      <div className="gl-under">
        <fieldset className="gl-bar">
          <legend className="vh">{W.control}</legend>
          <fieldset className="gl-grp">
            <legend className="lbl">{W.groups.steer}</legend>
            <div className="gl-seg">{(["pi", "gs"] as EditorId[]).map(button)}</div>
          </fieldset>
          <fieldset className="gl-grp">
            <legend className="lbl">{W.groups.inverse}</legend>
            <div className="gl-seg">{button("im")}</div>
          </fieldset>
        </fieldset>
        {/* All three stacked in one cell, only the chosen one shown, so nothing below moves. */}
        <div className="gl-read" aria-live="polite">
          {ORDER.map((e) => (
            <div key={e} className="gl-one" data-on={e === ed || undefined}>
              <div className="gl-tex" dangerouslySetInnerHTML={{ __html: TEX[e] }} />
              <p className="gl-desc">
                <b>{W.editors[e].name}.</b> {W.editors[e].line}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
