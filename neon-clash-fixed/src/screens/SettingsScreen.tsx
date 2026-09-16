import { useEffect, useState } from "react";
import { NeonBg, Btn, KeyCap, SectionTitle, Framed } from "../ui";
import type { GameSettings, ActionBinding } from "../game/types";
import { BINDABLE, DEFAULT_BINDINGS, normKey, prettyKey } from "../game/input";
import { audio } from "../game/audio";
import { Volume2, VolumeX, Keyboard, RotateCcw, Music2, Activity } from "lucide-react";

function Slider({ label, value, onChange, icon }: { label: string; value: number; onChange: (v: number) => void; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2 w-28 text-white/60 font-hud text-sm">{icon}{label}</div>
      <input
        type="range" min={0} max={1} step={0.01} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-cyan-300 h-1.5 cursor-pointer"
      />
      <span className="font-hud text-xs text-white/50 w-10 text-right">{Math.round(value * 100)}%</span>
    </div>
  );
}

export default function SettingsScreen({
  settings, setSettings, back,
}: {
  settings: GameSettings;
  setSettings: (s: GameSettings) => void;
  back: () => void;
}) {
  const [listening, setListening] = useState<keyof ActionBinding | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setListening(null); audio.play("uiBack"); return; }
      const k = normKey(e.key);
      if (["shift", "control", "alt", "meta"].includes(k) && e.location === 3) return;
      setSettings({
        ...settings,
        bindings: swapBinding(settings.bindings, listening, k),
      });
      setFlash(null);
      setListening(null);
      audio.play("uiSelect");
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening, settings]);

  const applyAudio = (patch: Partial<GameSettings>) => {
    const s = { ...settings, ...patch };
    setSettings(s);
    audio.unlock();
    audio.setVolumes(s.master, s.music, s.sfx, s.muted);
  };

  return (
    <NeonBg>
      <div className="relative z-10 min-h-screen px-5 md:px-12 py-8 max-w-4xl mx-auto anim-rise">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-display font-black text-3xl md:text-4xl text-white">SETTINGS</h1>
          <Btn kind="ghost" onClick={() => { audio.play("uiBack"); back(); }}>BACK</Btn>
        </div>

        <Framed className="p-6 mb-5">
          <SectionTitle><Keyboard size={15} className="inline mr-1" /> INPUT BINDINGS</SectionTitle>
          <p className="font-hud text-xs text-white/45 mb-5">Click a key and press the replacement. Dashing also works by double-tapping a direction. ESC always pauses.</p>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
            {BINDABLE.map((b) => (
              <div key={b.key} className="flex items-center justify-between gap-4 py-1 border-b border-white/[0.06]">
                <span className="font-hud text-sm text-white/75">{b.label}</span>
                <KeyCap
                  wide
                  active={listening === b.key}
                  k={listening === b.key ? "PRESS A KEY…" : prettyKey(settings.bindings[b.key])}
                  onClick={() => { setListening(listening === b.key ? null : b.key); audio.play("uiMove"); }}
                />
              </div>
            ))}
          </div>
          {flash && <div className="font-hud text-xs text-amber-300 mt-3">{flash}</div>}
          <div className="mt-5">
            <Btn
              kind="ghost"
              className="flex items-center gap-2"
              onClick={() => {
                setSettings({ ...settings, bindings: { ...DEFAULT_BINDINGS } });
                setFlash("Bindings restored to defaults.");
                audio.play("uiSelect");
              }}
            >
              <RotateCcw size={15} /> RESET BINDINGS
            </Btn>
          </div>
        </Framed>

        <Framed className="p-6">
          <SectionTitle><Activity size={15} className="inline mr-1" /> AUDIO</SectionTitle>
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 font-hud text-sm text-white/70">
                {settings.muted ? <VolumeX size={17} className="text-rose-300" /> : <Volume2 size={17} className="text-cyan-300" />}
                {settings.muted ? "Sound muted" : "Sound on"}
              </div>
              <Btn
                kind={settings.muted ? "danger" : "ghost"}
                onClick={() => applyAudio({ muted: !settings.muted })}
              >
                {settings.muted ? "UNMUTE" : "MUTE"}
              </Btn>
            </div>
            <Slider label="MASTER" value={settings.master} icon={<Volume2 size={15} />} onChange={(v) => applyAudio({ master: v, muted: false })} />
            <Slider label="MUSIC" value={settings.music} icon={<Music2 size={15} />} onChange={(v) => applyAudio({ music: v, muted: false })} />
            <Slider label="EFFECTS" value={settings.sfx} icon={<Activity size={15} />} onChange={(v) => applyAudio({ sfx: v, muted: false })} />
          </div>
        </Framed>
      </div>
    </NeonBg>
  );
}

// swap: assigning a key that is already used trades it between the two actions
function swapBinding(bindings: ActionBinding, action: keyof ActionBinding, key: string): ActionBinding {
  const next = { ...bindings };
  const oldKey = next[action];
  const holder = (Object.keys(next) as (keyof ActionBinding)[]).find((a) => next[a] === key && a !== action);
  next[action] = key;
  if (holder) next[holder] = oldKey;
  return next;
}
