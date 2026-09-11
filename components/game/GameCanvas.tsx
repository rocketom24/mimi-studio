"use client";

import { useEffect, useRef, useState } from "react";
import type Phaser from "phaser";
import type { StudioScene } from "@/game/scenes/StudioScene";
import { GAME_EVENTS, SCENE_EVENTS } from "@/game/types/interaction";
import type { Interactable } from "@/game/types/interaction";
import type { MovementIntent } from "@/game/types/input";
import type { PortfolioSectionId } from "@/game/data/portfolio";
import PortfolioPanel from "@/components/game/PortfolioPanel";
import TouchControls from "@/components/game/TouchControls";
import StudioHud from "@/components/game/StudioHud";
import { useIsTouchDevice } from "@/lib/useIsTouchDevice";
import { FURNITURE_ASSET_FILES_REGISTRY_KEY } from "@/game/world/furnitureEditorAssets";

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
  const [zoomFactor, setZoomFactor] = useState(1);
  const [hasStartedMoving, setHasStartedMoving] = useState(false);
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
          scene.events.on(SCENE_EVENTS.ZoomChange, (zoom: number) => setZoomFactor(zoom));
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

  // First-visit hint (rendered by StudioHud) fades as soon as the player does
  // anything — walks, taps the D-pad, or clicks a furniture piece to navigate.
  useEffect(() => {
    if (hasStartedMoving) return;
    const markStarted = () => setHasStartedMoving(true);
    window.addEventListener("keydown", markStarted, { once: true });
    containerRef.current?.addEventListener("pointerdown", markStarted, { once: true });
    return () => {
      window.removeEventListener("keydown", markStarted);
      containerRef.current?.removeEventListener("pointerdown", markStarted);
    };
  }, [hasStartedMoving]);

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
    if (pressed) setHasStartedMoving(true);
    sceneRef.current?.touchInput.setDirection(direction, pressed);
  };

  const handleInteract = () => {
    setHasStartedMoving(true);
    sceneRef.current?.interact();
  };

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      <div className="relative h-full flex-1 overflow-hidden">
        <div ref={containerRef} className="h-full w-full" />
      </div>
      <StudioHud zoomFactor={zoomFactor} isTouchDevice={isTouchDevice} hasStartedMoving={hasStartedMoving} />
      {isTouchDevice && (
        <TouchControls
          onDirection={handleDirection}
          onInteract={handleInteract}
          canInteract={canInteract}
          disabled={panelId !== null}
        />
      )}
      <PortfolioPanel sectionId={panelId} onClose={handleClose} />
    </div>
  );
}
