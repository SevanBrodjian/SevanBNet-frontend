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
    <div className="projects cosmic-bg">
      <div className="bg-overlay"></div>
      <div className="title">
        <h1>Independent Projects</h1>
      </div>
      <div className="project-cards-container">
        {projects.length > 0 ? (
          projects.map(project => (
            <div className="project-card" key={project.id}>
              <div className="project-image">
                <a href={project.get_absolute_url} className="project-link">
                  {project.img && project.img.includes('youtube') ? (
                    <iframe
                      className='youtube-embed' 
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
                <a className="project-title" href={project.get_absolute_url}>{project.title}</a>
                <p className="project-status">
                  {project.ongoing ? "Ongoing Project" : `Project closed on ${project.end}`}
                </p>
                {project.description && (
                  <p className="project-description">{project.description}</p>
                )}
              </div>
            </div>
          ))
        ) : (
          <p>Error: No projects found.</p>
        )}
      </div>
    </div>
  );
}

export default Projects;
