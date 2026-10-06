import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";
import ViewMenu from "../cockpit/ViewMenu";
import { NAME, PROFILES } from "../site";
import ExternalLink from "./ExternalLink";

const NAV = [
  { to: "/projects", label: "Projects" },
  { to: "/papers", label: "Papers" },
  { to: "/writing", label: "Writing" },
  { to: "/about", label: "About" },
];

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="hdr">
        <div className="wrap hdr-row">
          <Link to="/" className="mark">
            {NAME}
          </Link>
          <nav aria-label="Main">
            <ul className="nav">
              {NAV.map((n) => (
                <li key={n.to}>
                  <NavLink to={n.to}>{n.label}</NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <ViewMenu />
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="ftr">
        <div className="wrap ftr-row">
          <ul className="ftr-links">
            {PROFILES.map((p) => (
              <li key={p.url}>
                <ExternalLink href={p.url}>{p.label}</ExternalLink>
              </li>
            ))}
          </ul>
        </div>
      </footer>
    </>
  );
}
