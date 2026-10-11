import { type RouteComponent, route } from "../frame/route";
import type { Project } from "../types";

export type CustomPageProps = { project: Project };

// Projects with a hand-built page, by slug. Each is still a project in the control panel
// (its title, summary, dates and visibility live there); a project whose slug is not here
// gets the default page. Each page loads only when visited (or about to be).
export const CUSTOM_PAGES: Record<string, RouteComponent<CustomPageProps>> = {
  "learning-taichi": route(() => import("./learning-taichi/Page")),
  "sonar-inverse-rendering": route(() => import("./sonar/Page")),
};
