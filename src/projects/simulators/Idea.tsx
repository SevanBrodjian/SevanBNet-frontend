import { useEffect, useRef, useState } from "react";
import { mountStage } from "../../papers/simulators";

// The idea, before anything else: a simulator runs and the model sees its frames; the simulator
// is edited; the edit is written into the model, whose next frames should follow. The Papers
// page's widget, larger and slower, holding a moment at the edit; the steps beside it light up
// as it plays (all of them on the still).

const STEPS = [
  {
    key: "Run",
    text: "The simulator holds the state and renders each frame. The model sees only the frames.",
  },
  {
    key: "Edit",
    text: "One disc is teleported in the simulator: a simple, interpretable change to its state.",
  },
  {
    key: "Transfer",
    text: "The edit is written into the model's latent state. If the model can act as a simulator, its next frames follow.",
  },
];

export default function Idea() {
  const host = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState(-1);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const w = mountStage(el, { frameMs: 170, editHold: 800, onPhase: setPhase });
    w.setActive(true);
    return () => {
      w.dispose();
      el.replaceChildren();
    };
  }, []);

  return (
    <figure className="gs-idea">
      <div ref={host} className="gs-stage" />
      <div className="gs-steps-col">
        <ol className="gs-steps" data-all={phase < 0 || undefined}>
          {STEPS.map((s, i) => (
            <li key={s.key} data-on={phase === i || undefined} data-k={i}>
              <b>
                {i + 1} {s.key}
              </b>
              <span>{s.text}</span>
            </li>
          ))}
        </ol>
        <figcaption className="cap">
          A visualization of a successful edit in Rayworld, not an actual example.
        </figcaption>
      </div>
    </figure>
  );
}
