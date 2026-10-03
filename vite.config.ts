import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// Railway sets RAILWAY_ENVIRONMENT_NAME at build time. Only the production build may
// be indexed by search engines; every other build (the dev environment, local
// builds) tells crawlers to stay away, so preview sites never outrank www.sevanb.net.
const railwayEnv = process.env.RAILWAY_ENVIRONMENT_NAME;
const indexable = railwayEnv === "production";

const API_URLS: Record<string, string> = {
  production: "https://sevanbnet-backend-production.up.railway.app",
  development: "https://sevanbnet-backend-development.up.railway.app",
};

// Emits serve.json (response headers for the `serve` static server) and, off production,
// a robots meta tag. robots.txt itself allows everything on purpose: crawlers must be
// able to fetch a page to see its noindex and drop it from results.
function crawlerPolicy(): Plugin {
  const securityHeaders = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Strict-Transport-Security", value: "max-age=31536000" },
    ...(indexable ? [] : [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]),
  ];
  return {
    name: "crawler-policy",
    transformIndexHtml: (html) =>
      indexable
        ? html
        : html.replace("<head>", '<head>\n    <meta name="robots" content="noindex, nofollow" />'),
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "serve.json",
        source: JSON.stringify({
          headers: [
            { source: "**", headers: securityHeaders },
            {
              source: "assets/**",
              headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
            },
          ],
        }),
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), crawlerPolicy()],
  define: {
    // An explicit VITE_API_URL wins; otherwise follow the Railway environment.
    "import.meta.env.VITE_API_URL": JSON.stringify(
      process.env.VITE_API_URL ??
        (command === "serve" ? "http://127.0.0.1:8000" : API_URLS[railwayEnv ?? "production"]),
    ),
  },
}));
