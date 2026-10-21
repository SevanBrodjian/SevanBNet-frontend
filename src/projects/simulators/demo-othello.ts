// The Othello half of EditWorlds: a real 20-move opening (every move uniform over the legal set,
// as the paper's generator plays) under one of the four rule variants, then a wait for the edit.
// The visitor recolours one token outside the centre four; the board then shows the cells whose
// legality changed, cyan for legal before and not after, magenta for legal only after (figures
// 5b and 12), and fills the legal moves of the edited board. A second flip of the same token
// undoes the edit; a flip of another token replaces it (one flip at a time, as in the paper).
// - the opening plays on the shared loop when it first comes on screen; STILL shows move 20
// - a mouse acts on press, a finger or pen on a tap, so a swipe that scrolls the page past the
//   board never changes it

import { living, STILL } from "../../frame/live";
import { carets, fit, local, SLOP, type Tones } from "./demo-draw";
import * as O from "./othello";

/** Moves in an opening, as the paper cuts its edit cases. */
export const OPENING = 20;
/** Milliseconds per move while the opening plays. */
const STEP_MS = 700;
/** Held on the start position before the first move. */
const LEAD_MS = 500;
const REFUSE_MS = 700;
const FIRST_SEED = 20;

// The paper's board, darkened (as the page's figure 5b): ground, rules, tokens, legal moves.
const GROUND = "#121c16";
const RULE = "#2b3830";
const LEGAL = "#b89a3c";
const WHITE = "#e8e6df";
const BLACK = "#050607";
const TOKEN_RING = "#6a6862";

export type OthReport = {
  readonly ply: number;
  readonly total: number;
  readonly playing: boolean;
  /** who the legal moves belong to (the player to move, or their opponent on a forced pass) */
  readonly player: O.Color;
  readonly before: number;
  /** after the edit, or null when there is none */
  readonly after: number | null;
  readonly changed: number | null;
  readonly rejected: O.Rejection | null;
  /** the recoloured square, or -1 */
  readonly flipped: number;
};

export type OthEvent =
  | { kind: "flip"; edit: O.Edit }
  | { kind: "unflip"; sq: number }
  | { kind: "refused"; sq: number; why: "center" | "empty" };

export type OthOptions = {
  variant: O.Variant;
  tones: Tones;
  report: (r: OthReport) => void;
  announce: (e: OthEvent) => void;
};

export type OthelloDemo = {
  setVariant: (v: O.Variant) => void;
  /** A new opening, played from the start. */
  renew: () => void;
  dispose: () => void;
};

type Layout = { d: number; W: number; H: number; bx: number; by: number; cell: number; lw: number };

export function othelloDemo(cv: HTMLCanvasElement, opts: OthOptions): OthelloDemo {
  const ctx = cv.getContext("2d") as CanvasRenderingContext2D;
  const T = opts.tones;

  let variant = opts.variant;
  let seed = FIRST_SEED;
  let boards: O.State[] = [];
  let moves: O.Move[] = [];
  let shown = 0;
  let acc = 0;
  let playing = false;
  let started = false;
  let ed: O.Edit | null = null;
  let cursor = 19;
  let keys = false;
  let hover = -1;
  let refuse = -1;
  let refuseTimer = 0;
  /** a finger or pen down on the board: a tap if it lifts close by */
  let tap: { id: number; x: number; y: number } | null = null;
  let L: Layout | null = null;
  let lastReport = "";

  function build() {
    const g = O.opening(variant, O.rng(seed));
    const s = O.start(variant);
    boards = [O.clone(s)];
    for (const m of g.moves) {
      O.play(s, m.sq);
      boards.push(O.clone(s));
    }
    moves = g.moves;
    ed = null;
    refuse = -1;
    cursor = moves[moves.length - 1]?.sq ?? 19;
  }

  const base = () => boards[OPENING];
  const now = () => boards[shown];

  function report() {
    const st = ed ? ed.state : now();
    const before = ed ? ed.before : O.legal(st);
    const r: OthReport = {
      ply: shown,
      total: OPENING,
      playing,
      player: (ed ? ed.after : before).player,
      before: before.moves.length,
      after: ed ? ed.after.moves.length : null,
      changed: ed ? ed.changed.length : null,
      rejected: ed ? ed.rejected : null,
      flipped: ed ? ed.sq : -1,
    };
    const key = JSON.stringify(r);
    if (key === lastReport) return;
    lastReport = key;
    opts.report(r);
  }

  function play(from0: boolean) {
    if (STILL) {
      shown = OPENING;
      playing = false;
    } else {
      shown = from0 ? 0 : shown;
      acc = -LEAD_MS;
      playing = shown < OPENING;
    }
    loop.setPaused(!playing);
  }

  function finish() {
    shown = OPENING;
    playing = false;
    loop.setPaused(true);
  }

  // ---------- drawing ----------

  function layout(): Layout {
    const d = cv.width / Math.max(1, cv.clientWidth);
    const W = cv.width;
    const H = cv.height;
    const top = Math.round(36 * d);
    const bot = Math.round(46 * d);
    const pad = Math.round(14 * d);
    const lw = Math.max(1, Math.round(d));
    const size = Math.min(W - 2 * pad, H - top - bot);
    const cell = Math.max(4, Math.floor((size - lw) / 8));
    const board = 8 * cell + lw;
    return {
      d,
      W,
      H,
      bx: Math.round((W - board) / 2),
      by: top + Math.round((H - top - bot - board) / 2),
      cell,
      lw,
    };
  }

  function draw() {
    if (!L) return;
    const { bx, by, cell, lw, d, W, H } = L;
    ctx.clearRect(0, 0, W, H);
    const st = ed ? ed.state : now();
    const lg = ed ? ed.after : O.legal(st);
    const legal = new Uint8Array(64);
    for (const m of lg.moves) legal[m] = 1;
    const inner = cell - lw;
    const cx = (sq: number) => bx + O.colOf(sq) * cell + lw;
    const cy = (sq: number) => by + O.rowOf(sq) * cell + lw;

    ctx.fillStyle = RULE;
    ctx.fillRect(bx, by, 8 * cell + lw, 8 * cell + lw);
    for (let sq = 0; sq < 64; sq++) {
      ctx.fillStyle = legal[sq] ? LEGAL : GROUND;
      ctx.fillRect(cx(sq), cy(sq), inner, inner);
    }

    // tokens
    const rad = inner * 0.38;
    const ring = Math.max(1, Math.round(d));
    for (let sq = 0; sq < 64; sq++) {
      const c = st.cells[sq];
      if (!c) continue;
      const x = cx(sq) + inner / 2;
      const y = cy(sq) + inner / 2;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fillStyle = c === O.BLACK ? BLACK : WHITE;
      ctx.fill();
      ctx.strokeStyle = TOKEN_RING;
      ctx.lineWidth = ring;
      ctx.stroke();
    }

    // the last move, while the opening is on screen
    if (!ed && shown > 0) {
      const m = moves[shown - 1];
      const x = cx(m.sq) + inner / 2;
      const y = cy(m.sq) + inner / 2;
      ctx.fillStyle = m.player === O.BLACK ? "#8a877f" : "#55534e";
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1.5 * d, inner * 0.07), 0, Math.PI * 2);
      ctx.fill();
    }

    // the edit: what it lost (cyan), what it gained (magenta), and the token it recoloured
    const mw = Math.max(2, Math.round(2 * d));
    const box = (sq: number, color: string, w: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.strokeRect(cx(sq) + w / 2, cy(sq) + w / 2, inner - w, inner - w);
    };
    if (ed) {
      for (const sq of ed.lost) box(sq, T.pre, mw);
      for (const sq of ed.gained) box(sq, T.post, mw);
      ctx.beginPath();
      ctx.arc(cx(ed.sq) + inner / 2, cy(ed.sq) + inner / 2, rad + mw + d, 0, Math.PI * 2);
      ctx.strokeStyle = T.post;
      ctx.lineWidth = mw;
      ctx.stroke();
    }

    if (refuse >= 0) box(refuse, T.bad, mw);

    // where a press would land: the keyboard cursor, or the token under the mouse
    const at = keys ? cursor : hover;
    if (at >= 0 && !playing) {
      const ok = O.canEdit(base(), at);
      ctx.fillStyle = ok || keys ? "rgba(236,233,226,0.9)" : "rgba(236,233,226,0.35)";
      const o = Math.round(2 * d);
      carets(ctx, cx(at) - o, cy(at) - o, inner + 2 * o, inner + 2 * o, Math.round(5 * d), lw);
    }
  }

  // ---------- pointer and keys ----------

  function cellAt(px: number, py: number) {
    if (!L) return -1;
    const c = Math.floor((px - L.bx) / L.cell);
    const r = Math.floor((py - L.by) / L.cell);
    return c >= 0 && c < 8 && r >= 0 && r < 8 ? O.at(r, c) : -1;
  }

  function press(sq: number) {
    if (sq < 0) return;
    if (shown < OPENING) {
      finish();
      after();
      return;
    }
    const b = base();
    if (!O.canEdit(b, sq)) {
      refuse = sq;
      clearTimeout(refuseTimer);
      refuseTimer = window.setTimeout(() => {
        refuse = -1;
        draw();
      }, REFUSE_MS);
      opts.announce({ kind: "refused", sq, why: b.cells[sq] ? "center" : "empty" });
      draw();
      return;
    }
    refuse = -1;
    if (ed && ed.sq === sq) {
      ed = null;
      opts.announce({ kind: "unflip", sq });
    } else {
      ed = O.edit(b, sq);
      opts.announce({ kind: "flip", edit: ed });
    }
    after();
  }

  function after() {
    draw();
    report();
  }

  function setCursor() {
    cv.style.cursor = playing ? "pointer" : hover >= 0 && O.canEdit(base(), hover) ? "pointer" : "";
  }

  const down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const [px, py] = local(cv, e);
    if (e.pointerType !== "mouse") {
      tap = { id: e.pointerId, x: px, y: py };
      return;
    }
    keys = false;
    press(cellAt(px, py));
  };

  const up = (e: PointerEvent) => {
    const t = tap;
    if (!t || e.pointerId !== t.id || !L) return;
    tap = null;
    const [px, py] = local(cv, e);
    if (Math.hypot(px - t.x, py - t.y) > SLOP * L.d) return;
    keys = false;
    press(cellAt(t.x, t.y));
  };

  const lost = (e: PointerEvent) => {
    if (tap?.id === e.pointerId) tap = null;
  };

  const move = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const [px, py] = local(cv, e);
    const h = cellAt(px, py);
    if (h === hover) return;
    hover = h;
    setCursor();
    if (!keys) draw();
  };

  const leave = () => {
    if (hover < 0) return;
    hover = -1;
    setCursor();
    draw();
  };

  const key = (e: KeyboardEvent) => {
    const dir: Record<string, [number, number]> = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
    };
    const m = dir[e.key];
    if (m) {
      e.preventDefault();
      if (keys) {
        const r = Math.min(7, Math.max(0, O.rowOf(cursor) + m[0]));
        const c = Math.min(7, Math.max(0, O.colOf(cursor) + m[1]));
        cursor = O.at(r, c);
      }
      keys = true;
      draw();
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const was = keys;
      keys = true;
      if (was || shown < OPENING) press(cursor);
      else draw();
    }
  };

  const blur = () => {
    if (!keys) return;
    keys = false;
    draw();
  };

  cv.addEventListener("pointerdown", down);
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", lost);
  cv.addEventListener("pointermove", move);
  cv.addEventListener("pointerleave", leave);
  cv.addEventListener("keydown", key);
  cv.addEventListener("blur", blur);

  // ---------- the loop ----------

  const loop = living({
    el: cv,
    fps: 30,
    budget: 4,
    paused: true,
    onVisible(visible) {
      if (visible && !started) {
        started = true;
        play(true);
        after();
      }
    },
    tick(dt) {
      if (!playing) return;
      acc += dt;
      let moved = false;
      while (acc >= STEP_MS && shown < OPENING) {
        acc -= STEP_MS;
        shown++;
        moved = true;
      }
      if (shown >= OPENING) {
        playing = false;
        loop.setPaused(true);
        moved = true;
        setCursor();
      }
      if (moved) after();
    },
  });

  const ro = new ResizeObserver(() => {
    fit(cv);
    L = layout();
    draw();
  });
  ro.observe(cv);

  build();
  if (STILL) shown = OPENING;
  fit(cv);
  L = layout();
  draw();
  report();

  return {
    setVariant(v) {
      if (v === variant) return;
      variant = v;
      seed++;
      build();
      if (started || STILL) play(true);
      after();
    },
    renew() {
      seed++;
      build();
      started = true;
      play(true);
      after();
    },
    dispose() {
      loop.dispose();
      ro.disconnect();
      clearTimeout(refuseTimer);
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("pointercancel", lost);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerleave", leave);
      cv.removeEventListener("keydown", key);
      cv.removeEventListener("blur", blur);
    },
  };
}
