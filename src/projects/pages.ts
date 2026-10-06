import { type ComponentType, lazy } from "react";

// Each flagship project's hand-built page, loaded only when visited.
export const PAGES: Record<string, ComponentType> = {
  "learning-taichi": lazy(() => import("./learning-taichi/Page")),
  "sonar-inverse-rendering": lazy(() => import("./sonar/SonarRendering")),
};
