// Railway build/deploy settings for the frontend services (frontend_dev in the
// development environment, frontend_prod in production).
//
// Railway does not read this file on deploy. Changes take effect only when applied:
//   cd .railway && npm install && cd ..
//   railway environment development && railway config plan   # dry run; must say "0 to destroy"
//   railway config apply
// and the same for production. The `partial` name scopes this file to the resources it
// declares, so the backend and database services are never touched.
import { defineRailway, github, preserve, project, service } from "railway/iac";

export const partial = "frontend";

export default defineRailway((ctx) => {
  if (ctx.environment !== "development" && ctx.environment !== "production") {
    throw new Error(`Unexpected environment: ${ctx.environment}`);
  }
  const prod = ctx.environment === "production";

  const web = service(prod ? "frontend_prod" : "frontend_dev", {
    // checkSuites: deploy only after the GitHub CI checks pass.
    source: github("SevanBrodjian/SevanBNet-frontend", {
      branch: prod ? "main" : "dev",
      checkSuites: true,
    }),
    build: { builder: "RAILPACK", buildCommand: "npm run build" },
    start: "npm start",
    healthcheck: "/",
    env: {
      // The build fetches content from the API, so "Rebuild site" in the control panel
      // must never reuse a cached build. This alone doesn't ensure it: Railpack (v0.43)
      // still reuses the `npm run build` step when no file in the repo has changed.
      NO_CACHE: "1",
      // What does: the backend sets this to the current time before each rebuild
      // (sevanbnet/rebuild.py), and a changed variable makes the build step run again.
      CONTENT_REBUILD: preserve(),
      // The Learning Taichi lab, embedded on its project page (the taichi_lab service below).
      VITE_LAB_URL: "https://taichi-lab.sevanb.net/",
      CI: preserve(),
      NODE_ENV: preserve(),
      // Unused since the Vite migration (the API URL now follows the environment);
      // kept so applying this file never deletes anything. Safe to remove.
      REACT_APP_API_URL: preserve(),
    },
  });

  // The Learning Taichi lab: a static, already privacy-scanned export committed to the
  // public-export branch of learning-taichi (public-lab/), served as plain files. It is
  // exported on Sevan's Mac, never built here (see that repo's harness/dashboard/README.md).
  // Production only; the development site embeds the same lab.
  const lab = service("taichi_lab", {
    source: github("SevanBrodjian/learning-taichi", {
      branch: "public-export",
      rootDirectory: "public-lab",
    }),
    build: { builder: "RAILPACK" },
    // Its address, taichi-lab.sevanb.net, is a custom domain added with `railway domain`
    // (configuration files can't register custom domains).
  });

  return project("SevanBNet", { resources: prod ? [web, lab] : [web] });
});
