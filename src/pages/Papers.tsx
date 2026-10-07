import {
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router";
import { onSitePath, paperUrl } from "../format";
import Action, { Actions } from "../frame/Action";
import ExternalLink from "../frame/ExternalLink";
import Loading from "../frame/Loading";
import Time from "../frame/Time";
import useApi from "../frame/useApi";
import PaperWidget from "../papers/PaperWidget";
import { type Paper, WIDGETS, withOverrides } from "../papers/registry";
import { NAME, PAGES } from "../site";
import type { Publication } from "../types";
import "../styles/papers.css";

const dateOf = (p: Publication) => p.publication_date ?? p.submission_date ?? "";

function Title({ p }: { p: Paper }) {
  const internal = onSitePath(p);
  if (internal) return <Link to={internal}>{p.title}</Link>;
  const external = paperUrl(p);
  return external ? <ExternalLink href={external}>{p.title}</ExternalLink> : p.title;
}

/** The author list with Sevan's name picked out. */
function Authors({ text }: { text: string }) {
  const parts = text.split(NAME);
  return (
    <p className="pa-au">
      {parts.map((part, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the split never reorders
        <span key={i}>
          {i > 0 && <b>{NAME}</b>}
          {part}
        </span>
      ))}
    </p>
  );
}

function Venue({ p }: { p: Paper }) {
  const accepted = /accept/i.test(p.status);
  const kind = accepted ? (p.status.match(/\(([^)]+)\)/)?.[1] ?? "Accepted") : p.status;
  return (
    <p className="pa-ve">
      <span className={accepted ? "lamp on" : "lamp"} aria-hidden="true" />
      {[p.journal_name ?? "arXiv", kind].filter(Boolean).join(" · ")}
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
  const internal = onSitePath(p);
  const paper = paperUrl(p);
  const widget = p.arxiv && WIDGETS[p.arxiv] ? p.arxiv : null;
  const bibId = `bib-${p.id}`;
  return (
    <li className={widget ? "pa" : "pa pa-plain"} data-active={active || undefined} {...on}>
      <div className="pa-dt">
        <Time iso={dateOf(p)} f="ym" />
      </div>
      <div className="pa-main">
        <h2 className="pa-ti">
          <Title p={p} />
        </h2>
        {p.authors_str && <Authors text={p.authors_str} />}
        <Venue p={p} />
        {p.description && <p className="pa-ds">{p.description}</p>}
        <Actions className="pa-acts">
          {internal && <Action to={internal}>Project page</Action>}
          {paper && <Action href={paper}>Paper</Action>}
          {p.code && <Action href={p.code}>Code</Action>}
          {p.citation && (
            <Action onClick={() => setBib((b) => !b)} pressed={bib}>
              BibTeX
            </Action>
          )}
        </Actions>
        {bib && p.citation && <Bib text={p.citation} id={bibId} />}
      </div>
      {widget && (
        <div className="pa-w">
          <PaperWidget id={widget} active={active} />
        </div>
      )}
    </li>
  );
}

const INTERACTIVE = "a, button, input, select, textarea, pre, [tabindex]";

export default function Papers() {
  const { data, failed } = useApi<Publication[]>("publications/");
  const papers = useMemo(
    () =>
      data ? [...data].sort((a, b) => dateOf(b).localeCompare(dateOf(a))).map(withOverrides) : null,
    [data],
  );
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
      if ((e.target as Element).closest(INTERACTIVE)) return;
      setActive((a) => (a === id ? null : id));
    },
    onFocus: () => setActive(id),
    onBlur: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null))
        setActive((a) => (a === id ? null : a));
    },
  });

  return (
    <div className="wrap papers-page">
      <title>{PAGES.papers.title}</title>
      <div className="ptitle">
        <h1>Papers</h1>
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
