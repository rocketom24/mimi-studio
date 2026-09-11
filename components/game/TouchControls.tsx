"use client";

import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { MovementIntent } from "@/game/types/input";
import { hudFadeOpacity } from "@/lib/hudFade";

type Direction = keyof MovementIntent;

interface TouchControlsProps {
  onDirection: (direction: Direction, pressed: boolean) => void;
  onInteract: () => void;
  canInteract: boolean;
  disabled: boolean;
  /** From StudioScene's SCENE_EVENTS.ZoomChange — 1 (fitted) to 2.5 (max zoom in). */
  zoomFactor: number;
}

// Zoomed all the way in, the controls recede to a ghost so they stop covering
// the furniture being inspected — but never below this, and never with
// pointer-events off: the D-pad IS how a phone player moves, so it has to stay
// readable and tappable at every zoom level.
const CONTROLS_MIN_OPACITY = 0.35;

// Every arrow is the SAME ▲ glyph, rotated. ◀/▶ are on Unicode's
// emoji-default list and Chrome renders them as colored icons (the same
// problem StudioHud's D-pad hint documents), which on a phone showed up as two
// blue emoji sitting among two cream-white triangles.
const DPAD_BUTTONS: { direction: Direction; label: string; rotation: string; cell: string }[] = [
  { direction: "up", label: "Move up", rotation: "rotate-0", cell: "col-start-2 row-start-1" },
  { direction: "left", label: "Move left", rotation: "-rotate-90", cell: "col-start-1 row-start-2" },
  { direction: "right", label: "Move right", rotation: "rotate-90", cell: "col-start-3 row-start-2" },
  { direction: "down", label: "Move down", rotation: "rotate-180", cell: "col-start-2 row-start-3" },
];

// Shrinks on short viewports (landscape phones, ~390px tall) so a 3-row D-pad
// plus its bottom offset can't eat half the screen height. 44px is still at or
// above the minimum comfortable touch target.
const BUTTON_SIZE = "h-12 w-12 min-[400px]:h-14 min-[400px]:w-14 [@media(max-height:520px)]:h-11 [@media(max-height:520px)]:w-11";

const BUTTON_STYLE =
  `flex ${BUTTON_SIZE} touch-none select-none items-center justify-center rounded border-2 border-[#6f5c9e] bg-[#1e1730]/70 text-lg leading-none text-[#f2ecff] shadow-[2px_2px_0_0_rgba(0,0,0,0.5)] active:translate-y-px active:bg-[#3a2f4d] disabled:opacity-40`;

function DpadButton({
  direction,
  rotation,
  label,
  cell,
  disabled,
  onDirection,
}: {
  direction: Direction;
  rotation: string;
  label: string;
  cell: string;
  disabled: boolean;
  onDirection: (direction: Direction, pressed: boolean) => void;
}) {
  const pointerIdRef = useRef<number | null>(null);

  const release = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    pointerIdRef.current = null;
    onDirection(direction, false);
  };

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className={`${BUTTON_STYLE} ${cell}`}
      onPointerDown={(e) => {
        e.preventDefault();
        pointerIdRef.current = e.pointerId;
        onDirection(direction, true);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
    >
      <span className={`block ${rotation}`}>▲</span>
    </button>
  );
}

/** HTML overlay D-pad + interact button. Drives TouchInput/InteractionSystem/StudioScene through the callbacks — never touches Phaser objects directly. */
export default function TouchControls({ onDirection, onInteract, canInteract, disabled, zoomFactor }: TouchControlsProps) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 transition-opacity duration-300"
      style={{
        opacity: hudFadeOpacity(zoomFactor, CONTROLS_MIN_OPACITY),
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <div className="pointer-events-auto absolute bottom-4 left-3 grid grid-cols-3 grid-rows-3 gap-1 sm:bottom-6 sm:left-4 [@media(max-height:520px)]:bottom-2 [@media(max-height:520px)]:left-2">
        {DPAD_BUTTONS.map(({ direction, rotation, label, cell }) => (
          <DpadButton
            key={direction}
            direction={direction}
            rotation={rotation}
            label={label}
            cell={cell}
            disabled={disabled}
            onDirection={onDirection}
          />
        ))}
      </div>

      <button
        type="button"
        aria-label="Interact"
        disabled={disabled || !canInteract}
        onClick={onInteract}
        className={`pointer-events-auto absolute bottom-6 right-4 flex ${BUTTON_SIZE} touch-none select-none items-center justify-center rounded-full border-2 font-mono text-lg font-bold shadow-[2px_2px_0_0_rgba(0,0,0,0.5)] active:translate-y-px sm:bottom-8 sm:right-5 [@media(max-height:520px)]:bottom-3 [@media(max-height:520px)]:right-3 ${
          canInteract && !disabled
            ? "border-[#ffe9a8] bg-[#6f5c9e] text-[#ffe9a8]"
            : "border-[#6f5c9e]/50 bg-[#1e1730]/70 text-[#f2ecff]/40"
        }`}
      >
        E
      </button>
    </div>
  );
}
