import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { sitePages } from "./seo.ts";

// Railway sets RAILWAY_ENVIRONMENT_NAME at build time. Only the production build may
// be indexed by search engines; every other build (the dev environment, local builds)
// tells crawlers to stay away, so preview sites never outrank www.sevanb.net.
const railwayEnv = process.env.RAILWAY_ENVIRONMENT_NAME;

const API_URLS: Record<string, string> = {
  production: "https://sevanbnet-backend-production.up.railway.app",
  development: "https://sevanbnet-backend-development.up.railway.app",
};

export default defineConfig(({ command }) => {
  // An explicit VITE_API_URL wins; otherwise follow the Railway environment.
  const apiUrl =
    process.env.VITE_API_URL ??
    (command === "serve" ? "http://127.0.0.1:8000" : API_URLS[railwayEnv ?? "production"]);
  return {
    plugins: [react(), sitePages({ apiUrl, indexable: railwayEnv === "production" })],
    define: { "import.meta.env.VITE_API_URL": JSON.stringify(apiUrl) },
  };
});
