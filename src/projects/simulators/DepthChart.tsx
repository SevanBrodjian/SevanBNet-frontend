import {
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { BOTTLENECK, type DepthRow, MODELS, type Model, num, POINTS, TABLE10 } from "./data";
import { isTap, setPoint, travel, usePoint } from "./Results";
import "./results.css";

// Editability across residual points (the paper's figure 8), drawn only from Table 10's
// numbers: the inverse map's Edit Index on top (hollow where its Edit Fidelity is below 0,
// outside the fidelity guard), its R² and the MLP probe's skill below. Hovering, tapping or
// focusing a point shows its values here and marks its row in Table 10, and the other way
// round. A finger also scrubs sideways; a swipe up or down scrolls the page and picks nothing.

const LAST = POINTS.length - 1;

/** The width of an element (unrounded), kept current; measured before the first paint. */
function useWidth(ref: RefObject<HTMLElement | null>, initial: number) {
  const [w, setW] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setW(el.getBoundingClientRect().width);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** A half-pixel offset so a 1px rule covers whole pixels. */
const crisp = (v: number) => Math.round(v) + 0.5;

function listOf(model: Model, key: keyof DepthRow) {
  return TABLE10[model].map((r) => r[key]).join(", ");
}

/** What a screen reader hears for one panel. */
function summary(model: Model, label: string) {
  const rows = TABLE10[model];
  const kept = POINTS.filter((p) => num(rows[p].fid) >= 0);
  const guard =
    kept.length === POINTS.length
      ? "Edit Fidelity at least 0 at every point"
      : `Edit Fidelity at least 0 only at points ${kept.join(" and ")}`;
  return (
    `${label} standard, residual points 0 to 8. Inverse map Edit Index: ${listOf(model, "index")}; ${guard}. ` +
    `Inverse map R²: ${listOf(model, "r2")}. MLP probe skill: ${listOf(model, "skill")}.`
  );
}

/* ---------- marks ---------- */

function Tri({ x, y, hollow }: { x: number; y: number; hollow?: boolean }) {
  return (
    <path
      d={`M${x} ${y - 5.2}L${x + 5} ${y + 3.6}L${x - 5} ${y + 3.6}Z`}
      fill={hollow ? "var(--gs-well)" : "var(--tx)"}
      stroke={hollow ? "var(--tx)" : "var(--gs-well)"}
      strokeWidth={hollow ? 1 : 1.5}
      strokeLinejoin="miter"
    />
  );
}

function Dia({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M${x} ${y - 4.6}L${x + 4.6} ${y}L${x} ${y + 4.6}L${x - 4.6} ${y}Z`}
      fill="var(--tx)"
      stroke="var(--gs-well)"
      strokeWidth={1.5}
    />
  );
}

function Dot({ x, y }: { x: number; y: number }) {
  return (
    <circle cx={x} cy={y} r={2.8} fill="var(--tx3)" stroke="var(--gs-well)" strokeWidth={1.5} />
  );
}

/* ---------- one panel ---------- */

function Panel({ model, label, k }: { model: Model; label: string; k: number | null }) {
  const box = useRef<HTMLDivElement>(null);
  const scrub = useRef(false);
  const raw = useWidth(box, 520);
  const W = Math.round(raw);
  const rows = TABLE10[model];
  const small = raw < 440; // unrounded, as results.css's container query sees it

  // Geometry, in CSS pixels.
  const L = 30; // the tick labels' column
  const X0 = L + 12;
  const X1 = W - 10;
  const step = (X1 - X0) / LAST;
  const x = (i: number) => X0 + i * step;
  const T0 = 22;
  const hT = small ? 116 : 150;
  const T1 = T0 + hT;
  const B0 = T1 + 34;
  const hB = small ? 68 : 86;
  const B1 = B0 + hB;
  const H = B1 + 38; // 330, or 278 when small: results.css holds .gr-box at these heights
  const yT = (v: number) => T0 + ((1 - v) / 2) * hT;
  const yB = (v: number) => B0 + (1 - v) * hB;

  const line = (y: (v: number) => number, key: keyof DepthRow) =>
    rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(num(r[key])).toFixed(1)}`).join("");

  const near = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!r) return null;
    const i = Math.round((e.clientX - r.left - X0) / step);
    return i < 0 ? 0 : i > LAST ? LAST : i;
  };

  const bn = model === "othello";
  const bx0 = x(BOTTLENECK[0]) - step * 0.4;
  const bx1 = x(BOTTLENECK[BOTTLENECK.length - 1]) + step * 0.4;
  const r = k === null ? null : rows[k];
  const shown = r ?? rows[0]; // idle: hidden, but holding its place

  return (
    <div className="gr-pane">
      <div className="gr-ph">
        <h3>
          {label} <code>standard</code>
        </h3>
        <p className="gr-rd" aria-hidden="true" data-idle={k === null ? "" : undefined}>
          <Rd name="pt" w={1} v={String(k ?? 0)} />
          <Rd name="Index" v={shown.index} />
          <Rd name="Fid." v={shown.fid} />
          <Rd name="R²" v={shown.r2} />
          <Rd name="Skill" v={shown.skill} />
        </p>
      </div>
      <div ref={box} className="gr-box">
        <svg
          className="gr-svg"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={summary(model, label)}
        >
          {bn && (
            <g>
              <rect
                x={Math.round(bx0)}
                y={T0 - 6}
                width={Math.round(bx1) - Math.round(bx0)}
                height={B1 - T0 + 6}
                fill="color-mix(in oklab, var(--gs-post) 6%, transparent)"
              />
              <rect
                x={Math.round(bx0)}
                y={T0 - 6}
                width={Math.round(bx1) - Math.round(bx0)}
                height={2}
                fill="var(--gs-post)"
              />
              <text className="gr-bnt" x={(bx0 + bx1) / 2} y={T0 - 11} textAnchor="middle">
                bottleneck
              </text>
            </g>
          )}

          {/* top: the inverse map's Edit Index */}
          <text className="gr-ax" x={0} y={T0 - 11}>
            Edit Index
          </text>
          <g shapeRendering="crispEdges">
            {[1, 0.5, 0, -0.5, -1].map((v) => (
              <line
                key={v}
                x1={L}
                x2={W}
                y1={crisp(yT(v))}
                y2={crisp(yT(v))}
                stroke={v === 0 ? "var(--tx4)" : "var(--rule)"}
              />
            ))}
            {[1, 0.5, 0].map((v) => (
              <line
                key={v}
                x1={L}
                x2={W}
                y1={crisp(yB(v))}
                y2={crisp(yB(v))}
                stroke="var(--rule)"
              />
            ))}
          </g>
          {[1, 0.5, 0, -0.5, -1].map((v) => (
            <text key={v} x={L - 6} y={yT(v) + 3.5} textAnchor="end">
              {v < 0 ? `−${-v}` : v}
            </text>
          ))}

          {/* bottom: how well the state can be read and written */}
          <text className="gr-ax" x={0} y={B0 - 11}>
            R² · Skill
          </text>
          {[1, 0.5, 0].map((v) => (
            <text key={v} x={L - 6} y={yB(v) + 3.5} textAnchor="end">
              {v}
            </text>
          ))}
          {POINTS.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={B1 + 16}
              textAnchor="middle"
              fill={i === k ? "var(--tx)" : undefined}
            >
              {i}
            </text>
          ))}
          <text className="gr-ax" x={X1} y={B1 + 33} textAnchor="end">
            Residual point
          </text>

          {k !== null && (
            <line
              x1={crisp(x(k))}
              x2={crisp(x(k))}
              y1={T0 - 6}
              y2={B1 + 4}
              stroke="var(--tx3)"
              shapeRendering="crispEdges"
            />
          )}

          <path d={line(yT, "index")} fill="none" stroke="var(--tx2)" strokeWidth={1} />
          <path d={line(yB, "skill")} fill="none" stroke="var(--tx3)" strokeWidth={1} />
          <path d={line(yB, "r2")} fill="none" stroke="var(--tx2)" strokeWidth={1} />
          {rows.map((row, i) => (
            <g key={POINTS[i]}>
              <Dot x={x(i)} y={yB(num(row.skill))} />
              <Dia x={x(i)} y={yB(num(row.r2))} />
              <Tri x={x(i)} y={yT(num(row.index))} hollow={num(row.fid) < 0} />
            </g>
          ))}
          {r && k !== null && (
            <g fill="none" stroke="var(--tx)" strokeWidth={1}>
              <circle cx={x(k)} cy={yT(num(r.index))} r={9} />
              <circle cx={x(k)} cy={yB(num(r.r2))} r={8} />
              <circle cx={x(k)} cy={yB(num(r.skill))} r={6} stroke="var(--tx3)" />
            </g>
          )}

          <rect
            x={L}
            y={0}
            width={W - L}
            height={H}
            fill="transparent"
            onPointerDown={() => {
              scrub.current = false;
            }}
            onPointerMove={(e) => {
              if (e.pointerType !== "mouse" && !scrub.current) {
                const t = travel(e);
                if (!t || t[0] < 10 || t[0] <= t[1]) return;
                scrub.current = true;
              }
              setPoint(near(e));
            }}
            onPointerUp={(e) => {
              if (e.pointerType === "mouse" || scrub.current || !isTap(e)) return;
              const i = near(e);
              setPoint(i === k ? null : i);
            }}
            onPointerLeave={(e) => e.pointerType === "mouse" && setPoint(null)}
          />
        </svg>
      </div>
    </div>
  );
}

/** One readout: a name and a value of fixed width, so the line never shifts. */
function Rd({ name, v, w = 5 }: { name: string; v: string; w?: number }) {
  return (
    <span className="gr-rdi">
      {name} <b style={{ minWidth: `${w}ch` }}>{v}</b>
    </span>
  );
}

function Key() {
  return (
    <ul className="gr-key">
      <li>
        <svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true">
          <Tri x={0} y={0.6} />
        </svg>
        <span>inverse map Edit Index</span>
      </li>
      <li>
        <svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true">
          <Tri x={0} y={0.6} hollow />
        </svg>
        <span>Edit Fidelity below 0</span>
      </li>
      <li>
        <svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true">
          <Dia x={0} y={0} />
        </svg>
        <span>
          inverse map <i>R²</i>
        </span>
      </li>
      <li>
        <svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true">
          <Dot x={0} y={0} />
        </svg>
        <span>MLP probe skill</span>
      </li>
    </ul>
  );
}

/** The residual point k, read out for a screen reader. */
function said(k: number) {
  return `Residual point ${k}${k === 0 ? " (embedding)" : ""}. ${MODELS.map((m) => {
    const r = TABLE10[m.id][k];
    return `${m.label}: Edit Index ${r.index}, Edit Fidelity ${r.fid}, inverse R² ${r.r2}, probe skill ${r.skill}.`;
  }).join(" ")}`;
}

/** The depth chart: standard Othello beside standard Rayworld. */
export default function DepthChart() {
  const k = usePoint();

  const key = (e: KeyboardEvent) => {
    const at = k ?? 0;
    let to: number;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") to = Math.min(LAST, at + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") to = Math.max(0, at - 1);
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = LAST;
    else if (e.key === "Escape") {
      setPoint(null);
      return;
    } else return;
    e.preventDefault();
    setPoint(to);
  };

  return (
    <figure className="gr gr-chart">
      <Key />
      <div className="gr-panels">
        <div
          className="gr-sl"
          role="slider"
          aria-label="Residual point"
          aria-valuemin={0}
          aria-valuemax={LAST}
          aria-valuenow={k ?? 0}
          aria-valuetext={said(k ?? 0)}
          aria-orientation="horizontal"
          tabIndex={0}
          onKeyDown={key}
          onFocus={() => k === null && setPoint(0)}
          onBlur={() => setPoint(null)}
        />
        {MODELS.map((m) => (
          <Panel key={m.id} model={m.id} label={m.label} k={k} />
        ))}
      </div>
      <figcaption className="cap">
        The table above as a chart, from the embedding (0) to the last block (8). Top, the inverse
        map's Edit Index, hollow where it leaves the prediction worse than no edit. Bottom, its{" "}
        <i>R²</i> and the MLP probe's skill.
      </figcaption>
    </figure>
  );
}
