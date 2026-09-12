"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import type { IconType } from "react-icons";

/**
 * Shared vocabulary for the portfolio panels.
 *
 * The palette is warm lamplight on wood — the same register StudioHud already
 * uses for the studio's own UI layer — with the accents lifted straight from
 * game/world/palette.ts so the panels belong to the apartment they open over.
 * Tokens themselves live in app/globals.css (`--mimi-*`); this file is the
 * component kit each section composes from.
 */
export const THEME = {
  ink: "var(--mimi-ink)",
  gold: "var(--mimi-gold)",
  goldDim: "var(--mimi-gold-dim)",
  cream: "var(--mimi-cream)",
  muted: "var(--mimi-muted)",
  sage: "var(--mimi-sage)",
  sky: "var(--mimi-sky)",
  clay: "var(--mimi-clay)",
} as const;

/** Stagger index, consumed by `.mimi-reveal`'s animation-delay. */
export const revealStyle = (index: number) => ({ "--i": index }) as CSSProperties;

/** Wraps a block so it rises into place, `index` positions it in the cascade. */
export function Reveal({
  index = 0,
  className = "",
  children,
}: {
  index?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`mimi-reveal ${className}`} style={revealStyle(index)}>
      {children}
    </div>
  );
}

/** Translucent card. `interactive` adds the lift/glow hover treatment. */
export function GlassCard({
  children,
  className = "",
  interactive = false,
  style,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      style={style}
      className={`mimi-glass-soft mimi-motion rounded-xl transition-all duration-300 ease-out ${
        interactive
          ? "hover:-translate-y-0.5 hover:border-[var(--mimi-line-strong)] hover:shadow-[0_16px_32px_-22px_rgba(0,0,0,0.9)]"
          : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

/** Micro-caps label above a heading — says what kind of thing follows. */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={`font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--mimi-gold-dim)] ${className}`}
    >
      {children}
    </p>
  );
}

/** Group heading inside a panel body. */
export function SubHeading({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <div className="mb-2.5 flex items-center gap-3">
      <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--mimi-gold)]">
        {children}
      </h3>
      {count !== undefined ? (
        <span className="font-mono text-[10px] text-[var(--mimi-muted)]">{count}</span>
      ) : null}
      <span className="mimi-rule h-px flex-1 bg-[var(--mimi-line)]" />
    </div>
  );
}

/** One line of framing copy at the top of a section body. */
export function SectionIntro({ children }: { children: ReactNode }) {
  return (
    <p className="font-sans text-[13px] leading-relaxed text-[var(--mimi-muted)] sm:text-sm">{children}</p>
  );
}

const TONE_COLOR = {
  gold: "var(--mimi-gold)",
  sage: "var(--mimi-sage)",
  sky: "var(--mimi-sky)",
  clay: "var(--mimi-clay)",
} as const;

export type Tone = keyof typeof TONE_COLOR;

/** Small status pill, e.g. "Current" or a year. */
export function Badge({
  children,
  tone = "gold",
  icon: Icon,
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: IconType;
}) {
  const color = TONE_COLOR[tone];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider"
      style={{ color, borderColor: color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      {Icon ? <Icon size={11} className="shrink-0" /> : null}
      {children}
    </span>
  );
}

/** Tech/keyword tag. Icon nudges up on hover so a badge row feels alive. */
export function Chip({ children, icon: Icon }: { children: ReactNode; icon?: IconType }) {
  return (
    <span className="group/chip mimi-motion inline-flex items-center gap-1.5 rounded-lg border border-[var(--mimi-line)] bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-[var(--mimi-cream)] transition-colors duration-200 hover:border-[var(--mimi-line-strong)] hover:bg-white/[0.08]">
      {Icon ? (
        <Icon
          size={13}
          className="mimi-motion shrink-0 text-[var(--mimi-gold)] transition-transform duration-200 group-hover/chip:-translate-y-px"
        />
      ) : null}
      {children}
    </span>
  );
}

/** Square icon tile, the recurring "this is a thing" marker across sections. */
export function IconTile({
  icon: Icon,
  size = 36,
  tone = "gold",
  className = "",
}: {
  icon: IconType;
  size?: number;
  tone?: Tone;
  className?: string;
}) {
  const color = TONE_COLOR[tone];
  return (
    <span
      className={`mimi-motion flex shrink-0 items-center justify-center rounded-lg border transition-all duration-300 ${className}`}
      style={{
        height: size,
        width: size,
        color,
        borderColor: `color-mix(in srgb, ${color} 28%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 9%, transparent)`,
      }}
    >
      <Icon size={Math.round(size * 0.46)} />
    </span>
  );
}

/** Compact fact tile — a short value over its label. */
export function StatTile({
  icon: Icon,
  value,
  label,
  tone = "gold",
}: {
  icon?: IconType;
  value: ReactNode;
  label: string;
  tone?: Tone;
}) {
  return (
    <GlassCard interactive className="px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        {Icon ? <Icon size={13} style={{ color: TONE_COLOR[tone] }} className="shrink-0" /> : null}
        <Eyebrow>{label}</Eyebrow>
      </div>
      <p className="mt-1 font-sans text-[13px] leading-snug text-[var(--mimi-cream)]">{value}</p>
    </GlassCard>
  );
}

/** True once the component has painted, so a bar/ring can animate from zero. */
function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return mounted;
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

/** Horizontal meter that fills in from zero on mount. */
export function Meter({ value, tone = "sage" }: { value: number; tone?: Tone }) {
  const mounted = useMounted();
  const percent = clampPercent(value);
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-black/30"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="mimi-motion h-full rounded-full transition-[width] duration-[900ms] ease-out"
        style={{
          width: `${mounted ? percent : 0}%`,
          backgroundColor: TONE_COLOR[tone],
          boxShadow: `0 0 12px -2px ${TONE_COLOR[tone]}`,
        }}
      />
    </div>
  );
}

/** Radial meter that sweeps in from zero on mount, with its value in the middle. */
export function Ring({
  value,
  size = 64,
  tone = "gold",
  children,
}: {
  value: number;
  size?: number;
  tone?: Tone;
  children?: ReactNode;
}) {
  const mounted = useMounted();
  const percent = clampPercent(value);
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative shrink-0" style={{ height: size, width: size }}>
      <svg height={size} width={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-white/10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={TONE_COLOR[tone]}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - (mounted ? percent : 0) / 100)}
          className="mimi-motion transition-[stroke-dashoffset] duration-[1100ms] ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">{children}</div>
    </div>
  );
}
