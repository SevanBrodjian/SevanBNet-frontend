import type { CSSProperties } from "react";
import readout from "../assets/sim-fig17-readout.webp";
import "./inside.css";

// The paper's figure 17: the latent state at each residual point of eight Rayworld models,
// passed straight through the decoder. Each panel is cropped from the one image, which holds
// the eight panels as the paper lays them out, left to right: 676 px each with 24 px gutters
// in 5576 px. A panel is the last observed frame (45 px), a 10 px gap, the nine residual
// points (45 px each), another gap, and the true next frame (45 px): 515 px in all.

const PANELS = ["standard", "blink", "128-ray", "16-ray", "8-ray", "5-ray", "smooth", "obs5"];

const ALT =
  "Eight Rayworld models, each shown as a column of rays: the last observed frame at the top, then the decoder's reading of the latent state at residual points 0 to 8, then the true next frame. At point 0 the reading is close to the current frame. By point 3 a rough version of the next frame appears, and by point 5 most of it, which the last points refine.";

/** Where a row's centre sits, as a share of the panel's height (see above). */
const at = (px: number) => `${((px / 515) * 100).toFixed(2)}%`;
const TICKS = [0, 2, 4, 6, 8].map((k) => ({ k, top: at(55 + 45 * k + 22.5) }));

function Axis() {
  return (
    <span className="gi-ax" aria-hidden="true">
      <span style={{ top: at(22.5) }}>
        <span className="gi-ax-w">frame </span>
        <i>t</i>
      </span>
      {TICKS.map(({ k, top }) => (
        <span key={k} style={{ top }}>
          {k}
        </span>
      ))}
      <span style={{ top: at(492.5) }}>
        <span className="gi-ax-w">frame </span>
        <i>t</i>+1
      </span>
    </span>
  );
}

export default function Readout() {
  return (
    <figure className="gi-rd">
      <div className="gi-rd-grid" role="img" aria-label={ALT}>
        {PANELS.map((name, k) => (
          <div key={name} className="gi-rd-cell">
            <code className="gi-rd-lbl" aria-hidden="true">
              {name}
            </code>
            <div className="gi-rd-box">
              <div className="gi-rd-crop mx">
                <img
                  src={readout}
                  alt=""
                  width={5576}
                  height={515}
                  loading="lazy"
                  decoding="async"
                  style={{ "--k": k } as CSSProperties}
                />
              </div>
              <Axis />
            </div>
          </div>
        ))}
      </div>
      <figcaption className="cap">
        The latent state at each residual point, from the embedding (0) to the last block (8),
        passed straight through the decoder for a held-out sequence of each Rayworld model. Above,
        the last frame the model saw; below, the true next frame.
      </figcaption>
    </figure>
  );
}
