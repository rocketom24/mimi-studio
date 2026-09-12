"use client";

import { LuMapPin, LuSoup, LuTerminal } from "react-icons/lu";
import { ABOUT_INTRO } from "@/game/data/portfolio";
import MimiAvatar from "@/components/game/MimiAvatar";
import { Eyebrow, Reveal, StatTile } from "./theme";

/**
 * Kitchen -> About Me. Editorial treatment: a masthead with the player's own
 * sprite as the byline photo, a fact strip, then a reading column with a drop
 * cap. Mimi introducing herself, not reading a résumé.
 */
export default function AboutSection() {
  const [firstParagraph, ...restParagraphs] = ABOUT_INTRO.paragraphs;

  return (
    <div className="space-y-5">
      <Reveal index={0}>
        <div className="flex items-center gap-4">
          <div className="relative">
            <span className="absolute -inset-1 rounded-full bg-[var(--mimi-gold)]/15 blur-md" aria-hidden />
            <MimiAvatar
              size={60}
              className="relative rounded-full border border-[var(--mimi-line-strong)] bg-[#1a1423]"
            />
          </div>
          <div className="min-w-0">
            <Eyebrow>Your tour guide</Eyebrow>
            <p className="mt-0.5 font-display text-xl font-semibold leading-tight text-[var(--mimi-cream)] sm:text-2xl">
              {ABOUT_INTRO.name}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-[var(--mimi-muted)]">{ABOUT_INTRO.role}</p>
          </div>
        </div>
      </Reveal>

      <Reveal index={1}>
        <div className="grid gap-2.5 sm:grid-cols-3">
          <StatTile icon={LuMapPin} label="Based in" value={ABOUT_INTRO.location} />
          <StatTile icon={LuTerminal} label="Works" value="Solo, schema to deploy" tone="sage" />
          <StatTile icon={LuSoup} label="Right now" value="Restaurant OS, Milan" tone="clay" />
        </div>
      </Reveal>

      <Reveal index={2}>
        <div className="space-y-3.5 font-sans text-[15px] leading-[1.75] text-[var(--mimi-cream)] sm:text-base">
          <p className="first-letter:float-left first-letter:mt-1 first-letter:mr-2.5 first-letter:font-display first-letter:text-[46px] first-letter:leading-[0.8] first-letter:font-semibold first-letter:text-[var(--mimi-gold)]">
            {firstParagraph}
          </p>
          {restParagraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </Reveal>
    </div>
  );
}
