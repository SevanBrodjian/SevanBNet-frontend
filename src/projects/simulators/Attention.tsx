import { ATTENTION_CUT } from "./data";
import "./inside.css";

// Restricting attention in standard Othello (A.7): from a block onward, each position attends
// only to itself, so those blocks cannot read the history. A strip of the eight blocks per
// cut, filled where a block still reads the history, and the loss it costs.

const BLOCKS = [1, 2, 3, 4, 5, 6, 7, 8];

function Strip({ from }: { from: number }) {
  return (
    <span className="gi-blocks" aria-hidden="true">
      {BLOCKS.map((b) => (
        <i key={b} data-cut={b >= from || undefined} />
      ))}
    </span>
  );
}

export default function Attention() {
  return (
    <figure className="gr gi-att">
      <table className="gr-tbl">
        <thead>
          <tr>
            <th scope="col" className="gr-var">
              Attention cut
            </th>
            <th scope="col" className="gi-att-bl">
              Blocks 1 to 8
            </th>
            <th scope="col">Added loss</th>
          </tr>
        </thead>
        <tbody>
          {ATTENTION_CUT.map((c) => (
            <tr key={c.from}>
              <th scope="row" className="gr-var">
                from block {c.from}
                {c.earlier && <span className="gr-note"> or earlier</span>}
              </th>
              <td className="gi-att-bl">
                <Strip from={c.from} />
                <span className="vh">blocks {c.from} to 8 attend only to their own position</span>
              </td>
              <td>{c.cost}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption className="cap">
        <code>standard</code> Othello, with each position attending only to itself from a block
        onward. <span className="gi-key" aria-hidden="true" /> Reads the history.{" "}
        <span className="gi-key" data-cut="" aria-hidden="true" /> Its own position only. Added loss
        in nats per move, against the model's 2.029, which is 0.018 above the best possible.
      </figcaption>
    </figure>
  );
}
