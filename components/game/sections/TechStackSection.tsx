"use client";

import { useMemo, useState } from "react";
import { TECH_STACK } from "@/game/data/portfolio";
import { Reveal, SectionIntro, revealStyle } from "./theme";

const ALL = "Everything";

/**
 * Dining Table -> Tech Stack. A filter, because the stack is a set you narrow
 * rather than a sequence you read: pick a category and the grid re-deals with
 * a fresh stagger. Real logos carry the recognition, names only confirm them.
 */
export default function TechStackSection() {
  const [active, setActive] = useState<string>(ALL);

  const visible = useMemo(
    () => (active === ALL ? TECH_STACK.flatMap((group) => group.items) : (TECH_STACK.find((group) => group.category === active)?.items ?? [])),
    [active],
  );

  const filters = [
    { label: ALL, count: TECH_STACK.reduce((total, group) => total + group.items.length, 0) },
    ...TECH_STACK.map((group) => ({ label: group.category, count: group.items.length })),
  ];

  return (
    <div className="space-y-4">
      <Reveal index={0}>
        <SectionIntro>What I build with day to day. Filter it down to one area, or see the lot.</SectionIntro>
      </Reveal>

      <Reveal index={1}>
        {/* Wraps once there's room for a second line; below that it scrolls
            sideways, with the -mx/px pair letting it bleed to the panel edge. */}
        <div className="mimi-rail -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
          {filters.map(({ label, count }) => {
            const isActive = active === label;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setActive(label)}
                aria-pressed={isActive}
                className={`mimi-motion flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[11px] whitespace-nowrap transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mimi-gold)] ${
                  isActive
                    ? "border-[var(--mimi-gold)] bg-[var(--mimi-gold)]/15 text-[var(--mimi-gold)]"
                    : "border-[var(--mimi-line)] text-[var(--mimi-muted)] hover:border-[var(--mimi-line-strong)] hover:text-[var(--mimi-cream)]"
                }`}
              >
                {label}
                <span className={isActive ? "text-[var(--mimi-gold)]/70" : "text-[var(--mimi-muted)]/60"}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </Reveal>

      {/* Keyed on the filter so every change replays the tile cascade. */}
      <div key={active} className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {visible.map(({ name, icon: Icon }, index) => (
          <div
            key={name}
            className="mimi-reveal mimi-glass-soft mimi-motion group flex flex-col items-center gap-2 rounded-xl px-2 py-3.5 text-center transition-all duration-300 hover:-translate-y-1 hover:border-[var(--mimi-line-strong)] hover:shadow-[0_16px_30px_-20px_rgba(0,0,0,0.9)]"
            style={revealStyle(index)}
          >
            <Icon
              size={24}
              className="mimi-motion text-[var(--mimi-gold-dim)] transition-all duration-300 group-hover:scale-110 group-hover:text-[var(--mimi-gold)]"
            />
            <span className="font-mono text-[10px] leading-tight text-[var(--mimi-muted)] transition-colors duration-300 group-hover:text-[var(--mimi-cream)]">
              {name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
