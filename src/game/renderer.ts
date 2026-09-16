// ── Renderer: neon stickmen, living arena, and diegetic HUD ─────────────────
import type { Engine, Projectile, Orb } from "./engine";
import type { Fighter } from "./fighter";
import { WORLD } from "./types";
import type { Particle } from "./particles";

// ── pose math ────────────────────────────────────────────────────────────────
interface Pose {
  lean: number; bx: number; by: number; crouch: number; head: number;
  aF: [number, number]; aB: [number, number];
  lF: [number, number]; lB: [number, number];
  spin: number;
}
type PP = Partial<Pose>;

const BASE: Pose = {
  lean: 0.08, bx: 0, by: 0, crouch: 0, head: 0,
  aF: [0.55, 0.75], aB: [0.2, 0.4],
  lF: [0.22, 0.16], lB: [-0.3, 0.3], spin: 0,
};

function mixPose(a: Pose, b: PP, t: number): Pose {
  const L = (x: number, y: number | undefined) => y === undefined ? x : x + (y - x) * t;
  const LV = (v: [number, number], w: [number, number] | undefined): [number, number] =>
    w ? [L(v[0], w[0]), L(v[1], w[1])] : v;
  return {
    lean: L(a.lean, b.lean), bx: L(a.bx, b.bx), by: L(a.by, b.by),
    crouch: L(a.crouch, b.crouch), head: L(a.head, b.head),
    aF: LV(a.aF, b.aF), aB: LV(a.aB, b.aB), lF: LV(a.lF, b.lF), lB: LV(a.lB, b.lB),
    spin: L(a.spin, b.spin),
  };
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const eIO = (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const eOut = (t: number) => 1 - Math.pow(1 - t, 3);
const V = (a: number) => ({ x: Math.sin(a), y: Math.cos(a) });

interface Joints {
  hip: Pt; chest: Pt; neck: Pt; head: Pt;
  sF: Pt; eF: Pt; hF: Pt; sB: Pt; eB: Pt; hB: Pt;
  kF: Pt; fF: Pt; kB: Pt; fB: Pt;
}
type Pt = { x: number; y: number };

function skeleton(p: Pose, scale: number): Joints {
  const TORSO = 46 * scale, NECK = 7 * scale, HEAD = 15 * scale;
  const UA = 25 * scale, FA = 23 * scale, TH = 29 * scale, SH = 29 * scale;
  const stand = 80 * scale;
  const hipH = stand * (1 - p.crouch * 0.46) + p.by;
  const hip = { x: p.bx, y: -hipH };
  const chest = { x: hip.x + Math.sin(p.lean) * TORSO, y: hip.y - Math.cos(p.lean) * TORSO };
  const neck = { x: chest.x + Math.sin(p.lean) * NECK, y: chest.y - Math.cos(p.lean) * NECK };
  const head = { x: neck.x + Math.sin(p.lean) * HEAD * 0.5 + p.head, y: neck.y - HEAD * 0.9 };
  const sF = { x: chest.x + 2, y: chest.y + 3 };
  const sB = { x: chest.x - 2, y: chest.y - 3 };
  const arm = (s: Pt, a0: number, a1: number) => {
    const v0 = V(a0); const e = { x: s.x + v0.x * UA, y: s.y + v0.y * UA };
    const v1 = V(a1); const h = { x: e.x + v1.x * FA, y: e.y + v1.y * FA };
    return { e, h };
  };
  const AF = arm(sF, p.aF[0], p.aF[1]);
  const AB = arm(sB, p.aB[0], p.aB[1]);
  const leg = (a0: number, a1: number) => {
    const v0 = V(a0); const k = { x: hip.x + v0.x * TH, y: hip.y + v0.y * TH };
    const v1 = V(a1); const f = { x: k.x + v1.x * SH, y: k.y + v1.y * SH };
    return { k, f };
  };
  const LF = leg(p.lF[0], p.lF[1]);
  const LB = leg(p.lB[0], p.lB[1]);
  return {
    hip, chest, neck, head,
    sF, eF: AF.e, hF: AF.h, sB, eB: AB.e, hB: AB.h,
    kF: LF.k, fF: LF.f, kB: LB.k, fB: LB.f,
  };
}

function rotateJoints(j: Joints, center: Pt, ang: number): Joints {
  if (ang === 0) return j;
  const c = Math.cos(ang), s = Math.sin(ang);
  const R = (p: Pt): Pt => {
    const dx = p.x - center.x, dy = p.y - center.y;
    return { x: center.x + dx * c - dy * s, y: center.y + dx * s + dy * c };
  };
  const o = {} as Joints;
  for (const k of Object.keys(j) as (keyof Joints)[]) (o as unknown as Record<string, Pt>)[k] = R(j[k]);
  return o;
}

// ── cloth (scarf / headband tails) ───────────────────────────────────────────
class Cloth {
  pts: Pt[] = [];
  prev: Pt[] = [];
  n: number;
  seg: number;
  constructor(n: number, seg: number) { this.n = n; this.seg = seg; }
  reset(x: number, y: number) {
    this.pts = []; this.prev = [];
    for (let i = 0; i < this.n; i++) { this.pts.push({ x, y: y + i * this.seg }); this.prev.push({ x, y: y + i * this.seg }); }
  }
  update(ax: number, ay: number, windX: number, frame: number) {
    if (this.pts.length === 0) this.reset(ax, ay);
    const pts = this.pts, prev = this.prev;
    pts[0].x = ax; pts[0].y = ay;
    for (let i = 1; i < this.n; i++) {
      const p = pts[i], q = prev[i];
      const vx = (p.x - q.x) * 0.94, vy = (p.y - q.y) * 0.94;
      q.x = p.x; q.y = p.y;
      p.x += vx + windX * (0.4 + i * 0.12) + Math.sin(frame * 0.09 + i * 1.4) * 0.3;
      p.y += vy + 0.55;
    }
    for (let k = 0; k < 3; k++) {
      pts[0].x = ax; pts[0].y = ay;
      for (let i = 0; i < this.n - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.max(0.001, Math.hypot(dx, dy));
        const diff = (d - this.seg) / d;
        if (i === 0) { b.x -= dx * diff; b.y -= dy * diff; }
        else { a.x += dx * diff * 0.45; a.y += dy * diff * 0.45; b.x -= dx * diff * 0.55; b.y -= dy * diff * 0.55; }
      }
    }
  }
}

// per-anim strike overlays: [windup, hit]
const STRIKES: Record<string, [PP, PP]> = {
  jab: [{ aF: [0.35, 0.2], lean: 0.16 }, { aF: [1.5, 1.55], lean: 0.38, bx: 12, head: 3 }],
  talon: [{ aF: [2.3, 2.1], lean: -0.06 }, { aF: [0.7, 0.85], lean: 0.34, bx: 10 }],
  rush: [{ lean: 0.2, aF: [0.6, 0.4] }, { aF: [1.45, 1.5], lean: 0.5, bx: 16 }],
  upper: [{ by: 18, aF: [0.15, -0.25], lean: 0.2, crouch: 0.3 }, { by: -16, aF: [2.6, 2.75], lean: -0.22, lF: [0.55, 0.4], lB: [-0.15, 0.4], head: -2 }],
  heel: [{ lF: [0.95, 1.35], lean: -0.18, aB: [-0.9, -0.7] }, { lF: [1.48, 1.53], lean: 0.4, bx: 16, aB: [-1.1, -0.9] }],
  sweep: [{ crouch: 0.75, lF: [-0.5, 0.4] }, { crouch: 1, lF: [1.53, 1.58], lean: 0.42, lB: [-0.9, 1.4] }],
  knee: [{ lF: [1.85, 1.5], aF: [0.7, 0.5] }, { lF: [1.8, 1.15], lean: 0.14, bx: 12, aF: [0.4, 0.2], aB: [-0.5, -0.3] }],
  push: [{ aF: [0.4, 0.3], aB: [0.4, 0.35] }, { aF: [1.52, 1.56], aB: [1.5, 1.44], lean: 0.34, bx: 10 }],
  shoot: [{ aF: [0.5, 0.7], aB: [0.5, 0.65], lean: 0.05 }, { aF: [1.42, 1.5], aB: [1.42, 1.48], lean: 0.26, bx: 6 }],
  shootWide: [{ aF: [0.3, 0.4], aB: [0.3, 0.45], by: 12, lean: 0.1 }, { aF: [1.45, 1.52], aB: [1.45, 1.5], lean: 0.3, bx: 8 }],
  lance: [{ aF: [1.2, 1.4], lean: 0.15 }, { aF: [2.2, 2.38], aB: [0.4, 0.5], lean: -0.12 }],
  orbCast: [{ aF: [1.6, 1.8], lean: -0.05 }, { aF: [2.55, 2.4], lean: 0.05, head: -2 }],
  sphereCast: [{ aF: [1.2, 1.3], aB: [1.2, 1.35], by: 12, crouch: 0.2 }, { lean: 0.42, aF: [1.5, 1.52], aB: [1.48, 1.5], bx: 8 }],
  blink: [{ lean: 0.15 }, { lean: 0.5, aF: [0.9, 1.0], aB: [0.2, 0.1] }],
  barrage: [{ lean: 0.15, aF: [0.5, 0.4], aB: [0.5, 0.45] }, { aF: [1.45, 1.5], aB: [1.45, 1.5], lean: 0.35, bx: 10 }],
  dive: [{ lean: 0.1 }, { lean: 0.6, aF: [1.4, 1.48], aB: [-0.6, -0.5], lF: [2.75, 2.55], lB: [2.3, 2.05], spin: 0.62 }],
  spin: [{ crouch: 0.2 }, { spin: 0.6, aF: [1.5, 1.5], aB: [-1.5, -1.5], lF: [1.3, 1.3], lB: [-1.1, -1.1] }],
  charge: [{ lean: 0.3, by: 10 }, { lean: 0.62, aF: [0.45, 0.35], aB: [0.3, 0.2], head: 7, bx: 14, lF: [0.8, 0.5], lB: [-0.7, 0.8] }],
  slam: [{ aF: [2.95, 2.85], aB: [2.95, 2.8], lean: -0.32, by: -10 }, { aF: [0.8, 0.9], aB: [0.8, 0.85], lean: 0.58, by: 16, crouch: 0.4 }],
  stomp: [{ lF: [1.25, 1.6], lean: -0.1 }, { lF: [0.15, 0.08], by: 7, lean: 0.3, aF: [-0.9, -0.8], aB: [-1.2, -1.1] }],
  grab: [{ aF: [0.3, 0.2], aB: [0.3, 0.25] }, { aF: [1.3, 1.46], aB: [1.32, 1.4], lean: 0.42, bx: 14 }],
};

// ────────────────────────────────────────────────────────────── renderer ──
export class Renderer {
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  W = 0; H = 0; dpr = 1;
  view = { s: 1, ox: 0, oy: 0 };
  cloths: [Cloth, Cloth] = [new Cloth(6, 13), new Cloth(6, 13)];
  band: [Cloth, Cloth] = [new Cloth(4, 9), new Cloth(4, 9)];
  ghostHp = [100, 100];
  comboShown = [0, 0];
  comboPop = [0, 0];
  rain: { x: number; y: number; s: number; l: number }[] = [];
  embers: Particle[] = [];
  camZoom = 1; camX = 0; camY = 0;
  bindHints: string[] = [];
  diffLabel = "";
  superKey = "6";
  skyGrad: CanvasGradient | null = null;
  buildings1: { x: number; w: number; h: number; seed: number }[] = [];
  buildings2: { x: number; w: number; h: number; seed: number }[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.cv = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;
    for (let i = 0; i < 110; i++) {
      this.rain.push({ x: Math.random() * WORLD.W, y: Math.random() * WORLD.H, s: 6 + Math.random() * 9, l: 8 + Math.random() * 14 });
    }
    let bx = -40;
    while (bx < WORLD.W + 80) { const w = 60 + Math.random() * 120; this.buildings1.push({ x: bx, w, h: 90 + Math.random() * 180, seed: Math.random() }); bx += w + 6; }
    bx = -60;
    while (bx < WORLD.W + 100) { const w = 90 + Math.random() * 140; this.buildings2.push({ x: bx, w, h: 60 + Math.random() * 150, seed: Math.random() }); bx += w + 10; }
  }

  resize(w: number, h: number) {
    this.W = w; this.H = h;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = Math.round(w * this.dpr);
    this.cv.height = Math.round(h * this.dpr);
    const s = Math.min(w / WORLD.W, h / WORLD.H);
    this.view = { s, ox: (w - WORLD.W * s) / 2, oy: (h - WORLD.H * s) / 2 };
    this.skyGrad = null;
  }

  setMeta(hints: string[], diffLabel: string, superKey = "6") {
    this.bindHints = hints;
    this.diffLabel = diffLabel;
    this.superKey = superKey;
  }

  // ── pose selection ─────────────────────────────────────────────────────
  private poseFor(f: Fighter, e: Engine): Pose {
    const t = e.frame;
    const c = f.char;
    // character-specific stance flavor
    let base = { ...BASE };
    if (c.id === "volt") { base.lean = 0.2; base.aF = [0.75, 1.0]; base.aB = [0.3, 0.55]; }
    if (c.id === "bruno") { base.lF = [0.34, 0.2]; base.lB = [-0.42, 0.32]; base.aF = [0.42, 0.55]; base.aB = [0.1, 0.3]; base.lean = 0.14; }
    if (c.id === "sage") { base.lean = 0.02; base.aF = [0.85, 1.05]; base.aB = [-0.4, -0.2]; }
    if (c.id === "jett") { base.lean = 0.1; base.aF = [0.7, 0.9]; base.aB = [-0.35, 0.1]; }

    const bob = Math.sin(t * 0.07 + f.id * 2) * 2;
    base.by += bob * 0.6;

    let pose: Pose = base;
    switch (f.state) {
      case "walk": {
        const ph = f.stateT * (f.char.id === "bruno" ? 0.24 : 0.34);
        const s = Math.sin(ph), sn = Math.sin(ph + Math.PI);
        pose = mixPose(base, {
          lF: [0.22 + s * 0.55, 0.16 + Math.max(0, -Math.cos(ph)) * 0.9],
          lB: [-0.3 + sn * 0.55, 0.3 + Math.max(0, Math.cos(ph)) * 0.9],
          aF: [base.aF[0] + sn * 0.3, base.aF[1] + sn * 0.25],
          aB: [base.aB[0] + s * 0.3, base.aB[1] + s * 0.25],
          by: Math.abs(Math.cos(ph)) * -3, lean: base.lean + 0.06,
        }, 1);
        break;
      }
      case "dash":
        pose = mixPose(base, { lean: 0.65, aF: [-0.7, -0.6], aB: [-1.0, -0.9], lF: [1.1, 1.5], lB: [-0.9, 0.3], by: 4 }, 1);
        break;
      case "air": {
        if (f.vy < 0) pose = mixPose(base, { lF: [1.05, 1.25], lB: [0.35, 1.0], aF: [-0.6, -0.8], aB: [0.9, 1.1], lean: 0.12 }, 1);
        else pose = mixPose(base, { lF: [0.5, 0.7], lB: [-0.5, 0.6], aF: [-0.9, -1.1], aB: [1.2, 1.3], lean: -0.06 }, 1);
        break;
      }
      case "crouch":
        pose = mixPose(base, { crouch: 1, lean: 0.3, aF: [0.9, 1.3], aB: [0.3, 0.6] }, 1);
        break;
      case "hitstun": {
        const k = Math.min(1, f.hitstunT / 20);
        pose = mixPose(base, { lean: -0.55 * k, head: -7 * k, aF: [-0.8, -0.5], aB: [1.6, 1.9], lF: [0.5, 0.5], lB: [-0.6, 0.4] }, 1);
        break;
      }
      case "blockstun":
        pose = mixPose(base, { lean: -0.18, aF: [0.85, 1.3], aB: [0.35, 0.8], head: -3, crouch: f.stanceCrouch * 0.8 }, 1);
        break;
      case "downed":
        pose = mixPose(base, { spin: -1.52, by: 26, lean: 0, aF: [0.4, 0.3], aB: [0.2, 0.1], lF: [0.5, 0.6], lB: [0.3, 0.5] }, 1);
        break;
      case "getup": {
        const r = clamp01(f.stateT / 14);
        pose = mixPose(mixPose(base, { spin: -1.52, by: 26, aF: [0.4, 0.3] }, 1), base, eOut(r));
        break;
      }
      case "ko": {
        const r = clamp01(f.stateT / 22);
        pose = mixPose(mixPose(base, { lean: -0.5, aF: [-0.7, -0.9], aB: [1.3, 1.5] }, 1), { spin: -1.5, by: 26 }, eOut(r));
        break;
      }
      case "win": {
        const hop = Math.abs(Math.sin(f.stateT * 0.12)) * -14;
        pose = mixPose(base, { aF: [2.9, 2.85], aB: [2.75, 2.7], by: hop, lF: [0.3, 0.3], lB: [-0.25, 0.35], lean: 0.02 }, 1);
        break;
      }
      case "attack": {
        const at = f.attack!;
        const m = at.move;
        const key = m.anim;
        const pair = STRIKES[key] ?? STRIKES.jab;
        const ph = f.attackPhase() ?? "startup";
        let p: Pose;
        const groundedBase = at.airVariant ? (f.vy < 0
          ? mixPose(base, { lF: [1.0, 1.2], lB: [0.35, 1.0], aF: [-0.5, -0.7], aB: [0.8, 1.0] }, 1)
          : mixPose(base, { lF: [0.5, 0.7], lB: [-0.5, 0.6], aF: [-0.8, -1.0], aB: [1.1, 1.2] }, 1))
          : base;
        if (ph === "startup") {
          const tS = eIO(clamp01(at.frame / Math.max(1, m.startup)));
          p = mixPose(groundedBase, pair[0], tS);
        } else if (ph === "active") {
          const tA = clamp01((at.frame - m.startup) / Math.max(1, m.active));
          p = mixPose(mixPose(groundedBase, pair[0], 1), pair[1], eOut(clamp01(tA * 2.4)));
          // special active dynamics
          if (key === "barrage") {
            const osc = Math.sin(at.frame * 2.2) * 0.4;
            p = mixPose(p, { aF: [1.45 + osc, 1.5 + osc], aB: [1.45 - osc, 1.5 - osc], bx: (p.bx ?? 0) + Math.sin(at.frame * 5) * 2 }, 1);
          }
          if (key === "spin") p = { ...p, spin: tA * Math.PI * 4 };
          if (key === "rush") {
            const o2 = Math.sin(tA * Math.PI * 6) * 0.35;
            p = mixPose(p, { aF: [1.45 + o2, 1.5 + o2] }, 0.8);
          }
          if (key === "charge") {
            const ph2 = at.frame * 0.5;
            p = mixPose(p, { lF: [0.8 + Math.sin(ph2) * 0.6, 0.5], lB: [-0.7 + Math.sin(ph2 + Math.PI) * 0.6, 0.8] }, 1);
          }
        } else {
          const tR = clamp01((at.frame - m.startup - m.active) / Math.max(1, m.recovery));
          p = mixPose(mixPose(groundedBase, pair[1], 1), groundedBase, eIO(tR));
        }
        return p;
      }
      default:
        pose = base;
    }

    // guard overlays (block intents during neutral)
    if (f.blocking && (f.state === "idle" || f.state === "walk" || f.state === "crouch")) {
      if (f.blockLow) pose = mixPose(pose, { crouch: 1, aF: [0.62, 1.0], aB: [0.2, 0.4], lean: -0.05 }, 1);
      else pose = mixPose(pose, { aF: [0.85, 1.3], aB: [0.3, 0.75], lean: -0.14, head: -3 }, 1);
    } else if (pose === base && f.stanceCrouch > 0.03) {
      pose = mixPose(base, { crouch: f.stanceCrouch, lean: 0.3 }, f.stanceCrouch);
    }
    return pose;
  }

  // ── fighter drawing ────────────────────────────────────────────────────
  private drawSkeleton(j: Joints, color: string, girth: number, alpha: number, glow: boolean, headR: number) {
    const ctx = this.ctx;
    const lw = 7.5 * girth;
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const bodyPath = () => {
      ctx.beginPath();
      ctx.moveTo(j.hip.x, j.hip.y); ctx.lineTo(j.chest.x, j.chest.y); ctx.lineTo(j.neck.x, j.neck.y);
      ctx.moveTo(j.sB.x, j.sB.y); ctx.lineTo(j.eB.x, j.eB.y); ctx.lineTo(j.hB.x, j.hB.y);
      ctx.moveTo(j.hip.x, j.hip.y); ctx.lineTo(j.kB.x, j.kB.y); ctx.lineTo(j.fB.x, j.fB.y);
      ctx.moveTo(j.hip.x, j.hip.y); ctx.lineTo(j.kF.x, j.kF.y); ctx.lineTo(j.fF.x, j.fF.y);
      ctx.moveTo(j.sF.x, j.sF.y); ctx.lineTo(j.eF.x, j.eF.y); ctx.lineTo(j.hF.x, j.hF.y);
    };
    const strokeAll = (w: number, style: string, blur: number) => {
      bodyPath();
      ctx.lineWidth = w;
      ctx.strokeStyle = style;
      ctx.shadowBlur = blur;
      ctx.shadowColor = style;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(j.head.x, j.head.y, headR * girth, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    if (glow) strokeAll(lw + 5.5, color, 18);
    strokeAll(lw, color, glow ? 8 : 0);
    // hot core
    bodyPath();
    ctx.lineWidth = lw * 0.42;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(j.head.x, j.head.y, headR * girth * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawAccessory(f: Fighter, j: Joints, e: Engine, ghost = false) {
    const ctx = this.ctx;
    const c = f.char;
    const acc = c.acc;
    ctx.save();
    if (ghost) ctx.globalAlpha *= 1.4;
    ctx.strokeStyle = c.color;
    ctx.fillStyle = c.color;
    ctx.lineWidth = 3;
    const head = j.head;
    switch (acc) {
      case "hat": {
        // wizard hat: brim + cone
        ctx.beginPath();
        ctx.ellipse(head.x, head.y - 10, 24 * c.girth, 5.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(head.x - 14, head.y - 11);
        ctx.lineTo(head.x + 4, head.y - 40);
        ctx.lineTo(head.x + 14, head.y - 11);
        ctx.closePath();
        ctx.fill();
        // floating sparkles
        if (!ghost) {
          for (let i = 0; i < 3; i++) {
            const a = e.frame * 0.05 + i * 2.1;
            const px = head.x + Math.cos(a) * 26;
            const py = head.y - 20 + Math.sin(a * 1.4) * 8;
            ctx.globalAlpha = 0.5 + Math.sin(e.frame * 0.1 + i) * 0.4;
            ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
          }
          ctx.globalAlpha = 1;
        }
        break;
      }
      case "goggles": {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(head.x + 6, head.y - 1, 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(head.x + 6, head.y - 1);
        ctx.lineTo(head.x - 13, head.y - 2);
        ctx.stroke();
        // electric hair spikes
        if (!ghost && e.frame % 14 < 4) {
          ctx.globalAlpha = 0.8;
          for (let i = 0; i < 2; i++) {
            const a = Math.PI * (0.7 + i * 0.35);
            ctx.beginPath();
            ctx.moveTo(head.x + Math.cos(a) * 12, head.y + Math.sin(a) * 12);
            let px = head.x + Math.cos(a) * 12, py = head.y + Math.sin(a) * 12;
            for (let k = 0; k < 3; k++) {
              px += Math.cos(a) * 6 + (Math.random() - 0.5) * 5;
              py += Math.sin(a) * 6 + (Math.random() - 0.5) * 5;
              ctx.lineTo(px, py);
            }
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
        break;
      }
      case "mohawk": {
        ctx.beginPath();
        ctx.moveTo(head.x - 12, head.y - 8);
        ctx.lineTo(head.x - 4, head.y - 22);
        ctx.lineTo(head.x + 10, head.y - 14);
        ctx.closePath();
        ctx.fill();
        // shoulder pads
        ctx.beginPath();
        ctx.arc(j.sF.x + 4, j.sF.y - 4, 9 * c.girth, Math.PI, 0);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(j.sB.x - 4, j.sB.y - 4, 9 * c.girth, Math.PI, 0);
        ctx.fill();
        break;
      }
      case "scarf": {
        // long ribbon from neck — verlet
        const cl = this.cloths[f.id];
        const windX = -f.vx * 0.55 + (f.state === "dash" ? -f.facing * 3 : 0);
        cl.update(j.neck.x - 2 * f.facing, j.neck.y + 2, windX, e.frame);
        const pts = cl.pts;
        if (pts.length >= 2) {
          ctx.lineWidth = 7;
          ctx.lineCap = "round";
          ctx.shadowBlur = ghost ? 0 : 10;
          ctx.shadowColor = c.color;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        break;
      }
      case "headband": {
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(head.x - 12, head.y - 4);
        ctx.lineTo(head.x + 10, head.y - 5);
        ctx.stroke();
        const cl = this.band[f.id];
        cl.update(head.x - 10 * f.facing, head.y - 4, -f.vx * 0.4, e.frame);
        const pts = cl.pts;
        if (pts.length >= 2) {
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
        }
        break;
      }
    }
    // glowing eye
    ctx.fillStyle = "#ffffff";
    ctx.shadowBlur = ghost ? 0 : 6;
    ctx.shadowColor = "#fff";
    ctx.beginPath();
    ctx.ellipse(head.x + 6, head.y + 1, 2.4 * c.girth, 1.6 * c.girth, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  private drawFighter(f: Fighter, e: Engine, reflect = false) {
    const ctx = this.ctx;
    // ghosts / afterimages
    if (!reflect) {
      for (const g of f.ghosts) {
        const p = this.poseForGhost(g.anim, g.animT);
        const j = rotateJoints(skeleton(p, f.char.scale), { x: 0, y: -60 }, p.spin);
        ctx.save();
        ctx.translate(g.x, g.fy);
        ctx.scale(g.facing, 1);
        this.drawSkeleton(j, f.char.color, f.char.girth, (g.life / g.maxLife) * 0.4, false, 15);
        ctx.restore();
      }
    }
    const pose = this.poseFor(f, e);
    let j = skeleton(pose, f.char.scale);
    j = rotateJoints(j, { x: 0, y: -58 * f.char.scale }, pose.spin);

    ctx.save();
    if (reflect) {
      ctx.translate(f.x, 2 * WORLD.GROUND - f.fy + 4);
      ctx.scale(1, -1);
      ctx.scale(f.facing, 1);
      this.drawSkeleton(j, f.char.color, f.char.girth, 0.09, false, 15);
      ctx.restore();
      return;
    }
    // shadow
    const hAbove = Math.max(0, WORLD.GROUND - f.fy);
    const shS = Math.max(0.3, 1 - hAbove / 500);
    ctx.globalAlpha = 0.4 * shS;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(f.x, WORLD.GROUND + 8, 44 * shS * f.char.scale, 8 * shS, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.translate(f.x, f.fy);
    ctx.scale(f.facing, 1);

    // intangible flicker
    if (f.intangible > 0) ctx.globalAlpha = 0.45 + Math.sin(e.frame * 1.2) * 0.25;
    // armor flash
    if (f.superArmorFlash > 0 || (f.armorLeft > 0 && f.state === "attack")) {
      ctx.strokeStyle = "#ffd28f";
      ctx.lineWidth = 3;
      ctx.globalAlpha *= 1;
    }
    this.drawSkeleton(j, f.char.color, f.char.girth, 1, true, 15);
    ctx.restore();

    // accessories drawn in world space (cloth needs world coords)
    ctx.save();
    const jw = rotateJoints(
      skeleton(pose, f.char.scale),
      { x: 0, y: -58 * f.char.scale },
      pose.spin
    );
    // transform joints to world
    const toWorld = (p: Pt): Pt => ({ x: f.x + p.x * f.facing, y: f.fy + p.y });
    const wj = {} as Joints;
    for (const k of Object.keys(jw) as (keyof Joints)[]) (wj as unknown as Record<string, Pt>)[k] = toWorld(jw[k]);
    // accessories that don't depend on facing-flip drawing individually
    this.drawAccessory(f, wj, e);
    ctx.restore();
  }

  private poseForGhost(anim: string, animT: number): Pose {
    // approximate: reuse STRIKES hit poses for attack ghosts, base otherwise
    const base = { ...BASE };
    if (anim.startsWith("idle") || anim.startsWith("walk") || anim.startsWith("dash")) {
      return anim.startsWith("dash") ? mixPose(base, { lean: 0.6, aF: [-0.7, -0.6], aB: [-1, -0.9], lF: [1.1, 1.5], lB: [-0.9, 0.3] }, 1) : base;
    }
    const key = anim.split(":")[0];
    const pair = STRIKES[key];
    if (pair) {
      void animT;
      return mixPose(base, pair[1], 1);
    }
    return base;
  }

  // ── stage ──────────────────────────────────────────────────────────────
  private drawStage(e: Engine) {
    const ctx = this.ctx;
    const W = WORLD.W, H = WORLD.H, G = WORLD.GROUND;
    if (!this.skyGrad) {
      const g = ctx.createLinearGradient(0, 0, 0, G);
      g.addColorStop(0, "#07070f");
      g.addColorStop(0.55, "#101029");
      g.addColorStop(1, "#1a1038");
      this.skyGrad = g;
    }
    ctx.fillStyle = this.skyGrad;
    ctx.fillRect(0, 0, W, H);

    // moon glow
    const mg = ctx.createRadialGradient(W * 0.72, 200, 10, W * 0.72, 200, 300);
    mg.addColorStop(0, "rgba(216,180,254,0.30)");
    mg.addColorStop(1, "rgba(216,180,254,0)");
    ctx.fillStyle = mg;
    ctx.fillRect(W * 0.72 - 300, -100, 600, 600);
    ctx.fillStyle = "rgba(240,220,255,0.75)";
    ctx.beginPath();
    ctx.arc(W * 0.72, 195, 46, 0, Math.PI * 2);
    ctx.fill();

    const shakeX = (e.trauma * e.trauma) * 14 * (Math.random() - 0.5);
    // far skyline
    ctx.fillStyle = "#0c0c1d";
    for (const b of this.buildings1) {
      const h = b.h;
      ctx.fillRect(b.x + shakeX * 0.3, G - 190 - h, b.w, h + 190);
      if (b.seed > 0.5) { ctx.fillRect(b.x + shakeX * 0.3 + b.w / 2 - 2, G - 190 - h - 16, 4, 16); }
      // windows
      ctx.fillStyle = "rgba(125,211,252,0.14)";
      const rows = Math.floor(h / 26);
      for (let r = 0; r < rows; r++) {
        for (let col = 0; col < 3; col++) {
          if (((r * 7 + col * 13 + Math.floor(b.seed * 100)) % 5) < 2) {
            ctx.fillRect(b.x + shakeX * 0.3 + 10 + col * (b.w - 20) / 3, G - 180 - h + 12 + r * 26, 7, 10);
          }
        }
      }
      ctx.fillStyle = "#0c0c1d";
    }
    // near skyline
    ctx.fillStyle = "#12122a";
    const accents = [e.p1Char.color, e.p2Char.color, "#67e8f9", "#c084fc"];
    let accI = 0;
    for (const b of this.buildings2) {
      ctx.fillRect(b.x + shakeX * 0.6, G - 60 - b.h, b.w, b.h + 60);
      // neon edge signs
      const col = accents[accI++ % accents.length];
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.5;
      if (Math.floor(b.seed * 10) % 3 === 0) {
        ctx.fillRect(b.x + shakeX * 0.6 + 4, G - 50 - b.h, 3, b.h * 0.7);
      } else if (Math.floor(b.seed * 10) % 3 === 1) {
        ctx.fillRect(b.x + shakeX * 0.6 + b.w - 8, G - 40 - b.h * 0.8, 4, b.h * 0.5);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#12122a";
    }

    // floor
    const fg = ctx.createLinearGradient(0, G - 60, 0, H);
    fg.addColorStop(0, "#191932");
    fg.addColorStop(0.12, "#101024");
    fg.addColorStop(1, "#05050c");
    ctx.fillStyle = fg;
    ctx.fillRect(0, G - 60, W, H - G + 60);
    // horizon energy line (player-colored, halves)
    const grd = ctx.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, e.p1Char.color);
    grd.addColorStop(0.5, "#f8fafc");
    grd.addColorStop(1, e.p2Char.color);
    ctx.fillStyle = grd;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(0, G - 2, W, 3);
    ctx.globalAlpha = 0.25;
    ctx.fillRect(0, G + 1, W, 9);
    ctx.globalAlpha = 1;

    // perspective grid
    ctx.strokeStyle = "rgba(103,232,249,0.07)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 16; i++) {
      const x = (i / 16) * W;
      ctx.beginPath();
      ctx.moveTo(W / 2 + (x - W / 2) * 0.6, G);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let i = 1; i <= 5; i++) {
      const y = G + (i / 5) * (H - G) * (i / 5);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // walls glow at edges
    const wl = ctx.createLinearGradient(WORLD.WALL_L - 40, 0, WORLD.WALL_L + 20, 0);
    wl.addColorStop(0, "rgba(103,232,249,0)");
    wl.addColorStop(1, "rgba(103,232,249,0.14)");
    ctx.fillStyle = wl;
    ctx.fillRect(WORLD.WALL_L - 40, G - 400, 60, 400);
    const wr = ctx.createLinearGradient(WORLD.WALL_R + 40, 0, WORLD.WALL_R - 20, 0);
    wr.addColorStop(0, "rgba(251,113,133,0)");
    wr.addColorStop(1, "rgba(251,113,133,0.14)");
    ctx.fillStyle = wr;
    ctx.fillRect(WORLD.WALL_R - 20, G - 400, 60, 400);

    // rain
    const live = !e.paused && !e.matchOver;
    ctx.strokeStyle = "rgba(165,200,255,0.18)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const r of this.rain) {
      if (live) {
        r.y += r.s;
        r.x += r.s * 0.22;
        if (r.y > G - Math.random() * 30) {
          if (Math.random() < 0.12) {
            e.fx.spawn({ type: "splash", x: r.x, y: G, vx: 0, vy: 0, life: 8, size: 5, color: "rgba(165,200,255,0.5)" });
          }
          r.y = -20; r.x = Math.random() * (W + 200) - 100;
        }
      }
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x + r.s * 0.22, r.y + r.l);
    }
    ctx.stroke();

    // drifting embers
    if (live && e.frame % 9 === 0 && Math.random() < 0.7) {
      const col = Math.random() < 0.5 ? e.p1Char.color : e.p2Char.color;
      e.fx.spawn({
        type: "ember", x: Math.random() * W, y: G + 10,
        vx: 0, vy: -(0.3 + Math.random() * 0.5), life: 200 + Math.random() * 120,
        size: 1 + Math.random() * 2, color: col,
      });
    }
  }

  // ── projectiles / orbs / particles ──────────────────────────────────────
  private drawProjectile(p: Projectile, e: Engine) {
    const ctx = this.ctx;
    const r = p.def.radius;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.def.low) {
      // ground quake: jagged mound
      ctx.fillStyle = p.def.color;
      ctx.shadowBlur = 16;
      ctx.shadowColor = p.def.color;
      ctx.beginPath();
      const w = (p.def.w ?? 40) / 2;
      ctx.moveTo(-w, 8);
      for (let i = 0; i <= 5; i++) {
        const xx = -w + (i / 5) * w * 2;
        const yy = -((i % 2 === 0 ? 12 : 26) + Math.sin(e.frame * 0.4 + i) * 4);
        ctx.lineTo(xx, yy);
      }
      ctx.lineTo(w, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }
    const big = r > 30;
    const grd = ctx.createRadialGradient(0, 0, 1, 0, 0, r * (big ? 2.6 : 2.2));
    grd.addColorStop(0, "#ffffff");
    grd.addColorStop(0.35, p.def.color);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(0, 0, r * (big ? 2.2 : 2), 0, Math.PI * 2);
    ctx.fill();
    // pulsing core
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.42 * (1 + Math.sin(e.frame * 0.35) * 0.12), 0, Math.PI * 2);
    ctx.fill();
    // tail
    ctx.strokeStyle = p.def.color;
    ctx.lineWidth = big ? 7 : 3.5;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(-p.vx * 1.6, -p.vy * 1.6);
    ctx.lineTo(0, 0);
    ctx.stroke();
    if (big) {
      // swirling shards
      for (let i = 0; i < 5; i++) {
        const a = e.frame * 0.12 + (i * Math.PI * 2) / 5;
        const rr = r * 1.5 + Math.sin(e.frame * 0.2 + i) * 6;
        ctx.fillStyle = i % 2 ? "#fff" : p.def.color;
        ctx.globalAlpha = 0.8;
        ctx.fillRect(Math.cos(a) * rr - 2.5, Math.sin(a) * rr - 2.5, 5, 5);
      }
    }
    ctx.restore();
  }

  private drawOrb(o: Orb, e: Engine) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(o.x, o.y);
    const pulse = 1 + Math.sin(e.frame * 0.15) * 0.1;
    ctx.strokeStyle = o.armed ? "#e9d5ff" : "#8b5cf6";
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 16;
    ctx.shadowColor = "#c084fc";
    ctx.rotate(e.frame * 0.05);
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, 22 * pulse, 9 * pulse, (i * Math.PI) / 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#f3e8ff";
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    if (!o.armed) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#c084fc";
      ctx.font = "600 14px 'Chakra Petch'";
      ctx.textAlign = "center";
      ctx.fillText("ARMING", 0, -32);
    }
    ctx.restore();
  }

  private drawParticles(e: Engine) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of e.fx.list) {
      const a = Math.max(0, p.life / p.maxLife);
      switch (p.type) {
        case "spark":
          ctx.globalAlpha = a;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2);
          ctx.stroke();
          break;
        case "glow": {
          ctx.globalAlpha = a * 0.8;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          g.addColorStop(0, p.color);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case "ring":
          ctx.globalAlpha = a * 0.9;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3 * a + 0.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.05 - a) + p.size * a * 0.55, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case "dust":
          ctx.globalAlpha = a * 0.35;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "shard":
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.spin ?? 0);
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          ctx.restore();
          break;
        case "shockline":
          ctx.globalAlpha = a * 0.7;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + (p.vx > 0 ? -p.size : p.size), p.y);
          ctx.stroke();
          break;
        case "arc": {
          ctx.globalAlpha = a;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          const segs = 5;
          for (let i = 1; i <= segs; i++) {
            const t = i / segs;
            const nx = p.x + ((p.ex ?? p.x) - p.x) * t + (Math.random() - 0.5) * 14 * (i === segs ? 0 : 1);
            const ny = p.y + ((p.ey ?? p.y) - p.y) * t + (Math.random() - 0.5) * 14 * (i === segs ? 0 : 1);
            ctx.lineTo(nx, ny);
          }
          ctx.stroke();
          break;
        }
        case "ember":
          ctx.globalAlpha = Math.min(1, a * 2) * 0.6;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "splash":
          ctx.globalAlpha = a * 0.4;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.size * (1.4 - a), p.size * 0.3 * (1.4 - a), 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        default:
          break;
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ── HUD ─────────────────────────────────────────────────────────────────
  private bar(x: number, y: number, w: number, h: number, _t: number, mirror: boolean) {
    // angled parallelogram path
    const ctx = this.ctx;
    const s = 14 * (mirror ? -1 : 1);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w - s, y + h);
    ctx.lineTo(x - s, y + h);
    ctx.closePath();
  }

  private drawHealth(e: Engine) {
    const ctx = this.ctx;
    const GY = 42, GH = 24, GW = 620;
    // ghost bars lag
    for (let i = 0; i < 2; i++) {
      const hp = e.f[i].hp;
      if (this.ghostHp[i] > hp) this.ghostHp[i] = Math.max(hp, this.ghostHp[i] - 0.55);
      else this.ghostHp[i] = hp;
    }
    for (const side of [0, 1] as const) {
      const f = e.f[side];
      const mirror = side === 1;
      const x0 = mirror ? WORLD.W - 60 : 60;
      const bx = mirror ? x0 - GW : x0;
      // plate
      ctx.save();
      this.bar(bx - 6, GY - 7, GW + 12, GH + 14, GY, mirror);
      ctx.fillStyle = "rgba(8,8,16,0.82)";
      ctx.fill();
      ctx.strokeStyle = "rgba(103,232,249,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
      // ghost
      const pct = Math.max(0, f.hp / f.char.hp);
      const gpct = Math.max(pct, this.ghostHp[side] / f.char.hp);
      this.bar(bx, GY, GW * gpct, GH, GY, mirror);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fill();
      // real
      this.bar(bx, GY, GW * pct, GH, GY, mirror);
      const grad = ctx.createLinearGradient(bx, 0, bx + GW, 0);
      const col = f.char.color;
      if (mirror) { grad.addColorStop(0, "#f8fafc"); grad.addColorStop(0.15, col); grad.addColorStop(1, col); }
      else { grad.addColorStop(0, col); grad.addColorStop(0.85, col); grad.addColorStop(1, "#f8fafc"); }
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.95;
      ctx.fill();
      ctx.globalAlpha = 1;
      // hp sheen
      this.bar(bx, GY, GW * pct, GH / 2.6, GY, mirror);
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fill();
      // names
      ctx.font = "700 21px 'Chakra Petch'";
      ctx.textAlign = mirror ? "right" : "left";
      ctx.fillStyle = "#f4f4fb";
      const label = mirror ? `${f.char.name} · CPU ${this.diffLabel}` : f.char.name;
      ctx.fillText(label, mirror ? bx + GW : bx, GY + GH + 26);
      ctx.font = "500 13px 'Chakra Petch'";
      ctx.fillStyle = "rgba(232,232,240,0.55)";
      ctx.fillText(f.char.title.toUpperCase(), mirror ? bx + GW : bx, GY + GH + 44);
      // round pips
      for (let i = 0; i < 2; i++) {
        const px = mirror ? bx + GW - 20 - i * 26 : bx + 20 + i * 26;
        const won = e.wins[side] > i;
        ctx.beginPath();
        ctx.moveTo(px, GY + GH + 58);
        ctx.lineTo(px + 8, GY + GH + 64);
        ctx.lineTo(px, GY + GH + 70);
        ctx.lineTo(px - 8, GY + GH + 64);
        ctx.closePath();
        ctx.fillStyle = won ? "#ffe45e" : "rgba(255,255,255,0.14)";
        ctx.shadowBlur = won ? 10 : 0;
        ctx.shadowColor = "#ffe45e";
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    }
    // timer diamond
    ctx.save();
    ctx.translate(WORLD.W / 2, GY + 10);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "rgba(8,8,16,0.9)";
    ctx.strokeStyle = "rgba(255,228,94,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-27, -27, 54, 54);
    ctx.fill(); ctx.stroke();
    ctx.rotate(-Math.PI / 4);
    ctx.font = "800 30px 'Unbounded'";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const secs = Math.ceil(e.timer / 60);
    ctx.fillStyle = secs <= 10 ? "#fb7185" : "#ffe45e";
    ctx.fillText(String(secs), 0, 3);
    ctx.textBaseline = "alphabetic";
    ctx.restore();

    // meters
    for (const side of [0, 1] as const) {
      const f = e.f[side];
      const mirror = side === 1;
      const MW = 460, MH = 13, MY = WORLD.H - 46;
      const bx = mirror ? WORLD.W - 70 - MW : 70;
      const pct = f.meter / WORLD.METER_MAX;
      this.bar(bx - 3, MY - 4, MW + 6, MH + 8, MY, mirror);
      ctx.fillStyle = "rgba(8,8,16,0.8)";
      ctx.fill();
      this.bar(bx, MY, MW * pct, MH, MY, mirror);
      const full = f.meter >= WORLD.METER_MAX;
      const grad = ctx.createLinearGradient(bx, 0, bx + MW, 0);
      if (full) {
        const pulse = 0.75 + Math.sin(e.frame * 0.18) * 0.25;
        grad.addColorStop(0, `rgba(255,228,94,${pulse})`);
        grad.addColorStop(1, "#fb923c");
      } else {
        grad.addColorStop(0, "#3b82f6");
        grad.addColorStop(1, "#67e8f9");
      }
      ctx.fillStyle = grad;
      ctx.fill();
      // segments
      ctx.fillStyle = "rgba(5,5,10,0.85)";
      for (let i = 1; i < 4; i++) ctx.fillRect(bx + (MW * i) / 4 - 1.5, MY - 1, 3, MH + 2);
      ctx.font = "700 15px 'Chakra Petch'";
      ctx.textAlign = mirror ? "right" : "left";
      ctx.fillStyle = full ? "#ffe45e" : "rgba(232,232,240,0.6)";
      ctx.fillText(full ? `SUPER READY [${this.superKey}]` : "SUPER", mirror ? bx + MW : bx, MY - 9);
    }

    // control hints (round 1, first seconds)
    if (e.round === 1 && e.roundState !== "endwrap" && e.frame < 60 * 8 && this.bindHints.length) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, (60 * 8 - e.frame) / 60)) * 0.75;
      ctx.font = "500 15px 'Chakra Petch'";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(232,232,240,0.8)";
      ctx.fillText(this.bindHints.join("   ·   "), WORLD.W / 2, WORLD.H - 14);
      ctx.restore();
    }

    // combo counters
    for (const side of [0, 1] as const) {
      const f = e.f[side];
      if (f.combo > this.comboShown[side]) { this.comboShown[side] = f.combo; this.comboPop[side] = 8; }
      if (f.combo === 0) this.comboShown[side] = 0;
      if (this.comboPop[side] > 0) this.comboPop[side]--;
      if (f.combo >= 2 && f.comboTimer > 0) {
        const x = side === 0 ? 130 : WORLD.W - 130;
        const y = 210;
        const pop = 1 + this.comboPop[side] * 0.06;
        ctx.save();
        ctx.translate(x, y);
        ctx.transform(1, 0, -0.18, 1, 0, 0);
        ctx.textAlign = side === 0 ? "left" : "right";
        ctx.font = `900 ${Math.round(54 * pop)}px 'Unbounded'`;
        ctx.fillStyle = f.char.color;
        ctx.shadowBlur = 18;
        ctx.shadowColor = f.char.color;
        ctx.fillText(String(f.combo), 0, 0);
        ctx.shadowBlur = 0;
        ctx.font = "700 18px 'Chakra Petch'";
        ctx.fillStyle = "#f4f4fb";
        ctx.fillText("HITS", side === 0 ? 4 : -4, 26);
        ctx.restore();
      }
    }

    // popups
    for (const p of e.popups) {
      const t = p.t / p.dur;
      const a = t < 0.15 ? t / 0.15 : t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y - t * 40);
      ctx.font = `${p.big ? 900 : 700} ${p.big ? 30 : 19}px 'Unbounded'`;
      ctx.textAlign = "center";
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 14;
      ctx.shadowColor = p.color;
      ctx.fillText(p.txt, 0, 0);
      ctx.restore();
    }
  }

  private drawBanners(e: Engine) {
    const ctx = this.ctx;
    for (const b of e.banners) {
      const t = b.t;
      ctx.save();
      ctx.textAlign = "center";
      if (b.kind === "super") {
        // angled strip with name
        const prog = clamp01(t / 8) * clamp01((b.dur - t) / 10);
        ctx.globalAlpha = prog;
        ctx.translate(WORLD.W / 2, 330);
        ctx.transform(1, 0, -0.14, 1, 0, 0);
        ctx.fillStyle = "rgba(5,5,10,0.88)";
        ctx.fillRect(-560, -56, 1120, 92);
        ctx.fillStyle = b.color;
        ctx.fillRect(-560, -56, 10, 92);
        ctx.fillRect(550, -56, 10, 92);
        ctx.globalAlpha = prog;
        ctx.font = "900 54px 'Unbounded'";
        ctx.fillStyle = b.color;
        ctx.shadowBlur = 26;
        ctx.shadowColor = b.color;
        const slide = (1 - clamp01(t / 10)) * 60;
        ctx.fillText(b.main, slide, 12);
        ctx.shadowBlur = 0;
        ctx.font = "600 17px 'Chakra Petch'";
        ctx.fillStyle = "rgba(244,244,251,0.85)";
        ctx.textAlign = "left";
        ctx.fillText(b.sub, -530, -18);
        ctx.restore();
        continue;
      }
      const isKO = b.kind === "ko";
      const size = b.kind === "fight" ? 120 : isKO ? 150 : b.kind === "win" ? 84 : 74;
      const inA = isKO ? clamp01(t / 6) : clamp01(t / 10);
      const outA = t > b.dur ? Math.max(0, 1 - (t - b.dur) / 18) : 1;
      const popScale = isKO ? 1 + Math.max(0, 1 - t / 10) * 1.6 : b.kind === "fight" ? 1 + Math.max(0, 1 - t / 8) * 0.9 : 1;
      ctx.globalAlpha = Math.min(inA, outA);
      ctx.translate(WORLD.W / 2, 330);
      ctx.scale(popScale, popScale);
      ctx.font = `900 ${size}px 'Unbounded'`;
      const grad = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(1, b.color);
      ctx.fillStyle = grad;
      ctx.shadowBlur = isKO ? 40 : 24;
      ctx.shadowColor = b.color;
      if (isKO || b.kind === "fight") {
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 2;
      }
      const spaced = b.main.split("").join(isKO || b.kind === "round" ? " " : "");
      ctx.fillText(spaced, 0, 0);
      if (isKO || b.kind === "fight") ctx.strokeText(spaced, 0, 0);
      ctx.shadowBlur = 0;
      if (b.sub) {
        ctx.font = "600 22px 'Chakra Petch'";
        ctx.fillStyle = "rgba(244,244,251,0.9)";
        ctx.fillText(b.sub.split("").join("  "), 0, 52);
      }
      ctx.restore();
    }
  }

  // ── master render ────────────────────────────────────────────────────────
  render(e: Engine) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#050509";
    ctx.fillRect(0, 0, this.W, this.H);

    // camera
    const traumaOffX = (Math.random() - 0.5) * e.trauma * e.trauma * 26;
    const traumaOffY = (Math.random() - 0.5) * e.trauma * e.trauma * 20;
    const alpha = e.renderAlpha;
    const renderX = (f: Fighter) => f.prevX + (f.x - f.prevX) * alpha;
    const renderFy = (f: Fighter) => f.prevFy + (f.fy - f.prevFy) * alpha;
    const midX = (renderX(e.f[0]) + renderX(e.f[1])) / 2 - WORLD.W / 2;
    const midY = Math.min(renderFy(e.f[0]), renderFy(e.f[1])) - 500;
    const savedPos: [number, number][] = e.f.map((f) => [f.x, f.fy]);
    for (const f of e.f) { f.x = renderX(f); f.fy = renderFy(f); }
    const wantZoom = e.roundState === "ko" && e.stateT < 60 ? 1.14 : e.superFreeze > 0 ? 1.07 : 1;
    this.camZoom += (wantZoom - this.camZoom) * 0.08;
    const zt = Math.max(0, Math.min(1, (this.camZoom - 1) / 0.16));
    this.camX += (midX * zt - this.camX) * 0.1;
    this.camY += (midY * zt * 0.5 - this.camY) * 0.1;

    ctx.translate(this.view.ox, this.view.oy);
    ctx.scale(this.view.s, this.view.s);
    ctx.translate(WORLD.W / 2, WORLD.H / 2);
    ctx.scale(this.camZoom, this.camZoom);
    ctx.translate(-WORLD.W / 2 - this.camX + traumaOffX, -WORLD.H / 2 - this.camY + traumaOffY);

    // world
    ctx.save();
    ctx.beginPath();
    ctx.rect(-80, -80, WORLD.W + 160, WORLD.H + 160);
    ctx.clip();
    this.drawStage(e);

    // reflections
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, WORLD.GROUND + 2, WORLD.W, 150);
    ctx.clip();
    for (const f of e.f) this.drawFighter(f, e, true);
    ctx.restore();

    for (const f of e.f) this.drawFighter(f, e, false);
    for (const p of e.projectiles) this.drawProjectile(p, e);
    for (const o of e.orbs) this.drawOrb(o, e);
    this.drawParticles(e);
    ctx.restore();

    // Restore authoritative simulation positions after interpolation.
    e.f.forEach((f, i) => { f.x = savedPos[i][0]; f.fy = savedPos[i][1]; });

    // HUD in world-ish space but fixed (re-apply base transform without camera)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.translate(this.view.ox, this.view.oy);
    ctx.scale(this.view.s, this.view.s);
    this.drawHealth(e);
    this.drawBanners(e);

    // KO flash
    if (e.roundState === "ko" && e.stateT < 10) {
      ctx.globalAlpha = (1 - e.stateT / 10) * 0.75;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, WORLD.W, WORLD.H);
      ctx.globalAlpha = 1;
    }
    // super freeze darkening
    if (e.superFreeze > 0) {
      ctx.globalAlpha = Math.min(0.5, e.superFreeze / 14);
      ctx.fillStyle = "#05050a";
      ctx.fillRect(0, 0, WORLD.W, WORLD.H);
      ctx.globalAlpha = 1;
    }

    // vignette
    const vg = ctx.createRadialGradient(WORLD.W / 2, WORLD.H / 2, WORLD.H * 0.44, WORLD.W / 2, WORLD.H / 2, WORLD.H * 0.86);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, WORLD.W, WORLD.H);
  }
}
