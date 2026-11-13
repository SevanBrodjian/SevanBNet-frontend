import { Fragment, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { type Cell, EDITORS, TABLE1, TABLE16, type Variant } from "./data";
import { heat, type Scale } from "./heat";
import "./results.css";

// The paper's result tables, coloured as in the paper: Table 1 (decodability and
// editability, every variant) and Table 16 (the withheld viewpoint). The depth chart keeps the
// residual point being looked at through `usePoint` / `setPoint`.

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

/** The residual point being looked at in the chart. */
export const usePoint = () =>
  useSyncExternalStore(
    subscribe,
    () => point,
    () => null,
  );

/* ---------- taps ----------
   A mouse looks at a point by hovering; touch and pen pick one with a tap. A tap comes up
   where it went down (a press that scrolls is cancelled by the browser), and a tap anywhere
   but the chart lets go of the point. */
let press: { x: number; y: number } | null = null;
const down = (e: PointerEvent) => {
  press = { x: e.clientX, y: e.clientY };
};
const cancel = () => {
  press = null;
};
const up = (e: PointerEvent) => {
  const out = !(e.target instanceof Element && e.target.closest(".gr-panels"));
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

/** A number on the paper's scale; `g` opens a column group with a gap before it. */
function Num({ c, scale, g }: { c: Cell | string; scale: Scale; g?: boolean }) {
  const { v, dag } = typeof c === "string" ? { v: c, dag: false } : c;
  return (
    <td className={g ? "gr-g" : undefined} style={heat(v, scale)}>
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

/* ---------- Table 1 ---------- */

/** Table 1: decodability and editability of every variant under each editor. */
export function EditTable() {
  return (
    <figure className="gr gr-t2">
      <Scroll label="Table 1: decodability and editability">
        <table className="gr-tbl">
          <thead>
            <tr>
              <th scope="col" rowSpan={2} className="gr-var">
                Variant
              </th>
              <th scope="colgroup" colSpan={2} className="gr-g gr-ed">
                Probe Skill
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
                <abbr title="linear probe on the raw observation history">Obs.</abbr>
              </th>
              <th scope="col">
                <abbr title="linear probe on the trained model">Trained</abbr>
              </th>
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
          {TABLE1.map((g) => (
            <tbody key={g.id}>
              <tr>
                <th scope="rowgroup" colSpan={10} className="gr-gl">
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
                  <Num c={r.obs} scale="skill" g />
                  <Num c={r.trained} scale="skill" />
                  <Num c={r.unedited} scale="index" g />
                  {EDITORS.map((e) => (
                    <Fragment key={e.id}>
                      <Num c={r[e.id].index} scale="index" g />
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
        Decodability and editability <Better />. Probe Skill is the linear probe's, on the raw
        observation history (Obs.) and on the trained model (Trained). Index scores only the rays or
        cells the edit changes, from −1 (the unedited world) to +1 (the edited world). Fid. scores
        the whole output: 1 is exact, 0 no better than no edit. An editor succeeds when its Index
        reaches +0.4 and its Fid. 0.25. Each editor at its best setting with Fid. ≥ 0 (its best Fid.
        where none reaches 0), over 1000 edit cases. <span className="gr-dag">†</span> Seed spread
        above 0.1.
      </figcaption>
    </figure>
  );
}

/* ---------- Table 16 ---------- */

const VIEW_GROUPS = [...new Set(TABLE16.map((r) => r.model))];

/** Table 16: editability of continuous positions when the viewpoint is withheld. */
export function ViewTable() {
  return (
    <figure className="gr gr-t16">
      <Scroll label="Table 16: withholding the viewpoint">
        <table className="gr-tbl">
          <thead>
            <tr>
              <th scope="col" rowSpan={2} className="gr-var">
                Viewpoint
              </th>
              {EDITORS.slice(0, 2).map((e) => (
                <th key={e.id} scope="colgroup" colSpan={2} className="gr-g gr-ed">
                  <abbr title={e.name}>{e.short}</abbr>
                </th>
              ))}
            </tr>
            <tr>
              {EDITORS.slice(0, 2).map((e) => (
                <Fragment key={e.id}>
                  <th scope="col" className="gr-g">
                    Index
                  </th>
                  <th scope="col">Fid.</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          {VIEW_GROUPS.map((m) => (
            <tbody key={m}>
              <tr>
                <th scope="rowgroup" colSpan={5} className="gr-gl">
                  <span>
                    Rayworld <code>{m}</code>
                  </span>
                </th>
              </tr>
              {TABLE16.filter((r) => r.model === m).map((r) => (
                <tr key={r.view}>
                  <th scope="row" className="gr-var">
                    {r.view}
                  </th>
                  <Num c={r.pi.index} scale="index" g />
                  <Num c={r.pi.fid} scale="fid" />
                  <Num c={r.gs.index} scale="index" g />
                  <Num c={r.gs.fid} scale="fid" />
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </Scroll>
      <figcaption className="cap">
        Editability of continuous positions <Better />, with the viewpoint withheld until after the
        model commits to a state. Single observer is the ordinary model, as in the results above.
      </figcaption>
    </figure>
  );
}
