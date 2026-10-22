// Build-time pages for search engines and AI crawlers.
//
// The app renders in the browser, but many crawlers (notably the ones behind ChatGPT,
// Claude and Perplexity search) never run JavaScript. So for every top-level route the
// build writes a real HTML file with that page's title, description, canonical URL,
// structured data and a plain-HTML version of its content inside #root. React replaces
// that content when it mounts (createRoot clears #root), so visitors see the normal app.
// It also emits sitemap.xml, llms.txt, robots handling, and the serve.json that routes
// requests and returns real 404s.
//
// Content comes from src/site.js, the API at build time (content.ts, which falls back to
// the last good snapshot when the API is down) and the essays in content/writing/
// (src/writing/build.ts). Only what is visible in the control panel appears. Content
// edited there reaches these files on the next deploy (or "Rebuild site").

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import type { Content as ApiContent } from "./content.ts";
import { venueLine } from "./src/format.ts";
import { NAME, PAGES, PROFILES, pageTitle, REDIRECTS, ROLE, SITE_URL } from "./src/site.js";
import type { Paper, Project, Site } from "./src/types.ts";
import { staticPosts } from "./src/writing/build.ts";

type Post = ReturnType<typeof staticPosts>[number];
type Content = {
  site: Site;
  /** Every visible project, listed or not. */
  projects: Project[];
  papers: Paper[];
  /** Oldest first; `content` is the essay as HTML (no images, math as TeX). */
  posts: Post[];
  /** The script (and stylesheets) an essay's page loads, to fetch them with the page. */
  postAssets?: (slug: string) => string[];
};

type Page = {
  path: string;
  file: string;
  title: string;
  description: string;
  body: string;
  jsonLd?: object;
  extraHead?: string;
};

// The Sonar project page's header and abstract, kept in sync by hand with
// src/projects/sonar/Page.tsx (its title and code link come from the control panel).
const SONAR = {
  slug: "sonar-inverse-rendering",
  fullTitle: "Single-View Seafloor Recovery from Imaging Sonar via Differentiable Rendering",
  authors: ["Sevan Brodjian", "Michael Hobley", "Pietro Perona"],
  affiliation: "California Institute of Technology",
  venue: "PBVS Workshop · CVPR 2026",
  conference:
    "Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR) Workshops",
  year: "2026",
  pages: ["7008", "7017"],
  paper: "https://arxiv.org/abs/2605.24195",
  abstract: [
    "Forward-looking sonar (FLS) is often the only imaging modality available underwater. Each frame collapses vertical structure into a flat range-azimuth image, leaving scene elevation ambiguous. Existing 3D recovery pipelines typically require many views, multi-sensor rigs, or large quantities of labeled training data.",
    "We present a differentiable rendering system for forward-looking imaging sonar. The renderer models the full acquisition physics: acoustic ray casting through a 3D scene, beam geometry, surface reflectance, Gaussian range binning, and log-amplitude compression, all differentiable. This makes the system usable as a component in any gradient-based optimization or learning pipeline. We demonstrate it on recovering riverbed and seafloor geometry from a single sonar frame with no training data. Scene geometry is parameterized as an explicit height field and gradient descent drives the simulated image to match the real sensor reading. The system is grounded in real sensor parameters and transfers across hardware and environments without modification.",
  ],
};

// The page for "When Generative Models Act as Simulators", kept in sync by hand with
// src/projects/simulators/Page.tsx (an arXiv preprint: no conference or pages yet).
const SIMULATORS = {
  slug: "generative-models-as-simulators",
  fullTitle: "When Generative Models Act as Simulators",
  authors: ["Sevan Brodjian", "Michael Hobley", "Pietro Perona"],
  affiliation: "California Institute of Technology",
  venue: "arXiv 2026 · Preprint",
  date: "2026/10/09",
  paper: "https://arxiv.org/abs/2610.12847",
  pdf: "https://arxiv.org/pdf/2610.12847",
  description:
    "When a generative model trained on observations alone can be driven from a simulator’s state: probes, inverse maps and editability in Othello and Rayworld.",
  abstract: [
    "A simulator summarizes an environment in a state that users can read and change. Generative models learn representations of the world without explicit specification, but offer no built-in way to edit that world’s state. We investigate the conditions under which a generative model can act as a simulator through editability: whether changing a model’s latent representation produces the next-step outputs we get by editing a simulator’s state. Plainly stated, our goal is to find a mapping between a generative model’s latent state and the simulator state, where the model is trained on observations alone and the mapping is learned afterward.",
    "We test two kinds of mappings, both learned from observations paired with simulator states. In one, we train probes to decode the simulator state from the model, then steer along them. In the other, we learn the mapping directly with an inverse map, which can succeed even where steering fails. We study both in two contrasting environments: the discrete board game Othello, and Rayworld, our own continuous world of moving discs seen through partial renderings, closer to physical scenes and video.",
    "We find that which mapping succeeds depends strongly on the environment, even though the state is decodable in every variant. In Othello, editability falls smoothly as the game is simplified, and even small rule changes have large consequences. In Rayworld, probes fail to steer along the simulator’s continuous state, yet an inverse map sets the model from that state anyway. A model can therefore be driven by a simulator it may have never learned.",
  ],
};

// ---------------------------------------------------------------------------------
// Helpers

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// API text fields may contain HTML; reduce them to plain text.
const plain = (s: string | null | undefined) =>
  (s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[#a-z0-9]+;/gi, (e) => ENTITIES[e] ?? " ")
    .replace(/\s+/g, " ")
    .trim();

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// Only http(s) and same-site paths become links; anything else (e.g. javascript:) is text.
const safeHref = (href: string) => /^(https?:\/\/|\/(?!\/))/i.test(href);

const link = (href: string, text: string) =>
  safeHref(href) ? `<a href="${esc(href)}">${esc(text)}</a>` : esc(text);

// Rich-text API fields (project descriptions, post bodies) as plain paragraphs.
const paragraphs = (html: string | null | undefined) =>
  (html ?? "")
    .replace(/<(br|\/p|\/h[1-6]|\/li|\/div|\/blockquote|\/pre)\b[^>]*>/gi, "\n\n")
    .split(/\n\s*\n/)
    .map(plain)
    .filter(Boolean)
    .map((t) => `<p>${esc(t)}</p>`)
    .join("");

// Same format the Blog page shows; dates are calendar dates, so pin to UTC.
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: "UTC" });

// Slugs end up in serve.json route patterns, so only accept plain ones.
const plainSlug = (slug: string) => /^[\w-]+$/.test(slug);

const monthYear = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "long" })
    : null;

// When a project ran, as the app writes it (2023.03 – 2023.06, 2026.05 – Ongoing).
const ym = (iso: string) => iso.slice(0, 7).replace("-", ".");
function when(p: Project) {
  const start = p.start ?? p.end;
  if (!start) return "";
  if (!p.end) return `${ym(start)} – Ongoing`;
  return ym(start) === ym(p.end) ? ym(start) : `${ym(start)} – ${ym(p.end)}`;
}

const projectPath = (slug: string) => `/projects/${slug}`;
// QR short links (go.sevanb.net/r/...) log scans; keep crawlers off them.
const crawlable = (url: string | null) => (url && !url.includes("/r/") ? url : null);

// ---------------------------------------------------------------------------------
// Structured data (schema.org JSON-LD). Only facts stated on the site.

const PERSON_ID = `${SITE_URL}/#person`;

// The home and About descriptions, from Site settings (the control panel), so they change
// with the text instead of going stale in code: the home line, and the About text's first
// sentence. The fallbacks in site.js only cover an empty field.
function descriptions(site: Site) {
  const line = plain(site.home_line);
  const about = plain(site.about[0] ?? "");
  const first = (about.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? about).trim();
  return {
    home: line ? truncate(`${NAME}: ${line}`, 160) : PAGES.home.description,
    about: first ? truncate(first, 160) : PAGES.about.description,
    person: line || PAGES.home.description,
  };
}

const person = (site: Site) => ({
  "@type": "Person",
  "@id": PERSON_ID,
  name: NAME,
  url: `${SITE_URL}/`,
  image: `${SITE_URL}/headshot.jpg`,
  description: descriptions(site).person,
  jobTitle: ROLE.title,
  affiliation: {
    "@type": "CollegeOrUniversity",
    name: ROLE.institution,
    alternateName: ROLE.institutionShort,
    url: ROLE.institutionUrl,
    department: { "@type": "Organization", name: ROLE.department },
  },
  knowsAbout: [
    "Generative modeling",
    "Neural rendering",
    "Differentiable rendering",
    "Physically-based simulation",
    "Real-time graphics",
  ],
  sameAs: PROFILES.map((p) => p.url),
});

// ---------------------------------------------------------------------------------
// Page bodies: plain HTML versions of what each page shows.

const NAV = [
  { href: "/", text: "SevanB.net" },
  { href: "/projects", text: "Projects" },
  { href: "/papers", text: "Papers" },
  { href: "/writing", text: "Writing" },
  { href: "/about", text: "About" },
];

const nav = () =>
  `<nav><ul>${NAV.map((n) => `<li>${link(n.href, n.text)}</li>`).join("")}</ul></nav>`;

const profiles = () =>
  `<ul>${PROFILES.map((p) => `<li>${link(p.url, p.label)}</li>`).join("")}</ul>`;

const page = (inner: string) => `<div class="static-page">${nav()}<main>${inner}</main></div>`;

/** A project's one line for lists: its summary, or the start of its description. */
const summary = (p: Project, n: number) =>
  p.summary ? plain(p.summary) : truncate(plain(p.description_html ?? p.description), n);

function pages({ site, projects, papers, posts }: Content): Page[] {
  const projectItems = projects
    .filter((p) => p.listed)
    .map(
      (p) =>
        `<li><h2>${link(projectPath(p.slug), p.title)}</h2>` +
        (when(p) ? `<p>${esc(when(p))}</p>` : "") +
        (summary(p, 300) ? `<p>${esc(summary(p, 300))}</p>` : "") +
        "</li>",
    );

  const paperItems = papers.map((p) => {
    const meta = [venueLine(p), monthYear(p.date)];
    const links = [
      p.paper_url && link(p.paper_url, "Paper"),
      p.project
        ? link(projectPath(p.project.slug), "Project page")
        : crawlable(p.project_url) && link(p.project_url as string, "Project page"),
      p.code_url && link(p.code_url, "Code"),
    ].filter(Boolean);
    return (
      `<li><h2>${esc(p.title)}</h2>` +
      (p.authors ? `<p>${esc(p.authors)}</p>` : "") +
      `<p>${esc(meta.filter(Boolean).join(" · "))}</p>` +
      (p.description ? `<p>${esc(plain(p.description))}</p>` : "") +
      (links.length ? `<p>${links.join(" · ")}</p>` : "") +
      "</li>"
    );
  });

  // The Writing page lists newest first; posts come oldest first.
  const postItems = [...posts]
    .reverse()
    .map(
      (p) =>
        `<li><h2>${link(`/writing/${p.slug}`, p.title)}</h2>` +
        `<p>${esc(plain(p.description))}</p>` +
        `<p>${esc(day(p.date))}</p></li>`,
    );

  const d = descriptions(site);
  return [
    {
      ...PAGES.home,
      description: d.home,
      file: "index.html",
      body: page(`<p>${esc(`${NAME}. ${site.role}.`)}</p><h1>${esc(site.home_line)}</h1>`),
      jsonLd: {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebSite",
            "@id": `${SITE_URL}/#website`,
            url: `${SITE_URL}/`,
            name: NAME,
            alternateName: ["SevanB.net", "sevanb.net"],
            publisher: { "@id": PERSON_ID },
          },
          person(site),
        ],
      },
    },
    {
      ...PAGES.about,
      description: d.about,
      file: "about.html",
      body: page(
        `<h1>${esc(NAME)}</h1>` +
          `<p>${esc(`${ROLE.title}, ${ROLE.department}, ${ROLE.institution}`)}</p>` +
          site.about.map((t) => `<p>${esc(t)}</p>`).join("") +
          profiles(),
      ),
      jsonLd: {
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "ProfilePage", url: `${SITE_URL}/about`, mainEntity: { "@id": PERSON_ID } },
          person(site),
        ],
      },
    },
    {
      ...PAGES.projects,
      file: "projects.html",
      body: page(`<h1>Projects</h1><ul>${projectItems.join("")}</ul>`),
    },
    {
      ...PAGES.papers,
      file: "papers.html",
      body: page(`<h1>Papers</h1><ul>${paperItems.join("")}</ul>`),
    },
    {
      ...PAGES.writing,
      file: "writing.html",
      body: page(`<h1>Writing</h1><ul>${postItems.join("")}</ul>`),
    },
  ];
}

/** A project's page as plain HTML: the default page, or a hand-built page's own text. */
function projectPage(p: Project): Pick<Page, "title" | "description" | "body" | "extraHead"> {
  if (p.slug === SONAR.slug) {
    const links = [
      link(SONAR.paper, "Paper (arXiv)"),
      ...(p.source ? [link(p.source, "Code")] : []),
    ];
    return {
      title: p.title,
      description: truncate(SONAR.abstract[1], 160),
      body:
        `<div class="static-page"><main><p>${esc(SONAR.venue)}</p><h1>${esc(SONAR.fullTitle)}</h1>` +
        `<p>${esc(SONAR.authors.join(" · "))}</p><p>${esc(SONAR.affiliation)}</p>` +
        `<p>${links.join(" · ")}</p>` +
        `<h2>Abstract</h2>${SONAR.abstract.map((t) => `<p>${esc(t)}</p>`).join("")}</main></div>`,
      // Google Scholar indexing tags.
      extraHead: [
        `<meta name="citation_title" content="${esc(SONAR.fullTitle)}" />`,
        ...SONAR.authors.map((a) => `<meta name="citation_author" content="${esc(a)}" />`),
        `<meta name="citation_publication_date" content="${SONAR.year}" />`,
        `<meta name="citation_conference_title" content="${esc(SONAR.conference)}" />`,
        `<meta name="citation_firstpage" content="${SONAR.pages[0]}" />`,
        `<meta name="citation_lastpage" content="${SONAR.pages[1]}" />`,
      ].join("\n    "),
    };
  }
  if (p.slug === SIMULATORS.slug) {
    const S = SIMULATORS;
    const links = [link(S.paper, "Paper (arXiv)"), ...(p.source ? [link(p.source, "Code")] : [])];
    return {
      title: pageTitle(p.title),
      description: S.description,
      body:
        `<div class="static-page"><main><p>${esc(S.venue)}</p><h1>${esc(S.fullTitle)}</h1>` +
        `<p>${esc(S.authors.join(" · "))}</p><p>${esc(S.affiliation)}</p>` +
        `<p>${links.join(" · ")}</p>` +
        `<h2>Abstract</h2>${S.abstract.map((t) => `<p>${esc(t)}</p>`).join("")}</main></div>`,
      // Google Scholar indexing tags.
      extraHead: [
        `<meta name="citation_title" content="${esc(S.fullTitle)}" />`,
        ...S.authors.map((a) => `<meta name="citation_author" content="${esc(a)}" />`),
        `<meta name="citation_publication_date" content="${S.date}" />`,
        `<meta name="citation_pdf_url" content="${esc(S.pdf)}" />`,
      ].join("\n    "),
    };
  }
  const head =
    (when(p) ? `<p>${esc(when(p))}</p>` : "") +
    `<h1>${esc(p.title)}</h1>` +
    (p.summary ? `<p>${esc(plain(p.summary))}</p>` : "") +
    (p.source ? `<p>${link(p.source, "Code")}</p>` : "");
  return {
    title: pageTitle(p.title),
    description:
      truncate(plain(p.description_html ?? p.description), 160) ||
      (p.summary ? plain(p.summary) : PAGES.projects.description),
    // Learning Taichi's page is hand-built around its lab; its header says what it is.
    body: page(p.slug === "learning-taichi" ? head : head + paragraphs(p.description_html)),
  };
}

// Project and blog post pages. Written under _pages/ and reached through per-slug
// rewrites in serve.json: serve re-applies rewrites to their own output, so a file at
// projects/<slug>.html would be re-matched by the generic projects/:slug fallback.
function detailPages({ projects, posts, postAssets }: Content): Page[] {
  // Every visible project has a page, listed or not.
  const projectPages = projects
    .filter((p) => plainSlug(p.slug))
    .map((p) => ({
      path: projectPath(p.slug),
      file: `_pages/projects/${p.slug}.html`,
      ...projectPage(p),
    }));
  const postPages = posts
    .filter((p) => plainSlug(p.slug))
    .map((p) => ({
      path: `/writing/${p.slug}`,
      file: `_pages/writing/${p.slug}.html`,
      title: pageTitle(p.title),
      description: truncate(plain(p.description), 160),
      // The essay's own HTML, compiled and sanitized from Markdown at build time.
      body: page(`<h1>${esc(p.title)}</h1><p>${esc(day(p.date))}</p>${p.content}`),
      extraHead: (postAssets?.(p.slug) ?? [])
        .map((f) =>
          f.endsWith(".css")
            ? `<link rel="stylesheet" href="/${f}" />`
            : `<link rel="modulepreload" href="/${f}" />`,
        )
        .join("\n    "),
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: plain(p.title),
        datePublished: p.date,
        url: `${SITE_URL}/writing/${p.slug}`,
        author: { "@type": "Person", "@id": PERSON_ID, name: NAME, url: `${SITE_URL}/about` },
      },
    }));
  return [...projectPages, ...postPages];
}

// ---------------------------------------------------------------------------------
// HTML assembly. index.html carries a marked block that is swapped per page.

const HEAD_START = "<!-- page-head -->";
const HEAD_END = "<!-- /page-head -->";

function headTags(p: {
  title: string;
  description: string;
  path?: string;
  jsonLd?: object;
  extraHead?: string;
  noindex?: boolean;
}) {
  const url = p.path ? `${SITE_URL}${p.path}` : null;
  return [
    HEAD_START,
    // data-static: removed by src/main.jsx once React takes over the head.
    `<title data-static>${esc(p.title)}</title>`,
    `<meta name="description" content="${esc(p.description)}" />`,
    p.noindex && `<meta name="robots" content="noindex" />`,
    url && `<link rel="canonical" href="${url}" data-static />`,
    `<meta property="og:title" content="${esc(p.title)}" />`,
    `<meta property="og:description" content="${esc(p.description)}" />`,
    url && `<meta property="og:url" content="${url}" />`,
    p.jsonLd &&
      `<script type="application/ld+json">${JSON.stringify(p.jsonLd).replace(/</g, "\\u003c")}</script>`,
    p.extraHead,
    HEAD_END,
  ]
    .filter(Boolean)
    .join("\n    ");
}

function render(template: string, head: string, body = "") {
  const start = template.indexOf(HEAD_START);
  const end = template.indexOf(HEAD_END) + HEAD_END.length;
  if (start < 0 || end < HEAD_END.length) throw new Error("[seo] page-head markers missing");
  return (template.slice(0, start) + head + template.slice(end)).replace(
    '<div id="root"></div>',
    () => `<div id="root">${body}</div>`,
  );
}

// The page served for /projects/<slug>, /blog/<slug> and during development: generic
// head, no canonical (React adds the right one).

// ---------------------------------------------------------------------------------
// Text files

function sitemap(paths: string[]) {
  const urls = paths.map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

// https://llmstxt.org: a short Markdown map of the site for language models.
function llmsTxt({ site, projects, papers, posts }: Content) {
  const md = (s: string) => plain(s).replace(/([[\]])/g, "\\$1");
  const lines = [
    `# ${NAME}`,
    "",
    `> ${descriptions(site).home}`,
    "",
    `${ROLE.title} in ${ROLE.department}, ${ROLE.institution} (${ROLE.institutionShort}).`,
    "",
    "From the About page, in Sevan's words:",
    "",
    ...site.about.flatMap((t) => [t, ""]),
    "## Pages",
    "",
    `- [About](${SITE_URL}/about): background and research interests`,
    `- [Papers](${SITE_URL}/papers): publications`,
    `- [Projects](${SITE_URL}/projects): project write-ups with code`,
    `- [Writing](${SITE_URL}/writing): essays`,
  ];
  if (papers.length) {
    lines.push("", "## Publications", "");
    for (const p of papers) {
      // Every entry must be a link: its project page here, else the paper, else Papers.
      const url = p.project
        ? `${SITE_URL}${projectPath(p.project.slug)}`
        : (p.paper_url ?? `${SITE_URL}/papers`);
      const title = `[${md(p.title)}](${url})`;
      const meta = [p.authors, p.venue, p.status].filter(Boolean).join("; ");
      lines.push(`- ${title}${meta ? `: ${meta}` : ""}`);
    }
  }
  lines.push("", "## Projects", "");
  for (const p of projects.filter((q) => q.listed)) {
    const line = md(summary(p, 200));
    lines.push(`- [${md(p.title)}](${SITE_URL}${projectPath(p.slug)})${line ? `: ${line}` : ""}`);
  }
  if (posts.length) {
    lines.push("", "## Writing", "");
    for (const p of [...posts].reverse())
      lines.push(`- [${md(p.title)}](${SITE_URL}/writing/${p.slug})`);
  }
  lines.push("", "## Elsewhere", "", ...PROFILES.map((p) => `- [${p.label}](${p.url})`), "");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------
// The plugin

export function sitePages({
  content: api,
  indexable,
}: {
  content: ApiContent;
  indexable: boolean;
}): Plugin {
  const securityHeaders = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Strict-Transport-Security", value: "max-age=31536000" },
    // Preview builds stay viewable but out of search results. robots.txt deliberately
    // allows crawling: a crawler has to fetch a page to see its noindex and drop it.
    ...(indexable ? [] : [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]),
  ];

  let outDir = "dist";
  return {
    name: "site-pages",
    enforce: "post",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    // A lab exported into public/lab/<name>/ (see src/projects/learning-taichi/Lab.tsx)
    // uses relative paths, but serve's cleanUrls/trailingSlash answer it at
    // /lab/<name> with no slash, where "./assets" would mean /lab/assets. Pin its base.
    closeBundle() {
      const labs = resolve(outDir, "lab");
      if (!existsSync(labs)) return;
      for (const name of readdirSync(labs)) {
        const file = resolve(labs, name, "index.html");
        if (!existsSync(file)) continue;
        const html = readFileSync(file, "utf8");
        if (!html.includes("<base "))
          writeFileSync(file, html.replace("<head>", `<head>\n    <base href="/lab/${name}/" />`));
      }
    },
    transformIndexHtml(html) {
      const shellHead = headTags({ title: NAME, description: descriptions(api.site).home });
      const withHead = html.replace(/<!-- page-head -->[\s\S]*?<!-- \/page-head -->/, shellHead);
      return indexable
        ? withHead
        : withHead.replace(
            "<head>",
            '<head>\n    <meta name="robots" content="noindex, nofollow" />',
          );
    },
    async generateBundle(_options, bundle) {
      const asset = bundle["index.html"];
      if (asset?.type !== "asset") throw new Error("[seo] index.html not in bundle");
      // The type every page uses, asked for with the page so text rarely re-flows when it
      // arrives; the serif too on the pages that read in it.
      const fontFile = (re: RegExp) =>
        Object.values(bundle).find((c) => c.type === "asset" && re.test(c.fileName))?.fileName;
      const fontTag = (f: string | undefined) =>
        f ? `<link rel="preload" as="font" type="font/woff2" crossorigin href="/${f}" />` : "";
      const sans = fontTag(fontFile(/archivo-latin-wdth-normal-[\w-]+\.woff2$/));
      const serif = fontTag(fontFile(/source-serif-4-latin-opsz-normal-[\w-]+\.woff2$/));
      const template = String(asset.source).replace("<head>", `<head>\n    ${sans}`);

      // Each essay's chunk (virtual:writing/post/<slug>, see src/writing/build.ts).
      const postAssets = (slug: string) => {
        for (const c of Object.values(bundle))
          if (c.type === "chunk" && c.facadeModuleId === `\0virtual:writing/post/${slug}`)
            return [c.fileName, ...(c.viteMetadata?.importedCss ?? [])];
        return [];
      };
      const content: Content = {
        site: api.site,
        projects: api.projects,
        papers: api.papers,
        posts: staticPosts(api.posts),
        postAssets,
      };
      const emit = (fileName: string, source: string) =>
        this.emitFile({ type: "asset", fileName, source });

      // Each page's own code (pages load lazily, see src/routes.ts): asked for with the
      // page, so the app does not wait for the main script to discover it. crossorigin
      // matches how Vite's loader asks for them, so the preloads are reused.
      const entry = Object.values(bundle).find((c) => c.type === "chunk" && c.isEntry);
      const loaded = new Set(entry?.type === "chunk" ? [entry.fileName, ...entry.imports] : []);
      const chunkOf = (file: string) => {
        for (const c of Object.values(bundle))
          if (c.type === "chunk" && c.facadeModuleId?.endsWith(file)) return c;
        return null;
      };
      const ROUTE_FILES: [RegExp, string[]][] = [
        [/^\/projects$/, ["/src/pages/Projects.tsx"]],
        [
          /^\/projects\/learning-taichi$/,
          ["/src/pages/ProjectPage.tsx", "/src/projects/learning-taichi/Page.tsx"],
        ],
        [
          /^\/projects\/sonar-inverse-rendering$/,
          ["/src/pages/ProjectPage.tsx", "/src/projects/sonar/Page.tsx"],
        ],
        [
          /^\/projects\/generative-models-as-simulators$/,
          ["/src/pages/ProjectPage.tsx", "/src/projects/simulators/Page.tsx"],
        ],
        [/^\/projects\//, ["/src/pages/ProjectPage.tsx"]],
        [/^\/papers$/, ["/src/pages/Papers.tsx"]],
        [/^\/writing$/, ["/src/pages/Writing.tsx"]],
        [/^\/writing\//, ["/src/pages/Essay.tsx"]],
        [/^\/about$/, ["/src/pages/About.tsx"]],
      ];
      const routeHead = (path: string) => {
        const files = ROUTE_FILES.find(([re]) => re.test(path))?.[1] ?? [];
        const js = new Set<string>();
        const css = new Set<string>();
        for (const f of files) {
          const c = chunkOf(f);
          if (!c) continue;
          for (const name of [c.fileName, ...c.imports]) if (!loaded.has(name)) js.add(name);
          for (const name of c.viteMetadata?.importedCss ?? []) css.add(name);
        }
        const reads = /^\/(about|writing|projects\/)/.test(path);
        return [
          reads ? serif : "",
          ...[...css].map((f) => `<link rel="preload" as="style" crossorigin href="/${f}" />`),
          ...[...js].map((f) => `<link rel="modulepreload" crossorigin href="/${f}" />`),
        ]
          .filter(Boolean)
          .join("\n    ");
      };

      // index.html (home) is replaced in place; Vite has already emitted it.
      const details = detailPages(content);
      const all = [...pages(content), ...details].map((p) => ({
        ...p,
        extraHead: [p.extraHead, routeHead(p.path)].filter(Boolean).join("\n    "),
      }));
      for (const p of all) {
        const html = render(template, headTags(p), p.body);
        if (p.file === "index.html") asset.source = html;
        else emit(p.file, html);
      }
      emit("_shell.html", template);
      emit(
        "404.html",
        render(
          template,
          headTags({
            title: `Not found · ${NAME}`,
            description: descriptions(content.site).home,
            noindex: true,
          }),
          page("<h1>Page not found</h1>"),
        ),
      );

      emit("sitemap.xml", sitemap(all.map((p) => p.path)));
      emit("llms.txt", llmsTxt(content));
      emit(
        "serve.json",
        JSON.stringify({
          cleanUrls: true,
          trailingSlash: false,
          directoryListing: false,
          rewrites: [
            // Known pages first; the generic fallback covers projects published since the
            // last deploy (served the app shell until the next build includes it). Essays
            // only exist once deployed, so an unknown essay is a real 404.
            ...all
              .filter((p) => p.file.startsWith("_pages/"))
              .map((p) => ({ source: p.path.slice(1), destination: `/${p.file}` })),
            { source: "projects/:slug", destination: "/_shell.html" },
          ],
          redirects: [
            { source: "/home", destination: "/", type: 301 },
            // Old URLs from before the 2026 redesign.
            { source: "/blog", destination: "/writing", type: 301 },
            { source: "/blog/:slug", destination: "/writing/:slug", type: 301 },
            { source: "/research", destination: "/papers", type: 301 },
            ...REDIRECTS.map((r) => ({ source: r.from, destination: r.to, type: 301 })),
            { source: "/_shell", destination: "/", type: 301 },
            { source: "/_pages/**", destination: "/", type: 301 },
          ],
          headers: [
            { source: "**", headers: securityHeaders },
            {
              source: "assets/**",
              headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
            },
          ],
        }),
      );
    },
  };
}
