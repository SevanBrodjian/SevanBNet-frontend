// Facts about the site and its owner, shared by the React app and the build-time page
// generator (seo.ts). Keep everything here true and visible somewhere on the site:
// search engines and AI crawlers read these strings directly. The home line, the role
// shown on the home page and the About text are edited in the control panel (Site
// settings), not here.

export const SITE_URL = "https://www.sevanb.net";
export const NAME = "Sevan Brodjian";

export const PROFILES = [
  { label: "Google Scholar", url: "https://scholar.google.com/citations?user=bla3rA8AAAAJ" },
  { label: "GitHub", url: "https://github.com/SevanBrodjian" },
  { label: "LinkedIn", url: "https://www.linkedin.com/in/sevan-b" },
];

// Confirmed by Sevan (2026-10-03). For structured data and the About page's label.
export const ROLE = {
  title: "PhD Student",
  department: "Computation and Neural Systems",
  institution: "California Institute of Technology",
  institutionShort: "Caltech",
  institutionUrl: "https://www.caltech.edu/",
};

// <title> and meta description for each top-level page.
export const PAGES = {
  home: {
    path: "/",
    title: `${NAME} · Generative models and simulators`,
    description: `${NAME}: generative models and simulators for next-generation virtual environments.`,
  },
  projects: {
    path: "/projects",
    title: `Projects · ${NAME}`,
    description: "Projects by Sevan Brodjian.",
  },
  papers: {
    path: "/papers",
    title: `Papers · ${NAME}`,
    description: "Papers by Sevan Brodjian.",
  },
  writing: {
    path: "/writing",
    title: `Writing · ${NAME}`,
    description: "Essays by Sevan Brodjian on science, consciousness and technology.",
  },
  about: {
    path: "/about",
    title: `About · ${NAME}`,
    description:
      "Sevan Brodjian studies perception as an active, generative process, building machines that perceive by synthesizing multimodal representations grounded in physical interaction.",
  },
};

// Profile documents, shown in an on-site viewer with a link out to Drive.
export const DOCUMENTS = [
  {
    id: "cv",
    label: "CV",
    url: "https://drive.google.com/file/d/1-Vxy1hyLh5NeTWmCb3i-T4X0nr1gIdD6/preview",
  },
  {
    id: "resume",
    label: "Resume",
    url: "https://drive.google.com/file/d/1i_i-cfGA80DceD8W69wgLDuAupEtMVI7/preview",
  },
];

export const pageTitle = (title) => `${title} · ${NAME}`;

// Old addresses of pages that moved, permanently redirected (by the server and the app).
export const REDIRECTS = [
  { from: "/papers/sonar-rendering", to: "/projects/sonar-inverse-rendering" },
];
