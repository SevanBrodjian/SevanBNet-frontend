import type { CSSProperties } from "react";
import Action from "../../frame/Action";
import { pageTitle } from "../../site";
import rewrite from "../assets/sim-fig9-rewrite-row.webp";
import { CopyButton, ProjectHead, ProjectPager, ProjectRoom } from "../kit";
import type { CustomPageProps } from "../pages";
import DepthChart from "./DepthChart";
import EditWorlds from "./EditWorlds";
import Findings from "./Findings";
import Idea from "./Idea";
import Loop from "./Loop";
import { EditTable, ViewTable } from "./Results";
import { causal } from "./tex";
import Withheld from "./Withheld";
import "./sim.css";

const PAPER = "https://arxiv.org/abs/2610.12847";
const BIBTEX = `@misc{brodjian2026generativemodelsactsimulators,
  title         = {When Generative Models Act as Simulators},
  author        = {Brodjian, Sevan and Hobley, Michael and Perona, Pietro},
  year          = {2026},
  eprint        = {2610.12847},
  archivePrefix = {arXiv},
  primaryClass  = {cs.LG},
  url           = {https://arxiv.org/abs/2610.12847}
}`;

/** Figure 9's columns, as the paper labels them; each is cropped from the one image. */
const ROLLOUTS = ["Ground truth", "Unedited", "Single-point edit", "History rewrite"];
const ROLLOUT_ALT =
  "One Rayworld edit as four panels of rays over time: ground truth, the unedited model, a single-point edit, and a history rewrite. All four share the same eight observed frames above a dashed line. Below it the single-point edit flickers and is forgotten, while after the history rewrite the bright disc stays at its new position, as in the ground truth.";

/** A section's head: what it is about, then what it found. */
function Head({ id, label, children }: { id: string; label: string; children?: string }) {
  return (
    <h2 id={id} className="gs-h">
      <span className="gs-k">{label}</span>
      {children && (
        <>
          <span className="vh">: </span>
          <span className="gs-hl">{children}</span>
        </>
      )}
    </h2>
  );
}

const V = ({ children }: { children: string }) => <code className="gs-v">{children}</code>;

export default function Page({ project: p }: CustomPageProps) {
  return (
    <ProjectRoom className="gs">
      <title>{pageTitle(p.title)}</title>
      <ProjectHead
        standalone={p.standalone}
        when="arXiv 2026 · Preprint"
        title="When Generative Models Act as Simulators"
        sub={
          <p className="gs-au">
            <span>
              <b>Sevan Brodjian</b>, Michael Hobley, Pietro Perona
            </span>
            <span className="gs-af">California Institute of Technology</span>
          </p>
        }
        actions={
          <>
            <Action href={PAPER} primary>
              Paper
            </Action>
            {p.source && <Action href={p.source}>Code</Action>}
          </>
        }
      />

      <p className="gs-statement">
        We investigate when a generative model's internal state acts like a simulator's, by editing
        it directly and tracing how the model computes its predictions.
      </p>
      <Findings />

      <section className="gs-sec" aria-labelledby="gs-idea">
        <Head id="gs-idea" label="The idea">
          Transfer a simulator's edit into a generative model.
        </Head>
        <div className="prose">
          <p>
            A simulator summarizes an environment in a state that users can read and change. A
            generative model learns the world from observations and supplies detail no one
            specified, but offers no built-in way to set its state. If an edit to the simulator can
            be written into the model's latent state, the two combine: interpretable control with
            learned detail. We call this editability. Where it succeeds and where it fails show when
            a model forms a state that acts like the simulator's, and how it predicts when it does
            not.
          </p>
        </div>
        <Idea />
      </section>

      <section className="gs-sec" aria-labelledby="gs-worlds">
        <Head id="gs-worlds" label="The environments">
          Two environments whose simulators we know exactly.
        </Head>
        <div className="prose">
          <p>
            Othello is discrete, its state the board. Rayworld, our own, is continuous: two moving
            discs seen only through a fan of rays, closer to physical scenes and video. Every model
            is the same eight-block transformer, trained and analyzed the same way, so a difference
            between two variants is a fact about the environment. In Othello we simplify the rules,
            and in Rayworld we change what the observation reveals.
          </p>
        </div>
        <div className="gs-demo">
          <EditWorlds />
          <p className="cap">
            Both run by their true simulators; a model sees only Rayworld's 1D frames of rays and
            Othello's moves. Drag a disc to teleport it, or click a token to swap its color. Cyan
            marks the world before an edit, magenta after.
          </p>
        </div>
      </section>

      <section className="gs-sec" aria-labelledby="gs-test">
        <Head id="gs-test" label="The test">
          Two ways to transfer an edit.
        </Head>
        <div className="prose">
          <p>
            Representation steering (PI and GS) trains probes to read the state out of the model,
            then moves the latent state along them. The inverse map (IM) learns the reverse, from
            simulator state to latent state, and overwrites the latent state at one residual point,
            the stream after one of the model's blocks. An edit succeeds when its prediction on the
            changed rays or cells is over twice as close to the edited world as to the unedited one
            (Edit Index +0.4), and its error over the whole output falls by at least a quarter (Edit
            Fidelity 0.25).
          </p>
        </div>
        <Loop />
      </section>

      <section className="gs-sec" aria-labelledby="gs-results">
        <Head id="gs-results" label="Results">
          Every state decodes well. Which edits succeed depends on the environment.
        </Head>
        <div className="prose">
          <p>
            An MLP probe reads every variant's state with a Probe Skill of at least 0.88, so
            decodability alone does not separate the variants.
          </p>
        </div>
        <ul className="gs-finds gs-finds-row">
          <li>
            <b>Othello</b>
            <span>
              Every editor edits the <V>standard</V> game, and each simplification of the rules
              lowers editability. With adjacent placement only the inverse map succeeds, and with
              flipping off no editor succeeds, even where legal moves still depend on token color.
            </span>
          </li>
          <li>
            <b>Rayworld</b>
            <span>
              The probes fail to steer continuous positions in every variant, while the inverse map
              succeeds each time. PI's write reaches its target in probe space, yet the predicted
              frame does not move.
            </span>
          </li>
          <li>
            <b>Rayworld, binned</b>
            <span>
              The same models, probed with a discretized target. The probe-derived editors improve
              as the rays coarsen, and steer best when the bins mirror the observation, further
              suggesting the model never forms a single abstract representation of where the discs
              are.
            </span>
          </li>
        </ul>
        <EditTable />
      </section>

      <section className="gs-sec" aria-labelledby="gs-depth">
        <Head id="gs-depth" label="How each model predicts">
          Editing at every layer shows how each model computes its prediction.
        </Head>
        <div className="gs-pair">
          <div>
            <b className="gs-pair-k">Othello</b>
            <p className="gs-pair-t gs-pair-h">It compresses its history into a board.</p>
            <p className="gs-pair-t">
              PI and the inverse map peak at residual points 4 and 5, and fail from point 6 on. The
              early blocks gather the board from the moves, and the later ones compute the legal
              moves from the current position alone. Cutting blocks 7 and 8 off from the history
              costs 0.013 nats per move; cutting from block 5 costs over 0.25.
            </p>
          </div>
          <div>
            <b className="gs-pair-k">Rayworld</b>
            <p className="gs-pair-t gs-pair-h">It renders the next frame gradually.</p>
            <p className="gs-pair-t">
              PI fails at every point, while the inverse map succeeds from point 3 and plateaus
              around point 5. Passed straight through the decoder, the latent state shows a rough
              version of the next frame by point 3 and most of it by point 5. The early layers
              appear to shift the recent frames, bypassing any 2D state, and the inverse map
              succeeds by writing this partial rendering.
            </p>
          </div>
        </div>
        <DepthChart />
        <div className="prose gs-after">
          <p>
            The inverse map can drive the Rayworld model from a simulator it may never have learned,
            but what it writes is the model's own rendering rather than the simulator's state.
          </p>
        </div>
      </section>

      <section className="gs-sec" aria-labelledby="gs-fix">
        <Head id="gs-fix" label="Forcing a simulator-like state">
          Inputs a model cannot foresee pull its state toward the simulator's.
        </Head>
        <div className="prose">
          <p>
            To predict well, a model must keep some summary of its history. Computational mechanics
            calls the smallest summary that does not worsen prediction the causal state. Two
            histories <i>x</i> share one when they predict the same future observations <i>o</i>{" "}
            under every sequence of future inputs <i>u</i>, which are set from outside, such as a
            camera's viewpoint or an agent's actions:
          </p>
        </div>
        <div className="gi-eq" dangerouslySetInnerHTML={{ __html: causal }} />
        <div className="prose">
          <p>
            The causal state is all a model must learn. The simulator's state is always sufficient,
            so the causal state can only be coarser, like a sheet wrapped loosely around it. On{" "}
            <V>standard-noflip</V>, each cell determines its color, so prediction never requires
            color apart from the cell, and every edit fails. In Rayworld, we hypothesize the sheet
            hangs loose, and propose this as an effective definition of a shortcut. More scale gives
            a model that already predicts nearly optimally no reason to tighten it.
          </p>
          <p>
            Every future input a model must be ready for draws the air out, like vacuum sealing: two
            histories must then predict more futures alike to share a causal state, so the sheet
            conforms more closely to the simulator's state. Training a model to serve inputs it
            cannot foresee may be a general way to make it hold a state a simulator can set. We test
            this in Rayworld by rendering each frame from a different viewpoint, given to the model
            only after it has committed to a latent state, so that state must serve every viewpoint.
          </p>
        </div>
        <Withheld />
        <div className="gs-split gs-after">
          <div className="prose gs-side">
            <p>
              On <V>8-ray</V>, PI and GS now both succeed on continuous positions, with a smaller
              gain on <V>128-ray</V>. The inverse map edits only when written at several residual
              points at once, and then very well, at +0.84. When the rendering step can read the
              whole history, the gain disappears, as the theory predicts: the viewpoint becomes part
              of the history rather than a future input.
            </p>
          </div>
          <ViewTable />
        </div>
      </section>

      <section className="gs-sec" aria-labelledby="gs-next">
        <Head id="gs-next" label="Beyond one step">
          Rewriting history gives persistent transformer edits.
        </Head>
        <div className="prose">
          <p>
            Our editability concerns a single step. For a transformer, the history is part of the
            state: a single write succeeds, but one step later the model sides with the history.
            Rewriting the history to agree with the edit holds it through a rollout, every rewritten
            frame produced by the model from written states alone.
          </p>
        </div>
        <figure className="gs-roll">
          <div className="gs-roll-grid" role="img" aria-label={ROLLOUT_ALT}>
            {ROLLOUTS.map((c, k) => (
              <div key={c} className="gs-roll-cell">
                <span className="gs-roll-lbl" aria-hidden="true">
                  {c}
                </span>
                <div className="gs-roll-crop mx">
                  <img
                    src={rewrite}
                    alt=""
                    width={2120}
                    height={391}
                    loading="lazy"
                    style={{ "--k": k } as CSSProperties}
                  />
                </div>
              </div>
            ))}
          </div>
          <figcaption className="cap">
            The edited world's true continuation, then 15-step rollouts on <V>standard</V> Rayworld,
            time running down; the dashed line is the edit frame, cyan and magenta where the edit
            took the disc from and to. Over 32 edits, a single write succeeds at the edit frame
            (Edit Index +0.61) but falls back a step later (−0.63). Rewriting the history holds it.
          </figcaption>
        </figure>
        <p className="cap gs-limit">
          Our results come from one transformer architecture at one depth, and history rewriting
          relies on Rayworld's simple, reversible dynamics.
        </p>
        <div className="prose gs-after">
          <p>
            We plan to extend these ideas toward a general theory of how to build a simulator into a
            generative model, to achieve open-ended virtual worlds with persistent and controllable
            state. The simulator would keep the world's state and rules persistent; the model would
            propose what lies behind an observer who turns around.
          </p>
        </div>
      </section>

      <section className="gs-sec" aria-labelledby="gs-cite">
        <Head id="gs-cite" label="Citation" />
        <pre className="bib">
          <code>{BIBTEX}</code>
          <CopyButton text={BIBTEX} />
        </pre>
      </section>
      <ProjectPager slug={p.slug} />
    </ProjectRoom>
  );
}
