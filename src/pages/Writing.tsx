import { useRef } from "react";
import { Link } from "react-router";
import Time from "../frame/Time";
import { PAGES } from "../site";
import Ecosystem from "../writing/Ecosystem";
import { POSTS, prefetch } from "../writing/posts";
import "../styles/writing.css";

export default function Writing() {
  const room = useRef<HTMLDivElement>(null);
  return (
    <div ref={room} className="room-w" data-slot="writing.ecosystem">
      <title>{PAGES.writing.title}</title>
      <Ecosystem host={room} column=".w-col" night={false} />
      <div className="wrap">
        <div className="w-col">
          <div className="ptitle w-title">
            <h1>Writing</h1>
          </div>
          <ul className="erows">
            {POSTS.map((p) => (
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
