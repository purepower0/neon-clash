// ── Engine: fixed-step simulation, collisions, rounds, juice ─────────────────
import type { CharacterDef, Difficulty, ProjectileDef, MoveDef, Cmd } from "./types";
import { WORLD, EMPTY_CMD } from "./types";
import { Fighter } from "./fighter";
import { Particles } from "./particles";
import { audio } from "./audio";
import { getChar } from "./characters";

export interface Projectile {
  x: number; y: number;
  vx: number; vy: number;
  dir: 1 | -1;
  def: ProjectileDef;
  move: MoveDef;
  ownerId: number;
  life: number;
  born: number;
  lastHitFrame: number;
  used: boolean;          // single-hit consumed
  dead: boolean;
}

export interface Orb {
  x: number; y: number;
  ownerId: number;
  life: number;
  armed: boolean;
  move: MoveDef;
  exploding: number;      // >0 while detonating
  dead: boolean;
}

export interface Popup { txt: string; x: number; y: number; t: number; dur: number; color: string; big: boolean; }
export interface Banner { main: string; sub: string; t: number; dur: number; kind: "round" | "fight" | "ko" | "win" | "super"; color: string; }

export type RoundState = "intro" | "fight" | "ko" | "endwrap";
export type MatchEvent =
  | { type: "matchEnd"; winner: 0 | 1 }
  | { type: "roundEnd"; winner: 0 | 1 | -1; round: number };

export interface Controller { poll(self: Fighter, foe: Fighter, engine: Engine): Cmd; }

export class Engine {
  p1Char: CharacterDef; p2Char: CharacterDef;
  diff: Difficulty;
  f: [Fighter, Fighter];
  controllers: [Controller, Controller];
  projectiles: Projectile[] = [];
  orbs: Orb[] = [];
  fx = new Particles();
  popups: Popup[] = [];
  banners: Banner[] = [];
  frame = 0;
  // Fractional position between the previous and current 60 Hz simulation tick.
  renderAlpha = 0;
  round = 1;
  wins: [number, number] = [0, 0];
  roundState: RoundState = "intro";
  stateT = 0;
  timer = WORLD.ROUND_TIME * 60;
  hitstop = 0;
  slowmo = 0;
  slowTick = 0;
  superFreeze = 0;
  trauma = 0;
  paused = false;
  matchOver = false;
  koData: { winner: 0 | 1 | -1 } | null = null;
  perfect = false;
  audio = audio;
  onEvent: ((e: MatchEvent) => void) | null = null;

  constructor(p1Id: string, p2Id: string, diff: Difficulty, c1: Controller, c2: Controller) {
    this.p1Char = getChar(p1Id);
    this.p2Char = getChar(p2Id);
    this.diff = diff;
    this.f = [
      new Fighter(this, this.p1Char, 0, 600, 1),
      new Fighter(this, this.p2Char, 1, 1000, -1),
    ];
    this.controllers = [c1, c2];
    this.startRound(true);
  }

  startRound(first = false) {
    const [a, b] = this.f;
    for (const g of [a, b]) {
      g.hp = g.char.hp;
      g.fy = WORLD.GROUND;
      g.vx = 0; g.vy = 0;
      g.state = "intro"; g.stateT = 0;
      g.attack = null; g.combo = 0; g.comboTimer = 0; g.maxCombo = 0;
      g.ghosts = []; g.juggleCount = 0; g.launched = false;
      g.cooldowns.clear();
      g.invuln = 0; g.intangible = 0; g.armorLeft = 0;
    }
    a.x = 600; a.facing = 1;
    b.x = 1000; b.facing = -1;
    if (first) { a.meter = 0; b.meter = 0; }
    this.projectiles = [];
    this.orbs = [];
    this.renderAlpha = 0;
    this.popups = [];
    this.roundState = "intro";
    this.stateT = 0;
    this.timer = WORLD.ROUND_TIME * 60;
    this.perfect = false;
    this.banners.push({
      main: this.wins[0] === 1 && this.wins[1] === 1 ? "FINAL ROUND" : `ROUND ${this.round}`,
      sub: this.round === 1 ? "FIRST TO TWO" : "",
      t: 0, dur: 88, kind: "round", color: "#e8e8f0",
    });
    audio.play("round");
  }

  shake(n: number) { this.trauma = Math.min(1.15, this.trauma + n / 18); }

  popup(txt: string, x: number, y: number, color = "#fff", big = false) {
    this.popups.push({ txt, x, y, t: 0, dur: big ? 64 : 44, color, big });
    if (this.popups.length > 12) this.popups.shift();
  }

  onMoveStarted(f: Fighter, m: MoveDef) {
    audio.play(m.sfx);
    if (m.cost) {
      this.superFreeze = 14;
      this.banners.push({
        main: f.char.superName, sub: f.id === 0 ? "P1 UNLEASHES" : "CPU UNLEASHES",
        t: 0, dur: 44, kind: "super", color: f.char.color,
      });
      const cx = f.x, cy = f.fy - 100;
      this.fx.speedLines(cx, cy, f.facing, 16, f.char.color);
      this.fx.ring(cx, cy, f.char.color, 110, 18);
      this.fx.burst(cx, cy, f.char.color, 18, 7, 22);
      this.shake(7);
      audio.play("super");
    }
    if (m.teleport) f.intangible = Math.max(f.intangible, m.startup + 6);
  }

  spawnProjectile(f: Fighter, m: MoveDef, airVariant: boolean) {
    const def = m.projectile!;
    let vx = def.speed * f.facing;
    let vy = def.vy ?? 0;
    if (airVariant && f.char.id === "jett") { vy = 6; vx = def.speed * 0.85 * f.facing; }
    const y = def.low ? WORLD.GROUND - 8 : f.fy - (m.yOff > 0 ? m.yOff : 100) + (airVariant ? 12 : 0);
    this.projectiles.push({
      x: f.x + f.facing * 46, y, vx, vy,
      dir: f.facing, def, move: m, ownerId: f.id,
      life: def.life, born: this.frame, lastHitFrame: -999, used: false, dead: false,
    });
    if (def.low) this.fx.dust(f.x + f.facing * 40, WORLD.GROUND, 8, f.char.color);
  }

  spawnOrb(f: Fighter, m: MoveDef) {
    if (this.orbs.some((o) => o.ownerId === f.id && !o.dead)) return;
    this.orbs.push({
      x: f.x + f.facing * 200, y: WORLD.GROUND - 128,
      ownerId: f.id, life: 480, armed: false, move: m, exploding: 0, dead: false,
    });
  }

  // ── hit resolution ─────────────────────────────────────────────────────────
  applyHit(att: Fighter, def: Fighter, m: MoveDef, dirOverride?: 1 | -1) {
    if (def.intangible > 0 || def.invuln > 0) return;
    if (def.state === "downed") return;                       // no OTG — wakeup mindgames only
    if (this.roundState === "ko" || this.roundState === "endwrap") return;
    if (m.kind === "grab" && !def.grounded) return;
    const dir = dirOverride ?? att.facing;
    const contactX = def.x - dir * 10;
    const contactY = Math.max(def.fy - def.bodyH * 0.62, 80);

    // ── blocking ──
    const canBlock = def.blocking && m.guard !== "unblockable" &&
      !((def.blockLow && m.guard === "overhead") || (!def.blockLow && m.guard === "low"));
    if (canBlock) {
      def.state = "blockstun";
      def.blockstunT = Math.max(1, m.blockstun);
      def.stateT = 0;
      const chip = Math.max(1, Math.round(m.damage * 0.12));
      def.hp = Math.max(0, def.hp - chip);
      const push = 4 + m.damage * 0.5;
      def.vx = dir * push;
      att.vx = -dir * push * 0.25;
      def.gainMeter(2.5); att.gainMeter(1.5);
      audio.play("block");
      this.fx.ring(contactX, contactY, "#9fd8ff", 26, 10);
      this.fx.burst(contactX, contactY, "#cfeaff", 6, 4, 12);
      this.hitstop = Math.max(this.hitstop, 2);
      if (att.attack) att.attack.contactMade = true;
      if (def.hp <= 0) this.gameOver(att.id as 0 | 1);
      return;
    }

    // ── armor absorb ──
    if (def.state === "attack" && def.armorLeft > 0 && m.kind !== "grab") {
      def.armorLeft--;
      def.superArmorFlash = 10;
      def.hp = Math.max(1, def.hp - Math.round(m.damage * 0.6));
      def.gainMeter(m.damage * 0.4);
      audio.play("hitBig", 0.8);
      this.fx.shards(contactX, contactY, "#ffd28f", 5);
      this.shake(4);
      this.hitstop = Math.max(this.hitstop, 4);
      if (att.attack) att.attack.contactMade = true;
      if (def.hp <= 1) this.gameOver(att.id as 0 | 1);
      return;
    }

    // ── counter hit ──
    const counter = def.state === "attack" && def.attack !== null && def.attack.frame < def.attack.move.startup && m.kind !== "grab";

    // ── real hit ──
    const comboN = att.combo;
    const scale = comboN === 0 ? 1 : Math.max(0.3, 1 - 0.075 * comboN);
    const dmg = Math.max(1, Math.round(m.damage * scale * (counter ? 1.3 : 1)));
    def.hp = Math.max(0, def.hp - dmg);

    const jug = def.juggleCount;
    const stunScale = Math.max(0.34, 1 - 0.16 * jug);
    // grounded chain stun also decays deep into a combo — stops braindead infinites
    const groundDecay = Math.max(0.35, 1 - 0.09 * Math.max(0, att.combo - 3));
    const stun = Math.round(m.hitstun * (counter ? 1.3 : 1) * (def.airborne ? stunScale : groundDecay));
    def.state = "hitstun";
    def.stateT = 0;
    def.attack = null;
    def.hitstunT = Math.max(def.hitstunT, Math.max(6, stun));
    const w = def.char.weight;
    def.vx = dir * m.kb.x * 0.85 * w;
    if (m.kb.y < 0) {
      def.vy = m.kb.y * w;
      def.launched = true;
      if (def.grounded) def.fy -= 2;
    }
    if (def.airborne) def.juggleCount = Math.min(8, def.juggleCount + 1);

    // Clear, consistent impact feedback makes ability hits readable instead of
    // looking like the sprite simply changed state.
    const hitColor = m.color ?? att.char.color;
    const impactSize = m.cost ? 54 : (counter ? 38 : 28);
    this.fx.ring(contactX, contactY, hitColor, impactSize, m.cost ? 18 : 10);
    this.fx.burst(contactX, contactY, hitColor, m.cost ? 18 : 9, m.cost ? 8 : 5, m.cost ? 24 : 15);
    this.shake(m.cost ? 8 : counter ? 4.5 : 2.5);
    this.hitstop = Math.max(this.hitstop, m.cost ? 7 : counter ? 4 : 3);
    if (counter) this.popup("COUNTER", contactX, contactY - 48, "#ffe45e", false);

    // wall slam
    if (m.wallSlam) {
      const wallDist = dir === 1 ? WORLD.WALL_R - def.x : def.x - WORLD.WALL_L;
      if (wallDist < 320) {
        def.x = dir === 1 ? WORLD.WALL_R - def.char.bodyW / 2 : WORLD.WALL_L + def.char.bodyW / 2;
        def.vx = -dir * 6;
        def.vy = Math.min(def.vy, -6 * w);
        def.hitstunT = Math.max(def.hitstunT, 34);
        this.shake(13);
        this.popup("WALL SLAM", def.x - dir * 40, contactY - 50, "#ffb86b", false);
        this.fx.shards(def.x, def.fy - 90, "#ffb86b", 10);
        this.fx.ring(def.x, def.fy - 90, "#ffb86b", 50, 14);
        audio.play("quake");
      }
    }

    att.combo++;
    att.comboTimer = Math.max(att.comboTimer, stun + 6);
    att.maxCombo = Math.max(att.maxCombo, att.combo);

    att.gainMeter(dmg * 0.9);
    def.gainMeter(dmg * 0.5);
    if (m.cost) att.gainMeter(dmg * 0.2);

    // divekick rebound — Jett's loops live here
    if (m.popUpOnHit && att.attack) {
      att.vy = -9.5;
      att.endAttack();
      att.state = "air";
      att.airAttackUsed = false;
    }

    if (att.attack) {
      att.attack.hitConnected = true;
      att.attack.contactMade = true;
    }

    // ── juice ──
    const big = dmg >= 12 || (m.cost ?? 0) > 0;
    this.hitstop = Math.max(this.hitstop, Math.min(12, 3 + dmg * 0.42 + (m.kind === "grab" ? 6 : 0)));
    this.shake(Math.min(12, 2 + dmg * 0.55) + ((m.cost ?? 0) > 0 ? 5 : 0));
    if (!m.cost) audio.play(counter ? "counter" : (m.hitSfx ?? "hit") === "hitBig" ? "hitBig" : (m.hitSfx ?? "hit") === "hitAir" ? "hitAir" : "hit", att.char.id === "bruno" ? 0.85 : 1);
    else audio.play("superHit");
    const sparkColor = m.color ?? att.char.color;
    this.fx.burst(contactX, contactY, sparkColor, big ? 16 : 9, big ? 9 : 6, big ? 26 : 18);
    this.fx.ring(contactX, contactY, sparkColor, big ? 54 : 30, big ? 14 : 9);
    if (big) this.fx.shards(contactX, contactY, "#ffffff", 6);
    if (counter) this.popup("COUNTER!", contactX, contactY - 70, "#ffd166", true);
    if (m.kind === "grab") {
      this.popup("COLOSSUS!", contactX, contactY - 90, "#fdba74", true);
      this.fx.shards(def.x, def.fy - 90, "#fdba74", 14);
    }

    if (def.hp <= 0) this.gameOver(att.id as 0 | 1);
  }

  private gameOver(winner: 0 | 1) {
    if (this.roundState !== "fight") return;
    this.roundState = "ko";
    this.stateT = 0;
    this.koData = { winner };
    const wF = this.f[winner];
    const l = this.f[1 - winner];
    l.state = "ko"; l.stateT = 0; l.attack = null; l.vx = 0;
    wF.state = "intro"; wF.stateT = 0; wF.attack = null;
    this.perfect = wF.hp >= wF.char.hp;
    this.slowmo = 44;
    this.banners.push({ main: "K.O.", sub: "", t: 0, dur: 118, kind: "ko", color: wF.char.color });
    audio.play("ko");
    this.shake(16);
    this.fx.ring(l.x, l.fy - 90, "#ffffff", 130, 30);
    this.fx.burst(l.x, l.fy - 90, wF.char.color, 30, 12, 40);
    this.fx.shards(l.x, l.fy - 90, "#ffffff", 16);
  }

  private timeoutEnd() {
    const [a, b] = this.f;
    let winner: 0 | 1 | -1 = -1;
    if (a.hp > b.hp) winner = 0; else if (b.hp > a.hp) winner = 1;
    this.roundState = "ko";
    this.stateT = 0;
    this.koData = { winner };
    let sub = "DOUBLE K.O.";
    if (winner === 0 || winner === 1) {
      this.f[winner].state = "intro";
      this.f[winner === 0 ? 1 : 0].state = "ko";
      sub = `${this.f[winner].char.name} OUTLASTS`;
    } else { a.state = "intro"; b.state = "intro"; }
    this.banners.push({ main: "TIME UP", sub, t: 0, dur: 110, kind: "ko", color: "#aab" });
    audio.play("ko", 0.85);
  }

  private wrapUp(winner: 0 | 1 | -1) {
    this.roundState = "endwrap";
    this.stateT = 0;
    if (winner === 0 || winner === 1) {
      this.wins[winner]++;
      const wF = this.f[winner];
      const loser = this.f[winner === 0 ? 1 : 0];
      wF.state = "win"; wF.stateT = 0;
      void loser;
      this.banners.push({
        main: `${wF.char.name} WINS`,
        sub: this.perfect ? "PERFECT ROUND" : `ROUND ${this.round} — ${this.wins[0]} : ${this.wins[1]}`,
        t: 0, dur: 130, kind: "win",
        color: wF.char.color,
      });
      if (this.perfect) audio.play("fight");
    } else {
      this.banners.push({ main: "DOUBLE K.O.", sub: "NO POINT AWARDED", t: 0, dur: 110, kind: "win", color: "#99a" });
    }
    this.onEvent?.({ type: "roundEnd", winner, round: this.round });
  }

  // ── main fixed tick ────────────────────────────────────────────────────────
  tick() {
    if (this.paused || this.matchOver) return;

    if (this.slowmo > 0) {
      this.slowmo--;
      this.slowTick++;
      if (this.slowTick % 4 !== 0) { this.trauma *= 0.92; return; }
    }

    if (this.hitstop > 0 || this.superFreeze > 0) {
      if (this.hitstop > 0) this.hitstop--;
      if (this.superFreeze > 0) this.superFreeze--;
      this.trauma *= 0.94;
      this.frame++;
      for (const b of this.banners) b.t++;
      return;
    }

    this.frame++;
    this.stateT++;
    this.trauma *= 0.88;
    for (const b of this.banners) b.t++;
    this.banners = this.banners.filter((b) => b.t < b.dur + 30);
    for (const p of this.popups) p.t++;
    this.popups = this.popups.filter((p) => p.t < p.dur);
    this.fx.update();

    const [a, b] = this.f;

    if (this.roundState === "intro") {
      a.update({ ...EMPTY_CMD }, b);
      b.update({ ...EMPTY_CMD }, a);
      // fighters slide into their marks
      const t01 = Math.min(1, this.stateT / 42);
      const ease = 1 - Math.pow(1 - t01, 3);
      a.x = 600 - 210 * (1 - ease);
      b.x = 1000 + 210 * (1 - ease);
      if (this.stateT === 42) { a.vx = 0; b.vx = 0; this.shake(1.5); }
      if (this.stateT === 92) {
        this.banners.push({ main: "FIGHT", sub: "", t: 0, dur: 32, kind: "fight", color: "#ffe45e" });
        audio.play("fight");
      }
      if (this.stateT >= 100) { this.roundState = "fight"; this.stateT = 0; }
      return;
    }

    if (this.roundState === "fight") {
      if (this.timer > 0) this.timer--;
      const c1 = this.controllers[0].poll(a, b, this);
      const c2 = this.controllers[1].poll(b, a, this);
      a.update(c1, b);
      b.update(c2, a);
      this.separate(a, b);
      this.resolveStrikes(a, b);
      this.resolveStrikes(b, a);
      this.stepProjectiles();
      this.stepOrbs();
      if (this.timer <= 0) this.timeoutEnd();
      return;
    }

    // ko / endwrap: bodies settle, banners play out
    a.update({ ...EMPTY_CMD }, b);
    b.update({ ...EMPTY_CMD }, a);
    if (this.roundState === "ko") {
      if (this.stateT === 26 && this.koData && this.koData.winner >= 0) {
        const l = this.f[1 - this.koData.winner];
        l.state = "downed"; l.stateT = 0;
      }
      if (this.stateT >= 104) this.wrapUp(this.koData?.winner ?? -1);
    } else if (this.roundState === "endwrap" && this.stateT >= 150) {
      if (this.wins[0] >= 2 || this.wins[1] >= 2) {
        if (!this.matchOver) {
          this.matchOver = true;
          this.onEvent?.({ type: "matchEnd", winner: this.wins[0] >= 2 ? 0 : 1 });
        }
      } else {
        this.round++;
        this.startRound();
      }
    }
  }

  private separate(a: Fighter, b: Fighter) {
    if (a.intangible > 0 || b.intangible > 0) return;
    if (a.state === "downed" || b.state === "downed") return;
    const minGap = (a.char.bodyW + b.char.bodyW) / 2 * 0.8;
    const dx = b.x - a.x;
    const overlap = minGap - Math.abs(dx);
    if (overlap > 0) {
      const dir = dx >= 0 ? 1 : -1;
      const push = overlap / 2;
      a.x -= dir * push;
      b.x += dir * push;
      const clamp = (g: Fighter) => {
        const mn = WORLD.WALL_L + g.char.bodyW / 2;
        const mx = WORLD.WALL_R - g.char.bodyW / 2;
        if (g.x < mn) return g.x - mn;
        if (g.x > mx) return g.x - mx;
        return 0;
      };
      const ca = clamp(a);
      if (ca !== 0) { b.x -= ca; a.x -= ca; }
      const cb = clamp(b);
      if (cb !== 0) { a.x -= cb; b.x -= cb; }
    }
  }

  private resolveStrikes(att: Fighter, def: Fighter) {
    if (!att.attack) return;
    const at = att.attack;
    const m = at.move;
    if (m.kind === "projectile" || m.kind === "special") return;
    if (att.attackPhase() !== "active") return;
    const box = att.hitboxRect();
    if (!box) return;
    const body = def.bodyRect();
    const overlap = box.x < body.x + body.w && box.x + box.w > body.x &&
      box.y < body.y + body.h && box.y + box.h > body.y;
    if (!overlap) return;
    const hits = m.hits ?? 1;
    const idx = Math.min(hits - 1, Math.floor(((at.frame - m.startup) / Math.max(1, m.active)) * hits));
    const key = def.id * 100 + idx;
    if (at.hitSet.has(key)) return;
    at.hitSet.add(key);
    this.applyHit(att, def, m);
  }

  private stepProjectiles() {
    const list = this.projectiles;
    for (const p of list) {
      if (p.dead) continue;
      p.life--;
      if (p.def.gravity) p.vy += p.def.gravity;
      p.x += p.vx;
      p.y += p.vy;
      if (p.def.low) p.y = WORLD.GROUND - 8;
      if (p.life <= 0 || p.x < WORLD.WALL_L - 80 || p.x > WORLD.WALL_R + 80 || p.y > WORLD.H + 120) { p.dead = true; continue; }

      // clash vs enemy projectiles
      for (const q of list) {
        if (q === p || q.dead || q.ownerId === p.ownerId) continue;
        const pw = p.def.w ?? p.def.radius * 2, ph = p.def.h ?? p.def.radius * 2;
        const qw = q.def.w ?? q.def.radius * 2, qh = q.def.h ?? q.def.radius * 2;
        if (Math.abs(p.x - q.x) < (pw + qw) / 2 && Math.abs(p.y - q.y) < (ph + qh) / 2) {
          if (p.def.level >= q.def.level) q.dead = true;
          if (q.def.level >= p.def.level) p.dead = true;
          this.fx.burst((p.x + q.x) / 2, (p.y + q.y) / 2, "#ffffff", 12, 6, 16);
          audio.play("zapBig", 0.7);
        }
      }
      if (p.dead) continue;

      // detonate enemy orbs on contact
      for (const o of this.orbs) {
        if (o.dead || o.ownerId === p.ownerId || o.exploding > 0) continue;
        if (Math.abs(o.x - p.x) < p.def.radius + 40 && Math.abs(o.y - p.y) < 90) {
          o.exploding = 10;
          if (p.def.level < 2) p.dead = true;
        }
      }
      if (p.dead) continue;

      // vs the enemy fighter
      const foe = this.f[p.ownerId === 0 ? 1 : 0];
      const body = foe.bodyRect();
      const pw = p.def.w ?? p.def.radius * 2, ph = p.def.h ?? p.def.radius * 2;
      const touching = p.x + pw / 2 > body.x && p.x - pw / 2 < body.x + body.w &&
        p.y + ph / 2 > body.y && p.y - ph / 2 < body.y + body.h;
      if (!touching) continue;

      const owner = this.f[p.ownerId];
      if (p.def.multiHit) {
        const period = p.def.hitCooldown ?? 10;
        if (this.frame - p.lastHitFrame >= period) {
          p.lastHitFrame = this.frame;
          this.applyHit(owner, foe, p.move, p.dir);
          this.fx.burst(p.x, p.y, p.def.color, 8, 5, 14);
          foe.x = Math.max(WORLD.WALL_L + 30, Math.min(WORLD.WALL_R - 30, foe.x + p.dir * 5));
        }
      } else if (!p.used) {
        p.used = true;
        p.dead = true;
        this.applyHit(owner, foe, p.move, p.dir);
        this.fx.burst(p.x, p.y, p.def.color, 10, 6, 16);
      }
    }
    this.projectiles = list.filter((p) => !p.dead);
  }

  private stepOrbs() {
    for (const o of this.orbs) {
      if (o.dead) continue;
      if (o.exploding > 0) {
        if (o.exploding === 10) {
          o.exploding = 9;
          const foe = this.f[o.ownerId === 0 ? 1 : 0];
          const body = foe.bodyRect();
          const cx = Math.max(body.x, Math.min(o.x, body.x + body.w));
          const cy = Math.max(body.y, Math.min(o.y, body.y + body.h));
          const r = 150;
          if ((cx - o.x) ** 2 + (cy - o.y) ** 2 < r * r) {
            const owner = this.f[o.ownerId];
            this.applyHit(owner, foe, o.move, (foe.x > o.x ? 1 : -1) as 1 | -1);
          }
          this.fx.burst(o.x, o.y, "#c084fc", 22, 8, 24);
          this.fx.ring(o.x, o.y, "#d8b4fe", 100, 20);
          audio.play("zapBig");
          this.shake(8);
          o.dead = true;
        }
        continue;
      }
      o.life--;
      if (!o.armed && o.life <= 450) o.armed = true;
      if (o.life <= 0) { o.dead = true; continue; }
      const foe = this.f[o.ownerId === 0 ? 1 : 0];
      if (o.armed && Math.abs(foe.x - o.x) < 130 && Math.abs((foe.fy - 80) - o.y) < 150 && foe.intangible <= 0 && foe.state !== "downed") {
        o.exploding = 10;
      }
    }
    this.orbs = this.orbs.filter((o) => !o.dead);
  }

  restartMatch(diff?: Difficulty) {
    if (diff) this.diff = diff;
    this.wins = [0, 0];
    this.round = 1;
    this.matchOver = false;
    this.matchOverFlagClean();
    this.startRound(true);
  }

  private matchOverFlagClean() {
    this.koData = null;
    this.slowmo = 0; this.hitstop = 0; this.superFreeze = 0;
  }
}
