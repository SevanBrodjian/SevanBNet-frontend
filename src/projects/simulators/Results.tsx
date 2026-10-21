import { Fragment, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  BOTTLENECK,
  type Cell,
  EDITORS,
  MODELS,
  type Model,
  POINTS,
  TABLE2,
  TABLE10,
  type Variant,
} from "./data";
import { heat, type Scale } from "./heat";
import "./results.css";

// The paper's result tables, coloured as in the paper: Table 2 (editability, every variant)
// and Table 10 (the standard models through every residual point). Table 10 and the depth
// chart share the residual point being looked at through `usePoint` / `setPoint`.

/* ---------- the residual point under the pointer (shared with DepthChart) ---------- */
let point: number | null = null;
const subs = new Set<() => void>();
const subscribe = (f: () => void) => {
  if (!subs.size) listen(true);
  subs.add(f);
  return () => {
    subs.delete(f);
    if (subs.size) return;
    listen(false);
    point = null; // a page opened again starts with nothing picked
  };
};

/** Look at residual point k (null: none). */
export function setPoint(k: number | null) {
  if (k === point) return;
  point = k;
  for (const f of subs) f();
}

/** The residual point being looked at, in the chart or in Table 10. */
export const usePoint = () =>
  useSyncExternalStore(
    subscribe,
    () => point,
    () => null,
  );

/* ---------- taps ----------
   A mouse looks at a point by hovering; touch and pen pick one with a tap. A tap comes up
   where it went down (a press that scrolls is cancelled by the browser), and a tap anywhere
   but Table 10's rows and the chart lets go of the point. */
let press: { x: number; y: number } | null = null;
const down = (e: PointerEvent) => {
  press = { x: e.clientX, y: e.clientY };
};
const cancel = () => {
  press = null;
};
const up = (e: PointerEvent) => {
  const out = !(e.target instanceof Element && e.target.closest(".gr-t10 tbody, .gr-panels"));
  if (point !== null && out && isTap(e)) setPoint(null);
  press = null;
};
function listen(on: boolean) {
  if (on) {
    addEventListener("pointerdown", down, true);
    addEventListener("pointercancel", cancel, true);
    addEventListener("pointerup", up); // bubbling, so the rows and the chart see the press first
  } else {
    removeEventListener("pointerdown", down, true);
    removeEventListener("pointercancel", cancel, true);
    removeEventListener("pointerup", up);
  }
}

/** How far the pointer has come since it went down (null: not pressed). */
export function travel(e: { clientX: number; clientY: number }): [number, number] | null {
  return press && [Math.abs(e.clientX - press.x), Math.abs(e.clientY - press.y)];
}

/** Whether a pointerup ends a tap. */
export function isTap(e: { clientX: number; clientY: number }) {
  const t = travel(e);
  return t !== null && t[0] < 10 && t[1] < 10;
}

/* ---------- pieces ---------- */

/** "(higher is better, lower is worse)", the words tinted as in the paper. */
export function Better() {
  return (
    <>
      (<span className="gr-hi">higher</span> is better, <span className="gr-lo">lower</span> is
      worse)
    </>
  );
}

const DAG = "seed standard deviation above 0.1";

function Num({ c, scale }: { c: Cell | string; scale: Scale }) {
  const { v, dag } = typeof c === "string" ? { v: c, dag: false } : c;
  return (
    <td style={heat(v, scale)}>
      {v}
      {dag && (
        <sup className="gr-dag" title={DAG}>
          †<span className="vh"> ({DAG})</span>
        </sup>
      )}
    </td>
  );
}

function Name({ v }: { v: Variant }) {
  return (
    <>
      <code>{v.name}</code>
      {v.note && <span className="gr-note"> ({v.note})</span>}
    </>
  );
}

/** A table that scrolls sideways in its own box on narrow screens; only while it does is it a
 *  region the keyboard stops at. */
function Scroll({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScrolls(el.scrollWidth > el.clientWidth + 1));
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);
  return (
    <section
      ref={ref}
      className="gr-scroll"
      aria-label={scrolls ? label : undefined}
      tabIndex={scrolls ? 0 : undefined}
    >
      {children}
    </section>
  );
}

/* ---------- Table 2 ---------- */

/** Table 2: editability of every variant under each editor. */
export function EditTable() {
  return (
    <figure className="gr gr-t2">
      <Scroll label="Table 2: editability">
        <table className="gr-tbl">
          <thead>
            <tr>
              <th scope="col" rowSpan={2} className="gr-var">
                Variant
              </th>
              <th scope="col" className="gr-g gr-up">
                Unedited
              </th>
              {EDITORS.map((e) => (
                <th key={e.id} scope="colgroup" colSpan={2} className="gr-g gr-ed">
                  <abbr title={e.name}>{e.short}</abbr>
                </th>
              ))}
            </tr>
            <tr>
              <th scope="col" className="gr-g">
                Index
              </th>
              {EDITORS.map((e) => (
                <Fragment key={e.id}>
                  <th scope="col" className="gr-g">
                    Index
                  </th>
                  <th scope="col">Fid.</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          {TABLE2.map((g) => (
            <tbody key={g.id}>
              <tr>
                <th scope="rowgroup" colSpan={8} className="gr-gl">
                  <span>
                    {g.label}
                    {g.sub && <span className="gr-sub"> {g.sub}</span>}
                  </span>
                </th>
              </tr>
              {g.rows.map((r) => (
                <tr key={r.name + (r.note ?? "")}>
                  <th scope="row" className="gr-var">
                    <Name v={r} />
                  </th>
                  <Num c={r.unedited} scale="index" />
                  {EDITORS.map((e) => (
                    <Fragment key={e.id}>
                      <Num c={r[e.id].index} scale="index" />
                      <Num c={r[e.id].fid} scale="fid" />
                    </Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </Scroll>
      <figcaption className="cap">
        Editability <Better />. Index scores only the rays or cells the edit changes, from −1 (the
        unedited world) to +1 (the edited world). Fid. scores the whole output: 1 is exact, 0 no
        better than no edit. An editor lands when its Index is clearly above 0 with Fid. above 0.
        Each editor at its best setting with Fid. ≥ 0 (its best Fid. where none reaches 0), over
        1000 edit cases. <span className="gr-dag">†</span> Seed spread above 0.1.
      </figcaption>
    </figure>
  );
}

/* ---------- Table 10 ---------- */

const COLS: { key: "skill" | "r2" | "index" | "fid"; top: string; bot: ReactNode; scale: Scale }[] =
  [
    { key: "skill", top: "Probe", bot: "Skill", scale: "skill" },
    { key: "r2", top: "Inverse", bot: <i>R²</i>, scale: "skill" },
    { key: "index", top: "IM", bot: "Index", scale: "index" },
    { key: "fid", top: "IM", bot: "Fid.", scale: "fid" },
  ];

/** Table 10: decodability and inverse-map editability at every residual point. */
export function DepthTable() {
  const k = usePoint();
  return (
    <figure className="gr gr-t10">
      <Scroll label="Table 10: by residual point">
        <table className="gr-tbl">
          <thead>
            <tr>
              <th scope="col" rowSpan={2} className="gr-var">
                Residual point
              </th>
              {MODELS.map((m) => (
                <th key={m.id} scope="colgroup" colSpan={4} className="gr-g gr-ed">
                  {m.label} <code>standard</code>
                </th>
              ))}
            </tr>
            <tr>
              {MODELS.map((m) =>
                COLS.map((col, i) => (
                  <th key={m.id + col.key} scope="col" className={i === 0 ? "gr-g" : undefined}>
                    {col.top}
                    <br />
                    {col.bot}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {POINTS.map((p) => (
              <tr
                key={p}
                className={p === k ? "gr-on" : undefined}
                onPointerEnter={(e) => e.pointerType === "mouse" && setPoint(p)}
                onPointerLeave={(e) => e.pointerType === "mouse" && setPoint(null)}
                onPointerUp={(e) =>
                  e.pointerType !== "mouse" && isTap(e) && setPoint(p === k ? null : p)
                }
              >
                <th scope="row" className="gr-var">
                  {p}
                  {p === 0 && <span className="gr-note"> (embedding)</span>}
                </th>
                {MODELS.map((m) => (
                  <Cells key={m.id} model={m.id} p={p} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Scroll>
      <figcaption className="cap">
        Every residual point of the <code>standard</code> models <Better />. Point <i>k</i> follows
        block <i>k</i>; Probe Skill is the MLP probe's, inverse <i>R²</i> the inverse map's held-out
        fit there, IM its edit. Fit alone does not locate the bottleneck: Othello's <i>R²</i> is
        highest at point 8, where IM fails. <span className="gr-bnk" aria-hidden="true" />
        Othello's points 4 and 5, the only points where IM lands.
      </figcaption>
    </figure>
  );
}

function Cells({ model, p }: { model: Model; p: number }) {
  const r = TABLE10[model][p];
  const bn = model === "othello" && BOTTLENECK.includes(p);
  return COLS.map((col, i) => {
    const cls = [i === 0 && "gr-g", i === 0 && bn && "gr-bn"].filter(Boolean).join(" ");
    return (
      <td key={col.key} className={cls || undefined} style={heat(r[col.key], col.scale)}>
        {r[col.key]}
      </td>
    );
  });
}
