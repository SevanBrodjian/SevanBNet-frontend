import { lazy, type ReactNode, Suspense, useEffect, useLayoutEffect, useRef } from "react";
import { Link, NavLink, useLocation, useNavigationType } from "react-router";
import { startFx } from "../controls/fx";
import { closePanel, usePanelOpen } from "../controls/store";
import ViewToggle from "../controls/ViewToggle";
import { preloadPath } from "../routes";
import { PROFILES } from "../site";
import Boundary from "./Boundary";
import ExternalLink from "./ExternalLink";
import Time from "./Time";

// The panel is found, not shown: load it only when it opens.
const Panel = lazy(() => import("../controls/Panel"));

const NAV = [
  { to: "/projects", label: "Projects" },
  { to: "/papers", label: "Papers" },
  { to: "/writing", label: "Writing" },
  { to: "/about", label: "About" },
];

/** The room a path belongs to: page areas colour their room in their own CSS file. */
export function roomFor(path: string) {
  if (path === "/") return "home";
  if (/^\/projects\/./.test(path)) return "project";
  if (/^\/writing\/./.test(path)) return "essay";
  const top = path.split("/")[1];
  return ["projects", "papers", "writing", "about"].includes(top) ? top : "page";
}

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname, hash, key } = useLocation();
  const how = useNavigationType();
  const header = useRef<HTMLElement>(null);
  const main = useRef<HTMLElement>(null);
  const panelOpen = usePanelOpen();

  // <html data-room> before paint, so a room's colours never flash.
  useLayoutEffect(() => {
    document.documentElement.dataset.room = roomFor(pathname);
  }, [pathname]);

  useScrollPlace(key, pathname, hash, how, main);

  // A link to a page starts loading that page as soon as it is pointed at or focused.
  useEffect(() => {
    const warm = (e: Event) => {
      const href = (e.target as Element | null)?.closest?.("a[href]")?.getAttribute("href");
      if (href?.startsWith("/") && !href.startsWith("//")) preloadPath(href).catch(() => {});
    };
    document.addEventListener("pointerover", warm, { passive: true });
    document.addEventListener("focusin", warm);
    return () => {
      document.removeEventListener("pointerover", warm);
      document.removeEventListener("focusin", warm);
    };
  }, []);

  // --hdr-b: where the header ends, for frames and anything pinned under it. CSS gives
  // the usual value; this corrects it if the header is ever another height. Observed, not
  // measured on mount: reading layout here would lay out the whole first page in one go.
  useEffect(() => {
    const el = header.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const h = Math.round(e.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight);
      const css = document.documentElement.style;
      if (css.getPropertyValue("--hdr-b") !== `${h}px`) css.setProperty("--hdr-b", `${h}px`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    startFx();
  }, []);

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header ref={header} className="hdr">
        <div className="hdr-in">
          <Link to="/" className="mark" aria-label="SevanB.net, home">
            <img className="mark-logo" src="/sneb.svg" alt="" width={24} height={24} />
            SevanB.net
          </Link>
          <nav aria-label="Main">
            <ul className="nav">
              {NAV.map((n) => (
                <li key={n.to}>
                  <NavLink to={n.to} className="cx">
                    {n.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <ViewToggle />
        </div>
      </header>
      <main id="main" ref={main} tabIndex={-1}>
        <Suspense fallback={null}>
          <Boundary resetKey={pathname}>{children}</Boundary>
        </Suspense>
      </main>
      <footer className="ftr">
        <div className="ftr-in">
          <ul className="ftr-links">
            {PROFILES.map((p) => (
              <li key={p.url}>
                <ExternalLink href={p.url} className="cx">
                  {p.label}
                </ExternalLink>
              </li>
            ))}
          </ul>
          <span className="y">
            © <Time iso={`${new Date().getFullYear()}`} f="y" />
          </span>
        </div>
      </footer>
      {panelOpen && (
        <Boundary quiet onError={closePanel}>
          <Suspense fallback={null}>
            <Panel />
          </Suspense>
        </Boundary>
      )}
    </>
  );
}

/**
 * Where the page sits. A new page starts at the top with focus at its start (so the next
 * Tab is its first link); Back and Forward return to where that page was left, including
 * after a reload. Links to an anchor keep their place.
 */
function useScrollPlace(
  key: string,
  pathname: string,
  hash: string,
  how: string,
  main: { current: HTMLElement | null },
) {
  const places = useRef<Map<string, number> | null>(null);
  const current = useRef(key);
  const shown = useRef<string | null>(null);

  // The browser's own restoring runs before the page it restores has rendered; do it here.
  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    let q = 0;
    const note = () => {
      q = 0;
      places.current?.set(current.current, Math.round(scrollY));
    };
    const onScroll = () => {
      if (!q) q = requestAnimationFrame(note);
    };
    const save = () => {
      try {
        sessionStorage.setItem("places", JSON.stringify([...(places.current ?? [])].slice(-40)));
      } catch {
        // Storage is optional.
      }
    };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("pagehide", save);
    return () => {
      cancelAnimationFrame(q);
      removeEventListener("scroll", onScroll);
      removeEventListener("pagehide", save);
    };
  }, []);

  useLayoutEffect(() => {
    if (!places.current) {
      try {
        places.current = new Map(JSON.parse(sessionStorage.getItem("places") ?? "[]"));
      } catch {
        places.current = new Map();
      }
    }
    current.current = key;
    const first = shown.current === null;
    const moved = shown.current !== pathname;
    shown.current = pathname;
    if (hash) return;
    const back = places.current.get(key);
    if ((how === "POP" || first) && back !== undefined) {
      restore(back, main.current);
      return;
    }
    if (first || !moved) return;
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
  }, [key, pathname, hash, how, main]);
}

/** Scroll to y, waiting (briefly) for the page to grow tall enough to get there. */
function restore(y: number, main: HTMLElement | null) {
  window.scrollTo(0, y);
  if (!main || Math.abs(scrollY - y) < 2) return;
  const stop = () => {
    ro.disconnect();
    clearTimeout(t);
    for (const ev of ["wheel", "touchstart", "keydown"]) removeEventListener(ev, stop);
  };
  const ro = new ResizeObserver(() => {
    window.scrollTo(0, y);
    if (Math.abs(scrollY - y) < 2) stop();
  });
  const t = window.setTimeout(stop, 1500);
  ro.observe(main);
  for (const ev of ["wheel", "touchstart", "keydown"])
    addEventListener(ev, stop, { passive: true, once: true });
}
