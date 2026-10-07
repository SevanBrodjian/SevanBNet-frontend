// Flagship projects: each has its own hand-built page under src/projects/<slug>/.
// Plain data so both the app and the build-time page generator (seo.ts) can read it.
// Earlier, smaller projects come from the API and use a shared template instead
// (their images and one-line descriptions live in ./earlier.ts).

export const FLAGSHIPS = [
  {
    slug: "learning-taichi",
    title: "Learning Taichi",
    year: "2026",
    // First commit, 2026-05-17.
    start: "2026-05",
    status: "Ongoing",
    line: "An automated research system that develops a project alongside its user and teaches them as it goes, like a textbook that writes itself.",
    description:
      "An automated research system that develops a project alongside its user while teaching them, like a textbook that writes itself. Its first project is differentiable simulation.",
  },
  {
    slug: "sonar-inverse-rendering",
    title: "Single-View Seafloor Recovery from Imaging Sonar",
    year: "2026",
    status: "CVPR 2026 Workshops",
    line: "A differentiable sonar renderer that recovers seafloor geometry from a single frame, with no training data.",
    description:
      "Single-View Seafloor Recovery from Imaging Sonar via Differentiable Rendering (CVPR 2026 PBVS Workshop).",
    // Old URL, permanently redirected here.
    legacyPath: "/papers/sonar-rendering",
  },
];

export const flagshipBySlug = Object.fromEntries(FLAGSHIPS.map((p) => [p.slug, p]));
