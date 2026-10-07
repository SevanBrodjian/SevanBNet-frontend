import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/source-serif-4/opsz.css";
import "@fontsource-variable/source-serif-4/opsz-italic.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/frame.css";
import "./styles/controls.css";
import App from "./App";
import { preloadPath } from "./routes";

// Load the first page's own code before mounting (the server's page has already asked for
// it), so the app appears complete instead of in pieces. A failure still mounts the app,
// which shows it.
const root = document.getElementById("root");
const mount = () => {
  if (!root) return;
  // The server sends each page with a static <title> and canonical link (see seo.ts) for
  // crawlers that never run JavaScript. React renders its own per page and does not
  // replace existing head tags, so drop the static ones to avoid duplicates.
  for (const el of document.head.querySelectorAll("[data-static]")) el.remove();
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
};
preloadPath(location.pathname).then(mount, mount);
