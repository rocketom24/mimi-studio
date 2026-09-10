import { useState } from "react";
import type { CollisionEditInfo, CollisionTool } from "@/game/world/furnitureEditor";

interface CollisionEditorPanelProps {
  onClose: () => void;
  tool: CollisionTool;
  onSetTool: (tool: CollisionTool) => void;
  onFinishPolygon: () => void;
  onDeleteSelectedShape: () => void;
  onClearAllCollision: () => void;
  onUndo: () => void;
  onRedo: () => void;
  /** Shape count/selection/undo-redo status for whichever placed item is currently selected, or null before anything's been clicked — see FurnitureEditor.onCollisionShapesChange. */
  collisionEditInfo: CollisionEditInfo | null;
  onSave: () => Promise<void>;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

const TOOL_BUTTON_BASE =
  "flex-1 border-2 px-2 py-2 text-[10px] font-bold uppercase tracking-wide focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe9a8]";
const TOOL_BUTTON_ACTIVE = "border-[#8fd0ff] bg-[#2f4a5c] text-[#d6f0ff]";
const TOOL_BUTTON_INACTIVE = "border-[#6f5c9e] bg-[#2a2140] text-[#c9bfe6] hover:bg-[#3a2f4d]";

/**
 * Dev-only panel for the Collision Editor — a separate tool from furniture
 * placement (see FurnitureEditorSidebar), fully independent so editing
 * collision can never drag/resize/rotate a placed piece. No asset picker:
 * click any placed piece directly in the house to select its collision
 * (drawn or not); click any already-drawn shape anywhere in the house to
 * select and edit it. See game/world/furnitureEditor.ts's
 * handleCollisionPointerDown for the click-priority rules.
 */
export default function CollisionEditorPanel({
  onClose,
  tool,
  onSetTool,
  onFinishPolygon,
  onDeleteSelectedShape,
  onClearAllCollision,
  onUndo,
  onRedo,
  collisionEditInfo,
  onSave,
}: CollisionEditorPanelProps) {
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
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#ffe9a8]">Collision Editor</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close collision editor"
          className="shrink-0 border-2 border-[#6f5c9e] bg-[#2a2140] px-1.5 leading-none text-[#ffe9a8] hover:bg-[#3a2f4d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe9a8]"
        >
          ×
        </button>
      </div>

      <p className="text-xs leading-snug text-[#c9bfe6]">
        Click any piece of furniture in the house to select its collision, or click an already-drawn shape to edit it. Drag inside a shape to move it,
        drag a dot to resize it.
      </p>

      <span className="text-[10px] uppercase tracking-wide text-[#c9bfe6]">
        {collisionEditInfo
          ? `Editing: ${collisionEditInfo.kind} (${collisionEditInfo.shapeCount} shape${collisionEditInfo.shapeCount === 1 ? "" : "s"})`
          : "Nothing selected — click a piece"}
      </span>

      <div className="flex gap-1">
        <button type="button" onClick={() => onSetTool("select")} className={`${TOOL_BUTTON_BASE} ${tool === "select" ? TOOL_BUTTON_ACTIVE : TOOL_BUTTON_INACTIVE}`}>
          Select/Edit
        </button>
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onSetTool("rect")}
          disabled={!collisionEditInfo}
          className={`${TOOL_BUTTON_BASE} ${tool === "rect" ? TOOL_BUTTON_ACTIVE : TOOL_BUTTON_INACTIVE} disabled:opacity-40`}
        >
          Draw Rectangle
        </button>
        <button
          type="button"
          onClick={() => onSetTool("poly")}
          disabled={!collisionEditInfo}
          className={`${TOOL_BUTTON_BASE} ${tool === "poly" ? TOOL_BUTTON_ACTIVE : TOOL_BUTTON_INACTIVE} disabled:opacity-40`}
        >
          Draw Polygon
        </button>
      </div>
      {tool === "poly" && (
        <button
          type="button"
          onClick={onFinishPolygon}
          className="border-2 border-[#6f5c9e] bg-[#2a2140] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#ffe9a8] hover:bg-[#3a2f4d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe9a8]"
        >
          Finish Polygon
        </button>
      )}

      <div className="flex gap-1">
        <button
          type="button"
          onClick={onUndo}
          disabled={!collisionEditInfo?.canUndo}
          className="flex-1 border-2 border-[#6f5c9e] bg-[#2a2140] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#ffe9a8] hover:bg-[#3a2f4d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe9a8] disabled:opacity-40"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!collisionEditInfo?.canRedo}
          className="flex-1 border-2 border-[#6f5c9e] bg-[#2a2140] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#ffe9a8] hover:bg-[#3a2f4d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe9a8] disabled:opacity-40"
        >
          Redo
        </button>
      </div>

      <button
        type="button"
        onClick={onDeleteSelectedShape}
        disabled={!collisionEditInfo?.hasSelection}
        className="border-2 border-[#6f5c9e] bg-[#2a2140] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#ffe9a8] hover:bg-[#3a2f4d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe9a8] disabled:opacity-40"
      >
        Delete Selected Shape
      </button>
      <button
        type="button"
        onClick={onClearAllCollision}
        disabled={!collisionEditInfo || collisionEditInfo.shapeCount === 0}
        className="border-2 border-[#e08a8a] bg-[#2a2140] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#ffb3b3] hover:bg-[#4a2f2f] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffb3b3] disabled:opacity-40"
      >
        Clear All
      </button>

      <button
        type="button"
        onClick={handleSave}
        disabled={saveStatus === "saving"}
        className="mt-auto border-2 border-[#6f5c9e] bg-[#3a2f4d] px-3 py-2 text-xs font-bold uppercase tracking-wide text-[#ffe9a8] hover:bg-[#4a3d63] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe9a8] disabled:opacity-60"
      >
        {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved!" : saveStatus === "error" ? "Save failed — retry" : "Save"}
      </button>
    </div>
  );
}
