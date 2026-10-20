import { Link } from "react-router";
import Time from "../frame/Time";
import { PAGES } from "../site";
import useSiteText from "../siteText";
import Ecosystem from "../writing/Ecosystem";
import { prefetch, usePosts } from "../writing/posts";
import "../styles/writing.css";

/** Until the control panel has one (Site settings > Writing page note). */
const NOTE =
  "Warning: the following are my unfiltered philosophical explorations. They reflect my thinking over time and not necessarily what I still believe. I do not edit old essays, even when they now seem immature to me.";

export default function Writing() {
  const posts = usePosts();
  const site = useSiteText();
  // Markdown, rendered and sanitized by the backend; plain text from an older API.
  const html = site.writing_note_html;
  const note = (site.writing_note ?? NOTE).trim();
  return (
    <div className="room-w">
      <title>{PAGES.writing.title}</title>
      <Ecosystem column=".w-col" night={false} />
      <div className="wrap">
        <div className="w-col">
          <div className="ptitle w-title">
            <h1>Writing</h1>
          </div>
          {html !== undefined
            ? html && (
                // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by the backend (nh3)
                <div className="w-note" dangerouslySetInnerHTML={{ __html: html }} />
              )
            : note && <p className="w-note">{note}</p>}
          <ul className="erows">
            {posts.map((p) => (
              <li key={p.slug} className="erow">
                <Time iso={p.date} f="ym" className="dt" />
                <div>
                  <h2>
                    <Link
                      to={`/writing/${p.slug}`}
                      onPointerEnter={() => prefetch(p.slug)}
                      onFocus={() => prefetch(p.slug)}
                    >
                      {p.title}
                    </Link>
                  </h2>
                  <p>{p.dek}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
