import DOMPurify from "dompurify";
import { Suspense } from "react";
import { useParams } from "react-router";
import ExternalLink from "../frame/ExternalLink";
import Loading from "../frame/Loading";
import useApi from "../frame/useApi";
import { flagshipBySlug } from "../projects/meta";
import { PAGES } from "../projects/pages";
import { NAME, pageTitle } from "../site";
import type { Project } from "../types";
import NotFound from "./NotFound";

// Flagship projects render their own hand-built page; earlier projects share a template
// fed by the API.
export default function ProjectPage() {
  const { slug = "" } = useParams();
  const Custom = flagshipBySlug[slug] ? PAGES[slug] : null;
  if (Custom) {
    return (
      <Suspense fallback={<Loading />}>
        <Custom />
      </Suspense>
    );
  }
  return <EarlierProject slug={slug} />;
}

function EarlierProject({ slug }: { slug: string }) {
  const { data: p, failed, missing } = useApi<Project>(`projects/${slug}/`);
  if (missing) return <NotFound />;
  if (!p) {
    return (
      <div className="wrap page">
        <title>{NAME}</title>
        <Loading failed={failed} what="this project" />
      </div>
    );
  }
  return (
    <article className="wrap page project">
      <title>{pageTitle(p.title)}</title>
      <p className="lbl num">
        {p.start} – {p.end ?? "ongoing"}
      </p>
      <h1>{p.title}</h1>
      {p.link && (
        <p>
          <ExternalLink href={p.link}>Source</ExternalLink>
        </p>
      )}
      <div
        className="prose"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized API content
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(p.description ?? "") }}
      />
    </article>
  );
}
