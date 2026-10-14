import { useCallback, useEffect, useRef, useState } from "react";
import Loading from "../../frame/Loading";
import still from "../assets/lt-lab.webp";

// The Learning Taichi dashboard, exported read-only (public/lab/learning-taichi), in a
// framed viewport at the top of the page. Fullscreen uses the Fullscreen API where it
// exists; otherwise (iPhone) the frame fills the window from the top layer (a manual
// popover, so no view's transforms can move it and the iframe never reloads), and as a
// last resort the lab opens on its own. Exit, or Esc, comes back.
// - the frame shows a still of the lab until the real one has loaded
// - the iframe goes in once the page has settled, so it never competes with first paint
// - where the lab is not hosted (VITE_LAB_URL, see vite.config.ts), or does not answer,
//   the still is all there is: shown plainly, with no fullscreen and no error

const LAB: string = import.meta.env.VITE_LAB_URL ?? "";
const SAME_SITE = LAB.startsWith("/");
const PLACE = "lt_place";

type State = "wait" | "ok" | "missing";

/** Is the export really there? A missing file may come back as the app's own page. */
async function present() {
  if (!LAB) return false;
  if (!SAME_SITE) return true;
  try {
    const r = await fetch(LAB, { cache: "no-cache" });
    if (!r.ok) return false;
    return /learning-taichi/i.test(await r.text());
  } catch {
    return false;
  }
}

const idle = (fn: () => void) => {
  const w = window as Window & { requestIdleCallback?: (f: () => void, o?: object) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 1200 });
  else setTimeout(fn, 300);
};

export default function Lab() {
  const box = useRef<HTMLElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<State>("wait");
  const [loaded, setLoaded] = useState(false);
  const [full, setFull] = useState<"" | "api" | "window">("");

  useEffect(() => {
    let live = true;
    if (!LAB) {
      setState("missing");
      return;
    }
    idle(() => {
      present().then((ok) => {
        if (!live) return;
        // A first visit opens the lab on its task map; after that it keeps its own place.
        if (ok) {
          try {
            if (!localStorage.getItem(PLACE))
              localStorage.setItem(PLACE, JSON.stringify({ section: "map" }));
          } catch {
            // Storage is optional.
          }
        }
        setState(ok ? "ok" : "missing");
      });
    });
    return () => {
      live = false;
    };
  }, []);

  const exit = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    const el = box.current;
    if (el?.hasAttribute("popover")) {
      try {
        el.hidePopover();
      } catch {
        // Already hidden.
      }
      el.removeAttribute("popover");
    }
    setFull("");
  }, []);

  const fillWindow = () => {
    const el = box.current;
    if (!el) return;
    if (typeof el.showPopover !== "function") {
      location.assign(LAB);
      return;
    }
    el.setAttribute("popover", "manual");
    el.showPopover();
    setFull("window");
  };

  const enter = () => {
    const el = box.current;
    if (!el) return;
    if (el.requestFullscreen && document.fullscreenEnabled) {
      el.requestFullscreen().then(() => setFull("api"), fillWindow);
    } else fillWindow();
  };

  // Leaving fullscreen by Esc or the browser's own controls.
  useEffect(() => {
    const sync = () => {
      if (!document.fullscreenElement) setFull((f) => (f === "api" ? "" : f));
    };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  // In the full-window mode, Esc comes back, from the page or from inside the lab.
  useEffect(() => {
    if (full !== "window") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exit();
    };
    addEventListener("keydown", onKey);
    let inner: Window | null = null;
    try {
      inner = frame.current?.contentWindow ?? null;
      inner?.addEventListener("keydown", onKey);
    } catch {
      inner = null;
    }
    return () => {
      removeEventListener("keydown", onKey);
      inner?.removeEventListener("keydown", onKey);
    };
  }, [full, exit]);

  const cls = [
    "lab",
    full && "lab-full",
    full === "window" && "lab-win",
    state === "missing" && "lab-still-only",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <section className={cls} ref={box} aria-label="The Learning Taichi lab">
      {state !== "missing" && (
        <div className="lab-bar">
          {full ? (
            <button type="button" className="btn" onClick={exit}>
              Exit fullscreen
            </button>
          ) : (
            <button type="button" className="btn" onClick={enter}>
              <i className="lab-fs" aria-hidden="true" />
              Fullscreen
            </button>
          )}
        </div>
      )}
      <div className="lab-vp mx">
        {!loaded && (
          <img
            className="lab-still"
            src={still}
            alt={state === "missing" ? "The Learning Taichi dashboard, showing its task map" : ""}
            width={1440}
            height={900}
          />
        )}
        {state === "ok" && (
          <iframe
            ref={frame}
            src={LAB}
            title="Learning Taichi: the lab, read-only"
            allow="fullscreen"
            onLoad={() => setLoaded(true)}
          />
        )}
        {state !== "missing" && !loaded && <Loading />}
      </div>
    </section>
  );
}
