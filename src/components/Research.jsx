import { useEffect, useState } from "react";
import { Link } from "react-router";
import { fetchApi } from "../api";
import "./Research.css";

const CopyIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    width="16"
    height="16"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const ChevronIcon = ({ open }) => (
  <svg
    viewBox="-1 -1 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    width="12"
    height="12"
    style={{
      transform: open ? "rotate(180deg)" : "none",
      transition: "transform 0.2s ease",
      display: "inline-block",
      verticalAlign: "middle",
      marginLeft: "0.3em",
    }}
  >
    <polyline points="1 2.5 6 6.5 11 2.5" />
    <polyline points="1 6 6 10 11 6" />
  </svg>
);

function Research() {
  const [publications, setPublications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openBibtex, setOpenBibtex] = useState(null);
  const [copied, setCopied] = useState(null);

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  useEffect(() => {
    fetchApi("publications/")
      .then((data) => {
        setPublications(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((error) => {
        console.error("There was an error fetching publications:", error);
        setLoading(false);
      });
  }, []);

  const formatDate = (pub) => {
    const d = pub.publication_date || pub.submission_date;
    if (!d) return null;
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long" });
  };

  const paperUrl = (pub) => {
    if (pub.url) return pub.url;
    if (pub.doi) return `https://doi.org/${pub.doi}`;
    return null;
  };

  const youtubeAutoplay = (src) => {
    try {
      const u = new URL(src);
      u.searchParams.set("autoplay", "1");
      u.searchParams.set("mute", "1");
      u.searchParams.set("loop", "1");
      const videoId = u.pathname.split("/").filter(Boolean).pop();
      if (videoId) u.searchParams.set("playlist", videoId);
      return u.toString();
    } catch {
      return src;
    }
  };

  const renderMedia = (pub) => {
    if (!pub.img) return null;
    if (pub.img.includes("youtube")) {
      return (
        <iframe
          src={youtubeAutoplay(pub.img)}
          title={pub.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen={true}
        />
      );
    }
    if (/\.(mp4|webm|ogg)$/i.test(pub.img)) {
      return (
        <video
          ref={(el) => {
            if (el) {
              el.muted = true;
              el.play().catch(() => {});
            }
          }}
          autoPlay={true}
          loop={true}
          playsInline={true}
          preload="metadata"
        >
          <source src={pub.img} type="video/mp4" />
        </video>
      );
    }
    return <img src={pub.img} alt={pub.title} />;
  };

  return (
    <div className="research cosmic-bg-bright">
      <title>Research · Sevan Brodjian</title>
      <div className="bg-overlay-2" />
      <div className="title">Research</div>
      <div className="research-container">
        {loading ? (
          <h2 className="loading">Loading...</h2>
        ) : publications.length === 0 ? (
          <h2 className="loading">No publications yet.</h2>
        ) : (
          publications.map((pub) => {
            const media = renderMedia(pub);
            return (
              <div className="research-card" key={pub.id}>
                {media && <div className="research-image">{media}</div>}
                <div className="research-content">
                  <h2 className="research-title">{pub.title}</h2>
                  {pub.authors_str && <p className="research-authors">{pub.authors_str}</p>}
                  <div className="research-meta">
                    <span className="research-status">{pub.status}</span>
                    {pub.journal_name && (
                      <span className="research-journal">{pub.journal_name}</span>
                    )}
                    {formatDate(pub) && <span className="research-date">{formatDate(pub)}</span>}
                  </div>
                  {pub.description && <p className="research-description">{pub.description}</p>}
                  <div className="research-links">
                    {paperUrl(pub) && (
                      <a href={paperUrl(pub)} target="_blank" rel="noopener noreferrer">
                        <button className="research-btn research-btn-paper">Paper</button>
                      </a>
                    )}
                    {pub.project_url && (
                      <a href={pub.project_url} target="_blank" rel="noopener noreferrer">
                        <button className="research-btn research-btn-site">Project Page</button>
                      </a>
                    )}
                    {pub.site_path && (
                      <Link to={pub.site_path}>
                        <button className="research-btn research-btn-site">View on Site</button>
                      </Link>
                    )}
                    {pub.citation && (
                      <button
                        className={`research-btn-bibtex${openBibtex === pub.id ? " active" : ""}`}
                        onClick={() => setOpenBibtex(openBibtex === pub.id ? null : pub.id)}
                      >
                        BibTeX
                        <ChevronIcon open={openBibtex === pub.id} />
                      </button>
                    )}
                  </div>
                  {pub.citation && openBibtex === pub.id && (
                    <div className="bibtex-panel">
                      <button
                        className="bibtex-copy"
                        onClick={() => copyToClipboard(pub.citation, pub.id)}
                        title="Copy to clipboard"
                      >
                        <CopyIcon />
                        <span>{copied === pub.id ? "Copied!" : "Copy"}</span>
                      </button>
                      <pre className="bibtex-text">{pub.citation}</pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default Research;
