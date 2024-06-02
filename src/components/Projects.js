import React, { useState, useEffect } from 'react';
import './Projects.css';

function Projects() {
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_URL}/api/projects/`)
      .then(response => response.json())
      .then(data => setProjects(data))
      .catch(error => console.error("There was an error fetching projects:", error));
  }, []);

  return (
    <div className="projects cosmic-bg-bright">
      <div className="bg-overlay-2"></div>
      <div className="title">Projects</div>
      <div className="project-cards-container">
        {projects.length > 0 ? (
          projects.map(project => (
            <div className="project-card">
              <div className="project-image">
                <a href={`/projects/${project.slug}`} className="project-link">
                  {project.img && project.img.includes('youtube') ? (
                    <iframe
                      src={project.img}
                      title="YouTube video player"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    ></iframe>
                  ) : (
                    <img src={project.img} alt={project.title} />
                  )}
                </a>
              </div>
              <div className="project-details">
                <a className="project-title" href={`/projects/${project.slug}`}>{project.title}</a>
                <p className="project-status">
                  {project.end ? `Project closed on ${project.end}` : "Ongoing Project"}
                </p>
                {project.description && (
                  <p className="project-description">{project.description}</p>
                )}
              </div>
            </div>
          ))
        ) : (
          <h2 className="loading">Loading...</h2>
        )}
      </div>
    </div>
  );
}

export default Projects;
