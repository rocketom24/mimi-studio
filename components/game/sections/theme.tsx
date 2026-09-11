import type { ReactNode } from "react";
import type { IconType } from "react-icons";

/** Shared cozy palette, matching game/world/palette.ts hex values + PortfolioPanel's shell. */
export const THEME = {
  purple: "#6f5c9e",
  plumDark: "#1e1730",
  plumDarker: "#241c33",
  plum: "#3a2f4d",
  cream: "#f2ecff",
  gold: "#ffe9a8",
  green: "#6bbf8a",
  blue: "#4ad0e8",
} as const;

/** Small bordered card used across sections for a consistent cozy pixel look. */
export function SectionCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`border-2 border-[#6f5c9e]/50 bg-[#241c33] p-3 sm:p-4 ${className}`}
    >
      {children}
    </div>
  );
}

/** Pill-shaped tag, e.g. for tech names or bullet highlights. */
export function Chip({ children, icon: Icon }: { children: ReactNode; icon?: IconType }) {
  return (
    <span className="inline-flex items-center gap-1.5 border border-[#6f5c9e]/60 bg-[#3a2f4d] px-2.5 py-1 font-mono text-xs text-[#f2ecff]">
      {Icon ? <Icon className="shrink-0 text-[#ffe9a8]" size={14} /> : null}
      {children}
    </span>
  );
}

/** Labeled horizontal progress bar for growth/learning style sections. */
export function ProgressBar({ label, value, icon: Icon }: { label: string; value: number; icon?: IconType }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 font-mono text-xs text-[#e8ddff]">
        {Icon ? <Icon className="shrink-0 text-[#ffe9a8]" size={14} /> : null}
        <span>{label}</span>
      </div>
      <div className="h-2 w-full overflow-hidden border border-[#6f5c9e]/50 bg-[#1e1730]">
        <div
          className="h-full bg-gradient-to-r from-[#6bbf8a] to-[#4ad0e8]"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

/** Section heading used inside a panel body to break content into named blocks. */
export function SubHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-[#ffe9a8]">{children}</h3>
  );
}
