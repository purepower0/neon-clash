// ── Particle system: sparks, rings, dust, shocklines, embers, rain ──────────

export type PType = "spark" | "glow" | "ring" | "dust" | "ember" | "shockline" | "shard" | "arc" | "rain" | "splash" | "smoke";

export interface Particle {
  type: PType;
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number;
  color: string;
  seed: number;
  ex?: number;   // extra (e.g. arc target x)
  ey?: number;
  spin?: number;
}

export class Particles {
  list: Particle[] = [];

  spawn(p: Omit<Particle, "life" | "maxLife" | "seed"> & { life: number }): void {
    if (this.list.length > 700) this.list.shift();
    this.list.push({ ...p, maxLife: p.life, seed: Math.random() * 1000, spin: Math.random() * Math.PI * 2 });
  }

  burst(x: number, y: number, color: string, n = 12, power = 7, life = 22): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = power * (0.35 + Math.random() * 0.75);
      this.spawn({
        type: "spark", x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
        life: life * (0.5 + Math.random() * 0.6), size: 1.4 + Math.random() * 2.2, color,
      });
    }
  }

  ring(x: number, y: number, color: string, size = 60, life = 18): void {
    this.spawn({ type: "ring", x, y, vx: 0, vy: 0, life, size, color });
  }

  glow(x: number, y: number, color: string, size = 26, life = 14): void {
    this.spawn({ type: "glow", x, y, vx: 0, vy: 0, life, size, color });
  }

  dust(x: number, y: number, n = 5, color = "#8b8ba3"): void {
    for (let i = 0; i < n; i++) {
      this.spawn({
        type: "dust", x: x + (Math.random() - 0.5) * 30, y: y + Math.random() * 4,
        vx: (Math.random() - 0.5) * 2.4, vy: -Math.random() * 1.6,
        life: 22 + Math.random() * 14, size: 3 + Math.random() * 6, color,
      });
    }
  }

  shards(x: number, y: number, color: string, n = 8): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 8;
      this.spawn({
        type: "shard", x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3,
        life: 26 + Math.random() * 20, size: 3 + Math.random() * 5, color,
      });
    }
  }

  speedLines(x: number, y: number, facing: number, n = 6, color = "#ffffff"): void {
    for (let i = 0; i < n; i++) {
      this.spawn({
        type: "shockline",
        x: x - facing * (10 + Math.random() * 70),
        y: y + (Math.random() - 0.5) * 130,
        vx: -facing * (14 + Math.random() * 18), vy: 0,
        life: 8 + Math.random() * 6, size: 20 + Math.random() * 40, color,
      });
    }
  }

  arc(x: number, y: number, tx: number, ty: number, color: string): void {
    this.spawn({ type: "arc", x, y, vx: 0, vy: 0, life: 7, size: 2, color, ex: tx, ey: ty });
  }

  update(): void {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life--;
      if (p.life <= 0) { l.splice(i, 1); continue; }
      switch (p.type) {
        case "spark":
          p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy = p.vy * 0.94 + 0.18; break;
        case "shard":
          p.x += p.vx; p.y += p.vy; p.vy += 0.5; p.spin = (p.spin ?? 0) + 0.2; break;
        case "dust":
          p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy *= 0.95; p.size *= 1.015; break;
        case "glow":
          p.size *= 0.92; break;
        case "ring":
          p.size *= 1.16; break;
        case "shockline":
          p.x += p.vx; break;
        case "ember":
          p.y += p.vy; p.x += p.vx + Math.sin((p.life + p.seed) * 0.04) * 0.4; break;
        case "arc":
          break;
        default:
          p.x += p.vx; p.y += p.vy;
      }
    }
  }
}
