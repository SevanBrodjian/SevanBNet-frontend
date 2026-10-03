import { pageTitle } from "../site";

// Shown for unknown routes, and for project/blog pages whose record does not exist.
// The server already answers unknown paths with HTTP 404; the robots tag covers
// client-side navigation and the /projects/<id> and /blog/<id> shells.
export function NoIndex() {
  return <meta name="robots" content="noindex" />;
}

export default function NotFound() {
  return (
    <div className="cosmic-bg-bright">
      <title>{pageTitle("Not found")}</title>
      <NoIndex />
      <div className="bg-overlay-2" />
      <h2 className="loading">Page not found.</h2>
    </div>
  );
}
