import Loading from "../frame/Loading";
import useApi from "../frame/useApi";
import { Entry, thumbOf, When } from "../projects/kit";
import { CUSTOM_PAGES } from "../projects/pages";
import { PAGES } from "../site";
import type { Project } from "../types";
import "../styles/projects.css";

const GLOW = "#9aa3ad";

// Every listed project, in the control panel's order (ranked first, then newest), each in
// its own box: a picture, when, its name, one line.
export default function Projects() {
  const { data, failed } = useApi<Project[]>("projects/");
  const listed = data ? data.filter((p) => p.listed) : [];
  return (
    <div className="wrap pjl">
      <title>{PAGES.projects.title}</title>
      <div className="ptitle">
        <h1>Projects</h1>
      </div>
      <ul className="pjl-list">
        {listed.map((p) => (
          <Entry
            key={p.slug}
            to={`/projects/${p.slug}`}
            title={p.title}
            when={<When p={p} />}
            // A hand-built page's project carries a lamp when it has a start: lit while ongoing.
            lit={CUSTOM_PAGES[p.slug] && p.start ? !p.end : undefined}
            line={p.summary ?? undefined}
            thumb={thumbOf(p)}
            glow={p.glow ?? GLOW}
          />
        ))}
      </ul>
      {!listed.length && <Loading failed={failed} empty={!!data} what="projects" />}
    </div>
  );
}
