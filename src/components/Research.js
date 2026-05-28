import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Research.css';

function Research() {
  const [publications, setPublications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_URL}/api/publications/`)
      .then(response => {
        if (!response.ok) throw new Error(response.status);
        return response.json();
      })
      .then(data => {
        setPublications(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(error => {
        console.error("There was an error fetching publications:", error);
        setLoading(false);
      });
  }, []);

  const formatDate = (pub) => {
    const d = pub.publication_date || pub.submission_date;
    if (!d) return null;
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  };

  const paperUrl = (pub) => {
    if (pub.url) return pub.url;
    if (pub.doi) return `https://doi.org/${pub.doi}`;
    return null;
  };

  const youtubeAutoplay = (src) => {
    try {
      const u = new URL(src);
      u.searchParams.set('autoplay', '1');
      u.searchParams.set('mute', '1');
      u.searchParams.set('loop', '1');
      const videoId = u.pathname.split('/').filter(Boolean).pop();
      if (videoId) u.searchParams.set('playlist', videoId);
      return u.toString();
    } catch {
      return src;
    }
  };

  const renderMedia = (pub) => {
    if (!pub.img) return null;
    if (pub.img.includes('youtube')) {
      return (
        <iframe
          src={youtubeAutoplay(pub.img)}
          title={pub.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      );
    }
    if (/\.(mp4|webm|ogg)$/i.test(pub.img)) {
      return (
        <video
          ref={el => { if (el) { el.muted = true; el.play().catch(() => {}); } }}
          autoPlay
          loop
          playsInline
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
      <div className="bg-overlay-2"></div>
      <div className="title">Research</div>
      <div className="research-container">
        {loading ? (
          <h2 className="loading">Loading...</h2>
        ) : publications.length === 0 ? (
          <h2 className="loading">No publications yet.</h2>
        ) : publications.map(pub => {
            const media = renderMedia(pub);
            return (
              <div className="research-card" key={pub.id}>
                {media && <div className="research-image">{media}</div>}
                <div className="research-content">
                  <h2 className="research-title">{pub.title}</h2>
                  {pub.authors_str && <p className="research-authors">{pub.authors_str}</p>}
                  <div className="research-meta">
                    <span className="research-status">{pub.status}</span>
                    {pub.journal_name && <span className="research-journal">{pub.journal_name}</span>}
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
                  </div>
                </div>
              </div>
            );
          })
        }
      </div>
    </div>
  );
}

export default Research;
