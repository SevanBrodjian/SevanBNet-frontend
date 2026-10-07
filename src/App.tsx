import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router";
import Layout from "./frame/Layout";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import { FLAGSHIPS } from "./projects/meta";
import { About, Essay, Papers, ProjectPage, Projects, Writing } from "./routes";
import { SITE_URL } from "./site";

// Every copy of the site (www, preview domains) names the same www.sevanb.net URL as
// canonical, so duplicates never compete with the real site.
function Canonical() {
  const { pathname } = useLocation();
  const path = pathname === "/" ? "/" : pathname.replace(/\/$/, "");
  return <link rel="canonical" href={`${SITE_URL}${path}`} />;
}

function BlogPostRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/writing/${slug}`} replace />;
}

// Old URLs. The server answers these with permanent redirects too (seo.ts / serve.json);
// these cover links followed inside the app.
const LEGACY = [
  { from: "/home", to: "/" },
  { from: "/blog", to: "/writing" },
  { from: "/research", to: "/papers" },
  ...FLAGSHIPS.filter((p) => p.legacyPath).map((p) => ({
    from: p.legacyPath as string,
    to: `/projects/${p.slug}`,
  })),
];

export default function App() {
  return (
    <BrowserRouter>
      <Canonical />
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:slug" element={<ProjectPage />} />
          <Route path="/papers" element={<Papers />} />
          <Route path="/writing" element={<Writing />} />
          <Route path="/writing/:slug" element={<Essay />} />
          <Route path="/about" element={<About />} />
          <Route path="/blog/:slug" element={<BlogPostRedirect />} />
          {LEGACY.map((r) => (
            <Route key={r.from} path={r.from} element={<Navigate to={r.to} replace />} />
          ))}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
