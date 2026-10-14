import PageFrame from "../frame/PageFrame";
import Hero from "../hero/Hero";
import { PAGES } from "../site";
import useSiteText from "../siteText";
import "../styles/home.css";

// The front door: one line, and beside it glimpses of worlds drawn in ink (../hero).
// The frame around it holds still; one corner of it is warm (see PageFrame).
export default function Home() {
  const site = useSiteText();
  return (
    <div className="home">
      <title>{PAGES.home.title}</title>
      <PageFrame glow />
      <div className="wrap home-in">
        <div className="home-copy">
          <p className="lbl role">{site.role}</p>
          <h1>{site.home_line}</h1>
        </div>
        <div className="slot" data-slot="home.center" aria-hidden="true">
          <Hero />
        </div>
      </div>
    </div>
  );
}
