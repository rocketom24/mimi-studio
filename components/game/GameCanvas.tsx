"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type Phaser from "phaser";
import type { StudioScene } from "@/game/scenes/StudioScene";
import { GAME_EVENTS, SCENE_EVENTS } from "@/game/types/interaction";
import type { Interactable } from "@/game/types/interaction";
import type { MovementIntent } from "@/game/types/input";
import type { PortfolioSectionId } from "@/game/data/portfolio";
import PortfolioPanel from "@/components/game/PortfolioPanel";
import TouchControls from "@/components/game/TouchControls";
import { useIsTouchDevice } from "@/lib/useIsTouchDevice";

const ROTATE_HINT_SEEN_KEY = "mimi-studio:rotate-hint-seen";
const ROTATE_HINT_TIMEOUT_MS = 6000;

function subscribeNever(): () => void {
  return () => {};
}

/** Whether a prior visit already dismissed the rotation hint. SSR/no-storage snapshot treats it as already seen, so the hint never flashes on the server render. */
function getRotateHintSeen(): boolean {
  try {
    return localStorage.getItem(ROTATE_HINT_SEEN_KEY) !== null;
  } catch {
    return true;
  }
}

export default function GameCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<StudioScene | null>(null);
  const [panelId, setPanelId] = useState<PortfolioSectionId | null>(null);
  const [canInteract, setCanInteract] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [hintDismissedEarly, setHintDismissedEarly] = useState(false);
  const isTouchDevice = useIsTouchDevice();

  // Read once per render, not re-checked reactively — dismissing sets hintDismissedEarly instead, which is enough to hide it immediately.
  const hintSeen = useSyncExternalStore(subscribeNever, getRotateHintSeen, () => true);
  const showRotateHint = !hintSeen && !hintDismissedEarly;

  const dismissRotateHint = useCallback(() => {
    setHintDismissedEarly(true);
    try {
      localStorage.setItem(ROTATE_HINT_SEEN_KEY, "1");
    } catch {
      // Privacy mode / storage disabled — hint just reappears next visit, harmless.
    }
  }, []);

  // First-visit-only rotation hint: auto-dismiss shortly after it appears.
  useEffect(() => {
    if (!showRotateHint) return;
    const timeout = setTimeout(dismissRotateHint, ROTATE_HINT_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [showRotateHint, dismissRotateHint]);

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
          scene.events.on(SCENE_EVENTS.CameraRotateStart, () => setIsRotating(true));
          scene.events.on(SCENE_EVENTS.CameraRotateEnd, () => {
            setIsRotating(false);
            dismissRotateHint();
          });
        });
      },
    );

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, [dismissRotateHint]);

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

  const handleRotateLeft = () => {
    sceneRef.current?.rotateCameraLeft();
  };

  const handleRotateRight = () => {
    sceneRef.current?.rotateCameraRight();
  };

  const controlsDisabled = panelId !== null || isRotating;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={containerRef} className="h-full w-full" />
      {isTouchDevice && (
        <TouchControls
          onDirection={handleDirection}
          onInteract={handleInteract}
          onRotateLeft={handleRotateLeft}
          onRotateRight={handleRotateRight}
          canInteract={canInteract}
          disabled={controlsDisabled}
        />
      )}
      {showRotateHint && (
        <div
          className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded border-2 border-[#6f5c9e] bg-[#1a1423e6] px-2 py-1 font-mono text-[10px] font-bold text-[#ffe9a8] shadow-[2px_2px_0_0_rgba(0,0,0,0.5)]"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.25rem)" }}
        >
          {isTouchDevice ? "↺ ↻ ROTATE APARTMENT" : "Q / R — ROTATE APARTMENT"}
        </div>
      )}
      <PortfolioPanel sectionId={panelId} onClose={handleClose} />
    </div>
  );
}
