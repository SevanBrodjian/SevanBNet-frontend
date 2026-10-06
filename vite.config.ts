import react from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions } from "vite";
import { sitePages } from "./seo.ts";

// Railway sets RAILWAY_ENVIRONMENT_NAME at build time. Only the production build may
// be indexed by search engines; every other build (the dev environment, local builds)
// tells crawlers to stay away, so preview sites never outrank www.sevanb.net.
const railwayEnv = process.env.RAILWAY_ENVIRONMENT_NAME;

const API_URLS: Record<string, string> = {
  production: "https://sevanbnet-backend-production.up.railway.app",
  development: "https://sevanbnet-backend-development.up.railway.app",
};

// Local servers (`vite`, `vite preview`) forward /api to a real backend, so the app can
// call relative /api from any port; the backend's CORS only allows the real domains.
// VITE_API_TARGET picks the backend, e.g. http://127.0.0.1:8000 for a local Django.
const apiTarget = process.env.VITE_API_TARGET ?? API_URLS.production;
const proxy: Record<string, ProxyOptions> = {
  "/api": { target: apiTarget, changeOrigin: true, secure: true },
};

export default defineConfig(({ command }) => {
  // An explicit VITE_API_URL wins (an empty value means relative /api, which suits a
  // local `vite preview`); otherwise dev uses the proxy and builds follow Railway.
  const apiUrl =
    process.env.VITE_API_URL ??
    (command === "serve" ? "" : API_URLS[railwayEnv ?? "production"]);
  return {
    plugins: [
      react(),
      // The build-time page generator fetches content itself, so it needs a full URL.
      sitePages({ apiUrl: apiUrl || apiTarget, indexable: railwayEnv === "production" }),
    ],
    define: { "import.meta.env.VITE_API_URL": JSON.stringify(apiUrl) },
    server: { proxy },
    preview: { proxy },
  };
});
