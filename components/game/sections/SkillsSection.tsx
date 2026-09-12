"use client";

import { SKILLS, SKILL_GROUPS } from "@/game/data/portfolio";
import { IconTile, Reveal, SectionIntro, SubHeading, revealStyle } from "./theme";

const GROUP_TONE = {
  Build: "gold",
  "Connect & Secure": "sky",
  "Refine & Deliver": "sage",
} as const;

/**
 * Bed -> Skills. What I can do, distinct from Tech Stack's what I use, so it
 * groups by the part of the job rather than filtering: three stages, each with
 * its own accent, all on screen at once.
 */
export default function SkillsSection() {
  return (
    <div className="space-y-5">
      <Reveal index={0}>
        <SectionIntro>The things I actually do with the stack, grouped by where they land in a build.</SectionIntro>
      </Reveal>

      {SKILL_GROUPS.map((group, groupIndex) => {
        const entries = SKILLS.filter((skill) => skill.group === group);
        const tone = GROUP_TONE[group];
        return (
          <Reveal key={group} index={groupIndex + 1}>
            <section>
              <SubHeading count={entries.length}>{group}</SubHeading>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {entries.map(({ label, description, icon: Icon }, index) => (
                  <div
                    key={label}
                    style={revealStyle(groupIndex * 3 + index + 2)}
                    className="mimi-reveal mimi-glass-soft mimi-motion group relative flex items-start gap-3 overflow-hidden rounded-xl px-3 py-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--mimi-line-strong)] hover:shadow-[0_16px_30px_-20px_rgba(0,0,0,0.9)]"
                  >
                    {/* Accent wipes in from the left edge on hover. */}
                    <span
                      className="mimi-motion absolute inset-y-0 left-0 w-0.5 origin-top scale-y-0 transition-transform duration-300 group-hover:scale-y-100"
                      style={{ backgroundColor: `var(--mimi-${tone})` }}
                      aria-hidden
                    />
                    <IconTile icon={Icon} size={34} tone={tone} className="group-hover:scale-105" />
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] leading-snug font-semibold text-[var(--mimi-cream)]">
                        {label}
                      </p>
                      <p className="mt-1 font-sans text-[12px] leading-snug text-[var(--mimi-muted)]">
                        {description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </Reveal>
        );
      })}
    </div>
  );
}
