import { LINE, PAGES, ROLE } from "../site";

// The center of the home page is a deliberate open slot for an element Sevan will design;
// it will also become the way into the cockpit. The page border is the other living edge.
export default function Home() {
  return (
    <div className="home">
      <title>{PAGES.home.title}</title>
      <div className="home-border" aria-hidden="true" />
      <section className="wrap home-intro">
        <p className="lbl">
          {ROLE.title}, {ROLE.department}, {ROLE.institutionShort}
        </p>
        <h1 className="home-line">{LINE}</h1>
      </section>
      <div className="home-slot" data-slot="home.center" aria-hidden="true" />
    </div>
  );
}
