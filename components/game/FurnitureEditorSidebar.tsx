import { useState } from "react";
import { fileStem, SCALE_MIN, SCALE_MAX, SCALE_STEP, type FurnitureSelection } from "@/game/world/furnitureEditorAssets";

/** MIME type GameCanvas's onDrop reads the dragged item's kind back out of. */
export const FURNITURE_DRAG_MIME = "application/x-mimi-furniture-kind";

interface FurnitureEditorSidebarProps {
  /** Every PNG filename in public/assets/game/furniture/, e.g. "catBed.png" — see lib/furnitureAssets.ts. */
  furnitureAssetFiles: string[];
  onPickKind: (kind: string) => void;
  onSave: () => Promise<void>;
  /** Currently selected placed item (id/kind/scale), or null — drives the resize slider below. Kept in sync with wheel-resize too, not just the slider. */
  selectedFurniture: FurnitureSelection | null;
  onResize: (scale: number) => void;
  onClose: () => void;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Dev-only sidebar for placing/moving/resizing furniture. Click a piece to arm it (then click in the house), or drag it straight into the house. Drag to move, R to rotate, scroll or slider to resize, Delete to remove. Collision editing is its own separate tool now — see CollisionEditorPanel.tsx. */
export default function FurnitureEditorSidebar({
  furnitureAssetFiles,
  onPickKind,
  onSave,
  selectedFurniture,
  onResize,
  onClose,
}: FurnitureEditorSidebarProps) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const handleSave = async () => {
    setSaveStatus("saving");
    try {
      await onSave();
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  };

  return (
    <div className="relative z-10 flex w-52 shrink-0 flex-col gap-3 border-l-4 border-[#6f5c9e] bg-[#1e1730] p-3 font-mono text-[#f2ecff] shadow-[-4px_0_0_0_rgba(0,0,0,0.4)]">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#ffe9a8]">Furniture Editor</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close furniture editor"
          className="shrink-0 border-2 border-[#6f5c9e] bg-[#2a2140] px-1.5 leading-none text-[#ffe9a8] hover:bg-[#3a2f4d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe9a8]"
        >
          ×
        </button>
      </div>

      <p className="text-xs leading-snug text-[#c9bfe6]">
        Drag a piece into the house, or click it then click in the house. Drag to move, R to rotate, scroll or slider to resize, Delete to remove.
      </p>
      <div className="grid grid-cols-2 gap-2 overflow-y-auto">
        {furnitureAssetFiles.map((filename) => {
          const kind = fileStem(filename);
          return (
            <button
              key={filename}
              type="button"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(FURNITURE_DRAG_MIME, kind);
                event.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => onPickKind(kind)}
              className="flex flex-col items-center gap-1 border-2 border-[#6f5c9e] bg-[#2a2140] p-2 hover:bg-[#3a2f4d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe9a8]"
            >
              <img src={`/assets/game/furniture/${filename}`} alt={kind} className="h-10 w-10 object-contain" draggable={false} />
              <span className="text-[10px] leading-none text-[#e8ddff]">{kind}</span>
            </button>
          );
        })}
      </div>
      {selectedFurniture && (
        <div className="flex flex-col gap-1 border-2 border-[#6f5c9e] bg-[#2a2140] p-2">
          <span className="text-[10px] uppercase tracking-wide text-[#c9bfe6]">Selected: {selectedFurniture.kind}</span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={SCALE_MIN}
              max={SCALE_MAX}
              step={SCALE_STEP}
              value={selectedFurniture.scale}
              onChange={(event) => onResize(Number(event.target.value))}
              className="w-full accent-[#ffe9a8]"
              aria-label="Resize selected furniture"
            />
            <span className="w-9 shrink-0 text-right text-[10px] text-[#e8ddff]">{selectedFurniture.scale.toFixed(2)}x</span>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={saveStatus === "saving"}
        className="mt-auto border-2 border-[#6f5c9e] bg-[#3a2f4d] px-3 py-2 text-xs font-bold uppercase tracking-wide text-[#ffe9a8] hover:bg-[#4a3d63] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe9a8] disabled:opacity-60"
      >
        {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved!" : saveStatus === "error" ? "Save failed — retry" : "Save layout"}
      </button>
    </div>
  );
}
