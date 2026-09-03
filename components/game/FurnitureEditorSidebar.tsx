import { fileStem } from "@/game/world/furnitureEditorAssets";

interface FurnitureEditorSidebarProps {
  /** Every PNG filename in public/furniture/, e.g. "catBed.png" — see lib/furnitureAssets.ts. */
  furnitureAssetFiles: string[];
  onPickKind: (kind: string) => void;
  onSave: () => void;
}

/** Dev-only sidebar for Furniture Editor Mode: click a piece to arm it, then click in the house to drop it. */
export default function FurnitureEditorSidebar({ furnitureAssetFiles, onPickKind, onSave }: FurnitureEditorSidebarProps) {
  return (
    <div className="absolute inset-y-0 right-0 z-10 flex w-48 flex-col gap-3 border-l-4 border-[#6f5c9e] bg-[#1e1730] p-3 font-mono text-[#f2ecff] shadow-[-4px_0_0_0_rgba(0,0,0,0.4)]">
      <h2 className="text-sm font-bold uppercase tracking-wide text-[#ffe9a8]">Furniture Editor</h2>
      <p className="text-xs leading-snug text-[#c9bfe6]">
        Click a piece, then click in the house to place it. Drag to move, R to rotate, scroll to resize, Delete to remove.
      </p>
      <div className="grid grid-cols-2 gap-2 overflow-y-auto">
        {furnitureAssetFiles.map((filename) => {
          const kind = fileStem(filename);
          return (
            <button
              key={filename}
              type="button"
              onClick={() => onPickKind(kind)}
              className="flex flex-col items-center gap-1 border-2 border-[#6f5c9e] bg-[#2a2140] p-2 hover:bg-[#3a2f4d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe9a8]"
            >
              <img src={`/furniture/${filename}`} alt={kind} className="h-10 w-10 object-contain" />
              <span className="text-[10px] leading-none text-[#e8ddff]">{kind}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onSave}
        className="mt-auto border-2 border-[#6f5c9e] bg-[#3a2f4d] px-3 py-2 text-xs font-bold uppercase tracking-wide text-[#ffe9a8] hover:bg-[#4a3d63] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe9a8]"
      >
        Save layout
      </button>
    </div>
  );
}
