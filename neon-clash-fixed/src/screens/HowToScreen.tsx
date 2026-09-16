import { NeonBg, Btn, KeyCap, SectionTitle, Framed } from "../ui";
import { prettyKey } from "../game/input";
import type { ActionBinding } from "../game/types";
import { ROSTER, DIFFICULTY_INFO } from "../game/characters";
import { audio } from "../game/audio";
import { Shield, Move3d, Flame, Zap, CornerDownRight, Trophy } from "lucide-react";

export default function HowToScreen({ bindings, back }: { bindings: ActionBinding; back: () => void }) {
  const K = (k: keyof ActionBinding) => <KeyCap key={String(k)} k={prettyKey(bindings[k])} />;
  return (
    <NeonBg>
      <div className="relative z-10 min-h-screen px-5 md:px-12 py-8 max-w-6xl mx-auto anim-rise">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-display font-black text-3xl md:text-4xl text-white">HOW TO PLAY</h1>
          <Btn kind="ghost" onClick={() => { audio.play("uiBack"); back(); }}>BACK</Btn>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <Framed className="p-6">
            <SectionTitle><Move3d size={15} className="inline mr-1" /> CONTROLS</SectionTitle>
            <div className="space-y-3 font-hud text-sm text-white/75">
              <div className="flex items-center justify-between gap-3"><span>Move / advance</span><span className="flex gap-2">{K("left")}{K("right")}</span></div>
              <div className="flex items-center justify-between gap-3"><span>Jump</span><span>{K("up")}</span></div>
              <div className="flex items-center justify-between gap-3"><span>Crouch</span><span>{K("down")}</span></div>
              <div className="flex items-center justify-between gap-3"><span>Dash (or double-tap a direction)</span><span>{K("dash")}</span></div>
              <div className="flex items-center justify-between gap-3"><span>Attacks 1 – 6</span><span className="flex gap-1.5">{(["m1", "m2", "m3", "m4", "m5", "m6"] as const).map(K)}</span></div>
              <div className="flex items-center justify-between gap-3"><span>Pause</span><KeyCap k="ESC" /></div>
              <p className="text-white/40 text-xs pt-2">Every fighter has exactly 6 moves — check the character screen for what each one does. Air-usable moves work with the same keys mid-jump.</p>
            </div>
          </Framed>

          <Framed className="p-6">
            <SectionTitle><Shield size={15} className="inline mr-1" /> DEFENSE & NEUTRAL</SectionTitle>
            <ul className="space-y-3 font-hud text-sm text-white/75 list-none">
              <li className="flex gap-3"><CornerDownRight size={16} className="text-cyan-300 shrink-0 mt-0.5" /><span><b className="text-cyan-200">Block</b> by holding <i>away</i> from your opponent. Blocking eats chip damage but saves your life.</span></li>
              <li className="flex gap-3"><CornerDownRight size={16} className="text-cyan-300 shrink-0 mt-0.5" /><span><b className="text-amber-300">Lows</b> (sweeps, Ground Quake) beat stand-blocking — crouch + away to stop them.</span></li>
              <li className="flex gap-3"><CornerDownRight size={16} className="text-cyan-300 shrink-0 mt-0.5" /><span><b className="text-orange-300">Overheads</b> (the GRAPPLER's slams) beat crouch-blocking. Stand tall.</span></li>
              <li className="flex gap-3"><CornerDownRight size={16} className="text-cyan-300 shrink-0 mt-0.5" /><span><b className="text-rose-300">Unblockable</b> — Colossus Grip can't be blocked. Jump, or eat 30 damage.</span></li>
              <li className="flex gap-3"><CornerDownRight size={16} className="text-cyan-300 shrink-0 mt-0.5" /><span><b className="text-yellow-300">Counter hits</b> — striking them out of their startup deals +30% damage and stun.</span></li>
            </ul>
          </Framed>

          <Framed className="p-6">
            <SectionTitle><Flame size={15} className="inline mr-1" /> COMBO THEORY</SectionTitle>
            <ul className="space-y-3 font-hud text-sm text-white/75 list-none">
              <li className="flex gap-3"><CornerDownRight size={16} className="text-cyan-300 shrink-0 mt-0.5" /><span><b className="text-cyan-200">Chains</b> — fast buttons (like a jab) cancel into the next move on contact. Jab → jab → finisher.</span></li>
              <li className="flex gap-3"><CornerDownRight size={16} className="text-cyan-300 shrink-0 mt-0.5" /><span><b className="text-cyan-200">Launchers</b> pop them airborne. On hit, press jump instantly to <b>jump-cancel</b> and chase them up.</span></li>
              <li className="flex gap-3"><CornerDownRight size={16} className="text-cyan-300 shrink-0 mt-0.5" /><span><b className="text-cyan-200">Air strings</b> — hit them with air-usable moves before you both land. The AIR fighter lives here.</span></li>
              <li className="flex gap-3"><CornerDownRight size={16} className="text-cyan-300 shrink-0 mt-0.5" /><span><b className="text-cyan-200">Scaling</b> — every extra hit in a combo deals less damage and juggle stun decays. Style, then finish.</span></li>
              <li className="flex gap-3"><CornerDownRight size={16} className="text-cyan-300 shrink-0 mt-0.5" /><span><b className="text-cyan-200">Super cancels</b> — land anything, then slam {prettyKey(bindings.m6)} with a full meter to cancel into super.</span></li>
            </ul>
          </Framed>

          <Framed className="p-6">
            <SectionTitle><Zap size={15} className="inline mr-1" /> METER, SUPER & THE ROSTER</SectionTitle>
            <p className="font-hud text-sm text-white/75 mb-4">Dealing and taking damage builds the bar at the bottom. At 100, move <KeyCap k={prettyKey(bindings.m6)} /> unleashes your super.</p>
            <div className="space-y-2">
              {ROSTER.map((c) => (
                <div key={c.id} className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rotate-45 shrink-0" style={{ background: c.color, boxShadow: `0 0 8px ${c.color}` }} />
                  <span className="font-hud font-bold text-sm w-16" style={{ color: c.color }}>{c.name}</span>
                  <span className="font-hud text-[11px] tracking-wider text-white/40 uppercase w-32 hidden sm:block">{c.archetype}</span>
                  <span className="font-hud text-xs text-white/60 flex-1 hidden md:block">{c.superName}</span>
                </div>
              ))}
            </div>
          </Framed>
        </div>

        <Framed className="p-6 mt-5">
          <SectionTitle><Trophy size={15} className="inline mr-1" /> THE FOUR MINDS</SectionTitle>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(Object.keys(DIFFICULTY_INFO) as (keyof typeof DIFFICULTY_INFO)[]).map((d) => (
              <div key={d} className="border-l-2 pl-3" style={{ borderColor: DIFFICULTY_INFO[d].color }}>
                <div className="font-display font-bold text-sm mb-1" style={{ color: DIFFICULTY_INFO[d].color }}>{DIFFICULTY_INFO[d].label}</div>
                <p className="font-hud text-xs text-white/60 leading-relaxed">{DIFFICULTY_INFO[d].blurb}</p>
              </div>
            ))}
          </div>
          <p className="font-hud text-xs text-white/40 mt-4">Difficulty changes how it plays, not its stats: reaction latency, block rate, high/low reads, punish choices and combo routing. A newcomer will not fluke past HARD. Bring lab time.</p>
        </Framed>
      </div>
    </NeonBg>
  );
}
