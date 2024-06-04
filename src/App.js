import React, { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Home from "./components/Home";
import Projects from "./components/Projects";
import Blog from "./components/Blog";
import About from "./components/About";
import Navbar from "./components/Navbar";
import ProjectDetail from "./components/ProjectDetail";
import BlogPost from "./components/BlogPost";
import './App.css';
import './components/common.css';

function App() {
  useEffect(() => {
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (iOS) {
      document.body.classList.add('ios');
    }
  }, []);

  return (
    <Router>
      <div className="app-container">
        <Navbar />
        <div className="content custom-scroll">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/home" element={<Navigate to="/" replace />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:projectId" element={<ProjectDetail />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:blogId" element={<BlogPost />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
