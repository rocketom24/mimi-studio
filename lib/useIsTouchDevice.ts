"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(pointer: coarse) and (hover: none)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

/** Coarse pointer + no hover means touch is the primary input — not a desktop window resized narrow. */
export function useIsTouchDevice(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
