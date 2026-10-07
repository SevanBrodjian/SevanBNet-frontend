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
// Content comes from src/site.js, the essays in content/writing/ (src/writing/build.ts)
// and, best effort, from the API at build time. If the API is unreachable the build still
// succeeds without its parts. Content edited in the admin reaches these files on the next
// deploy.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { FLAGSHIPS } from "./src/projects/meta.js";
import { ABOUT, LINE, NAME, PAGES, PROFILES, pageTitle, ROLE, SITE_URL } from "./src/site.js";
import { staticPosts } from "./src/writing/build.ts";

type Project = {
  title: string;
  slug: string;
  start: string;
  end: string | null;
  description: string | null;
  link: string | null;
};
type Publication = {
  title: string;
  authors_str: string | null;
  status: string;
  journal_name: string | null;
  description: string | null;
  url: string | null;
  doi: string | null;
  site_path: string | null;
  project_url: string | null;
  publication_date: string | null;
  submission_date: string | null;
};
type Post = {
  title: string;
  slug: string;
  description: string;
  content: string;
  published_date: string;
};
type Content = {
  projects: Project[];
  publications: Publication[];
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

// The paper page's header and abstract, kept in sync by hand with
// src/projects/sonar/Page.tsx.
const SONAR = {
  path: "/projects/sonar-inverse-rendering",
  pageTitle: "Single-View Seafloor Recovery from Imaging Sonar",
  fullTitle: "Single-View Seafloor Recovery from Imaging Sonar via Differentiable Rendering",
  authors: ["Sevan Brodjian", "Michael Hobley", "Pietro Perona"],
  affiliation: "California Institute of Technology",
  venue: "PBVS Workshop · CVPR 2026",
  conference:
    "Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR) Workshops",
  year: "2026",
  pages: ["7008", "7017"],
  links: [
    { label: "Paper (arXiv)", url: "https://arxiv.org/abs/2605.24195" },
    { label: "Code", url: "https://github.com/SevanBrodjian/sonar-inverse-rendering" },
  ],
  abstract: [
    "Forward-looking sonar (FLS) is often the only imaging modality available underwater. Each frame collapses vertical structure into a flat range-azimuth image, leaving scene elevation ambiguous. Existing 3D recovery pipelines typically require many views, multi-sensor rigs, or large quantities of labeled training data.",
    "We present a differentiable rendering system for forward-looking imaging sonar. The renderer models the full acquisition physics: acoustic ray casting through a 3D scene, beam geometry, surface reflectance, Gaussian range binning, and log-amplitude compression, all differentiable. This makes the system usable as a component in any gradient-based optimization or learning pipeline. We demonstrate it on recovering riverbed and seafloor geometry from a single sonar frame with no training data. Scene geometry is parameterized as an explicit height field and gradient descent drives the simulated image to match the real sensor reading. The system is grounded in real sensor parameters and transfers across hardware and environments without modification.",
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
  iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long" }) : null;

// Publications that moved into Projects keep their old site_path; map it to the new page.
const MOVED = Object.fromEntries(
  FLAGSHIPS.filter((f) => f.legacyPath).map((f) => [f.legacyPath, `/projects/${f.slug}`]),
);
const sitePath = (p: Publication) => (p.site_path ? (MOVED[p.site_path] ?? p.site_path) : null);

const paperUrl = (p: Publication) => p.url ?? (p.doi ? `https://doi.org/${p.doi}` : null);

async function fetchJson<T>(apiUrl: string, path: string): Promise<T[]> {
  try {
    const response = await fetch(`${apiUrl}/api/${path}`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("response is not a list");
    return data as T[];
  } catch (error) {
    console.warn(`[seo] could not fetch ${path} from ${apiUrl}: ${error}. Continuing without it.`);
    return [];
  }
}

// ---------------------------------------------------------------------------------
// Structured data (schema.org JSON-LD). Only facts stated on the site.

const PERSON_ID = `${SITE_URL}/#person`;

const person = {
  "@type": "Person",
  "@id": PERSON_ID,
  name: NAME,
  url: `${SITE_URL}/`,
  image: `${SITE_URL}/headshot.jpg`,
  description: PAGES.about.description,
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
};

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

function pages({ projects, publications, posts }: Content): Page[] {
  const projectItems = projects.map(
    (p) =>
      `<li><h2>${link(`/projects/${p.slug}`, p.title)}</h2>` +
      `<p>${esc(p.end ? `Project closed on ${p.end}` : "Ongoing Project")}</p>` +
      (p.description ? `<p>${esc(truncate(plain(p.description), 300))}</p>` : "") +
      "</li>",
  );

  const publicationItems = publications.map((p) => {
    const meta = [p.status, p.journal_name, monthYear(p.publication_date ?? p.submission_date)];
    const links = [
      paperUrl(p) && link(paperUrl(p) as string, "Paper"),
      // QR short links (go.sevanb.net/r/...) log scans; keep crawlers off them.
      p.project_url && !p.project_url.includes("/r/") && link(p.project_url, "Project page"),
      sitePath(p) && link(sitePath(p) as string, "View on site"),
    ].filter(Boolean);
    return (
      `<li><h2>${esc(p.title)}</h2>` +
      (p.authors_str ? `<p>${esc(p.authors_str)}</p>` : "") +
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
        `<p>${esc(day(p.published_date))}</p></li>`,
    );

  const flagshipItems = FLAGSHIPS.map(
    (f) =>
      `<li><h2>${link(`/projects/${f.slug}`, f.title)}</h2>` +
      `<p>${esc(`${f.year} · ${f.status}`)}</p><p>${esc(f.line)}</p></li>`,
  ).join("");
  const taichi = FLAGSHIPS.find((f) => f.slug === "learning-taichi");

  return [
    ...(taichi
      ? [
          {
            path: `/projects/${taichi.slug}`,
            file: `_pages/projects/${taichi.slug}.html`,
            title: pageTitle(taichi.title),
            description: taichi.description,
            body: page(
              `<p>${esc(`${taichi.year} · ${taichi.status}`)}</p><h1>${esc(taichi.title)}</h1><p>${esc(taichi.line)}</p>`,
            ),
          },
        ]
      : []),
    {
      ...PAGES.home,
      file: "index.html",
      body: page(
        `<p>${esc(`${NAME}. ${ROLE.title}, ${ROLE.department}, ${ROLE.institutionShort}.`)}</p><h1>${esc(LINE)}</h1>`,
      ),
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
          person,
        ],
      },
    },
    {
      ...PAGES.about,
      file: "about.html",
      body: page(
        `<h1>${esc(NAME)}</h1><p>${esc(ABOUT.subtitle)}</p>` +
          ABOUT.paragraphs.map((t) => `<p>${esc(t)}</p>`).join("") +
          profiles(),
      ),
      jsonLd: {
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "ProfilePage", url: `${SITE_URL}/about`, mainEntity: { "@id": PERSON_ID } },
          person,
        ],
      },
    },
    {
      ...PAGES.projects,
      file: "projects.html",
      body: page(
        `<h1>Projects</h1><ul>${flagshipItems}</ul><h2>Earlier</h2><ul>${projectItems.join("")}</ul>`,
      ),
    },
    {
      ...PAGES.papers,
      file: "papers.html",
      body: page(`<h1>Papers</h1><ul>${publicationItems.join("")}</ul>`),
    },
    {
      ...PAGES.writing,
      file: "writing.html",
      body: page(`<h1>Writing</h1><ul>${postItems.join("")}</ul>`),
    },
    {
      path: SONAR.path,
      file: "_pages/projects/sonar-inverse-rendering.html",
      title: SONAR.pageTitle,
      description: truncate(SONAR.abstract[1], 160),
      body:
        `<div class="static-page"><main><p>${esc(SONAR.venue)}</p><h1>${esc(SONAR.fullTitle)}</h1>` +
        `<p>${esc(SONAR.authors.join(" · "))}</p><p>${esc(SONAR.affiliation)}</p>` +
        `<p>${SONAR.links.map((l) => link(l.url, l.label)).join(" · ")}</p>` +
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
    },
  ];
}

// Project and blog post pages. Written under _pages/ and reached through per-slug
// rewrites in serve.json: serve re-applies rewrites to their own output, so a file at
// projects/<slug>.html would be re-matched by the generic projects/:slug fallback.
function detailPages({ projects, posts, postAssets }: Content): Page[] {
  const projectPages = projects
    .filter((p) => plainSlug(p.slug))
    .map((p) => ({
      path: `/projects/${p.slug}`,
      file: `_pages/projects/${p.slug}.html`,
      title: pageTitle(p.title),
      description: truncate(plain(p.description), 160) || PAGES.projects.description,
      body: page(
        `<h1>${esc(p.title)}</h1>` +
          `<p>${esc(`${p.start} - ${p.end ?? "Present (ongoing)"}`)}</p>` +
          (p.link ? `<p>${link(p.link, "Project Source")}</p>` : "") +
          `<h2>Description</h2>${paragraphs(p.description)}`,
      ),
    }));
  const postPages = posts
    .filter((p) => plainSlug(p.slug))
    .map((p) => ({
      path: `/writing/${p.slug}`,
      file: `_pages/writing/${p.slug}.html`,
      title: pageTitle(p.title),
      description: truncate(plain(p.description), 160),
      // The essay's own HTML, compiled and sanitized from Markdown at build time.
      body: page(`<h1>${esc(p.title)}</h1><p>${esc(day(p.published_date))}</p>${p.content}`),
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
        datePublished: p.published_date,
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
const SHELL_HEAD = headTags({ title: NAME, description: PAGES.home.description });

// ---------------------------------------------------------------------------------
// Text files

function sitemap(paths: string[]) {
  const urls = paths.map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

// https://llmstxt.org: a short Markdown map of the site for language models.
function llmsTxt({ projects, publications, posts }: Content) {
  const md = (s: string) => plain(s).replace(/([[\]])/g, "\\$1");
  const lines = [
    `# ${NAME}`,
    "",
    `> ${PAGES.home.description}`,
    "",
    `${ROLE.title} in ${ROLE.department}, ${ROLE.institution} (${ROLE.institutionShort}).`,
    "",
    "From the About page, in Sevan's words:",
    "",
    ...ABOUT.paragraphs.flatMap((t) => [t, ""]),
    "## Pages",
    "",
    `- [About](${SITE_URL}/about): background and research interests`,
    `- [Papers](${SITE_URL}/papers): publications`,
    `- [Projects](${SITE_URL}/projects): project write-ups with code`,
    `- [Writing](${SITE_URL}/writing): essays`,
  ];
  if (publications.length) {
    lines.push("", "## Publications", "");
    for (const p of publications) {
      // Every entry must be a link; papers without one point at the Research page.
      const url = sitePath(p) ? `${SITE_URL}${sitePath(p)}` : (paperUrl(p) ?? `${SITE_URL}/papers`);
      const title = `[${md(p.title)}](${url})`;
      const meta = [p.authors_str, p.journal_name, p.status].filter(Boolean).join("; ");
      lines.push(`- ${title}${meta ? `: ${meta}` : ""}`);
    }
  }
  lines.push("", "## Projects", "");
  for (const f of FLAGSHIPS)
    lines.push(`- [${md(f.title)}](${SITE_URL}/projects/${f.slug}): ${md(f.line)}`);
  for (const p of projects) {
    const summary = truncate(plain(p.description), 200);
    lines.push(
      `- [${md(p.title)}](${SITE_URL}/projects/${p.slug})${summary ? `: ${summary}` : ""}`,
    );
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

export function sitePages({ apiUrl, indexable }: { apiUrl: string; indexable: boolean }): Plugin {
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
      const withHead = html.replace(/<!-- page-head -->[\s\S]*?<!-- \/page-head -->/, SHELL_HEAD);
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

      const [projects, publications] = await Promise.all([
        fetchJson<Project>(apiUrl, "projects/"),
        fetchJson<Publication>(apiUrl, "publications/"),
      ]);
      // Each essay's chunk (virtual:writing/post/<slug>, see src/writing/build.ts).
      const postAssets = (slug: string) => {
        for (const c of Object.values(bundle))
          if (c.type === "chunk" && c.facadeModuleId === `\0virtual:writing/post/${slug}`)
            return [c.fileName, ...(c.viteMetadata?.importedCss ?? [])];
        return [];
      };
      const content = { projects, publications, posts: staticPosts(), postAssets };
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
            description: PAGES.home.description,
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
            ...FLAGSHIPS.filter((f) => f.legacyPath).map((f) => ({
              source: f.legacyPath,
              destination: `/projects/${f.slug}`,
              type: 301,
            })),
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
