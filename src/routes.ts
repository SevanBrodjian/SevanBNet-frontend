import { route } from "./frame/route";
import { PAGES } from "./projects/pages";

// Every page but Home loads only when it is needed. A link to a page starts loading it
// on hover or focus (see Layout), and main.tsx loads the first page before mounting, so
// nothing on screen waits on a spinner.
export const Projects = route(() => import("./pages/Projects"));
export const ProjectPage = route(() => import("./pages/ProjectPage"));
export const Papers = route(() => import("./pages/Papers"));
export const Writing = route(() => import("./pages/Writing"));
export const Essay = route(() => import("./pages/Essay"));
export const About = route(() => import("./pages/About"));

/** Load the page a path shows (and a flagship project's own page), ahead of time. */
export function preloadPath(path: string): Promise<unknown> {
  const p = path.split(/[?#]/)[0].replace(/\/$/, "");
  const [, top, slug] = p.split("/");
  const loads: Promise<unknown>[] = [];
  if (top === "projects" && slug) {
    loads.push(ProjectPage.preload());
    const own = PAGES[slug];
    if (own) loads.push(own.preload());
  } else if (top === "projects") loads.push(Projects.preload());
  else if (top === "papers" || top === "research") loads.push(Papers.preload());
  else if ((top === "writing" || top === "blog") && slug)
    loads.push(
      Essay.preload(),
      // The essay itself too, so it is there when the page first renders.
      import("./writing/posts").then((m) => m.loadBody(slug)),
    );
  else if (top === "writing" || top === "blog") loads.push(Writing.preload());
  else if (top === "about") loads.push(About.preload());
  return Promise.all(loads);
}
