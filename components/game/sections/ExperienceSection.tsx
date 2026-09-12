"use client";

import { LuCalendar, LuMapPin } from "react-icons/lu";
import { EXPERIENCE } from "@/game/data/portfolio";
import { Badge, GlassCard, Eyebrow, Reveal, SectionIntro } from "./theme";

/**
 * TV + Sofa -> Experience. A timeline: the rail is the structure, because the
 * content genuinely is a sequence in time. Each node's marker glows on hover
 * along with its card, so the rail reads as one connected object.
 */
export default function ExperienceSection() {
  return (
    <div className="space-y-4">
      <Reveal index={0}>
        <SectionIntro>Where the last few years went, most recent first.</SectionIntro>
      </Reveal>

      <div className="relative pl-6 sm:pl-7">
        {/* The rail itself — fades out past the final entry rather than
            stopping dead, so the timeline reads as ongoing. */}
        <span
          className="absolute top-2 bottom-2 left-[5px] w-px bg-gradient-to-b from-[var(--mimi-line-strong)] via-[var(--mimi-line)] to-transparent"
          aria-hidden
        />

        <ol className="space-y-4">
          {EXPERIENCE.map((entry, index) => {
            const isCurrent = entry.dates.includes("Present");
            return (
              <li key={entry.company}>
                <Reveal index={index + 1}>
                  <div className="group relative">
                    <span
                      className="mimi-motion absolute top-[1.15rem] -left-6 h-2.5 w-2.5 rounded-full border-2 transition-all duration-300 group-hover:scale-125 sm:-left-7"
                      style={{
                        borderColor: isCurrent ? "var(--mimi-sage)" : "var(--mimi-gold-dim)",
                        backgroundColor: "var(--mimi-ink)",
                        boxShadow: isCurrent ? "0 0 12px -1px var(--mimi-sage)" : undefined,
                      }}
                      aria-hidden
                    />
                    <GlassCard interactive className="px-4 py-3.5 sm:px-5 sm:py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Eyebrow>{entry.company}</Eyebrow>
                          <h3 className="mt-0.5 font-display text-lg font-semibold leading-snug text-[var(--mimi-cream)]">
                            {entry.role}
                          </h3>
                        </div>
                        {isCurrent ? <Badge tone="sage">Current</Badge> : null}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-[var(--mimi-muted)]">
                        <span className="flex items-center gap-1.5">
                          <LuCalendar size={12} className="shrink-0" />
                          {entry.dates}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <LuMapPin size={12} className="shrink-0" />
                          {entry.location}
                        </span>
                      </div>

                      <ul className="mt-3 space-y-2 font-sans text-[13px] leading-relaxed text-[var(--mimi-cream)]/90 sm:text-sm">
                        {entry.bullets.map((bullet) => (
                          <li key={bullet} className="group/row flex gap-2.5">
                            <span
                              className="mimi-motion mt-[0.55rem] h-px w-3 shrink-0 bg-[var(--mimi-gold-dim)] transition-all duration-300 group-hover/row:w-5 group-hover/row:bg-[var(--mimi-gold)]"
                              aria-hidden
                            />
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    </GlassCard>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
