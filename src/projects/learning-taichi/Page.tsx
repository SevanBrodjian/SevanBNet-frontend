import { pageTitle } from "../../site";
import { ProjectHead, ProjectPager, ProjectRoom, Span } from "../kit";
import { flagshipBySlug } from "../meta";
import Lab from "./Lab";
import "./lab.css";

const meta = flagshipBySlug["learning-taichi"];

export default function Page() {
  return (
    <ProjectRoom className="lt">
      <title>{pageTitle(meta.title)}</title>
      <ProjectHead
        when={<Span start={meta.start ?? meta.year} end={null} />}
        title={meta.title}
        line={meta.line}
      />
      <Lab />
      <div className="prose pj-notes lt-notes">
        <p>
          The user chooses what to look into. Agents turn each choice into a task, run it, check the
          results and write the textbook pages the task needed.
        </p>
        <p>
          The first project is differentiable simulation with the Material Point Method in Taichi:
          control by backpropagating through a rollout, gradients over long rollouts, water, rubber,
          snow and sand in one solver, networks that learn material behaviour, and a WebGPU port of
          the solver that runs in the browser.
        </p>
      </div>
      <ProjectPager slug="learning-taichi" />
    </ProjectRoom>
  );
}
