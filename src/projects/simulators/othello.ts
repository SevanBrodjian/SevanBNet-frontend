// Othello as the paper plays it: the generator of Li et al. (2023) and its four rule variants.
// Placement decides where a token may go: enclosing a line of opponent tokens (the game), or
// anywhere touching a token of your own colour, diagonals included. Flip decides whether the
// tokens a move encloses change colour. Every move is drawn uniformly from the legal set, a
// player passes only when they have no legal move, and a game ends when neither can move.
// An edit recolours one occupied square outside the centre four, and is judged by the legal
// moves of the board before and after it, under the variant's own placement rule.
// Squares are numbered row-major from the top-left, 0..63, as in the paper's code.
// Pure, no DOM and no imports: Node runs it as it is.

export type Variant = "standard" | "adjacent-flip" | "adjacent-noflip" | "standard-noflip";
export type Placement = "enclosure" | "adjacent";
export type Rules = { readonly placement: Placement; readonly flip: boolean };

/** In the paper's order: the game, placement changed, both changed, flipping removed. */
export const VARIANTS: readonly Variant[] = [
  "standard",
  "adjacent-flip",
  "adjacent-noflip",
  "standard-noflip",
];

export const RULES: Readonly<Record<Variant, Rules>> = {
  standard: { placement: "enclosure", flip: true },
  "adjacent-flip": { placement: "adjacent", flip: true },
  "adjacent-noflip": { placement: "adjacent", flip: false },
  "standard-noflip": { placement: "enclosure", flip: false },
};

export type Color = 1 | -1;
export const BLACK = 1;
export const WHITE = -1;

/** Labels of the mine/theirs board, relative to the player about to move (the paper's frame). */
export const BLANK = 0;
export const MINE = 1;
export const THEIRS = 2;

/** The four centre squares: occupied from the start, never played, never edited. */
export const CENTER: readonly number[] = [27, 28, 35, 36];
export const isCenter = (sq: number) => sq === 27 || sq === 28 || sq === 35 || sq === 36;

export const at = (row: number, col: number) => row * 8 + col;
export const rowOf = (sq: number) => sq >> 3;
export const colOf = (sq: number) => sq & 7;
/** Li et al.'s square names: row letter a..h from the top, then column 1..8. */
export const squareName = (sq: number) => "abcdefgh"[sq >> 3] + ((sq & 7) + 1);
/** The colour standard-noflip fixes for a cell: the start position's checkerboard, extended. */
export const checkerColor = (sq: number): Color => (((sq >> 3) + (sq & 7)) & 1 ? BLACK : WHITE);

// ── geometry: rays and neighbourhoods, built once ───────────────────────────

// the vendor's direction order
const DIRS = [
  [-1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
];
/** RAY[(sq * 8 + d) * 7 + k]: the k-th square outward from sq in direction d; RAYN its length */
const RAY = new Int8Array(64 * 8 * 7);
const RAYN = new Uint8Array(64 * 8);
/** NBR[sq * 8 + i]: the 8-neighbourhood of sq; NBRN its size */
const NBR = new Int8Array(64 * 8);
const NBRN = new Uint8Array(64);
for (let sq = 0; sq < 64; sq++) {
  const r = sq >> 3;
  const c = sq & 7;
  for (let d = 0; d < 8; d++) {
    const [dr, dc] = DIRS[d];
    let n = 0;
    for (let k = 1; k < 8; k++) {
      const rr = r + dr * k;
      const cc = c + dc * k;
      if (rr < 0 || rr > 7 || cc < 0 || cc > 7) break;
      RAY[(sq * 8 + d) * 7 + n++] = rr * 8 + cc;
    }
    RAYN[sq * 8 + d] = n;
    if (n > 0) NBR[sq * 8 + NBRN[sq]++] = RAY[(sq * 8 + d) * 7];
  }
}

// ── rules on a bare board ───────────────────────────────────────────────────

/**
 * The tokens a `color` token placed on `sq` encloses, nearest first along each line. Flipping
 * recolours exactly these, under either placement rule.
 */
export function captures(cells: Int8Array, sq: number, color: Color): number[] {
  const out: number[] = [];
  for (let d = 0; d < 8; d++) {
    const k = sq * 8 + d;
    const n = RAYN[k];
    const o = k * 7;
    let i = 0;
    while (i < n && cells[RAY[o + i]] === -color) i++;
    if (i > 0 && i < n && cells[RAY[o + i]] === color) {
      for (let j = 0; j < i; j++) out.push(RAY[o + j]);
    }
  }
  return out;
}

function encloses(cells: Int8Array, sq: number, color: Color) {
  for (let d = 0; d < 8; d++) {
    const k = sq * 8 + d;
    const n = RAYN[k];
    const o = k * 7;
    let i = 0;
    while (i < n && cells[RAY[o + i]] === -color) i++;
    if (i > 0 && i < n && cells[RAY[o + i]] === color) return true;
  }
  return false;
}

function touches(cells: Int8Array, sq: number, color: Color) {
  const o = sq * 8;
  for (let i = 0; i < NBRN[sq]; i++) if (cells[NBR[o + i]] === color) return true;
  return false;
}

/** May `color` place a token on `sq` under this placement rule (ignoring whose turn it is)? */
export function isLegalFor(cells: Int8Array, sq: number, color: Color, placement: Placement) {
  if (cells[sq] !== 0) return false;
  return placement === "adjacent" ? touches(cells, sq, color) : encloses(cells, sq, color);
}

/** Every square `color` may play, ascending. */
export function movesFor(cells: Int8Array, color: Color, placement: Placement): number[] {
  const out: number[] = [];
  for (let sq = 0; sq < 64; sq++) if (isLegalFor(cells, sq, color, placement)) out.push(sq);
  return out;
}

// ── positions and play ──────────────────────────────────────────────────────

export type State = {
  readonly variant: Variant;
  /** 64 cells, row-major from the top-left: 1 black, -1 white, 0 empty */
  readonly cells: Int8Array;
  /**
   * The player nominally to move: black at the start, then the opponent of whoever moved last.
   * The mine/theirs frame is relative to this player, even when they are about to pass.
   */
  next: Color;
  /** moves played (an edit plays none) */
  ply: number;
};

/** The start position: white on the two centre squares of the main diagonal, black to move. */
export function start(variant: Variant = "standard"): State {
  const cells = new Int8Array(64);
  cells[27] = WHITE;
  cells[28] = BLACK;
  cells[35] = BLACK;
  cells[36] = WHITE;
  return { variant, cells, next: BLACK, ply: 0 };
}

export function clone(s: State): State {
  return { variant: s.variant, cells: s.cells.slice(), next: s.next, ply: s.ply };
}

export type Legal = {
  /** who moves: the player to move, or their opponent when they must pass */
  readonly player: Color;
  /** the legal squares, ascending; empty when the game is over */
  readonly moves: number[];
  /** the player to move has no legal move, so the opponent moves again */
  readonly pass: boolean;
};

/**
 * The legal moves, as the paper's generator sees them: the player to move's, or after a forced
 * pass their opponent's, or none when neither can move and the game is over.
 */
export function legal(s: State): Legal {
  const { placement } = RULES[s.variant];
  const own = movesFor(s.cells, s.next, placement);
  if (own.length > 0) return { player: s.next, moves: own, pass: false };
  const other = -s.next as Color;
  const theirs = movesFor(s.cells, other, placement);
  if (theirs.length > 0) return { player: other, moves: theirs, pass: true };
  return { player: s.next, moves: theirs, pass: false };
}

export const isOver = (s: State) => legal(s).moves.length === 0;

export type Move = {
  readonly sq: number;
  readonly player: Color;
  /** the tokens it recoloured, nearest first along each line; always empty without flipping */
  readonly flipped: number[];
  /** the player to move had no legal move and passed, so `player` moved again */
  readonly pass: boolean;
};

/** Plays `sq` in place and returns what happened. Throws unless `sq` is in legal(s).moves. */
export function play(s: State, sq: number): Move {
  const { placement, flip } = RULES[s.variant];
  let player = s.next;
  let pass = false;
  if (!isLegalFor(s.cells, sq, player, placement)) {
    // a pass is forced, never chosen: the opponent may move only if the mover cannot
    const other = -player as Color;
    if (!isLegalFor(s.cells, sq, other, placement) || movesFor(s.cells, player, placement).length) {
      throw new Error(`othello: ${squareName(sq)} is not a legal move`);
    }
    player = other;
    pass = true;
  }
  const flipped = flip ? captures(s.cells, sq, player) : [];
  for (const f of flipped) s.cells[f] = player;
  s.cells[sq] = player;
  s.next = -player as Color;
  s.ply++;
  return { sq, player, flipped, pass };
}

export type Game = { readonly state: State; readonly moves: Move[] };

/** The position after a list of moves. Throws on an illegal move. */
export function replay(history: readonly number[], variant: Variant = "standard"): Game {
  const state = start(variant);
  const moves = history.map((sq) => play(state, sq));
  return { state, moves };
}

/** A game drawn as the paper's generator draws it, uniformly from the legal moves each turn. */
export function randomGame(variant: Variant, rand: () => number, maxPly = 60): Game {
  const state = start(variant);
  const moves: Move[] = [];
  while (state.ply < maxPly) {
    const { moves: ok } = legal(state);
    if (ok.length === 0) break;
    moves.push(play(state, ok[Math.floor(rand() * ok.length)]));
  }
  return { state, moves };
}

/**
 * A real opening of `n` uniform moves, as the edit cases are cut: from a game that goes on past
 * move n, so the board it leaves still has a legal move. Games that end sooner are redrawn.
 */
export function opening(variant: Variant, rand: () => number, n = 20): Game {
  for (let tries = 0; tries < 10000; tries++) {
    const g = randomGame(variant, rand, n);
    if (g.state.ply === n && !isOver(g.state)) return g;
  }
  throw new Error(`othello: no ${variant} game reached move ${n}`);
}

/** The board as the paper describes it: 0 blank, 1 mine, 2 theirs, for the player to move. */
export function mineTheirs(s: State): Int8Array {
  const out = new Int8Array(64);
  for (let sq = 0; sq < 64; sq++) {
    const v = s.cells[sq];
    out[sq] = v === 0 ? BLANK : v === s.next ? MINE : THEIRS;
  }
  return out;
}

export function counts(s: State) {
  let black = 0;
  let white = 0;
  for (let sq = 0; sq < 64; sq++) {
    if (s.cells[sq] === BLACK) black++;
    else if (s.cells[sq] === WHITE) white++;
  }
  return { black, white, empty: 64 - black - white };
}

// ── edits ───────────────────────────────────────────────────────────────────

/** The paper discards a flip that leaves the legal moves unchanged, or leaves none. */
export type Rejection = "unchanged" | "empty";

export type Edit = {
  readonly sq: number;
  /** the token's colour before the edit */
  readonly from: Color;
  /** the edited board: the same position with one token recoloured, the same player to move */
  readonly state: State;
  readonly before: Legal;
  readonly after: Legal;
  /** legal before and not after, ascending */
  readonly lost: number[];
  /** legal after and not before, ascending */
  readonly gained: number[];
  /** the cells whose legality the flip changes (lost and gained): what Edit Index scores */
  readonly changed: number[];
  /** why the paper would discard this edit, or null if it is a valid case */
  readonly rejected: Rejection | null;
};

/** An edit may recolour any occupied square outside the centre four. */
export const canEdit = (s: State, sq: number) =>
  sq >= 0 && sq < 64 && s.cells[sq] !== 0 && !isCenter(sq);

/**
 * The board with one token recoloured and nothing else changed, not even whose turn it is. It
 * need not be a board any legal game reaches.
 */
export function recolor(s: State, sq: number): State {
  if (!canEdit(s, sq)) throw new Error(`othello: ${squareName(sq)} cannot be edited`);
  const t = clone(s);
  t.cells[sq] = -t.cells[sq];
  return t;
}

/** Recolours `sq` and compares the legal moves before and after. */
export function edit(s: State, sq: number, before: Legal = legal(s)): Edit {
  const state = recolor(s, sq);
  const after = legal(state);
  const was = new Uint8Array(64);
  const is = new Uint8Array(64);
  for (const m of before.moves) was[m] = 1;
  for (const m of after.moves) is[m] = 1;
  const lost: number[] = [];
  const gained: number[] = [];
  const changed: number[] = [];
  for (let q = 0; q < 64; q++) {
    if (was[q] === is[q]) continue;
    (was[q] ? lost : gained).push(q);
    changed.push(q);
  }
  const rejected: Rejection | null =
    after.moves.length === 0 ? "empty" : changed.length === 0 ? "unchanged" : null;
  return { sq, from: s.cells[sq] as Color, state, before, after, lost, gained, changed, rejected };
}

/** Every edit this board allows, valid or not, by square. */
export function edits(s: State): Edit[] {
  const before = legal(s);
  const out: Edit[] = [];
  for (let sq = 0; sq < 64; sq++) if (canEdit(s, sq)) out.push(edit(s, sq, before));
  return out;
}

/**
 * A random valid edit, drawn as the paper draws its cases: the editable squares in random
 * order, the first one that is not rejected. Null if every flip is rejected.
 */
export function randomEdit(s: State, rand: () => number): Edit | null {
  const sqs: number[] = [];
  for (let sq = 0; sq < 64; sq++) if (canEdit(s, sq)) sqs.push(sq);
  for (let i = sqs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = sqs[i];
    sqs[i] = sqs[j];
    sqs[j] = t;
  }
  const before = legal(s);
  for (const sq of sqs) {
    const e = edit(s, sq, before);
    if (!e.rejected) return e;
  }
  return null;
}

// ── randomness ──────────────────────────────────────────────────────────────

/** A seeded generator in [0, 1) (mulberry32, as in frame/util). Same seed, same sequence. */
export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
