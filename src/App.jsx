import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { SITE_URL } from "./api";
import About from "./components/About";
import Blog from "./components/Blog";
import BlogPost from "./components/BlogPost";
import Home from "./components/Home";
import Navbar from "./components/Navbar";
import ProjectDetail from "./components/ProjectDetail";
import Projects from "./components/Projects";
import Research from "./components/Research";
import "./App.css";
import "./components/common.css";

// Standalone paper pages are code-split so their JS + KaTeX CSS only load on visit.
const SonarRendering = lazy(() => import("./components/papers/SonarRendering"));

// Path prefixes that should always use BrowserRouter, even on iOS — so QR codes
// pointing at /papers/<slug> work cross-platform instead of dropping iOS users
// at the home page because HashRouter ignores the path.
const STANDALONE_PREFIXES = ["/papers/"];
const isStandalonePath = (path) => STANDALONE_PREFIXES.some((p) => path.startsWith(p));

// Every copy of the site (www, Railway preview domains) points search engines at the
// same www.sevanb.net URL, so duplicates never compete with the real site.
function Canonical() {
  const { pathname } = useLocation();
  return (
    <link
      rel="canonical"
      href={`${SITE_URL}${pathname === "/" ? "/" : pathname.replace(/\/$/, "")}`}
    />
  );
}

function App() {
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const iOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIOS(iOS);
    if (iOS) {
      document.body.classList.add("ios");
    }
  }, []);

  const onStandalone = typeof window !== "undefined" && isStandalonePath(window.location.pathname);
  const Router = isIOS && !onStandalone ? HashRouter : BrowserRouter;

  return (
    <Router basename="/">
      <Canonical />
      <Suspense fallback={null}>
        <Routes>
          {/* Standalone pages — rendered outside the site chrome (no Navbar, no app-container). */}
          <Route path="/papers/sonar-rendering" element={<SonarRendering />} />

          {/* Main site — everything else. */}
          <Route
            path="/*"
            element={
              <div className="app-container">
                <Navbar />
                <div className="content custom-scroll">
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/home" element={<Navigate to="/" replace />} />
                    <Route path="/projects" element={<Projects />} />
                    <Route path="/projects/:projectId" element={<ProjectDetail />} />
                    <Route path="/research" element={<Research />} />
                    <Route path="/blog" element={<Blog />} />
                    <Route path="/blog/:blogId" element={<BlogPost />} />
                    <Route path="/about" element={<About />} />
                  </Routes>
                </div>
              </div>
            }
          />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
