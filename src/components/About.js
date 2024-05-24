import React from "react";
import './About.css';
import headshot from '../assets/rainforest_cropped.JPG';

function About() {
  return (
    <div className="about cosmic-bg">
      <div className="bg-overlay"></div>
      <div className="about-container">
        <div className="outer-flex">
          <div className="inner-1">
            <div className="image-container">
              <img className="headshot" src={headshot} alt="Headshot" />
            </div>
          </div>
          <div className="inner-2">
            <div className="text-container">
              <h1 className="name">Sevan Brodjian</h1>
              <h3 className="subtitle">Data Science & Neurotechnology</h3>
              <p className="description">
                Bringing three years of industry experience at the forefront of machine learning, I am currently preparing to begin pursuing a PhD in Computation and Neural Systems at Caltech this Fall. Some of my work includes the development of end-to-end machine learning pipelines utilizing advanced techniques such as deep learning for regression tasks and vision transformers. This website is currently under construction.
                <br /><br />
                Explore my portfolio of personal projects and delve into my blog for insights into the applications I'm developing and the philosophical approach that guides my work.
                <br></br><br></br><br></br>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default About;
