// The runtime behind the controls. CSS does most of the work from the properties and
// classes the store writes on <html>; this does the parts CSS cannot:
// - boxes: every block on the page, found once, so they can be outlined, labelled,
//   broken or moved
// - skeleton: tag, class, size and target labels for those boxes; rulers, grid, HUD,
//   inspector
// - faults: misregistration and drift are CSS; fallback fonts, stuck states, overflow,
//   z-fighting, tearing, missing textures, mojibake and stray Loading... boxes are
//   assigned here from a seeded hash, so Re-roll moves them; the cursor smear is drawn
//   wherever the pointer goes
// - dynamics: a spring per block (stiff, slightly underdamped), driven by pointer,
//   its wake, scroll, gravity and taps; links and buttons never flee the pointer, they
//   lean toward it and recoil when touched
// - mechanics: audible clicks, row-by-row printing, phosphor persistence of the pointer,
//   grain motion
// The header and the panel are never broken or moved, so they always work. Elements are
// marked with data attributes rather than classes, so React re-renders never strip them.

import { living, loopStats, REDUCED_MOTION, TIER } from "../frame/live";
import { clamp, esc, hash, oklch, rng } from "../frame/util";
import { currentSeed, faulty, get, getNumber, type How, label, reactive, subscribe } from "./store";

const D = document;
const H = D.documentElement;
const num = getNumber;
const on = (k: string) => !!get(k);

/** Never boxes: the panel, the effect layers, dialogs, hidden text. */
const NOX =
  ".cp, .cp *, .fxl, .fxl *, dialog, dialog *, .vh, script, style, svg *, br, option, #root";
/** In the header only these may be outlined and labelled. */
const HDR_OK = ".hdr, .hdr nav, .hdr .mark, .hdr .vw";
const SEL =
  "header,nav,main,section,article,aside,footer,figure,figcaption,h1,h2,h3,p,ul,ol,li,a,button,img,video,canvas,iframe,pre,table,blockquote,time,input,[data-slot],div[class],div[id],span.lbl,span.chip";

let started = false;
let L: Record<
  "web" | "grain" | "scan" | "vign" | "grid" | "skel" | "rul" | "ins" | "hud" | "intr",
  HTMLElement
>;

function layer(cls: string, html = "") {
  const n = D.createElement("div");
  n.className = `fxl ${cls}`;
  n.setAttribute("aria-hidden", "true");
  if (html) n.innerHTML = html;
  D.body.append(n);
  return n;
}

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = D) => r.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = D) => [
  ...r.querySelectorAll<T>(s),
];

// ---------------------------------------------------------------------------------
// Boxes

let BOX: HTMLElement[] = [];
let boxesDirty = true;
const KEYS = new WeakMap<Element, string>();
const keyOf = (n: Element) => KEYS.get(n) ?? "";

const needBoxes = () =>
  num("wire") > 0 || num("tags") > 0 || num("xray") > 0 || on("inspect") || faulty();

function collect() {
  boxesDirty = false;
  const out: HTMLElement[] = [];
  for (const n of $$(SEL)) {
    if (n.matches(NOX) || n.closest(".cp,.fxl,dialog")) continue;
    if (n.closest(".hdr") && !n.matches(HDR_OK)) continue;
    const t = n.tagName;
    if (
      (t === "A" || t === "TIME" || t === "SPAN") &&
      getComputedStyle(n).display === "inline" &&
      !n.closest("nav")
    )
      continue;
    out.push(n);
    if (out.length > 900) break;
  }
  const kept = new Set(out);
  for (const n of BOX) if (!kept.has(n)) unmark(n);
  BOX = out;
  let i = 0;
  for (const n of BOX) {
    n.setAttribute("data-bx", "");
    const cls = typeof n.className === "string" ? n.className.split(" ")[0] : "";
    KEYS.set(n, `${n.tagName}${n.id}${cls}:${i++}`);
    if (n.closest("main, .ftr") && n.tagName !== "MAIN") n.setAttribute("data-bk", "");
    else n.removeAttribute("data-bk");
  }
  if (faulty()) faults();
}

function unmark(n: HTMLElement) {
  for (const a of ["data-bx", "data-bk", "data-ff", "data-st", "data-ovf", "data-zf", "data-mt"])
    n.removeAttribute(a);
  n.style.removeProperty("--h1");
  n.style.removeProperty("--h2");
  n.style.removeProperty("--tear");
  n.style.removeProperty("--cut");
}

function boxes() {
  if (boxesDirty) collect();
  return BOX;
}

// ---------------------------------------------------------------------------------
// Skeleton labels

const PRI: Record<string, number> = {
  HEADER: 1,
  NAV: 1,
  MAIN: 1,
  SECTION: 1,
  ARTICLE: 1,
  FOOTER: 1,
  FIGURE: 0.8,
  H1: 0.9,
  H2: 0.7,
  CANVAS: 0.9,
  IFRAME: 0.9,
  VIDEO: 0.9,
  IMG: 0.7,
};

function shortHref(h: string | null) {
  if (!h) return "";
  try {
    const u = new URL(h, location.href);
    if (u.host === location.host) return u.pathname + u.search + u.hash;
    return u.host.replace(/^www\./, "") + (u.pathname.length > 1 ? u.pathname.slice(0, 18) : "");
  } catch {
    return h.slice(0, 24);
  }
}

function labelText(n: HTMLElement, r: DOMRect) {
  const t = n.tagName.toLowerCase();
  const c = typeof n.className === "string" ? n.className.split(/\s+/).find(Boolean) : "";
  const size = `${Math.round(r.width)}×${Math.round(r.height)}`;
  let s = `${t}${n.id ? `#${n.id}` : ""}${c ? `.${c}` : ""}  ${size}`;
  if (n.dataset.slot) s = `SLOT ${n.dataset.slot}  ${size}  reserved`;
  else if (t === "a") s += `  → ${shortHref(n.getAttribute("href"))}`;
  else if (n instanceof HTMLCanvasElement) s += `  buf ${n.width}×${n.height}`;
  else if (n instanceof HTMLImageElement) s += `  src ${n.naturalWidth}×${n.naturalHeight}`;
  else if (n instanceof HTMLIFrameElement) s += `  → ${shortHref(n.getAttribute("src"))}`;
  else if (t === "time") s += `  ${n.getAttribute("datetime")}`;
  else if (n instanceof HTMLVideoElement) s += `  ${n.videoWidth}×${n.videoHeight}`;
  return s.length > 64 ? `${s.slice(0, 63)}…` : s;
}

let skelT = 0;
function skelSoon(ms = 120) {
  clearTimeout(skelT);
  skelT = window.setTimeout(skel, ms);
}

function skel() {
  const dens = num("tags");
  L.skel.replaceChildren();
  if (dens <= 0.001) return;
  const sx = scrollX;
  const sy = scrollY;
  const rulers = on("rulers");
  const placed: [number, number, number][] = [];
  const frag = D.createDocumentFragment();
  // Read every rect first, then write: one layout.
  const items = boxes()
    .filter((b) => hash(keyOf(b), 77) <= dens * (0.55 + (PRI[b.tagName] ?? 0.45) * 0.9))
    .map((b) => ({ b, r: b.getBoundingClientRect() }))
    .filter(({ r }) => r.width >= 18 && r.height >= 8);
  const hits = (x: number, y: number, w: number) => {
    for (let i = placed.length - 1, k = 0; i >= 0 && k < 60; i--, k++) {
      const q = placed[i];
      if (x < q[0] + q[2] && x + w > q[0] && y < q[1] + 13 && y + 13 > q[1]) return true;
    }
    return false;
  };
  let n = 0;
  for (const { b, r } of items) {
    if (getComputedStyle(b).visibility === "hidden") continue;
    const txt = labelText(b, r);
    const w = txt.length * 5.6 + 8;
    const x = Math.max(rulers ? 14 : 0, r.left + sx);
    let y = r.top + sy - 13;
    if (y < (rulers ? 13 : 0)) y = r.bottom + sy + 1;
    if (hits(x, y, w)) {
      if (r.height < 44) continue;
      y = r.top + sy + 1;
      if (hits(x, y, w)) continue;
    }
    placed.push([x, y, w]);
    const d = D.createElement("span");
    d.className = b.dataset.slot ? "sk sk-slot" : "sk";
    d.textContent = txt;
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    frag.append(d);
    if (++n > 420) break;
  }
  L.skel.append(frag);
}

// ---------------------------------------------------------------------------------
// Faults

const strays: HTMLElement[] = [];
const TEXT = /^(H1|H2|H3|P|LI|A|SPAN|TIME|BUTTON|FIGCAPTION)$/;

/** Bytes 0x80-0x9F as Windows-1252 reads them; the rest of the high half is Latin-1. */
const CP1252: Record<number, string> = {
  128: "€",
  130: "‚",
  131: "ƒ",
  132: "„",
  133: "…",
  134: "†",
  135: "‡",
  136: "ˆ",
  137: "‰",
  138: "Š",
  139: "‹",
  140: "Œ",
  142: "Ž",
  145: "‘",
  146: "’",
  147: "“",
  148: "”",
  149: "•",
  150: "–",
  151: "—",
  152: "˜",
  153: "™",
  154: "š",
  155: "›",
  156: "œ",
  158: "ž",
  159: "Ÿ",
};
const UTF8 = new TextEncoder();

/** Text as a page sent in UTF-8 but read as Windows-1252 shows it: it’s → itâ€™s. */
function misread(text: string) {
  let out = "";
  for (const ch of text) {
    if (ch.charCodeAt(0) < 128) out += ch;
    else
      for (const byte of UTF8.encode(ch))
        out += byte < 160 ? (CP1252[byte] ?? "\ufffd") : String.fromCharCode(byte);
  }
  return out;
}

/** Text nodes shown misread, with what they said and what they show now. */
const MISREAD = new Map<Text, [string, string]>();

/** Misread (or restore) the text a block owns: its text nodes not inside a nearer block. */
function encoding(b: HTMLElement, wrong: boolean) {
  const walk = D.createTreeWalker(b, NodeFilter.SHOW_TEXT);
  for (let t = walk.nextNode() as Text | null; t; t = walk.nextNode() as Text | null) {
    if (t.parentElement?.closest("[data-bk]") !== b || t.parentElement.closest(".zg")) continue;
    const had = MISREAD.get(t);
    if (wrong && !had) {
      const shown = misread(t.data);
      if (shown === t.data) continue;
      MISREAD.set(t, [t.data, shown]);
      t.data = shown;
    } else if (!wrong && had) restore(t, had);
  }
}

function restore(t: Text, [said, shown]: [string, string]) {
  // React may have written new text since; then leave it.
  if (t.data === shown) t.data = said;
  MISREAD.delete(t);
}

function faults() {
  const seed = currentSeed();
  const fallback = num("fallback");
  const stuck = num("stuck");
  const overflow = num("overflow");
  const zfight = num("zfight");
  const missing = num("missing");
  const mojibake = num("mojibake");
  for (const t of [...MISREAD.keys()]) if (!t.isConnected) MISREAD.delete(t);
  for (const b of BOX) {
    if (!b.hasAttribute("data-bk")) continue;
    const k = keyOf(b);
    const t = b.tagName;
    // Missing textures: the renderer's magenta checker, or (in a media frame) an image
    // that stopped downloading partway, grey below the last row that arrived.
    if (t === "IMG" || t === "VIDEO") {
      const r = hash(k, seed * 19 + 8);
      const framed = !!b.parentElement?.matches(".mx");
      const mt = r < missing * (framed ? 0.4 : 0.75) ? "1" : framed && r < missing * 0.8 ? "2" : "";
      if (mt) {
        b.dataset.mt = mt;
        b.style.setProperty("--cut", `${Math.round(22 + hash(k, seed + 41) * 50)}%`);
      } else {
        b.removeAttribute("data-mt");
        b.style.removeProperty("--cut");
      }
    }
    encoding(b, hash(k, seed * 17 + 7) < mojibake * 0.85);
    b.style.setProperty("--h1", hash(k, seed * 3 + 1).toFixed(3));
    b.style.setProperty("--h2", hash(k, seed * 3 + 2).toFixed(3));
    const ff = TEXT.test(t) && hash(k, seed * 5 + 3) < fallback * 0.55;
    if (ff) b.dataset.ff = String(1 + Math.floor(hash(k, seed + 9) * 5));
    else b.removeAttribute("data-ff");
    const ctl = t === "A" || t === "BUTTON" || b.matches(".chip, .btn, .act");
    if (ctl && hash(k, seed * 7 + 4) < stuck * 0.55)
      b.dataset.st = String(1 + Math.floor(hash(k, seed + 11) * 3));
    else b.removeAttribute("data-st");
    const ovf =
      /^(P|H2|H3|LI|FIGCAPTION)$/.test(t) &&
      (b.textContent?.length ?? 0) > 50 &&
      hash(k, seed * 11 + 5) < overflow * 0.7;
    b.toggleAttribute("data-ovf", ovf);
    const zf =
      /^(H1|H2|H3)$/.test(t) && zfight > 0 && hash(k, seed * 13 + 6) < 0.25 + zfight * 0.75;
    let g = b.querySelector<HTMLElement>(":scope > .zg");
    if (zf) {
      if (!g) {
        g = D.createElement("span");
        g.className = "zg";
        g.setAttribute("aria-hidden", "true");
        g.textContent = (b.textContent ?? "").trim().slice(0, 160);
        if (hash(k, seed + 31) < 0.35) g.dataset.f = "serif";
        b.append(g);
      }
      b.setAttribute("data-zf", "");
    } else {
      g?.remove();
      b.removeAttribute("data-zf");
    }
  }
  // Stray Loading... boxes: the plain box from the old site, stuck where it shouldn't be.
  const want = stuck > 0.2 ? Math.min(3, Math.floor(stuck * 3.4)) : 0;
  const main = $("main");
  while (strays.length > want) strays.pop()?.remove();
  if (main) {
    for (const s of strays) if (s.parentNode !== main) main.append(s);
    while (strays.length < want) {
      const i = strays.length;
      const s = D.createElement("div");
      s.className = "loadbox f-stray";
      s.setAttribute("aria-hidden", "true");
      s.textContent = "Loading...";
      s.style.left = `${8 + hash(`stray${i}`, seed) * 70}%`;
      s.style.top = `${10 + hash(`stray-y${i}`, seed) * 75}%`;
      main.append(s);
      strays.push(s);
    }
  }
  zfLive.setPaused(!(zfight > 0) || REDUCED_MOTION);
}

function clearFaults() {
  for (const b of BOX) {
    for (const a of ["data-ff", "data-st", "data-ovf", "data-zf", "data-mt"]) b.removeAttribute(a);
  }
  for (const [t, was] of MISREAD) restore(t, was);
  smearClear();
  for (const g of $$(".zg")) g.remove();
  while (strays.length) strays.pop()?.remove();
  zfLive.setPaused(true);
}

/** Z-fighting: two coplanar layers swap ownership of stripes, 12 times a second. */
const zfLive = living({
  always: true,
  fps: 12,
  paused: true,
  notempo: true,
  tick() {
    const r = Math.random;
    H.style.setProperty("--zo", `${Math.floor(r() * 9) * 2}px`);
    H.style.setProperty("--za", `${[0, 90, 87, 93, 180][Math.floor(r() * 5)]}deg`);
    H.style.setProperty("--zw", `${(2 + Math.floor(r() * 3) + num("zfight") * 3).toFixed(0)}px`);
  },
});

/** Tearing: scroll velocity shears blocks sideways for a few frames, in steps. */
let lastY = 0;
let tearV = 0;
const tearLive = living({
  always: true,
  fps: 30,
  paused: true,
  notempo: true,
  tick() {
    const y = scrollY;
    const v = y - lastY;
    lastY = y;
    tearV = Math.abs(v) > Math.abs(tearV) ? v : tearV * 0.45;
    if (Math.abs(tearV) < 0.6) tearV = 0;
    const vh = innerHeight;
    const amp = num("tear") * clamp(tearV, -80, 80) * 0.9;
    const seed = currentSeed();
    const bk = BOX.filter((b) => b.hasAttribute("data-bk"));
    if (!amp) {
      for (const b of bk) if (TEAR.get(b)) setTear(b, 0);
      tearLive.setPaused(true);
      return;
    }
    const rects = bk.map((b) => b.getBoundingClientRect());
    bk.forEach((b, i) => {
      const r = rects[i];
      if (r.bottom < 0 || r.top > vh) return;
      const h = hash(keyOf(b), seed + 21) - 0.5;
      setTear(b, Math.round(amp * h * (Math.abs(h) > 0.3 ? 1 : 0.2)));
    });
  },
});
const TEAR = new WeakMap<HTMLElement, number>();
function setTear(b: HTMLElement, tx: number) {
  if (TEAR.get(b) === tx) return;
  TEAR.set(b, tx);
  if (tx) b.style.setProperty("--tear", `${tx}px`);
  else b.style.removeProperty("--tear");
}

/** Cursor smear: the pointer is drawn into the page and never painted over, the way a
 *  machine that has stopped repainting leaves a trail of cursors. A click or a scroll
 *  repaints. A white arrow outlined in black, at whole device pixels. */
const ARROW = [
  "1",
  "11",
  "121",
  "1221",
  "12221",
  "122221",
  "1222221",
  "12222221",
  "122222221",
  "1222222221",
  "12222211111",
  "1221221",
  "121 1221",
  "11  1221",
  "1    1221",
  "     1221",
  "      1221",
  "      1221",
  "       11",
];
let scv: HTMLCanvasElement | null = null;
let sctx: CanvasRenderingContext2D | null = null;
let sprite: HTMLCanvasElement | null = null;
let smeared = false;

function arrow(px: number) {
  const c = D.createElement("canvas");
  c.width = 11 * px;
  c.height = ARROW.length * px;
  const g = c.getContext("2d");
  if (!g) return c;
  ARROW.forEach((row, y) => {
    [...row].forEach((v, x) => {
      if (v === " ") return;
      g.fillStyle = v === "1" ? "#000" : "#fff";
      g.fillRect(x * px, y * px, px, px);
    });
  });
  return c;
}

function smearSize() {
  if (!scv) return;
  const d = devicePixelRatio || 1;
  scv.width = Math.round(innerWidth * d);
  scv.height = Math.round(innerHeight * d);
  sprite = arrow(Math.max(1, Math.round(d)));
  smeared = false;
}

function smearAt(x: number, y: number) {
  if (!scv) {
    scv = D.createElement("canvas");
    scv.className = "fxl fx-smear";
    scv.setAttribute("aria-hidden", "true");
    D.body.append(scv);
    sctx = scv.getContext("2d");
    smearSize();
  }
  if (!sctx || !sprite) return;
  const d = devicePixelRatio || 1;
  sctx.drawImage(sprite, Math.round(x * d), Math.round(y * d));
  smeared = true;
}

function smearClear() {
  if (!smeared || !sctx || !scv) return;
  sctx.clearRect(0, 0, scv.width, scv.height);
  smeared = false;
}

/** Intrusions: now and then, for a moment, a heading or a line on screen shows something
 *  else, in its own type, and then is itself again. Never twice the same way running. */
const INTRUSIONS = [
  "segment 4 out of order",
  "this heading has not been written yet",
  "TEXTURE MISSING",
  "(placeholder)",
  "undefined",
  "NaN",
  "lorem ipsum dolor sit amet",
  "[citation needed]",
  "something else was here",
  "TODO: rewrite",
  "saving…",
  "the same sentence, a moment later",
  "checksum mismatch",
  "out of memory",
  "draft 2 of 7",
  "frame dropped",
  "still loading the rest of the world",
  "this line belongs to another page",
  "copy of a copy",
  "see earlier version",
  "deprecated",
  "ERR_CONNECTION_RESET",
  "404",
  "[redacted]",
  "▒▒▒▒▒▒▒▒▒▒▒▒",
  "{{ title }}",
  "{{ dek }}",
  "null",
  "here before the page loaded",
  "written at 3:12 a.m.",
  "awaiting review",
  "overwritten",
  "the light was different then",
  "mirror of a mirror",
];
let intrT = 0;
let lastIntr = "";

function intrusionSoon() {
  clearTimeout(intrT);
  intrT = 0;
  const k = num("intrude");
  if (!(k > 0) || REDUCED_MOTION) return;
  intrT = window.setTimeout(intrude, (4500 + Math.random() * 8000) / (0.35 + k));
}

function intrude() {
  intrT = 0;
  const vh = innerHeight;
  const shown = BOX.filter((b) => {
    if (!b.hasAttribute("data-bk") || !/^(H1|H2|H3|P|LI|FIGCAPTION)$/.test(b.tagName)) return false;
    const t = (b.textContent ?? "").trim();
    if (t.length < 3 || b.querySelector("[data-bx]:not(a, span, time)")) return false;
    const r = b.getBoundingClientRect();
    return r.top > 70 && r.bottom < vh - 10 && r.width > 40 && r.height < 160;
  });
  const el = shown[Math.floor(Math.random() * shown.length)];
  if (el && !document.hidden) {
    let msg = INTRUSIONS[Math.floor(Math.random() * INTRUSIONS.length)];
    if (msg === lastIntr || Math.random() < 0.2) {
      // or its own words, the other way round
      msg = (el.textContent ?? "").trim().split(/\s+/).reverse().join(" ");
    }
    lastIntr = msg;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const o = D.createElement("span");
    o.textContent = msg;
    Object.assign(o.style, {
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      padding: cs.padding,
      color: cs.color,
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      fontStyle: cs.fontStyle,
      fontStretch: cs.fontStretch,
      letterSpacing: cs.letterSpacing,
      lineHeight: cs.lineHeight,
      textTransform: cs.textTransform,
      textAlign: cs.textAlign,
    });
    L.intr.append(o);
    el.style.visibility = "hidden";
    window.setTimeout(
      () => {
        o.remove();
        el.style.visibility = "";
      },
      240 + Math.random() * 420,
    );
  }
  intrusionSoon();
}

// ---------------------------------------------------------------------------------
// Dynamics

const BSEL =
  "main :is(h1,h2,h3,p,li,figure,.mx,.live,a.btn,.act,button,.chip,.card,.lbl,pre,.loadbox,[data-slot],time,.home-copy > *)";
const INTERACTIVE = "a,button,.chip,.btn,.act";

type Body = {
  n: HTMLElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rx: number;
  ry: number;
  vrx: number;
  vry: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  m: number;
  /** Scale offset and its velocity (recoil). */
  s: number;
  vs: number;
  /** A link or button, which leans toward the pointer instead of fleeing it. */
  ia: boolean;
  /** The pointer is over it (for recoil on entry). */
  over: boolean;
  big: boolean;
  h0: number;
  last: string;
};

let bodies: Body[] = [];
let bodiesDirty = true;
let ptr: { x: number; y: number } | null = null;
let ptrT = 0;
/** Pointer velocity, px/s, for the wake; it dies away once the pointer stops. */
let pvx = 0;
let pvy = 0;

function collectBodies() {
  bodiesDirty = false;
  const set = $$(BSEL).filter((n) => !n.closest(".cp,.fxl,dialog") && !n.matches(".f-stray"));
  const keep = set.filter((n) => !set.some((m) => m !== n && n.contains(m)));
  const kept = new Set(keep);
  for (const b of bodies) if (!kept.has(b.n)) b.n.style.transform = "";
  bodies = keep.slice(0, 320).map((n) => ({
    n,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    rx: 0,
    ry: 0,
    vrx: 0,
    vry: 0,
    cx: 0,
    cy: 0,
    w: 0,
    h: 0,
    m: 1,
    s: 0,
    vs: 0,
    ia: n.matches(INTERACTIVE),
    over: false,
    big: false,
    h0: hash(`${n.className}${n.tagName}${(n.textContent ?? "").slice(0, 20)}`, 5),
    last: "",
  }));
  measureBodies();
}

function measureBodies() {
  const sx = scrollX;
  const sy = scrollY;
  const held = bodies.map((b) => b.n.style.transform);
  for (const b of bodies) b.n.style.transform = "";
  const rects = bodies.map((b) => b.n.getBoundingClientRect());
  bodies.forEach((b, i) => {
    const r = rects[i];
    b.cx = r.left + sx + r.width / 2;
    b.cy = r.top + sy + r.height / 2;
    b.w = r.width;
    b.h = r.height;
    b.m = clamp(Math.sqrt(r.width * r.height) / 120, 0.35, 3);
    b.big = r.width * r.height > 26000;
    b.n.style.transform = held[i];
  });
}

let lastSY = 0;
/** A click's shake of the whole page (px), dying away; groove's clock. */
let shake = 0;
let grooveT = 0;
const K = 420;
const C = 2 * Math.sqrt(K) * 0.62;
const reactLive = living({
  always: true,
  fps: 60,
  paused: true,
  budget: 6,
  slow() {
    reactLive.fps = 30;
  },
  tick(dtms) {
    if (bodiesDirty) collectBodies();
    const dt = Math.min(1 / 30, dtms / 1000);
    const sub = 2;
    const h = dt / sub;
    const sy = scrollY;
    const dY = sy - lastSY;
    lastSY = sy;
    const top = sy - 200;
    const bot = sy + innerHeight + 200;
    const px = ptr ? ptr.x + scrollX : -1e6;
    const py = ptr ? ptr.y + sy : -1e6;
    const act = !!ptr && performance.now() - ptrT < 2500;
    const field = num("field");
    const magnet = num("magnet");
    const tilt = num("tilt");
    const inertia = num("inertia");
    const gravity = num("gravity");
    const wake = num("wake");
    const recoil = num("recoil");
    const groove = num("groove");
    grooveT += dt;
    // the shake: one jolt for the whole page each frame, smaller each time
    const jx = shake > 0.3 ? (Math.random() - 0.5) * shake : 0;
    const jy = shake > 0.3 ? (Math.random() - 0.5) * shake : 0;
    shake *= 0.82 ** (dt * 60);
    // the wake: the pointer's own motion, which dies away within a few frames of it stopping
    const fade = 0.8 ** (dt * 60);
    pvx *= fade;
    pvy *= fade;
    if (Math.abs(pvx) + Math.abs(pvy) < 30) pvx = pvy = 0;
    let energy = 0;
    for (const b of bodies) {
      if (b.cy + b.h / 2 < top || b.cy - b.h / 2 > bot) {
        if (b.last) {
          b.n.style.transform = "";
          b.last = "";
          b.x = b.y = b.vx = b.vy = b.rx = b.ry = b.s = b.vs = 0;
        }
        continue;
      }
      // The rest offset this block is pulled toward.
      let tx = 0;
      let ty = gravity * 14 * b.m;
      // the groove: a wave running across the page, links riding it lightly
      if (groove > 0) {
        const ph = grooveT * 5.5 - b.cx * 0.011 - b.cy * 0.004 + b.h0 * 1.5;
        const amp = groove * (b.ia ? 3 : 10);
        ty += Math.sin(ph) * amp;
        tx += Math.cos(ph * 0.5) * amp * 0.35;
      }
      let trx = 0;
      let try_ = 0;
      if (act) {
        const dx = px - b.cx;
        const dy = py - b.cy;
        const d = Math.hypot(dx, dy) || 1;
        // Everything but links and buttons is pushed away and carried along by the
        // pointer's wake; links and buttons stay put to be clicked.
        if (field > 0 && !b.ia) {
          const R = 150 + b.w * 0.15;
          const f = clamp(1 - (d - Math.min(b.w, b.h) * 0.3) / R, 0, 1);
          tx -= (dx / d) * field * 46 * f * f;
          ty -= (dy / d) * field * 46 * f * f;
        }
        if (wake > 0 && !b.ia && (pvx || pvy)) {
          const R = 120 + b.w * 0.2;
          const f = clamp(1 - (d - Math.min(b.w, b.h) * 0.3) / R, 0, 1);
          const k = (wake * 0.07 * f * dt * 60) / b.m;
          b.vx += clamp(pvx, -5000, 5000) * k;
          b.vy += clamp(pvy, -5000, 5000) * k;
        }
        if (magnet > 0 && b.ia) {
          const f = clamp(1 - d / (130 + b.w * 0.5), 0, 1);
          const cap = 6 + magnet * 14;
          tx += clamp(dx * magnet * 0.32 * f, -cap, cap);
          ty += clamp(dy * magnet * 0.32 * f, -cap * 0.6, cap * 0.6);
        }
        if (tilt > 0 && b.big) {
          const f = clamp(1 - d / (380 + b.w * 0.5), 0, 1);
          try_ = clamp(dx / (b.w * 0.5 + 60), -1, 1) * tilt * 9 * f;
          trx = -clamp(dy / (b.h * 0.5 + 60), -1, 1) * tilt * 9 * f;
        }
      }
      if (b.ia) {
        // recoil: a link or button springs as the pointer arrives on it
        const over = act && Math.abs(px - b.cx) < b.w / 2 && Math.abs(py - b.cy) < b.h / 2;
        if (over && !b.over && recoil > 0) b.vs += recoil * 2.6;
        b.over = over;
      }
      if (inertia > 0 && dY) b.vy += (-clamp(dY, -60, 60) * inertia * (6 + b.h0 * 4)) / b.m;
      for (let s = 0; s < sub; s++) {
        b.vx += (-K * (b.x - tx) - C * b.vx) * h;
        b.vy += (-K * (b.y - ty) - C * b.vy) * h;
        b.x += b.vx * h;
        b.y += b.vy * h;
        b.vrx += (-K * (b.rx - trx) - C * b.vrx) * h;
        b.vry += (-K * (b.ry - try_) - C * b.vry) * h;
        b.rx += b.vrx * h;
        b.ry += b.vry * h;
        b.vs += (-K * b.s - C * 0.7 * b.vs) * h;
        b.s += b.vs * h;
      }
      b.s = clamp(b.s, -0.3, 0.4);
      b.x = clamp(b.x, -120, 120);
      b.y = clamp(b.y, -120, 160);
      energy +=
        Math.abs(b.x - tx) +
        Math.abs(b.y - ty) +
        Math.abs(b.vx) * 0.02 +
        Math.abs(b.vy) * 0.02 +
        Math.abs(b.rx - trx) +
        Math.abs(b.ry - try_) +
        Math.abs(b.s) * 60 +
        Math.abs(b.vs);
      const X = Math.round((b.x + jx) * 4) / 4;
      const Y = Math.round((b.y + jy) * 4) / 4;
      const RX = Math.round(b.rx * 10) / 10;
      const RY = Math.round(b.ry * 10) / 10;
      const S = Math.round(b.s * 500) / 500;
      let s =
        RX || RY
          ? `perspective(900px) translate3d(${X}px,${Y}px,0) rotateX(${RX}deg) rotateY(${RY}deg)`
          : X || Y
            ? `translate3d(${X}px,${Y}px,0)`
            : "";
      if (S) s += `${s ? " " : ""}scale(${(1 + S).toFixed(3)})`;
      if (s !== b.last) {
        b.n.style.transform = s;
        b.last = s;
      }
    }
    if (energy < 0.4 && !act && !dY && !(groove > 0) && shake < 0.3) reactLive.setPaused(true);
  },
});

function kick() {
  if (reactive() && !REDUCED_MOTION && reactLive.paused) {
    lastSY = scrollY;
    reactLive.setPaused(false);
  }
}

function dynamicsOff() {
  reactLive.setPaused(true);
  for (const b of bodies) {
    b.n.style.transform = "";
    b.last = "";
    b.x = b.y = b.vx = b.vy = b.rx = b.ry = b.vrx = b.vry = b.s = b.vs = 0;
    b.over = false;
  }
  pvx = pvy = 0;
}

/** Shockwave rings: a tap's push, drawn as a 1px ring that runs out and is gone. */
const RING_S = 0.34;
let rcv: HTMLCanvasElement | null = null;
let rctx: CanvasRenderingContext2D | null = null;
let rings: { x: number; y: number; age: number }[] = [];
/** Sparks thrown from a tap, falling (px, px/s). */
let sparks: { x: number; y: number; vx: number; vy: number; age: number; c: string }[] = [];

function ring(x: number, y: number) {
  if (!rcv) {
    rcv = D.createElement("canvas");
    rcv.className = "fxl fx-ring";
    rcv.setAttribute("aria-hidden", "true");
    D.body.append(rcv);
    rctx = rcv.getContext("2d");
  }
  const d = devicePixelRatio || 1;
  const w = Math.round(innerWidth * d);
  const hgt = Math.round(innerHeight * d);
  if (rcv.width !== w || rcv.height !== hgt) {
    rcv.width = w;
    rcv.height = hgt;
  }
  rings.push({ x, y, age: 0 });
  const n = Math.round(14 + num("shock") * 26);
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2;
    const v = 260 + Math.random() * 520;
    sparks.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - 180,
      age: 0,
      c: `rgb(${oklch(0.82, 0.17, num("phos") + (Math.random() - 0.5) * 160).join(" ")})`,
    });
  }
  if (sparks.length > 240) sparks = sparks.slice(-240);
  ringLive.setPaused(false);
}

const ringLive = living({
  always: true,
  fps: 60,
  paused: true,
  notempo: true,
  tick(dtms) {
    if (!rctx || !rcv) return;
    const g = rctx;
    const d = devicePixelRatio || 1;
    g.clearRect(0, 0, rcv.width, rcv.height);
    const dt = dtms / 1000;
    for (const r of rings) r.age += dt;
    rings = rings.filter((r) => r.age < RING_S);
    for (const p of sparks) {
      p.age += dt;
      p.vy += 1400 * dt;
      p.vx *= 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    sparks = sparks.filter((p) => p.age < 0.9 && p.y < innerHeight + 10);
    const px = Math.max(3, Math.round(3.5 * d));
    for (const p of sparks) {
      g.fillStyle = p.c;
      g.fillRect(Math.round(p.x * d), Math.round(p.y * d), px, px);
    }
    if (!rings.length) {
      if (!sparks.length) ringLive.setPaused(true);
      return;
    }
    const speed = 900 + num("shock") * 900;
    g.strokeStyle = `rgb(${oklch(0.86, 0.14, num("phos")).join(" ")})`;
    g.lineWidth = Math.max(1, Math.round(d));
    g.beginPath();
    for (const r of rings) {
      const R = (14 + r.age * speed) * d;
      g.moveTo(r.x * d + R, r.y * d);
      g.arc(r.x * d, r.y * d, R, 0, Math.PI * 2);
    }
    g.stroke();
  },
});

// ---------------------------------------------------------------------------------
// Mechanics: sound

type AudioCtor = typeof AudioContext;
let ac: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audio() {
  if (ac || !(num("clack") > 0)) return ac;
  const Ctor: AudioCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ac = new Ctor();
  } catch {
    return null;
  }
  const n = Math.floor(ac.sampleRate * 0.05);
  noise = ac.createBuffer(1, n, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return ac;
}

export type ClickKind = "tick" | "detent" | "clack" | "clunk";

/** A mechanical click, when the controls' Click setting is up. */
export function click(kind: ClickKind = "tick") {
  if (!(num("clack") > 0)) return;
  const a = audio();
  if (!a || !noise) return;
  if (a.state !== "running") {
    a.resume().catch(() => {});
    return;
  }
  const t = a.currentTime;
  const g = a.createGain();
  const src = a.createBufferSource();
  const f = a.createBiquadFilter();
  src.buffer = noise;
  f.type = "bandpass";
  f.Q.value = kind === "tick" ? 7 : 2.5;
  f.frequency.value = kind === "tick" ? 3400 : kind === "detent" ? 2200 : 1500;
  const vol = num("clack") * (kind === "tick" ? 0.18 : kind === "detent" ? 0.35 : 0.7);
  const len = kind === "tick" ? 0.006 : 0.014;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f);
  f.connect(g);
  g.connect(a.destination);
  src.start(t);
  src.stop(t + len + 0.01);
  if (kind === "clack" || kind === "clunk") {
    const o = a.createOscillator();
    const og = a.createGain();
    o.frequency.setValueAtTime(kind === "clunk" ? 90 : 150, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.05);
    og.gain.setValueAtTime(vol * 0.6, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(og);
    og.connect(a.destination);
    o.start(t);
    o.stop(t + 0.07);
  }
}

function wakeAudio() {
  audio();
  if (ac?.state === "suspended") ac.resume().catch(() => {});
}

// ---------------------------------------------------------------------------------
// Mechanics: printing rows at a baud rate

const BAUD: Record<string, number> = { off: 0, "1200": 18, "300": 55, "75": 150 };
let printTok = 0;
const ROWS =
  "main :is(h1, h2, h3, .lbl, p, li, .chip, .btn, .act, figure, pre, .live, .slot, time, .mx, .acts)";

function print() {
  const dl = BAUD[String(get("baud"))] ?? 0;
  const tok = ++printTok;
  for (const n of $$("[data-bdh]")) n.removeAttribute("data-bdh");
  if (!dl || REDUCED_MOTION) return;
  const rows = $$(ROWS).filter((n) => !n.closest(".cp,.fxl,dialog"));
  const top = rows
    .filter((n) => !rows.some((m) => m !== n && n.contains(m) && !n.matches("p, h1, h2, h3, li")))
    .slice(0, 160);
  const step = Math.min(dl, 4200 / Math.max(1, top.length));
  for (const n of top) n.setAttribute("data-bdh", "");
  let i = 0;
  const next = () => {
    if (tok !== printTok) return;
    const n = top[i++];
    if (!n) return;
    n.removeAttribute("data-bdh");
    if (i % 2) click("tick");
    window.setTimeout(next, step);
  };
  window.setTimeout(next, step);
  window.setTimeout(
    () => {
      if (tok === printTok) for (const n of top) n.removeAttribute("data-bdh");
    },
    step * top.length + 2000,
  );
}

// ---------------------------------------------------------------------------------
// Mechanics: phosphor persistence of the pointer

let tcv: HTMLCanvasElement | null = null;
let tctx: CanvasRenderingContext2D | null = null;
let tdirty = 0;
let tq: [number, number][] = [];

function trailInit() {
  if (tcv) return;
  tcv = D.createElement("canvas");
  tcv.className = "fxl fx-trail";
  tcv.setAttribute("aria-hidden", "true");
  D.body.append(tcv);
  tctx = tcv.getContext("2d");
  trailSize();
}

function trailSize() {
  if (!tcv) return;
  tcv.width = innerWidth;
  tcv.height = innerHeight;
}

const trailLive = living({
  always: true,
  fps: 30,
  paused: true,
  notempo: true,
  tick() {
    if (!tctx || !tcv) return;
    const c = tctx;
    if (++tdirty % 2 === 0) {
      c.globalCompositeOperation = "destination-out";
      c.fillStyle = `rgba(0,0,0,${(0.5 - num("trail") * 0.38).toFixed(2)})`;
      c.fillRect(0, 0, tcv.width, tcv.height);
      c.globalCompositeOperation = "source-over";
    }
    c.strokeStyle = `rgb(${oklch(0.86, 0.14, num("phos")).join(" ")})`;
    c.lineWidth = 1;
    c.beginPath();
    for (const [x, y] of tq) {
      const X = Math.round(x) + 0.5;
      const Y = Math.round(y) + 0.5;
      c.moveTo(X - 4, Y);
      c.lineTo(X + 4, Y);
      c.moveTo(X, Y - 4);
      c.lineTo(X, Y + 4);
    }
    c.stroke();
    if (tq.length) {
      tdirty = 1;
      tq = [];
    } else if (tdirty > 24) {
      c.clearRect(0, 0, tcv.width, tcv.height);
      trailLive.setPaused(true);
      tdirty = 0;
    }
  },
});

// ---------------------------------------------------------------------------------
// Surface: the grain tile and its motion

let grainURL = "";
function grainTile() {
  if (grainURL) return;
  const c = D.createElement("canvas");
  c.width = c.height = 144;
  const x = c.getContext("2d");
  if (!x) return;
  const im = x.createImageData(144, 144);
  const r = rng(4242);
  for (let i = 0; i < im.data.length; i += 4) {
    const v = r() < 0.5 ? 0 : 255;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
    im.data[i + 3] = Math.floor(r() * 255);
  }
  x.putImageData(im, 0, 0);
  grainURL = c.toDataURL();
  L.grain.style.backgroundImage = `url(${grainURL})`;
}

/** Hue drift: the page's colours turn round the wheel, slowly. */
let hd = 0;
const hueLive = living({
  always: true,
  fps: 30,
  paused: true,
  tick(dt) {
    hd = (hd + (dt / 1000) * 30 * num("huedrift")) % 360;
    H.style.setProperty("--k-hd", `${hd.toFixed(1)}deg`);
  },
});

const grainLive = living({
  always: true,
  fps: 12,
  paused: true,
  notempo: true,
  tick() {
    L.grain.style.backgroundPosition = `${Math.floor(Math.random() * 144)}px ${Math.floor(Math.random() * 144)}px`;
  },
});

// ---------------------------------------------------------------------------------
// Skeleton instruments: rulers, inspector, HUD

function rulers() {
  const rx = $(".rx", L.rul);
  const ry = $(".ry", L.rul);
  if (!rx || !ry) return;
  const mk = (t: number, style: string) => {
    const s = D.createElement("span");
    s.textContent = String(t);
    s.setAttribute("style", style);
    return s;
  };
  const xs: HTMLElement[] = [];
  for (let x = 100; x < innerWidth; x += 100) xs.push(mk(x, `left:${x + 2}px`));
  const ys: HTMLElement[] = [];
  for (let y = 100; y < innerHeight; y += 100) ys.push(mk(y, `top:${y + 2}px`));
  rx.replaceChildren(...xs);
  ry.replaceChildren(...ys);
}

let insT: Element | null = null;
let insRaf = 0;
let insE: PointerEvent | null = null;

function inspect() {
  insRaf = 0;
  const e = insE;
  if (!e) return;
  if (on("rulers")) {
    const gx = $(".gx", L.rul);
    const gy = $(".gy", L.rul);
    const rd = $(".rd", L.rul);
    if (gx && gy && rd) {
      gx.style.transform = `translateY(${e.clientY}px)`;
      gy.style.transform = `translateX(${e.clientX}px)`;
      rd.textContent = `${Math.round(e.clientX)}, ${Math.round(e.clientY + scrollY)}`;
      rd.style.transform = `translate(${e.clientX + 10}px, ${e.clientY + 10}px)`;
    }
  }
  if (!on("inspect")) return;
  const t = D.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-bx]");
  const ib = $(".ib", L.ins);
  const it = $(".it", L.ins);
  if (!t || !ib || !it || t.closest(".cp,.fxl,dialog")) {
    L.ins.classList.remove("on");
    insT = null;
    return;
  }
  const r = t.getBoundingClientRect();
  ib.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
  if (t !== insT) {
    insT = t;
    const cs = getComputedStyle(t);
    const fam = cs.fontFamily.split(",")[0].replace(/["']/g, "");
    const lh = cs.lineHeight === "normal" ? "n" : Number.parseFloat(cs.lineHeight).toFixed(1);
    const bg = cs.backgroundColor === "rgba(0, 0, 0, 0)" ? "transparent" : cs.backgroundColor;
    it.innerHTML = [
      `<b>${esc(labelText(t, r))}</b>`,
      `<span>${esc(fam)} ${cs.fontWeight} ${Number.parseFloat(cs.fontSize).toFixed(1)}/${lh}</span>`,
      `<span>${esc(cs.color.replace(/\s/g, ""))} on ${esc(bg.replace(/\s/g, ""))}</span>`,
      `<span>pad ${esc(cs.padding.replace(/px/g, ""))} · mar ${esc(cs.margin.replace(/px/g, ""))}</span>`,
    ].join("");
  }
  const iw = 260;
  const x = e.clientX + 16 + iw > innerWidth ? e.clientX - iw - 12 : e.clientX + 16;
  const y = Math.min(innerHeight - 80, e.clientY + 18);
  it.style.transform = `translate(${x}px, ${y}px)`;
  L.ins.classList.add("on");
}

let hudTimer = 0;
function hud() {
  const s = loopStats();
  const awake = reactLive.paused ? 0 : bodies.length;
  const rows: [string, string | number][] = [
    ["VIEW", label()],
    ["NODES", D.getElementsByTagName("*").length],
    ["BOXES", BOX.length],
    ["LIVE", `${s.running}/${s.total}`],
    ["BODIES", `${awake}/${bodies.length}`],
    ["FRAME", `${s.frameMs.toFixed(1)}ms`],
    ["CAP", `${get("fps")}Hz`],
    ["DPR", devicePixelRatio],
    ["TIER", TIER],
    ["VP", `${innerWidth}×${innerHeight}`],
    ["Y", Math.round(scrollY)],
  ];
  L.hud.innerHTML = rows.map(([k, v]) => `<span><em>${k}</em> ${esc(v)}</span>`).join("");
}

// ---------------------------------------------------------------------------------
// Applying changes: at most once a frame, however fast the input.

const SKEL_KEYS = new Set([
  "tags",
  "wire",
  "wdth",
  "track",
  "lead",
  "face",
  "case",
  "braces",
  "horizon",
  "radius",
  "hair",
  "drift",
  "overflow",
  "fallback",
  "epoch",
  "wght",
  "rulers",
]);
const FAULT_KEYS = new Set([
  "intrude",
  "misreg",
  "zfight",
  "drift",
  "fallback",
  "stuck",
  "overflow",
  "tear",
  "missing",
  "mojibake",
  "smear",
  "seed",
]);

let pendingKeys: Set<string> | null = null;
let pendingAll = false;
let pendingHow: How | null = null;
let applyRaf = 0;

function queue(keys: string[] | null, how: How | null) {
  if (!keys) pendingAll = true;
  else {
    pendingKeys ??= new Set();
    for (const k of keys) pendingKeys.add(k);
  }
  if (how === "preset" || how === "reset") pendingHow = how;
  if (!applyRaf) applyRaf = requestAnimationFrame(flush);
}

function flush() {
  applyRaf = 0;
  const all = pendingAll;
  const keys = pendingKeys ?? new Set<string>();
  const how = pendingHow;
  pendingAll = false;
  pendingKeys = null;
  pendingHow = null;
  const has = (k: string) => all || keys.has(k);
  if (needBoxes() && boxesDirty) collect();
  if (all || [...keys].some((k) => SKEL_KEYS.has(k))) {
    if (num("tags") > 0) skelSoon(all ? 60 : 160);
    else L.skel.replaceChildren();
  }
  if (all || [...keys].some((k) => FAULT_KEYS.has(k))) {
    if (faulty()) {
      boxes();
      faults();
    } else clearFaults();
  }
  if (reactive()) {
    bodiesDirty = true;
    kick();
  } else dynamicsOff();
  if (num("grain") > 0) grainTile();
  if (num("huedrift") > 0 && !REDUCED_MOTION) hueLive.setPaused(false);
  else {
    hueLive.setPaused(true);
    hd = 0;
    H.style.removeProperty("--k-hd");
  }
  if (all || keys.has("intrude")) {
    if (num("intrude") > 0) {
      if (!intrT) intrusionSoon();
    } else clearTimeout(intrT), (intrT = 0);
  }
  grainLive.fps = Number(get("grainhz")) || 12;
  grainLive.setPaused(!(Number(get("grainhz")) > 0) || !(num("grain") > 0) || REDUCED_MOTION);
  if (on("rulers")) rulers();
  if (!on("inspect")) L.ins.classList.remove("on");
  clearInterval(hudTimer);
  if (on("hud")) {
    hud();
    hudTimer = window.setInterval(hud, 300);
  } else L.hud.replaceChildren();
  if (has("baud") && !all) print();
  if (has("clack") && !all && num("clack") > 0) {
    wakeAudio();
    click("clack");
  }
  if (!on("smear")) smearClear();
  if (!(num("trail") > 0) && tctx && tcv) {
    tctx.clearRect(0, 0, tcv.width, tcv.height);
    trailLive.setPaused(true);
  }
  if (!needBoxes() && BOX.length) {
    for (const b of BOX) unmark(b);
    BOX = [];
    boxesDirty = true;
  }
  if (how) click("clunk");
}

/** Boxes, labels and bodies follow layout changes (resize, route changes, late content). */
let relayoutT = 0;
export function relayout(ms = 160) {
  if (!started) return;
  clearTimeout(relayoutT);
  relayoutT = window.setTimeout(() => {
    boxesDirty = true;
    bodiesDirty = true;
    if (needBoxes()) collect();
    if (num("tags") > 0) skel();
    if (on("rulers")) rulers();
    trailSize();
    smearSize();
    if (reactive()) measureBodies();
  }, ms);
}

const OURS = (n: Node) =>
  !(n instanceof Element) ||
  n.matches(".sk, .fxl, .f-stray, .zg") ||
  !!n.closest(".fxl, .cp, dialog");

/** Start the runtime once; Layout calls this after the first render. */
export function startFx() {
  if (started) return;
  started = true;
  L = {
    web: layer("fx-web"),
    grain: layer("fx-grain"),
    scan: layer("fx-scan"),
    vign: layer("fx-vign"),
    grid: layer("fx-grid", `<div class="wrap">${"<i></i>".repeat(12)}</div>`),
    skel: layer("fx-skel"),
    rul: layer(
      "fx-rul",
      '<div class="rx"></div><div class="ry"></div><i class="gx"></i><i class="gy"></i><b class="rd"></b>',
    ),
    ins: layer("fx-ins", '<i class="ib"></i><div class="it"></div>'),
    hud: layer("fx-hud"),
    intr: layer("fx-intr"),
  };

  subscribe((keys, how) => queue(keys, how));

  addEventListener(
    "pointermove",
    (e) => {
      const now = performance.now();
      if (ptr && now - ptrT < 100 && now > ptrT) {
        const k = 1000 / (now - ptrT);
        pvx = pvx * 0.4 + (e.clientX - ptr.x) * k * 0.6;
        pvy = pvy * 0.4 + (e.clientY - ptr.y) * k * 0.6;
      }
      ptr = { x: e.clientX, y: e.clientY };
      ptrT = now;
      kick();
      if (on("smear") && e.pointerType === "mouse") smearAt(e.clientX, e.clientY);
      if (num("trail") > 0 && !REDUCED_MOTION) {
        trailInit();
        if (tq.length < 40) tq.push([e.clientX, e.clientY]);
        if (trailLive.paused) trailLive.setPaused(false);
      }
      if (on("inspect") || on("rulers")) {
        insE = e;
        if (!insRaf) insRaf = requestAnimationFrame(inspect);
      }
    },
    { passive: true },
  );
  D.addEventListener("pointerleave", () => {
    ptr = null;
  });
  addEventListener(
    "scroll",
    () => {
      kick();
      smearClear();
      // what is under the pointer changes as the page scrolls under it
      if (insE && (on("inspect") || on("rulers")) && !insRaf)
        insRaf = requestAnimationFrame(inspect);
      if (num("tear") > 0 && !REDUCED_MOTION && tearLive.paused) {
        boxes();
        lastY = scrollY;
        tearLive.setPaused(false);
      }
    },
    { passive: true },
  );
  addEventListener(
    "pointerdown",
    (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (num("clack") > 0) {
        wakeAudio();
        if (target?.closest("a,button,input,[role=slider]")) click("clack");
      }
      smearClear();
      if (REDUCED_MOTION || target?.closest(".cp,.hdr,dialog")) return;
      if (!(num("shock") > 0) && !(num("recoil") > 0)) return;
      if (bodiesDirty) collectBodies();
      const px = e.clientX + scrollX;
      const py = e.clientY + scrollY;
      const shock = num("shock");
      if (shock > 0) {
        ring(e.clientX, e.clientY);
        shake = Math.min(26, shake + shock * 12);
      }
      for (const b of bodies) {
        // a link or button being pressed squashes; the shock never throws it from under
        // the pointer, or the click would miss
        if (b.ia) {
          if (target && b.n.contains(target)) b.vs -= num("recoil") * 3.2;
          continue;
        }
        if (!(shock > 0)) continue;
        const dx = b.cx - px;
        const dy = b.cy - py;
        const d = Math.hypot(dx, dy) || 1;
        const m = (shock * 2200) / (1 + d / 70) / b.m;
        b.vx += (dx / d) * m;
        b.vy += (dy / d) * m;
      }
      ptr = { x: e.clientX, y: e.clientY };
      ptrT = performance.now();
      kick();
    },
    { passive: true, capture: true },
  );
  let lastTick = 0;
  D.addEventListener("pointerover", (e) => {
    if (!(num("clack") > 0) || e.pointerType !== "mouse") return;
    const a = e.target instanceof Element ? e.target.closest("a,button,input,[role=slider]") : null;
    if (!a || (e.relatedTarget instanceof Node && a.contains(e.relatedTarget))) return;
    const n = performance.now();
    if (n - lastTick < 35) return;
    lastTick = n;
    click("tick");
  });
  D.addEventListener("keydown", (e) => {
    if (num("clack") > 0 && (e.key === "Enter" || e.key === " ")) {
      wakeAudio();
      click("clack");
    }
  });

  addEventListener("resize", () => relayout());
  let mT = 0;
  new MutationObserver((ms) => {
    if (ms.every((m) => [...m.addedNodes, ...m.removedNodes].every(OURS))) return;
    clearTimeout(mT);
    mT = window.setTimeout(() => {
      boxesDirty = true;
      bodiesDirty = true;
      if (needBoxes()) collect();
      if (num("tags") > 0) skel();
      if (get("baud") !== "off") print();
    }, 200);
  }).observe(D.body, { childList: true, subtree: true });
  // Fonts can move every box.
  D.fonts?.ready.then(() => relayout(30));

  queue(null, null);
  if (get("baud") !== "off") window.setTimeout(print, 0);
}

/** The boxes the runtime currently knows about (for the panel's instruments). */
export const boxCount = () => BOX.length;
