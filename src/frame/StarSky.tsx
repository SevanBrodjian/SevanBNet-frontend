import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { getNumber } from "../controls/store";
import { COARSE, living, STILL, TIER } from "./live";
import { clamp, oklch } from "./util";

// Shooting stars behind a project page: the old site's falling streaks, redrawn at full
// resolution. Each star is a short-lived meteor with a tapered tail, drawn as a vector
// stroke every frame (no accumulated trails, so it stays sharp at any pixel density).
// Their colours drift around the hue wheel, pale and low in chroma. The sky leans toward
// the pointer, the way the old one fell toward the cursor.
// - one fixed canvas, rendered into <body> so no view can transform it
// - capped: a few dozen stars at most, fewer on small or slow devices; 60 Hz, dropping
//   to 30 if a frame costs too much; stops in hidden tabs (shared loop)
// - reduced motion, Save-Data and still devices get one still frame
// Usage: render <StarSky /> anywhere in a project page.

type Star = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  v: number;
  age: number;
  life: number;
  hue: number;
  w: number;
};

export default function StarSky({ density = 1 }: { density?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    let W = 0;
    let H = 0;
    let dpr = 1;
    let max = 0;
    const size = () => {
      dpr = Math.min(devicePixelRatio || 1, TIER === "A" ? 2 : 1.5);
      W = innerWidth;
      H = innerHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      const base = COARSE || W < 760 ? 12 : TIER === "A" ? 28 : 20;
      max = Math.max(1, Math.round(base * density));
    };
    size();

    const stars: Star[] = [];
    // Lean of the fall, in radians from straight down (positive: toward the right).
    let lean = -0.32;
    let target = -0.32;
    let ptrX: number | null = null;
    let due = 0;

    const spawn = (age = 0) => {
      const a = lean + (Math.random() - 0.5) * 0.12;
      const life = 0.55 + Math.random() * 0.8;
      stars.push({
        x: -0.15 * W + Math.random() * 1.3 * W,
        y: -0.1 * H + Math.random() * 0.85 * H,
        dx: Math.sin(a),
        dy: Math.cos(a),
        v: (360 + Math.random() * 520) * clamp(H / 900, 0.6, 1.3),
        age: age * life,
        life,
        hue: Math.random() * 360,
        w: 1.1 + Math.random() * 1.1,
      });
    };

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = "round";
      const ink = getNumber("ink");
      const phos = getNumber("phos");
      for (const s of stars) {
        const t = s.age / s.life;
        // A quick flare, then a long burn-out.
        const env = Math.min(1, t / 0.12) * (1 - t) ** 1.3;
        if (env <= 0.01) continue;
        const travelled = s.v * s.age;
        const len = Math.min(travelled, s.v * 0.22);
        const tx = s.x - s.dx * len;
        const ty = s.y - s.dy * len;
        const [r, g, b] = ink > 0.3 ? oklch(0.86, 0.14, phos) : oklch(0.8, 0.13, s.hue);
        // A faint wide glow under a sharp core.
        for (const [width, alpha] of [
          [s.w * 3.2, 0.14],
          [s.w, 0.64],
        ]) {
          const grad = ctx.createLinearGradient(s.x, s.y, tx, ty);
          grad.addColorStop(0, `rgb(${r} ${g} ${b} / ${(alpha * env).toFixed(3)})`);
          grad.addColorStop(1, `rgb(${r} ${g} ${b} / 0)`);
          ctx.strokeStyle = grad;
          ctx.lineWidth = width;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(tx, ty);
          ctx.stroke();
        }
        ctx.fillStyle = `rgb(${Math.min(255, r + 50)} ${Math.min(255, g + 50)} ${Math.min(255, b + 50)} / ${(0.9 * env).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.w * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const step = (dt: number) => {
      // The lean follows the pointer with some lag, like weather.
      target = ptrX === null ? -0.32 : clamp((ptrX / W - 0.5) * 2, -1, 1) * 0.55;
      lean += (target - lean) * Math.min(1, dt / 1.6);
      due += (dt * max) / 0.95;
      while (due >= 1 && stars.length < max) {
        spawn();
        due -= 1;
      }
      due = Math.min(due, 2);
      for (let i = stars.length - 1; i >= 0; i--) {
        const s = stars[i];
        s.age += dt;
        s.v *= 1 + 0.55 * dt;
        s.x += s.dx * s.v * dt;
        s.y += s.dy * s.v * dt;
        s.hue = (s.hue + 110 * dt) % 360;
        if (s.age >= s.life) stars.splice(i, 1);
      }
    };

    const still = () => {
      stars.length = 0;
      for (let i = 0; i < max; i++) spawn(0.15 + Math.random() * 0.5);
      for (const s of stars) {
        const d = s.v * s.age;
        s.x += s.dx * d;
        s.y += s.dy * d;
      }
      draw();
    };

    const sky = living({
      always: true,
      fps: 60,
      budget: 3,
      slow() {
        sky.fps = 30;
      },
      tick(dt) {
        step(Math.min(0.1, dt / 1000));
        draw();
      },
    });
    if (STILL) still();

    const onMove = (e: PointerEvent) => {
      ptrX = e.clientX;
    };
    const onLeave = () => {
      ptrX = null;
    };
    let rt = 0;
    const onResize = () => {
      clearTimeout(rt);
      rt = window.setTimeout(() => {
        size();
        if (STILL) still();
        else draw();
      }, 100);
    };
    addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    addEventListener("resize", onResize);
    return () => {
      sky.dispose();
      clearTimeout(rt);
      removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      removeEventListener("resize", onResize);
    };
  }, [density]);

  return createPortal(<canvas ref={canvas} className="sky" />, document.body);
}
