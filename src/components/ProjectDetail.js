import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import './ProjectDetail.css';
import backarrow from '../assets/back_arrow_bright.png';
import p5 from 'p5';
import projectAnimation from './bg_animations/particle_background.js';

function ProjectDetail() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const p5Instance = useRef(null);
  const projRef = useRef(null);

  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_URL}/api/projects/${projectId}/`)
      .then(response => response.json())
      .then(data => setProject(data))
      .catch(error => console.error("There was an error fetching the project:", error));
  }, [projectId]);

  useEffect(() => {
    const cleanupP5 = () => {
      if (p5Instance.current) {
        p5Instance.current.remove();
        p5Instance.current = null;
      }
    };

    p5Instance.current = new p5(projectAnimation, projRef.current);

    return cleanupP5;
  }, []);

  return (
    <div className="project-detail">
      <div ref={projRef} className="projectd-background"></div>
      {project ? (
        <div className="projectd-container">
          <Link to="/projects" className="back-link">
            <img src={backarrow} alt="Back to Projects" />
          </Link>
    
          <h1 className="projectd-title">{project.title}</h1>
    
          <div className="projectd-content">
            <div className="projectd-media">
              {project.img && project.img.includes('youtube') ? (
                <iframe
                  src={project.img}
                  title="YouTube video player"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                ></iframe>
              ) : (
                <img src={project.img} alt={project.title} className="projectd-image" />
              )}
            </div>
            <div className="projectd-info">
              <div className="info-box">
                {project.link && (
                  <a href={project.link} className="project-link">
                    <strong>Project Source</strong>
                  </a>
                )}
    
                <p className="projectd-dates">
                  {project.ongoing ? (
                    <em>{project.start} - Present (ongoing)</em>
                  ) : (
                    <em>{project.start} - {project.end}</em>
                  )}
                </p>
    
                {project.topics && (
                  <div className="projectd-topics">
                    <strong>Topics</strong>
                    <ul>
                      <li>{project.topics}</li>
                    </ul>
                  </div>
                )}
    
                {project.association && project.association.length > 0 ? (
                  <div className="projectd-associations">
                    <strong>Associations</strong>
                    <ul>
                      {project.association.map((association) => (
                        <li key={association.id}>{association.name}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p><strong>Associations:</strong> n/a</p>
                )}
              </div>
            </div>
          </div>
    
          <div className="projectd-description">
            <h2>Description</h2>
            <p>{project.description}</p>
          </div>
        </div>
      ) : (
        <h2 className="loading">Loading...</h2>
      )}
    </div>
  );
}

export default ProjectDetail;
