"use client";

import { useEffect, useState } from "react";
import { LuX } from "react-icons/lu";
import { SECTION_TITLES, type PortfolioSectionId } from "@/game/data/portfolio";
import { SECTION_COMPONENTS } from "@/components/game/sections";
import { useIsCompactViewport } from "@/lib/useIsTouchDevice";

const TRANSITION_MS = 200;

interface PortfolioPanelProps {
  sectionId: PortfolioSectionId | null;
  onClose: () => void;
}

/**
 * Cozy pixel-style overlay shell; each section owns its own body layout. ESC
 * also closes it, handled in Phaser.
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
  const SectionBody = SECTION_COMPONENTS[renderedSectionId];

  return (
    <div
      // On a phone the panel is nearly full-bleed, so the HUD (z-30) and the
      // touch controls (z-20) land on top of the panel's own header, close
      // button included — z-40 puts it above both. Left at z-10 on larger
      // viewports, where the panel is a small centred card and the desktop
      // layering is unchanged on purpose.
      className={`absolute inset-0 ${isCompact ? "z-40" : "z-10"} flex items-center justify-center bg-black/70 p-3 transition-opacity duration-200 sm:p-4 ${entered ? "opacity-100" : "opacity-0"}`}
    >
      <div
        className={`flex max-h-[88dvh] w-full max-w-[calc(100vw-1.5rem)] flex-col border-4 border-[#6f5c9e] bg-[#1e1730] text-[#f2ecff] shadow-[6px_6px_0_0_rgba(0,0,0,0.5)] transition-all duration-200 sm:max-h-[90vh] sm:max-w-xl md:max-w-2xl ${entered ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
      >
        <div className="flex items-start justify-between gap-3 border-b-2 border-[#6f5c9e]/40 px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
          <h2 className="font-mono text-lg font-bold uppercase tracking-wide text-[#ffe9a8] sm:text-2xl">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full border-2 border-[#6f5c9e] text-[#e8ddff] hover:border-[#ffe9a8] hover:bg-[#3a2f4d] hover:text-[#ffe9a8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe9a8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1e1730] sm:h-9 sm:w-9"
          >
            <LuX size={18} />
          </button>
        </div>
        {/* overscroll-contain: a flick that hits the end of this list must not
            chain into the page (address-bar bounce) behind the panel. */}
        <div className="overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 sm:py-5">
          <SectionBody />
        </div>
      </div>
    </div>
  );
}
