// Cache for audio data promises to ensure stability with React's use()
const audioCache = new Map<string, Promise<ArrayBuffer>>();

/**
 * Fetches audio data and returns both a blob URL (for playback) and
 * ArrayBuffer (for waveform generation). Cached for use with React's use() hook.
 */
export function fetchAudioData(url: string): Promise<ArrayBuffer> {
  const cached = audioCache.get(url);
  if (cached) return cached;

  const promise = (async () => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();

    return arrayBuffer;
  })();

  audioCache.set(url, promise);
  return promise;
}
