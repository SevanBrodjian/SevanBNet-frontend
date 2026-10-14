import { existsSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig, type PluginOption, type ProxyOptions } from "vite";
import { API_BASES, builtContent, LOCAL_BACKEND, loadContent } from "./content.ts";
import { sitePages } from "./seo.ts";
import { writingPosts } from "./src/writing/build.ts";

// Railway sets RAILWAY_ENVIRONMENT_NAME at build time. Only the production build may
// be indexed by search engines; every other build (the dev environment, local builds)
// tells crawlers to stay away, so preview sites never outrank www.sevanb.net.
const railwayEnv = process.env.RAILWAY_ENVIRONMENT_NAME;

// Local servers (`vite`, `vite preview`) forward /api to a backend, so the app can call
// relative /api from any port. By default that is the local backend (always port 8000);
// VITE_API_TARGET picks another, e.g. https://dev-admin.sevanb.net.
const apiTarget = (process.env.VITE_API_TARGET ?? LOCAL_BACKEND).replace(/\/$/, "");
const proxy: Record<string, ProxyOptions> = {
  "/api": { target: apiTarget, changeOrigin: true, secure: true },
};

// The Learning Taichi lab (a static export of its dashboard). VITE_LAB_URL points at it
// wherever it is hosted; otherwise it is served from public/lab/ when that folder exists
// at build time (it is not in git). Without either, the page shows a still of it.
const LOCAL_LAB = "/lab/learning-taichi/index.html";
const labUrl = process.env.VITE_LAB_URL ?? (existsSync(`public${LOCAL_LAB}`) ? LOCAL_LAB : "");

export default defineConfig(async ({ command, isPreview }) => {
  // Where the app calls the API. An explicit VITE_API_URL wins (empty means relative
  // /api, which suits a local `vite preview`); otherwise `vite` uses the proxy and builds
  // follow Railway's environment, production unless told otherwise.
  const apiUrl = (
    process.env.VITE_API_URL ??
    (command === "serve" ? "" : (API_BASES[railwayEnv ?? "production"] ?? API_BASES.development))
  ).replace(/\/$/, "");
  const apiBase = apiUrl || "/api";
  // The build reads content from the same API, through the proxy's target when relative.
  const contentApi = apiBase.startsWith("/") ? `${apiTarget}${apiBase}` : apiBase;
  const plugins: PluginOption[] = [react()];
  if (!isPreview) {
    const content = await loadContent(contentApi);
    plugins.push(
      builtContent(content),
      // Essays: content/writing/<slug>.md, compiled to HTML at build time, published when
      // the control panel lists them.
      writingPosts(content.posts),
      sitePages({ content, indexable: railwayEnv === "production" }),
    );
  }
  return {
    plugins,
    define: {
      "import.meta.env.VITE_API_URL": JSON.stringify(apiBase),
      "import.meta.env.VITE_LAB_URL": JSON.stringify(labUrl),
    },
    // Fixed local addresses (never drift to another port): the site is always
    // http://localhost:5173 and a local production preview http://localhost:4173.
    // Both stay on localhost; to open them from a phone, Tailscale forwards to them
    // (`tailscale serve`), so they also answer to this Mac's tailnet name (*.ts.net).
    server: { port: 5173, strictPort: true, proxy, allowedHosts: [".ts.net"] },
    preview: { port: 4173, strictPort: true, proxy, allowedHosts: [".ts.net"] },
  };
});
