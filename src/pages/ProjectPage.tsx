import DOMPurify from "dompurify";
import { Suspense } from "react";
import { useParams } from "react-router";
import Action from "../frame/Action";
import Loading from "../frame/Loading";
import useApi from "../frame/useApi";
import { ProjectHead, ProjectPager, ProjectRoom, When } from "../projects/kit";
import Media from "../projects/Media";
import { CUSTOM_PAGES } from "../projects/pages";
import { NAME, pageTitle } from "../site";
import type { Project } from "../types";
import NotFound from "./NotFound";
import "../styles/projects.css";

// Any visible project has a page, listed or not; a hidden one is not in the API, so its
// page is a 404. Projects with a hand-built page (see projects/pages.ts) render it;
// the rest share the default page: media, then the description.
export default function ProjectPage() {
  const { slug = "" } = useParams();
  const { data, failed } = useApi<Project[]>("projects/");
  const p = data?.find((q) => q.slug === slug);
  if (data && !p) return <NotFound />;
  if (!p) {
    return (
      <ProjectRoom>
        <title>{NAME}</title>
        <Loading failed={failed} what="this project" />
      </ProjectRoom>
    );
  }
  const Custom = CUSTOM_PAGES[slug];
  if (Custom) {
    return (
      <Suspense
        fallback={
          <div className="wrap pj">
            <Loading />
          </div>
        }
      >
        <Custom project={p} />
      </Suspense>
    );
  }
  return <DefaultPage key={slug} p={p} />;
}

function DefaultPage({ p }: { p: Project }) {
  return (
    <ProjectRoom>
      <title>{pageTitle(p.title)}</title>
      <ProjectHead
        when={<When p={p} />}
        title={p.title}
        line={p.summary ?? undefined}
        actions={
          p.source && (
            <Action href={p.source} primary>
              Code
            </Action>
          )
        }
      />
      {p.media && <Media media={p.media} title={p.title} />}
      <div
        className="prose pj-notes"
        // Sanitized by the backend; DOMPurify is a second layer.
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(p.description_html ?? "") }}
      />
      <ProjectPager slug={p.slug} />
    </ProjectRoom>
  );
}
