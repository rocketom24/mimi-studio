"use client";

import { CURRENTLY_LEARNING } from "@/game/data/portfolio";
import { Eyebrow, GlassCard, Meter, Reveal, Ring, SectionIntro } from "./theme";

const TONES = ["sage", "sky", "clay"] as const;

/**
 * Garden -> Currently Learning. Rings rather than a list, because the point of
 * this section is the distance still to go: each one sweeps up from zero on
 * open, so the panel shows growth happening instead of stating it.
 */
export default function LearningSection() {
  return (
    <div className="space-y-4">
      <Reveal index={0}>
        <SectionIntro>Still growing. Here&rsquo;s what&rsquo;s in the ground right now.</SectionIntro>
      </Reveal>

      <div className="space-y-3">
        {CURRENTLY_LEARNING.map((item, index) => {
          const tone = TONES[index % TONES.length];
          return (
            <Reveal key={item.label} index={index + 1}>
              <GlassCard interactive className="group flex items-center gap-4 px-4 py-4">
                <Ring value={item.progress} size={58} tone={tone}>
                  <item.icon
                    size={17}
                    className="mimi-motion transition-transform duration-300 group-hover:scale-110"
                    style={{ color: `var(--mimi-${tone})` }}
                  />
                </Ring>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-display text-base leading-snug font-semibold text-[var(--mimi-cream)]">
                      {item.label}
                    </h3>
                    <span
                      className="shrink-0 font-mono text-[11px] tabular-nums"
                      style={{ color: `var(--mimi-${tone})` }}
                    >
                      {item.progress}%
                    </span>
                  </div>
                  <p className="mt-1 mb-2.5 font-sans text-[12.5px] leading-snug text-[var(--mimi-muted)]">
                    {item.note}
                  </p>
                  <Meter value={item.progress} tone={tone} />
                </div>
              </GlassCard>
            </Reveal>
          );
        })}
      </div>

      <Reveal index={CURRENTLY_LEARNING.length + 1}>
        <Eyebrow>Progress is self-assessed, not certified</Eyebrow>
      </Reveal>
    </div>
  );
}
