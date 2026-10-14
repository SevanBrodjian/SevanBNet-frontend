// 1-bit ink, after dreamlog3000's watcher: every mark is a pen stroke (a polyline with a
// width per point) drawn as capsule segments, and the fragment shader computes exact
// coverage at device resolution, so lines are crisp at any size and never grey. Fills and
// erasing strokes clear what was inked before them to transparent: the page shows through.
// The boil (the hand-drawn shimmer) lives in the Pen: each stroke's wobble is a hash of
// (stroke id, boil frame), and the boil frame steps at about 10 Hz while everything under
// it moves at display rate.

const MAXSEG = 65536;
const MAXV = 65536;
const MAXCMD = 8192;

const VS_SEG = `#version 300 es
layout(location=0) in vec2 c;
layout(location=1) in vec4 s;
layout(location=2) in vec4 r;
uniform vec2 uRes;
out vec2 vP; flat out vec4 vS; flat out vec2 vR;
void main(){
  vec2 d = s.zw - s.xy; float L = length(d);
  vec2 t = L > 1e-4 ? d / L : vec2(1.0, 0.0);
  vec2 n = vec2(-t.y, t.x);
  float m = max(r.x, r.y) + 1.0;
  vec2 p = mix(s.xy - t * m, s.zw + t * m, c.x) + n * (m * c.y);
  vP = p; vS = s; vR = r.xy;
  vec2 q = p / uRes * 2.0 - 1.0;
  gl_Position = vec4(q.x, -q.y, 0.0, 1.0);
}`;
const FS_SEG = `#version 300 es
precision highp float;
in vec2 vP; flat in vec4 vS; flat in vec2 vR;
uniform vec3 uInk;
out vec4 o;
void main(){
  vec2 pa = vP - vS.xy, ba = vS.zw - vS.xy;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  float c = clamp(mix(vR.x, vR.y, h) - length(pa - ba * h) + 0.5, 0.0, 1.0);
  if (c <= 0.0) discard;
  o = vec4(uInk * c, c);
}`;
const VS_FILL = `#version 300 es
layout(location=0) in vec2 p;
uniform vec2 uRes;
void main(){ vec2 q = p / uRes * 2.0 - 1.0; gl_Position = vec4(q.x, -q.y, 0.0, 1.0); }`;
const FS_FILL = `#version 300 es
precision mediump float;
uniform vec4 uCol;
out vec4 o;
void main(){ o = uCol; }`;

/** Draw commands: 0 ink segments, 1 erasing triangles, 2 erasing segments, 3 ink triangles. */
type Cmd = 0 | 1 | 2 | 3;

export interface InkTarget {
  begin(): void;
  /** One capsule from (x0, y0) to (x1, y1), device px, radii r0 and r1. erase: clear under it. */
  seg(x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, erase: boolean): void;
  /** A triangle, device px: erasing, or solid ink. */
  tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, ink?: boolean): void;
  flush(w: number, h: number): void;
  /** Ink colour, 0..1 sRGB. */
  color: [number, number, number];
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram | null {
  const p = gl.createProgram();
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      console.warn("hero: shader", gl.getShaderInfoLog(s));
      return null;
    }
    gl.attachShader(p, s);
    gl.deleteShader(s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
    console.warn("hero: link", gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

/** Batches segments and triangles in draw order and flushes them in a few calls. */
export class GLInk implements InkTarget {
  color: [number, number, number] = [1, 1, 1];
  private segs = new Float32Array(MAXSEG * 8);
  private verts = new Float32Array(MAXV * 2);
  private cmd = new Int32Array(MAXCMD * 3);
  private sbuf: WebGLBuffer;
  private fbuf: WebGLBuffer;
  private vaoS: WebGLVertexArrayObject;
  private vaoF: WebGLVertexArrayObject;
  private uResS: WebGLUniformLocation | null;
  private uInk: WebGLUniformLocation | null;
  private uResF: WebGLUniformLocation | null;
  private uCol: WebGLUniformLocation | null;
  private ns = 0;
  private nv = 0;
  private nc = 0;

  static create(gl: WebGL2RenderingContext): GLInk | null {
    const ps = program(gl, VS_SEG, FS_SEG);
    const pf = program(gl, VS_FILL, FS_FILL);
    return ps && pf ? new GLInk(gl, ps, pf) : null;
  }

  private constructor(
    readonly gl: WebGL2RenderingContext,
    private ps: WebGLProgram,
    private pf: WebGLProgram,
  ) {
    this.uResS = gl.getUniformLocation(ps, "uRes");
    this.uInk = gl.getUniformLocation(ps, "uInk");
    this.uResF = gl.getUniformLocation(pf, "uRes");
    this.uCol = gl.getUniformLocation(pf, "uCol");
    const corner = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corner);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);
    this.sbuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sbuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.segs.byteLength, gl.DYNAMIC_DRAW);
    this.fbuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fbuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.verts.byteLength, gl.DYNAMIC_DRAW);
    this.vaoS = gl.createVertexArray();
    gl.bindVertexArray(this.vaoS);
    gl.bindBuffer(gl.ARRAY_BUFFER, corner);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sbuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(2, 1);
    this.vaoF = gl.createVertexArray();
    gl.bindVertexArray(this.vaoF);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fbuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
    gl.disable(gl.DITHER);
  }

  begin(): void {
    this.ns = 0;
    this.nv = 0;
    this.nc = 0;
  }

  private run(type: Cmd, start: number, n: number): void {
    const c = this.cmd;
    const k = (this.nc - 1) * 3;
    if (this.nc && c[k] === type) {
      c[k + 2] += n;
      return;
    }
    if (this.nc >= MAXCMD) return;
    c[this.nc * 3] = type;
    c[this.nc * 3 + 1] = start;
    c[this.nc * 3 + 2] = n;
    this.nc++;
  }

  seg(x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, erase: boolean) {
    if (this.ns >= MAXSEG) return;
    this.run(erase ? 2 : 0, this.ns, 1);
    const o = this.ns++ * 8;
    const s = this.segs;
    s[o] = x0;
    s[o + 1] = y0;
    s[o + 2] = x1;
    s[o + 3] = y1;
    s[o + 4] = r0;
    s[o + 5] = r1;
  }

  tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, ink = false): void {
    if (this.nv + 3 > MAXV) return;
    this.run(ink ? 3 : 1, this.nv, 3);
    const o = this.nv * 2;
    const v = this.verts;
    this.nv += 3;
    v[o] = ax;
    v[o + 1] = ay;
    v[o + 2] = bx;
    v[o + 3] = by;
    v[o + 4] = cx;
    v[o + 5] = cy;
  }

  private bind(p: WebGLProgram): void {
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook
    this.gl.useProgram(p);
  }

  flush(w: number, h: number): void {
    const gl = this.gl;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.ns) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.sbuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.segs, 0, this.ns * 8);
    }
    if (this.nv) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.fbuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.verts, 0, this.nv * 2);
    }
    this.bind(this.ps);
    gl.uniform2f(this.uResS, w, h);
    gl.uniform3f(this.uInk, this.color[0], this.color[1], this.color[2]);
    this.bind(this.pf);
    gl.uniform2f(this.uResF, w, h);
    let prog = -1;
    const c = this.cmd;
    for (let i = 0; i < this.nc; i++) {
      const t = c[i * 3];
      const start = c[i * 3 + 1];
      const n = c[i * 3 + 2];
      if (t === 1 || t === 3) {
        if (prog !== 1) {
          this.bind(this.pf);
          gl.bindVertexArray(this.vaoF);
          prog = 1;
        }
        if (t === 1) {
          gl.uniform4f(this.uCol, 0, 0, 0, 1);
          gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
        } else {
          gl.uniform4f(this.uCol, this.color[0], this.color[1], this.color[2], 1);
          gl.blendFunc(gl.ONE, gl.ZERO);
        }
        gl.drawArrays(gl.TRIANGLES, start, n);
        continue;
      }
      if (prog !== 0) {
        this.bind(this.ps);
        gl.bindVertexArray(this.vaoS);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.sbuf);
        prog = 0;
      }
      // ink adds over what is there; an erasing stroke clears under its coverage
      if (t === 0) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      else gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, start * 32);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, start * 32 + 16);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    }
    gl.bindVertexArray(null);
  }
}

/** The same marks on a 2D canvas, for browsers without WebGL2. Slower, and only a fallback. */
export class CanvasInk implements InkTarget {
  color: [number, number, number] = [1, 1, 1];
  private q: number[] = [];

  constructor(readonly g: CanvasRenderingContext2D) {}

  begin(): void {
    this.q.length = 0;
  }

  seg(x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, erase: boolean) {
    this.q.push(erase ? 2 : 0, x0, y0, x1, y1, r0 + r1, 0);
  }

  tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, ink = false): void {
    this.q.push(ink ? 3 : 1, ax, ay, bx, by, cx, cy);
  }

  flush(w: number, h: number): void {
    const { g, q } = this;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.lineCap = "round";
    const [r, gr, b] = this.color;
    g.strokeStyle = `rgb(${r * 255} ${gr * 255} ${b * 255})`;
    g.fillStyle = "#000";
    for (let i = 0; i < q.length; i += 7) {
      const t = q[i];
      g.globalCompositeOperation = t === 0 || t === 3 ? "source-over" : "destination-out";
      g.fillStyle = t === 3 ? g.strokeStyle : "#000";
      g.beginPath();
      g.moveTo(q[i + 1], q[i + 2]);
      g.lineTo(q[i + 3], q[i + 4]);
      if (t === 1 || t === 3) {
        g.lineTo(q[i + 5], q[i + 6]);
        g.fill();
      } else {
        g.lineWidth = q[i + 5];
        g.stroke();
      }
    }
    g.globalCompositeOperation = "source-over";
  }
}

// ---------------------------------------------------------------- pen (the boil lives here)

const TAU = Math.PI * 2;

function mix32(x: number): number {
  x |= 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** A hash of three integers in [0, 1). */
export const h3 = (a: number, b: number, c: number): number =>
  mix32(
    Math.imul(a, 0x27d4eb2d) ^
      mix32(Math.imul((b + 0x3c6ef372) | 0, 0x85ebca6b) ^ mix32((c + 0x165667b1) | 0)),
  ) / 4294967296;

/** Boiled strokes from CSS px to device px. */
export class Pen {
  d = 1;
  b = 0;
  amp = 1;

  constructor(readonly ink: InkTarget) {}

  setup(dpr: number, boil: number, amp: number): void {
    this.d = dpr;
    this.b = boil;
    this.amp = amp;
  }

  /** A pen stroke through n points (CSS px) with a width per point; amp scales its boil. */
  stroke(
    X: Float32Array,
    Y: Float32Array,
    W: Float32Array,
    n: number,
    id: number,
    erase: boolean,
    amp = 1,
  ) {
    if (n < 2) return;
    const b = this.b;
    const A = this.amp * amp;
    const d = this.d;
    const ox = (h3(id, b, 1) - 0.5) * 1.1 * A;
    const oy = (h3(id, b, 2) - 0.5) * 1.1 * A;
    const bend = (h3(id, b, 3) - 0.5) * 1.5 * A;
    const ph = h3(id, b, 4) * TAU;
    const ba = h3(id, b, 6) * TAU;
    const bx = Math.cos(ba) * bend;
    const by = Math.sin(ba) * bend;
    const wm = 0.8 + 0.4 * h3(id, b, 5);
    const jv = 0.4 * A;
    const inv = 1 / (n - 1);
    let X0 = 0;
    let Y0 = 0;
    let R0 = 0;
    let on0 = false;
    for (let i = 0; i < n; i++) {
      const sb = Math.sin(Math.PI * i * inv + ph);
      const k = (id * 1013 + i) | 0;
      let ex = 0;
      let ey = 0;
      if (i === 0 || i === n - 1) {
        // the ends reach a little past, or stop a little short, differently each time
        const j = i === 0 ? 1 : n - 2;
        const tx = X[i] - X[j];
        const ty = Y[i] - Y[j];
        const tl = Math.hypot(tx, ty) || 1;
        const over = (h3(id, b, i === 0 ? 9 : 10) - 0.3) * 1.3 * A;
        ex = (tx / tl) * over;
        ey = (ty / tl) * over;
      }
      const x = (X[i] + ex + ox + bx * sb + (h3(k, b, 7) - 0.5) * jv) * d;
      const y = (Y[i] + ey + oy + by * sb + (h3(k, b, 8) - 0.5) * jv) * d;
      const w = W[i];
      const on = w > 0.05;
      const R = Math.max(0.55, w * wm * 0.5 * d);
      if (i && (on || on0)) this.ink.seg(X0, Y0, x, y, on0 ? R0 : 0, on ? R : 0, erase);
      X0 = x;
      Y0 = y;
      R0 = R;
      on0 = on;
    }
  }
}
