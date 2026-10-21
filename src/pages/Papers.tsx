import { PAPERS } from "virtual:papers";
import { type FocusEvent, type MouseEvent, type PointerEvent, useRef, useState } from "react";
import { Link } from "react-router";
import { SEVAN, venueLine } from "../format";
import Action, { Actions } from "../frame/Action";
import ExternalLink from "../frame/ExternalLink";
import Loading from "../frame/Loading";
import Time from "../frame/Time";
import useApi from "../frame/useApi";
import PaperWidget from "../papers/PaperWidget";
import { WIDGETS } from "../papers/registry";
import { PAGES, PROFILES } from "../site";
import type { Paper } from "../types";
import "../styles/papers.css";

/** The complete list, beyond the selection here. */
const SCHOLAR = PROFILES.find((p) => p.label === "Google Scholar")?.url;

/** The paper's project page on this site, while that project is visible. */
const projectPath = (p: Paper) => (p.project ? `/projects/${p.project.slug}` : null);

// A paper with a project page on this site is named by a link to it; the rest are plain
// titles (their Paper button goes to arXiv).
function Title({ p }: { p: Paper }) {
  const page = projectPath(p);
  return page ? <Link to={page}>{p.title}</Link> : p.title;
}

/** The author list with Sevan's name picked out. */
function Authors({ text }: { text: string }) {
  return (
    <p className="pa-au">
      {text.split(SEVAN).map((part, i) =>
        // Odd pieces are the name (the split keeps what it matched).
        // biome-ignore lint/suspicious/noArrayIndexKey: the split never reorders
        i % 2 ? <b key={i}>{part}</b> : <span key={i}>{part}</span>,
      )}
    </p>
  );
}

function Bib({ text, id }: { text: string; id: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  const copy = () => {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1600);
      },
      () => setCopied(false),
    );
  };
  return (
    <pre className="bib pa-bib" id={id}>
      <code>{text}</code>
      <button className="copy" type="button" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
    </pre>
  );
}

type Handlers = {
  onPointerEnter: (e: PointerEvent) => void;
  onPointerLeave: (e: PointerEvent) => void;
  onPointerDown: (e: PointerEvent) => void;
  onClick: (e: MouseEvent) => void;
  onFocus: () => void;
  onBlur: (e: FocusEvent) => void;
};

function Entry({ p, active, on }: { p: Paper; active: boolean; on: Handlers }) {
  const [bib, setBib] = useState(false);
  const page = projectPath(p);
  const widget = p.key && WIDGETS[p.key] ? p.key : null;
  const bibId = `bib-${p.id}`;
  return (
    <li className={widget ? "pa" : "pa pa-plain"} data-active={active || undefined} {...on}>
      {/* The date, and under it the way out to the project, the paper and the code */}
      <div className="pa-side">
        <div className="pa-dt">
          <Time iso={p.date ?? ""} f="ym" />
        </div>
        <Actions className="pa-acts">
          {page ? (
            <Action to={page}>Site</Action>
          ) : (
            p.project_url && <Action href={p.project_url}>Site</Action>
          )}
          {p.paper_url && <Action href={p.paper_url}>Paper</Action>}
          {p.project?.source && <Action href={p.project.source}>Code</Action>}
        </Actions>
        {p.bibtex && (
          <button
            type="button"
            className="pa-bibt"
            aria-expanded={bib}
            aria-controls={bibId}
            onClick={() => setBib((b) => !b)}
          >
            BibTeX <i aria-hidden="true">{bib ? "▴" : "▾"}</i>
          </button>
        )}
      </div>
      <div className="pa-main">
        <h2 className="pa-ti">
          <Title p={p} />
        </h2>
        {p.authors && <Authors text={p.authors} />}
        <p className="pa-ve">{venueLine(p)}</p>
        {p.description && <p className="pa-ds">{p.description}</p>}
      </div>
      {widget && (
        <div className="pa-w">
          <PaperWidget id={widget} active={active} />
        </div>
      )}
      {bib && p.bibtex && <Bib text={p.bibtex} id={bibId} />}
    </li>
  );
}

const INTERACTIVE = "a, button, input, select, textarea, pre, [tabindex]";

// The control panel's order: ranked papers first, then newest.
export default function Papers() {
  const { data: papers, failed } = useApi<Paper[]>("papers/", PAPERS);
  // One paper is alive at a time: the one under the pointer, holding focus, or tapped.
  const [active, setActive] = useState<number | null>(null);
  const pointer = useRef("mouse");

  const handlers = (id: number): Handlers => ({
    onPointerEnter: (e) => {
      if (e.pointerType !== "touch") setActive(id);
    },
    onPointerLeave: (e) => {
      if (e.pointerType !== "touch") setActive((a) => (a === id ? null : a));
    },
    onPointerDown: (e) => {
      pointer.current = e.pointerType;
    },
    onClick: (e) => {
      if (pointer.current !== "touch") return;
      // A tap on a link, button or the like inside the entry does its own thing. (Only inside:
      // <main> itself carries a tabindex, so every target has an "interactive" ancestor.)
      const hit = (e.target as Element).closest(INTERACTIVE);
      if (hit && e.currentTarget.contains(hit)) return;
      setActive((a) => (a === id ? null : id));
    },
    onFocus: () => setActive(id),
    onBlur: (e) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      // Focus leaving (a click on the entry's text, say) does not put to sleep an entry the
      // pointer is still over. (Not for touch, whose :hover sticks after a tap.)
      if (pointer.current !== "touch" && e.currentTarget.matches(":hover")) return;
      setActive((a) => (a === id ? null : a));
    },
  });

  return (
    <div className="wrap papers-page">
      <title>{PAGES.papers.title}</title>
      <div className="ptitle pa-head">
        <h1>Selected Publications</h1>
        {SCHOLAR && (
          <ExternalLink href={SCHOLAR} className="pa-full">
            (full list)
          </ExternalLink>
        )}
      </div>
      {papers?.length ? (
        <ol className="pas">
          {papers.map((p) => (
            <Entry key={p.id} p={p} active={active === p.id} on={handlers(p.id)} />
          ))}
        </ol>
      ) : (
        <Loading failed={failed} empty={!!papers} what="papers" />
      )}
    </div>
  );
}
