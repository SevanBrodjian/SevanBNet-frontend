import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import './ProjectDetail.css';
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
          <div className="projectd-title">{project.title}</div>
          <div className="projectd-content">
            {project.img && project.img.includes('youtube') ? (
              <div className="projectd-media">
                <iframe
                  src={project.img}
                  title="YouTube video player"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                ></iframe>
              </div>
            ) : (
              <img className="projectd-img" src={project.img} alt={project.title} />
            )}
          </div>
          <div className="projectd-info">
            <div className="projectd-dates bigscreen">
              {project.end ? (
                <em>{project.start} - {project.end}</em>
              ) : (
                <em>{project.start} - Present (ongoing)</em>
              )}
            </div>
            <div className="projectd-dates smallscreen">
              {project.end ? (
                <em>{project.start} - <br></br>{project.end}</em>
              ) : (
                <em>{project.start} - <br></br>Present (ongoing)</em>
              )}
            </div>
            {project.link && (
              <a href={project.link} target="_blank" rel="noopener noreferrer">
                <button className="proj-link-btn">Project Source</button>
              </a>
            )}
          </div>
          <div className="projectd-description">
            <div className="desc-header">Description</div>
            <div
              className="desc-text"
              dangerouslySetInnerHTML={{ __html: project.description }}
            />
          </div>
        </div>
      ) : (
        <h2 className="loading">Loading...</h2>
      )}
    </div>
  );
}

export default ProjectDetail;
