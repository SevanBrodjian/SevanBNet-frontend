import type { CSSProperties } from "react";
import Action from "../../frame/Action";
import { pageTitle } from "../../site";
import rewrite from "../assets/sim-fig9-rewrite-row.webp";
import { CopyButton, ProjectHead, ProjectPager, ProjectRoom } from "../kit";
import type { CustomPageProps } from "../pages";
import Attention from "./Attention";
import DepthChart from "./DepthChart";
import EditWorlds from "./EditWorlds";
import Idea from "./Idea";
import Loop from "./Loop";
import Readout from "./Readout";
import { DepthTable, EditTable, ViewTable } from "./Results";
import { causal } from "./tex";
import Viewpoint from "./Viewpoint";
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
        We edit a simple simulator, write the same edit into a generative model trained only on its
        observations, and test whether the model's next prediction follows.
      </p>

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
            learned detail. This is editability, and it is a question about the simulator-like
            functionality we can access, not about whether the model represents or advances state as
            a conventional simulator does.
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
            We test this in two contrasting environments, each with a ground-truth simulator, so the
            correct response to every edit can be checked directly. Othello is discrete, its state
            the board. Rayworld, our own, is continuous: two moving discs seen only through a fan of
            rays, closer to physical scenes and video.
          </p>
          <p>
            Every model is the same eight-block transformer, trained and analyzed the same way, so a
            difference between two variants is a fact about the environment. In Othello we change
            the rules, and each change makes the game simpler to play: adjacent placement needs only
            a local color check, and without flips a token never changes once placed. In Rayworld we
            change what the observation reveals.
          </p>
        </div>
        <div className="gs-demo">
          <EditWorlds />
          <p className="cap">
            Both run by their true simulators. A model sees only the observations: Rayworld's 1D
            frames of rays, and Othello's moves. An edit teleports one disc or flips one token; cyan
            marks the world before it, magenta after.
          </p>
        </div>
      </section>

      <section className="gs-sec" aria-labelledby="gs-test">
        <Head id="gs-test" label="The test">
          Two ways to transfer an edit.
        </Head>
        <div className="prose">
          <p>
            Editability is the ability to set a model's latent state so that its next prediction
            follows from a target simulator state. Representation steering (PI and GS) trains probes
            to read the state out of the model, then moves the latent state along them; a failed
            steering edit shows only that the probes expose no control, not that the model cannot
            act as a simulator. The inverse map (IM) tests this directly: it maps simulator state to
            latent state and overwrites the latent state at one residual point, the stream after one
            of the model's blocks. If it succeeds where steering fails, we can still drive the model
            with simulator states, even if the model does not represent them as the simulator does.
          </p>
        </div>
        <Loop />
      </section>

      <section className="gs-sec" aria-labelledby="gs-results">
        <Head id="gs-results" label="Results">
          Which edits succeed depends on the environment, in ways decodability does not predict.
        </Head>
        <div className="prose">
          <p>
            Every variant's state is decodable, with an MLP probe reaching a Probe Skill of at least
            0.88 and the linear probe close behind, so what separates the variants is the baselines.
            Once flipping is removed, the Othello board can be read off the move sequence itself. In
            Rayworld, a randomly initialized model already comes within 0.03 of the trained one
            under the MLP probe on every variant except <V>blink</V>, where a hidden disc must be
            carried forward.
          </p>
        </div>
        <ul className="gs-finds gs-finds-row">
          <li>
            <b>Othello</b>
            <span>
              Each simplification of the rules lowers editability. Every editor edits the{" "}
              <V>standard</V> game. With adjacent placement only the inverse map succeeds, and with
              flipping off no editor succeeds, even on <V>adjacent-noflip</V>, where legal moves
              still depend on token color.
            </span>
          </li>
          <li>
            <b>Rayworld</b>
            <span>
              The probes fail to steer continuous positions in every variant, while the inverse map
              succeeds each time. PI's write reaches its target in probe space, yet the predicted
              frame does not move. A latent state that renders the teleported disc exists and can be
              written, but not along any direction the probes provide.
            </span>
          </li>
          <li>
            <b>Rayworld, binned</b>
            <span>
              The same models, probed with a discretized target. The probe-derived editors improve
              as the rays coarsen, and steer best when the bins mirror the observation, suggesting
              the model never forms a single abstract representation of where the discs are.
            </span>
          </li>
        </ul>
        <EditTable />
      </section>

      <section className="gs-sec" aria-labelledby="gs-depth">
        <Head id="gs-depth" label="Where edits succeed">
          The Othello model compresses its history into a board partway through the network.
        </Head>
        <div className="gs-split">
          <div className="prose gs-side">
            <p>
              Investigating where edits succeed across a network's layers can isolate where
              representations form and how the model is computing its predictions. In Othello, the
              first blocks look like a compression phase, as the board comes to determine more and
              more of the latent state. PI and the inverse map peak at residual points 4 and 5, and
              fail from point 6 onward. Written anywhere else, the inverse map leaves the prediction
              worse than no edit, and even writing back the unedited board, which should change
              nothing, raises the error everywhere but there.
            </p>
            <p>
              The board is a sufficient statistic of the history for the next move, and with
              flipping it is a complicated function of that history. The model appears to assemble
              the board in its early blocks, hold it at a bottleneck, then expand it into the
              features of its prediction.
            </p>
          </div>
          <DepthTable />
        </div>
        <DepthChart />
        <div className="gs-split gs-after">
          <div className="prose gs-side">
            <p>
              Restricting attention supports this. If each position attends only to itself from
              block 7 onward, so those blocks cannot read the history, the model's loss barely
              changes. Cutting it from block 5 or earlier costs clearly more. By about point 5 the
              model has gathered what it needs from the history, and its last blocks compute the
              legal moves from the current position alone. A board written earlier meets blocks that
              are still gathering one from the moves, and a board written later lacks the detail
              those blocks have added since.
            </p>
          </div>
          <Attention />
        </div>
      </section>

      <section className="gs-sec" aria-labelledby="gs-render">
        <Head id="gs-render" label="How Rayworld predicts">
          The Rayworld model renders the next frame gradually, and the inverse map writes that
          rendering.
        </Head>
        <div className="prose">
          <p>
            Rayworld shows no such bottleneck. PI fails at every residual point, while the inverse
            map succeeds from point 3 and plateaus around point 5. Passing the latent state at each
            point straight through the decoder shows why. A rough version of the next frame appears
            by point 3 and most of it by point 5, so the inverse map succeeds by writing this
            partial rendering.
          </p>
        </div>
        <Readout />
        <div className="prose gs-after">
          <p>
            Our hypothesis is that the early layers shift the recent frames in observation space,
            bypassing any 2D state, and the later layers refine this rendering of the next frame.
            The inverse map can drive the model from a simulator it may never have learned, but what
            it writes is the model's own rendering rather than the simulator's state. Its fit and
            its edits also diverge: it explains far less of the latent variance than in Othello,
            with an <i>R²</i> of 0.32 to 0.58, yet it succeeds on every variant, so much of that
            variance appears to have little bearing on the prediction.
          </p>
          <p>
            The probes fail to steer continuous positions in every Rayworld model we trained,
            including one with Othello's token interface, along encoding directions, and when
            written at every later point. Shading each disc so every lit ray tracks its exact
            position, or adding five viewpoints that pin it down, makes position easier to read but
            no easier to steer.
          </p>
        </div>
      </section>

      <section className="gs-sec" aria-labelledby="gs-causal">
        <Head id="gs-causal" label="The causal state">
          A model only has to learn the causal state, which may not align with the simulator.
        </Head>
        <div className="prose">
          <p>
            To predict well, a model must keep some summary of its history. Computational mechanics
            calls the smallest summary that does not worsen predictive performance the causal state.
            Two histories <i>x</i> share one when they predict the same future observations <i>o</i>{" "}
            under every sequence of future inputs <i>u</i>, which are set from outside rather than
            predicted, such as a camera's viewpoint:
          </p>
        </div>
        <div className="gi-eq" dangerouslySetInnerHTML={{ __html: causal }} />
        <div className="prose">
          <p>
            The causal state is the minimal sufficient statistic of the history, and is all a model
            must learn to predict optimally. Our simulators generate the observations, so their
            state is at least a sufficient statistic, and the causal state can only be coarser than
            it. In Othello, we hypothesize that more complex rules leave fewer representations
            simpler than the board that predict equally well, so the causal state is closer to the
            board. On <V>standard-noflip</V>, each cell determines its color, so the data never
            reveals how the rules would treat a token switched to the other color. That is the
            limiting case: prediction never requires the model to represent color apart from the
            cell, and every edit fails.
          </p>
          <p>
            In Rayworld, we hypothesize that the causal state is coarser than the simulator's state.
            We propose this as an effective definition of what it means to take a shortcut. Since
            the model already predicts nearly optimally, more scale gives it no reason to represent
            distinctions the causal state discards.
          </p>
        </div>
      </section>

      <section className="gs-sec" aria-labelledby="gs-fix">
        <Head id="gs-fix" label="Forcing a simulator-like state">
          Withholding the viewpoint makes the Rayworld model's state more simulator-like.
        </Head>
        <div className="prose">
          <p>
            The definition also shows how to refine the causal state. The more future inputs a
            process allows, the more futures two histories must predict alike to be grouped
            together. We test this by rendering each Rayworld frame from a different viewpoint. The
            model must commit to a latent state before it knows the next viewpoint, and render the
            next frame from that state alone, so that state must serve every viewpoint.
          </p>
        </div>
        <div className="gi-fix">
          <Viewpoint />
          <ViewTable />
        </div>
        <div className="prose gs-after">
          <p>
            On <V>8-ray</V>, this raises the Edit Index of PI from +0.21 to +0.55 and of GS from
            −0.07 to +0.42, with a smaller gain on <V>128-ray</V>. The inverse map edits only when
            written at several residual points at once, and then very well, at +0.84. When the
            rendering step can instead read the whole history, the gain disappears, as the theory
            predicts: the viewpoint becomes part of the history rather than a future input.
          </p>
          <p>
            The same reasoning applies to other kinds of input. An agent's future actions are inputs
            too, so a world model trained to predict under many possible actions faces the same
            pressure. Training a model to serve inputs it does not know in advance may be a general
            way to make it hold a state a simulator can set.
          </p>
        </div>
      </section>

      <section className="gs-sec" aria-labelledby="gs-next">
        <Head id="gs-next" label="Beyond one step">
          Rewriting history gives persistent transformer edits.
        </Head>
        <div className="prose">
          <p>
            For a transformer, the history is part of the state. A single write succeeds, but one
            step later the model sides with the history. Rewriting the history to agree with the
            edit holds it through a rollout. Every rewritten frame comes from the model, driven by
            written states alone.
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
          Our editability concerns a single step, in one transformer architecture at one depth, and
          history rewriting relies on Rayworld's simple, reversible dynamics.
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
