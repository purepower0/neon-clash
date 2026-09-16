import { NeonBg, Btn } from "../ui";
import { Swords, BookOpen, Settings2 } from "lucide-react";
import { audio } from "../game/audio";

export default function TitleScreen({ go }: { go: (s: "select" | "settings" | "howto") => void }) {
  const act = (s: "select" | "settings" | "howto") => {
    audio.unlock();
    audio.play("uiSelect");
    go(s);
  };
  return (
    <NeonBg>
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6">
        {/* decorative cross slashes */}
        <div className="absolute left-[8%] top-[18%] w-[26rem] h-[3px] -rotate-[24deg] bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent blur-[1px]" />
        <div className="absolute right-[6%] bottom-[24%] w-[30rem] h-[3px] rotate-[18deg] bg-gradient-to-r from-transparent via-fuchsia-400/60 to-transparent blur-[1px]" />
        <div className="absolute left-[14%] bottom-[16%] w-40 h-[2px] -rotate-[24deg] bg-orange-400/50 blur-[1px]" />

        <div className="anim-rise text-center" style={{ animationDelay: "0.05s" }}>
          <div className="font-hud text-cyan-200/70 tracking-[0.6em] text-xs mb-3">FIVE STYLES · ONE STAGE · NO MERCY</div>
        </div>
        <h1
          className="anim-rise font-display font-black leading-[0.95] text-center nc-title-text select-none"
          style={{ fontSize: "clamp(3rem, 11vw, 8.5rem)", animationDelay: "0.12s" }}
        >
          NEON<br />CLASH
        </h1>
        <div className="anim-rise flex items-center gap-4 mt-6" style={{ animationDelay: "0.2s" }}>
          <div className="w-16 h-px bg-white/30" />
          <div className="font-hud tracking-[0.5em] text-white/70 text-sm">STICK FIGHTING ARTS</div>
          <div className="w-16 h-px bg-white/30" />
        </div>

        <div className="anim-rise flex flex-col gap-3 mt-12 w-72" style={{ animationDelay: "0.3s" }}>
          <Btn onClick={() => act("select")} className="w-full flex items-center justify-center gap-3 py-4 text-base">
            <Swords size={19} /> FIGHT THE CPU
          </Btn>
          <Btn kind="ghost" onClick={() => act("howto")} className="w-full flex items-center justify-center gap-3">
            <BookOpen size={17} /> HOW TO PLAY
          </Btn>
          <Btn kind="ghost" onClick={() => act("settings")} className="w-full flex items-center justify-center gap-3">
            <Settings2 size={17} /> SETTINGS
          </Btn>
        </div>

        <div className="anim-rise absolute bottom-6 inset-x-0 text-center" style={{ animationDelay: "0.45s" }}>
          <div className="font-hud text-[11px] tracking-[0.3em] text-white/35">
            KEYBOARD REQUIRED · MOVES ON 1-6 (REBINDABLE) · HOLD AWAY TO BLOCK
          </div>
        </div>
      </div>
    </NeonBg>
  );
}
