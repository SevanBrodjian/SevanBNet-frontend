import Action from "../../frame/Action";
import AutoVideo from "../../frame/AutoVideo";
import { pageTitle } from "../../site";
import { ProjectHead, ProjectPager, ProjectRoom, When } from "../kit";
import type { CustomPageProps } from "../pages";
import Setup from "./Setup";
import "./crowdcast.css";

/** Ten seconds of the demo (1:00 to 1:10): the control room, muted and looping. */
const CLIP = "/media/projects/crowdcast-hero.mp4";
const POSTER = "/media/projects/crowdcast-hero.webp";

/** What it took to work well, live, in a room full of people. */
const TOOK = [
  {
    key: "Keeping the wait short",
    text: "A new spell takes 10 to 20 seconds to write, which is a long time to stand around looking at your phone. So every request is sorted by how much work it needs before any model gets involved. Prebuilt spells come straight from the catalog and go to the front of the queue, so there's always something in the air. Several Claude workers run in parallel, and each one checks the library before writing anything (an exact match first, then a spell it can adapt or combine). Every spell they make is added to the library, so the next person who asks for something similar gets it much sooner.",
  },
  {
    key: "Running code from audience text",
    text: "The spells are code written from whatever people typed into their phones, so this deserves some care. Each one is checked against a small allowlist of what spells are allowed to do before it runs, and given a time budget every frame while it runs. If a spell throws an error or runs over, it's switched off and flies in as a plain shape instead, so the player never waits on (or crashes because of) someone else's idea.",
  },
  {
    key: "Keeping every screen in agreement",
    text: "The laptop keeps an ordered log of every edit to the scene, so a page that joins late or reloads rebuilds the same world by replaying it. The headset decides what happens in the moment, like whether the blade sliced a spell, without waiting on the network. Each spell's path follows from the clock and a random seed, so the other screens can draw the same flight without it being streamed to them.",
  },
  {
    key: "The network",
    text: "Phones connect over plain HTTP so that nobody sees a certificate warning, while the headset gets HTTPS, since WebXR requires it. Every spell is acknowledged twice, once when it's built and again when it actually appears in the headset, so a headset that drops off the Wi-Fi for a moment doesn't lose anything. Venue Wi-Fi also often stops devices from reaching each other at all, so the server can be reached through a tunnel when the local network won't cooperate.",
  },
];

export default function Page({ project: p }: CustomPageProps) {
  return (
    <ProjectRoom className="cc">
      <title>{pageTitle(p.title)}</title>
      <ProjectHead
        standalone={p.standalone}
        when={<When p={p} />}
        title={p.title}
        line={p.summary ?? undefined}
        actions={
          p.source && (
            <Action href={p.source} primary>
              Code
            </Action>
          )
        }
      />
      <AutoVideo
        className="pj-media"
        src={[{ src: CLIP, type: "video/mp4" }]}
        poster={POSTER}
        label="CrowdCast's control room during a round: the player's view in the headset on the left, and the spell queue on the right."
        width={1600}
        height={782}
      />
      <div className="prose pj-notes cc-notes">
        <p>
          CrowdCast is a VR game that everyone in the room plays at once. One person wears a Meta
          Quest and stands in a castle hall, defending a magical egg until midnight, while everyone
          else casts spells at them from their phones. The audience can pick from a set of prebuilt
          spells, mix the pieces together, or type out an idea for something entirely new, in which
          case an LLM writes the spell as code and adds it to the running game. A new spell usually
          takes 10 to 20 seconds to arrive.
        </p>
        <p>
          <strong>
            We built it in a single day at the MOLTEN Spatial Hackathon during LA Tech Week 2026, as
            a team of three (Jhan Liufu, Ilona Demler and me), and it won first place.
          </strong>{" "}
          The game itself, which we called Midnight Egg, was mostly a way to test a broader idea:
          that a single-player game can become a game for the whole room if the room is able to
          change the player's world while they're in it, with a model doing the work of turning each
          idea into something that actually runs.
        </p>
      </div>

      <section className="cc-sec" aria-labelledby="cc-how">
        <h2 id="cc-how" className="cc-h">
          How it works
        </h2>
        <div className="prose pj-notes cc-prose">
          <p>
            The headset does all of the rendering. The game runs in the Quest's browser as a WebXR
            page, and that page holds the only live copy of the scene: it moves every spell, and
            decides whether each one was sliced by the player's blade, blocked by their shield, or
            got through. Everything else runs in a single Python process on a laptop, which the
            phones and the headset all connect to over the room's Wi-Fi.
          </p>
          <p>
            The laptop and the headset keep a shared world state in sync over a WebSocket, in both
            directions. Edits to the scene go out from the laptop to the headset, and the headset
            reports back its position 30 times a second and the full state of the scene 10 times a
            second. That return path is what lets the laptop show the player's view live (the left
            side of the video above), and it also means that when the model is asked to change the
            scene, it's working from what the player is actually seeing.
          </p>
          <p>
            To make this concrete, let's follow one spell. Someone types "a spinning chocolate bar"
            and taps Cast. There's no existing spell to start from, so the laptop queues it as brand
            new, and once a worker is free Claude writes it as a short piece of JavaScript. The code
            is checked, added to the edit log, and sent to the headset, which sends it flying at the
            egg or the player. When the player slices it, blocks it, or lets it through, the headset
            reports back and the phone that cast it is told what happened.
          </p>
        </div>
        <Setup />
      </section>

      <section className="cc-sec" aria-labelledby="cc-took">
        <h2 id="cc-took" className="cc-h">
          What it took to work well
        </h2>
        <ul className="cc-took">
          {TOOK.map((t) => (
            <li key={t.key}>
              <b>{t.key}</b>
              <span>{t.text}</span>
            </li>
          ))}
        </ul>
      </section>
      <ProjectPager slug={p.slug} />
    </ProjectRoom>
  );
}
