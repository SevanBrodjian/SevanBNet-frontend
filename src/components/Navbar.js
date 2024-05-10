import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "./Navbar.css"; // Assuming you create a separate CSS file for Navbar
import logo from '../assets/favicon.ico';
import gitLogo from '../assets/gitlogo.png';
import liLogo from '../assets/lilogo.png';

function Navbar() {
  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const location = useLocation();

  return (
    <nav className="navbar">
      <div className="logoAndDropdown">
        <Link to="/" className="logo">
          <img src={logo} alt="Logo" />
          <span className="site-name">SevanB.net</span>
        </Link>

        <div className="spacer"></div>

        <div className={`menu-icon ${isNavExpanded ? 'open' : ''}`} onClick={() => setIsNavExpanded(!isNavExpanded)}>
          <div></div><div></div><div></div>
        </div>
      </div>
      
      <ul className={`nav-links ${isNavExpanded ? 'open' : ''}`}>
        <li><Link to="/" onClick={() => setIsNavExpanded(false)} className={location.pathname === "/" ? "active" : ""}>Home</Link></li>
        <li><Link to="/projects" onClick={() => setIsNavExpanded(false)} className={location.pathname === "/projects" ? "active" : ""}>Projects</Link></li>
        <li><Link to="/blog" onClick={() => setIsNavExpanded(false)} className={location.pathname === "/blog" ? "active" : ""}>Blog</Link></li>
        <li><Link to="/about" onClick={() => setIsNavExpanded(false)} className={location.pathname === "/about" ? "active" : ""}>About Me</Link></li>
      </ul>

      <div className={`social-links ${isNavExpanded ? 'open' : ''}`}>
        <Link to="https://github.com/SevanBrodjian" target="_blank"><img src={gitLogo} alt="GitHub" /></Link>
        <Link to="https://www.linkedin.com/in/sevan-b/" target="_blank"><img src={liLogo} alt="LinkedIn" /></Link>
      </div>
    </nav>
  );
}

export default Navbar;
