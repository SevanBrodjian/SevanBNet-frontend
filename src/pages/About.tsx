import { useRef, useState } from "react";
import ExternalLink from "../frame/ExternalLink";
import { ABOUT, DOCUMENTS, NAME, PAGES, PROFILES, ROLE } from "../site";

export default function About() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [doc, setDoc] = useState(DOCUMENTS[0]);
  const open = (d: (typeof DOCUMENTS)[number]) => {
    setDoc(d);
    dialog.current?.showModal();
  };
  return (
    <div className="wrap page about">
      <title>{PAGES.about.title}</title>
      <img className="portrait" src="/headshot.jpg" alt={NAME} width={740} height={889} />
      <div>
        <h1>{NAME}</h1>
        <p className="lbl">
          {ROLE.title}, {ROLE.department}, {ROLE.institution}
        </p>
        {ABOUT.paragraphs.map((t) => (
          <p key={t}>{t}</p>
        ))}
        <p className="about-actions">
          {DOCUMENTS.map((d) => (
            <button key={d.id} type="button" className="btn" onClick={() => open(d)}>
              {d.label}
            </button>
          ))}
        </p>
        <ul className="about-links">
          {PROFILES.map((p) => (
            <li key={p.url}>
              <ExternalLink href={p.url}>{p.label}</ExternalLink>
            </li>
          ))}
        </ul>
      </div>
      <dialog ref={dialog} className="doc-viewer" aria-label={doc.label}>
        <div className="doc-bar">
          <span className="lbl">{doc.label}</span>
          <ExternalLink href={doc.url.replace(/\/preview$/, "/view")}>
            Open in Google Drive
          </ExternalLink>
          <button type="button" className="btn" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </div>
        <iframe title={doc.label} src={doc.url} loading="lazy" />
      </dialog>
    </div>
  );
}
