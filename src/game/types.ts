// ── Shared types for the NEON CLASH engine ──────────────────────────────────

export type GuardType = "mid" | "low" | "overhead" | "unblockable";
export type MoveKind = "strike" | "projectile" | "special" | "grab";
export type SfxName =
  | "swing" | "swingHeavy" | "hit" | "hitBig" | "counter" | "block" | "chip"
  | "jump" | "land" | "dash" | "blink" | "zap" | "zapBig" | "orb" | "quake"
  | "push" | "super" | "superHit" | "ko" | "grab" | "round" | "fight"
  | "uiMove" | "uiSelect" | "uiBack" | "hitAir" | "whiff";

export interface ProjectileDef {
  speed: number;            // px/frame horizontal
  vy?: number;              // initial vertical speed (px/frame, +down)
  gravity?: number;         // per frame
  radius: number;
  level: number;            // projectile clash priority
  life: number;             // frames
  low?: boolean;            // travels along ground (Bruno quake)
  w?: number; h?: number;   // override hitbox (defaults to radius*2)
  multiHit?: boolean;       // keeps hitting with per-target cooldown (Sage super)
  hitCooldown?: number;
  color: string;
}

export interface MoveDef {
  slot: 1 | 2 | 3 | 4 | 5 | 6;
  id: string;
  name: string;
  desc: string;
  kind: MoveKind;
  startup: number;
  active: number;
  recovery: number;
  damage: number;           // per hit
  hits?: number;            // multi-hit strikes
  hitstun: number;
  blockstun: number;
  range: number;            // hitbox length from body
  h: number;                // hitbox height
  yOff: number;             // hitbox centre, above feet (px)
  kb: { x: number; y: number };   // knockback (y negative = up)
  guard: GuardType;
  airOk?: boolean;
  airOnly?: boolean;
  jumpCancel?: boolean;     // launcher: can cancel into jump on hit
  chains?: number[];        // move slots this can chain-cancel into on contact
  selfVx?: number;          // forward lunge velocity during active
  selfVy?: number;          // vertical velocity on start (rise) or during active via diveKick
  diveKick?: boolean;       // active until landing (Jett)
  popUpOnHit?: boolean;     // attacker rebounds upward on hit (dive loops)
  armor?: number;           // absorb N hits during active window
  projectile?: ProjectileDef;
  orb?: boolean;            // places a proximity orb (Sage)
  teleport?: number;        // blink distance (Volt)
  wallSlam?: boolean;       // slams opponent into wall, bounces back
  cost?: number;            // meter cost (supers)
  invuln?: number;          // invulnerable frames at start
  cooldown?: number;
  anim: string;             // pose archetype key
  sfx: SfxName;
  hitSfx?: "hit" | "hitBig" | "hitAir";
  color?: string;           // fx accent override
}

export interface CharacterDef {
  id: string;
  name: string;
  title: string;
  archetype: string;
  desc: string;
  color: string;
  glow: string;
  dark: string;
  scale: number;            // skeleton scale
  girth: number;            // line width multiplier
  walkF: number; walkB: number;
  dashSpeed: number; dashDur: number;
  jumpVel: number; gravity: number; maxFall: number;
  jumps: number;
  airDash?: boolean;
  weight: number;           // knockback taken multiplier
  hp: number;
  bodyW: number; bodyH: number;
  moves: MoveDef[];
  // AI data
  pokes: number[];          // preferred neutral buttons (slots)
  antiAir: number;          // slot
  keepaway: number[];       // slots used at range
  comboChart: Record<number, number[]>;   // slot → next slots when it connects
  preferredRange: number;
  acc: "headband" | "goggles" | "scarf" | "hat" | "mohawk";
  superName: string;
}

export type Difficulty = "easy" | "medium" | "hard" | "extreme";

export interface BrainParams {
  reaction: number;   // frames between perception updates
  block: number;      // 0..1 chance to attempt a block on perceived threat
  blockRead: number;  // 0..1 chance to pick correct high/low guard
  punish: number;     // chance to punish recovery
  aggression: number;
  combo: number;      // 0 = single hits, 1 = chains, 2 = launcher routes, 3 = optimal
  spacing: number;    // how well it holds preferred range
  antiAir: number;
  mixup: number;      // overheads / lows / empty movement tricks
  mobility: number;   // dashes & jumps
  super: number;      // likelihood of using super when able
  drop: number;       // chance to drop a combo chain
  jumpIn: number;     // chance to approach via the air
  bait: number;       // chance to whiff-bait punishes
}

export interface ActionBinding {
  left: string; right: string; down: string; up: string; dash: string;
  m1: string; m2: string; m3: string; m4: string; m5: string; m6: string;
}

export interface GameSettings {
  bindings: ActionBinding;
  master: number; music: number; sfx: number;
  muted: boolean;
}

// Command fed to a Fighter every tick by either the keyboard or the AI.
export interface Cmd {
  left: boolean; right: boolean; down: boolean;
  upPressed: boolean; upHeld: boolean;
  dashPressed: boolean;
  action: number | null;   // slot index 0..5
}

export const EMPTY_CMD: Cmd = {
  left: false, right: false, down: false,
  upPressed: false, upHeld: false, dashPressed: false, action: null,
};

export const WORLD = {
  W: 1600,
  H: 900,
  GROUND: 736,
  WALL_L: 96,
  WALL_R: 1504,
  ROUND_TIME: 99,
  METER_MAX: 100,
};

export interface FighterInfo {
  hp: number; meter: number; combo: number; comboTimer: number; maxCombo: number;
}
