import type { CSSProperties } from "react";
import Action from "../../frame/Action";
import { pageTitle } from "../../site";
import rewrite from "../assets/sim-fig9-rewrite-row.webp";
import { CopyButton, ProjectHead, ProjectPager, ProjectRoom } from "../kit";
import type { CustomPageProps } from "../pages";
import DepthChart from "./DepthChart";
import EditWorlds from "./EditWorlds";
import Idea from "./Idea";
import Loop from "./Loop";
import { DepthTable, EditTable } from "./Results";
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
            learned detail.
          </p>
        </div>
        <Idea />
      </section>

      <section className="gs-sec" aria-labelledby="gs-worlds">
        <Head id="gs-worlds" label="The environments">
          Two worlds whose simulators we know exactly.
        </Head>
        <div className="prose">
          <p>
            We test this in two contrasting environments, each with a ground-truth simulator, so the
            correct response to every edit can be checked directly. Othello is discrete, its state
            the board. Rayworld, our own, is continuous: two moving discs seen only through a fan of
            rays, closer to physical scenes and video.
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
            of the model's blocks.
          </p>
        </div>
        <Loop />
      </section>

      <section className="gs-sec" aria-labelledby="gs-results">
        <Head id="gs-results" label="Results">
          Decodable everywhere. Editable where the environment allows.
        </Head>
        <div className="gs-split">
          <div className="gs-side">
            <div className="prose">
              <p>
                Each variant has its own model: the same eight-block transformer, trained and
                analyzed the same way, so a difference between two variants is a fact about the
                environment. Every variant's state is decodable, with an MLP probe reaching a Probe
                Skill of at least 0.88. Decodability alone does not reveal editability.
              </p>
            </div>
            <ul className="gs-finds">
              <li>
                <b>Othello</b>
                <span>
                  Every editor edits the <V>standard</V> game. Every change to the rules breaks
                  this: on <V>adjacent-flip</V> only the inverse map lands, and with flipping off,
                  no editor lands.
                </span>
              </li>
              <li>
                <b>Rayworld</b>
                <span>
                  On continuous positions, the probes fail to steer in every variant while the
                  inverse map lands everywhere. A latent state that renders the teleported disc
                  exists and can be written, but not along any direction the probes provide.
                </span>
              </li>
              <li>
                <b>Rayworld, binned</b>
                <span>
                  The same models, probed with a discretized target. Steering appears, and works
                  best when the bins mirror the observation, as if the model never forms a single
                  abstract representation of where the discs are.
                </span>
              </li>
            </ul>
          </div>
          <EditTable />
        </div>
      </section>

      <section className="gs-sec" aria-labelledby="gs-depth">
        <Head id="gs-depth" label="Where the state lives">
          Othello's model appears to funnel its history through a board. Rayworld's never does.
        </Head>
        <div className="gs-split">
          <div className="prose gs-side">
            <p>
              In Othello, the first five blocks look like a compression phase, as the board comes to
              determine more and more of the latent state. A board written at residual point 4 or 5
              lands. Written anywhere else, it leaves the prediction worse than no edit, and even
              writing back the unedited board, which should change nothing, raises the error
              everywhere but there. The model appears to assemble the board, hold it at a
              bottleneck, then expand it into its prediction.
            </p>
            <p>
              Rayworld's model forms no such state, yet positions can be written at almost every
              residual point.
            </p>
          </div>
          <DepthTable />
        </div>
        <DepthChart />
        <div className="prose gs-after">
          <p>
            The contrast fits what each environment demands of prediction. Othello's rules make the
            board both necessary and costly to compute, which gives a model reason to form it once
            and route everything through it, as a minimal sufficient statistic of the past.
            Rayworld's frames already show most of the state. Simplifying Othello relaxes this
            demand, which may be why editability falls with it.
          </p>
        </div>
      </section>

      <section className="gs-sec" aria-labelledby="gs-next">
        <Head id="gs-next" label="Beyond one step">
          Rewriting history gives persistent transformer edits.
        </Head>
        <div className="prose">
          <p>
            For a transformer, the history is part of the state. A single write lands, but one step
            later the model sides with the history. Rewriting the history to agree with the edit
            holds it through a rollout. Every rewritten frame comes from the model, driven by
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
            took the disc from and to. Over 32 edits, a single write lands at the edit frame (Edit
            Index +0.61) but falls back a step later (−0.63). Rewriting the history holds it.
          </figcaption>
        </figure>
        <p className="cap gs-limit">
          Our editability concerns a single step, in one transformer architecture at one depth, and
          history rewriting relies on Rayworld's simple, reversible dynamics.
        </p>
        <div className="prose gs-after">
          <p>
            The next step is to drive a model continuously from a simulator, or from different
            simulators at different times, and to discover which environments make that possible.
            The simulator would keep the world's state and rules persistent; the model would propose
            what lies behind an observer who turns around.
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
