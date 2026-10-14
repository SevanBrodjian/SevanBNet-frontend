// An essay's description as one short paragraph, for the list and the essay's header.
// Shared by the build (./build.ts) and the app (./posts.ts).

const paras = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

/** One short paragraph: the first; if that is only a line, add the next one's first sentence. */
export function dekOf(description: string | null | undefined) {
  const ps = paras(description ?? "");
  if (!ps.length) return "";
  if (ps[0].length >= 60 || !ps[1]) return ps[0];
  const first = ps[1].match(/^.+?[.!?](?=\s|$)/);
  return `${ps[0]} ${first ? first[0] : ps[1]}`;
}
