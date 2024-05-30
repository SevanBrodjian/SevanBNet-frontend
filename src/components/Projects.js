import React, { useState, useEffect, useRef } from 'react';
import './Projects.css';
import p5 from 'p5';
import projectAnimation from './particle_background.js';

function Projects() {
  const [projects, setProjects] = useState([]);
  const p5Instance = useRef(null);
  const projRef = useRef(null);

  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_URL}/api/projects/`)
      .then(response => response.json())
      .then(data => setProjects(data))
      .catch(error => console.error("There was an error fetching projects:", error));
  }, []);

  useEffect(() => {
    // if (projRef.current && !p5Instance.current) {
    //   p5Instance.current = new p5(projectAnimation, projRef.current);
    // }

    return () => {
      if (p5Instance.current) {
        p5Instance.current.remove();
        p5Instance.current = null;
      }
    };
  }, []);

  return (
    <div className="projects cosmic-bw-bg">
      <div className="static-bg"></div>
      <div className="bg-overlay-1"></div>
      <div ref={projRef} className="project-background"></div>
      <div className="title">
        <p>Projects</p>
      </div>
      <div className="projects-section">
        <div className="project-cards-container custom-scroll">
          {projects.length > 0 ? (
            projects.map(project => (
              <div className="project-card" key={project.id}>
                <div className="project-image">
                  <a href={project.get_absolute_url} className="project-link">
                    {project.img && project.img.includes('youtube') ? (
                      <iframe
                        className="youtube-embed" 
                        src={project.img}
                        title="YouTube video player"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      ></iframe>
                    ) : (
                      <img className="img-embed" src={project.img} alt={project.title} />
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
            <h2>Loading...</h2>
          )}
        </div>
      </div>
    </div>
  );
}

export default Projects;
