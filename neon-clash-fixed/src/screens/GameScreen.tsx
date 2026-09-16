import { useEffect, useRef, useState, useCallback } from "react";
import { Engine } from "../game/engine";
import { Renderer } from "../game/renderer";
import { HumanController, prettyKey } from "../game/input";
import { AIController } from "../game/ai";
import { getChar, DIFFICULTY_INFO } from "../game/characters";
import type { GameSettings, Difficulty } from "../game/types";
import { audio } from "../game/audio";
import { Btn } from "../ui";
import { RotateCcw, Users, Home, Pause, Play } from "lucide-react";

export interface MatchConfig { p1: string; p2: string; diff: Difficulty; }

const STEP = 1000 / 60;

export default function GameScreen({
  config, settings, onExit,
}: {
  config: MatchConfig;
  settings: GameSettings;
  onExit: (dest: "select" | "title") => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const humanRef = useRef<HumanController | null>(null);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<null | { winner: 0 | 1 }>(null);
  const resultRef = useRef(result);
  resultRef.current = result;

  // ── engine lifecycle ─────────────────────────────────────────────────────
  useEffect(() => {
    const cv = canvasRef.current!;
    const wrap = wrapRef.current!;
    const renderer = new Renderer(cv);
    const human = new HumanController(settings.bindings);
    human.attach();
    const ai = new AIController(config.diff);
    const engine = new Engine(config.p1, config.p2, config.diff, {
      poll: () => human.poll(),
    }, {
      poll: (s, f, e) => ai.poll(s, f, e),
    });
    const b = settings.bindings;
    renderer.setMeta([
      `${prettyKey(b.left)} ${prettyKey(b.right)} MOVE`,
      `${prettyKey(b.up)} JUMP`,
      `${prettyKey(b.dash)} / DOUBLE-TAP — DASH`,
      "HOLD DOWN + AWAY — BLOCK",
      `${prettyKey(b.m1)}–${prettyKey(b.m6)} MOVES`,
    ], DIFFICULTY_INFO[config.diff].label, prettyKey(b.m6));
    engine.onEvent = (ev) => {
      if (ev.type === "matchEnd") setResult({ winner: ev.winner });
    };
    engineRef.current = engine;
    humanRef.current = human;
    audio.unlock();
    audio.startMusic();
    audio.setMusicMode("game");
    audio.setVolumes(settings.master, settings.music, settings.sfx, settings.muted);

    const resize = () => renderer.resize(wrap.clientWidth, wrap.clientHeight);
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let acc = 0;
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      let dt = now - last;
      last = now;
      if (dt > 120) dt = 120;
      acc += dt;
      let guard = 0;
      while (acc >= STEP && guard++ < 5) {
        engine.tick();
        acc -= STEP;
      }
      engine.renderAlpha = Math.max(0, Math.min(1, acc / STEP));
      renderer.render(engine);
    };
    raf = requestAnimationFrame(loop);

    const onVis = () => { if (document.hidden) setPaused(true); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      human.detach();
      document.removeEventListener("visibilitychange", onVis);
      audio.setMusicMode("menu");
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.p1, config.p2, config.diff]);

  // ── pause plumbing ────────────────────────────────────────────────────────
  const applyPause = useCallback((p: boolean) => {
    setPaused(p);
    const e = engineRef.current;
    if (e) e.paused = p;
    const h = humanRef.current;
    if (h) h.poll(); // flush stale key edges
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key.toLowerCase() === "p") {
        if (resultRef.current) return;
        applyPause(!(engineRef.current?.paused ?? false));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyPause]);

  const rematch = () => {
    const e = engineRef.current;
    if (!e) return;
    e.restartMatch();
    e.paused = false;
    setResult(null);
    setPaused(false);
    audio.play("uiSelect");
  };

  const wInfo = result ? (result.winner === 0 ? getChar(config.p1) : getChar(config.p2)) : null;
  const e = engineRef.current;

  return (
    <div ref={wrapRef} className="fixed inset-0 bg-[#050509] overflow-hidden select-none">
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* pause button */}
      {!result && (
        <button
          onClick={() => applyPause(!paused)}
          className="absolute top-3 right-3 z-20 w-10 h-10 clip-chamfer-sm bg-black/50 border border-white/15 text-white/70 hover:text-cyan-200 hover:border-cyan-300/50 flex items-center justify-center transition-colors"
          title="Pause (ESC)"
        >
          {paused ? <Play size={16} /> : <Pause size={16} />}
        </button>
      )}

      {/* pause overlay */}
      {paused && !result && (
        <div className="absolute inset-0 z-30 bg-[#050509]/78 backdrop-blur-sm flex items-center justify-center anim-pop">
          <div className="text-center">
            <div className="font-display font-black text-5xl text-white mb-1 tracking-wide">PAUSED</div>
            <div className="font-hud text-xs tracking-[0.4em] text-cyan-200/60 mb-8">TAKE A BREATH</div>
            <div className="flex flex-col gap-3 w-64">
              <Btn onClick={() => applyPause(false)}><span className="flex items-center justify-center gap-2"><Play size={16} /> RESUME</span></Btn>
              <Btn kind="ghost" onClick={rematch}><span className="flex items-center justify-center gap-2"><RotateCcw size={15} /> RESTART MATCH</span></Btn>
              <Btn kind="ghost" onClick={() => onExit("select")}><span className="flex items-center justify-center gap-2"><Users size={15} /> CHANGE FIGHTERS</span></Btn>
              <Btn kind="danger" onClick={() => onExit("title")}><span className="flex items-center justify-center gap-2"><Home size={15} /> MAIN MENU</span></Btn>
            </div>
            {e && (
              <div className="mt-8 font-hud text-[11px] tracking-[0.25em] text-white/35">
                ROUND {e.round} · {e.wins[0]} — {e.wins[1]} · {DIFFICULTY_INFO[config.diff].label} CPU
              </div>
            )}
          </div>
        </div>
      )}

      {/* result overlay */}
      {result && wInfo && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div className="text-center pointer-events-auto anim-rise mt-40">
            <div
              className="font-display font-black text-6xl md:text-7xl mb-2"
              style={{ color: wInfo.color, textShadow: `0 0 60px ${wInfo.color}88` }}
            >
              {result.winner === 0 ? "VICTORY" : "DEFEAT"}
            </div>
            <div className="font-hud tracking-[0.35em] text-white/70 text-sm mb-1">
              {wInfo.name} {result.winner === 0 ? "CONQUERS" : "PREVAILS"} · {DIFFICULTY_INFO[config.diff].label} CPU
            </div>
            {e && (
              <div className="font-hud text-xs text-white/40 tracking-[0.2em] mb-8">
                FINAL {e.wins[0]} — {e.wins[1]} · BEST COMBO {e.f[0].maxCombo} HITS
              </div>
            )}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Btn onClick={rematch}><span className="flex items-center gap-2"><RotateCcw size={16} /> REMATCH</span></Btn>
              <Btn kind="ghost" onClick={() => onExit("select")}><span className="flex items-center gap-2"><Users size={16} /> CHANGE FIGHTERS</span></Btn>
              <Btn kind="ghost" onClick={() => onExit("title")}><span className="flex items-center gap-2"><Home size={16} /> MENU</span></Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
