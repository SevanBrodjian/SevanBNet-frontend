// The technical setup, left to right: the room's phones and screens, the one laptop that runs the
// game server (and the only traffic that leaves the room, to Claude), and the headset, which renders
// everything and keeps the world state in sync with the laptop in both directions.
// Plain boxes and labelled links; on a phone the columns stack and the links point down.

type Node = { name: string; text: string };

const ROOM: Node[] = [
  {
    name: "Phones",
    text: "The audience picks, mixes or describes spells, and sees what happened to each",
  },
  {
    name: "Screens",
    text: "The join QR code, and the player's view, redrawn from the world state",
  },
];

const LAPTOP: Node[] = [
  { name: "Queue", text: "Sorted by how much work a spell needs; prebuilt ones first" },
  {
    name: "Forge",
    text: "The catalog answers at once; Claude workers reuse, adapt, combine or write new code",
  },
  { name: "Check", text: "An allowlist for spell code, and a time budget per frame" },
  { name: "Edit log", text: "Every change to the scene, in order, replayed by each page" },
  {
    name: "World state",
    text: "The headset's latest pose and scene, which the model reads before it edits the world",
  },
];

const HEADSET: Node & { lead: string } = {
  name: "Quest headset",
  lead: "Renders everything.",
  text: "The WebXR page holds the only live copy of the world, runs each spell, and decides whether it was sliced, blocked or got through",
};

function Link({ out, back }: { out: string; back: string }) {
  return (
    <div className="cc-link" aria-hidden="true">
      <span className="cc-out">{out}</span>
      <span className="cc-back">{back}</span>
    </div>
  );
}

export default function Setup() {
  return (
    <figure className="cc-setup">
      <div
        className="cc-grid"
        role="img"
        aria-label="Phones and screens connect over the room's Wi-Fi to one laptop. On the laptop, spell requests pass through a queue, a forge (the catalog, or Claude workers), a code check and an edit log, which goes out over a WebSocket to the Quest headset. The headset renders everything and sends back its pose 30 times a second, the full scene 10 times a second, and what happened to each spell. The laptop keeps that as the world state, which the model reads before it edits the world and the screens use to show the player's view."
      >
        <div className="cc-col">
          {ROOM.map((n) => (
            <div key={n.name} className="cc-node">
              <b>{n.name}</b>
              <span>{n.text}</span>
            </div>
          ))}
        </div>
        <Link out="spell requests" back="status, and the player's view" />
        <div className="cc-col cc-laptop">
          <p className="cc-title">Laptop · one Python process</p>
          <ol>
            {LAPTOP.map((n) => (
              <li key={n.name}>
                <b>{n.name}</b>
                <span>{n.text}</span>
              </li>
            ))}
          </ol>
          <p className="cc-cloud">The only traffic that leaves the room: calls to Claude</p>
        </div>
        <Link out="scene edits" back="pose 30×/s, scene 10×/s, and outcomes" />
        <div className="cc-col">
          <div className="cc-node cc-hs">
            <b>{HEADSET.name}</b>
            <span>
              <strong>{HEADSET.lead}</strong> {HEADSET.text}
            </span>
          </div>
        </div>
      </div>
    </figure>
  );
}
