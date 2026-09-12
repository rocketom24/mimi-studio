"use client";

import { EDUCATION } from "@/game/data/portfolio";
import { Badge, Eyebrow, GlassCard, Reveal, Ring, SectionIntro } from "./theme";

/**
 * Reads "CGPA: 3.48 / 4.00" as a ratio worth drawing a ring for. A grade with
 * no stated maximum ("GPA: 5.00") gets no ring on purpose — the denominator
 * isn't in the data, so inventing one would put a wrong number on screen.
 */
function parseGrade(detail: string): { label: string; score: string; percent: number | null } {
  const [rawLabel, rawValue] = detail.split(":");
  const label = rawValue ? rawLabel.trim() : "Result";
  const value = (rawValue ?? rawLabel).trim();
  const ratio = value.match(/^([\d.]+)\s*\/\s*([\d.]+)$/);
  if (!ratio) return { label, score: value, percent: null };
  const [, scored, total] = ratio;
  return { label, score: scored, percent: (Number(scored) / Number(total)) * 100 };
}

/**
 * Bookshelf -> Education. Credential cards stacked like spines on the shelf
 * they came from: a warm spine edge on the left, the grade rendered as a ring
 * when the data states a maximum and as a plain figure when it doesn't.
 */
export default function EducationSection() {
  return (
    <div className="space-y-4">
      <Reveal index={0}>
        <SectionIntro>Formal education, newest first.</SectionIntro>
      </Reveal>

      <div className="space-y-3">
        {EDUCATION.map((entry, index) => {
          const grade = parseGrade(entry.detail);
          return (
            <Reveal key={entry.school} index={index + 1}>
              <GlassCard interactive className="group relative overflow-hidden pl-4">
                {/* The spine: thickens on hover, like pulling one book forward. */}
                <span
                  className="mimi-motion absolute inset-y-0 left-0 w-1 bg-[var(--mimi-gold-dim)] transition-all duration-300 group-hover:w-1.5 group-hover:bg-[var(--mimi-gold)]"
                  aria-hidden
                />
                <div className="flex items-center gap-4 py-3.5 pr-4 sm:py-4 sm:pr-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-base font-semibold leading-snug text-[var(--mimi-cream)] sm:text-lg">
                        {entry.school}
                      </h3>
                      {entry.dates ? <Badge tone="clay">{entry.dates.replace("Graduated: ", "")}</Badge> : null}
                    </div>
                    {entry.credential ? (
                      <p className="mt-1 font-sans text-[13px] leading-snug text-[var(--mimi-muted)] sm:text-sm">
                        {entry.credential}
                      </p>
                    ) : null}
                    <Eyebrow className="mt-2">{grade.label}</Eyebrow>
                  </div>

                  {grade.percent === null ? (
                    <p className="shrink-0 font-display text-3xl font-semibold leading-none text-[var(--mimi-gold)] sm:text-4xl">
                      {grade.score}
                    </p>
                  ) : (
                    <Ring value={grade.percent} size={62}>
                      <span className="font-display text-base font-semibold text-[var(--mimi-gold)]">
                        {grade.score}
                      </span>
                    </Ring>
                  )}
                </div>
              </GlassCard>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}
