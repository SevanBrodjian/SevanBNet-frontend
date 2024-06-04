import React from "react";
import './About.css';
import headshot from '../assets/rainforest_cropped.JPG';

function About() {
  return (
    <div className="about cosmic-bg-dark">
      <div className="bg-overlay-1"></div>
      <div className="about-container">
        <div className="image-container">
          <img className="headshot" src={headshot} alt="Headshot" />
        </div>
        <div className="text-container">
          <h1 className="about-name">Sevan Brodjian</h1>
          <h3 className="about-subtitle">Data Science & Neurotechnology</h3>
          <p className="about-description">
            Bringing three years of industry experience at the forefront of machine learning, I am currently preparing to pursue a PhD in Computation and Neural Systems at Caltech this Fall. Some of my work includes the development of end-to-end machine learning pipelines utilizing advanced techniques such as deep learning for regression tasks and vision transformers.
            <br /><br />
            Explore my portfolio of personal projects and delve into my blog for insights into the applications I'm developing and the philosophical approach that guides my work.
            <br></br>
          </p>
        </div>
      </div>
    </div>
  );
}

export default About;
