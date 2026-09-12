"use client";

import { useEffect, useState } from "react";
import { LuX } from "react-icons/lu";
import { SECTION_SOURCES, SECTION_TITLES, type PortfolioSectionId } from "@/game/data/portfolio";
import { SECTION_COMPONENTS } from "@/components/game/sections";
import { useIsCompactViewport } from "@/lib/useIsTouchDevice";

const TRANSITION_MS = 260;

interface PortfolioPanelProps {
  sectionId: PortfolioSectionId | null;
  onClose: () => void;
}

/**
 * Glass shell for every portfolio section: a warm, lamp-lit card floating over
 * the blurred apartment. Each section owns its own body layout — the shell only
 * supplies the frame, the provenance eyebrow and the scroll area. ESC also
 * closes it, handled in Phaser.
 *
 * Stays mounted (rendering the last real sectionId) for TRANSITION_MS after
 * the prop clears to null, so the fade/scale-out below can actually finish
 * before the DOM node disappears — sectionId itself flips instantly, this is
 * purely a rendering lag for the close animation.
 */
export default function PortfolioPanel({ sectionId, onClose }: PortfolioPanelProps) {
  const [renderedSectionId, setRenderedSectionId] = useState(sectionId);
  const [entered, setEntered] = useState(false);
  const isCompact = useIsCompactViewport();

  useEffect(() => {
    if (sectionId) {
      setRenderedSectionId(sectionId);
      const raf = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(raf);
    }
    setEntered(false);
    const timer = window.setTimeout(() => setRenderedSectionId(null), TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [sectionId]);

  if (!renderedSectionId) return null;
  const title = SECTION_TITLES[renderedSectionId];
  const source = SECTION_SOURCES[renderedSectionId];
  const SectionBody = SECTION_COMPONENTS[renderedSectionId];

  return (
    <div
      // On a phone the panel is nearly full-bleed, so the HUD (z-30) and the
      // touch controls (z-20) land on top of the panel's own header, close
      // button included — z-40 puts it above both. Left at z-10 on larger
      // viewports, where the panel is a small centred card and the desktop
      // layering is unchanged on purpose.
      className={`absolute inset-0 ${isCompact ? "z-40" : "z-10"} flex items-center justify-center bg-[#0b0806]/62 p-3 backdrop-blur-[3px] transition-opacity duration-250 sm:p-6 ${entered ? "opacity-100" : "opacity-0"}`}
    >
      <div
        // `key` restarts every child's staggered reveal when the visitor walks
        // from one piece of furniture to the next without closing the panel.
        key={renderedSectionId}
        className={`mimi-glass mimi-lamp relative flex max-h-[88dvh] w-full max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl transition-all duration-250 ease-out sm:max-h-[90vh] sm:max-w-xl md:max-w-3xl ${
          entered ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.98] opacity-0"
        }`}
      >
        <header className="relative flex items-start justify-between gap-3 px-5 pt-4 pb-3.5 sm:px-7 sm:pt-6 sm:pb-5">
          <div className="mimi-reveal min-w-0">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--mimi-gold-dim)]">
              Opened from the {source}
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold leading-tight text-[var(--mimi-gold)] sm:text-[32px]">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="group mimi-motion flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full border border-[var(--mimi-line)] bg-white/[0.04] text-[var(--mimi-cream)] transition-all duration-200 hover:border-[var(--mimi-line-strong)] hover:bg-[var(--mimi-gold)]/15 hover:text-[var(--mimi-gold)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mimi-gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mimi-ink)] sm:h-10 sm:w-10"
          >
            <LuX
              size={18}
              className="mimi-motion transition-transform duration-300 group-hover:rotate-90"
            />
          </button>
        </header>

        <div className="mimi-rule mx-5 h-px bg-gradient-to-r from-[var(--mimi-line-strong)] via-[var(--mimi-line)] to-transparent sm:mx-7" />

        {/* overscroll-contain: a flick that hits the end of this list must not
            chain into the page (address-bar bounce) behind the panel. */}
        <div className="mimi-scroll relative overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-6">
          <SectionBody />
        </div>
      </div>
    </div>
  );
}
