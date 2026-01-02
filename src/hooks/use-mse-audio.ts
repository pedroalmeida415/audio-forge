"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MSEAudioProvider,
  type MSEAudioProviderConfig,
} from "~/lib/media-proxy/mse-audio-provider";

export interface UseMSEAudioConfig {
  storageKey: string;
  duration: number;
  sliceSize?: number;
  enabled?: boolean;
}

export interface UseMSEAudioResult {
  audioElement: HTMLAudioElement | null;
  isLoading: boolean;
  error: string | null;
  isSupported: boolean;
  ensureLoaded: (time: number) => Promise<void>;
  preloadAhead: (time: number, count?: number) => Promise<void>;
}

/**
 * React hook for MSE-based progressive audio loading
 *
 * Creates and manages its own audio element with MSE attached.
 * Returns the audio element directly for use in playback controls.
 */
export function useMSEAudio(config: UseMSEAudioConfig): UseMSEAudioResult {
  const { storageKey, duration, sliceSize, enabled = true } = config;

  const providerRef = useRef<MSEAudioProvider | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(
    null,
  );

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported] = useState(() => MSEAudioProvider.isSupported());

  // Create audio element and MSE provider
  useEffect(() => {
    if (!enabled || !isSupported || !storageKey || duration <= 0) {
      return;
    }

    // Create audio element
    const audio = document.createElement("audio");
    audio.preload = "metadata";

    // Create MSE provider
    const provider = new MSEAudioProvider({
      storageKey,
      duration,
      sliceSize,
    });
    providerRef.current = provider;

    // Attach MSE to audio element
    try {
      provider.attachTo(audio);
      setAudioElement(audio);
      setError(null);
    } catch (e) {
      console.error("[useMSEAudio] Failed to attach MSE:", e);
      setError(e instanceof Error ? e.message : "Failed to attach MSE");
    }

    return () => {
      provider.detach();
      providerRef.current = null;
      audio.pause();
      audio.src = "";
      setAudioElement(null);
    };
  }, [storageKey, duration, sliceSize, enabled, isSupported]);

  // Ensure loaded callback - useCallback for stable reference
  // providerRef is a stable ref, we read .current at call time
  const ensureLoaded = useCallback(async (time: number): Promise<void> => {
    const provider = providerRef.current;
    if (!provider) return;

    try {
      await provider.ensureLoaded(time);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audio");
    }
  }, []);

  // Preload ahead callback - useCallback for stable reference
  const preloadAhead = useCallback(
    async (time: number, count = 1): Promise<void> => {
      const provider = providerRef.current;
      if (!provider) return;

      try {
        await provider.preloadAhead(time, count);
      } catch {
        // Preloading errors are non-critical, silently ignore
      }
    },
    [],
  );

  return {
    audioElement,
    isLoading,
    error,
    isSupported,
    ensureLoaded,
    preloadAhead,
  };
}

/**
 * Check if MSE is supported in the current environment
 */
export function isMSESupported(): boolean {
  return MSEAudioProvider.isSupported();
}
