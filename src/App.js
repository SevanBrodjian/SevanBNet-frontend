import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./components/Home";
import Projects from "./components/Projects";
import Blog from "./components/Blog";
import About from "./components/About";
import Navbar from "./components/Navbar";
import './App.css';
import './components/common.css';

function App() {
  return (
    <Router>
      <div className="app-container">
        <Navbar />
        <div className="content custom-scroll">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
