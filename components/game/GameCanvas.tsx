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
import { useIsTouchDevice } from "@/lib/useIsTouchDevice";

export default function GameCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<StudioScene | null>(null);
  const [panelId, setPanelId] = useState<PortfolioSectionId | null>(null);
  const [canInteract, setCanInteract] = useState(false);
  const isTouchDevice = useIsTouchDevice();

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
    let cancelled = false;

    Promise.all([import("phaser"), import("@/game/config/gameConfig")]).then(
      ([PhaserModule, { createGameConfig }]) => {
        if (cancelled || !containerRef.current || gameRef.current) return;
        const game = new PhaserModule.Game(createGameConfig(containerRef.current));
        gameRef.current = game;

        game.events.once(GAME_EVENTS.StudioReady, (scene: StudioScene) => {
          sceneRef.current = scene;
          scene.events.on(SCENE_EVENTS.InteractionOpen, (panelId: PortfolioSectionId) => {
            setPanelId(panelId);
          });
          scene.events.on(SCENE_EVENTS.InteractionClose, () => setPanelId(null));
          scene.events.on(SCENE_EVENTS.InteractionPromptChange, (interactable: Interactable | null) =>
            setCanInteract(interactable !== null),
          );
        });
      },
    );

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, []);

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

  return (
    <div className="relative h-full w-full overflow-hidden">
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
    </div>
  );
}
