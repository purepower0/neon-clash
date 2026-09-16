// ── Fighter: physics + state machine + attack execution ─────────────────────
import type { CharacterDef, Cmd, MoveDef } from "./types";
import { WORLD } from "./types";
import type { Engine } from "./engine";

export type FighterState =
  | "idle" | "walk" | "dash" | "air" | "crouch"
  | "attack" | "hitstun" | "blockstun" | "downed" | "getup"
  | "intro" | "outro" | "win" | "ko";

export interface Ghost {
  x: number; fy: number; facing: number;
  state: FighterState; anim: string; animT: number; phase: string;
  life: number; maxLife: number;
}

export interface AttackRT {
  move: MoveDef;
  frame: number;
  airVariant: boolean;
  hitConnected: boolean;      // at least one hit landed (for cancels / AI)
  contactMade: boolean;       // hit OR blocked
  hitSet: Set<number>;        // defender id × hitIndex already applied
  spawned: boolean;           // projectile fired
  chainUsed: boolean;
}

export class Fighter {
  engine: Engine;
  char: CharacterDef;
  id: number;
  x: number; fy: number;      // feet position (fy = WORLD.GROUND when grounded)
  vx = 0; vy = 0;
  // Previous simulation position for render interpolation.
  prevX: number; prevFy: number;
  facing: 1 | -1 = 1;
  hp: number; meter = 0;
  state: FighterState = "intro";
  stateT = 0;
  attack: AttackRT | null = null;
  cooldowns = new Map<string, number>();
  blocking = false;           // currently in a valid block stance this frame
  blockLow = false;
  holdingDir = 0;             // -1 | 0 | 1 horizontal intent
  jumpsUsed = 0;
  airDashesUsed = 0;
  airAttackUsed = false;
  dashT = 0; dashDir: 1 | -1 = 1; dashCd = 0;
  invuln = 0;
  intangible = 0;
  armorLeft = 0;
  hitstunT = 0; blockstunT = 0;
  launched = false;           // in a juggle state
  juggleCount = 0;
  landLag = 0;
  combo = 0; comboTimer = 0; maxCombo = 0;
  ghosts: Ghost[] = [];
  lastHitBy = 0;              // frame stamp (for juggle stun decay)
  stanceCrouch = 0;           // smoothed crouch amount for renderer
  superArmorFlash = 0;
  bufSlot: number | null = null;  // input buffer
  bufT = 0;
  bufJump = 0;

  constructor(engine: Engine, char: CharacterDef, id: number, x: number, facing: 1 | -1) {
    this.engine = engine;
    this.char = char;
    this.id = id;
    this.x = x;
    this.fy = WORLD.GROUND;
    this.facing = facing;
    this.prevX = x;
    this.prevFy = WORLD.GROUND;
    this.hp = char.hp;
  }

  get grounded() { return this.fy >= WORLD.GROUND - 0.5; }
  get airborne() { return !this.grounded; }
  get bodyW() { return this.char.bodyW; }
  get bodyH() { return this.stanceCrouch > 0.5 ? this.char.bodyH * 0.68 : this.char.bodyH; }

  bodyRect() {
    const w = this.bodyW, h = this.bodyH;
    return { x: this.x - w / 2, y: this.fy - h, w, h };
  }

  attackPhase(): "startup" | "active" | "recovery" | null {
    if (!this.attack) return null;
    const { move, frame } = this.attack;
    if (frame < move.startup) return "startup";
    if (frame < move.startup + move.active) return "active";
    return "recovery";
  }

  hitboxRect(): { x: number; y: number; w: number; h: number } | null {
    if (!this.attack || this.attackPhase() !== "active") return null;
    const m = this.attack.move;
    if (m.kind === "projectile" || m.kind === "special") return null;
    const reach = m.range;
    const x0 = this.x + this.facing * (this.bodyW * 0.24);
    const x = this.facing === 1 ? x0 : x0 - reach;
    const h = m.h, y = this.fy - m.yOff - h / 2;
    return { x, y, w: reach, h };
  }

  currentAnim(): { key: string; t: number } {
    const a = this.attack;
    if (this.state === "attack" && a) {
      const phase = this.attackPhase() ?? "startup";
      return { key: `${a.move.anim}:${phase}${a.airVariant ? ":air" : ""}`, t: a.frame };
    }
    return { key: this.state, t: this.stateT };
  }

  pushGhost() {
    const { key, t } = this.currentAnim();
    this.ghosts.push({
      x: this.x, fy: this.fy, facing: this.facing,
      state: this.state, anim: key, animT: t,
      phase: this.attackPhase() ?? "",
      life: 13, maxLife: 13,
    });
    if (this.ghosts.length > 14) this.ghosts.shift();
  }

  canAct() {
    return this.state === "idle" || this.state === "walk" || this.state === "crouch" ||
      (this.state === "air" && this.landLag <= 0) || (this.state === "dash" && this.dashT > 4);
  }

  tryStartMove(slot: number, airborne: boolean): boolean {
    const move = this.char.moves[slot];
    if (!move) return false;
    if (move.airOnly && !airborne) return false;
    if (!move.airOk && airborne && !move.airOnly) return false;
    if (airborne && this.airAttackUsed) return false;
    if ((move.cost ?? 0) > this.meter) return false;
    const cd = this.cooldowns.get(move.id) ?? 0;
    if (cd > 0) return false;
    // start
    if (move.cost) this.meter -= move.cost;
    if (move.cooldown) this.cooldowns.set(move.id, move.cooldown);
    this.attack = {
      move, frame: 0, airVariant: airborne,
      hitConnected: false, contactMade: false,
      hitSet: new Set(), spawned: false, chainUsed: false,
    };
    this.state = "attack";
    this.stateT = 0;
    this.bufSlot = null;
    this.bufT = 0;
    if (airborne) this.airAttackUsed = true;
    this.vx *= 0.4;
    if (move.selfVy && move.anim === "upper" && !airborne) this.vy = Math.min(this.vy, 0);
    this.armorLeft = move.armor ?? 0;
    if (move.invuln) this.invuln = Math.max(this.invuln, move.invuln);
    this.engine.onMoveStarted(this, move);
    return true;
  }

  endAttack() {
    this.attack = null;
    this.armorLeft = 0;
    this.state = this.grounded ? "idle" : "air";
    this.stateT = 0;
  }

  // ── main tick ────────────────────────────────────────────────────────────
  update(cmd: Cmd, foe: Fighter) {
    const c = this.char;
    // Snapshot before this simulation step so the renderer can interpolate between ticks.
    this.prevX = this.x;
    this.prevFy = this.fy;
    this.stateT++;
    if (this.invuln > 0) this.invuln--;
    if (this.intangible > 0) this.intangible--;
    if (this.dashCd > 0) this.dashCd--;
    if (this.landLag > 0) this.landLag--;
    if (this.superArmorFlash > 0) this.superArmorFlash--;
    // input buffer — presses a few frames early still come out clean
    if (cmd.action !== null) { this.bufSlot = cmd.action; this.bufT = 7; }
    else if (this.bufT > 0) this.bufT--;
    if (cmd.upPressed) this.bufJump = 8;
    else if (this.bufJump > 0) this.bufJump--;
    const buffered = this.bufT > 0 ? this.bufSlot : null;
    const wantJump = cmd.upPressed || this.bufJump > 0;
    for (const [k, v] of this.cooldowns) if (v > 0) this.cooldowns.set(k, v - 1);
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      this.ghosts[i].life--;
      if (this.ghosts[i].life <= 0) this.ghosts.splice(i, 1);
    }

    // combo timer decay
    if (this.comboTimer > 0) {
      this.comboTimer--;
      if (this.comboTimer === 0) this.combo = 0;
    }

    // facing: face the opponent while grounded & free
    if (this.grounded && (this.state === "idle" || this.state === "walk" || this.state === "crouch")) {
      const d = foe.x - this.x;
      if (Math.abs(d) > 2) this.facing = d > 0 ? 1 : -1;
    }

    // block stance intent
    this.holdingDir = cmd.right ? 1 : cmd.left ? -1 : 0;
    // Horizontal input is movement only. Blocking no longer steals the opposite
    // movement direction, which fixes the old "cannot move left" behavior.
    // Hold DOWN + AWAY to block. DOWN by itself remains crouch.
    const awayFromFoe = this.holdingDir !== 0 && this.holdingDir !== this.facing;
    this.blocking = this.grounded &&
      (this.state === "idle" || this.state === "walk" || this.state === "crouch") &&
      cmd.down && awayFromFoe;
    this.blockLow = this.blocking;

    // smoothed crouch for rendering
    const wantCrouch = (cmd.down && this.grounded && this.canAct()) || this.state === "crouch" ? 1 : 0;
    this.stanceCrouch += (wantCrouch - this.stanceCrouch) * 0.35;

    switch (this.state) {
      case "intro":
        this.vx *= 0.86; break;
      case "outro": case "win": case "ko":
        this.vx *= 0.8; break;

      case "idle": case "walk": case "crouch": case "dash": {
        // movement
        if (this.state === "dash") {
          this.dashT++;
          if (this.dashT <= c.dashDur) {
            this.vx = this.dashDir * c.dashSpeed * (1 - this.dashT / (c.dashDur * 1.9));
            if (this.dashT % 3 === 0) this.pushGhost();
          } else {
            this.state = "idle"; this.stateT = 0; this.vx *= 0.7;
          }
        } else if (cmd.down && this.grounded && !this.blocking) {
          this.state = "crouch";
          this.vx *= 0.72;
        } else if (this.holdingDir !== 0 && !(cmd.down && this.grounded)) {
          this.state = "walk";
          const spd = this.holdingDir === this.facing ? c.walkF : c.walkB;
          const targetVx = this.holdingDir * spd;
          // Exponential-ish acceleration gives responsive starts without the
          // visible per-frame snapping of the old fixed 1.4 impulse.
          const accel = this.grounded ? 0.30 : 0.18;
          this.vx += (targetVx - this.vx) * accel;
          if (Math.abs(this.vx) > spd) this.vx = Math.sign(this.vx) * spd;
        } else {
          this.state = "idle";
          this.vx *= 0.78;
        }

        // dash
        if (cmd.dashPressed && this.dashCd <= 0 && this.state !== "dash" && this.grounded) {
          this.state = "dash";
          this.dashT = 0;
          this.dashDir = this.holdingDir !== 0 ? (this.holdingDir as 1 | -1) : this.facing;
          this.dashCd = 22;
          this.vx = this.dashDir * c.dashSpeed;
          this.engine.fx.dust(this.x, this.fy, 4);
          this.engine.audio.play("dash");
          this.x += this.vx;
          return;
        }

        // jump
        if (wantJump && this.grounded) {
          this.bufJump = 0;
          this.vy = -c.jumpVel;
          this.jumpsUsed = 1;
          this.airDashesUsed = 0;
          this.airAttackUsed = false;
          this.state = "air"; this.stateT = 0;
          this.blocking = false;
          this.engine.fx.dust(this.x, this.fy, 3);
          this.engine.audio.play("jump");
          this.x += this.vx;
          this.fy += this.vy;
          return;
        }

        // attack
        if (buffered !== null && this.canAct()) {
          this.tryStartMove(buffered, false);
        }
        break;
      }

      case "air": {
        // air control
        const airSpd = c.walkF * 0.92;
        if (this.holdingDir !== 0) {
          this.vx += Math.sign(this.holdingDir * airSpd - this.vx) * 0.7;
          if (Math.abs(this.vx) > airSpd) this.vx = Math.sign(this.vx) * airSpd;
        }
        // multi jump
        if (wantJump && this.jumpsUsed < c.jumps) {
          this.bufJump = 0;
          this.vy = -c.jumpVel * 0.88;
          this.jumpsUsed++;
          this.airAttackUsed = false;
          this.engine.fx.ring(this.x, this.fy, this.char.color, 30, 12);
          this.engine.audio.play("jump", 1.15);
        }
        // air dash
        if (cmd.dashPressed && c.airDash && this.airDashesUsed < 1 && this.dashCd <= 0) {
          const dir = this.holdingDir !== 0 ? this.holdingDir : this.facing;
          this.vx = dir * c.dashSpeed * 0.95;
          this.vy = Math.min(this.vy, 0);
          this.airDashesUsed++;
          this.dashCd = 16;
          this.pushGhost();
          this.engine.audio.play("dash", 1.2);
        }
        if (buffered !== null && !this.airAttackUsed) {
          this.tryStartMove(buffered, true);
        }
        break;
      }

      case "attack": {
        const at = this.attack!;
        const m = at.move;
        at.frame++;

        // halt ground drift
        if (this.grounded && !m.diveKick) {
          if (m.selfVx && at.frame >= m.startup && at.frame < m.startup + m.active) {
            this.vx = this.facing * m.selfVx;
            if (at.frame % 4 === 0) this.pushGhost();
          } else this.vx *= 0.8;
        } else if (this.grounded) {
          this.vx *= 0.7;
        }

        // blink teleport — ghosts strung along the path
        if (m.teleport && at.frame === m.startup) {
          const nx = Math.max(WORLD.WALL_L + 30, Math.min(WORLD.WALL_R - 30, this.x + this.facing * m.teleport));
          const { key, t } = this.currentAnim();
          for (let i = 1; i <= 7; i++) {
            this.ghosts.push({
              x: this.x + (nx - this.x) * (i / 8), fy: this.fy, facing: this.facing,
              state: this.state, anim: key, animT: t, phase: "active",
              life: 6 + i * 1.6, maxLife: 18,
            });
          }
          this.x = nx;
          this.intangible = Math.max(this.intangible, 8);
          this.engine.fx.ring(this.x, this.fy - 80, this.char.color, 44, 12);
        }

        // projectile fire
        if (m.projectile && !at.spawned && at.frame >= m.startup) {
          at.spawned = true;
          this.engine.spawnProjectile(this, m, at.airVariant);
        }
        if (m.orb && !at.spawned && at.frame >= m.startup) {
          at.spawned = true;
          this.engine.spawnOrb(this, m);
        }

        // dive kick terminates at startup+active unless landed
        const totalFrames = m.startup + m.active + m.recovery;

        // jump cancel (launchers)
        if (m.jumpCancel && at.hitConnected && wantJump && this.grounded) {
          this.bufJump = 0;
          this.endAttack();
          this.vy = -c.jumpVel;
          this.jumpsUsed = 1;
          this.airAttackUsed = false;
          this.state = "air"; this.stateT = 0;
          this.engine.audio.play("jump");
          break;
        }

        // chain cancels (on contact) — chains list, or any super (super-cancel)
        if (!at.chainUsed && at.contactMade && buffered !== null && at.frame > m.startup) {
          const tgt = this.char.moves[buffered];
          const chainOk = tgt && (m.chains?.includes(tgt.slot) || (tgt.cost ?? 0) > 0);
          if (chainOk) {
            at.chainUsed = true;
            this.endAttack();
            this.airAttackUsed = false;   // legal cancels re-arm air attacks (air strings)
            this.tryStartMove(buffered, !this.grounded);
            break;
          }
        }

        if (at.frame >= totalFrames) this.endAttack();
        break;
      }

      case "hitstun": {
        this.hitstunT--;
        if (this.grounded) {
          this.vx *= 0.88;
          if (this.hitstunT <= 0) {
            this.state = "idle"; this.stateT = 0; this.launched = false; this.juggleCount = 0;
          }
        } else {
          this.vx *= 0.995;
          if (this.hitstunT <= 0 && this.fy < WORLD.GROUND - 40) {
            this.state = "air"; this.stateT = 0; this.launched = false;
            this.juggleCount = 0; this.airAttackUsed = false;
          }
        }
        break;
      }

      case "blockstun": {
        this.blockstunT--;
        this.vx *= 0.86;
        if (this.blockstunT <= 0) { this.state = "idle"; this.stateT = 0; }
        break;
      }

      case "downed": {
        this.vx *= 0.85;
        if (this.stateT > 34) { this.state = "getup"; this.stateT = 0; }
        break;
      }

      case "getup": {
        this.invuln = Math.max(this.invuln, this.stateT < 8 ? 1 : 0);
        if (this.stateT > 15) { this.state = "idle"; this.stateT = 0; this.juggleCount = 0; }
        break;
      }
    }

    // ── physics integration ────────────────────────────────────────────────
    const inDive = this.state === "attack" && this.attack?.move.diveKick;
    if (inDive && this.airborne) {
      this.vx = this.facing * 6.4;
      this.vy = Math.min(this.vy + 0.55, 12.5);
    } else if (!this.grounded) {
      this.vy += this.char.gravity;
      if (this.vy > this.char.maxFall) this.vy = this.char.maxFall;
    }
    this.x += this.vx;
    this.fy += this.vy;

    // fast-fall drag while falling over limit handled above; landing:
    if (this.fy >= WORLD.GROUND) {
      const wasAir = !this.grounded;
      this.fy = WORLD.GROUND;
      if (wasAir && this.vy > 4) {
        this.engine.fx.dust(this.x, this.fy, Math.min(7, Math.floor(this.vy / 3)));
        if (this.vy > 8) this.engine.audio.play("land");
      }
      this.vy = 0;
      this.jumpsUsed = 0;
      this.airDashesUsed = 0;

      if (inDive) {
        // whiffed dive → land straight into recovery
        if (this.attack) this.attack.frame = Math.max(this.attack.frame, this.attack.move.startup + this.attack.move.active);
        this.vx *= 0.4;
      } else if (this.state === "air") {
        this.state = "idle"; this.stateT = 0;
        this.landLag = 4;
        this.airAttackUsed = false;
      } else if (this.state === "hitstun") {
        if (this.launched || this.hitstunT > 8) {
          this.state = "downed"; this.stateT = 0;
          this.launched = false;
          this.engine.fx.dust(this.x, this.fy, 8);
          this.engine.shake(Math.min(10, this.vy));
        } else {
          this.launched = false;
        }
      }
    }

    // stage walls
    const minX = WORLD.WALL_L + this.bodyW / 2;
    const maxX = WORLD.WALL_R - this.bodyW / 2;
    if (this.x < minX) { this.x = minX; if (this.vx < 0) this.vx = 0; }
    if (this.x > maxX) { this.x = maxX; if (this.vx > 0) this.vx = 0; }
  }

  gainMeter(n: number) {
    this.meter = Math.max(0, Math.min(WORLD.METER_MAX, this.meter + n));
  }
}
