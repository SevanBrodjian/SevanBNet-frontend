import PageFrame from "../frame/PageFrame";
import { LINE, PAGES, ROLE } from "../site";
import "../styles/home.css";

// The front door: one line, and an open slot in the middle for an element Sevan is
// making. The frame around it holds still; one corner of it is warm (see PageFrame).
export default function Home() {
  return (
    <div className="home">
      <title>{PAGES.home.title}</title>
      <PageFrame glow />
      <div className="wrap home-in">
        <div className="home-copy">
          <p className="lbl role">
            {ROLE.title}, {ROLE.department}, {ROLE.institutionShort}
          </p>
          <h1>{LINE}</h1>
        </div>
        <div className="slot" data-slot="home.center" aria-hidden="true">
          <i className="crop" />
          <svg viewBox="0 0 40 200" preserveAspectRatio="none" aria-hidden="true">
            <path d="M38 1C24 1 20 8 20 24V82C20 92 13 99 2 100C13 101 20 108 20 118V176C20 192 24 199 38 199" />
          </svg>
          <svg viewBox="0 0 40 200" preserveAspectRatio="none" aria-hidden="true">
            <path d="M2 1C16 1 20 8 20 24V82C20 92 27 99 38 100C27 101 20 108 20 118V176C20 192 16 199 2 199" />
          </svg>
        </div>
      </div>
    </div>
  );
}
