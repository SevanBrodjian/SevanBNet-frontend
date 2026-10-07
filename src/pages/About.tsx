import { useRef, useState } from "react";
import Action, { Actions } from "../frame/Action";
import ExternalLink from "../frame/ExternalLink";
import PageFrame from "../frame/PageFrame";
import { ABOUT, DOCUMENTS, NAME, PAGES, ROLE } from "../site";
import "../styles/about.css";

type Doc = (typeof DOCUMENTS)[number];

// About echoes the home page: the same frame, the same left column. The CV and Resume
// open in a viewer on the page, with a way out to Google Drive.
export default function About() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loaded, setLoaded] = useState(false);
  const open = (d: Doc) => {
    setDoc(d);
    setLoaded(false);
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();

  return (
    <div className="about">
      <title>{PAGES.about.title}</title>
      <PageFrame />
      <section className="wrap about-in">
        <p className="lbl role">
          {ROLE.title}, {ROLE.department}, {ROLE.institution}
        </p>
        <h1>{NAME}</h1>
        <Actions className="docs">
          {DOCUMENTS.map((d) => (
            <Action key={d.id} onClick={() => open(d)}>
              {d.label}
            </Action>
          ))}
        </Actions>
        <div className="bio" data-slot="about.text">
          {ABOUT.paragraphs.map((t) => (
            <p key={t}>{t}</p>
          ))}
        </div>
      </section>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes it; the click is only the backdrop */}
      <dialog
        ref={dialog}
        className="doc"
        aria-label={doc?.label ?? "Document"}
        onClose={() => setDoc(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        {doc && (
          <>
            <div className="doc-bar">
              <span className="doc-t">{doc.label}</span>
              <ExternalLink href={doc.url.replace(/\/preview$/, "/view")}>
                Open in Google Drive
              </ExternalLink>
              <button type="button" className="btn" onClick={close}>
                Close
              </button>
            </div>
            <div className="doc-body">
              {!loaded && <p className="loadbox">Loading...</p>}
              <iframe
                className={loaded ? undefined : "wait"}
                title={doc.label}
                src={doc.url}
                onLoad={() => setLoaded(true)}
              />
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
