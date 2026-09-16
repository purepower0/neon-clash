// ── Procedural audio: synthesized SFX + a generative synthwave loop ─────────
import type { SfxName } from "./types";

class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfxGain: GainNode | null = null;
  musicGain: GainNode | null = null;
  comp: DynamicsCompressorNode | null = null;
  noiseBuf: AudioBuffer | null = null;
  muted = false;
  vols = { master: 0.8, music: 0.55, sfx: 0.9 };
  musicTimer: number | null = null;
  nextStep = 0;
  step = 0;
  musicMode: "menu" | "game" = "menu";

  unlock() {
    if (this.ctx) { if (this.ctx.state === "suspended") void this.ctx.resume(); return; }
    const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 5;
    this.master = ctx.createGain();
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);
    this.sfxGain = ctx.createGain();
    this.sfxGain.connect(this.master);
    this.musicGain = ctx.createGain();
    this.musicGain.connect(this.master);
    // shared noise buffer
    const len = ctx.sampleRate * 1.2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.master || !this.sfxGain || !this.musicGain) return;
    this.master.gain.value = this.muted ? 0 : this.vols.master;
    this.sfxGain.gain.value = this.vols.sfx;
    this.musicGain.gain.value = this.vols.music * (this.musicMode === "game" ? 0.62 : 1);
  }

  setVolumes(m: number, mu: number, s: number, muted: boolean) {
    this.vols = { master: m, music: mu, sfx: s };
    this.muted = muted;
    this.applyVolumes();
  }

  setMusicMode(mode: "menu" | "game") {
    this.musicMode = mode;
    this.applyVolumes();
  }

  // ── synth primitives ──────────────────────────────────────────────────────
  private osc(type: OscillatorType, f0: number, f1: number, t0: number, dur: number, vol: number, dest: GainNode, curve = 0.001) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(curve, t0 + dur);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, t0: number, vol: number, type: BiquadFilterType, freq0: number, freq1: number, q: number, dest: GainNode) {
    const ctx = this.ctx!;
    if (!this.noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, freq1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.02);
  }

  play(name: SfxName, pitch = 1) {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const ctx = this.ctx;
    const out = this.sfxGain;
    const t = ctx.currentTime;
    switch (name) {
      case "swing":
        this.noise(0.09, t, 0.22 * pitch, "bandpass", 2400 * pitch, 500, 1.4, out); break;
      case "whiff":
        this.noise(0.18, t, 0.28, "bandpass", 900, 240, 1.2, out); break;
      case "swingHeavy":
        this.noise(0.16, t, 0.34, "bandpass", 1300, 260, 1.2, out);
        this.osc("sine", 160, 60, t, 0.12, 0.1, out); break;
      case "hit":
        this.osc("square", 210 * pitch, 52, t, 0.1, 0.4, out);
        this.noise(0.08, t, 0.4, "highpass", 1600, 900, 0.8, out);
        this.osc("sine", 110, 44, t, 0.13, 0.5, out); break;
      case "hitBig":
        this.osc("square", 150, 40, t, 0.18, 0.5, out);
        this.osc("sine", 90, 34, t, 0.24, 0.65, out);
        this.noise(0.16, t, 0.5, "lowpass", 2600, 240, 0.7, out); break;
      case "hitAir":
        this.osc("triangle", 340 * pitch, 80, t, 0.12, 0.35, out);
        this.noise(0.1, t, 0.36, "bandpass", 2900, 700, 1.1, out); break;
      case "counter":
        this.play("hitBig", 1.15);
        this.osc("sawtooth", 1400, 1900, t, 0.14, 0.12, out); break;
      case "block":
        this.osc("square", 620, 380, t, 0.05, 0.2, out);
        this.noise(0.05, t, 0.3, "highpass", 3400, 2400, 1.4, out); break;
      case "chip":
        this.osc("square", 400, 160, t, 0.07, 0.18, out); break;
      case "jump":
        this.noise(0.16, t, 0.12, "bandpass", 500, 1700, 1, out); break;
      case "land":
        this.noise(0.07, t, 0.16, "lowpass", 600, 180, 0.8, out); break;
      case "dash":
        this.noise(0.2, t, 0.2, "bandpass", 700, 2600, 1, out); break;
      case "blink":
        this.osc("sawtooth", 950, 2400, t, 0.14, 0.14, out);
        this.noise(0.14, t, 0.16, "highpass", 2200, 5200, 1.2, out); break;
      case "zap":
        this.osc("sawtooth", 860 * pitch, 210, t, 0.2, 0.2, out);
        this.noise(0.18, t, 0.18, "bandpass", 3400, 900, 2, out); break;
      case "zapBig":
        this.osc("sawtooth", 520, 110, t, 0.32, 0.28, out);
        this.osc("square", 130, 60, t, 0.26, 0.2, out);
        this.noise(0.28, t, 0.24, "lowpass", 3600, 500, 1, out); break;
      case "orb":
        this.osc("sine", 700, 1250, t, 0.3, 0.16, out);
        this.osc("sine", 1050, 1875, t + 0.05, 0.26, 0.1, out); break;
      case "quake":
        this.osc("sine", 70, 28, t, 0.4, 0.7, out);
        this.noise(0.35, t, 0.42, "lowpass", 900, 120, 0.6, out); break;
      case "push":
        this.noise(0.3, t, 0.34, "bandpass", 500, 2200, 0.9, out);
        this.osc("sine", 220, 88, t, 0.2, 0.22, out); break;
      case "grab":
        this.osc("sine", 55, 24, t, 0.5, 0.9, out);
        this.noise(0.45, t, 0.6, "lowpass", 1800, 100, 0.7, out);
        this.osc("square", 90, 30, t + 0.18, 0.3, 0.4, out); break;
      case "super": {
        this.osc("sawtooth", 160, 1400, t, 0.55, 0.22, out);
        this.osc("sawtooth", 164, 1418, t, 0.55, 0.18, out);
        this.noise(0.5, t, 0.16, "bandpass", 600, 4800, 1.4, out);
        this.osc("sine", 60, 200, t + 0.4, 0.3, 0.5, out);
        break;
      }
      case "superHit":
        this.play("hitBig", 1.2); break;
      case "ko":
        this.osc("sine", 120, 22, t, 0.9, 1.0, out);
        this.noise(0.7, t, 0.5, "lowpass", 4200, 90, 0.6, out);
        this.osc("square", 300, 30, t, 0.35, 0.3, out); break;
      case "round":
        this.osc("square", 440, 440, t, 0.09, 0.12, out);
        this.osc("square", 587, 587, t + 0.12, 0.12, 0.12, out); break;
      case "fight":
        this.osc("square", 523, 523, t, 0.07, 0.14, out);
        this.osc("square", 784, 784, t + 0.09, 0.16, 0.16, out);
        this.noise(0.2, t, 0.1, "highpass", 3000, 5000, 1, out); break;
      case "uiMove": this.osc("square", 660, 620, t, 0.04, 0.06, out); break;
      case "uiSelect":
        this.osc("square", 520, 520, t, 0.05, 0.08, out);
        this.osc("square", 780, 780, t + 0.06, 0.07, 0.08, out); break;
      case "uiBack": this.osc("square", 380, 200, t, 0.08, 0.08, out); break;
    }
  }

  // ── generative music: moody 100bpm minor pulse ────────────────────────────
  private note(m: number) { return 440 * Math.pow(2, (m - 69) / 12); }

  private scheduleStep(s: number, t: number) {
    if (!this.ctx || !this.musicGain) return;
    const out = this.musicGain;
    const bar = Math.floor(s / 16) % 4;
    const beat = s % 16;
    const roots = [36, 32, 39, 34]; // C2, Ab1, Eb2, Bb1 — moody progression
    const root = roots[bar];
    // kick: four on floor, soft
    if (beat % 4 === 0) {
      this.osc("sine", 130, 38, t, 0.16, 0.5, out);
    }
    // sub bass groove
    const bassPat = [0, -1, 0, -1, 12, -1, 0, 7, 0, -1, 10, -1, 0, -1, 7, 3];
    const bn = bassPat[beat];
    if (bn >= 0) this.osc("triangle", this.note(root + bn), this.note(root + bn) * 0.995, t, 0.22, 0.3, out);
    // hats
    if (beat % 2 === 0) this.noise(0.03, t, beat % 4 === 2 ? 0.07 : 0.045, "highpass", 7000, 8000, 1, out);
    // pad chord at bar start
    if (beat === 0) {
      const chord = [0, 3, 7, 10];
      chord.forEach((iv) => {
        this.osc("sawtooth", this.note(root + 24 + iv), this.note(root + 24 + iv) * 1.001, t, 1.9, 0.022, out);
        this.osc("sawtooth", this.note(root + 24 + iv) * 1.004, this.note(root + 24 + iv), t, 1.9, 0.02, out);
      });
    }
    // sparse bell
    if ((bar === 1 || bar === 3) && beat === 10) {
      this.osc("sine", this.note(root + 36), this.note(root + 36), t, 0.7, 0.06, out);
    }
  }

  startMusic() {
    this.unlock();
    if (!this.ctx || this.musicTimer !== null) return;
    const stepDur = 60 / 100 / 4;
    this.step = 0;
    this.nextStep = this.ctx.currentTime + 0.06;
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx) return;
      while (this.nextStep < this.ctx.currentTime + 0.12) {
        if (!this.muted) this.scheduleStep(this.step, this.nextStep);
        this.nextStep += stepDur;
        this.step++;
      }
    }, 28);
  }

  stopMusic() {
    if (this.musicTimer !== null) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }
}

export const audio = new AudioEngine();
