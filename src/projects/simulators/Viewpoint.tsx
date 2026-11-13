import "./inside.css";

// The withheld-viewpoint setup (A.17), as two rows of the same sequence. Frame positions (o)
// read a frame; the viewpoint position after each (u, the future input of the causal state's
// definition) reads the next viewpoint and predicts
// the frame rendered from it. The arcs are what that last viewpoint position can read: with
// one step, only the frame position before it, so that position's state has to serve any
// viewpoint; with the full history, everything before it. Fixed geometry in CSS pixels; the
// drawing scales down only on the narrowest phones.

const W = 440;
const H = 112;
const TOK = { w: 56, h: 36, y: 68 };
/** Token centres: o(t−1), u(t), o(t), u(t+1); then the predicted frame. */
const CX = [60, 146, 232, 318];
const OUT = 404;
const EARLIER = 12; // the "…" before the window

type Tok = { base: string; t: string; view?: boolean };
const TOKS: Tok[] = [
  { base: "o", t: "−1" },
  { base: "u", t: "", view: true },
  { base: "o", t: "" },
  { base: "u", t: "+1", view: true },
];

/** A symbol with an italic t in its subscript, centred on x. */
function Sym({ x, y, base, t }: { x: number; y: number; base: string; t: string }) {
  return (
    <text x={x} y={y} textAnchor="middle" className="gi-vw-m">
      <tspan className="gi-it">{base}</tspan>
      <tspan dy={5} className="gi-vw-sub">
        <tspan className="gi-it">t</tspan>
        {t}
      </tspan>
    </text>
  );
}

/** An arc from the top of the last viewpoint position back to x, higher the farther it goes. */
function arc(x: number) {
  const x0 = CX[3];
  const lift = 2 * (5 + (x0 - x) / 7);
  return `M${x0} ${TOK.y}Q${(x0 + x) / 2} ${TOK.y - lift} ${x} ${TOK.y}`;
}

function Row({ label, full }: { label: string; full?: boolean }) {
  const reads = full ? [EARLIER, ...CX.slice(0, 3)] : [CX[2]];
  const mid = TOK.y + TOK.h / 2;
  return (
    <svg className="gi-vw" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <text x={0} y={13} className="gi-vw-l">
        {label}
      </text>
      {reads.map((x) => (
        <path key={x} d={arc(x)} className="gi-vw-arc" />
      ))}
      <text x={EARLIER} y={mid + 4} textAnchor="middle" className="gi-vw-dots">
        …
      </text>
      {TOKS.map((tk, i) => {
        const x = CX[i];
        const read = full || i >= 2;
        return (
          <g key={x} data-dim={read ? undefined : ""}>
            <rect
              x={x - TOK.w / 2 + 0.5}
              y={TOK.y + 0.5}
              width={TOK.w - 1}
              height={TOK.h - 1}
              className={tk.view ? "gi-vw-v" : "gi-vw-o"}
              data-hold={!full && i === 2 ? "" : undefined}
            />
            <Sym x={x} y={mid + 3} base={tk.base} t={tk.t} />
          </g>
        );
      })}
      <path d={`M${CX[3] + TOK.w / 2 + 3} ${mid}H${OUT - TOK.w / 2 - 6}`} className="gi-vw-arc" />
      <path d={`M${OUT - TOK.w / 2 - 2} ${mid}l-6 -3.5v7Z`} className="gi-vw-head" />
      <rect
        x={OUT - TOK.w / 2 + 0.5}
        y={TOK.y + 0.5}
        width={TOK.w - 1}
        height={TOK.h - 1}
        className="gi-vw-out"
      />
      <Sym x={OUT} y={mid + 3} base="ô" t="+1" />
    </svg>
  );
}

export default function Viewpoint() {
  return (
    <figure className="gi-view">
      <div
        className="gi-view-rows"
        role="img"
        aria-label="The sequence alternates frame positions, o, and viewpoint positions, u. The viewpoint position u t plus 1 reads the next viewpoint and predicts the next frame, o hat t plus 1. With one step, it can read only the frame position o t before it. With the full history, it can read every earlier position."
      >
        <Row label="One step" />
        <Row label="Full history" full />
      </div>
      <figcaption className="cap">
        Each frame position (<i>o</i>) reads a frame. The viewpoint position after it (<i>u</i>)
        reads the next viewpoint and predicts the frame rendered from it, reading only what the arcs
        reach. Probes and editors act at the frame positions.
      </figcaption>
    </figure>
  );
}
