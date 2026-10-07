import { Link } from "react-router";
import { day } from "../format";
import Loading from "../frame/Loading";
import useApi from "../frame/useApi";
import { PAGES } from "../site";
import type { Post } from "../types";
import "../styles/writing.css";

export default function Writing() {
  const { data, failed } = useApi<Post[]>("blogposts/");
  // The API returns oldest first; the page lists newest first.
  const posts = data ? [...data].reverse() : null;
  return (
    <div className="wrap page writing" data-slot="writing.ecosystem">
      <title>{PAGES.writing.title}</title>
      <h1 className="vh">Writing</h1>
      {posts ? (
        <ul className="rows">
          {posts.map((p) => (
            <li key={p.slug} className="post-row">
              <span className="lbl num">{day(p.published_date)}</span>
              <div>
                <h2>
                  <Link to={`/writing/${p.slug}`}>{p.title}</Link>
                </h2>
                <p>{p.description}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Loading failed={failed} what="posts" />
      )}
    </div>
  );
}
