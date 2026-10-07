import { type MouseEvent, type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router";
import { reloadOnce } from "../frame/Boundary";
import Loading from "../frame/Loading";
import { REDUCED_MOTION } from "../frame/live";
import Time from "../frame/Time";
import { SAVE_DATA } from "../frame/util";
import { pageTitle } from "../site";
import Ecosystem from "../writing/Ecosystem";
import { loadBody, loadedBody, neighbours, POSTS, type PostMeta, prefetch } from "../writing/posts";
import { BIOME_NAMES, cycleBiome, useBiome } from "../writing/settings";
import NotFound from "./NotFound";
import "../styles/writing.css";

export default function Essay() {
  const { slug = "" } = useParams();
  const post = POSTS.find((p) => p.slug === slug);
  if (!post) return <NotFound />;
  return <EssayPage key={slug} post={post} />;
}

function EssayPage({ post }: { post: PostMeta }) {
  const room = useRef<HTMLDivElement>(null);
  const leaf = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const [html, setHtml] = useState(() => loadedBody(post.slug) ?? null);
  const [failed, setFailed] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (html !== null) return;
    let live = true;
    // The plain Loading... box only if the essay is genuinely slow to arrive.
    const t = window.setTimeout(() => live && setSlow(true), 400);
    loadBody(post.slug).then(
      (h) => live && setHtml(h),
      () => {
        // After a deploy an open tab may ask for a chunk that no longer exists: load the
        // page afresh (once), else say so.
        if (live && !reloadOnce()) setFailed(true);
      },
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [post.slug, html]);

  // Videos in an essay play on screen, muted, and hold still under reduced motion.
  useEffect(() => {
    const body = leaf.current;
    if (!html || !body) return;
    const videos = [...body.querySelectorAll<HTMLVideoElement>(".body video")];
    if (!videos.length) return;
    if (REDUCED_MOTION || SAVE_DATA) {
      for (const v of videos) v.controls = true;
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const v = e.target as HTMLVideoElement;
        if (e.isIntersecting) v.play().catch(() => {});
        else v.pause();
      }
    });
    for (const v of videos) {
      v.muted = true;
      io.observe(v);
    }
    return () => io.disconnect();
  }, [html]);

  // Links to other pages of the site stay in the app.
  const onBodyClick = (e: MouseEvent) => {
    const a = (e.target as Element).closest("a");
    const href = a?.getAttribute("href") ?? "";
    if (!a || !href.startsWith("/") || href.startsWith("//") || a.target) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href);
  };

  const { earlier, later } = neighbours(post.slug);
  return (
    <div ref={room} className="room-w room-night">
      <title>{pageTitle(post.title)}</title>
      {html !== null && <Ecosystem host={room} column=".leaf" night />}
      {html !== null && <ReadingProgress target={leaf} />}
      <div className="wrap">
        <article ref={leaf} className="leaf essay">
          <header>
            <p className="kick">
              <Time iso={post.date} f="long" />
            </p>
            <h1>{post.title}</h1>
            <p className="dek">{post.dek}</p>
          </header>
          {html !== null ? (
            // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: only routes clicks on the links inside, which are keyboard reachable themselves
            <div
              className="body"
              onClick={onBodyClick}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : failed || slow ? (
            <Loading failed={failed} what="this essay" />
          ) : null}
          {html !== null && <BiomeToggle />}
        </article>
        <nav className="pager essay-pager" aria-label="More writing">
          {earlier ? (
            <Link
              to={`/writing/${earlier.slug}`}
              onPointerEnter={() => prefetch(earlier.slug)}
              onFocus={() => prefetch(earlier.slug)}
            >
              <span className="lbl">Earlier</span>
              <span className="pt">{earlier.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {later ? (
            <Link
              to={`/writing/${later.slug}`}
              onPointerEnter={() => prefetch(later.slug)}
              onFocus={() => prefetch(later.slug)}
            >
              <span className="lbl">Later</span>
              <span className="pt">{later.title}</span>
            </Link>
          ) : (
            <span />
          )}
        </nav>
        <Link className="essay-all" to="/writing">
          All writing
        </Link>
      </div>
    </div>
  );
}

/** The margins' biome, at the end of an essay: press to change it. */
function BiomeToggle() {
  const biome = useBiome();
  return (
    <p className="fin">
      <button type="button" className="biome" onClick={cycleBiome}>
        <span aria-hidden="true">❦</span>
        <span className="vh">Margins: </span>
        {BIOME_NAMES[biome]}
      </button>
    </p>
  );
}

/** A hairline under the header that fills as the essay is read: stepped, never eased. */
function ReadingProgress({ target }: { target: RefObject<HTMLElement | null> }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let q = 0;
    const update = () => {
      q = 0;
      const el = target.current;
      const b = bar.current;
      if (!el || !b) return;
      const r = el.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
      b.style.transform = `scaleX(${(Math.round(t * 120) / 120).toFixed(4)})`;
    };
    const queue = () => {
      if (!q) q = requestAnimationFrame(update);
    };
    addEventListener("scroll", queue, { passive: true });
    addEventListener("resize", queue);
    update();
    return () => {
      cancelAnimationFrame(q);
      removeEventListener("scroll", queue);
      removeEventListener("resize", queue);
    };
  }, [target]);
  // In <body>, above the sticky header (inside <main> it would sit under it).
  return createPortal(<div ref={bar} className="w-progress" aria-hidden="true" />, document.body);
}
