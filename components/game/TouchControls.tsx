"use client";

import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { MovementIntent } from "@/game/types/input";

type Direction = keyof MovementIntent;

interface TouchControlsProps {
  onDirection: (direction: Direction, pressed: boolean) => void;
  onInteract: () => void;
  canInteract: boolean;
  disabled: boolean;
}

const DPAD_BUTTONS: { direction: Direction; label: string; glyph: string; cell: string }[] = [
  { direction: "up", label: "Move up", glyph: "▲", cell: "col-start-2 row-start-1" },
  { direction: "left", label: "Move left", glyph: "◀", cell: "col-start-1 row-start-2" },
  { direction: "right", label: "Move right", glyph: "▶", cell: "col-start-3 row-start-2" },
  { direction: "down", label: "Move down", glyph: "▼", cell: "col-start-2 row-start-3" },
];

const BUTTON_STYLE =
  "flex h-14 w-14 touch-none select-none items-center justify-center rounded border-2 border-[#6f5c9e] bg-[#1e1730]/70 text-lg leading-none text-[#f2ecff] shadow-[2px_2px_0_0_rgba(0,0,0,0.5)] active:translate-y-px active:bg-[#3a2f4d] disabled:opacity-40";

function DpadButton({
  direction,
  glyph,
  label,
  cell,
  disabled,
  onDirection,
}: {
  direction: Direction;
  glyph: string;
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
      {glyph}
    </button>
  );
}

/** HTML overlay D-pad + interact button. Drives TouchInput/InteractionSystem through the callbacks — never touches Phaser objects directly. */
export default function TouchControls({ onDirection, onInteract, canInteract, disabled }: TouchControlsProps) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-20"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <div className="pointer-events-auto absolute bottom-6 left-4 grid grid-cols-3 grid-rows-3 gap-1">
        {DPAD_BUTTONS.map(({ direction, glyph, label, cell }) => (
          <DpadButton
            key={direction}
            direction={direction}
            glyph={glyph}
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
        className={`pointer-events-auto absolute bottom-8 right-5 flex h-14 w-14 touch-none select-none items-center justify-center rounded-full border-2 font-mono text-lg font-bold shadow-[2px_2px_0_0_rgba(0,0,0,0.5)] active:translate-y-px ${
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
