// The plain box shown while a list is genuinely loading. Never held on screen on purpose.
export default function Loading({ failed = false, empty = false, what = "this" }) {
  const text = failed ? `Couldn't load ${what}.` : empty ? "Nothing here yet." : "Loading...";
  return <p className="loading">{text}</p>;
}
