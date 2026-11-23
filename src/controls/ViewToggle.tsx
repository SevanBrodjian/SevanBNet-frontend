import { useRef } from "react";
import { ORDER, type View } from "./schema";
import { label, match, nextView, openPanel, preset, subscribe, useControlsVersion } from "./store";

// The view toggle on the right of the navbar. Each press moves to the next view:
// Standard, Wireframe, Broken, Hyper, then Standard again. The controls panel has no
// button of its own; this toggle opens it after three full rounds, that is on the third
// return to Standard counted from Standard. It lives in the header, which no setting can
// break or move.

/** Full rounds of the views that open the panel. */
const ROUNDS = 3;

/** Returns to Standard since the count began; -1 while a round from another view is
 *  still being finished (loaded in another view, a round from there isn't full). */
let rounds: number | null = null;

// The panel's reset returns to Standard: count from there.
subscribe((_keys, how) => {
  if (how === "reset") rounds = 0;
});

export default function ViewToggle() {
  useControlsVersion();
  const button = useRef<HTMLButtonElement>(null);
  const m = match();
  if (rounds === null) rounds = m === "standard" ? 0 : -1;

  const press = () => {
    const to: View = nextView();
    preset(to);
    if (to !== "standard") return;
    rounds = (rounds ?? 0) + 1;
    if (rounds >= ROUNDS) {
      rounds = 0;
      openPanel(button.current);
    }
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
