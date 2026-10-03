import { useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { CSSTransition } from "react-transition-group";
import "./Navbar.css";
import gitLogo from "../assets/gitlogo.png";
import liLogo from "../assets/lilogo.png";
import scholarLogo from "../assets/scholarlogo.png";
import logo from "../assets/site-logo-small.png";

function Navbar() {
  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const dropdownRef = useRef(null);
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
          <button
            type="button"
            className={`menu-icon ${isNavExpanded ? "open" : ""}`}
            aria-label="Menu"
            aria-expanded={isNavExpanded}
            onClick={() => setIsNavExpanded(!isNavExpanded)}
          >
            <div></div>
            <div></div>
            <div></div>
          </button>
        </div>
        <ul className="nav-links bigscreen">
          <li>
            <Link
              to="/"
              onClick={() => setIsNavExpanded(false)}
              className={location.pathname === "/" ? "active" : ""}
            >
              Home
            </Link>
          </li>
          <li>
            <Link
              to="/projects"
              onClick={() => setIsNavExpanded(false)}
              className={location.pathname === "/projects" ? "active" : ""}
            >
              Projects
            </Link>
          </li>
          <li>
            <Link
              to="/research"
              onClick={() => setIsNavExpanded(false)}
              className={location.pathname === "/research" ? "active" : ""}
            >
              Research
            </Link>
          </li>
          <li>
            <Link
              to="/blog"
              onClick={() => setIsNavExpanded(false)}
              className={location.pathname === "/blog" ? "active" : ""}
            >
              Blog
            </Link>
          </li>
          <li>
            <Link
              to="/about"
              onClick={() => setIsNavExpanded(false)}
              className={location.pathname === "/about" ? "active" : ""}
            >
              About Me
            </Link>
          </li>
        </ul>
        <div className="social-links bigscreen">
          <a href="https://github.com/SevanBrodjian" target="_blank" rel="noopener noreferrer">
            <img src={gitLogo} alt="GitHub" />
          </a>
          <a href="https://www.linkedin.com/in/sevan-b/" target="_blank" rel="noopener noreferrer">
            <img src={liLogo} alt="LinkedIn" />
          </a>
          <a
            href="https://scholar.google.com/citations?user=bla3rA8AAAAJ"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img src={scholarLogo} alt="Google Scholar" />
          </a>
        </div>
        <CSSTransition
          in={isNavExpanded}
          timeout={300}
          classNames="nav-animation"
          unmountOnExit
          nodeRef={dropdownRef}
        >
          <div className="nav-dropdown" ref={dropdownRef}>
            <ul className="nav-links smallscreen">
              <li>
                <Link
                  to="/"
                  onClick={() => setIsNavExpanded(false)}
                  className={location.pathname === "/" ? "active" : ""}
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  to="/projects"
                  onClick={() => setIsNavExpanded(false)}
                  className={location.pathname === "/projects" ? "active" : ""}
                >
                  Projects
                </Link>
              </li>
              <li>
                <Link
                  to="/research"
                  onClick={() => setIsNavExpanded(false)}
                  className={location.pathname === "/research" ? "active" : ""}
                >
                  Research
                </Link>
              </li>
              <li>
                <Link
                  to="/blog"
                  onClick={() => setIsNavExpanded(false)}
                  className={location.pathname === "/blog" ? "active" : ""}
                >
                  Blog
                </Link>
              </li>
              <li>
                <Link
                  to="/about"
                  onClick={() => setIsNavExpanded(false)}
                  className={location.pathname === "/about" ? "active" : ""}
                >
                  About Me
                </Link>
              </li>
            </ul>
            <div className="social-links smallscreen">
              <a href="https://github.com/SevanBrodjian" target="_blank" rel="noopener noreferrer">
                <img src={gitLogo} alt="GitHub" />
              </a>
              <a
                href="https://www.linkedin.com/in/sevan-b/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img src={liLogo} alt="LinkedIn" />
              </a>
              <a
                href="https://scholar.google.com/citations?user=bla3rA8AAAAJ"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img src={scholarLogo} alt="Google Scholar" />
              </a>
            </div>
          </div>
        </CSSTransition>
      </nav>
    </div>
  );
}

export default Navbar;
