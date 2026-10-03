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

Railway builds `dev` into the development environment and `main` into production (see `railway.json`). The build reads `RAILWAY_ENVIRONMENT_NAME`, which Railway sets automatically:

- **production**: indexable by search engines, uses the production API.
- **anything else**: every response carries `X-Robots-Tag: noindex` plus a robots meta tag, and the build uses the development API. Preview sites stay viewable but never appear in search results.

All pages declare `https://www.sevanb.net/...` as their canonical URL.

## Code conventions

New code is TypeScript (`.ts`/`.tsx`) and passes Biome's full rule set. Older components are listed in the override in `biome.json`, where findings are warnings; remove each file from that list when it is rewritten.
