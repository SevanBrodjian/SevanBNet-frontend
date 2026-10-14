// 4. The machine. Mechanics, building, invention. First person, leaning in over a workbench
// under a lamp: the lamp's pool is where the drawing is dense, and the bench falls away to
// black. On a turned stand in the pool sits a clockwork bird, its flank cut open on its
// movement, still. A brass ball comes rolling out of the dark along a grooved rail and drops
// into the cup of a counterweighted lever; the lever tips, and the brass finger at its far end
// comes down out of the notch in the bird's window where it held the balance: the balance
// swings, the escapement ticks, the train turns, a snail cam lifts its follower. The bird's
// eye opens; it looks about, finds us and turns its head to us; the follower drops off the cam
// and its slatted wings fan open; it hops, and lifts off, its open flank still to us, climbing
// and turning slowly away up out of the light.
//
// Ink is light: the lamp draws everything; what it does not reach stays black. Nothing
// here is held or moved by a hand: the mechanism starts itself.

import type { Scene } from "../engine";
import { clamp, hash, mix, noise, type Sketch, smooth, TAU } from "../sketch";
import {
  BALL_R,
  ball,
  bench,
  clutter,
  cupAt,
  LEV,
  layLever,
  lever,
  RAIL_A,
  RAIL_B,
  RAIL_DIR,
  RAIL_L,
  rail,
  railBall,
  STAND,
  stand,
} from "./machine-bench";
import {
  type BirdPose,
  CAM_STEP,
  drawBird,
  followerLift,
  RA,
  RB,
  RC,
  RH,
  stopTip,
  train,
} from "./machine-bird";
import { Basis, LAMP, OCC, Spr } from "./machine-kit";

const DUR = 13.6;
const FOC = 2.0;
const H = 1 / 240;

// the moments
const T_EYE = 6.35;
const T_WING_WANT = 9.05;
const T_HOP = 10.25;
const T_LIFT = 10.95;

// the lamp: above and to the left, a little behind the bird, aimed down at its stand; its
// pool's rim falls well inside the view. (The bird, which faces right, flies off away from it.)
LAMP.x = -0.12;
LAMP.y = -0.3;
LAMP.z = 0.025;
{
  const ax = -0.025 - LAMP.x;
  const ay = -0.02 - LAMP.y;
  const az = 0.03 - LAMP.z;
  const l = Math.hypot(ax, ay, az);
  LAMP.ax = ax / l;
  LAMP.ay = ay / l;
  LAMP.az = az / l;
  LAMP.c0 = 0.885;
  LAMP.c1 = 0.965;
}

/** Where the bird's body sits when it stands on its stand. */
const REST = { x: 0.002, y: -STAND.h - 0.0385, z: 0, pitch: 0.4 };

// the lever's finger rests in the notch under the balance's rim
layLever(stopTip(new Basis().from(null, REST.x, REST.y, REST.z, 0, REST.pitch, 0), [0, 0, 0]));
/** How far the lever tips under the ball: its finger drops 5 mm, out of the notch. */
const LA_MAX = 0.005 / LEV.Le;

// ---------------------------------------------------------------- the simulation

const B0 = new Basis();
const B1 = new Basis();
const V = [0, 0, 0];
const W = [0, 0, 0];

// where we stand and look: wide at first, the rail and the ball in view; once the lever has
// tipped we lean in to the window; back a little as the bird wakes, in a centimetre while it
// looks at us, back again for its wings; up and back as it flies
const K0 = { e: [-0.04, -0.186, -0.276], l: [-0.042, -0.028, 0.02] };
const K1 = { e: [-0.014, -0.122, -0.16], l: [-0.004, -0.044, -0.02] };
const K2 = { e: [-0.008, -0.152, -0.206], l: [0.0, -0.054, 0.0] };
const K2b = { e: [-0.006, -0.145, -0.196], l: [0.002, -0.058, 0.0] };
const K3 = { e: [-0.008, -0.166, -0.228], l: [0.002, -0.07, 0.0] };

class Sim {
  t = 0;
  acc = 0;
  // ball: 0 on the rail, 1 falling, 2 in the cup
  bmode = 0;
  bs = 0;
  bv = 0;
  bx = 0;
  by = 0;
  bz = 0;
  bvx = 0;
  bvy = 0;
  bvz = 0;
  roll = 0;
  landAt = -1;
  // lever: tipped from rest (far end down)
  la = 0;
  lw = 0;
  // the movement
  run = -1;
  bal = 0.55;
  balV = 0;
  escT = 0;
  esc = 0;
  escV = 0;
  palT = 0.11;
  pal = 0.11;
  palV = 0;
  ticks = 0;
  camOff = 0;
  wingAt = -1;
  // the body's shudder at each beat
  shud = new Spr(0);
  // the bird
  lid = new Spr(0);
  low = new Spr(0);
  pupil = new Spr(1.25);
  gy = new Spr(0);
  gp = new Spr(0);
  hy = new Spr(0);
  hp = new Spr(0);
  hr = new Spr(0);
  hyT = 0;
  hpT = 0;
  hrT = 0;
  nextHead = 0;
  wing = new Spr(0);
  beat = new Spr(1.2);
  fan = new Spr(1);
  tail = new Spr(0);
  tailLift = new Spr(0.12);
  crouch = new Spr(0);
  tuck = new Spr(0);
  hopY = 0;
  hopV = 0;
  hopped = false;
  phase = 0;
  // flight: the bird, and the point on its path it follows
  fly = false;
  px = REST.x;
  py = REST.y;
  pz = REST.z;
  vx = 0;
  vy = 0;
  vz = 0;
  qx = REST.x;
  qy = REST.y;
  qz = REST.z;
  yaw = new Spr(0);
  pitch = new Spr(REST.pitch);
  bank = new Spr(0);
  // camera: where we look, and where our eye is
  cx = new Spr(0);
  cy = new Spr(0);
  cz = new Spr(0);
  ex = new Spr(0);
  ey = new Spr(0);
  ez = new Spr(0);

  probe = false;
  camSign = 0;

  constructor(probe = true) {
    this.probe = !probe;
    this.reset();
    if (probe) {
      // find where the cam stands at the moment the wings should open, and set it to drop then
      const p = new Sim(false);
      while (p.t < T_WING_WANT) p.tick();
      train(p.esc, V);
      this.camOff = CAM_STEP - V[0];
    }
  }

  reset(): void {
    const camOff = this.camOff;
    Object.assign(this, new SimState());
    this.camOff = camOff;
    train(0, V);
    this.camSign = Math.sign(V[0] + camOff - CAM_STEP);
    this.shud.set(0);
    this.lid.set(0);
    this.low.set(0);
    this.pupil.set(1.25);
    this.gy.set(0);
    this.gp.set(0);
    this.hy.set(0);
    this.hp.set(0);
    this.hr.set(0);
    this.wing.set(0);
    this.beat.set(1.2);
    this.fan.set(1);
    this.tail.set(0);
    this.tailLift.set(0.08);
    this.crouch.set(0);
    this.tuck.set(0);
    this.yaw.set(0);
    this.pitch.set(REST.pitch);
    this.bank.set(0);
    this.cx.set(K0.l[0]);
    this.cy.set(K0.l[1]);
    this.cz.set(K0.l[2]);
    this.ex.set(K0.e[0]);
    this.ey.set(K0.e[1]);
    this.ez.set(K0.e[2]);
    this.camPos[0] = K0.e[0];
    this.camPos[1] = K0.e[1];
    this.camPos[2] = K0.e[2];
    // the ball is already on its way, rolling in from the dark
    this.bs = 0.016;
    this.bv = 0.046;
    railBall(this.bs, V);
    this.bx = V[0];
    this.by = V[1];
    this.bz = V[2];
  }

  step(dt: number): void {
    this.acc += dt;
    let n = 0;
    while (this.acc >= H && n < 60) {
      this.tick();
      this.acc -= H;
      n++;
    }
    if (n === 60) this.acc = 0;
  }

  tick(): void {
    const h = H;
    this.t += h;
    const t = this.t;
    // ---- the ball
    if (this.bmode === 0) {
      // a gentle slope, the groove's drag
      this.bv += (0.012 - 0.2 * this.bv) * h;
      this.bs += this.bv * h;
      this.roll += (this.bv / BALL_R) * h;
      railBall(Math.min(this.bs, RAIL_L), V);
      this.bx = V[0];
      this.by = V[1];
      this.bz = V[2];
      if (this.bs >= RAIL_L) {
        this.bmode = 1;
        this.bvx = RAIL_DIR[0] * this.bv;
        this.bvy = RAIL_DIR[1] * this.bv;
        this.bvz = RAIL_DIR[2] * this.bv;
      }
    } else if (this.bmode === 1) {
      this.bvy += 9.8 * h;
      this.bx += this.bvx * h;
      this.by += this.bvy * h;
      this.bz += this.bvz * h;
      this.roll += (this.bv / BALL_R) * h;
      cupAt(this.la, V);
      if (this.by >= V[1] - BALL_R * 0.55) {
        this.bmode = 2;
        this.landAt = t;
        // the drop's weight on the lever
        this.lw += 0.6 + this.bvy * 0.5;
      }
    }
    // ---- the lever: the ball's weight against the counterweight's; stops at both ends
    {
      const torque = (this.bmode === 2 ? 34 : 0) - 14;
      this.lw += (torque - 4 * this.lw) * h;
      this.la += this.lw * h;
      if (this.la < 0) {
        this.la = 0;
        if (this.lw < 0) this.lw = -this.lw * 0.15;
      }
      if (this.la > LA_MAX) {
        this.la = LA_MAX;
        if (this.lw > 0) this.lw = -this.lw * 0.3;
      }
      if (this.bmode === 2) {
        cupAt(this.la, V);
        this.bx = V[0];
        this.by = V[1] - BALL_R * 0.55;
        this.bz = V[2];
      }
    }
    // ---- the movement: let go once the finger has come down off the balance
    if (this.run < 0 && this.la > LA_MAX * 0.3) {
      this.run = 0;
    }
    if (this.run >= 0) {
      this.run += h;
      const w0 = TAU * 2.4;
      const prev = this.bal;
      this.balV += (-w0 * w0 * this.bal - 2 * 0.035 * w0 * this.balV) * h;
      this.bal += this.balV * h;
      if (prev !== 0 && Math.sign(prev) !== Math.sign(this.bal)) {
        // a beat: the escape wheel lets a half tooth go, the pallet flips, the balance gets
        // its impulse (building up over the first beats to its running swing), and the
        // little shock runs through the bird
        this.ticks++;
        this.escT -= Math.PI / 15;
        this.palT = -this.palT;
        const want = 2.1 * w0;
        const sp = Math.abs(this.balV);
        this.balV = Math.sign(this.balV) * mix(sp, want, 0.3);
        if (!this.fly) this.shud.v += this.ticks % 2 ? 0.026 : -0.02;
      }
    }
    this.shud.step(0, 75, 0.3, h);
    // escape wheel and pallet: quick sprung steps
    this.escV += (140 * 140 * (this.escT - this.esc) - 2 * 0.42 * 140 * this.escV) * h;
    this.esc += this.escV * h;
    this.palV += (170 * 170 * (this.palT - this.pal) - 2 * 0.55 * 170 * this.palV) * h;
    this.pal += this.palV * h;
    // the cam's drop: the follower falls off the snail's step and the wings are let go
    if (this.wingAt < 0 && this.run >= 0) {
      // the snail turns until its step comes round under the follower
      train(this.esc, V);
      const a = V[0] + this.camOff - CAM_STEP;
      if (this.ticks > 8 && this.camSign !== 0 && Math.sign(a) !== this.camSign) {
        this.wingAt = t;
      }
    }
    this.bird(h);
    this.camera(h);
  }

  bird(h: number): void {
    const t = this.t;
    // ---- the lid: shut, then open in two goes, then blinks
    let lidT = 0;
    if (t > T_EYE) lidT = 0.42;
    if (t > T_EYE + 0.55) lidT = 1.0;
    // blinks: a quick shutter, one with the glance to us, a double later
    const blinks = [T_EYE + 1.6, 8.3, 10.05, 10.27, 11.5];
    for (const b of blinks) if (t > b && t < b + 0.09) lidT = -0.05;
    this.lid.step(lidT, lidT < 0.1 && t > T_EYE + 1 ? 70 : 16, lidT < 0.1 ? 1 : 0.62, h);
    this.low.step(lidT < 0.1 && t > T_EYE + 1 ? 0.6 : 0, 40, 0.9, h);
    // the pupil: wide in the dark of the lid, narrowing in the lamp's light, never still
    const hip = 0.05 * Math.sin(t * 1.9) * Math.sin(t * 0.67 + 1);
    const pupT = (this.lid.x > 0.5 ? 0.82 : 1.25) + hip + (this.lookingAtUs() ? 0.12 : 0);
    this.pupil.step(pupT, pupT < this.pupil.x ? 26 : 9, 0.9, h);
    // ---- where it looks: a few fixations, with saccades; the head follows late, in ticks
    this.pose(B0, B1);
    const tgt = this.gazeTarget(t);
    // gaze in the head's frame
    const ex = B1.o[0];
    const ey = B1.o[1];
    const ez = B1.o[2];
    B1.ldir(tgt[0] - ex, tgt[1] - ey, tgt[2] - ez, W);
    const l = Math.hypot(W[0], W[1], W[2]) || 1;
    const gyT = clamp(Math.atan2(W[0] / l, W[2] / l) - 0.3, -0.65, 0.65);
    const gpT = clamp(Math.asin(W[1] / l) - 0.12, -0.5, 0.5);
    // a saccade when the error is big enough; small drifts held
    if (Math.abs(gyT - this.gy.x) + Math.abs(gpT - this.gp.x) > 0.06 || t < T_EYE) {
      this.gy.step(gyT, 55, 0.88, h);
      this.gp.step(gpT, 55, 0.88, h);
    } else {
      this.gy.step(this.gy.x, 55, 0.88, h);
      this.gp.step(this.gp.x, 55, 0.88, h);
    }
    // the head: toward bringing its eye round to what it looks at, partway; in steps
    if (t > this.nextHead) {
      const want = this.headWant(t);
      // a mechanical neck: it moves in quick small steps
      const stp = 0.16;
      this.hyT += clamp(want[0] - this.hyT, -stp, stp);
      this.hpT += clamp(want[1] - this.hpT, -stp, stp);
      this.hrT += clamp(want[2] - this.hrT, -stp, stp);
      this.nextHead = t + 0.13 + 0.09 * hash(Math.floor(t * 10), 7);
    }
    this.hy.step(this.hyT, 30, 0.5, h);
    this.hp.step(this.hpT, 30, 0.5, h);
    this.hr.step(this.hrT, 30, 0.5, h);
    // ---- wings: let go by the cam; then two slow strokes; folded half for the hop; flight
    const wa = this.wingAt;
    let wingT = 0;
    let beatT = 1.2;
    let fanT = 1;
    let tailT = 0;
    // the follower, riding up its cam, lifts the tail a little at a time
    train(this.esc, V);
    const lift = this.wingAt < 0 ? followerLift(V[0], this.camOff) : 0;
    let tailLiftT = 0.08 + 0.26 * lift;
    if (wa > 0 && t > wa) {
      wingT = 1;
      tailT = 0.8;
      tailLiftT = 0.22;
      const k = t - wa;
      if (k > 0.75 && k < 0.95) beatT = 0.72;
    }
    if (t > T_HOP - 0.35 && t < T_LIFT - 0.3) {
      wingT = 0.75;
      beatT = 0.8;
    }
    if (this.fly) {
      wingT = 1;
      tailT = 0.88;
      this.phase += TAU * 2.7 * h;
      const s = Math.sin(this.phase);
      // a quicker downstroke than up
      beatT = 0.72 + 0.44 * (s + 0.25 * Math.sin(2 * this.phase - 0.5));
      fanT = 0.75 + 0.25 * s;
    }
    this.wing.step(wingT, wa > 0 && t - wa < 0.6 ? 7.5 : 8, 0.62, h);
    this.beat.step(beatT, this.fly ? 55 : 13, this.fly ? 0.7 : 0.5, h);
    this.fan.step(fanT, 30, 0.6, h);
    this.tail.step(tailT, 14, 0.5, h);
    this.tailLift.step(tailLiftT, this.wingAt < 0 ? 40 : 12, this.wingAt < 0 ? 0.9 : 0.45, h);
    // ---- hop, then lift off
    let crouchT = 0;
    if (t > T_HOP - 0.22 && t < T_HOP) crouchT = 1;
    if (t > T_LIFT - 0.25 && t < T_LIFT) crouchT = 1;
    this.crouch.step(crouchT, 26, 0.6, h);
    if (!this.hopped && t >= T_HOP) {
      this.hopped = true;
      this.hopV = -0.44;
    }
    if (this.hopped && !this.fly) {
      this.hopV += 9.8 * h;
      this.hopY += this.hopV * h;
      if (this.hopY > 0) {
        if (this.hopV > 0.3) this.crouch.v += 9;
        this.hopY = 0;
        this.hopV = 0;
      }
    }
    if (!this.fly && t >= T_LIFT) {
      this.fly = true;
      this.vy = -0.26;
      this.vx = 0.05;
      this.py += this.hopY;
      this.hopY = 0;
      this.qx = this.px;
      this.qy = this.py - 0.012;
      this.qz = this.pz;
    }
    this.tuck.step(this.fly ? 1 : 0, 9, 0.8, h);
    if (this.fly) {
      const tau = t - T_LIFT;
      // the path: up and forward with its open flank to us, turning only a little away as it
      // climbs on, out past the lamp's light (side-on, it stays one creature in flight)
      const head = -0.42 * smooth(0.5, 2.6, tau);
      const vh = 0.03 + 0.018 * tau;
      const vy = 0.034 + 0.016 * tau;
      this.qx += Math.cos(head) * vh * h;
      this.qz -= Math.sin(head) * vh * h;
      this.qy -= vy * h;
      // follow it through inertia, a little lift with each downstroke
      const w = 7;
      const lift = Math.max(0, -Math.cos(this.phase)) * 0.3;
      this.vx += (w * w * (this.qx - this.px) - 2 * 0.9 * w * this.vx) * h;
      this.vy += (w * w * (this.qy - this.py) - 2 * 0.9 * w * this.vy - lift) * h;
      this.vz += (w * w * (this.qz - this.pz) - 2 * 0.9 * w * this.vz) * h;
      this.px += this.vx * h;
      this.py += this.vy * h;
      this.pz += this.vz * h;
      const sp = Math.hypot(this.vx, this.vz);
      if (sp > 0.02) {
        let yw = Math.atan2(-this.vz, this.vx);
        while (yw - this.yaw.x > Math.PI) yw -= TAU;
        while (yw - this.yaw.x < -Math.PI) yw += TAU;
        const y0 = this.yaw.x;
        this.yaw.step(clamp(yw, -1.1, 0.25), 6, 0.9, h);
        const rate = (this.yaw.x - y0) / h;
        this.bank.step(clamp(rate * 0.2, -0.4, 0.4), 6, 0.6, h);
      }
      this.pitch.step(clamp(Math.atan2(-this.vy, sp + 0.05) * 0.45, -0.2, 0.5) + 0.05, 8, 0.8, h);
    } else {
      this.pitch.step(REST.pitch + 0.25 * this.crouch.x, 20, 0.7, h);
    }
  }

  /** Is it looking at us now? */
  lookingAtUs(): boolean {
    return this.t > 8.25 && this.t < 10.0;
  }

  gazeTarget(t: number): number[] {
    const out = [0, 0, 0];
    const C = [this.camPos[0], this.camPos[1], this.camPos[2]];
    const fwd = [B0.o[0] + B0.f[0] * 0.3, B0.o[1] + B0.f[1] * 0.3 + 0.03, B0.o[2] + B0.f[2] * 0.3];
    let p = fwd;
    if (t > T_EYE + 0.8) p = [LAMP.x, LAMP.y, LAMP.z];
    if (t > T_EYE + 1.45) p = [LEV.x - 0.03, LEV.y, LEV.z];
    if (t > 8.2) p = C;
    if (t > 10.0) p = [B0.o[0] + 0.2, B0.o[1] - 0.12, B0.o[2] + 0.12];
    if (t > 10.5) p = C;
    if (this.fly) p = [this.px + this.vx * 2, this.py + this.vy * 2 - 0.02, this.pz + this.vz * 2];
    out[0] = p[0];
    out[1] = p[1];
    out[2] = p[2];
    return out;
  }

  /** What the head would like: yaw, pitch, roll relative to the body. */
  headWant(t: number): number[] {
    if (t < T_EYE + 0.3) return [0, -0.05, 0];
    if (this.fly) return [0, -0.1, 0];
    // turn so the near eye comes round toward what it looks at, but only partway
    const tgt = this.gazeTarget(t);
    B0.ldir(tgt[0] - B0.o[0], tgt[1] - B0.o[1], tgt[2] - B0.o[2], W);
    const l = Math.hypot(W[0], W[1], W[2]) || 1;
    const az = Math.atan2(W[2] / l, W[0] / l);
    const el = Math.asin(W[1] / l);
    const atUs = this.lookingAtUs() || (t > 10.5 && t < T_LIFT);
    // the eye looks out sideways: to look at us, the head turns its beak a little toward us
    // and tilts the eye up toward where we are
    const yaw = atUs ? 0.42 : clamp((az - 1.2) * 0.5, -0.3, 0.45);
    const roll = atUs ? -0.42 : clamp(-el * 0.4, -0.3, 0.3);
    const pitch = atUs ? 0.06 : clamp(el * 0.35, -0.25, 0.3);
    return [yaw, pitch, roll];
  }

  camPos = [0, 0, 0];

  /** The camera's key now: which framing we are moving to, by what has happened. */
  key(): { e: number[]; l: number[] } {
    const t = this.t;
    if (this.wingAt > 0 && t > this.wingAt + 0.15) return K3;
    if (t > 8.25) return K2b;
    if (t > 5.9) return K2;
    if (this.landAt > 0 && t > this.landAt + 0.65) return K1;
    return K0;
  }

  camera(h: number): void {
    const K = this.key();
    let lx = K.l[0];
    let ly = K.l[1];
    let lz = K.l[2];
    let ex = K.e[0];
    let ey = K.e[1];
    let ez = K.e[2];
    if (this.fly) {
      const tau = this.t - T_LIFT;
      const k = smooth(-0.1, 1.1, tau) * 0.7;
      lx = mix(lx, this.px, k);
      ly = mix(ly, this.py, k);
      lz = mix(lz, this.pz, k);
      // we sit back and up a little to watch it go
      const c = smooth(0, 2.2, tau);
      ex += 0.012 * c;
      ey -= 0.035 * c;
      ez -= 0.05 * c;
    }
    this.cx.step(lx, 3.0, 0.92, h);
    this.cy.step(ly, 3.0, 0.92, h);
    this.cz.step(lz, 3.0, 0.92, h);
    this.ex.step(ex, 2.6, 0.92, h);
    this.ey.step(ey, 2.6, 0.92, h);
    this.ez.step(ez, 2.6, 0.92, h);
    this.camPos[0] = this.ex.x;
    this.camPos[1] = this.ey.x;
    this.camPos[2] = this.ez.x;
  }

  /** The bird's body and head frames now. */
  pose(b: Basis, hd: Basis): void {
    const crouch = this.crouch.x;
    const sh = this.shud.x;
    if (this.fly) b.from(null, this.px, this.py, this.pz, this.yaw.x, this.pitch.x, this.bank.x);
    else
      b.from(
        null,
        REST.x - 0.39 * sh,
        REST.y + this.hopY + crouch * 0.006 - 0.92 * sh,
        REST.z,
        this.yaw.x,
        this.pitch.x + sh * 6,
        0,
      );
    hd.from(
      b,
      RA * 0.8,
      RB * 0.9 - crouch * 0.003,
      0,
      this.hy.x,
      this.hp.x - 0.36 - crouch * 0.15 - sh * 9,
      this.hr.x,
    );
  }
}

/** Everything a fresh simulation starts with (for reset). */
class SimState {
  t = 0;
  acc = 0;
  bmode = 0;
  bs = 0;
  bv = 0;
  bx = 0;
  by = 0;
  bz = 0;
  bvx = 0;
  bvy = 0;
  bvz = 0;
  roll = 0;
  landAt = -1;
  la = 0;
  lw = 0;
  run = -1;
  bal = 0.55;
  balV = 0;
  escT = 0;
  esc = 0;
  escV = 0;
  palT = 0.11;
  pal = 0.11;
  palV = 0;
  ticks = 0;
  wingAt = -1;
  hyT = 0;
  hpT = 0;
  hrT = 0;
  nextHead = 0;
  hopY = 0;
  hopV = 0;
  hopped = false;
  phase = 0;
  fly = false;
  px = REST.x;
  py = REST.y;
  pz = REST.z;
  vx = 0;
  vy = 0;
  vz = 0;
  qx = REST.x;
  qy = REST.y;
  qz = REST.z;
}

// ---------------------------------------------------------------- shadows

const OB = [new Basis(), new Basis(), new Basis(), new Basis(), new Basis()];
OCC.length = 0;
for (let i = 0; i < 5; i++) OCC.push({ b: OB[i], ra: 0.01, rb: 0.01, rc: 0.01, on: true });

function shadows(S: Sim, body: Basis, head: Basis): void {
  OCC[0].b.copy(body);
  OCC[0].ra = RA * 0.96;
  OCC[0].rb = RB * 0.9;
  OCC[0].rc = RC * 0.9;
  OCC[1].b.copy(head);
  OCC[1].ra = RH;
  OCC[1].rb = RH;
  OCC[1].rc = RH;
  OCC[2].b.from(null, STAND.x, -STAND.h * 0.5, STAND.z, 0, 0, 0);
  OCC[2].ra = STAND.r;
  OCC[2].rb = STAND.h * 0.55;
  OCC[2].rc = STAND.r;
  OCC[3].b.from(null, S.bx, S.by, S.bz, 0, 0, 0);
  OCC[3].ra = BALL_R;
  OCC[3].rb = BALL_R;
  OCC[3].rc = BALL_R;
  const mx = (RAIL_A[0] + RAIL_B[0]) / 2;
  const my = (RAIL_A[1] + RAIL_B[1]) / 2 + 0.004;
  const mz = (RAIL_A[2] + RAIL_B[2]) / 2;
  OCC[4].b.from(null, mx, my, mz, Math.atan2(-RAIL_DIR[2], RAIL_DIR[0]), 0, 0);
  OCC[4].ra = RAIL_L * 0.5;
  OCC[4].rb = 0.007;
  OCC[4].rc = 0.0085;
}

// ---------------------------------------------------------------- the scene

const BODY = new Basis();
const HEAD = new Basis();

export function machine(): Scene {
  const S = new Sim();
  const scene: Scene = {
    t: 0,
    dur: DUR,
    exit: [0.2, -0.5],
    still: 9.7,
    excite: 0,
    reset() {
      this.t = 0;
      S.reset();
    },
    step(dt) {
      this.t += dt;
      S.step(dt);
      const t = S.t;
      this.excite =
        0.08 * smooth(0, 0.05, S.run) * (1 - smooth(0.2, 0.8, S.run)) +
        0.1 *
          (S.wingAt > 0
            ? smooth(S.wingAt, S.wingAt + 0.1, t) * (1 - smooth(S.wingAt + 0.4, S.wingAt + 1.0, t))
            : 0) +
        0.12 * smooth(T_LIFT - 0.1, T_LIFT + 0.2, t) * (1 - smooth(T_LIFT + 0.8, T_LIFT + 1.8, t));
    },
    draw(sk) {
      draw(sk, S, scene);
    },
  };
  return scene;
}

const E = [0, 0, 0];

function draw(sk: Sketch, S: Sim, scene: Scene): void {
  const t = S.t;
  // where we are: the camera's springs, and the small sway of a body leaning on a bench
  E[0] = S.ex.x + 0.0015 * Math.sin(t * 0.61) + 0.001 * noise(t * 0.4, 3);
  E[1] = S.ey.x + 0.001 * Math.sin(t * 0.83 + 1);
  E[2] = S.ez.x;
  // on a narrow view, stand back a little, keep more of the rail in it while it is wide, and
  // keep the bird's head well inside while it wakes and looks at us
  const narrow = 1 - smooth(0.95, 1.15, sk.A);
  const wide = 1 - smooth(4.0, 5.8, t);
  const wake = smooth(5.2, 6.0, t) * (1 - smooth(9.2, 10.2, t));
  const tx = S.cx.x - 0.022 * narrow * wide + 0.008 * narrow * wake;
  const ty = S.cy.x - 0.012 * narrow * wake;
  let lx = tx - E[0];
  let ly = ty - E[1];
  let lz = S.cz.x - E[2];
  const back = 0.2 * narrow;
  E[0] -= lx * back;
  E[1] -= ly * back;
  E[2] -= lz * back;
  lx = tx - E[0];
  ly = ty - E[1];
  lz = S.cz.x - E[2];
  const yaw = Math.atan2(lx, lz);
  const pitch = Math.atan2(ly, Math.hypot(lx, lz));
  sk.eye(E[0], E[1], E[2], FOC, yaw, pitch, 0.004 * Math.sin(t * 0.47));
  sk.depthRef = 0.28;
  sk.depthW = 0.55;
  sk.near = 0.02;

  S.pose(BODY, HEAD);
  shadows(S, BODY, HEAD);

  // the bench, its pool of light
  sk.group(1);
  bench(sk, 1);
  // what lies far off on it
  sk.group(60);
  clutter(sk, 60, "far");
  // the rail and the ball on it (behind the bird from here)
  sk.group(100);
  rail(sk, 100);
  sk.group(140);
  if (S.bmode === 0) ball(sk, 140, S.bx, S.by, S.bz, S.roll);
  // the stand
  sk.group(150);
  stand(sk, 150);
  // the bird: always behind the lever and what lies nearest us (it only ever flies away)
  const pres = presence(S);
  const P: BirdPose = {
    body: BODY,
    head: HEAD,
    wing: S.wing.x,
    beat: S.beat.x,
    fan: S.fan.x,
    tail: S.tail.x,
    tailLift: S.tailLift.x,
    tuck: S.tuck.x,
    perch: -STAND.h - 0.0004,
    crouch: S.crouch.x,
    eyeN: eyeState(S, 1),
    eyeF: eyeState(S, -1),
    esc: S.esc,
    pal: S.pal,
    bal: S.bal,
    camOff: S.camOff,
    pres,
  };
  sk.group(200);
  drawBird(sk, P, 200);
  // the lever in front of it, with the ball once it lands
  sk.group(300);
  lever(sk, 300, S.la);
  sk.group(310);
  if (S.bmode > 0) ball(sk, 310, S.bx, S.by, S.bz, S.roll);
  sk.group(320);
  clutter(sk, 320, "near");
  // where we head as it ends: after the bird
  const c = [0, 0, 0];
  if (sk.p3(BODY.o[0], BODY.o[1], BODY.o[2], c)) {
    scene.exit[0] = clamp(c[0], -sk.A * 0.85, sk.A * 0.85);
    scene.exit[1] = clamp(c[1], -0.85, 0.85);
  }
}

function presence(S: Sim): number {
  // how much of the lamp falls where the bird is: its lines give out as it leaves the light
  const dx = S.px - LAMP.x;
  const dy = (S.fly ? S.py : REST.y) - LAMP.y;
  const dz = S.pz - LAMP.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  const ca = (dx * LAMP.ax + dy * LAMP.ay + dz * LAMP.az) / d;
  return clamp(0.12 + 0.88 * smooth(LAMP.c0 - 0.1, LAMP.c1 - 0.02, ca), 0, 1);
}

function eyeState(S: Sim, side: number): import("./machine-eye").EyeState {
  // the gaze: the eye's axis turned by the eye's own yaw and pitch, in the head's frame
  const ax = [0.3, 0.12, side];
  const l = Math.hypot(ax[0], ax[1], ax[2]);
  ax[0] /= l;
  ax[1] /= l;
  ax[2] /= l;
  const gy = side > 0 ? S.gy.x : -S.gy.x * 0.5;
  const gp = S.gp.x;
  // turn round the head's up by gy (toward forward), then pitch
  const fx = ax[0] * Math.cos(gy) + ax[2] * Math.sin(gy) * side;
  const fz = ax[2] * Math.cos(gy) - ax[0] * Math.sin(gy) * side;
  const fy = ax[1] + gp;
  HEAD.dir(fx, fy, fz, V);
  return { open: S.lid.x, gx: V[0], gy: V[1], gz: V[2], pupil: S.pupil.x, low: S.low.x, lit: 1 };
}
