# sevanb.net frontend

React single-page app for [sevanb.net](https://www.sevanb.net), built with Vite. Content comes from the [backend API](https://github.com/SevanBrodjian/SevanBNet-backend), edited in the control panel at https://admin.sevanb.net: projects, papers, the essays' titles, dates and descriptions, and the site text (home line, role, About). Only what is marked Visible there appears. The code holds the presentation: the hand-built project pages (`src/projects/pages.ts`, by slug), the paper widgets (`src/papers/registry.ts`, by the paper's widget key) and the essays' text (`content/writing/<slug>.md`).

## Local development

Requires Node 24 (see `.nvmrc`).

```sh
npm install
npm run dev      # http://localhost:1000; /api is proxied to the local backend (port 8000)
npm run check    # Biome lint/format + TypeScript
npm run build    # production bundle in dist/
```

In development the app calls relative `/api`, which Vite (`vite` and `vite preview`) forwards to a backend, so any port works without CORS changes. By default that is the local backend at http://localhost:8000; `VITE_API_TARGET` picks another, for example `VITE_API_TARGET=https://dev-admin.sevanb.net npm run dev`. To preview a production build locally against the proxy, build with an empty API URL: `VITE_API_URL= npm run build && npm run preview`.

The API's addresses live in one place, `API_BASES` in `content.ts`.

## Deployment

Railway builds `dev` into the development environment (service `frontend_dev`) and `main` into production (`frontend_prod`), each only after CI passes. Service settings live in `.railway/railway.ts`; Railway does not read that file on deploy, so apply edits explicitly with `railway config plan` (dry run, must say "0 to destroy") and `railway config apply`, once per environment. See the backend README for the full steps.

The build reads `RAILWAY_ENVIRONMENT_NAME`, which Railway sets automatically:

- **production**: indexable by search engines, uses the production API (https://admin.sevanb.net/api).
- **anything else**: every response carries `X-Robots-Tag: noindex` plus a robots meta tag, and the build uses the development API (https://dev-admin.sevanb.net/api). Preview sites stay viewable but never appear in search results.

Each build bakes the content (projects, papers, essays, site text) into the app, so pages render at once; the app then asks the API and shows anything edited since. The crawler pages, sitemap, llms.txt and the baked-in content update on the next deploy ("Rebuild site" in the control panel).

All pages declare `https://www.sevanb.net/...` as their canonical URL.

## Search engines and AI crawlers

Many crawlers (including the ones behind ChatGPT, Claude and Perplexity search) don't run JavaScript, so `seo.ts` writes a real HTML file for every page at build time: its own title, description, canonical URL, structured data, and a plain-HTML version of the content that React replaces on load. It also generates `sitemap.xml`, `llms.txt` and the `serve.json` routing (real 404s for unknown paths). Content is fetched from the API during the build (`content.ts`), so content published in the control panel appears in these files after the next deploy; until then the page still works for visitors.

If the API can't be reached during a build, `content.ts` uses `content/api-snapshot.json`, a saved answer from the production API, so an outage never empties the site. Builds only read it. To refresh it, run `npm run snapshot` now and then and commit the file.

Facts about the site owner shown in titles, descriptions and structured data live in `src/site.js`. Keep them true and visible on the site.

## Code conventions

New code is TypeScript (`.ts`/`.tsx`) and passes Biome's full rule set. Older components are listed in the override in `biome.json`, where findings are warnings; remove each file from that list when it is rewritten.
