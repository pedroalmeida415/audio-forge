import { useCallback, useState } from "react";
import { env } from "~/env";

type AudioState = "idle" | "loading" | "ready" | "error";

interface UseSegmentAudioOptions {
  sessionFileStorageKey: string;
  startTime: number;
  endTime: number;
  clipStorageKey?: string | null;
}

interface UseSegmentAudioReturn {
  // Source audio (from segment in original file)
  sourceState: AudioState;
  sourceUrl: string | null;
  loadSource: () => Promise<void>;

  // Processed audio (from clip)
  clipState: AudioState;
  clipUrl: string | null;
  loadClip: () => Promise<void>;
  hasClip: boolean;
}

/**
 * Hook for lazy loading segment audio.
 *
 * Both source (segment from original file) and clip (processed audio) are
 * loaded on-demand when play is clicked.
 *
 * - Source: fetched via media server with time range (fMP4 for browser)
 * - Clip: fetched via media server (full file, no time range)
 */
export function useSegmentAudio({
  sessionFileStorageKey,
  startTime,
  endTime,
  clipStorageKey,
}: UseSegmentAudioOptions): UseSegmentAudioReturn {
  // Source audio state
  const [sourceState, setSourceState] = useState<AudioState>("idle");
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  // Clip audio state
  const [clipState, setClipState] = useState<AudioState>("idle");
  const [clipUrl, setClipUrl] = useState<string | null>(null);

  /**
   * Load source audio via media server.
   * Fetches the segment's time range from the original session file.
   */
  const loadSource = useCallback(async () => {
    if (sourceState === "ready" || sourceState === "loading") return;

    setSourceState("loading");

    try {
      const mediaServerUrl = env.NEXT_PUBLIC_MEDIA_SERVER_URL;
      if (!mediaServerUrl) {
        throw new Error("NEXT_PUBLIC_MEDIA_SERVER_URL is not configured");
      }

      const url = `${mediaServerUrl}/audio?storageKey=${encodeURIComponent(sessionFileStorageKey)}&start=${startTime}&end=${endTime}`;

      const response = await fetch(url, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch segment audio: ${response.statusText}`,
        );
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      setSourceUrl(objectUrl);
      setSourceState("ready");
    } catch (error) {
      console.error("Failed to load source audio:", error);
      setSourceState("error");
    }
  }, [sourceState, sessionFileStorageKey, startTime, endTime]);

  /**
   * Load clip audio via media server.
   * Clips are full files, so no time range params needed.
   */
  const loadClip = useCallback(async () => {
    if (!clipStorageKey) return;
    if (clipState === "ready" || clipState === "loading") return;

    setClipState("loading");

    try {
      const mediaServerUrl = env.NEXT_PUBLIC_MEDIA_SERVER_URL;
      if (!mediaServerUrl) {
        throw new Error("NEXT_PUBLIC_MEDIA_SERVER_URL is not configured");
      }

      // Fetch full clip file (no time range = streams entire file)
      const url = `${mediaServerUrl}/audio?storageKey=${encodeURIComponent(clipStorageKey)}`;

      const response = await fetch(url, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch clip audio: ${response.statusText}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      setClipUrl(objectUrl);
      setClipState("ready");
    } catch (error) {
      console.error("Failed to load clip audio:", error);
      setClipState("error");
    }
  }, [clipStorageKey, clipState]);

  return {
    sourceState,
    sourceUrl,
    loadSource,
    clipState,
    clipUrl,
    loadClip,
    hasClip: !!clipStorageKey,
  };
}
