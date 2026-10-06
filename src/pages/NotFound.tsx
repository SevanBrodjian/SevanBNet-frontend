import { Link } from "react-router";
import { pageTitle } from "../site";

// Unknown routes and missing records. The server already answers unknown paths with a
// real 404; the robots tag covers client-side navigation and the per-slug shells.
export default function NotFound() {
  return (
    <div className="wrap page">
      <title>{pageTitle("Not found")}</title>
      <meta name="robots" content="noindex" />
      <p className="loading">
        Not found. <Link to="/">Home</Link>
      </p>
    </div>
  );
}
