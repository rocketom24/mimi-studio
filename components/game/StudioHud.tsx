"use client";

import { useEffect, useState } from "react";

interface StudioHudProps {
  /** From StudioScene's SCENE_EVENTS.ZoomChange — 1 (fitted) to 2.5 (max zoom in). */
  zoomFactor: number;
  isTouchDevice: boolean;
  /** True once the player has walked, tapped a D-pad button, clicked furniture, or pressed Interact. */
  hasStartedMoving: boolean;
}

// Matches StudioScene's ZOOM_MIN/ZOOM_MAX (1..2.5) — non-essential HUD panels
// fade out over this range so they never sit on top of furniture once the
// player has zoomed in close to look at it.
const FADE_START = 1.5;
const FADE_END = 2.2;

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

export default function StudioHud({ zoomFactor, isTouchDevice, hasStartedMoving }: StudioHudProps) {
  const [toastTimedOut, setToastTimedOut] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setToastTimedOut(true), 8000);
    return () => window.clearTimeout(timer);
  }, []);

  const fadeAmount = Math.min(1, Math.max(0, (zoomFactor - FADE_START) / (FADE_END - FADE_START)));
  const fadeOpacity = 1 - fadeAmount;
  const toastVisible = !hasStartedMoving && !toastTimedOut;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 select-none">
      {/* Top-left: always-visible logo */}
      <div className={`absolute left-3 top-3 flex items-center gap-2 px-2 py-1.5 ${PANEL_STYLE}`}>
        <div
          className="h-9 w-9 shrink-0 rounded-full border border-[#ffe9a8]/60 bg-[#1a1423]"
          style={{
            backgroundImage: "url(/assets/game/character/mimi-sheet-1.png)",
            backgroundSize: "403.2px 230.4px",
            backgroundPosition: "-15.6px 0px",
          }}
        />
        <span className="text-xs font-bold tracking-wide text-[#ffe9a8]">Mimi Studio</span>
      </div>

      {/* Top-right: studio guide, fades on zoom-in */}
      <div
        className={`absolute right-3 top-3 w-56 px-3 py-2 text-[10px] leading-relaxed transition-opacity duration-300 ${PANEL_STYLE}`}
        style={{ opacity: fadeOpacity }}
      >
        <div className="mb-1 font-bold text-[#ffe9a8]">Studio Guide</div>
        {GUIDE_ENTRIES.map(([furniture, section]) => (
          <div key={furniture} className="flex justify-between gap-2">
            <span className="text-[#f0ead6]/70">{furniture}</span>
            <span className="text-right text-[#f0ead6]">{section}</span>
          </div>
        ))}
      </div>

      {/* Bottom-left: controls hint, desktop only, fades on zoom-in */}
      {!isTouchDevice && (
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

      {/* First-visit hint — parked well above the bottom-left/bottom-right
          panels (Controls, and the touch D-pad + Interact button) so it never
          overlaps them regardless of viewport width. */}
      <div
        className={`absolute bottom-52 left-1/2 w-[min(85vw,280px)] -translate-x-1/2 px-3 py-1.5 text-center text-[10px] transition-opacity duration-500 ${PANEL_STYLE}`}
        style={{ opacity: toastVisible ? 1 : 0 }}
      >
        <span className="text-[#ffe9a8]">Explore Mimi Studio</span>
        <span className="text-[#f0ead6]/70"> — walk around or click furniture</span>
      </div>
    </div>
  );
}
