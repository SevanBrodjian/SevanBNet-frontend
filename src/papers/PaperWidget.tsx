import { useEffect, useRef } from "react";
import type { Widget } from "./kit";
import { WIDGETS, WITH_BAR } from "./registry";

// Holds one paper's widget. The module loads when the entry comes near the screen; the
// widget then rests on a still frame and runs only while `active`.
export default function PaperWidget({ id, active }: { id: string; active: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const widget = useRef<Widget | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const el = host.current;
    const load = WIDGETS[id];
    if (!el || !load) return;
    let gone = false;
    let w: Widget | null = null;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        load()
          .then((m) => {
            if (gone) return;
            w = m.default(el);
            widget.current = w;
            w.setActive(activeRef.current);
          })
          .catch((error) => console.error(`Couldn't load the widget for ${id}:`, error));
      },
      { rootMargin: "320px 0px" },
    );
    io.observe(el);
    return () => {
      gone = true;
      io.disconnect();
      w?.dispose();
      widget.current = null;
      el.replaceChildren();
    };
  }, [id]);

  useEffect(() => {
    widget.current?.setActive(active);
  }, [active]);

  return <div ref={host} className="pw" data-w={id} data-bar={WITH_BAR.has(id) || undefined} />;
}
