import React from "react";
import { Link, useLocation } from "react-router-dom";
import "./Navbar.css"; // Assuming you create a separate CSS file for Navbar
import logo from '../assets/favicon.ico';
import gitLogo from '../assets/gitlogo.png';
import liLogo from '../assets/lilogo.png';

function Navbar() {
  const location = useLocation(); // To determine the current page

  return (
    <nav className="navbar">
      <Link to="/" className="logo">
        <img src={logo} alt="Logo" />
        <span className="site-name">SevanB.net</span>
      </Link>
      <ul className="nav-links">
        <li>
          <Link to="/" className={location.pathname === "/" ? "active" : ""}>Home</Link>
        </li>
        <li>
          <Link to="/projects" className={location.pathname === "/projects" ? "active" : ""}>Projects</Link>
        </li>
        <li>
          <Link to="/blog" className={location.pathname === "/blog" ? "active" : ""}>Blog</Link>
        </li>
        <li>
          <Link to="/about" className={location.pathname === "/about" ? "active" : ""}>About Me</Link>
        </li>
      </ul>
      <div className="social-links">
        <Link to="https://github.com/SevanBrodjian" target="_blank">
          <img src={gitLogo} alt="GitHub" />
        </Link>
        <Link to="https://www.linkedin.com/in/sevan-b/" target="_blank">
          <img src={liLogo} alt="LinkedIn" />
        </Link>
      </div>
    </nav>
  );
}

export default Navbar;
