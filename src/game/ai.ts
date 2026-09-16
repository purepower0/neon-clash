// ── The brain: perception-delayed, skill-scaled fighting game AI ─────────────
//
// Skill isn't faked with extra stats — every difficulty gets the same moves.
// What changes is *quality of play*: reaction latency, block rate, high/low
// reads, punish selection, combo routing, spacing and adaptation.

import type { BrainParams, Cmd, Difficulty } from "./types";
import { EMPTY_CMD, WORLD } from "./types";
import type { Fighter } from "./fighter";
import type { Engine } from "./engine";

export const BRAINS: Record<Difficulty, BrainParams> = {
  easy:    { reaction: 42, block: 0.18, blockRead: 0.30, punish: 0.15, aggression: 0.42, combo: 0, spacing: 0.25, antiAir: 0.08, mixup: 0.05, mobility: 0.15, super: 0.0, drop: 0.70, jumpIn: 0.06, bait: 0.0 },
  medium:  { reaction: 26, block: 0.50, blockRead: 0.55, punish: 0.50, aggression: 0.55, combo: 1, spacing: 0.60, antiAir: 0.40, mixup: 0.25, mobility: 0.45, super: 0.40, drop: 0.35, jumpIn: 0.18, bait: 0.0 },
  hard:    { reaction: 15, block: 0.72, blockRead: 0.80, punish: 0.80, aggression: 0.66, combo: 2, spacing: 0.80, antiAir: 0.66, mixup: 0.50, mobility: 0.70, super: 0.75, drop: 0.12, jumpIn: 0.30, bait: 0.25 },
  extreme: { reaction: 9,  block: 0.90, blockRead: 0.95, punish: 0.96, aggression: 0.72, combo: 3, spacing: 0.95, antiAir: 0.90, mixup: 0.75, mobility: 0.88, super: 0.90, drop: 0.04, jumpIn: 0.38, bait: 0.50 },
};

interface Perc {
  state: string;
  moveId: string | null;
  moveFrame: number;
  blocking: boolean;
  down: boolean;
}

interface Act { slot?: number; jump?: boolean; dash?: boolean; delay: number; retry: number; }

// Static aerial routes: what to press after a launcher connects.
const AIR_ROUTES: Record<string, number[]> = {
  kai: [1, 3],
  volt: [1, 2],
  jett: [1, 3, 4],
  sage: [1],
  bruno: [1],
};
const GROUND_ROUTES: Record<string, number[][]> = {
  kai: [[1, 1, 3], [1, 1, 4], [1, 2]],
  volt: [[1, 1, 1, 2], [1, 4, 3], [1, 1, 3]],
  jett: [[1, 2], [1, 3]],
  sage: [[4, 1], [1, 2]],
  bruno: [[1, 5], [1, 4], [4, 3]],
};

export class AIController {
  brain: BrainParams;
  diff: Difficulty;
  perc: Perc = { state: "idle", moveId: null, moveFrame: 0, blocking: false, down: false };
  percAge = 0;
  queue: Act[] = [];
  blockHold = 0;
  blockLowHold = false;
  plan: "none" | "bait" | "jumpin" | "retreat" = "none";
  planT = 0;
  decisionT = 0;
  fireCd = 0;
  lastAttackCounted = 0;
  seededRouteUsed = false;
  rng: () => number;

  constructor(diff: Difficulty, seed = 1234567 + Math.floor(Math.random() * 1e6)) {
    this.diff = diff;
    this.brain = BRAINS[diff];
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    this.rng = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  private findPunishMove(self: Fighter, dist: number, recoveryLeft: number, useSuper: boolean): number | null {
    let best: number | null = null;
    let bestScore = -1e9;
    for (const m of self.char.moves) {
      if (m.airOnly || m.kind === "special") continue;
      if ((m.cost ?? 0) > 0 && !useSuper) continue;
      if ((m.cost ?? 0) > self.meter) continue;
      if (m.startup > recoveryLeft * 0.85) continue;
      const reach = m.range + self.char.bodyW * 0.3 + 26;
      if (dist > reach) continue;
      const score = m.damage * (m.hits ?? 1) * ((m.cost ?? 0) > 0 ? 1.4 : 1) - m.recovery * 0.05;
      if (score > bestScore) { bestScore = score; best = m.slot; }
    }
    return best;
  }

  poll(self: Fighter, foe: Fighter, engine: Engine): Cmd {
    const cmd: Cmd = { ...EMPTY_CMD };
    const b = this.brain;
    const dist = Math.abs(foe.x - self.x);
    const dirToFoe: 1 | -1 = foe.x > self.x ? 1 : -1;
    const away: "left" | "right" = dirToFoe === 1 ? "left" : "right";
    const toward: "left" | "right" = dirToFoe === 1 ? "right" : "left";

    // ── perception (lagged mental model) ───────────────────────────────────
    this.percAge++;
    if (this.percAge >= b.reaction || this.perc.moveId === null) {
      this.percAge = 0;
      this.perc = {
        state: foe.state,
        moveId: foe.attack?.move.id ?? null,
        moveFrame: foe.attack?.frame ?? 0,
        blocking: foe.blocking,
        down: foe.stanceCrouch > 0.5,
      };
    }
    if (this.fireCd > 0) this.fireCd--;
    if (this.decisionT > 0) this.decisionT--;

    // ── queued acts (combo routes) run first ───────────────────────────────
    if (this.queue.length > 0) {
      const head = this.queue[0];
      if (head.delay > 0) head.delay--;
      else {
        const okState = head.jump
          ? (self.grounded || self.state === "attack")
          : self.canAct() || self.state === "attack";
        if (okState) {
          if (head.jump) cmd.upPressed = true;
          else if (head.dash) cmd.dashPressed = true;
          else if (head.slot !== undefined) cmd.action = head.slot - 1;
          this.queue.shift();
        } else {
          head.retry--;
          if (head.retry < 0) this.queue.shift();
          else head.delay = 3;
        }
      }
      // keep drifting toward foe during routes
      if (self.airborne) cmd[toward] = true;
      return cmd;
    }

    // ── combo routing: watch my own attack connections ─────────────────────
    if (self.attack) {
      const at = self.attack;
      if (at.hitConnected && at.frame > at.move.startup && b.combo > 0 && this.rng() > b.drop && this.decisionT <= 0) {
        this.decisionT = 30;
        const slot = at.move.slot;
        const isLauncher = !!at.move.jumpCancel;
        if (isLauncher && b.combo >= 2 && !at.airVariant) {
          // launcher route: jump cancel → air string
          const chain: Act[] = [{ jump: true, delay: 2, retry: 10 }];
          const route = AIR_ROUTES[self.char.id] ?? [1];
          const useRoute = b.combo >= 3 && self.char.id === "jett" ? [...route, 4] : route;
          let d = 8;
          for (const s of useRoute) { chain.push({ slot: s, delay: d, retry: 14 }); d = 15; }
          this.queue = chain;
        } else if (b.combo >= 1) {
          const nexts = self.char.comboChart[slot];
          if (nexts && nexts.length > 0) {
            let pick = nexts[Math.floor(this.rng() * nexts.length)];
            // super cancel when meter is ready
            if ((this.rng() < b.super) && self.meter >= 100 && b.combo >= 2) pick = 6;
            this.queue = [{ slot: pick, delay: 3, retry: 16 }];
          }
        }
      }
    }

    // ── defensive threats (from lagged perception) ──────────────────────────
    const foeAtk = this.perc.moveId ? foe.char.moves.find((m) => m.id === this.perc.moveId) : undefined;
    if (this.blockHold > 0) {
      this.blockHold--;
      cmd[away] = true;
      cmd.down = true;
      // blocked → punish the recovery
      if (this.blockHold > 4 && foe.state === "attack" && foe.attackPhase() === "recovery" && foe.attack && this.rng() < b.punish && self.canAct()) {
        const slot = this.findPunishMove(self, dist, foe.attack.move.recovery, this.rng() < b.super);
        if (slot !== null) { cmd.action = slot - 1; this.blockHold = 0; return cmd; }
      }
      return cmd;
    }
    if (foeAtk && this.perc.state === "attack") {
      const framesUntilHit = foeAtk.startup - this.perc.moveFrame;
      const reachNeeded = dist - foeAtk.range - 40;
      const projectileThreat = foeAtk.projectile !== undefined && dist < 340 && framesUntilHit < 40;
      if ((framesUntilHit <= Math.max(2, b.reaction - 2) + foeAtk.active && reachNeeded < 60 && !foeAtk.projectile) || projectileThreat) {
        // grabs beat blocking — sharp AI jumps out instead
        if (foeAtk.kind === "grab") {
          if (self.grounded && this.rng() < b.mobility * (0.4 + b.block * 0.6)) {
            cmd.upPressed = true;
            cmd[away] = true;
            return cmd;
          }
        } else if (this.rng() < b.block) {
          const correctRead = this.rng() < b.blockRead;
          const isLow = correctRead && foeAtk.guard === "low";
          const fakeLow = !correctRead && this.rng() < 0.4 && foeAtk.guard !== "overhead";
          this.blockHold = 10 + Math.floor(this.rng() * 14);
          this.blockLowHold = isLow || fakeLow;
          cmd[away] = true;
          cmd.down = true;
          return cmd;
        }
      }
    }

    // ── incoming projectiles: jump over or block ────────────────────────────
    for (const p of engine.projectiles) {
      if (p.ownerId === self.id) continue;
      const dx = p.x - self.x;
      const heading = Math.sign(p.vx) === Math.sign(-dx) ? false : true;
      const closing = Math.sign(p.vx) === Math.sign(self.x - p.x);
      if (!heading && !closing) continue;
      const d = Math.abs(dx);
      if (d < 320) {
        const tti = d / Math.max(1, Math.abs(p.vx));
        if (tti > 14 && this.rng() < b.mobility) { cmd.upPressed = true; cmd[toward] = true; return cmd; }
        if (tti <= 14 && this.rng() < b.block) {
          this.blockHold = 14;
          this.blockLowHold = !!p.def.low && this.rng() < b.blockRead;
          cmd[away] = true;
          cmd.down = true;
          return cmd;
        }
      }
    }

    // ── anti-air ────────────────────────────────────────────────────────────
    if (!foe.grounded && foe.fy < WORLD.GROUND - 80 && dist < 270 && self.canAct() && this.rng() < b.antiAir && this.decisionT <= 0) {
      this.decisionT = 34;
      const aa = self.char.moves[self.char.antiAir - 1];
      if (aa && !(aa.projectile && self.attack)) {
        cmd.action = self.char.antiAir - 1;
        return cmd;
      }
    }

    // ── nothing to do while helpless ────────────────────────────────────────
    if (!self.canAct() || engine.roundState !== "fight") return cmd;

    // ── plan execution ─────────────────────────────────────────────────────
    if (this.plan !== "none") {
      this.planT--;
      if (this.plan === "bait") {
        if (this.planT > 18) cmd[toward] = dist > 140 ? true : false;
        else if (this.planT > 12) {
          if (self.canAct() && !this.seededRouteUsed) { cmd.action = 0; this.seededRouteUsed = true; } // deliberate whiff
        } else { cmd[away] = true; cmd.down = this.rng() < 0.5; }
        if (this.planT <= 0) { this.plan = "none"; this.seededRouteUsed = false; }
        return cmd;
      }
      if (this.plan === "jumpin") {
        if (!self.airborne && self.grounded && this.planT > 10) {
          cmd[toward] = true;
          if (this.planT % 4 === 0) cmd.upPressed = true;
        } else if (self.airborne) {
          cmd[toward] = true;
          if (self.vy > 1 && dist < 175 && !self.airAttackUsed && self.canAct()) {
            const airMove = self.char.moves.find((m) => (m.airOk || m.airOnly) && m.kind === "strike" && m.slot <= 4);
            if (airMove) cmd.action = airMove.slot - 1;
            this.plan = "none";
          }
        } else this.plan = "none";
        this.planT--;
        if (this.planT <= 0) this.plan = "none";
        return cmd;
      }
    }

    // ── neutral game ───────────────────────────────────────────────────────
    const c = self.char;
    const pref = c.preferredRange * (0.7 + b.spacing * 0.45);
    const isZoner = c.id === "sage";
    const foeBlocking = this.perc.blocking || this.perc.state === "blockstun";

    // super usage in neutral terms
    const superMove = c.moves[5];
    if (self.meter >= 100 && this.rng() < b.super * 0.08 && this.decisionT <= 0) {
      const inRange = superMove.range + 90 >= dist || superMove.kind === "grab" && dist < 100 || superMove.id === "sage_super";
      if (inRange) { this.decisionT = 60; cmd.action = 5; return cmd; }
    }

    // mixups vs turtles
    if (foeBlocking && dist < 130 && this.rng() < b.mixup * 0.2 && this.decisionT <= 0) {
      this.decisionT = 40;
      const overhead = c.moves.find((m) => m.guard === "overhead");
      const low = c.moves.find((m) => m.guard === "low" && m.kind === "strike");
      const pick = this.rng() < 0.5 ? overhead : low;
      if (pick) { cmd.action = pick.slot - 1; return cmd; }
    }

    // zoning
    if (isZoner) {
      if (dist < 130 && self.canAct() && this.rng() < 0.5) { cmd.action = 3; return cmd; } // gale push
      if (dist < 260) { cmd[away] = true; if (this.rng() < b.mobility * 0.03) cmd.dashPressed = true; }
      if (this.fireCd <= 0 && dist > 200) {
        const r = this.rng();
        if (r < 0.45) { cmd.action = 0; this.fireCd = 46 + this.rng() * 30; return cmd; }
        if (r < 0.62 && dist > 340) { cmd.action = 1; this.fireCd = 75; return cmd; }
        if (r < 0.72 && dist > 210 && dist < 480) { cmd.action = 2; this.fireCd = 90; return cmd; } // orb
      }
      if (dist > pref) cmd[toward] = true;
      return cmd;
    }

    // approach / retreat to preferred range
    const spacingErr = this.rng() < b.spacing ? 0 : (this.rng() - 0.5) * 260;
    const effPref = pref + spacingErr;
    if (dist > effPref + 30) {
      cmd[toward] = true;
      if (this.rng() < b.mobility * 0.06 && dist > 240) cmd.dashPressed = true;
      // volt blink
      if (c.id === "volt" && dist > 250 && this.rng() < b.mixup * 0.25 && (self.cooldowns.get("volt_blink") ?? 0) <= 0) {
        cmd.action = 4; return cmd;
      }
      // fireball support while walking in
      if (c.keepaway.length > 0 && dist > 420 && this.fireCd <= 0 && this.rng() < 0.4) {
        cmd.action = c.keepaway[0] - 1; this.fireCd = 70; return cmd;
      }
      // jump-in approaches
      if (dist < 430 && dist > 200 && this.rng() < b.jumpIn * 0.05 && this.plan === "none") {
        this.plan = "jumpin"; this.planT = 60; return cmd;
      }
      // bait plan
      if (this.rng() < b.bait * 0.02 && this.plan === "none" && dist < 300) {
        this.plan = "bait"; this.planT = 46; this.seededRouteUsed = false; return cmd;
      }
    } else if (dist < effPref - 60) {
      cmd[away] = true;
    } else {
      // in the pocket: pressure or poke
      if (this.decisionT <= 0 && this.rng() < b.aggression * 0.22) {
        this.decisionT = 16 + this.rng() * 26;
        if (b.combo >= 1 && this.rng() < 0.65) {
          const routes = GROUND_ROUTES[c.id] ?? [[1]];
          const route = routes[Math.floor(this.rng() * routes.length)];
          const acts: Act[] = [];
          let d = 0;
          for (const s of route) { acts.push({ slot: s, delay: d, retry: 14 }); d = 6; }
          this.queue = acts;
          return cmd;
        }
        const poke = c.pokes[Math.floor(this.rng() * c.pokes.length)];
        cmd.action = poke - 1;
        return cmd;
      }
      // movement fidget — dance at the edge
      if (this.rng() < b.mobility * 0.3) {
        if (this.rng() < 0.5) cmd[toward] = true; else cmd[away] = true;
      }
    }
    return cmd;
  }
}
