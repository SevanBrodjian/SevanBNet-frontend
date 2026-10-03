import { useEffect, useState } from "react";
import { Link } from "react-router";
import { fetchApi } from "../api";
import "./Projects.css";

function Projects() {
  const [projects, setProjects] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchApi("projects/")
      .then(setProjects)
      .catch((error) => {
        console.error("There was an error fetching projects:", error);
        setFailed(true);
      });
  }, []);

  return (
    <div className="projects cosmic-bg-bright">
      <title>Projects · Sevan Brodjian</title>
      <div className="bg-overlay-2" />
      <div className="title">Projects</div>
      <div className="project-cards-container">
        {projects ? (
          projects.map((project) => (
            <div className="project-card" key={project.slug}>
              <div className="project-image">
                <Link to={`/projects/${project.slug}`} className="project-link">
                  {project.img && project.img.includes("youtube") ? (
                    <iframe
                      src={project.img}
                      title="YouTube video player"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen={true}
                    />
                  ) : project.img && /\.mp4$/i.test(project.img) ? (
                    <video autoPlay={true} loop={true} muted={true} playsInline={true}>
                      <source src={project.img} type="video/mp4" />
                    </video>
                  ) : (
                    <img src={project.img} alt={project.title} />
                  )}
                </Link>
              </div>
              <div className="project-details">
                <Link className="project-title" to={`/projects/${project.slug}`}>
                  {project.title}
                </Link>
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
          <h2 className="loading">{failed ? "Couldn't load projects." : "Loading..."}</h2>
        )}
      </div>
    </div>
  );
}

export default Projects;
