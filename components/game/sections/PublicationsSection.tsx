"use client";

import { LuArrowUpRight } from "react-icons/lu";
import { PUBLICATIONS } from "@/game/data/portfolio";
import { Badge, IconTile, Reveal, SectionIntro } from "./theme";

/**
 * Cat Tower -> Publications. Each card is one link: the whole card is the
 * anchor, so a tap anywhere on it opens the paper in a new tab.
 */
export default function PublicationsSection() {
  return (
    <div className="space-y-4">
      <Reveal index={0}>
        <SectionIntro>Published research and datasets. Tap a card to open the original.</SectionIntro>
      </Reveal>

      <ul className="space-y-3">
        {PUBLICATIONS.map(({ title, venue, year, description, href, icon: Icon }, index) => (
          <li key={title}>
            <Reveal index={index + 1}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="mimi-glass-soft mimi-motion group block rounded-xl p-3.5 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-[var(--mimi-line-strong)] hover:shadow-[0_16px_32px_-22px_rgba(0,0,0,0.9)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mimi-gold)] sm:p-4"
              >
                <div className="flex items-start gap-3">
                  <IconTile icon={Icon} size={38} className="group-hover:scale-105" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="mimi-motion font-display text-base leading-snug font-semibold text-[var(--mimi-cream)] transition-colors duration-200 group-hover:text-[var(--mimi-gold)] sm:text-lg">
                        {title}
                      </h3>
                      <LuArrowUpRight
                        size={16}
                        aria-hidden
                        className="mimi-motion mt-1 shrink-0 text-[var(--mimi-muted)] opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100"
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge tone="sky">{venue}</Badge>
                      <Badge tone="clay">{year}</Badge>
                    </div>
                    <p className="mt-2.5 font-sans text-[13px] leading-relaxed text-[var(--mimi-cream)]/85 sm:text-sm">
                      {description}
                    </p>
                  </div>
                </div>
              </a>
            </Reveal>
          </li>
        ))}
      </ul>
    </div>
  );
}
