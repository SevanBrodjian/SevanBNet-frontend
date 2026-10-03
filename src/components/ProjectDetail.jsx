import DomPurify from "dompurify";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { fetchApi } from "../api";
import { NAME, pageTitle } from "../site";
import { NoIndex } from "./NotFound";
import "./ProjectDetail.css";
import p5 from "p5";
import projectAnimation from "./bg_animations/particle_background.js";

function ProjectDetail() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [failed, setFailed] = useState(false);
  const [missing, setMissing] = useState(false);
  const p5Instance = useRef(null);
  const projRef = useRef(null);

  useEffect(() => {
    fetchApi(`projects/${projectId}/`)
      .then(setProject)
      .catch((error) => {
        console.error("There was an error fetching the project:", error);
        setFailed(true);
        // Only a confirmed 404 is noindexed; an API outage must not de-index real pages.
        setMissing(error.status === 404);
      });
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
      <div ref={projRef} className="projectd-background" />
      {project ? (
        <div className="projectd-container">
          <title>{pageTitle(project.title)}</title>
          <div className="projectd-title">{project.title}</div>
          <div className="projectd-content">
            {project.img && project.img.includes("youtube") ? (
              <div className="projectd-media">
                <iframe
                  src={project.img}
                  title="YouTube video player"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen={true}
                />
              </div>
            ) : project.img && /\.mp4$/i.test(project.img) ? (
              <video
                className="projectd-video"
                autoPlay={true}
                loop={true}
                muted={true}
                playsInline={true}
                controls={true}
                preload="metadata"
              >
                <source src={project.img} type="video/mp4" />
              </video>
            ) : (
              <img className="projectd-img" src={project.img} alt={project.title} />
            )}
          </div>
          <div className="projectd-info">
            <div className="projectd-dates bigscreen">
              {project.end ? (
                <em>
                  {project.start} - {project.end}
                </em>
              ) : (
                <em>{project.start} - Present (ongoing)</em>
              )}
            </div>
            <div className="projectd-dates smallscreen">
              {project.end ? (
                <em>
                  {project.start} - <br />
                  {project.end}
                </em>
              ) : (
                <em>
                  {project.start} - <br />
                  Present (ongoing)
                </em>
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
              dangerouslySetInnerHTML={{ __html: DomPurify.sanitize(project.description) }}
            />
          </div>
        </div>
      ) : (
        <h2 className="loading">
          <title>{missing ? pageTitle("Not found") : NAME}</title>
          {missing && <NoIndex />}
          {missing ? "Not found." : failed ? "Couldn't load this project." : "Loading..."}
        </h2>
      )}
    </div>
  );
}

export default ProjectDetail;
