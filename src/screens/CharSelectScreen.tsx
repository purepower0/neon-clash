import { useState } from "react";
import { NeonBg, Btn, KeyCap, SectionTitle, Framed, StatBar, CHAR_STATS } from "../ui";
import { ROSTER, DIFFICULTY_INFO } from "../game/characters";
import type { Difficulty, ActionBinding } from "../game/types";
import { prettyKey } from "../game/input";
import { audio } from "../game/audio";
import { Swords, ChevronLeft, Sparkles, Cpu } from "lucide-react";

const DIFFS: Difficulty[] = ["easy", "medium", "hard", "extreme"];

function RosterColumn({
  side, sel, setSel,
}: { side: "P1" | "CPU"; sel: string; setSel: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="font-hud text-[11px] tracking-[0.35em] text-white/40 mb-1 flex items-center gap-2">
        {side === "CPU" ? <Cpu size={13} /> : <Swords size={13} />} {side}
      </div>
      {ROSTER.map((c) => {
        const on = sel === c.id;
        return (
          <button
            key={c.id}
            onClick={() => { setSel(c.id); audio.play("uiMove"); }}
            className="nc-btn clip-chamfer-sm text-left px-4 py-3 border transition-all duration-150"
            style={{
              borderColor: on ? c.color : "rgba(255,255,255,0.09)",
              background: on ? `${c.color}14` : "rgba(255,255,255,0.03)",
              boxShadow: on ? `0 0 26px ${c.color}33, inset 0 0 20px ${c.color}14` : undefined,
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rotate-45 shrink-0" style={{ background: c.color, boxShadow: `0 0 10px ${c.color}` }} />
              <div className="flex-1 min-w-0">
                <div className="font-display font-bold text-[15px] leading-tight" style={{ color: on ? c.color : "#f4f4fb" }}>{c.name}</div>
                <div className="font-hud text-[10px] tracking-[0.18em] text-white/45 uppercase truncate">{c.archetype}</div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function CharSelectScreen({
  bindings, back, start,
}: {
  bindings: ActionBinding;
  back: () => void;
  start: (p1: string, p2: string, diff: Difficulty) => void;
}) {
  const [p1, setP1] = useState("kai");
  const [p2, setP2] = useState("volt");
  const [diff, setDiff] = useState<Difficulty>("medium");
  const c1 = ROSTER.find((c) => c.id === p1)!;
  const c2 = ROSTER.find((c) => c.id === p2)!;
  const s1 = CHAR_STATS[p1];
  const s2 = CHAR_STATS[p2];
  const moveKeys = [bindings.m1, bindings.m2, bindings.m3, bindings.m4, bindings.m5, bindings.m6];

  return (
    <NeonBg>
      <div className="relative z-10 min-h-screen px-4 md:px-10 py-6 max-w-[90rem] mx-auto anim-rise">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => { audio.play("uiBack"); back(); }} className="nc-btn font-hud text-white/50 hover:text-cyan-200 text-sm tracking-[0.2em] flex items-center gap-2">
            <ChevronLeft size={16} /> MENU
          </button>
          <h1 className="font-display font-black text-2xl md:text-3xl text-white tracking-wide">CHOOSE YOUR FIGHTER</h1>
          <div className="w-20" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr_230px] gap-5">
          {/* P1 roster */}
          <Framed className="p-4 order-1">
            <RosterColumn side="P1" sel={p1} setSel={setP1} />
          </Framed>

          {/* detail */}
          <Framed glow className="p-6 order-3 lg:order-2 flex flex-col">
            <div className="grid md:grid-cols-2 gap-6 flex-1">
              <div>
                <div className="flex items-end gap-4">
                  <h2 className="font-display font-black text-5xl leading-none" style={{ color: c1.color, textShadow: `0 0 34px ${c1.color}66` }}>{c1.name}</h2>
                  <div className="font-hud text-xs tracking-[0.3em] text-white/50 uppercase pb-1">{c1.title}</div>
                </div>
                <div className="font-hud text-[11px] tracking-[0.25em] uppercase mt-2 inline-block px-2 py-1 border" style={{ color: c1.color, borderColor: `${c1.color}55` }}>{c1.archetype}</div>
                <p className="font-hud text-sm text-white/65 leading-relaxed mt-4">{c1.desc}</p>
                <div className="mt-5 space-y-2 max-w-sm">
                  <StatBar label="SPD" value={s1.spd} color={c1.color} />
                  <StatBar label="PWR" value={s1.pwr} color={c1.color} />
                  <StatBar label="RNG" value={s1.rng} color={c1.color} />
                  <StatBar label="TEC" value={s1.tec} color={c1.color} />
                </div>
                {/* CPU summary */}
                <div className="mt-6 pt-5 border-t border-white/10 flex items-center gap-4">
                  <div className="font-hud text-[11px] tracking-[0.3em] text-white/40">VS</div>
                  <div>
                    <div className="font-display font-bold text-xl" style={{ color: c2.color }}>{c2.name}</div>
                    <div className="font-hud text-[10px] tracking-[0.2em] text-white/45 uppercase">{c2.archetype} · {c2.title}</div>
                  </div>
                  <div className="flex-1 space-y-1.5 min-w-24">
                    <StatBar label="SPD" value={s2.spd} color={c2.color} />
                    <StatBar label="PWR" value={s2.pwr} color={c2.color} />
                  </div>
                </div>
              </div>

              {/* moves */}
              <div>
                <SectionTitle>MOVESET — {c1.name}</SectionTitle>
                <div className="space-y-2">
                  {c1.moves.map((m, i) => (
                    <div key={m.id} className="flex items-start gap-3 group">
                      <KeyCap k={prettyKey(moveKeys[i])} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-hud font-bold text-[13px]" style={{ color: m.cost ? "#ffe45e" : "#f4f4fb" }}>{m.name}</span>
                          {m.kind === "projectile" && !m.cost && <span className="font-hud text-[9px] tracking-widest px-1.5 py-0.5 bg-purple-400/15 text-purple-300 border border-purple-400/30">PROJECTILE</span>}
                          {m.guard === "low" && <span className="font-hud text-[9px] tracking-widest px-1.5 py-0.5 bg-amber-400/15 text-amber-300 border border-amber-400/30">LOW</span>}
                          {m.guard === "overhead" && <span className="font-hud text-[9px] tracking-widest px-1.5 py-0.5 bg-orange-400/15 text-orange-300 border border-orange-400/30">OVERHEAD</span>}
                          {m.guard === "unblockable" && <span className="font-hud text-[9px] tracking-widest px-1.5 py-0.5 bg-rose-400/15 text-rose-300 border border-rose-400/30">UNBLOCKABLE</span>}
                          {m.jumpCancel && <span className="font-hud text-[9px] tracking-widest px-1.5 py-0.5 bg-cyan-400/15 text-cyan-300 border border-cyan-400/30">LAUNCHER</span>}
                          {m.cost ? <span className="font-hud text-[9px] tracking-widest px-1.5 py-0.5 bg-yellow-300/15 text-yellow-300 border border-yellow-300/40 flex items-center gap-1"><Sparkles size={9} />SUPER</span> : null}
                        </div>
                        <div className="font-hud text-[11px] text-white/45 mt-0.5 leading-snug">{m.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* difficulty + start */}
            <div className="mt-6 pt-5 border-t border-white/10">
              <SectionTitle>CPU INTELLIGENCE</SectionTitle>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                {DIFFS.map((d) => {
                  const info = DIFFICULTY_INFO[d];
                  const on = diff === d;
                  return (
                    <button
                      key={d}
                      onClick={() => { setDiff(d); audio.play("uiMove"); }}
                      className="nc-btn clip-chamfer-sm border px-3 py-2.5 text-left transition-all"
                      style={{
                        borderColor: on ? info.color : "rgba(255,255,255,0.1)",
                        background: on ? `${info.color}16` : "rgba(255,255,255,0.03)",
                        boxShadow: on ? `0 0 22px ${info.color}30` : undefined,
                      }}
                    >
                      <div className="font-display font-bold text-sm" style={{ color: on ? info.color : "rgba(255,255,255,0.6)" }}>{info.label}</div>
                      <div className="font-hud text-[10px] text-white/45 mt-1 leading-snug hidden md:block">{info.blurb}</div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-5 flex justify-center">
                <Btn
                  className="px-14 py-4 text-lg"
                  onClick={() => { audio.play("uiSelect"); start(p1, p2, diff); }}
                >
                  <span className="flex items-center gap-3"><Swords size={20} /> FIGHT</span>
                </Btn>
              </div>
            </div>
          </Framed>

          {/* CPU roster */}
          <Framed className="p-4 order-2 lg:order-3">
            <RosterColumn side="CPU" sel={p2} setSel={setP2} />
          </Framed>
        </div>
      </div>
    </NeonBg>
  );
}
