import Action from "../../frame/Action";
import { pageTitle } from "../../site";
import { ProjectHead, ProjectPager, ProjectRoom, When } from "../kit";
import type { CustomPageProps } from "../pages";
import Lab from "./Lab";
import "./lab.css";

const LAB: string = import.meta.env.VITE_LAB_URL ?? "";

/** The loop, from a choice to a page of the textbook. */
const STEPS = [
  {
    key: "Choose",
    text: "I write a task under one of the project's directions, approve one that an agent proposed, or save it for later.",
  },
  {
    key: "Run",
    text: "An orchestrator expands it into a brief and spawns worker agents, scheduling them around a single shared GPU.",
  },
  {
    key: "Check",
    text: "Each claim is checked against what was actually tested, and the result comes back to me as an overview with generative UI built around the task.",
  },
  {
    key: "Teach",
    text: "Each task adds the pages it needed to a textbook specific to the project and my interests.",
  },
];

/** A few of the results so far, as the runs report them. */
const FOUND = [
  {
    key: "Gradients through a whole rollout",
    text: "Backpropagating through 512 MLS-MPM steps, Adam takes a thrown blob from a loss of 0.144 to 1.8e-4 in 68 iterations, and it lands on target.",
  },
  {
    key: "The long-horizon NaN",
    text: "A float32 overflow, not a singularity: nearly empty grid nodes amplify the gradient by up to 1e12 on the way back. Dividing by max(m, 1e-4) caps it.",
  },
  {
    key: "Python, not the GPU",
    text: "Taichi driven from Python pays a kernel launch four times per substep, 167 substeps a frame. One WebGPU command buffer per frame cuts that floor 50x, and four materials run live in the browser.",
  },
  {
    key: "Learned materials",
    text: "One small conditioned network reproduces fluid, elastic and snow to within one or two percent. Asked to hold all four, trained one step at a time, it turns every material to dust. That is the next problem.",
  },
];

export default function Page({ project: p }: CustomPageProps) {
  return (
    <ProjectRoom className="lt">
      <title>{pageTitle(p.title)}</title>
      <ProjectHead
        standalone={p.standalone}
        when={<When p={p} />}
        title={p.title}
        line={p.summary ?? undefined}
        actions={
          (LAB || p.source) && (
            <>
              {LAB && (
                <Action href={LAB} primary>
                  Open the demo
                </Action>
              )}
              {p.source && <Action href={p.source}>Code</Action>}
            </>
          )
        }
      />
      <Lab />
      <div className="prose pj-notes lt-notes">
        <p>
          An experiment in handing off most of the labor of a research project to a team of agents,
          without losing the understanding. I steer the work from a dashboard, an orchestrator agent
          breaks each direction into tasks for worker agents, and everything they find comes back to
          me as overviews with generative UI built around each task. Simultaneously, the agents
          extend a textbook specific to the project and my interests. The lab above is a read-only
          snapshot of that dashboard, including a Demo where four materials run live on WebGPU.
        </p>
        <p>
          The first project is differentiable simulation with the Material Point Method in Taichi:
          control by backpropagating through a rollout, gradients over long rollouts, water, rubber,
          snow and sand in one solver, networks that learn material behaviour, and a WebGPU port of
          the solver that runs in the browser.
        </p>
      </div>

      <section className="lt-sec" aria-labelledby="lt-how">
        <h2 id="lt-how" className="lt-h">
          <span className="lt-k">How it works</span>
          <span className="vh">: </span>
          <span className="lt-hl">One orchestrator, many workers, and a textbook.</span>
        </h2>
        <ol className="lt-steps">
          {STEPS.map((s, i) => (
            <li key={s.key}>
              <b>
                {i + 1} {s.key}
              </b>
              <span>{s.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="lt-sec" aria-labelledby="lt-found">
        <h2 id="lt-found" className="lt-h">
          <span className="lt-k">Learning Taichi</span>
          <span className="vh">: </span>
          <span className="lt-hl">Four results from the first project.</span>
        </h2>
        <ul className="lt-finds">
          {FOUND.map((f) => (
            <li key={f.key}>
              <b>{f.key}</b>
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
      </section>
      <ProjectPager slug={p.slug} />
    </ProjectRoom>
  );
}
