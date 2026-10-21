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

// The dev server's port, 1000, is below 1024, which macOS lets an ordinary user open only on
// every network interface at once. So it listens everywhere but answers only this Mac and
// Sevan's own devices over Tailscale (http://<this Mac's tailnet name>:1000, for testing on
// a phone); anyone else on the network gets a 403.
const LOOPBACK = new Set(["::1", "127.0.0.1", "::ffff:127.0.0.1"]);
/** Tailscale's addresses: 100.64.0.0/10, and its IPv6 prefix. */
const tailnet = (a: string) => {
  const v4 = a.replace(/^::ffff:/, "").match(/^100\.(\d+)\./);
  return (!!v4 && Number(v4[1]) >= 64 && Number(v4[1]) <= 127) || a.startsWith("fd7a:115c:a1e0:");
};
const ownDevicesOnly: PluginOption = {
  name: "own-devices-only",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const from = req.socket.remoteAddress ?? "";
      const to = req.socket.localAddress ?? "";
      // from a device on the tailnet, arriving on this Mac's tailnet address
      if (LOOPBACK.has(from) || (tailnet(from) && tailnet(to))) return next();
      res.statusCode = 403;
      res.end();
    });
  },
};

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
  const plugins: PluginOption[] = [react(), ownDevicesOnly];
  if (!isPreview) {
    const content = await loadContent(contentApi, { strict: railwayEnv === "production" });
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
    // http://localhost:1000 and a local production preview http://localhost:4173.
    // Answered for this Mac and, over Tailscale, Sevan's own devices, by this Mac's tailnet
    // name (short or full); the preview is for this Mac.
    server: {
      port: 1000,
      strictPort: true,
      host: "::",
      proxy,
      allowedHosts: [".ts.net", "sevan-macbook-air"],
    },
    preview: { port: 4173, strictPort: true, proxy, allowedHosts: [".ts.net"] },
  };
});
