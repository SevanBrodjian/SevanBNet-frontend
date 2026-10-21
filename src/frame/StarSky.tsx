import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { getNumber } from "../controls/store";
import { COARSE, living, REDUCED_MOTION, STILL, TIER } from "./live";
import { clamp, hash, oklch } from "./util";

// One small universe behind the Projects list and every project page: the same sky,
// mounted once by the layout, so it carries on unbroken from page to page (and is still
// the same sky on coming back to it later in the visit).
// - stars at many depths, drifting very slowly toward the viewer; near ones a little
//   larger and brighter, and moved a little more by the pointer and the scroll (parallax)
// - a few brighter stars with faint diffraction spikes, one that slowly brightens and fades
// - far off, a galaxy or two (tilted smudges with a brighter core) and faint clouds
// - rarely, a satellite crossing, glinting as it turns; and now and then a slow streak
// It follows the view:
// - Wireframe: its skeleton. Stars as crosshairs, the bright ones tagged with their
//   depth; galaxies as outlines, clouds as dashed rings
// - Broken: stars out of register (red and cyan), bands of sky torn sideways, the sky
//   sticking and then jumping, a few stars missing their texture
// - Hyper: warp. The stars rush past as streaks (a tap pushes harder), colours turning,
//   the view swaying with the groove
// Drawn at the screen's own resolution: every star is a round sprite rendered once at that
// resolution and stamped, so it stays a crisp disc at any pixel density and costs little;
// the far layer is rendered once and only shifted.
// - capped, fewer on small or slow devices; 30 Hz, less if a frame costs too much; stops
//   in hidden tabs (shared loop)
// - reduced motion, Save-Data and still devices get one still frame, and no warp
// - text stays clear: no stars or streaks behind blocks of words (`quiet`)

/** Blocks of words the sky stays behind, on the list and on project pages. */
const QUIET =
  "main .prose, main .cap, main figcaption, main h2, main .pj-head, main .pj-pager, main .ptitle, main .pjl-item";

/** Distances: the nearest a star comes, and the farthest. */
const ZN = 0.3;
const ZF = 1.3;
/** How fast everything drifts toward the viewer, in depth per second. */
const DRIFT = 0.0025;
/** Room around the far layer for its parallax, in CSS px. */
const MARGIN = 40;

type RGB = [number, number, number];
type Star = {
  x: number;
  y: number;
  z: number;
  b: number;
  c: number;
  tw: number;
  id: number;
  kind: "dot" | "bright" | "pulse";
};
type Streak = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  v: number;
  age: number;
  life: number;
  hue: number;
};
type Satellite = { x: number; y: number; vx: number; vy: number; ph: number };

/** The sky itself, kept for the whole visit. */
type World = {
  stars: Star[];
  seed: number;
  clock: number;
  camX: number;
  camY: number;
  streaks: Streak[];
  nextStreak: number;
  satellite: Satellite | null;
  nextSat: number;
  ids: number;
};
let world: World | null = null;

/** Star colours: mostly white, some cool, a few warm, all barely tinted; then the
 *  misregistered pair. */
const TINTS: RGB[] = [
  oklch(0.95, 0.01, 250),
  oklch(0.9, 0.045, 235),
  oklch(0.92, 0.05, 70),
  oklch(0.66, 0.22, 25),
  oklch(0.8, 0.14, 200),
];
const RED = 3;
const CYAN = 4;

/** A round point of light, `r` device px across its core, rendered once. */
function sprite(r: number, [cr, cg, cb]: RGB) {
  const R = Math.ceil(r * 3.2);
  const c = document.createElement("canvas");
  c.width = c.height = R * 2;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(R, R, 0, R, R, R);
    grad.addColorStop(0, `rgb(${cr} ${cg} ${cb} / 1)`);
    grad.addColorStop(0.3 / 3.2, `rgb(${cr} ${cg} ${cb} / 0.95)`);
    grad.addColorStop(1 / 3.2, `rgb(${cr} ${cg} ${cb} / 0.45)`);
    grad.addColorStop(1.8 / 3.2, `rgb(${cr} ${cg} ${cb} / 0.07)`);
    grad.addColorStop(1, `rgb(${cr} ${cg} ${cb} / 0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, R * 2, R * 2);
  }
  return c;
}

export default function StarSky({ page, quiet = QUIET }: { page?: string; quiet?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const remeasure = useRef<(() => void) | null>(null);

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    let W = 0;
    let H = 0;
    let F = 1;
    let dpr = 1;
    let count = 0;
    const size = () => {
      dpr = Math.min(devicePixelRatio || 1, 3);
      W = innerWidth;
      H = innerHeight;
      F = Math.max(W, H) * 0.5;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      count = COARSE || W < 760 ? 70 : TIER === "A" ? 150 : 110;
    };
    size();

    // Where the words are, in page coordinates; measured when the page changes, and now
    // and then in case something moved without resizing it.
    let blocks: [number, number, number, number][] = [];
    const measure = () => {
      blocks = [];
      if (!quiet) return;
      for (const el of document.querySelectorAll(quiet)) {
        // Words in a part of the page not laid out yet (content-visibility) are off
        // screen; measuring them would lay them out. They are measured once they show.
        if (el.checkVisibility && !el.checkVisibility({ contentVisibilityAuto: true })) continue;
        const r = el.getBoundingClientRect();
        if (r.width && r.height)
          blocks.push([r.left - 10, r.top + scrollY - 8, r.width + 20, r.height + 16]);
      }
    };
    measure();
    remeasure.current = measure;
    const main = document.querySelector("main");
    const ro = new ResizeObserver(measure);
    if (main) ro.observe(main);
    const every = window.setInterval(measure, 1200);

    // ---------- sprites: one per size and colour, at the screen's resolution ----------
    const SIZES = [0.55, 0.75, 1, 1.35, 1.8, 2.4, 3.2];
    let sprites: HTMLCanvasElement[][] = [];
    const tinted = new Map<number, HTMLCanvasElement[]>();
    const buildSprites = () => {
      sprites = TINTS.map((t) => SIZES.map((s) => sprite(s * dpr, t)));
      tinted.clear();
    };
    buildSprites();
    const bucket = (radCss: number) => {
      let k = 0;
      while (k < SIZES.length - 1 && SIZES[k + 1] <= radCss) k++;
      return k;
    };
    /** A sprite in a colour of the moment (phosphor, the hyper wheel), cached by hue. */
    const hued = (hue: number, k: number) => {
      const key = Math.round(hue / 6) * 6;
      let set = tinted.get(key);
      if (!set) {
        if (tinted.size > 70) tinted.clear();
        set = SIZES.map((s) => sprite(s * dpr, oklch(0.87, 0.13, key)));
        tinted.set(key, set);
      }
      return set[k];
    };

    // ---------- the sky: the same one for the whole visit ----------
    const w: World = world ?? {
      stars: [],
      seed: Math.random() * 1000,
      clock: 0,
      camX: 0,
      camY: 0,
      streaks: [],
      nextStreak: 6 + Math.random() * 8,
      satellite: null,
      nextSat: 14 + Math.random() * 30,
      ids: 0,
    };
    world = w;
    const star = (z = ZN + Math.random() * (ZF - ZN), kind: Star["kind"] = "dot"): Star => ({
      x: w.camX + (Math.random() - 0.5) * (W / F) * 1.1 * z,
      y: w.camY + (Math.random() - 0.5) * (H / F) * 1.1 * z,
      z,
      b: kind === "dot" ? 0.25 + 0.75 * Math.random() ** 2.2 : 0.85 + Math.random() * 0.15,
      c: Math.random() < 0.72 ? 0 : Math.random() < 0.7 ? 1 : 2,
      tw: Math.random() * 6.28,
      id: w.ids++,
      kind,
    });
    const populate = () => {
      const bright = Math.max(2, Math.round(count * 0.03));
      w.stars = Array.from({ length: count }, (_, i) =>
        star(undefined, i < bright ? "bright" : i === bright ? "pulse" : "dot"),
      );
    };
    if (w.stars.length !== count) populate();

    const project = (x: number, y: number, z: number) => {
      const sx = W / 2 + ((x - w.camX) * F) / z;
      const sy = H / 2 + ((y - w.camY) * F) / z - (scrollY * 0.025) / z;
      return [sx, sy] as const;
    };

    // ---------- the far layer: clouds and galaxies, rendered once (and for Wireframe) ----
    const far = document.createElement("canvas");
    const rnd = (k: number) => {
      const v = Math.sin(k * 127.1 + w.seed) * 43758.5453;
      return v - Math.floor(v);
    };
    let farWire = false;
    const renderFar = (wire: boolean) => {
      farWire = wire;
      far.width = Math.round((W + MARGIN * 2) * dpr);
      far.height = Math.round((H + MARGIN * 2) * dpr);
      const g = far.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, MARGIN * dpr, MARGIN * dpr);
      const [wr, wg, wb] = oklch(0.86, 0.14, getNumber("phos"));
      // two faint clouds of colour, very deep
      [218, 280].forEach((hue, i) => {
        const cx = W * (0.2 + 0.6 * rnd(i + 1));
        const cy = H * (0.2 + 0.6 * rnd(i + 7));
        const R = Math.max(W, H) * (0.35 + 0.2 * rnd(i + 3));
        if (wire) {
          g.strokeStyle = `rgb(${wr} ${wg} ${wb} / 0.16)`;
          g.lineWidth = 1;
          g.setLineDash([3, 6]);
          g.beginPath();
          g.arc(cx, cy, R * 0.45, 0, Math.PI * 2);
          g.stroke();
          g.setLineDash([]);
          g.fillStyle = `rgb(${wr} ${wg} ${wb} / 0.4)`;
          g.font = "9px ui-monospace, Menlo, monospace";
          g.fillText(`NEB-${i + 1}  r ${Math.round(R * 0.45)}`, cx + R * 0.32, cy - R * 0.32);
          return;
        }
        const [cr, cg, cb] = oklch(0.42, 0.08, hue);
        const a = 0.035 + 0.02 * rnd(i + 5);
        const grad = g.createRadialGradient(cx, cy, 0, cx, cy, R);
        grad.addColorStop(0, `rgb(${cr} ${cg} ${cb} / ${a.toFixed(3)})`);
        grad.addColorStop(0.6, `rgb(${cr} ${cg} ${cb} / ${(a * 0.35).toFixed(3)})`);
        grad.addColorStop(1, `rgb(${cr} ${cg} ${cb} / 0)`);
        g.fillStyle = grad;
        g.fillRect(cx - R, cy - R, R * 2, R * 2);
      });
      // a galaxy or two: tilted smudges with a brighter core, out at the sides
      const n = W < 760 ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const gx = W * (i % 2 ? 0.83 + 0.12 * rnd(i + 11) : 0.04 + 0.12 * rnd(i + 11));
        const gy = H * (0.12 + 0.6 * rnd(i + 13));
        const len = 14 + 22 * rnd(i + 17);
        const flat = 0.22 + 0.35 * rnd(i + 19);
        g.save();
        g.translate(gx, gy);
        g.rotate(rnd(i + 23) * Math.PI);
        g.scale(1, flat);
        if (wire) {
          g.strokeStyle = `rgb(${wr} ${wg} ${wb} / 0.5)`;
          g.lineWidth = 1 / flat;
          g.beginPath();
          g.arc(0, 0, len, 0, Math.PI * 2);
          g.stroke();
          g.restore();
          g.fillStyle = `rgb(${wr} ${wg} ${wb} / 0.5)`;
          g.font = "9px ui-monospace, Menlo, monospace";
          g.fillText(`GAL-${i + 1}`, gx + len + 4, gy + 3);
          continue;
        }
        const [cr, cg, cb] = oklch(0.9, 0.03, 60 + 160 * rnd(i + 29));
        const grad = g.createRadialGradient(0, 0, 0, 0, 0, len);
        grad.addColorStop(0, `rgb(${cr} ${cg} ${cb} / 0.3)`);
        grad.addColorStop(0.18, `rgb(${cr} ${cg} ${cb} / 0.135)`);
        grad.addColorStop(0.55, `rgb(${cr} ${cg} ${cb} / 0.03)`);
        grad.addColorStop(1, `rgb(${cr} ${cg} ${cb} / 0)`);
        g.fillStyle = grad;
        g.beginPath();
        g.arc(0, 0, len, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    };
    renderFar(getNumber("wire") > 0.2);

    // ---------- the state of the view ----------
    let frozenUntil = 0;
    let boost = 0;

    const draw = () => {
      const wire = getNumber("wire") > 0.2;
      if (wire !== farWire) renderFar(wire);
      const tags = getNumber("tags");
      const misreg = getNumber("misreg");
      const missing = getNumber("missing");
      const tear = getNumber("tear");
      const warp = REDUCED_MOTION ? 0 : getNumber("frenzy") * (1 + boost * 3);
      const drift = getNumber("huedrift");
      const ink = getNumber("ink") > 0.3 ? getNumber("phos") : null;
      const [wr, wg, wb] = oklch(0.86, 0.14, getNumber("phos"));

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, cv.width, cv.height);

      // the far layer, shifted only a little by the camera: it is very far away
      ctx.drawImage(
        far,
        Math.round((-MARGIN - w.camX * F * 0.15) * dpr),
        Math.round((-MARGIN - w.camY * F * 0.15 - scrollY * 0.006) * dpr),
      );

      // stars and streaks stay out from behind the words
      ctx.save();
      if (blocks.length) {
        const sy = scrollY;
        const open = new Path2D();
        open.rect(0, 0, cv.width, cv.height);
        for (const [x, y, bw, bh] of blocks)
          if (y - sy < H && y + bh - sy > 0) open.rect(x * dpr, (y - sy) * dpr, bw * dpr, bh * dpr);
        ctx.clip(open, "evenodd");
      }

      const speed = DRIFT * (1 + warp * 150);
      for (const s of w.stars) {
        const [x, y] = project(s.x, s.y, s.z);
        if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue;
        const near = (ZF - s.z) / (ZF - ZN); // 0 far .. 1 near
        const enter = clamp((ZF - s.z) / 0.12, 0, 1);
        let a = s.b * (0.3 + 0.7 * near ** 1.4) * enter;
        let rad = 0.55 + 0.75 * near ** 2;
        if (s.kind === "bright") rad += 0.6;
        if (s.kind === "pulse") {
          a *= 0.55 + 0.45 * Math.sin(w.clock * 0.7 + s.tw);
          rad += 0.3;
        } else a *= 1 + 0.04 * Math.sin(w.clock * 0.5 + s.tw);
        if (a < 0.03) continue;
        const X = x * dpr;
        const Y = y * dpr;
        const hue = drift > 0 ? (s.c * 90 + s.z * 220 + w.clock * 60 * drift) % 360 : null;

        // Wireframe: a crosshair, and the bright ones carry their depth
        if (wire) {
          const L = (2 + 2.5 * near) * dpr;
          ctx.globalAlpha = clamp(a * 1.2, 0, 1);
          ctx.fillStyle = `rgb(${wr} ${wg} ${wb})`;
          ctx.fillRect(X - L, Y - 0.5 * dpr, L * 2, Math.max(1, dpr));
          ctx.fillRect(X - 0.5 * dpr, Y - L, Math.max(1, dpr), L * 2);
          if (tags > 0 && (s.kind !== "dot" || hash(`${s.id}`, 3) < tags * 0.12)) {
            ctx.globalAlpha = clamp(a * 0.8, 0, 0.7);
            ctx.font = `${9 * dpr}px ui-monospace, Menlo, monospace`;
            ctx.fillText(`z ${s.z.toFixed(2)}`, X + L + 3 * dpr, Y - 3 * dpr);
          }
          continue;
        }

        // Broken: a few stars have lost their texture
        if (missing > 0 && hash(`${s.id}`, 7) < missing * 0.2) {
          const q = Math.max(2, Math.round(2 * dpr));
          ctx.globalAlpha = clamp(a * 1.5, 0, 1);
          for (let i = 0; i < 2; i++)
            for (let j = 0; j < 2; j++) {
              ctx.fillStyle = (i + j) % 2 ? "#000" : "#f0f";
              ctx.fillRect(X - q + i * q, Y - q + j * q, q, q);
            }
          continue;
        }

        // Hyper: warp. Each star drawn along the way it has just come
        if (speed > DRIFT * 4) {
          const trail = Math.min(0.32, speed * 0.16);
          const [px, py] = project(s.x, s.y, Math.min(ZF + 0.4, s.z + trail));
          const [r, g, b] = hue !== null ? oklch(0.86, 0.13, hue) : TINTS[s.c];
          ctx.globalAlpha = clamp(a * 1.3, 0, 1);
          ctx.strokeStyle = `rgb(${r} ${g} ${b})`;
          ctx.lineWidth = Math.max(1, rad * dpr * 0.9);
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(px * dpr, py * dpr);
          ctx.lineTo(X, Y);
          ctx.stroke();
          continue;
        }

        const k = bucket(rad);
        const sp = ink !== null ? hued(ink, k) : hue !== null ? hued(hue, k) : sprites[s.c][k];
        // Broken: out of register, a red and a cyan copy either side
        if (misreg > 0) {
          const o = (0.8 + misreg * 5) * dpr;
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = clamp(a * 0.75, 0, 1);
          ctx.drawImage(sprites[RED][k], X - o - sp.width / 2, Y - sp.height / 2);
          ctx.drawImage(sprites[CYAN][k], X + o - sp.width / 2, Y - sp.height / 2);
          ctx.globalCompositeOperation = "source-over";
        }
        ctx.globalAlpha = clamp(a, 0, 1);
        ctx.drawImage(sp, X - sp.width / 2, Y - sp.height / 2);
        if (s.kind === "bright") {
          // faint diffraction spikes, as a telescope sees a bright star
          const [cr, cg, cb] = ink !== null ? [wr, wg, wb] : TINTS[s.c];
          const L = (7 + 9 * near) * dpr;
          const t = Math.max(1, 0.6 * dpr);
          ctx.globalAlpha = clamp(a * 0.5, 0, 1);
          for (const [dx, dy] of [
            [1, 0],
            [0, 1],
          ]) {
            const grad = ctx.createLinearGradient(X - dx * L, Y - dy * L, X + dx * L, Y + dy * L);
            grad.addColorStop(0, `rgb(${cr} ${cg} ${cb} / 0)`);
            grad.addColorStop(0.5, `rgb(${cr} ${cg} ${cb} / 0.9)`);
            grad.addColorStop(1, `rgb(${cr} ${cg} ${cb} / 0)`);
            ctx.fillStyle = grad;
            ctx.fillRect(
              X - (dx ? L : t / 2),
              Y - (dy ? L : t / 2),
              dx ? L * 2 : t,
              dy ? L * 2 : t,
            );
          }
        }
      }

      // a satellite: a dim point gliding across, glinting now and then as it tumbles
      if (w.satellite && !wire) {
        const s = w.satellite;
        const glint = Math.max(0, Math.sin(w.clock * 1.9 + s.ph)) ** 12;
        const k = bucket(0.6 + glint * 0.6);
        const sp = ink !== null ? hued(ink, k) : sprites[0][k];
        ctx.globalAlpha = clamp(0.32 + 0.6 * glint, 0, 1);
        ctx.drawImage(sp, s.x * dpr - sp.width / 2, s.y * dpr - sp.height / 2);
      }

      // now and then, a short, slow streak of colour
      ctx.globalAlpha = 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round";
      for (const s of w.streaks) {
        const t = s.age / s.life;
        const env = Math.min(1, t / 0.25) * (1 - t) ** 1.2;
        if (env <= 0.01) continue;
        const len = Math.min(s.v * s.age, s.v * 0.6);
        const tx = s.x - s.dx * len;
        const ty = s.y - s.dy * len;
        const [r, g, b] =
          ink !== null || wire ? [wr, wg, wb] : oklch(0.84, warp > 0 ? 0.15 : 0.09, s.hue);
        const grad = ctx.createLinearGradient(s.x, s.y, tx, ty);
        grad.addColorStop(0, `rgb(${r} ${g} ${b} / ${(0.34 * env).toFixed(3)})`);
        grad.addColorStop(1, `rgb(${r} ${g} ${b} / 0)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;

      // Broken: now and then a band of the sky slips sideways
      if (tear > 0 && Math.random() < tear * 0.18) {
        const bands = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < bands; i++) {
          const y = Math.floor(Math.random() * cv.height);
          const h = Math.floor((8 + Math.random() * 60) * dpr);
          const dx = Math.round((Math.random() - 0.5) * 90 * tear * dpr);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(cv, 0, y, cv.width, h, dx, y, cv.width, h);
        }
      }
    };

    const step = (dt: number) => {
      // Broken: now and then the sky sticks, then jumps on
      const stuck = getNumber("stuck");
      const now = performance.now();
      if (now < frozenUntil) return false;
      if (stuck > 0 && Math.random() < stuck * 0.012) {
        frozenUntil = now + 300 + Math.random() * 800;
        return false;
      }
      w.clock += dt;
      const warp = REDUCED_MOTION ? 0 : getNumber("frenzy");
      const groove = getNumber("groove");
      boost = Math.max(0, boost - dt * 0.8);
      // the camera follows the pointer a very little, slowly (in warp: it steers)
      const steer = 0.02 * (1 + warp * 6);
      let tx = ptrX === null ? 0 : (ptrX / W - 0.5) * steer;
      let ty = ptrY === null ? 0 : (ptrY / H - 0.5) * steer * 0.7;
      if (groove > 0) {
        tx += Math.sin(w.clock * 1.3) * 0.03 * groove;
        ty += Math.cos(w.clock * 0.9) * 0.02 * groove;
      }
      const ease = Math.min(1, dt / (warp > 0 ? 0.6 : 2));
      w.camX += (tx - w.camX) * ease;
      w.camY += (ty - w.camY) * ease;
      const speed = DRIFT * (1 + warp * (1 + boost * 3) * 150);
      for (const s of w.stars) {
        s.z -= speed * dt;
        // past the viewer, or drifted out of view: back to the far distance
        const [x, y] = project(s.x, s.y, s.z);
        if (s.z < ZN || x < -40 || y < -40 - H || x > W + 40 || y > 2 * H + 40)
          Object.assign(s, star(ZF, s.kind));
      }
      w.nextStreak -= dt * (1 + warp * 8);
      if (w.nextStreak <= 0) {
        w.nextStreak = 9 + Math.random() * 10;
        const a = (Math.random() < 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.5);
        w.streaks.push({
          x: W * (0.1 + Math.random() * 0.8),
          y: H * (0.05 + Math.random() * 0.5),
          dx: Math.sin(a),
          dy: Math.cos(a),
          v: (90 + Math.random() * 70) * (1 + warp * 2),
          age: 0,
          life: 1.4 + Math.random() * 0.9,
          hue: Math.random() * 360,
        });
      }
      for (let i = w.streaks.length - 1; i >= 0; i--) {
        const s = w.streaks[i];
        s.age += dt;
        s.x += s.dx * s.v * dt;
        s.y += s.dy * s.v * dt;
        s.hue = (s.hue + 20 * dt) % 360;
        if (s.age >= s.life) w.streaks.splice(i, 1);
      }
      const sat = w.satellite;
      if (sat) {
        sat.x += sat.vx * dt;
        sat.y += sat.vy * dt;
        if (sat.x < -20 || sat.x > W + 20 || sat.y < -20 || sat.y > H + 20) w.satellite = null;
      } else {
        w.nextSat -= dt;
        if (w.nextSat <= 0) {
          w.nextSat = 40 + Math.random() * 50;
          const left = Math.random() < 0.5;
          const v = 14 + Math.random() * 12;
          const ang = (Math.random() - 0.5) * 0.7;
          w.satellite = {
            x: left ? -10 : W + 10,
            y: H * (0.1 + Math.random() * 0.7),
            vx: (left ? 1 : -1) * v * Math.cos(ang),
            vy: v * Math.sin(ang),
            ph: Math.random() * 6,
          };
        }
      }
      return true;
    };

    const sky = living({
      always: true,
      fps: 30,
      budget: 4,
      slow() {
        sky.fps = Math.max(15, sky.fps - 10);
      },
      tick(dt) {
        if (step(Math.min(0.1, dt / 1000))) draw();
      },
    });
    if (STILL) draw();

    let ptrX: number | null = null;
    let ptrY: number | null = null;
    const onMove = (e: PointerEvent) => {
      ptrX = e.clientX;
      ptrY = e.clientY;
    };
    const onLeave = () => {
      ptrX = ptrY = null;
    };
    // Hyper: a tap pushes the warp harder for a moment
    const onDown = () => {
      if (getNumber("frenzy") > 0) boost = 1;
    };
    let rt = 0;
    const onResize = () => {
      clearTimeout(rt);
      rt = window.setTimeout(() => {
        const was = dpr;
        size();
        measure();
        if (dpr !== was) buildSprites();
        if (w.stars.length !== count) populate();
        renderFar(farWire);
        draw();
      }, 100);
    };
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    addEventListener("resize", onResize);
    // A still sky is redrawn when the page scrolls (parallax, and the words stay clear).
    let sq = 0;
    let lastMeasure = 0;
    const onScroll = () => {
      const now = performance.now();
      if (now - lastMeasure > 400) {
        lastMeasure = now;
        measure();
      }
      if (STILL && !sq)
        sq = requestAnimationFrame(() => {
          sq = 0;
          draw();
        });
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => {
      remeasure.current = null;
      sky.dispose();
      ro.disconnect();
      clearInterval(every);
      removeEventListener("scroll", onScroll);
      cancelAnimationFrame(sq);
      clearTimeout(rt);
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerleave", onLeave);
      removeEventListener("resize", onResize);
    };
  }, [quiet]);

  // A new page under the same sky: find its words once it has drawn.
  useEffect(() => {
    if (page === undefined) return;
    const a = requestAnimationFrame(() => remeasure.current?.());
    const t = window.setTimeout(() => remeasure.current?.(), 350);
    return () => {
      cancelAnimationFrame(a);
      clearTimeout(t);
    };
  }, [page]);

  return createPortal(<canvas ref={canvas} className="sky" />, document.body);
}
