import { useEffect, useRef, useState } from "react";
import { REDUCED_MOTION } from "./live";
import { SAVE_DATA } from "./util";

// A video that simply plays: muted, looping, inline, no button in front of it. It plays
// only while on screen and in a visible tab. Under reduced motion or Save-Data it holds
// on its poster until pressed. A small square in the corner (visible on hover and focus)
// pauses and resumes it, for keyboard users and anyone who wants it still.

type Source = { src: string; type?: string };

export type AutoVideoProps = {
  /** One source, or several in order of preference (e.g. webm, then mp4). */
  src: string | Source[];
  /** Shown before the first frame, and as the still under reduced motion. */
  poster?: string;
  /** What the video shows, for screen readers. */
  label: string;
  /** Intrinsic size, to reserve space and avoid layout shift. */
  width?: number;
  height?: number;
  className?: string;
};

const HOLD = REDUCED_MOTION || SAVE_DATA;

/** Only the browser refusing to autoplay is a reason to stop trying; an interrupted
 * play() (AbortError, e.g. paused again while scrolling past) is not. */
const refused = (e: unknown) => (e as DOMException | null)?.name === "NotAllowedError";

export default function AutoVideo({
  src,
  poster,
  label,
  width,
  height,
  className,
}: AutoVideoProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(HOLD);
  const wanted = useRef(!HOLD);
  const visible = useRef(false);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.muted = true;
    const sync = () => {
      if (wanted.current && visible.current && !document.hidden) {
        v.play().catch((e) => {
          // Autoplay refused (e.g. Low Power Mode): hold the poster until pressed.
          if (!refused(e)) return;
          wanted.current = false;
          setPaused(true);
        });
      } else v.pause();
    };
    const io = new IntersectionObserver(
      (entries) => {
        visible.current = entries[entries.length - 1].isIntersecting;
        sync();
      },
      { rootMargin: "120px" },
    );
    io.observe(v);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      v.pause();
    };
  }, []);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    wanted.current = !wanted.current;
    setPaused(!wanted.current);
    if (wanted.current) {
      v.play().catch((e) => {
        if (!refused(e)) return;
        wanted.current = false;
        setPaused(true);
      });
    } else v.pause();
  };

  const sources = typeof src === "string" ? [{ src }] : src;
  return (
    <div className={className ? `mx vid ${className}` : "mx vid"}>
      <video
        ref={video}
        muted
        loop
        playsInline
        autoPlay={!HOLD}
        preload={HOLD ? "none" : "metadata"}
        poster={poster}
        width={width}
        height={height}
        aria-label={label}
      >
        {sources.map((s) => (
          <source key={s.src} src={s.src} type={s.type} />
        ))}
      </video>
      <button
        type="button"
        className={paused ? "pz play" : "pz"}
        aria-label={paused ? `Play: ${label}` : `Pause: ${label}`}
        onClick={toggle}
      >
        <i />
      </button>
    </div>
  );
}
