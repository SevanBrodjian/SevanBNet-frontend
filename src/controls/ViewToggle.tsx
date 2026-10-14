import { useRef } from "react";
import { ORDER, type View } from "./schema";
import { label, match, nextView, openPanel, preset, subscribe, useControlsVersion } from "./store";

// The view toggle on the right of the navbar. Each press moves to the next view:
// Comfort, Wireframe, Broken, Reactive, then Comfort again. The controls panel has no
// button of its own; this toggle opens it when it is pressed rapidly for a moment, or
// when it comes round to Comfort for the third time. It lives in the header, which no
// setting can break or move.

/** Presses within RAPID_MS of each other that count as rapid; RAPID_N of them open. */
const RAPID_N = 7;
const RAPID_MS = 1400;
/** Arrivals at Comfort that open the panel; being at Comfort on load counts as one. */
const ARRIVALS = 3;

let presses: number[] = [];
let arrivals = -1;

// The panel's reset returns to Comfort: count from there.
subscribe((_keys, how) => {
  if (how === "reset") arrivals = 1;
});

export default function ViewToggle() {
  useControlsVersion();
  const button = useRef<HTMLButtonElement>(null);
  const m = match();
  if (arrivals < 0) arrivals = m === "comfort" ? 1 : 0;

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
    if (to === "comfort" && ++arrivals >= ARRIVALS) {
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
