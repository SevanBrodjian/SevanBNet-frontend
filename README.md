# sevanb.net frontend

React single-page app for [sevanb.net](https://www.sevanb.net), built with Vite. Content (projects, publications, blog posts) comes from the [backend API](https://github.com/SevanBrodjian/SevanBNet-backend).

## Local development

Requires Node 24 (see `.nvmrc`).

```sh
npm install
npm run dev      # http://localhost:5173, talks to a backend at http://127.0.0.1:8000
npm run check    # Biome lint/format + TypeScript
npm run build    # production bundle in dist/
```

To develop against a deployed backend instead, set `VITE_API_URL`, for example `VITE_API_URL=https://sevanbnet-backend-development.up.railway.app npm run dev`.

## Deployment

Railway builds `dev` into the development environment (service `frontend_dev`) and `main` into production (`frontend_prod`), each only after CI passes. Service settings live in `.railway/railway.ts`; Railway does not read that file on deploy, so apply edits explicitly with `railway config plan` (dry run, must say "0 to destroy") and `railway config apply`, once per environment. See the backend README for the full steps.

The build reads `RAILWAY_ENVIRONMENT_NAME`, which Railway sets automatically:

- **production**: indexable by search engines, uses the production API.
- **anything else**: every response carries `X-Robots-Tag: noindex` plus a robots meta tag, and the build uses the development API. Preview sites stay viewable but never appear in search results.

All pages declare `https://www.sevanb.net/...` as their canonical URL.

## Search engines and AI crawlers

Many crawlers (including the ones behind ChatGPT, Claude and Perplexity search) don't run JavaScript, so `seo.ts` writes a real HTML file for every page at build time: its own title, description, canonical URL, structured data, and a plain-HTML version of the content that React replaces on load. It also generates `sitemap.xml`, `llms.txt` and the `serve.json` routing (real 404s for unknown paths). Project and blog pages are fetched from the API during the build, so content published in the admin appears in these files after the next deploy; until then the page still works for visitors.

Facts about the site owner shown in titles, descriptions and structured data live in `src/site.js`. Keep them true and visible on the site.

## Code conventions

New code is TypeScript (`.ts`/`.tsx`) and passes Biome's full rule set. Older components are listed in the override in `biome.json`, where findings are warnings; remove each file from that list when it is rewritten.
