import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { living, loopStats, REDUCED_MOTION, TIER } from "../frame/live";
import { boxCount, click } from "./fx";
import {
  CORE_GROUPS,
  type ControlRow,
  DEFAULTS,
  type Fmt,
  FORMAT,
  LAMPS,
  ORDER,
  PRESETS,
  type Spec,
  wrapPos,
} from "./schema";
import {
  closePanel,
  currentPos,
  currentSeed,
  get,
  isDirty,
  label,
  match,
  reroll,
  reset,
  set,
  setPos,
  specFor,
  useControlsVersion,
  useGroups,
  usePanelOpen,
} from "./store";

// The controls panel: every setting on one instrument panel, docked under the page so the
// consequence of each control stays visible while you work it. It has no visible entry
// point (see ViewToggle). Its palette and type are its own, so no setting can make it
// unreadable.
// - the track at the top blends between the four views (each a preset of everything below)
// - sliders catch on the default and on each view's value
// - double-click a label to return that control to its default; Reset all returns
//   everything

export default function Panel() {
  return usePanelOpen() ? <PanelBody /> : null;
}

const STOPS = [
  { key: "c", name: "Comfort" },
  { key: "w", name: "Wireframe" },
  { key: "b", name: "Broken" },
  { key: "r", name: "Reactive" },
  { key: "c2", name: "Comfort" },
];
const INITIAL: Record<string, string> = {
  comfort: "C",
  wireframe: "W",
  broken: "B",
  reactive: "R",
};

function PanelBody() {
  useControlsVersion();
  const groups = useGroups();
  const root = useRef<HTMLDialogElement>(null);
  const master = useRef<HTMLInputElement>(null);
  const clock = useRef<HTMLElement>(null);
  const [full, setFull] = useState(false);

  // Keep the page scrollable above the panel, and tell fixed layers how tall it is.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const html = document.documentElement;
    html.classList.add("cp-open");
    const pad = () => {
      const h = el.getBoundingClientRect().height;
      document.body.style.paddingBottom = `${h}px`;
      html.style.setProperty("--cp-h", `${h}px`);
    };
    pad();
    const ro = new ResizeObserver(pad);
    ro.observe(el);
    return () => {
      ro.disconnect();
      html.classList.remove("cp-open");
      document.body.style.paddingBottom = "";
      html.style.removeProperty("--cp-h");
    };
  }, []);

  useEffect(() => {
    master.current?.focus({ preventScroll: true });
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("dialog[open]:modal")) return;
      e.preventDefault();
      closePanel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // The clock lamp blinks at the controls' clock rate.
  const fps = Number(get("fps")) || 60;
  useEffect(() => {
    const lamp = clock.current;
    if (!lamp) return;
    const o = living({
      always: true,
      fps,
      notempo: true,
      paused: REDUCED_MOTION,
      tick() {
        lamp.classList.toggle("on");
      },
    });
    return () => o.dispose();
  }, [fps]);

  const pos = currentPos();
  const m = match();
  const dirtyAny = (keys: string[]) => keys.some(isDirty);

  return (
    <dialog ref={root} className={full ? "cp full" : "cp"} open aria-label="Controls">
      <div className="cp-top">
        <span className="cp-id">
          <i ref={clock} className="cp-clock" />
          <span>Controls</span>
        </span>
        <Master input={master} pos={pos} />
        <output className="cp-mo" htmlFor="cp-master">
          {label()}
        </output>
        <div className="cp-acts">
          <button type="button" className="cp-b warn" onClick={reset}>
            Reset all
          </button>
          <button type="button" className="cp-b" onClick={() => setFull(!full)}>
            {full ? "Half" : "Full"}
          </button>
          <button type="button" className="cp-b" onClick={closePanel}>
            Close
          </button>
        </div>
      </div>
      <div className="cp-body">
        <div className="cp-row1">
          <ul className="cp-ann" aria-label="Annunciators">
            {LAMPS.map((l) => (
              <li key={l.label} className={lampClass(l.tone, dirtyAny(l.keys))}>
                {l.label}
              </li>
            ))}
            <li className={lampClass("a", REDUCED_MOTION || TIER === "S")}>HELD</li>
            <li className={lampClass(undefined, !m)}>CUSTOM</li>
          </ul>
          <Instruments />
        </div>
        <div className="cp-groups">
          {CORE_GROUPS.map((g) => (
            <Group key={g.id} title={g.title}>
              {g.rows.map((r) =>
                "action" in r ? <Reroll key="reroll" /> : <Row key={r.id} row={r} />,
              )}
            </Group>
          ))}
          {groups.map((g) => (
            <Group key={g.id} title={g.title}>
              {g.controls.map((c) => (
                <Row key={c.id} row={{ id: `${g.id}.${c.id}`, label: c.label, fmt: c.fmt }} />
              ))}
            </Group>
          ))}
        </div>
      </div>
    </dialog>
  );
}

const lampClass = (tone: string | undefined, lit: boolean) =>
  ["cp-lamp", tone, lit && "on"].filter(Boolean).join(" ");

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="cp-g">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/** The track: Comfort, Wireframe, Broken, Reactive and back to Comfort; between two
 *  views everything blends. */
function Master({ input, pos }: { input: RefObject<HTMLInputElement | null>; pos: number | null }) {
  const want = useRef<number | null>(null);
  const raf = useRef(0);
  const last = useRef(pos ?? 0);
  const [drag, setDrag] = useState<number | null>(null);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const commit = (p: number) => {
    want.current = p;
    if (raf.current) return;
    // One blend per frame, however fast the drag.
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      if (want.current !== null) setPos(want.current >= 4 ? 0 : want.current, "panel");
    });
  };
  const onInput = (raw: number) => {
    let v = raw;
    const r = Math.round(v);
    if (Math.abs(v - r) < 0.06) v = r;
    if (Number.isInteger(v) && Math.round(last.current) !== v) click("detent");
    last.current = v;
    setDrag(v);
    commit(v);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const cur = currentPos() ?? 0;
    const step = e.shiftKey ? 0.01 : 0.05;
    let p: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") p = cur + step;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") p = cur - step;
    else if (e.key === "PageUp") p = Math.floor(cur + 1e-6) + 1;
    else if (e.key === "PageDown") p = Math.ceil(cur - 1e-6) - 1;
    else if (e.key === "Home") p = 0;
    else if (e.key === "End") p = 3;
    if (p === null) return;
    e.preventDefault();
    const r = Math.round(p);
    if (Math.abs(p - r) < 0.02) p = r;
    setPos(wrapPos(p), "panel");
  };
  const shown = drag ?? pos ?? 0;
  return (
    <div className="cp-m">
      <div className="cp-mt" aria-hidden="true" />
      <div className="cp-ms" aria-hidden="true">
        {STOPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            tabIndex={-1}
            style={{ left: `${i * 25}%` }}
            onClick={() => setPos(i % 4, "preset")}
          >
            {s.name}
          </button>
        ))}
      </div>
      <input
        ref={input}
        id="cp-master"
        className={pos === null ? "cp-master off" : "cp-master"}
        type="range"
        min={0}
        max={4}
        step={0.001}
        value={shown}
        aria-label="View, blended between presets"
        aria-valuetext={label()}
        onChange={(e) => onInput(Number(e.target.value))}
        onPointerUp={() => setDrag(null)}
        onBlur={() => setDrag(null)}
        onKeyDown={onKey}
      />
    </div>
  );
}

function Instruments() {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, []);
  const s = loopStats();
  const pos = currentPos();
  const rows: [string, string | number][] = [
    ["frame", `${s.frameMs.toFixed(1)} ms`],
    ["clock", `${get("fps")} Hz`],
    ["nodes", document.getElementsByTagName("*").length],
    ["boxes", boxCount()],
    ["living", `${s.running} / ${s.total}`],
    ["viewport", `${innerWidth}×${innerHeight}`],
    ["dpr", devicePixelRatio],
    ["tier", TIER],
    ["scroll", Math.round(scrollY)],
    ["room", document.documentElement.dataset.room ?? ""],
    ["pos", pos === null ? "—" : pos.toFixed(3)],
    ["seed", currentSeed()],
  ];
  return (
    <div className="cp-inst" aria-hidden="true">
      {rows.map(([k, v]) => (
        <div key={k}>
          <span>{k}</span>
          <b>{String(v)}</b>
        </div>
      ))}
    </div>
  );
}

function Reroll() {
  return (
    <div className="cp-row cp-act">
      <span className="cp-l">
        <i className="cp-dot" />
        <span>Seed</span>
      </span>
      <button type="button" className="cp-b" onClick={reroll}>
        Re-roll
      </button>
      <output className="cp-o">{currentSeed()}</output>
    </div>
  );
}

function Row({ row }: { row: ControlRow }) {
  const spec = specFor(row.id);
  const id = `cp-${useId().replace(/:/g, "")}`;
  if (!spec) return null;
  const toDefault = () => set(row.id, spec.d, "panel");
  return (
    <div className={isDirty(row.id) ? "cp-row dirty" : "cp-row"} data-k={row.id}>
      <label
        className="cp-l"
        htmlFor={id}
        title="Double-click for the default"
        onDoubleClick={(e) => {
          e.preventDefault();
          toDefault();
        }}
      >
        <i className="cp-dot" />
        <span>{row.label}</span>
      </label>
      {spec.k === "s" ? (
        <Segments id={id} k={row.id} spec={spec} label={row.label} />
      ) : spec.k === "b" ? (
        <Switch id={id} k={row.id} label={row.label} guarded={row.guarded} />
      ) : (
        <Slider id={id} k={row.id} spec={spec} fmt={row.fmt} />
      )}
    </div>
  );
}

function Slider({
  id,
  k,
  spec,
  fmt,
}: {
  id: string;
  k: string;
  spec: Extract<Spec, { k: "n" | "h" }>;
  fmt?: Fmt;
}) {
  const v = Number(get(k));
  const range = spec.max - spec.min;
  // Detents: the default and every view's value.
  const marks: { at: number; who: string }[] = [];
  const at = new Set<number>([spec.d]);
  if (k in DEFAULTS) for (const view of ORDER) at.add(Number(PRESETS[view][k]));
  for (const d of at) {
    const who =
      k in DEFAULTS
        ? ORDER.filter((view) => PRESETS[view][k] === d)
            .map((view) => INITIAL[view])
            .join("")
        : "";
    marks.push({ at: d, who });
  }
  const last = useRef(v);
  const text = fmt ? FORMAT[fmt](v) : String(v);
  return (
    <>
      <div className="cp-tr">
        <div className="cp-det" aria-hidden="true">
          {marks.map((d) => (
            <i
              key={d.at}
              style={{ left: `${(((d.at - spec.min) / range) * 100).toFixed(2)}%` }}
              data-w={d.who || undefined}
            />
          ))}
        </div>
        <input
          id={id}
          type="range"
          min={spec.min}
          max={spec.max}
          step={spec.st}
          value={v}
          aria-valuetext={text}
          onChange={(e) => {
            let x = Number(e.target.value);
            const snap = [...at].find((d) => Math.abs(x - d) < range * 0.018);
            if (snap !== undefined) {
              if (snap !== last.current) click("detent");
              x = snap;
            }
            last.current = x;
            set(k, x, "panel");
          }}
        />
      </div>
      <output className="cp-o" htmlFor={id}>
        {text}
      </output>
    </>
  );
}

function Segments({
  id,
  k,
  spec,
  label: name,
}: {
  id: string;
  k: string;
  spec: Extract<Spec, { k: "s" }>;
  label: string;
}) {
  const v = String(get(k));
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (d: number) => {
    const i = spec.o.indexOf(v);
    const j = (i + d + spec.o.length) % spec.o.length;
    set(k, spec.o[j], "panel");
    refs.current[j]?.focus();
  };
  return (
    <fieldset
      className="cp-seg"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      <legend className="vh">{name}</legend>
      {spec.o.map((o, i) => (
        <button
          key={o}
          ref={(el) => {
            refs.current[i] = el;
          }}
          id={i === 0 ? id : undefined}
          type="button"
          aria-pressed={o === v}
          tabIndex={o === v ? 0 : -1}
          onClick={() => set(k, o, "panel")}
        >
          {o}
        </button>
      ))}
    </fieldset>
  );
}

function Switch({
  id,
  k,
  label: name,
  guarded,
}: {
  id: string;
  k: string;
  label: string;
  guarded?: boolean;
}) {
  const on = !!get(k);
  const [up, setUp] = useState(false);
  const sw = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!up) return;
    sw.current?.focus();
    // The guard drops again by itself.
    const t = window.setTimeout(() => setUp(false), 7000);
    return () => clearTimeout(t);
  }, [up]);
  const locked = !!guarded && !up;
  return (
    <>
      <div className={up ? "cp-swc up" : "cp-swc"}>
        <button
          ref={sw}
          id={id}
          type="button"
          role="switch"
          className="cp-sw"
          aria-checked={on}
          aria-label={name}
          disabled={locked}
          onClick={() => set(k, on ? 0 : 1, "panel")}
        >
          <span className="off">OFF</span>
          <span className="on">ON</span>
          <i />
        </button>
        {guarded && (
          <button
            type="button"
            className="cp-guard"
            aria-label={`Lift the guard on ${name}`}
            aria-expanded={up}
            onClick={() => setUp(!up)}
          >
            {!up && <span>GUARD</span>}
          </button>
        )}
      </div>
      <span className="cp-o" />
    </>
  );
}
