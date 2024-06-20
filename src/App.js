import React, { useEffect, useState } from "react";
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from "react-router-dom";
import Home from "./components/Home";
import Projects from "./components/Projects";
import Blog from "./components/Blog";
import About from "./components/About";
import Navbar from "./components/Navbar";
import ProjectDetail from "./components/ProjectDetail";
import BlogPost from "./components/BlogPost";
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';
import './components/common.css';

function App() {
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(iOS);
    if (iOS) {
      document.body.classList.add('ios');
    }
  }, []);

  const Router = isIOS ? HashRouter : BrowserRouter;

  return (
    <Router basename="/">
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
