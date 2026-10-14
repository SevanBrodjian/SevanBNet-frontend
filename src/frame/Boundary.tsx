import { Component, type ReactNode } from "react";

// Keeps one failure from blanking the whole site. The usual one: a tab opened before a
// deploy asks for a page's code file, which no longer exists. Loading the page afresh
// fixes that, so it does, at most once a minute (a real outage never loops). Anything
// else shows the plain box with a way to try again.

const CHUNK = /dynamically imported module|module script failed|importing a module script/i;
const KEY = "reloaded-at";

/** Load the page afresh unless that was just tried. Returns whether it reloads. */
export function reloadOnce() {
  try {
    if (Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  location.reload();
  return true;
}

type Props = {
  children: ReactNode;
  /** A change (e.g. the path) clears a failure. */
  resetKey?: string;
  /** Show nothing on failure (for things that are not the page itself). */
  quiet?: boolean;
  onError?: () => void;
};
type State = { failed: boolean; key?: string };

export default class Boundary extends Component<Props, State> {
  state: State = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.key ? null : { failed: false, key: props.resetKey };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
    if (CHUNK.test(String((error as Error)?.message ?? error)) && reloadOnce()) return;
    this.props.onError?.();
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.quiet) return null;
    return (
      <div className="wrap page">
        <p className="loadbox">
          Couldn't load this page. <a href={location.href}>Reload</a>
        </p>
      </div>
    );
  }
}
