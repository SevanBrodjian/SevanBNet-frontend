import type { ReactNode } from "react";
import { Link } from "react-router";
import { isExternal } from "./util";

// The main things to do on a page (Code, Paper, CV): big, clear, pressable buttons with
// the frame's four-corner carets. Pass exactly one of `to` (a page on this site), `href`
// (a link; leaving the site opens a new tab and shows ↗) or `onClick` (a button).
// `primary` marks the one action that matters most on the page. Wrap several in <Actions>.

type Common = { children: ReactNode; primary?: boolean; className?: string; title?: string };
type ActionProps = Common &
  (
    | { to: string; href?: never; onClick?: never }
    | { href: string; to?: never; onClick?: never; download?: boolean }
    | { onClick: () => void; to?: never; href?: never; pressed?: boolean }
  );

export default function Action(props: ActionProps) {
  const cls = ["act", "cx", props.primary && "pri", props.className].filter(Boolean).join(" ");
  if (props.to !== undefined) {
    return (
      <Link className={cls} to={props.to} title={props.title}>
        {props.children}
      </Link>
    );
  }
  if (props.href !== undefined) {
    const out = isExternal(props.href);
    return (
      <a
        className={cls}
        href={props.href}
        title={props.title}
        download={"download" in props && props.download ? "" : undefined}
        {...(out ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {props.children}
        {out && (
          <>
            <span className="ext-mark" aria-hidden="true">
              ↗
            </span>
            <span className="vh"> (opens in a new tab)</span>
          </>
        )}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      title={props.title}
      onClick={props.onClick}
      aria-pressed={"pressed" in props ? props.pressed : undefined}
    >
      {props.children}
    </button>
  );
}

/** A row of actions. */
export function Actions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `acts ${className}` : "acts"}>{children}</div>;
}
