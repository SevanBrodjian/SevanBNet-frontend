import { SITE } from "virtual:site";
import useApi from "./frame/useApi";
import type { Site } from "./types";

/**
 * The home line, role and About text (Site settings in the control panel): as of the
 * build, so the first render has them, then as the API has them now. Unchanged text
 * renders the same, so nothing moves.
 */
export default function useSiteText(): Site {
  return useApi<Site>("site/", SITE).data ?? SITE;
}
