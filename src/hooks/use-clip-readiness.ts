"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * localStorage key for storing clip readiness state
 */
const STORAGE_KEY = "audio-forge:clip-readiness";

/**
 * Get the current readiness state from localStorage
 */
function getReadinessState(): Record<string, boolean> {
  if (typeof window === "undefined") return {};

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

/**
 * Save readiness state to localStorage
 */
function saveReadinessState(state: Record<string, boolean>) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    // Dispatch a custom event for cross-component updates
    window.dispatchEvent(new CustomEvent("clip-readiness-change"));
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Subscribe to localStorage changes
 */
function subscribe(callback: () => void) {
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      callback();
    }
  };

  const handleCustomEvent = () => {
    callback();
  };

  window.addEventListener("storage", handleStorageChange);
  window.addEventListener("clip-readiness-change", handleCustomEvent);

  return () => {
    window.removeEventListener("storage", handleStorageChange);
    window.removeEventListener("clip-readiness-change", handleCustomEvent);
  };
}

/**
 * Get a snapshot of the current state
 */
function getSnapshot() {
  return JSON.stringify(getReadinessState());
}

/**
 * Server snapshot (empty state)
 */
function getServerSnapshot() {
  return "{}";
}

/**
 * Hook to manage clip export readiness state in localStorage
 *
 * This provides ephemeral persistence for clip readiness that survives
 * page refreshes but isn't stored in the database.
 *
 * @example
 * ```tsx
 * const { isReady, setReady, toggleReady, readyClipIds, clearAll } = useClipReadiness();
 *
 * // Check if a specific clip is ready
 * const clipIsReady = isReady("clip-123");
 *
 * // Toggle readiness
 * toggleReady("clip-123");
 *
 * // Get all ready clip IDs
 * const allReady = readyClipIds;
 * ```
 */
export function useClipReadiness() {
  // Use useSyncExternalStore for proper React 18+ subscription
  const stateJson = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const state = JSON.parse(stateJson) as Record<string, boolean>;

  /**
   * Check if a specific clip is marked as ready for export
   */
  const isReady = useCallback(
    (clipId: string) => {
      return state[clipId] === true;
    },
    [state]
  );

  /**
   * Set the readiness state for a specific clip
   */
  const setReady = useCallback((clipId: string, ready: boolean) => {
    const current = getReadinessState();
    if (ready) {
      current[clipId] = true;
    } else {
      delete current[clipId];
    }
    saveReadinessState(current);
  }, []);

  /**
   * Toggle the readiness state for a specific clip
   */
  const toggleReady = useCallback((clipId: string) => {
    const current = getReadinessState();
    if (current[clipId]) {
      delete current[clipId];
    } else {
      current[clipId] = true;
    }
    saveReadinessState(current);
  }, []);

  /**
   * Set readiness for multiple clips at once
   */
  const setReadyBatch = useCallback((clipIds: string[], ready: boolean) => {
    const current = getReadinessState();
    for (const clipId of clipIds) {
      if (ready) {
        current[clipId] = true;
      } else {
        delete current[clipId];
      }
    }
    saveReadinessState(current);
  }, []);

  /**
   * Clear all readiness states
   */
  const clearAll = useCallback(() => {
    saveReadinessState({});
  }, []);

  /**
   * Get the count of clips marked as ready
   */
  const readyCount = Object.keys(state).length;

  /**
   * Get all clip IDs that are marked as ready
   */
  const readyClipIds = Object.keys(state);

  /**
   * Check if any clips are ready for export
   */
  const hasReadyClips = readyCount > 0;

  return {
    isReady,
    setReady,
    toggleReady,
    setReadyBatch,
    clearAll,
    readyCount,
    readyClipIds,
    hasReadyClips,
  };
}

/**
 * Hook for a single clip's readiness state
 *
 * @example
 * ```tsx
 * const { isReady, toggle, setReady } = useClipReadinessItem("clip-123");
 * ```
 */
export function useClipReadinessItem(clipId: string) {
  const { isReady, setReady, toggleReady } = useClipReadiness();

  return {
    isReady: isReady(clipId),
    toggle: () => toggleReady(clipId),
    setReady: (ready: boolean) => setReady(clipId, ready),
  };
}
