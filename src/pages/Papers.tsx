import { Link } from "react-router";
import { monthYear, onSitePath, paperUrl } from "../format";
import ExternalLink from "../frame/ExternalLink";
import Loading from "../frame/Loading";
import useApi from "../frame/useApi";
import { PAGES } from "../site";
import type { Publication } from "../types";

function PaperTitle({ p }: { p: Publication }) {
  const internal = onSitePath(p);
  if (internal) return <Link to={internal}>{p.title}</Link>;
  const external = paperUrl(p);
  return external ? <ExternalLink href={external}>{p.title}</ExternalLink> : <>{p.title}</>;
}

export default function Papers() {
  const { data, failed } = useApi<Publication[]>("publications/");
  return (
    <div className="wrap page">
      <title>{PAGES.papers.title}</title>
      <h1 className="vh">Papers</h1>
      {data ? (
        <ul className="papers">
          {data.map((p) => (
            <li key={p.id} className="paper">
              <div className="paper-widget" data-slot={`papers.widget:${p.id}`} />
              <div>
                <h2>
                  <PaperTitle p={p} />
                </h2>
                {p.authors_str && <p className="authors">{p.authors_str}</p>}
                <p className="lbl">
                  {[p.journal_name, p.status, monthYear(p.publication_date ?? p.submission_date)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Loading failed={failed} what="papers" />
      )}
    </div>
  );
}
