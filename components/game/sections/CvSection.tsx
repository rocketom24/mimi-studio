"use client";

import { LuDownload, LuExternalLink, LuFileText } from "react-icons/lu";
import { CV_SUMMARY } from "@/game/data/portfolio";
import { Reveal } from "./theme";

/**
 * Dressing Table + Almari -> Quick CV. The real PDF, given proper document
 * chrome: a toolbar naming the file with its actions, then the page itself in
 * a recessed well. Mobile browsers routinely refuse to render a PDF in an
 * iframe, so the download and open-in-tab actions sit above it, not behind it.
 */
export default function CvSection() {
  return (
    <div className="space-y-3">
      <Reveal index={0}>
        <p className="font-sans text-[13px] leading-relaxed text-[var(--mimi-muted)] sm:text-sm">
          {CV_SUMMARY.headline}
        </p>
      </Reveal>

      <Reveal index={1}>
        <div className="mimi-glass-soft overflow-hidden rounded-xl">
          <div className="flex items-center gap-2.5 border-b border-[var(--mimi-line)] px-3 py-2.5">
            <LuFileText size={15} className="shrink-0 text-[var(--mimi-gold)]" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[11px] text-[var(--mimi-cream)]">
                {CV_SUMMARY.name} — CV
              </p>
              <p className="font-mono text-[9px] tracking-[0.18em] text-[var(--mimi-muted)] uppercase">PDF</p>
            </div>
            <a
              href={CV_SUMMARY.downloadHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open CV in a new tab"
              className="mimi-motion flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-[var(--mimi-line)] text-[var(--mimi-muted)] transition-all duration-200 hover:border-[var(--mimi-line-strong)] hover:text-[var(--mimi-gold)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mimi-gold)]"
            >
              <LuExternalLink size={15} />
            </a>
          </div>

          <iframe
            src={CV_SUMMARY.downloadHref}
            title="CV"
            className="h-[clamp(260px,52dvh,560px)] w-full bg-[#0f0c09]"
          />
        </div>
      </Reveal>

      <Reveal index={2}>
        <a
          href={CV_SUMMARY.downloadHref}
          download
          className="group mimi-motion flex touch-manipulation items-center justify-center gap-2 rounded-xl border border-[var(--mimi-gold)] bg-[var(--mimi-gold)]/12 px-4 py-3 font-mono text-[12px] font-bold tracking-[0.12em] text-[var(--mimi-gold)] uppercase transition-all duration-200 hover:bg-[var(--mimi-gold)] hover:text-[var(--mimi-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mimi-gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mimi-ink)]"
        >
          <LuDownload
            size={15}
            className="mimi-motion transition-transform duration-300 group-hover:translate-y-0.5"
          />
          Download full CV
        </a>
      </Reveal>
    </div>
  );
}
