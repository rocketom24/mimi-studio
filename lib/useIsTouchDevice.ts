"use client";

import { useCallback, useSyncExternalStore } from "react";

const TOUCH_QUERY = "(pointer: coarse) and (hover: none)";
// Phone-sized in either orientation: portrait phones are narrow, landscape
// phones are short. Both need the compact HUD — a 9-row guide panel and a
// full-size logo eat most of a 390x844 screen and nearly all of an 844x390 one.
const COMPACT_QUERY = "(max-width: 640px), (max-height: 520px)";

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Coarse pointer + no hover means touch is the primary input — not a desktop window resized narrow. */
export function useIsTouchDevice(): boolean {
  return useMediaQuery(TOUCH_QUERY);
}

/** True on phone-sized viewports (either orientation) — drives the HUD's compact layout. Size-based, not touch-based, so a tablet or a deliberately narrow desktop window gets the same non-blocking treatment. */
export function useIsCompactViewport(): boolean {
  return useMediaQuery(COMPACT_QUERY);
}
