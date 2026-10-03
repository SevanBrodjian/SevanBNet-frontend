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
      CI: preserve(),
      NODE_ENV: preserve(),
      // Unused since the Vite migration (the API URL now follows the environment);
      // kept so applying this file never deletes anything. Safe to remove.
      REACT_APP_API_URL: preserve(),
    },
  });

  return project("SevanBNet", { resources: [web] });
});
