"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import type Phaser from "phaser";
import type { StudioScene } from "@/game/scenes/StudioScene";
import type { CollisionEditInfo, CollisionTool } from "@/game/world/furnitureEditor";
import { GAME_EVENTS, SCENE_EVENTS } from "@/game/types/interaction";
import type { Interactable } from "@/game/types/interaction";
import type { MovementIntent } from "@/game/types/input";
import type { PortfolioSectionId } from "@/game/data/portfolio";
import PortfolioPanel from "@/components/game/PortfolioPanel";
import TouchControls from "@/components/game/TouchControls";
import FurnitureEditorSidebar, { FURNITURE_DRAG_MIME } from "@/components/game/FurnitureEditorSidebar";
import CollisionEditorPanel from "@/components/game/CollisionEditorPanel";
import { useIsTouchDevice } from "@/lib/useIsTouchDevice";
import { FURNITURE_ASSET_FILES_REGISTRY_KEY, type FurnitureSelection } from "@/game/world/furnitureEditorAssets";

/** Furniture Editor Mode is a dev-only tool — never rendered in a production build. */
const FURNITURE_EDITOR_AVAILABLE = process.env.NODE_ENV !== "production";

interface GameCanvasProps {
  /** Every PNG filename in public/assets/game/furniture/, discovered server-side by app/page.tsx — see lib/furnitureAssets.ts. */
  furnitureAssetFiles: string[];
}

export default function GameCanvas({ furnitureAssetFiles }: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<StudioScene | null>(null);
  const [panelId, setPanelId] = useState<PortfolioSectionId | null>(null);
  const [canInteract, setCanInteract] = useState(false);
  const [furnitureEditMode, setFurnitureEditMode] = useState(false);
  const [selectedFurniture, setSelectedFurniture] = useState<FurnitureSelection | null>(null);
  const [collisionEditMode, setCollisionEditMode] = useState(false);
  const [collisionTool, setCollisionTool] = useState<CollisionTool>("select");
  const [collisionEditInfo, setCollisionEditInfo] = useState<CollisionEditInfo | null>(null);
  const [showCollisionDebug, setShowCollisionDebug] = useState(false);
  const isTouchDevice = useIsTouchDevice();

  // Always-current mirrors of the editor UI state, read from the StudioReady
  // handler below — that handler is registered once per Phaser game/scene
  // instance and would otherwise close over stale values. Kept as a safety
  // net for the rare case Turbopack still recreates the Phaser game while an
  // editor is open (the common cause — a dev Save writing game/data/*.json,
  // which furnitureEditor.ts used to statically `import` — no longer
  // triggers this; see preloadFurnitureEditorData). The fresh
  // FurnitureEditor instance boots inactive/no editing target, so
  // re-applying the current toggle/tool state onto it keeps the two in
  // sync; the in-progress shape selection itself is small enough to just
  // re-click if that ever happens.
  const furnitureEditModeRef = useRef(furnitureEditMode);
  const collisionEditModeRef = useRef(collisionEditMode);
  const collisionToolRef = useRef(collisionTool);
  useEffect(() => {
    furnitureEditModeRef.current = furnitureEditMode;
  }, [furnitureEditMode]);
  useEffect(() => {
    collisionEditModeRef.current = collisionEditMode;
  }, [collisionEditMode]);
  useEffect(() => {
    collisionToolRef.current = collisionTool;
  }, [collisionTool]);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
    let cancelled = false;

    Promise.all([import("phaser"), import("@/game/config/gameConfig")]).then(
      ([PhaserModule, { createGameConfig }]) => {
        if (cancelled || !containerRef.current || gameRef.current) return;
        const game = new PhaserModule.Game(createGameConfig(containerRef.current));
        gameRef.current = game;
        // Set before the scene's preload() phase runs so it can read the list synchronously.
        game.registry.set(FURNITURE_ASSET_FILES_REGISTRY_KEY, furnitureAssetFiles);

        game.events.once(GAME_EVENTS.StudioReady, (scene: StudioScene) => {
          sceneRef.current = scene;
          scene.events.on(SCENE_EVENTS.InteractionOpen, (panelId: PortfolioSectionId) => {
            setPanelId(panelId);
          });
          scene.events.on(SCENE_EVENTS.InteractionClose, () => setPanelId(null));
          scene.events.on(SCENE_EVENTS.InteractionPromptChange, (interactable: Interactable | null) =>
            setCanInteract(interactable !== null),
          );
          scene.furnitureEditor.onSelectionChange = setSelectedFurniture;
          scene.furnitureEditor.onCollisionShapesChange = setCollisionEditInfo;
          scene.furnitureEditor.onToolChange = setCollisionTool;

          // Re-apply whatever the panels were already showing onto this
          // (possibly brand new, post-HMR-reload) editor instance — see the
          // refs' comment above for why this can't just read the plain state
          // variables.
          scene.furnitureEditor.setActive(furnitureEditModeRef.current);
          scene.furnitureEditor.setCollisionActive(collisionEditModeRef.current);
          scene.furnitureEditor.setTool(collisionToolRef.current);
          scene.setFurnitureEditingActive(furnitureEditModeRef.current || collisionEditModeRef.current);
        });
      },
    );

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, [furnitureAssetFiles]);

  const handleClose = () => {
    setPanelId(null);
    sceneRef.current?.unlockInput();
  };

  // Guards against a D-pad button getting disabled mid-press (native `disabled` swallows the
  // pointerup that would otherwise clear it), which would leave Mimi drifting after the panel closes.
  useEffect(() => {
    if (panelId !== null) sceneRef.current?.touchInput.clear();
  }, [panelId]);

  const handleDirection = (direction: keyof MovementIntent, pressed: boolean) => {
    sceneRef.current?.touchInput.setDirection(direction, pressed);
  };

  const handleInteract = () => {
    sceneRef.current?.interact();
  };

  useEffect(() => {
    sceneRef.current?.furnitureEditor.setActive(furnitureEditMode);
  }, [furnitureEditMode]);

  useEffect(() => {
    sceneRef.current?.furnitureEditor.setCollisionActive(collisionEditMode);
  }, [collisionEditMode]);

  useEffect(() => {
    // Mimi (and the camera, which follows her) otherwise keeps moving every
    // frame while either editor is open, silently panning the room under a
    // click mid-edit — see StudioScene.setFurnitureEditingActive.
    sceneRef.current?.setFurnitureEditingActive(furnitureEditMode || collisionEditMode);
    // Phaser's Scale.RESIZE mode normally re-measures its parent only on a
    // native window `resize` event (or its own ~500ms poll) — opening/closing
    // a side panel changes the canvas column's width via flexbox alone, so
    // without forcing a re-measure now the canvas keeps rendering at its old
    // width and gets clipped by the narrower column instead of refitting the
    // whole house. Mirrors exactly what ScaleManager's own step() does on a
    // dirty check: re-measure the parent, and only refresh if it actually changed.
    const scale = gameRef.current?.scale;
    if (scale?.getParentBounds()) scale.refresh();
  }, [furnitureEditMode, collisionEditMode]);

  useEffect(() => {
    sceneRef.current?.setCollisionDebugVisible(showCollisionDebug);
  }, [showCollisionDebug]);

  const handlePickFurnitureKind = (kind: string) => {
    sceneRef.current?.furnitureEditor.beginPlacement(kind);
  };

  const handleSaveFurnitureLayout = async () => {
    await sceneRef.current?.furnitureEditor.save();
  };

  const handleResizeSelected = (scale: number) => {
    sceneRef.current?.furnitureEditor.setSelectedScale(scale);
  };

  /** Opens Furniture Placement, closing Collision Editor if it was open — the two tools are mutually exclusive (see FurnitureEditor.setActive/setCollisionActive), so collision editing can never also drag/resize/rotate a placed piece. */
  const handleToggleFurnitureEditMode = () => {
    setFurnitureEditMode((prev) => !prev);
    setCollisionEditMode(false);
  };

  /** Opens Collision Editor, closing Furniture Placement if it was open — see handleToggleFurnitureEditMode. */
  const handleToggleCollisionEditMode = () => {
    setCollisionEditMode((prev) => !prev);
    setFurnitureEditMode(false);
  };

  const handleCloseFurnitureEditor = () => {
    setFurnitureEditMode(false);
  };

  /** Closing the Collision Editor must fully exit edit mode and restore normal game controls immediately — setCollisionActive(false) (via the effect above) tears down selection/drawing state synchronously, and setFurnitureEditingActive(false) un-freezes Mimi/the camera in the same render. */
  const handleCloseCollisionEditor = () => {
    setCollisionEditMode(false);
  };

  const handleSetCollisionTool = (tool: CollisionTool) => {
    setCollisionTool(tool);
    sceneRef.current?.furnitureEditor.setTool(tool);
  };

  const handleFinishPolygon = () => {
    sceneRef.current?.furnitureEditor.finishPolygon();
  };

  const handleDeleteSelectedShape = () => {
    sceneRef.current?.furnitureEditor.deleteSelectedShape();
  };

  const handleClearAllCollision = () => {
    sceneRef.current?.furnitureEditor.clearAllCollision();
  };

  const handleUndo = () => {
    sceneRef.current?.furnitureEditor.undo();
  };

  const handleRedo = () => {
    sceneRef.current?.furnitureEditor.redo();
  };

  const handleSaveCollision = async () => {
    await sceneRef.current?.furnitureEditor.saveAllInstanceCollisions();
  };

  /** Lets the browser drop the drag started in FurnitureEditorSidebar onto the canvas. */
  const handleFurnitureDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!furnitureEditMode || !event.dataTransfer.types.includes(FURNITURE_DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleFurnitureDrop = (event: DragEvent<HTMLDivElement>) => {
    const kind = event.dataTransfer.getData(FURNITURE_DRAG_MIME);
    if (!furnitureEditMode || !kind) return;
    event.preventDefault();
    sceneRef.current?.furnitureEditor.placeAt(kind, event.pageX, event.pageY);
  };

  return (
    <div className="relative flex h-full w-full overflow-hidden" onDragOver={handleFurnitureDragOver} onDrop={handleFurnitureDrop}>
      {/* Sized to flex-1 (not absolute-full-width) so the sidebar below reserves its own column instead of
          overlapping the game canvas — Phaser's Scale.RESIZE mode + StudioScene.applyCameraFraming() already
          refit the whole house to whatever width this wrapper ends up with, so opening the sidebar shrinks
          the playable/clickable area instead of hiding furniture underneath the sidebar's opaque panel. */}
      <div className="relative h-full flex-1 overflow-hidden">
        <div ref={containerRef} className="h-full w-full" />
        {FURNITURE_EDITOR_AVAILABLE && (
          <div className="absolute top-2 right-2 z-10 flex gap-2">
            <button
              type="button"
              onClick={() => setShowCollisionDebug((prev) => !prev)}
              className={`border-2 px-3 py-1 font-mono text-xs font-bold uppercase tracking-wide focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe9a8] ${
                showCollisionDebug ? "border-[#ffe9a8] bg-[#3a2f4d] text-[#ffe9a8]" : "border-[#6f5c9e] bg-[#1e1730] text-[#ffe9a8] hover:bg-[#3a2f4d]"
              }`}
            >
              {showCollisionDebug ? "Hide Collision" : "Show Collision"}
            </button>
            <button
              type="button"
              onClick={handleToggleFurnitureEditMode}
              className="border-2 border-[#6f5c9e] bg-[#1e1730] px-3 py-1 font-mono text-xs font-bold uppercase tracking-wide text-[#ffe9a8] hover:bg-[#3a2f4d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe9a8]"
            >
              {furnitureEditMode ? "Exit Edit" : "Edit"}
            </button>
            <button
              type="button"
              onClick={handleToggleCollisionEditMode}
              className={`border-2 px-3 py-1 font-mono text-xs font-bold uppercase tracking-wide focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe9a8] ${
                collisionEditMode ? "border-[#ffe9a8] bg-[#3a2f4d] text-[#ffe9a8]" : "border-[#6f5c9e] bg-[#1e1730] text-[#ffe9a8] hover:bg-[#3a2f4d]"
              }`}
            >
              {collisionEditMode ? "Exit Collisions" : "Edit Collisions"}
            </button>
          </div>
        )}
      </div>
      {isTouchDevice && (
        <TouchControls
          onDirection={handleDirection}
          onInteract={handleInteract}
          canInteract={canInteract}
          disabled={panelId !== null}
        />
      )}
      <PortfolioPanel sectionId={panelId} onClose={handleClose} />
      {FURNITURE_EDITOR_AVAILABLE && furnitureEditMode && (
        <FurnitureEditorSidebar
          furnitureAssetFiles={furnitureAssetFiles}
          onPickKind={handlePickFurnitureKind}
          onSave={handleSaveFurnitureLayout}
          selectedFurniture={selectedFurniture}
          onResize={handleResizeSelected}
          onClose={handleCloseFurnitureEditor}
        />
      )}
      {FURNITURE_EDITOR_AVAILABLE && collisionEditMode && (
        <CollisionEditorPanel
          onClose={handleCloseCollisionEditor}
          tool={collisionTool}
          onSetTool={handleSetCollisionTool}
          onFinishPolygon={handleFinishPolygon}
          onDeleteSelectedShape={handleDeleteSelectedShape}
          onClearAllCollision={handleClearAllCollision}
          onUndo={handleUndo}
          onRedo={handleRedo}
          collisionEditInfo={collisionEditInfo}
          onSave={handleSaveCollision}
        />
      )}
    </div>
  );
}
