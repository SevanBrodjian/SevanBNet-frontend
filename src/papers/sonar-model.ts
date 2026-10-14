// A reduced forward-looking sonar renderer with a hand-written gradient, after the paper's
// idea (not its code): beams fan out over a height field, each surface sample returns
// Lambertian energy into Gaussian range bins, and the image is log-compressed. Adam fits
// a height field to one simulated frame, starting from flat ground. No specular term, no
// viewpoint prior, no real data. About half a millisecond a step at this size.

import { clamp, rng } from "../frame/util";

export type SonarConfig = {
  NB: number; // beams
  NS: number; // samples along each beam (ground range)
  NR: number; // range bins
  H: number; // sensor height
  d0: number; // nearest ground range
  d1: number; // farthest ground range
  TH: number; // half the horizontal aperture, degrees
  sig: number; // range blur, in bins
  K: number; // log compression
  G: number; // Lambertian exponent
  bumps: number;
  amp: number;
  ripple: number;
};

export const SMALL: SonarConfig = {
  NB: 40,
  NS: 80,
  NR: 80,
  H: 2.2,
  d0: 1.6,
  d1: 12,
  TH: 14,
  sig: 0.9,
  K: 4,
  G: 1.5,
  bumps: 7,
  amp: 1,
  ripple: 0.025,
};

export type Sonar = ReturnType<typeof makeSonar>;

export function makeSonar(C: SonarConfig) {
  const { NB, NS, NR, H, d0, d1, K, G } = C;
  const TH = (C.TH * Math.PI) / 180;
  const D = new Float32Array(NS);
  for (let i = 0; i < NS; i++) D[i] = d0 + ((d1 - d0) * i) / (NS - 1);
  const TJ = new Float32Array(NB);
  for (let j = 0; j < NB; j++) TJ[j] = -TH + (2 * TH * j) / (NB - 1);
  const rmin = d0;
  const rmax = Math.hypot(d1, H) + 0.2;
  const bw = (rmax - rmin) / NR;
  const sig = bw * C.sig;
  const RB = new Float32Array(NR);
  for (let b = 0; b < NR; b++) RB[b] = rmin + (b + 0.5) * bw;

  /** A seafloor: mounds and hollows, small stones, sometimes a channel, a faint ripple. */
  function terrain(seed: number) {
    const R = rng(seed);
    const h = new Float32Array(NB * NS);
    const bumps: [number, number, number, number][] = [];
    const span = Math.tan(TH);
    for (let k = 0; k < C.bumps; k++)
      bumps.push([
        2 + R() * 9.5,
        (R() - 0.5) * 2 * span * 8,
        0.35 + R() * 0.8,
        (R() - 0.25) * 0.75 * C.amp,
      ]);
    for (let k = 0; k < 16; k++)
      bumps.push([
        2 + R() * 10,
        (R() - 0.5) * 2 * span * 9,
        0.12 + R() * 0.18,
        (0.08 + R() * 0.16) * C.amp,
      ]);
    const ch = R() * 6 + 3;
    const cw = 0.8 + R();
    const ca = R() < 0.6 ? 0.35 : 0;
    const ph = [R() * 6, R() * 6, R() * 6];
    const ra = R() * 0.6 - 0.3;
    for (let j = 0; j < NB; j++)
      for (let i = 0; i < NS; i++) {
        const x = D[i] * Math.cos(TJ[j]);
        const y = D[i] * Math.sin(TJ[j]);
        let z = 0;
        for (const [bx, by, br, ba] of bumps)
          z += ba * Math.exp(-((x - bx) ** 2 + (y - by) ** 2) / (br * br));
        z -= ca * Math.exp(-((x - ch) ** 2) / (cw * cw));
        z +=
          C.ripple *
          Math.sin((x + ra * y) * 4.6 + ph[0] + 1.4 * Math.sin(y * 0.9 + ph[1])) *
          (0.6 + 0.4 * Math.sin(x * 0.7 + ph[2]));
        h[j * NS + i] = z;
      }
    return h;
  }

  const S = new Float32Array(NS);
  const Rr = new Float32Array(NS);
  const MU = new Float32Array(NS);
  const I = new Float32Array(NS);
  const VIS = new Uint8Array(NS);

  /** One beam's returns, binned by range into A. */
  function beam(h: Float32Array, j: number, A: Float32Array) {
    const o = j * NS;
    A.fill(0);
    let minT = Number.POSITIVE_INFINITY;
    for (let i = 0; i < NS; i++) {
      const ia = i > 0 ? i - 1 : i;
      const ib = i < NS - 1 ? i + 1 : i;
      const s = (h[o + ib] - h[o + ia]) / (D[ib] - D[ia]);
      S[i] = s;
      const hz = H - h[o + i];
      const d = D[i];
      const r = Math.hypot(d, hz);
      Rr[i] = r;
      const t = hz / d;
      VIS[i] = t <= minT + 1e-4 ? 1 : 0; // shadowed by anything nearer and higher
      if (t < minT) minT = t;
      const q = Math.sqrt(1 + s * s);
      const mu = (s * d + hz) / (r * q);
      MU[i] = mu;
      const v = mu > 0 ? mu ** G : 0;
      I[i] = v;
      if (!VIS[i] || v <= 0) continue;
      const bc = (r - rmin) / bw - 0.5;
      const b0 = Math.max(0, Math.floor(bc - 3));
      const b1 = Math.min(NR - 1, Math.ceil(bc + 3));
      for (let b = b0; b <= b1; b++) {
        const e = (r - RB[b]) / sig;
        A[b] += v * Math.exp(-0.5 * e * e);
      }
    }
  }

  const comp = (a: number) => Math.log(1 + K * a);
  const A = new Float32Array(NR);
  const gA = new Float32Array(NR);

  function render(h: Float32Array, out: Float32Array) {
    for (let j = 0; j < NB; j++) {
      beam(h, j, A);
      for (let b = 0; b < NR; b++) out[j * NR + b] = comp(A[b]);
    }
    return out;
  }

  /** What the sensor sees: the render with speckle. */
  function sensor(h: Float32Array, seed: number, speckle: number) {
    const R = rng(seed ^ 0x9e37);
    const out = new Float32Array(NB * NR);
    const m = clamp(speckle, 0, 2);
    for (let j = 0; j < NB; j++) {
      beam(h, j, A);
      for (let b = 0; b < NR; b++) {
        const e = -Math.log(1 - R() * 0.999);
        const n = R();
        out[j * NR + b] = comp(Math.max(0, A[b] * (1 - m * 0.55 + m * 0.55 * e) + 0.015 * m * n));
      }
    }
    return out;
  }

  /** Image loss plus smoothness and a weak pull to zero; writes the gradient into g. */
  function lossGrad(
    h: Float32Array,
    T: Float32Array,
    g: Float32Array,
    lam: [number, number, number],
  ) {
    g.fill(0);
    let L = 0;
    const n = NB * NR;
    for (let j = 0; j < NB; j++) {
      beam(h, j, A);
      const o = j * NS;
      for (let b = 0; b < NR; b++) {
        const e = comp(A[b]) - T[j * NR + b];
        L += (e * e) / n;
        gA[b] = (((2 * e) / n) * K) / (1 + K * A[b]);
      }
      for (let i = 0; i < NS; i++) {
        if (!VIS[i] || I[i] <= 0) continue;
        const r = Rr[i];
        const bc = (r - rmin) / bw - 0.5;
        const b0 = Math.max(0, Math.floor(bc - 3));
        const b1 = Math.min(NR - 1, Math.ceil(bc + 3));
        let gI = 0;
        let gr = 0;
        for (let b = b0; b <= b1; b++) {
          const e = (r - RB[b]) / sig;
          const w = Math.exp(-0.5 * e * e);
          gI += gA[b] * w;
          gr += gA[b] * w * (-e / sig);
        }
        gr *= I[i];
        const s = S[i];
        const d = D[i];
        const hz = H - h[o + i];
        const q = Math.sqrt(1 + s * s);
        const a = s * d + hz;
        const mu = MU[i];
        const dI = G * mu ** (G - 1);
        const drdh = -hz / r;
        const dmdh = -1 / (r * q) - (a * drdh) / (r * r * q);
        const dmds = d / (r * q) - (a * s) / (r * q * q * q);
        g[o + i] += gI * dI * dmdh + gr * drdh;
        const ia = i > 0 ? i - 1 : i;
        const ib = i < NS - 1 ? i + 1 : i;
        const gs = (gI * dI * dmds) / (D[ib] - D[ia]);
        g[o + ib] += gs;
        g[o + ia] -= gs;
      }
    }
    const [ls, la, l0] = lam;
    for (let j = 0; j < NB; j++)
      for (let i = 0; i < NS; i++) {
        const k = j * NS + i;
        const v = h[k];
        if (i < NS - 1) {
          const e = h[k + 1] - v;
          L += ls * e * e;
          g[k + 1] += 2 * ls * e;
          g[k] -= 2 * ls * e;
        }
        if (j < NB - 1) {
          const e = h[k + NS] - v;
          L += la * e * e;
          g[k + NS] += 2 * la * e;
          g[k] -= 2 * la * e;
        }
        L += l0 * v * v;
        g[k] += 2 * l0 * v;
      }
    return L;
  }

  return { NB, NS, NR, H, D, TJ, TH, rmin, rmax, terrain, render, sensor, lossGrad };
}

/** Adam, in place. */
export function adam(n: number, lr = 0.01, b1 = 0.9, b2 = 0.999) {
  const m = new Float32Array(n);
  const v = new Float32Array(n);
  let t = 0;
  return (x: Float32Array, g: Float32Array) => {
    t++;
    const c1 = 1 - b1 ** t;
    const c2 = 1 - b2 ** t;
    for (let k = 0; k < n; k++) {
      m[k] = b1 * m[k] + (1 - b1) * g[k];
      v[k] = b2 * v[k] + (1 - b2) * g[k] * g[k];
      x[k] -= (lr * (m[k] / c1)) / (Math.sqrt(v[k] / c2) + 1e-8);
    }
  };
}
