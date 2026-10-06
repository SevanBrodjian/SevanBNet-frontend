import DOMPurify from "dompurify";
import { Link, useParams } from "react-router";
import { day } from "../format";
import Loading from "../frame/Loading";
import useApi from "../frame/useApi";
import { NAME, pageTitle } from "../site";
import type { Post } from "../types";
import NotFound from "./NotFound";

export default function Essay() {
  const { slug = "" } = useParams();
  // The list endpoint already carries full posts, so one request serves the essay and
  // its neighbours.
  const { data, failed } = useApi<Post[]>("blogposts/");
  if (!data) {
    return (
      <div className="wrap page">
        <title>{NAME}</title>
        <Loading failed={failed} what="this essay" />
      </div>
    );
  }
  const i = data.findIndex((p) => p.slug === slug);
  if (i < 0) return <NotFound />;
  const post = data[i];
  const older = data[i - 1];
  const newer = data[i + 1];
  return (
    <article className="essay">
      <title>{pageTitle(post.title)}</title>
      <header className="essay-head">
        <p className="lbl num">{day(post.published_date)}</p>
        <h1>{post.title}</h1>
      </header>
      <div
        className="essay-body prose"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized API content
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.content) }}
      />
      <nav className="essay-nav" aria-label="More writing">
        {older ? <Link to={`/writing/${older.slug}`}>← {older.title}</Link> : <span />}
        {newer ? <Link to={`/writing/${newer.slug}`}>{newer.title} →</Link> : <span />}
      </nav>
    </article>
  );
}
