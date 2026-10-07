// Essays are Markdown files in content/writing/, compiled when the site is built.
//
// The browser gets HTML, never a Markdown parser:
// - `virtual:writing` lists every post (title, date, description) and how to load each one;
// - `virtual:writing/post/<slug>` is one small chunk per post: its HTML, with images
//   imported through Vite (hashed URLs) and KaTeX's stylesheet only when the post has math.
// seo.ts uses `staticPosts()` for the crawler pages, the sitemap and llms.txt.
//
// Supported: CommonMark + GFM (tables, footnotes, strikethrough), $math$ and $$math$$,
// images next to the post, Obsidian embeds (![[image.png]], ![[image.png|300]]), wikilinks
// to other posts ([[slug]], [[Title|text]]) and %%comments%% (dropped). Raw HTML is
// allowed but sanitized. See content/writing/README.md.
//
// Node only: imported by vite.config.ts and seo.ts, never by the app.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import type { Element, ElementContent, Root as HastRoot, Parents } from "hast";
import { imageSize } from "image-size";
import katex from "katex";
import type { Image, Link, Root as MdRoot, PhrasingContent, Text } from "mdast";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { SKIP, visit } from "unist-util-visit";
import type { Plugin } from "vite";
import { parse as parseYaml } from "yaml";

export const CONTENT_DIR = resolve(import.meta.dirname, "../../content/writing");

export type PostMeta = {
  slug: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** The full description from the front matter (paragraphs separated by a blank line). */
  description: string;
  /** The description as one short paragraph, for the list and the essay's header. */
  dek: string;
  series?: string;
};

type Source = PostMeta & { file: string; body: string; draft: boolean };

const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const VIDEO = /\.(mp4|webm|mov|m4v)$/i;
const plainSlug = (s: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
const slugify = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// ---------------------------------------------------------------------------------
// Reading the files

function splitFrontMatter(text: string, file: string) {
  const m = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`[writing] ${file}: missing front matter (--- title, date ... ---)`);
  const data = parseYaml(m[1]) as Record<string, unknown> | null;
  return { data: data ?? {}, body: m[2] };
}

const asDate = (v: unknown) => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
};

const paras = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

/** One short paragraph: the first; if that is only a line, add the next one's first sentence. */
export function dekOf(description: string) {
  const ps = paras(description);
  if (!ps.length) return "";
  if (ps[0].length >= 60 || !ps[1]) return ps[0];
  const first = ps[1].match(/^.+?[.!?](?=\s|$)/);
  return `${ps[0]} ${first ? first[0] : ps[1]}`;
}

/** Every post, newest first. Drafts only when `drafts` is true. */
export function readPosts(drafts = false): Source[] {
  if (!existsSync(CONTENT_DIR)) return [];
  const out: Source[] = [];
  for (const name of readdirSync(CONTENT_DIR)) {
    if (!name.endsWith(".md") || name.toLowerCase() === "readme.md") continue;
    const file = join(CONTENT_DIR, name);
    const { data, body } = splitFrontMatter(readFileSync(file, "utf8"), name);
    const title = String(data.title ?? "").trim();
    const date = asDate(data.date);
    const description = String(data.description ?? "").trim();
    const slug = String(data.slug ?? "").trim() || slugify(basename(name, ".md"));
    if (!title) throw new Error(`[writing] ${name}: front matter needs a title`);
    if (!date) throw new Error(`[writing] ${name}: front matter needs date: YYYY-MM-DD`);
    if (!description) throw new Error(`[writing] ${name}: front matter needs a description`);
    if (!plainSlug(slug))
      throw new Error(`[writing] ${name}: slug "${slug}" must be lowercase words and dashes`);
    const draft = data.draft === true;
    if (draft && !drafts) continue;
    out.push({
      slug,
      title,
      date,
      description,
      dek: dekOf(description),
      series: data.series ? String(data.series).trim() : undefined,
      file,
      body,
      draft,
    });
  }
  const seen = new Set<string>();
  for (const p of out) {
    if (seen.has(p.slug)) throw new Error(`[writing] two posts have the slug "${p.slug}"`);
    seen.add(p.slug);
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

// ---------------------------------------------------------------------------------
// Markdown to HTML

type Compiled = { html: string; assets: string[]; math: boolean };

/** Obsidian comments (%%...%%) are private notes: drop them, except inside code. */
function dropComments(md: string) {
  return md
    .split(/(^```[\s\S]*?^```|^~~~[\s\S]*?^~~~|`[^`\n]*`)/m)
    .map((part, i) => (i % 2 ? part : part.replace(/%%[\s\S]*?%%/g, "")))
    .join("");
}

/** ![[file]] and [[link]]: Obsidian's embeds and wikilinks become ordinary nodes. */
function remarkObsidian(posts: PostMeta[]) {
  const bySlug = new Map(posts.map((p) => [p.slug, p]));
  const byTitle = new Map(posts.map((p) => [p.title.toLowerCase(), p]));
  const RE = /(!?)\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|([^\]\n]*))?\]\]/g;
  return () => (tree: MdRoot) => {
    visit(tree, "text", (node: Text, index, parent) => {
      if (!parent || index === undefined || !node.value.includes("[[")) return;
      const parts: PhrasingContent[] = [];
      let last = 0;
      for (const m of node.value.matchAll(RE)) {
        const at = m.index ?? 0;
        if (at > last) parts.push({ type: "text", value: node.value.slice(last, at) });
        last = at + m[0].length;
        const target = m[2].trim();
        const extra = m[3]?.trim() ?? "";
        if (m[1] && (IMAGE.test(target) || VIDEO.test(target))) {
          const size = extra.match(/^(\d+)(?:x(\d+))?$/);
          const img: Image = {
            type: "image",
            url: encodeURI(target),
            alt: size ? "" : extra,
            data: size ? { hProperties: { dataWidth: size[1] } } : undefined,
          };
          parts.push(img);
          continue;
        }
        const post = bySlug.get(slugify(target)) ?? byTitle.get(target.toLowerCase());
        const text = extra || (post ? post.title : target);
        if (post) {
          const link: Link = {
            type: "link",
            url: `/writing/${post.slug}`,
            children: [{ type: "text", value: text }],
          };
          parts.push(link);
        } else parts.push({ type: "text", value: text });
      }
      if (!parts.length) return;
      if (last < node.value.length) parts.push({ type: "text", value: node.value.slice(last) });
      parent.children.splice(index, 1, ...parts);
      return [SKIP, index + parts.length];
    });
  };
}

const textOf = (n: ElementContent | Element): string =>
  n.type === "text"
    ? n.value
    : n.type === "element"
      ? n.children.map((c) => textOf(c as ElementContent)).join("")
      : "";

const classes = (el: Element) => {
  const c: unknown = el.properties.className;
  return Array.isArray(c) ? c.map(String) : typeof c === "string" ? c.split(/\s+/) : [];
};

const ASSET = (i: number) => `__WRITING_ASSET_${i}__`;

/** Find a file an essay refers to: next to it, in a folder named after it, or in assets/. */
function findAsset(src: string, post: Source) {
  const name = decodeURI(src).replace(/^\.\//, "");
  const stem = basename(post.file, ".md");
  const candidates = [
    resolve(dirname(post.file), name),
    resolve(CONTENT_DIR, stem, name),
    resolve(CONTENT_DIR, post.slug, name),
    resolve(CONTENT_DIR, "assets", name),
  ];
  for (const c of candidates) {
    if (!relative(CONTENT_DIR, c).startsWith("..") && existsSync(c) && statSync(c).isFile())
      return c;
  }
  return null;
}

type Mode = "app" | "static";

/** After sanitizing: math, images, links, headings and quotes. */
function rehypeEssay(post: Source, mode: Mode, out: Compiled) {
  return () => (tree: HastRoot) => {
    const ids = new Set<string>();
    visit(tree, "element", (el: Element, index, parent: Parents | undefined) => {
      if (!parent || index === undefined) return;
      const tag = el.tagName;

      // $math$ and $$math$$ (remark-math leaves them as code.language-math).
      if (tag === "code" && classes(el).includes("language-math")) {
        const display = parent.type === "element" && parent.tagName === "pre";
        const tex = textOf(el);
        const target = display ? parent : el;
        if (mode === "static") {
          const value = display ? `$$${tex}$$` : `$${tex}$`;
          if (display && parent.type === "element") {
            parent.tagName = "p";
            parent.properties = {};
            parent.children = [{ type: "text", value }];
          } else parent.children.splice(index, 1, { type: "text", value });
          return SKIP;
        }
        out.math = true;
        const html = katex.renderToString(tex, {
          displayMode: display,
          throwOnError: false,
          output: "htmlAndMathml",
        });
        if (target === el) {
          parent.children.splice(index, 1, { type: "raw", value: html } as never);
        } else if (parent.type === "element") {
          parent.tagName = "div";
          parent.properties = { className: ["math"] };
          parent.children = [{ type: "raw", value: html } as never];
        }
        return SKIP;
      }

      if (tag === "img") {
        const src = String(el.properties.src ?? "");
        const width = el.properties.dataWidth ? Number(el.properties.dataWidth) : null;
        delete el.properties.dataWidth;
        if (mode === "static") {
          parent.children.splice(index, 1);
          return [SKIP, index];
        }
        if (!/^(https?:)?\/\//i.test(src) && !src.startsWith("/")) {
          const file = findAsset(src, post);
          if (!file)
            throw new Error(
              `[writing] ${basename(post.file)}: image "${decodeURI(src)}" not found next to the post, in content/writing/${basename(post.file, ".md")}/ or in content/writing/assets/`,
            );
          out.assets.push(file);
          el.properties.src = ASSET(out.assets.length - 1);
          if (VIDEO.test(file)) {
            el.tagName = "video";
            el.properties = {
              src: el.properties.src,
              muted: true,
              loop: true,
              playsInline: true,
              preload: "metadata",
              ariaLabel: String(el.properties.alt ?? "") || undefined,
              ...(width ? { width } : {}),
            };
            return SKIP;
          }
          if (IMAGE.test(file) && !file.endsWith(".svg")) {
            try {
              const size = imageSize(readFileSync(file));
              if (size.width && size.height) {
                el.properties.width = width ?? size.width;
                el.properties.height = width
                  ? Math.round((width * size.height) / size.width)
                  : size.height;
              }
            } catch {
              // Unknown format: the browser sizes it.
            }
          }
        }
        if (width && !el.properties.width) el.properties.width = width;
        el.properties.alt = String(el.properties.alt ?? "");
        el.properties.loading = "lazy";
        el.properties.decoding = "async";
        // An image alone in its paragraph is a figure; its title is the caption.
        if (
          parent.type === "element" &&
          parent.tagName === "p" &&
          parent.children.every((c) => c === el || (c.type === "text" && !c.value.trim()))
        ) {
          const title = el.properties.title ? String(el.properties.title) : "";
          delete el.properties.title;
          parent.tagName = "figure";
          parent.children = [
            el,
            ...(title
              ? [
                  {
                    type: "element",
                    tagName: "figcaption",
                    properties: {},
                    children: [{ type: "text", value: title }],
                  } as Element,
                ]
              : []),
          ];
        }
        return SKIP;
      }

      // Links that leave the site open a new tab and say so.
      if (tag === "a") {
        const href = String(el.properties.href ?? "");
        if (/^https?:\/\//i.test(href) && !/^https?:\/\/(www\.)?sevanb\.net(\/|$)/i.test(href)) {
          el.properties.target = "_blank";
          el.properties.rel = ["noopener", "noreferrer"];
          if (mode === "app")
            el.children.push(
              {
                type: "element",
                tagName: "span",
                properties: { className: ["ext-mark"], ariaHidden: "true" },
                children: [{ type: "text", value: "↗" }],
              },
              {
                type: "element",
                tagName: "span",
                properties: { className: ["vh"] },
                children: [{ type: "text", value: " (opens in a new tab)" }],
              },
            );
        }
        return;
      }

      // Headings get ids, so a section can be linked to.
      if ((tag === "h2" || tag === "h3") && !el.properties.id) {
        const base = slugify(textOf(el)) || "section";
        let id = base;
        for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
        ids.add(id);
        el.properties.id = id;
        return;
      }

      // A quote's last paragraph that starts with a dash is its attribution.
      if (tag === "blockquote") {
        const ps = el.children.filter((c): c is Element => c.type === "element");
        const lastP = ps[ps.length - 1];
        if (ps.length > 1 && lastP.tagName === "p" && /^\s*(—|--)/.test(textOf(lastP)))
          lastP.properties.className = ["attr"];
      }
    });
  };
}

const SCHEMA = {
  ...defaultSchema,
  // Footnote ids are prefixed once, by remark-rehype; don't prefix them again.
  clobberPrefix: "",
  attributes: {
    ...defaultSchema.attributes,
    img: [...(defaultSchema.attributes?.img ?? []), "title", "dataWidth"],
  },
};

function compile(post: Source, posts: PostMeta[], mode: Mode): Compiled {
  const out: Compiled = { html: "", assets: [], math: false };
  const file = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkObsidian(posts))
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize, SCHEMA)
    .use(rehypeEssay(post, mode, out))
    .use(rehypeStringify, { allowDangerousHtml: true })
    .processSync(dropComments(post.body));
  out.html = String(file);
  return out;
}

const meta = ({ slug, title, date, description, dek, series }: Source): PostMeta => ({
  slug,
  title,
  date,
  description,
  dek,
  ...(series ? { series } : {}),
});

/** For seo.ts: posts in the API's old shape (oldest first), body as plain HTML. */
export function staticPosts() {
  const posts = readPosts(false);
  const metas = posts.map(meta);
  return posts
    .map((p) => ({
      title: p.title,
      slug: p.slug,
      description: p.description,
      published_date: p.date,
      content: compile(p, metas, "static").html,
    }))
    .reverse();
}

// ---------------------------------------------------------------------------------
// The Vite plugin

const INDEX = "virtual:writing";
const POST = "virtual:writing/post/";

export function writingPosts(): Plugin {
  let drafts = false;
  const load = () => readPosts(drafts);
  return {
    name: "writing-posts",
    configResolved(config) {
      drafts = config.command === "serve";
    },
    resolveId(id) {
      if (id === INDEX || id.startsWith(POST)) return `\0${id}`;
    },
    load(id) {
      if (!id.startsWith("\0virtual:writing")) return;
      const posts = load();
      if (id === `\0${INDEX}`) {
        for (const p of posts) this.addWatchFile(p.file);
        const loaders = posts
          .map(
            (p) => `  ${JSON.stringify(p.slug)}: () => import(${JSON.stringify(POST + p.slug)}),`,
          )
          .join("\n");
        return [
          `export const POSTS = ${JSON.stringify(posts.map(meta))};`,
          `export const LOAD = {\n${loaders}\n};`,
        ].join("\n");
      }
      const slug = id.slice(`\0${POST}`.length);
      const post = posts.find((p) => p.slug === slug);
      if (!post) return "export const html = '';";
      this.addWatchFile(post.file);
      const { html, assets, math } = compile(post, posts.map(meta), "app");
      const imports = assets.map((a, i) => `import a${i} from ${JSON.stringify(`${a}?url`)};`);
      const pieces = html.split(/__WRITING_ASSET_(\d+)__/);
      const expr = pieces
        .map((s, i) => (i % 2 ? `a${s}` : JSON.stringify(s)))
        .filter((s) => s !== '""')
        .join(" + ");
      return [
        ...(math ? ['import "katex/dist/katex.min.css";'] : []),
        ...imports,
        `export const html = ${expr || '""'};`,
      ].join("\n");
    },
    configureServer(server) {
      // Editing a post reloads the page with the new text.
      server.watcher.add(CONTENT_DIR);
      const changed = (file: string) => {
        if (relative(CONTENT_DIR, file).startsWith("..")) return;
        for (const m of server.moduleGraph.idToModuleMap.values())
          if (m.id?.startsWith("\0virtual:writing")) server.moduleGraph.invalidateModule(m);
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("change", changed);
      server.watcher.on("add", changed);
      server.watcher.on("unlink", changed);
    },
  };
}
