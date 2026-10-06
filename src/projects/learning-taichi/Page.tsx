import { pageTitle } from "../../site";
import { flagshipBySlug } from "../meta";

const meta = flagshipBySlug["learning-taichi"];

// Placeholder until the round-3 design is ported: the page will hold the research system
// overview, the containerized WebGPU demo, and the read-only lab (public/lab/learning-taichi).
export default function Page() {
  return (
    <article className="wrap page">
      <title>{pageTitle(meta.title)}</title>
      <p className="lbl">
        {meta.year} · {meta.status}
      </p>
      <h1>{meta.title}</h1>
      <p className="lede">{meta.line}</p>
    </article>
  );
}
