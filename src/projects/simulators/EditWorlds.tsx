import { useEffect, useId, useRef, useState } from "react";
import { STILL } from "../../frame/live";
import { tones } from "./demo-draw";
import { type OthEvent, type OthelloDemo, type OthReport, othelloDemo } from "./demo-othello";
import {
  binnable,
  RAY_VARIANTS,
  type RayDemo,
  type RayEvent,
  type RayReport,
  type RayVariant,
  rayDemo,
} from "./demo-ray";
import { VARIANTS as OTH_VARIANTS, type Variant as OthVariant, squareName } from "./othello";
import "./demo.css";

// The paper's two environments, live, side by side: Rayworld and Othello, each with its
// variants, each open to the edit the paper makes. The simulators are the true environments;
// no model runs here. The drawing and the rules live in demo-ray.ts and demo-othello.ts.

/** Every word the demo shows or says. */
export const EDIT_WORDS = {
  ray: {
    name: "Rayworld",
    group: "Rayworld variant",
    variants: {
      standard: "standard",
      blink: "blink",
      "16-ray": "16-ray",
      "8-ray": "8-ray",
      "5-ray": "5-ray",
    } satisfies Record<RayVariant, string>,
    bins: "Bins",
    pause: "Pause",
    play: "Play",
    /** Under reduced motion nothing plays; this draws another episode instead. */
    next: "Next",
    frame: (f: number, n: number) => `frame ${String(f).padStart(2, "0")}/${n}`,
    rays: (n: number) => `${n} rays`,
    binCount: (n: number) => `${n} bins`,
    broken: { wall: "wall", disc: "too close" },
    discs: ["the dim disc", "the bright disc"],
    /** The canvas's description: what it shows, and its keys. */
    about:
      "Rayworld from above: two discs moving through a frustum, the fan of rays that observes them, and the history of observations, one row per frame. Drag a disc to teleport it. From the keyboard: Enter picks a disc (again for the other one), the arrow keys move it, Enter drops it, Escape cancels.",
    say: {
      pick: (disc: string) => `${disc} picked up`,
      edit: (disc: string, holds: boolean) =>
        holds ? `${disc} moved` : `${disc} moved; it will break the world`,
      refused: "No room there",
      broken: { wall: "A disc reached a wall", disc: "The discs came too close" },
    },
  },
  oth: {
    name: "Othello",
    group: "Othello variant",
    variants: {
      standard: "standard",
      "adjacent-flip": "adjacent-flip",
      "adjacent-noflip": "adjacent-noflip",
      "standard-noflip": "standard-noflip",
    } satisfies Record<OthVariant, string>,
    renew: "New opening",
    move: (n: number, of: number) => `move ${String(n).padStart(2, "0")}/${of}`,
    player: { 1: "black to move", [-1]: "white to move" } as Record<number, string>,
    legal: (before: number, after: number | null) =>
      after === null ? `legal ${before}` : `legal ${before} → ${after}`,
    changed: (n: number) => `${n} changed`,
    rejected: { unchanged: "unchanged", empty: "no moves" },
    /** The canvas's description: what it shows, and its keys. */
    about:
      "Othello board after a real 20-move opening, legal moves filled. Click a token outside the centre four to flip its colour; click it again to undo. From the keyboard: the arrow keys move a cursor and Enter flips.",
    say: {
      flip: (sq: string, before: number, after: number, changed: number) =>
        `${sq} flipped. Legal moves ${before} to ${after}, ${changed} changed.`,
      unflip: (sq: string) => `${sq} restored`,
      refused: { center: "The centre four cannot be flipped", empty: "Nothing to flip there" },
    },
  },
};

const W = EDIT_WORDS;

export default function EditWorlds() {
  return (
    <div className="ew">
      <div className="ew-grid">
        <RayPanel />
        <OthelloPanel />
      </div>
    </div>
  );
}

function RayPanel() {
  const cv = useRef<HTMLCanvasElement>(null);
  const rd = useRef<HTMLSpanElement>(null);
  const low = useRef<HTMLSpanElement>(null);
  const demo = useRef<RayDemo | null>(null);
  const [variant, setVariant] = useState<RayVariant>("standard");
  const [bins, setBins] = useState(false);
  const [paused, setPaused] = useState(false);
  const [say, setSay] = useState("");
  const how = useId();

  useEffect(() => {
    const el = cv.current;
    if (!el) return;
    const paint = (r: RayReport) => {
      const out = rd.current;
      if (out) {
        out.textContent = r.broken ? W.ray.broken[r.broken] : W.ray.frame(r.frame, r.frames);
        out.toggleAttribute("data-bad", !!r.broken);
      }
      const parts = [W.ray.rays(r.rays)];
      if (r.bins) parts.push(W.ray.binCount(r.bins));
      if (low.current) low.current.textContent = parts.join("   ");
    };
    const announce = (e: RayEvent) => {
      if (e.kind === "pick") setSay(W.ray.say.pick(W.ray.discs[e.disc]));
      else if (e.kind === "edit") setSay(W.ray.say.edit(W.ray.discs[e.disc], e.holds));
      else if (e.kind === "refused") setSay(W.ray.say.refused);
      else setSay(W.ray.say.broken[e.cause]);
    };
    const d = rayDemo(el, {
      variant: "standard",
      bins: false,
      paused: false,
      tones: tones(el),
      report: paint,
      announce,
    });
    demo.current = d;
    return () => {
      d.dispose();
      demo.current = null;
    };
  }, []);

  const choose = (v: RayVariant) => {
    setVariant(v);
    setSay("");
    demo.current?.setVariant(v);
  };

  return (
    <div className="ew-panel ew-ray">
      <div className="live mx ew-well">
        {/* biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: an application takes its own keys (arrows, Enter), so screen readers pass them through */}
        <canvas
          ref={cv}
          tabIndex={0}
          role="application"
          aria-label={W.ray.name}
          aria-describedby={how}
        />
        <span className="osd ew-name">{W.ray.name}</span>
        <span className="osd ew-rd" ref={rd} />
        <span className="osd ew-low" ref={low} />
        <span className="ew-acts">
          {binnable(variant) && (
            <button
              type="button"
              className="ew-act ew-tog"
              aria-pressed={bins}
              onClick={() => {
                setBins(!bins);
                demo.current?.setBins(!bins);
              }}
            >
              {W.ray.bins}
            </button>
          )}
          {STILL ? (
            <button type="button" className="ew-act" onClick={() => demo.current?.renew()}>
              {W.ray.next}
            </button>
          ) : (
            <button
              type="button"
              className="ew-act ew-run"
              onClick={() => {
                setPaused(!paused);
                demo.current?.setPaused(!paused);
              }}
            >
              {paused ? W.ray.play : W.ray.pause}
            </button>
          )}
        </span>
      </div>
      <div className="ew-bar">
        <fieldset className="ew-seg">
          <legend className="vh">{W.ray.group}</legend>
          {RAY_VARIANTS.map((v) => (
            <button
              key={v}
              type="button"
              className="btn"
              aria-pressed={variant === v}
              onClick={() => choose(v)}
            >
              {W.ray.variants[v]}
            </button>
          ))}
        </fieldset>
      </div>
      <p className="vh" id={how}>
        {W.ray.about}
      </p>
      <p className="vh" aria-live="polite">
        {say}
      </p>
    </div>
  );
}

function OthelloPanel() {
  const cv = useRef<HTMLCanvasElement>(null);
  const top = useRef<HTMLSpanElement>(null);
  const low = useRef<HTMLSpanElement>(null);
  const demo = useRef<OthelloDemo | null>(null);
  const [variant, setVariant] = useState<OthVariant>("standard");
  const [say, setSay] = useState("");
  const how = useId();

  useEffect(() => {
    const el = cv.current;
    if (!el) return;
    const paint = (r: OthReport) => {
      if (top.current) top.current.textContent = W.oth.move(r.ply, r.total);
      const [who, what] = low.current?.children ?? [];
      if (!who || !what) return;
      who.textContent = W.oth.player[r.player];
      const parts = [W.oth.legal(r.before, r.after)];
      if (r.changed !== null) {
        parts.push(r.rejected ? W.oth.rejected[r.rejected] : W.oth.changed(r.changed));
      }
      what.textContent = parts.join("   ");
    };
    const announce = (e: OthEvent) => {
      if (e.kind === "flip") {
        const x = e.edit;
        setSay(
          W.oth.say.flip(
            squareName(x.sq),
            x.before.moves.length,
            x.after.moves.length,
            x.changed.length,
          ),
        );
      } else if (e.kind === "unflip") setSay(W.oth.say.unflip(squareName(e.sq)));
      else setSay(W.oth.say.refused[e.why]);
    };
    const d = othelloDemo(el, { variant: "standard", tones: tones(el), report: paint, announce });
    demo.current = d;
    return () => {
      d.dispose();
      demo.current = null;
    };
  }, []);

  return (
    <div className="ew-panel ew-oth">
      <div className="live mx ew-well">
        {/* biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: an application takes its own keys (arrows, Enter), so screen readers pass them through */}
        <canvas
          ref={cv}
          tabIndex={0}
          role="application"
          aria-label={W.oth.name}
          aria-describedby={how}
        />
        <span className="osd ew-name">{W.oth.name}</span>
        <span className="osd ew-rd" ref={top} />
        <span className="osd ew-low" ref={low}>
          <span />
          <span />
        </span>
        <span className="ew-acts">
          <button type="button" className="ew-act" onClick={() => demo.current?.renew()}>
            {W.oth.renew}
          </button>
        </span>
      </div>
      <div className="ew-bar">
        <fieldset className="ew-seg">
          <legend className="vh">{W.oth.group}</legend>
          {OTH_VARIANTS.map((v) => (
            <button
              key={v}
              type="button"
              className="btn"
              aria-pressed={variant === v}
              onClick={() => {
                setVariant(v);
                setSay("");
                demo.current?.setVariant(v);
              }}
            >
              {W.oth.variants[v]}
            </button>
          ))}
        </fieldset>
      </div>
      <p className="vh" id={how}>
        {W.oth.about}
      </p>
      <p className="vh" aria-live="polite">
        {say}
      </p>
    </div>
  );
}
