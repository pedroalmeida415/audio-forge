import { useCallback, useState } from "react";
import { api } from "~/trpc/react";

type AudioState = "idle" | "loading" | "ready" | "error";

interface UseSegmentAudioOptions {
  sessionFileStorageKey: string;
  startTime: number;
  endTime: number;
  clipId?: string | null;
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
 * - Source: fetched via media-proxy with time range
 * - Clip: fetched via clip.getDownloadUrl for presigned R2 URL
 */
export function useSegmentAudio({
  sessionFileStorageKey,
  startTime,
  endTime,
  clipId,
}: UseSegmentAudioOptions): UseSegmentAudioReturn {
  // Source audio state
  const [sourceState, setSourceState] = useState<AudioState>("idle");
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  // Clip audio state
  const [clipState, setClipState] = useState<AudioState>("idle");
  const [clipUrl, setClipUrl] = useState<string | null>(null);

  const clipQuery = api.clip.getDownloadUrl.useQuery(
    { clipId: clipId ?? "" },
    { enabled: false }, // Manual fetch only
  );

  /**
   * Load source audio via media-proxy.
   * Fetches the segment's time range from the original session file.
   */
  const loadSource = useCallback(async () => {
    if (sourceState === "ready" || sourceState === "loading") return;

    setSourceState("loading");

    try {
      const startMs = Math.floor(startTime * 1000);
      const endMs = Math.ceil(endTime * 1000);

      const response = await fetch(
        `/api/media-proxy?storageKey=${encodeURIComponent(sessionFileStorageKey)}&startMs=${startMs}&endMs=${endMs}`,
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch segment audio: ${response.statusText}`,
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setSourceUrl(url);
      setSourceState("ready");
    } catch (error) {
      console.error("Failed to load source audio:", error);
      setSourceState("error");
    }
  }, [sourceState, sessionFileStorageKey, startTime, endTime]);

  /**
   * Load clip audio via presigned R2 URL.
   * Only available if the segment has a processed clip.
   */
  const loadClip = useCallback(async () => {
    if (!clipId) return;
    if (clipState === "ready" || clipState === "loading") return;

    setClipState("loading");

    try {
      const result = await clipQuery.refetch();
      if (result.data?.url) {
        setClipUrl(result.data.url);
        setClipState("ready");
      } else {
        throw new Error("Failed to get clip URL");
      }
    } catch (error) {
      console.error("Failed to load clip audio:", error);
      setClipState("error");
    }
  }, [clipId, clipState, clipQuery]);

  return {
    sourceState,
    sourceUrl,
    loadSource,
    clipState,
    clipUrl,
    loadClip,
    hasClip: !!clipId,
  };
}
