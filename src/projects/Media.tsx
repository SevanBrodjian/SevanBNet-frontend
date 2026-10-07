import AutoVideo from "../frame/AutoVideo";
import { REDUCED_MOTION } from "../frame/live";
import { SAVE_DATA } from "../frame/util";
import type { Media as MediaData } from "./earlier";
import { CopyButton } from "./kit";

// The picture or video at the top of an earlier project's page. Videos play by
// themselves, muted and looping, with nothing in front of them.

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
          poster={media.poster}
          label={title}
          width={media.width}
          height={media.height}
        />
      );
    case "youtube":
      return (
        <div className="pj-media pj-yt mx">
          <iframe
            src={youtube(media.id)}
            title={title}
            loading="lazy"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      );
    case "image":
      return (
        <figure className="pj-media mx">
          <img src={media.src} alt={media.alt} width={media.width} height={media.height} />
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
