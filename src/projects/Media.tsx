import AutoVideo from "../frame/AutoVideo";
import { REDUCED_MOTION } from "../frame/live";
import { SAVE_DATA } from "../frame/util";
import type { Media as MediaData } from "../types";
import { CopyButton } from "./kit";

// The picture or video at the top of a project's default page. Videos play by
// themselves, muted and looping, with nothing in front of them. Without a size from the
// control panel, space is held at 16:9 until the file arrives.

const HOLD = REDUCED_MOTION || SAVE_DATA;

function youtube(id: string) {
  const q = new URLSearchParams({
    autoplay: HOLD ? "0" : "1",
    mute: "1",
    loop: "1",
    playlist: id,
    playsinline: "1",
    controls: "0",
    rel: "0",
    modestbranding: "1",
  });
  return `https://www.youtube-nocookie.com/embed/${id}?${q}`;
}

export default function Media({ media, title }: { media: MediaData; title: string }) {
  switch (media.kind) {
    case "video":
      return (
        <AutoVideo
          className="pj-media"
          src={[{ src: media.src, type: "video/mp4" }]}
          poster={media.poster ?? undefined}
          label={title}
          width={media.width ?? 16}
          height={media.height ?? 9}
        />
      );
    case "youtube":
      if (!media.id) return null;
      return (
        <div className="pj-media pj-yt mx">
          <iframe
            src={youtube(media.id)}
            title={title}
            loading="lazy"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      );
    case "image":
      return (
        <figure className="pj-media mx">
          <img
            src={media.src}
            alt={media.alt ?? ""}
            width={media.width ?? 1600}
            height={media.height ?? 900}
          />
        </figure>
      );
    case "code":
      return (
        <pre className="bib pj-code">
          <code>
            <span className="pj-prompt" aria-hidden="true">
              ${" "}
            </span>
            {media.text}
          </code>
          <CopyButton text={media.text} />
        </pre>
      );
  }
}
