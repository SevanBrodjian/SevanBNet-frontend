import { lazy, type ReactNode, Suspense, useEffect, useLayoutEffect, useRef } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { startFx } from "../controls/fx";
import { usePanelOpen } from "../controls/store";
import ViewToggle from "../controls/ViewToggle";
import { PROFILES } from "../site";
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
  const { pathname, hash } = useLocation();
  const header = useRef<HTMLElement>(null);
  const panelOpen = usePanelOpen();

  // <html data-room> before paint, so a room's colours never flash.
  useLayoutEffect(() => {
    document.documentElement.dataset.room = roomFor(pathname);
  }, [pathname]);

  // A new page starts at the top (links to an anchor keep their place).
  const shown = useRef(pathname);
  useEffect(() => {
    if (shown.current === pathname) return;
    shown.current = pathname;
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);

  // --hdr-b: where the header ends, for frames and anything pinned under it.
  useLayoutEffect(() => {
    const el = header.current;
    if (!el) return;
    const set = () =>
      document.documentElement.style.setProperty(
        "--hdr-b",
        `${Math.round(el.getBoundingClientRect().height)}px`,
      );
    set();
    const ro = new ResizeObserver(set);
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
            <span className="brc" aria-hidden="true">
              {"{"}
            </span>
            SevanB.net
            <span className="brc" aria-hidden="true">
              {"}"}
            </span>
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
      <main id="main">{children}</main>
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
        <Suspense fallback={null}>
          <Panel />
        </Suspense>
      )}
    </>
  );
}
