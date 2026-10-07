import { Suspense } from "react";
import { useParams } from "react-router";
import Action from "../frame/Action";
import Loading from "../frame/Loading";
import useApi from "../frame/useApi";
import { byRecent, EARLIER, type Media as MediaData } from "../projects/earlier";
import { Pager, ProjectHead, ProjectRoom, paras, Span } from "../projects/kit";
import Media from "../projects/Media";
import { FLAGSHIPS, flagshipBySlug } from "../projects/meta";
import { PAGES } from "../projects/pages";
import { NAME, pageTitle } from "../site";
import type { Project } from "../types";
import NotFound from "./NotFound";
import "../styles/projects.css";

// Flagship projects render their own hand-built page; earlier projects share this
// template, fed by the API.
export default function ProjectPage() {
  const { slug = "" } = useParams();
  const Custom = flagshipBySlug[slug] ? PAGES[slug] : null;
  if (Custom) {
    return (
      <Suspense
        fallback={
          <div className="wrap pj">
            <Loading />
          </div>
        }
      >
        <Custom />
      </Suspense>
    );
  }
  return <EarlierProject key={slug} slug={slug} />;
}

/** What the API's `img` holds, for a project the site has no notes on yet. */
function mediaFrom(p: Project): MediaData | undefined {
  const img = p.img ?? "";
  const yt = img.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{6,})/);
  if (yt) return { kind: "youtube", id: yt[1] };
  if (/\.mp4$/i.test(img)) return { kind: "video", src: img, poster: "", width: 16, height: 9 };
  if (img) return { kind: "image", src: img, width: 1600, height: 900, alt: "" };
  return undefined;
}

function EarlierProject({ slug }: { slug: string }) {
  const { data: p, failed, missing } = useApi<Project>(`projects/${slug}/`);
  const { data: all } = useApi<Project[]>("projects/");
  if (missing) return <NotFound />;
  if (!p) {
    return (
      <ProjectRoom>
        <title>{NAME}</title>
        <Loading failed={failed} what="this project" />
      </ProjectRoom>
    );
  }
  const look = EARLIER[p.slug];
  const media = look?.media ?? mediaFrom(p);

  // Every project in the order of the list, so the pager walks it.
  const order = [
    ...FLAGSHIPS.map((f) => ({ to: `/projects/${f.slug}`, title: f.title })),
    ...(all ?? [])
      .slice()
      .sort(byRecent)
      .map((q) => ({ to: `/projects/${q.slug}`, title: q.title })),
  ];
  const i = order.findIndex((q) => q.to === `/projects/${p.slug}`);

  return (
    <ProjectRoom>
      <title>{pageTitle(p.title)}</title>
      <ProjectHead
        when={<Span start={p.start} end={p.end} />}
        title={p.title}
        line={look?.line}
        actions={
          p.link && (
            <Action href={p.link} primary>
              Code
            </Action>
          )
        }
      />
      {media && <Media media={media} title={p.title} />}
      <div
        className="prose pj-notes"
        // sanitized in paras()
        dangerouslySetInnerHTML={{ __html: paras(p.description) }}
      />
      {i >= 0 && <Pager prev={order[i - 1] ?? null} next={order[i + 1] ?? null} />}
    </ProjectRoom>
  );
}
