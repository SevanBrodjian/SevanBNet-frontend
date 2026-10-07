import DOMPurify from "dompurify";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router";
import StarSky from "../frame/StarSky";
import Time from "../frame/Time";
import useApi from "../frame/useApi";
import type { Project } from "../types";
import { byRecent, type Thumb as ThumbData } from "./earlier";
import { FLAGSHIPS } from "./meta";

// Pieces every project page shares: the list thumbnail, the page header, the pager, and
// the starry room the pages sit in.

/** A list thumbnail. Dim at rest; in colour, with a glow, when its entry is pointed at. */
export function Thumb({ thumb }: { thumb: ThumbData }) {
  if ("term" in thumb) {
    const [cmd, ...rest] = thumb.term.split(" ");
    return (
      <span className="pjl-th pjl-term mx" aria-hidden="true">
        <span className="pjl-bar">
          <i />
          <i />
          <i />
        </span>
        <span className="pjl-cmd">
          <b>$</b> {cmd} {rest.slice(0, -1).join(" ")} <em>{rest[rest.length - 1]}</em>
          <span className="pjl-cur" />
        </span>
      </span>
    );
  }
  if ("name" in thumb) {
    return (
      <span className="pjl-th pjl-name mx" aria-hidden="true">
        {thumb.name}
      </span>
    );
  }
  return (
    <span className="pjl-th mx" aria-hidden="true">
      <img src={thumb.src} alt="" width={560} height={350} loading="lazy" decoding="async" />
    </span>
  );
}

/** When a project ran: 2023.12 – 2024.01, a single month, or 2026.05 – Ongoing. */
export function Span({ start, end }: { start: string; end: string | null }) {
  if (!end) {
    return (
      <>
        <Time iso={start} f="ym" /> – Ongoing
      </>
    );
  }
  if (start.slice(0, 7) === end.slice(0, 7)) return <Time iso={start} f="ym" />;
  return (
    <>
      <Time iso={start} f="ym" /> – <Time iso={end} f="ym" />
    </>
  );
}

/** One entry on the projects list. The whole box is the link; the title is its name. */
export function Entry({
  to,
  title,
  when,
  line,
  thumb,
  glow,
  lit,
}: {
  to: string;
  title: string;
  when: ReactNode;
  line?: string;
  thumb: ThumbData;
  glow: string;
  lit?: boolean;
}) {
  return (
    <li className="pjl-item cx" style={{ "--glow": glow } as CSSProperties}>
      <Thumb thumb={thumb} />
      <div className="pjl-tx">
        <p className="pjl-when">
          {lit !== undefined && <span className={lit ? "lamp on" : "lamp"} aria-hidden="true" />}
          {when}
        </p>
        <h2>
          <Link to={to}>{title}</Link>
        </h2>
        {line && <p className="pjl-line">{line}</p>}
      </div>
      <span className="pjl-go" aria-hidden="true">
        →
      </span>
    </li>
  );
}

/** The room a project page sits in: near-black, with the shooting stars behind. */
export function ProjectRoom({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <article className={className ? `wrap pj ${className}` : "wrap pj"}>
      <StarSky density={0.7} />
      {children}
    </article>
  );
}

/** A project page's header: where it sits, its name, one line, and its main actions. */
export function ProjectHead({
  when,
  title,
  sub,
  line,
  actions,
}: {
  when: ReactNode;
  title: string;
  sub?: ReactNode;
  line?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="pj-head">
      <p className="pj-crumb">
        <Link to="/projects" className="pj-up">
          Projects
        </Link>
        <span aria-hidden="true">/</span>
        <span>{when}</span>
      </p>
      <h1>{title}</h1>
      {sub}
      {line && <p className="pj-line">{line}</p>}
      {actions && <div className="acts pj-acts">{actions}</div>}
    </header>
  );
}

type Near = { to: string; title: string } | null;

/** Previous and next project, at the foot of a page. */
export function Pager({ prev, next }: { prev: Near; next: Near }) {
  if (!prev && !next) return null;
  return (
    <nav className="pj-pager" aria-label="More projects">
      {prev ? (
        <Link to={prev.to} className="cx pj-pg">
          <span className="lbl">Previous</span>
          <span>{prev.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link to={next.to} className="cx pj-pg pj-next">
          <span className="lbl">Next</span>
          <span>{next.title}</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

/** The pager for one project, walking the list in its order (flagships, then the rest). */
export function ProjectPager({ slug }: { slug: string }) {
  const { data } = useApi<Project[]>("projects/");
  const order = [
    ...FLAGSHIPS.map((f) => ({ to: `/projects/${f.slug}`, title: f.title })),
    ...(data ?? [])
      .slice()
      .sort(byRecent)
      .map((q) => ({ to: `/projects/${q.slug}`, title: q.title })),
  ];
  const i = order.findIndex((q) => q.to === `/projects/${slug}`);
  if (i < 0) return null;
  return <Pager prev={order[i - 1] ?? null} next={order[i + 1] ?? null} />;
}

/** API text as paragraphs: blank lines split paragraphs, single newlines break lines. */
export function paras(text: string | null | undefined) {
  const html = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (/^<(p|ul|ol|h\d|blockquote|pre|figure|div)\b/i.test(p) ? p : `<p>${p}</p>`))
    .join("")
    .replace(/(?<!>)\n(?!<)/g, "<br>");
  return DOMPurify.sanitize(html);
}

/** Copy a block of text; the button says so for a moment. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1600);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <button
      type="button"
      className="copy"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => setDone(true),
          () => {},
        );
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}
