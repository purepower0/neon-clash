// ── Keyboard input + controllers (human & AI share the same Cmd contract) ───
import type { Cmd, ActionBinding } from "./types";
import { EMPTY_CMD } from "./types";

export const DEFAULT_BINDINGS: ActionBinding = {
  left: "a", right: "d", down: "s", up: "w", dash: "shift",
  m1: "1", m2: "2", m3: "3", m4: "4", m5: "5", m6: "6",
};

export const BINDABLE: { key: keyof ActionBinding; label: string }[] = [
  { key: "left", label: "Move Left" },
  { key: "right", label: "Move Right" },
  { key: "down", label: "Crouch / Low Block" },
  { key: "up", label: "Jump" },
  { key: "dash", label: "Dash (or double-tap)" },
  { key: "m1", label: "Move 1" },
  { key: "m2", label: "Move 2" },
  { key: "m3", label: "Move 3" },
  { key: "m4", label: "Move 4" },
  { key: "m5", label: "Move 5" },
  { key: "m6", label: "Move 6 · Super" },
];

export function normKey(k: string): string {
  if (k === " ") return "space";
  return k.toLowerCase();
}

export function prettyKey(k: string): string {
  const map: Record<string, string> = {
    space: "SPACE", shift: "SHIFT", control: "CTRL", alt: "ALT",
    arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→",
    escape: "ESC", meta: "CMD", capslock: "CAPS", tab: "TAB", enter: "ENTER",
    backspace: "BKSP", delete: "DEL",
  };
  if (map[k]) return map[k];
  return k.toUpperCase();
}

export class HumanController {
  bindings: ActionBinding;
  down = new Set<string>();
  pressed = new Set<string>();   // edge-triggered this tick
  lastTapDir = 0;
  lastTapTime = -99;
  tapCount = 0;
  frame = 0;
  private onDown: (e: KeyboardEvent) => void;
  private onUp: (e: KeyboardEvent) => void;
  private onBlur: () => void;
  attached = false;

  constructor(bindings: ActionBinding) {
    this.bindings = bindings;
    this.onDown = (e: KeyboardEvent) => {
      const k = normKey(e.key);
      if (k === "escape" || k === "p") return; // handled by React pause layer
      const all = Object.values(this.bindings);
      if (all.includes(k)) e.preventDefault();
      if (!e.repeat) this.pressed.add(k);
      this.down.add(k);
    };
    this.onUp = (e: KeyboardEvent) => this.down.delete(normKey(e.key));
    this.onBlur = () => { this.down.clear(); this.pressed.clear(); };
  }

  attach() {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
    window.addEventListener("blur", this.onBlur);
  }

  detach() {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
    window.removeEventListener("blur", this.onBlur);
  }

  poll(): Cmd {
    this.frame++;
    const b = this.bindings;
    const cmd: Cmd = { ...EMPTY_CMD };
    cmd.left = this.down.has(b.left);
    cmd.right = this.down.has(b.right);
    cmd.down = this.down.has(b.down);
    cmd.upHeld = this.down.has(b.up);
    cmd.upPressed = this.pressed.has(b.up);
    cmd.dashPressed = this.pressed.has(b.dash);

    // double-tap dash detection
    let tapDir = 0;
    if (this.pressed.has(b.left)) tapDir = -1;
    if (this.pressed.has(b.right)) tapDir = 1;
    if (tapDir !== 0) {
      if (tapDir === this.lastTapDir && this.frame - this.lastTapTime < 14) {
        cmd.dashPressed = true;
        this.lastTapDir = 0;
      } else {
        this.lastTapDir = tapDir;
        this.lastTapTime = this.frame;
      }
    }

    const slots = [b.m1, b.m2, b.m3, b.m4, b.m5, b.m6];
    for (let i = 0; i < 6; i++) {
      if (this.pressed.has(slots[i])) { cmd.action = i; break; }
    }
    this.pressed.clear();
    return cmd;
  }
}
