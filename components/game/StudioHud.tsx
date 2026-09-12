"use client";

import { useEffect, useState } from "react";
import { hudFadeOpacity } from "@/lib/hudFade";
import MimiAvatar from "@/components/game/MimiAvatar";

interface StudioHudProps {
  /** From StudioScene's SCENE_EVENTS.ZoomChange — 1 (fitted) to 2.5 (max zoom in). */
  zoomFactor: number;
  isTouchDevice: boolean;
  /** Phone-sized viewport (see useIsCompactViewport) — switches the HUD to its small, collapsible layout. */
  compact: boolean;
  /** True once the player has walked, tapped a D-pad button, clicked furniture, or pressed Interact. */
  hasStartedMoving: boolean;
}

/** Below this opacity a faded panel also stops taking taps, so an invisible guide panel can never swallow a touch meant for the game. */
const INTERACTIVE_OPACITY = 0.2;

// Warm, neutral cozy tone — deliberately not the game world's purple
// (plumDark/purple in theme.tsx) so the HUD reads as its own premium layer.
const PANEL_STYLE = "rounded-md border border-[#ffe9a8]/25 bg-[#221a14]/85 font-mono text-[#f0ead6] shadow-[2px_2px_0_0_rgba(0,0,0,0.4)]";
const ICON_BADGE = "flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-[#ffe9a8]/40 bg-black/20 text-[10px] leading-none text-[#ffe9a8]";

const GUIDE_ENTRIES: [string, string][] = [
  ["TV / Sofa", "Experience"],
  ["Kitchen", "About Me"],
  ["Bookshelf", "Education"],
  ["Phone / Cabinet", "Contact"],
  ["Almari / Dressing Table", "CV"],
  ["Dining Table", "Tech Stack"],
  ["PC", "Projects"],
  ["Bed", "Skills"],
  ["Cat Tower", "Publications"],
  ["Garden", "Currently Learning"],
];

/** Mini, non-interactive echo of TouchControls' D-pad layout — same cross arrangement, just a hint. */
// Plain ASCII for left/right — ◀/▶ are on Unicode's emoji-default list and
// Chrome renders them as colored icons (clashing with the theme) even with
// a text variation selector applied.
const DPAD_HINT_CELLS: { glyph: string; cell: string }[] = [
  { glyph: "▲", cell: "col-start-2 row-start-1" },
  { glyph: "<", cell: "col-start-1 row-start-2" },
  { glyph: ">", cell: "col-start-3 row-start-2" },
  { glyph: "▼", cell: "col-start-2 row-start-3" },
];

export default function StudioHud({ zoomFactor, isTouchDevice, compact, hasStartedMoving }: StudioHudProps) {
  const [toastTimedOut, setToastTimedOut] = useState(false);
  // Compact viewports open the guide only on demand — left expanded it would
  // cover roughly a third of a phone screen, which is the "HUD covers
  // everything" problem. Desktop keeps the always-open panel it had.
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setToastTimedOut(true), 8000);
    return () => window.clearTimeout(timer);
  }, []);

  // Floor 0: these panels are informational, so unlike the touch controls
  // (see TouchControls' CONTROLS_MIN_OPACITY) they may fade away entirely.
  const fadeOpacity = hudFadeOpacity(zoomFactor);
  const toastVisible = !hasStartedMoving && !toastTimedOut;
  const toastOpacity = toastVisible ? fadeOpacity : 0;
  const guideInteractive = fadeOpacity > INTERACTIVE_OPACITY;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 select-none">
      {/* Top-left: always-visible logo */}
      <div
        className={`absolute left-2 top-2 flex items-center gap-1.5 px-1.5 py-1 sm:left-3 sm:top-3 sm:gap-2 sm:px-2 sm:py-1.5 ${PANEL_STYLE}`}
        style={{
          marginLeft: "env(safe-area-inset-left)",
          marginTop: "env(safe-area-inset-top)",
        }}
      >
        <MimiAvatar
          size={compact ? 22 : 36}
          className="shrink-0 rounded-full border border-[#ffe9a8]/60 bg-[#1a1423]"
        />
        <span className={`font-bold tracking-wide text-[#ffe9a8] ${compact ? "text-[10px]" : "text-xs"}`}>Mimi Studio</span>
      </div>

      {/* Top-right: studio guide. Always open on desktop; a tap-to-open
          disclosure on phone-sized screens. Fades (and stops taking taps) on
          zoom-in either way. */}
      <div
        className="absolute right-2 top-2 flex flex-col items-end gap-1 transition-opacity duration-300 sm:right-3 sm:top-3"
        style={{
          opacity: fadeOpacity,
          pointerEvents: guideInteractive ? "auto" : "none",
          marginRight: "env(safe-area-inset-right)",
          marginTop: "env(safe-area-inset-top)",
        }}
      >
        {compact ? (
          <>
            <button
              type="button"
              aria-expanded={guideOpen}
              aria-label="Studio guide"
              onClick={() => setGuideOpen((open) => !open)}
              className={`flex h-7 items-center gap-1 px-2 text-[10px] font-bold text-[#ffe9a8] ${PANEL_STYLE}`}
            >
              Guide<span className="text-[8px] leading-none">{guideOpen ? "▲" : "▼"}</span>
            </button>
            {guideOpen && (
              <div className={`max-h-[45dvh] w-44 overflow-y-auto overscroll-contain px-2 py-1.5 text-[9px] leading-snug ${PANEL_STYLE}`}>
                {GUIDE_ENTRIES.map(([furniture, section]) => (
                  <div key={furniture} className="flex justify-between gap-2">
                    <span className="text-[#f0ead6]/70">{furniture}</span>
                    <span className="text-right text-[#f0ead6]">{section}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className={`w-56 px-3 py-2 text-[10px] leading-relaxed ${PANEL_STYLE}`}>
            <div className="mb-1 font-bold text-[#ffe9a8]">Studio Guide</div>
            {GUIDE_ENTRIES.map(([furniture, section]) => (
              <div key={furniture} className="flex justify-between gap-2">
                <span className="text-[#f0ead6]/70">{furniture}</span>
                <span className="text-right text-[#f0ead6]">{section}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom-left: controls hint, desktop only, fades on zoom-in */}
      {!isTouchDevice && !compact && (
        <div
          className={`absolute bottom-3 left-3 flex flex-col gap-2 px-3 py-2 text-[10px] ${PANEL_STYLE} transition-opacity duration-300`}
          style={{ opacity: fadeOpacity }}
        >
          <div className="font-bold text-[#ffe9a8]">Controls</div>
          <div className="flex items-center gap-2">
            <div className="grid h-13 w-13 grid-cols-3 grid-rows-3 gap-0.5">
              {DPAD_HINT_CELLS.map(({ glyph, cell }) => (
                <div key={glyph} className={`${ICON_BADGE} ${cell}`}>
                  {glyph}
                </div>
              ))}
            </div>
            <span className="text-[#f0ead6]/80">Move</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={ICON_BADGE}>E</div>
            <span className="text-[#f0ead6]/80">Interact</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={ICON_BADGE}>▣</div>
            <span className="text-[#f0ead6]/80">Click Furniture</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={ICON_BADGE}>⇕</div>
            <span className="text-[#f0ead6]/80">Zoom</span>
          </div>
        </div>
      )}

      {/* First-visit hint — pinned to the bottom edge (below the house
          artwork) so it never covers the scene. Narrower than the D-pad/
          Interact gap so it doesn't overlap them, and fades out both on
          zoom-in and as soon as the player starts moving. On compact
          viewports it moves under the logo instead: the bottom edge there
          belongs to the D-pad and the Interact button. */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 text-center transition-opacity duration-500 ${PANEL_STYLE} ${
          compact
            ? // Portrait: under the logo row, clear of the D-pad. Landscape (short):
              // back to the bottom edge — the top strip there sits right on top of
              // the house, and the bottom centre is free between D-pad and Interact.
              "top-12 w-[min(58vw,200px)] px-2 py-1 text-[9px] [@media(max-height:520px)]:top-auto [@media(max-height:520px)]:bottom-2"
            : "bottom-1 w-[min(70vw,260px)] px-3 py-1.5 text-[10px]"
        }`}
        style={{ opacity: toastOpacity }}
      >
        <span className="text-[#ffe9a8]">Explore Mimi Studio</span>
        <span className="text-[#f0ead6]/70">{compact ? " — walk or tap furniture" : " — walk around or click furniture"}</span>
      </div>
    </div>
  );
}
