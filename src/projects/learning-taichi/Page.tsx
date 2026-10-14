import { pageTitle } from "../../site";
import { ProjectHead, ProjectPager, ProjectRoom, When } from "../kit";
import type { CustomPageProps } from "../pages";
import Lab from "./Lab";
import "./lab.css";

export default function Page({ project: p }: CustomPageProps) {
  return (
    <ProjectRoom className="lt">
      <title>{pageTitle(p.title)}</title>
      <ProjectHead when={<When p={p} />} title={p.title} line={p.summary ?? undefined} />
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
      <ProjectPager slug={p.slug} />
    </ProjectRoom>
  );
}
