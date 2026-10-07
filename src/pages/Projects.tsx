import Loading from "../frame/Loading";
import useApi from "../frame/useApi";
import { byRecent, EARLIER, FLAGSHIP_LOOK, type Thumb } from "../projects/earlier";
import { Entry, Span } from "../projects/kit";
import { FLAGSHIPS } from "../projects/meta";
import { PAGES } from "../site";
import type { Project } from "../types";
import "../styles/projects.css";

const GLOW = "#9aa3ad";

/** A project the site has no notes for yet: its API image, or its name on a plain tile. */
const thumbFor = (p: Project): Thumb =>
  EARLIER[p.slug]?.thumb ??
  (p.img && /\.(png|jpe?g|webp|gif|avif)$/i.test(p.img) ? { src: p.img } : { name: p.title });

// Every project, newest first, each in its own box: a picture, when, its name, one line.
// The flagships lead because they are the newest, not because they are bigger.
export default function Projects() {
  const { data, failed } = useApi<Project[]>("projects/");
  const earlier = data ? data.slice().sort(byRecent) : [];
  return (
    <div className="wrap pjl">
      <title>{PAGES.projects.title}</title>
      <div className="ptitle">
        <h1>Projects</h1>
      </div>
      <ul className="pjl-list">
        {FLAGSHIPS.map((f) => {
          const look = FLAGSHIP_LOOK[f.slug] ?? { thumb: { name: f.title }, glow: GLOW };
          return (
            <Entry
              key={f.slug}
              to={`/projects/${f.slug}`}
              title={f.title}
              when={f.start ? <Span start={f.start} end={null} /> : f.status}
              lit={f.start ? true : undefined}
              line={f.line}
              thumb={look.thumb}
              glow={look.glow}
            />
          );
        })}
        {earlier.map((p) => (
          <Entry
            key={p.slug}
            to={`/projects/${p.slug}`}
            title={p.title}
            when={<Span start={p.start} end={p.end} />}
            line={EARLIER[p.slug]?.line}
            thumb={thumbFor(p)}
            glow={EARLIER[p.slug]?.glow ?? GLOW}
          />
        ))}
      </ul>
      {!data && <Loading failed={failed} what="the earlier projects" />}
    </div>
  );
}
