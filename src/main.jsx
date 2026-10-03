import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// The server sends each page with a static <title> and canonical link (see seo.ts) for
// crawlers that never run JavaScript. React renders its own per page, and React does not
// replace existing head tags, so drop the static ones to avoid duplicates after navigation.
for (const el of document.head.querySelectorAll("[data-static]")) el.remove();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
