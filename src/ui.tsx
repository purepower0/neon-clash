// ── Shared UI atoms for NEON CLASH menus ─────────────────────────────────────
import type { ReactNode } from "react";
import { cn } from "./utils/cn";

export function NeonBg({ tintA = "#67e8f9", tintB = "#c084fc", children }: { tintA?: string; tintB?: string; children?: ReactNode }) {
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#050509] nc-noise">
      <div className="absolute inset-0 nc-grid-bg opacity-60" />
      <div
        className="absolute -top-40 -left-40 w-[42rem] h-[42rem] rounded-full blur-[140px] opacity-25"
        style={{ background: tintA }}
      />
      <div
        className="absolute -bottom-56 -right-40 w-[46rem] h-[46rem] rounded-full blur-[160px] opacity-20"
        style={{ background: tintB }}
      />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 h-24 bg-gradient-to-b from-cyan-200/[0.06] to-transparent animate-[nc-scan_7s_linear_infinite]" style={{ animationName: "nc-scan" }} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.55)_100%)]" />
      {children}
    </div>
  );
}

export function Corner({ className }: { className?: string }) {
  return <div className={cn("absolute w-4 h-4 border-cyan-300/70", className)} />;
}

export function Framed({ children, className, glow = false }: { children: ReactNode; className?: string; glow?: boolean }) {
  return (
    <div
      className={cn(
        "relative clip-chamfer bg-[#0a0a14]/90 border border-white/[0.08]",
        glow && "shadow-[0_0_40px_rgba(103,232,249,0.12)]",
        className
      )}
    >
      <Corner className="top-0 left-0 border-t-2 border-l-2" />
      <Corner className="bottom-0 right-0 border-b-2 border-r-2" />
      {children}
    </div>
  );
}

export function Btn({
  children, onClick, kind = "primary", className, disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "primary" | "ghost" | "danger";
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "nc-btn clip-chamfer-sm font-hud font-semibold tracking-[0.18em] uppercase px-7 py-3.5 text-sm select-none",
        kind === "primary" &&
          "bg-cyan-300 text-[#04141a] hover:bg-cyan-200 shadow-[0_0_28px_rgba(103,232,249,0.35)] disabled:bg-white/10 disabled:text-white/30 disabled:shadow-none",
        kind === "ghost" &&
          "bg-white/[0.04] text-white/80 border border-white/15 hover:border-cyan-300/60 hover:text-cyan-200",
        kind === "danger" &&
          "bg-rose-400/10 text-rose-300 border border-rose-400/40 hover:bg-rose-400/20",
        className
      )}
    >
      {children}
    </button>
  );
}

export function KeyCap({ k, active = false, onClick, wide = false }: { k: string; active?: boolean; onClick?: () => void; wide?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "clip-chamfer-sm inline-flex items-center justify-center font-hud font-bold tracking-wider transition-all duration-150",
        wide ? "min-w-[7.5rem] px-3 h-10 text-sm" : "min-w-[2.75rem] px-2 h-10 text-sm",
        active
          ? "bg-cyan-300 text-[#04141a] shadow-[0_0_22px_rgba(103,232,249,0.5)] animate-pulse"
          : "bg-white/[0.07] text-cyan-100/90 border border-white/15 hover:border-cyan-300/60 hover:bg-white/[0.12]"
      )}
    >
      {k}
    </button>
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 mb-4", className)}>
      <div className="w-1.5 h-5 bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.8)]" />
      <h2 className="font-display font-bold text-white/90 tracking-[0.14em] text-sm uppercase">{children}</h2>
      <div className="flex-1 h-px bg-gradient-to-r from-white/20 to-transparent" />
    </div>
  );
}

export function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-hud text-[11px] w-8 text-white/50 font-bold tracking-wider">{label}</span>
      <div className="flex-1 h-[7px] bg-white/[0.07] clip-chamfer-sm overflow-hidden">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${value}%`, background: `linear-gradient(90deg, ${color}88, ${color})`, boxShadow: `0 0 10px ${color}` }}
        />
      </div>
      <span className="font-hud text-[11px] w-7 text-right text-white/60">{value}</span>
    </div>
  );
}

export const CHAR_STATS: Record<string, { spd: number; pwr: number; rng: number; tec: number }> = {
  kai: { spd: 66, pwr: 68, rng: 55, tec: 58 },
  volt: { spd: 100, pwr: 44, rng: 35, tec: 72 },
  jett: { spd: 82, pwr: 56, rng: 45, tec: 96 },
  sage: { spd: 42, pwr: 64, rng: 100, tec: 78 },
  bruno: { spd: 34, pwr: 100, rng: 52, tec: 64 },
};
