// Facts about the site and its owner, shared by the React app and the build-time page
// generator (seo.ts). Keep everything here true and visible somewhere on the site:
// search engines and AI crawlers read these strings directly.

export const SITE_URL = "https://www.sevanb.net";
export const NAME = "Sevan Brodjian";

export const PROFILES = [
  { label: "Google Scholar", url: "https://scholar.google.com/citations?user=bla3rA8AAAAJ" },
  { label: "GitHub", url: "https://github.com/SevanBrodjian" },
  { label: "LinkedIn", url: "https://www.linkedin.com/in/sevan-b" },
];

// Confirmed by Sevan (2026-10-03).
export const ROLE = {
  title: "PhD Student",
  department: "Computation and Neural Systems",
  institution: "California Institute of Technology",
  institutionShort: "Caltech",
  institutionUrl: "https://www.caltech.edu/",
};

export const ABOUT = {
  subtitle: "Computation and Neural Systems",
  paragraphs: [
    "I study perception as an active, generative process, building machines that perceive by synthesizing multimodal representations grounded in physical interaction. Drawing from phenomenology (the study of lived, embodied experience) I explore how experience emerges through construction, not passive reception.",
    "My current research focuses on sonar-to-3D inverse rendering: reconstructing geometric environments from sparse acoustic data using custom differentiable simulators grounded in physical sensor models. This work investigates how generative models informed by sensor physics can unify perception and generation, producing interpretable systems that both sense and synthesize environments.",
    "Long-term, I aim to develop real-time generative models that integrate vision, audition, and neural signals (brain-computer interfaces), leading to immersive technologies that co-perceive the world with users. My work bridges generative machine learning, physically-based simulation, and real-time graphics, paving the way for experiential computing in areas like robotics, embodied intelligence, and interactive media.",
  ],
};

// <title> and meta description for each top-level page.
export const PAGES = {
  home: {
    path: "/",
    title: `${NAME} · Generative models and simulation`,
    description:
      "Sevan Brodjian studies perception as a generative process, bridging generative machine learning, physically-based simulation and real-time graphics.",
  },
  about: {
    path: "/about",
    title: `About · ${NAME}`,
    description:
      "Sevan Brodjian studies perception as an active, generative process, building machines that perceive by synthesizing multimodal representations grounded in physical interaction.",
  },
  projects: {
    path: "/projects",
    title: `Projects · ${NAME}`,
    description: "Projects by Sevan Brodjian, with write-ups, media and code.",
  },
  research: {
    path: "/research",
    title: `Research · ${NAME}`,
    description: "Publications by Sevan Brodjian, with papers and project pages.",
  },
  blog: {
    path: "/blog",
    title: `Blog · ${NAME}`,
    description: "Essays by Sevan Brodjian on science, consciousness and technology.",
  },
};

export const pageTitle = (title) => `${title} · ${NAME}`;
