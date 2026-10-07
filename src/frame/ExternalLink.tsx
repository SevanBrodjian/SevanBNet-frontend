import type { ReactNode } from "react";

// Links that leave the site always open in a new tab and carry a small marker, so a
// visitor can tell before clicking. On-site links use react-router's <Link> instead.
// For a big button-like link use <Action href=...> (./Action).
export default function ExternalLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      className={className ? `ext ${className}` : "ext"}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <span className="ext-mark" aria-hidden="true">
        ↗
      </span>
      <span className="vh"> (opens in a new tab)</span>
    </a>
  );
}
