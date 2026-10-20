import { useEffect, useRef } from "react";
import { ORDER, type View } from "./schema";
import {
  isPanelOpen,
  label,
  match,
  nextView,
  openPanel,
  preset,
  subscribe,
  useControlsVersion,
} from "./store";

// The view toggle on the right of the navbar. Each press moves to the next view:
// Standard, Wireframe, Broken, Hyper, then Standard again. The controls panel has no
// button of its own; this toggle opens it when it is pressed rapidly for a moment, when
// it comes round to Standard for the third time, or when a mouse rests on it for a while.
// It lives in the header, which no setting can break or move.

/** Presses within RAPID_MS of each other that count as rapid; RAPID_N of them open. */
const RAPID_N = 7;
const RAPID_MS = 1400;
/** Arrivals at Standard that open the panel; being at Standard on load counts as one. */
const ARRIVALS = 3;
/** A mouse resting on the toggle this long opens the panel. */
const DWELL_MS = 7000;

let presses: number[] = [];
let arrivals = -1;

// The panel's reset returns to Standard: count from there.
subscribe((_keys, how) => {
  if (how === "reset") arrivals = 1;
});

export default function ViewToggle() {
  useControlsVersion();
  const button = useRef<HTMLButtonElement>(null);
  const dwell = useRef(0);
  const m = match();
  useEffect(() => () => clearTimeout(dwell.current), []);
  if (arrivals < 0) arrivals = m === "standard" ? 1 : 0;

  const press = () => {
    const now = performance.now();
    presses = [...presses.filter((t) => now - t < RAPID_MS), now];
    const to: View = nextView();
    preset(to);
    let open = false;
    if (presses.length >= RAPID_N) {
      presses = [];
      open = true;
    }
    if (to === "standard" && ++arrivals >= ARRIVALS) {
      arrivals = 1;
      open = true;
    }
    if (open) openPanel(button.current);
  };

  const text = label();
  return (
    <div className="vw">
      <button
        ref={button}
        type="button"
        className="vw-btn cx"
        onClick={press}
        onPointerEnter={(e) => {
          if (e.pointerType !== "mouse") return;
          clearTimeout(dwell.current);
          dwell.current = window.setTimeout(() => {
            if (!isPanelOpen()) openPanel(button.current);
          }, DWELL_MS);
        }}
        onPointerLeave={() => clearTimeout(dwell.current)}
        aria-label={`View: ${text}`}
      >
        <span className="vw-pos" aria-hidden="true">
          {ORDER.map((v) => (
            <i key={v} className={v === m ? "on" : undefined} />
          ))}
        </span>
        <span className="vw-k" aria-hidden="true">
          View
        </span>
        <span className="vw-v" aria-hidden="true">
          {text}
        </span>
      </button>
      <span className="vh" aria-live="polite">
        {text}
      </span>
    </div>
  );
}
