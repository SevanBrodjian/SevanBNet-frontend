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

  return (
    <div className="research cosmic-bg-bright">
      <div className="bg-overlay-2"></div>
      <div className="title">Research</div>
      <div className="research-container">
        {loading ? (
          <h2 className="loading">Loading...</h2>
        ) : publications.length === 0 ? (
          <h2 className="loading">No publications yet.</h2>
        ) : publications.map(pub => (
            <div className="research-card" key={pub.id}>
              <h2 className="research-title">{pub.title}</h2>
              {pub.authors_str && <p className="research-authors">{pub.authors_str}</p>}
              <div className="research-meta">
                <span className="research-status">{pub.status}</span>
                {pub.journal_name && <span className="research-journal">{pub.journal_name}</span>}
                {formatDate(pub) && <span className="research-date">{formatDate(pub)}</span>}
              </div>
              {pub.description && <p className="research-description">{pub.description}</p>}
              <div className="research-links">
                {pub.site_path && (
                  <Link to={pub.site_path}>
                    <button className="research-btn research-btn-site">View Site</button>
                  </Link>
                )}
                {paperUrl(pub) && (
                  <a href={paperUrl(pub)} target="_blank" rel="noopener noreferrer">
                    <button className="research-btn research-btn-paper">Read Paper</button>
                  </a>
                )}
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}

export default Research;
