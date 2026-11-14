import { num, TABLE1, TABLE10, TABLE16 } from "./data";
import "./inside.css";

// The paper's three findings, under its one-sentence statement, each with the numbers behind
// it, drawn small: PI on Table 1's Othello rows, Table 10's inverse map by residual point, and
// Table 16's PI on 8-ray. Each links to the section that makes the case. PI stands for the
// representations, since the inverse map can steer a model through its own rendering instead.

const SUCCESS = 0.4; // an editor succeeds from this Edit Index (with Fid. ≥ 0.25)

/** Each Othello variant's PI Edit Index, from Table 1. */
const OTHELLO = (TABLE1.find((g) => g.id === "othello")?.rows ?? []).map((r) => ({
  name: r.name,
  pi: num(r.pi.index.v),
}));

const sign = (v: number) => (v < 0 ? `−${Math.abs(v).toFixed(2)}` : `+${v.toFixed(2)}`);

/** Horizontal bars from 0, on −1 to +1, one per variant. */
function Rules() {
  const W = 120; // the bars' span, −1 to +1
  const x = (v: number) => W / 2 + (v * W) / 2;
  return (
    <div
      className="gt-rules"
      role="img"
      aria-label={OTHELLO.map((o) => `${o.name}: PI Edit Index ${sign(o.pi)}`).join(". ")}
    >
      {OTHELLO.map((o) => (
        <div key={o.name} className="gt-rule" aria-hidden="true">
          <code>{o.name}</code>
          <svg viewBox={`0 0 ${W} 10`} width={W} height={10} aria-hidden="true">
            <path d={`M${x(SUCCESS)} 0V10`} className="gt-thr" />
            <rect
              x={Math.min(x(0), x(o.pi))}
              y={1}
              width={Math.abs(x(o.pi) - x(0))}
              height={8}
              className={o.pi >= SUCCESS ? "gt-bar gt-ok" : "gt-bar"}
            />
            <path d={`M${x(0)} 0V10`} className="gt-zero" />
          </svg>
          <span className={o.pi >= SUCCESS ? "gr-hi" : "gr-lo"}>{sign(o.pi)}</span>
        </div>
      ))}
    </div>
  );
}

/** The inverse map's Edit Index through the two standard models, point 0 to 8. */
function Depth() {
  const W = 220;
  const H = 74;
  const x = (k: number) => 6 + (k * (W - 12)) / 8;
  const y = (v: number) => 6 + ((1 - v) / 2) * (H - 12);
  const line = (m: "othello" | "rayworld") =>
    TABLE10[m]
      .map((r, k) => `${k ? "L" : "M"}${x(k).toFixed(1)} ${y(num(r.index)).toFixed(1)}`)
      .join("");
  const o = TABLE10.othello.map((r) => r.index).join(", ");
  const r = TABLE10.rayworld.map((q) => q.index).join(", ");
  return (
    <figure className="gt-depth">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label={`Inverse map Edit Index from residual point 0 to 8. Othello: ${o}. Rayworld: ${r}.`}
      >
        <rect x={x(3.5)} y={0} width={x(5.5) - x(3.5)} height={H} className="gt-bn" />
        <path d={`M0 ${y(SUCCESS)}H${W}`} className="gt-thr" />
        <path d={`M0 ${y(0)}H${W}`} className="gt-zero" />
        <path d={line("rayworld")} className="gt-line gt-ray" />
        <path d={line("othello")} className="gt-line" />
      </svg>
      <figcaption aria-hidden="true">
        <span className="gt-oth">Othello</span>
        <span className="gt-rw">Rayworld</span>
        <span className="gt-ax">residual point 0 → 8</span>
      </figcaption>
    </figure>
  );
}

const PI8 = TABLE16.filter((r) => r.model === "8-ray");
const BEFORE = PI8.find((r) => r.view === "single observer")?.pi.index.v ?? "";
const AFTER = PI8.find((r) => r.view === "withheld, one step")?.pi.index.v ?? "";

function Fix() {
  return (
    <p className="gt-fix">
      <span className="gr-lo">{BEFORE}</span>
      <span className="gt-arrow" aria-hidden="true">
        →
      </span>
      <span className="vh"> to </span>
      <span className="gr-hi">{AFTER}</span>
      <span className="gt-unit">PI Edit Index, 8-ray</span>
    </p>
  );
}

export default function Findings() {
  return (
    <ol className="gt">
      <li>
        <h2 className="gt-h">
          <a href="#gs-results">Simpler rules, less editable</a>
        </h2>
        <p>
          Every model's state decodes well, yet each simplification of Othello's rules lowers
          editability, in ways decodability does not predict.
        </p>
        <Rules />
        <span className="gt-note">PI Edit Index; edits succeed from +0.4</span>
      </li>
      <li>
        <h2 className="gt-h">
          <a href="#gs-depth">Two ways to predict</a>
        </h2>
        <p>
          The Othello model compresses its history into a board midway through the network. The
          Rayworld model refines a rendering of the next frame, which the inverse map writes.
        </p>
        <Depth />
        <span className="gt-note">inverse map Edit Index</span>
      </li>
      <li>
        <h2 className="gt-h">
          <a href="#gs-fix">Forcing a simulator-like state</a>
        </h2>
        <p>
          A model only has to learn the causal state, which can be coarser than the simulator's.
          Making it serve inputs it cannot foresee, such as a viewpoint or an action, tightens that
          state toward the simulator's, and in Rayworld, steering then succeeds.
        </p>
        <Fix />
        <span className="gt-note">fixed viewpoint → unforeseen viewpoint</span>
      </li>
    </ol>
  );
}
