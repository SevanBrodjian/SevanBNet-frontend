import type { ReactNode } from "react";

// Links that leave the site always open in a new tab and carry a small marker, so a
// visitor can tell before clicking. On-site links use react-router's <Link> instead.
export default function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="ext" href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="ext-mark" aria-hidden="true">
        ↗
      </span>
      <span className="vh"> (opens in a new tab)</span>
    </a>
  );
}
