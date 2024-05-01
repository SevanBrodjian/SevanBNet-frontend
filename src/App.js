import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./components/Home";
import Projects from "./components/Projects";
import Blog from "./components/Blog";
import AboutMe from "./components/AboutMe";
import Navbar from "./components/Navbar";
import './App.css';

function App() {
  return (
    <Router>
      <div className="app-container">
        <Navbar />
        <div className="content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/about" element={<AboutMe />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
