import { type RouteComponent, route } from "../frame/route";

// Each flagship project's hand-built page, loaded only when visited (or about to be).
export const PAGES: Record<string, RouteComponent> = {
  "learning-taichi": route(() => import("./learning-taichi/Page")),
  "sonar-inverse-rendering": route(() => import("./sonar/Page")),
};
