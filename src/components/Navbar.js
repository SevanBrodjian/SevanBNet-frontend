import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CSSTransition } from "react-transition-group";
import "./Navbar.css";
import logo from '../assets/site-logo-small.png';
import gitLogo from '../assets/gitlogo.png';
import liLogo from '../assets/lilogo.png';

function Navbar() {
  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const location = useLocation();
  const isHomePage = location.pathname === "/";

  if (isHomePage) {
    return null;
  }

  return (
    <div className="navbar-container">
      <nav className="navbar">
        <div className="logoAndDropdown">
          <Link to="/" onClick={() => setIsNavExpanded(false)} className="logo">
            <img src={logo} alt="Logo" />
            <span className="site-name">SevanB.net</span>
          </Link>
          <div className={`menu-icon ${isNavExpanded ? 'open' : ''}`} onClick={() => setIsNavExpanded(!isNavExpanded)}>
            <div></div><div></div><div></div>
          </div>
        </div>
        <ul className="nav-links bigscreen">
          <li><Link to="/" onClick={() => setIsNavExpanded(false)} className={location.pathname === "/" ? "active" : ""}>Home</Link></li>
          <li><Link to="/projects" onClick={() => setIsNavExpanded(false)} className={location.pathname === "/projects" ? "active" : ""}>Projects</Link></li>
          <li><Link to="/blog" onClick={() => setIsNavExpanded(false)} className={location.pathname === "/blog" ? "active" : ""}>Blog</Link></li>
          <li><Link to="/about" onClick={() => setIsNavExpanded(false)} className={location.pathname === "/about" ? "active" : ""}>About Me</Link></li>
        </ul>
        <div className="social-links bigscreen">
          <a href="https://github.com/SevanBrodjian" target="_blank" rel="noopener noreferrer"><img src={gitLogo} alt="GitHub" /></a>
          <a href="https://www.linkedin.com/in/sevan-b/" target="_blank" rel="noopener noreferrer"><img src={liLogo} alt="LinkedIn" /></a>
        </div>
        <CSSTransition
          in={isNavExpanded}
          timeout={300}
          classNames="nav-animation"
          unmountOnExit
        >
          <ul className="nav-links smallscreen">
            <li><Link to="/" onClick={() => setIsNavExpanded(false)} className={location.pathname === "/" ? "active" : ""}>Home</Link></li>
            <li><Link to="/projects" onClick={() => setIsNavExpanded(false)} className={location.pathname === "/projects" ? "active" : ""}>Projects</Link></li>
            <li><Link to="/blog" onClick={() => setIsNavExpanded(false)} className={location.pathname === "/blog" ? "active" : ""}>Blog</Link></li>
            <li><Link to="/about" onClick={() => setIsNavExpanded(false)} className={location.pathname === "/about" ? "active" : ""}>About Me</Link></li>
          </ul>
        </CSSTransition>
        <CSSTransition
          in={isNavExpanded}
          timeout={300}
          classNames="nav-animation"
          unmountOnExit
        >
          <div className="social-links smallscreen">
            <a href="https://github.com/SevanBrodjian" target="_blank" rel="noopener noreferrer"><img src={gitLogo} alt="GitHub" /></a>
            <a href="https://www.linkedin.com/in/sevan-b/" target="_blank" rel="noopener noreferrer"><img src={liLogo} alt="LinkedIn" /></a>
          </div>
        </CSSTransition>
      </nav>
    </div>
  );
}

export default Navbar;
