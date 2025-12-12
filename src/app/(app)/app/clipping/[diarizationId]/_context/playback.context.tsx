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
  initialData: {
    audioDataBuffer: ArrayBuffer;
  };
}

export function PlaybackProvider({
  initialData,
  children,
}: PlaybackProviderProps) {
  const { audioDataBuffer } = initialData;

  // Initialize ref hooks
  const playback = usePlayback(audioDataBuffer);

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
