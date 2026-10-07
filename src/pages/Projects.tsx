import { Link } from "react-router";
import Loading from "../frame/Loading";
import useApi from "../frame/useApi";
import { FLAGSHIPS } from "../projects/meta";
import { PAGES } from "../site";
import type { Project } from "../types";
import "../styles/projects.css";

const year = (p: Project) => (p.end ?? p.start).slice(0, 4);

export default function Projects() {
  const { data, failed } = useApi<Project[]>("projects/");
  return (
    <div className="wrap page">
      <title>{PAGES.projects.title}</title>
      <h1 className="vh">Projects</h1>
      <ul className="featured">
        {FLAGSHIPS.map((p) => (
          <li key={p.slug} className="featured-item" data-slot={`projects.preview:${p.slug}`}>
            <p className="lbl">
              {p.year} · {p.status}
            </p>
            <h2>
              <Link to={`/projects/${p.slug}`}>{p.title}</Link>
            </h2>
            <p>{p.line}</p>
          </li>
        ))}
      </ul>
      <h2 className="lbl section-label">Earlier</h2>
      {data ? (
        <ul className="rows">
          {data.map((p) => (
            <li key={p.slug} className="row">
              <span className="lbl num">{year(p)}</span>
              <Link to={`/projects/${p.slug}`}>{p.title}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <Loading failed={failed} what="projects" />
      )}
    </div>
  );
}
