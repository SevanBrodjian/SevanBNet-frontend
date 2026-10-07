import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/source-serif-4/opsz.css";
import "@fontsource-variable/source-serif-4/opsz-italic.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/frame.css";
import "./styles/controls.css";
import App from "./App";

// The server sends each page with a static <title> and canonical link (see seo.ts) for
// crawlers that never run JavaScript. React renders its own per page and does not replace
// existing head tags, so drop the static ones to avoid duplicates after navigation.
for (const el of document.head.querySelectorAll("[data-static]")) el.remove();

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
