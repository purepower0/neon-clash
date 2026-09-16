import { useCallback, useEffect, useState } from "react";
import TitleScreen from "./screens/TitleScreen";
import CharSelectScreen from "./screens/CharSelectScreen";
import SettingsScreen from "./screens/SettingsScreen";
import HowToScreen from "./screens/HowToScreen";
import GameScreen, { type MatchConfig } from "./screens/GameScreen";
import type { GameSettings, Difficulty } from "./game/types";
import { DEFAULT_BINDINGS } from "./game/input";
import { audio } from "./game/audio";

type Screen = "title" | "select" | "settings" | "howto" | "game";

const LS_KEY = "neonclash_settings_v1";

function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<GameSettings>;
      return {
        bindings: { ...DEFAULT_BINDINGS, ...(p.bindings ?? {}) },
        master: p.master ?? 0.8,
        music: p.music ?? 0.55,
        sfx: p.sfx ?? 0.9,
        muted: p.muted ?? false,
      };
    }
  } catch { /* ignore */ }
  return { bindings: { ...DEFAULT_BINDINGS }, master: 0.8, music: 0.55, sfx: 0.9, muted: false };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("title");
  const [settings, setSettingsState] = useState<GameSettings>(loadSettings);
  const [config, setConfig] = useState<MatchConfig>({ p1: "kai", p2: "volt", diff: "medium" as Difficulty });

  const setSettings = useCallback((s: GameSettings) => {
    setSettingsState(s);
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  }, []);

  // first interaction unlocks audio + starts menu music
  useEffect(() => {
    const unlock = () => {
      audio.unlock();
      audio.setVolumes(settings.master, settings.music, settings.sfx, settings.muted);
      audio.startMusic();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startMatch = useCallback((p1: string, p2: string, diff: Difficulty) => {
    setConfig({ p1, p2, diff });
    setScreen("game");
  }, []);

  switch (screen) {
    case "select":
      return <CharSelectScreen bindings={settings.bindings} back={() => setScreen("title")} start={startMatch} />;
    case "settings":
      return <SettingsScreen settings={settings} setSettings={setSettings} back={() => setScreen("title")} />;
    case "howto":
      return <HowToScreen bindings={settings.bindings} back={() => setScreen("title")} />;
    case "game":
      return (
        <GameScreen
          config={config}
          settings={settings}
          onExit={(dest) => setScreen(dest === "title" ? "title" : "select")}
        />
      );
    default:
      return <TitleScreen go={(s) => setScreen(s)} />;
  }
}
