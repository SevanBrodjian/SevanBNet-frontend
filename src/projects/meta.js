// Flagship projects: each has its own hand-built page under src/projects/<slug>/.
// Plain data so both the app and the build-time page generator (seo.ts) can read it.
// Earlier, smaller projects come from the API and use a shared template instead.

export const FLAGSHIPS = [
  {
    slug: "learning-taichi",
    title: "Learning Taichi",
    year: "2026",
    status: "Ongoing",
    line: "A research system that builds a project alongside you while teaching you along the way: an interactive textbook that writes itself from your interests and goals.",
    description:
      "An automated research harness that develops research alongside its user while teaching along the way, applied first to differentiable material simulation.",
  },
  {
    slug: "sonar-inverse-rendering",
    title: "Single-View Seafloor Recovery from Imaging Sonar",
    year: "2026",
    status: "CVPR 2026 Workshops",
    line: "A differentiable renderer for forward-looking sonar that recovers seafloor geometry from a single frame, with no training data.",
    description:
      "Single-View Seafloor Recovery from Imaging Sonar via Differentiable Rendering (CVPR 2026 PBVS Workshop).",
    // Old URL, permanently redirected here.
    legacyPath: "/papers/sonar-rendering",
  },
];

export const flagshipBySlug = Object.fromEntries(FLAGSHIPS.map((p) => [p.slug, p]));
