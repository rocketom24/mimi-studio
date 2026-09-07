"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import type Phaser from "phaser";
import type { StudioScene } from "@/game/scenes/StudioScene";
import { GAME_EVENTS, SCENE_EVENTS } from "@/game/types/interaction";
import type { Interactable } from "@/game/types/interaction";
import type { MovementIntent } from "@/game/types/input";
import type { PortfolioSectionId } from "@/game/data/portfolio";
import PortfolioPanel from "@/components/game/PortfolioPanel";
import TouchControls from "@/components/game/TouchControls";
import FurnitureEditorSidebar, { FURNITURE_DRAG_MIME } from "@/components/game/FurnitureEditorSidebar";
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
  const isTouchDevice = useIsTouchDevice();

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

  const handlePickFurnitureKind = (kind: string) => {
    sceneRef.current?.furnitureEditor.beginPlacement(kind);
  };

  const handleSaveFurnitureLayout = async () => {
    await sceneRef.current?.furnitureEditor.save();
  };

  const handleResizeSelected = (scale: number) => {
    sceneRef.current?.furnitureEditor.setSelectedScale(scale);
  };

  const handleCloseFurnitureEditor = () => {
    setFurnitureEditMode(false);
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
    <div className="relative h-full w-full overflow-hidden" onDragOver={handleFurnitureDragOver} onDrop={handleFurnitureDrop}>
      <div ref={containerRef} className="h-full w-full" />
      {isTouchDevice && (
        <TouchControls
          onDirection={handleDirection}
          onInteract={handleInteract}
          canInteract={canInteract}
          disabled={panelId !== null}
        />
      )}
      <PortfolioPanel sectionId={panelId} onClose={handleClose} />
      {FURNITURE_EDITOR_AVAILABLE && (
        <button
          type="button"
          onClick={() => setFurnitureEditMode((prev) => !prev)}
          className="absolute top-2 right-2 z-10 border-2 border-[#6f5c9e] bg-[#1e1730] px-3 py-1 font-mono text-xs font-bold uppercase tracking-wide text-[#ffe9a8] hover:bg-[#3a2f4d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe9a8]"
        >
          {furnitureEditMode ? "Exit Edit" : "Edit"}
        </button>
      )}
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
    </div>
  );
}
