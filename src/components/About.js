import React, { useState } from "react";
import './About.css';
import headshot from '../assets/rainforest_cropped.JPG';

function About() {
  const [isCVOpen, setIsCVOpen] = useState(false);
  const [isResumeOpen, setIsResumeOpen] = useState(false);
  const [isCVLoading, setIsCVLoading] = useState(true);
  const [isResumeLoading, setIsResumeLoading] = useState(true);

  const toggleCVPopup = () => {
    setIsCVOpen(!isCVOpen);
    setIsCVLoading(true); // Set loading to true when opening the popup
  };

  const toggleResumePopup = () => {
    setIsResumeOpen(!isResumeOpen);
    setIsResumeLoading(true); // Set loading to true when opening the popup
  };

  const closePopup = () => {
    setIsCVOpen(false);
    setIsResumeOpen(false);
  };

  const handleCVLoad = () => {
    setIsCVLoading(false); // Set loading to false when PDF is loaded
  };

  const handleResumeLoad = () => {
    setIsResumeLoading(false); // Set loading to false when PDF is loaded
  };

  return (
    <div className="about cosmic-bg-dark">
      <div className="bg-overlay-1"></div>
      <div className="about-container">
        <div className="image-container">
          <img className="headshot" src={headshot} alt="Headshot" />
        </div>
        <div className="text-container">
          <h1 className="about-name">Sevan Brodjian</h1>
          <h3 className="about-subtitle">Computation and Neural Systems</h3>
          <div className="links-container">
            <button onClick={toggleCVPopup} className="about-link-btn">CV</button>
            <button onClick={toggleResumePopup} className="about-link-btn">Resume</button>
          </div>
          <p className="about-description">
            Coming from industry applications of machine learning, primarily in power grid optimization through load forecasting, I am now beginning to pursue a Ph.D. at Caltech this Fall. With a general love for the sciences, I am most interested in interdisciplinary work, drawing inspiration from neuroscience, physics, biology, philosophy, and beyond.
            <br /><br />
            Explore my portfolio of personal projects and dive into my blog for insights into what I'm working on and the philosophical grounding that guides my work.
            <br></br>
          </p>
        </div>
      </div>
      {isCVOpen && (
        <div className="popup-overlay" onClick={closePopup}>
          <div className="popup-content" onClick={(e) => e.stopPropagation()}>
            <button className="pdf-close-btn" onClick={toggleCVPopup}>X</button>
            <div className={`loading-text ${isCVLoading ? '' : 'hidden'}`}>Loading...</div>
            <iframe
              src="https://drive.google.com/file/d/1-Vxy1hyLh5NeTWmCb3i-T4X0nr1gIdD6/preview"
              className="popup-iframe"
              type="application/pdf"
              onLoad={handleCVLoad}
              style={{ opacity: isCVLoading ? 0 : 1 }}
            />
          </div>
        </div>
      )}
      {isResumeOpen && (
        <div className="popup-overlay" onClick={closePopup}>
          <div className="popup-content" onClick={(e) => e.stopPropagation()}>
            <button className="pdf-close-btn" onClick={toggleResumePopup}>X</button>
            <div className={`loading-text ${isResumeLoading ? '' : 'hidden'}`}>Loading...</div>
            <iframe
              src="https://drive.google.com/file/d/1i_i-cfGA80DceD8W69wgLDuAupEtMVI7/preview"
              className="popup-iframe"
              type="application/pdf"
              onLoad={handleResumeLoad}
              style={{ opacity: isResumeLoading ? 0 : 1 }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default About;
