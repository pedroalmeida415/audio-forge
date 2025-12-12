"use client";

import { createContext, type ReactNode, use } from "react";
import { type PlaybackActions, usePlayback } from "../_hooks/use-playback";

// ============================================================================
// Context
// ===============================================================
const PlaybackContext = createContext<PlaybackActions | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

interface PlaybackProviderProps {
  children: ReactNode;
}

export function PlaybackProvider({ children }: PlaybackProviderProps) {
  // Initialize ref hooks
  const playback = usePlayback();

  return (
    <PlaybackContext.Provider value={playback}>
      {children}
    </PlaybackContext.Provider>
  );
}

export function usePlaybackContext() {
  const context = use(PlaybackContext);
  if (!context) {
    throw new Error("usePlaybackContext must be used within PlaybackProvider");
  }
  return context;
}
