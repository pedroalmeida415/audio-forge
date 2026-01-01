/**
 * MSE Audio Provider
 *
 * Manages progressive audio loading using Media Source Extensions.
 * Fetches audio slices on-demand as the user scrubs through the timeline.
 *
 * Internally uses milliseconds for precision, converts to seconds only at boundaries.
 */

export interface MSEAudioProviderConfig {
  storageKey: string;
  duration: number; // Duration in seconds (from audio metadata)
  sliceSize?: number; // Seconds per slice, defaults to 15
}

interface PendingSlice {
  startMs: number;
  endMs: number;
  promise: Promise<ArrayBuffer>;
}

export class MSEAudioProvider {
  private storageKey: string;
  private durationMs: number;
  private sliceSizeMs: number;

  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private audioElement: HTMLAudioElement | null = null;

  private pendingSlices: Map<number, PendingSlice> = new Map();
  private fetchedSlices: Set<number> = new Set();
  private appendQueue: { data: ArrayBuffer; offsetMs: number }[] = [];
  private isAppending = false;

  constructor(config: MSEAudioProviderConfig) {
    this.storageKey = config.storageKey;
    // Convert to milliseconds internally
    this.durationMs = Math.round(config.duration * 1000);
    this.sliceSizeMs = (config.sliceSize ?? 15) * 1000;
  }

  /**
   * Attach to an HTML audio element
   */
  attachTo(audioElement: HTMLAudioElement): void {
    if (this.audioElement) {
      this.detach();
    }

    this.audioElement = audioElement;
    this.mediaSource = new MediaSource();

    audioElement.src = URL.createObjectURL(this.mediaSource);

    this.mediaSource.addEventListener("sourceopen", () => {
      this.onSourceOpen();
    });
  }

  /**
   * Detach from audio element and cleanup
   */
  detach(): void {
    if (this.audioElement) {
      URL.revokeObjectURL(this.audioElement.src);
      this.audioElement.src = "";
    }

    this.audioElement = null;
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.pendingSlices.clear();
    this.fetchedSlices.clear();
    this.appendQueue = [];
  }

  /**
   * Ensure the audio at the given time is loaded
   * @param time Time in seconds (from audio.currentTime)
   */
  async ensureLoaded(time: number): Promise<void> {
    if (!this.sourceBuffer || !this.mediaSource) {
      return;
    }

    const timeMs = Math.round(time * 1000);

    // Calculate which slice we need
    const sliceIndex = Math.floor(timeMs / this.sliceSizeMs);
    const startMs = sliceIndex * this.sliceSizeMs;
    const endMs = Math.min(startMs + this.sliceSizeMs, this.durationMs);

    // Check if already buffered - use a point near the end of the slice
    const checkTimeMs = Math.min(endMs - 100, startMs + this.sliceSizeMs / 2);
    if (this.isTimeBuffered(checkTimeMs / 1000)) {
      return;
    }

    // Check if already fetched or fetching
    if (this.fetchedSlices.has(sliceIndex)) {
      if (this.pendingSlices.has(sliceIndex)) {
        await this.pendingSlices.get(sliceIndex)!.promise;
      }
      return;
    }

    await this.fetchAndAppendSlice(sliceIndex, startMs, endMs);
  }

  /**
   * Preload slices ahead of the current time
   * @param time Time in seconds (from audio.currentTime)
   */
  async preloadAhead(time: number, count = 2): Promise<void> {
    if (!this.sourceBuffer || !this.mediaSource) {
      return;
    }

    const timeMs = Math.round(time * 1000);
    const currentSlice = Math.floor(timeMs / this.sliceSizeMs);
    const promises: Promise<void>[] = [];

    for (let i = 0; i < count; i++) {
      const sliceIndex = currentSlice + i;
      const startMs = sliceIndex * this.sliceSizeMs;
      const endMs = Math.min(startMs + this.sliceSizeMs, this.durationMs);

      if (startMs >= this.durationMs) break;
      if (this.fetchedSlices.has(sliceIndex)) continue;

      promises.push(this.fetchAndAppendSlice(sliceIndex, startMs, endMs));
    }

    await Promise.all(promises);
  }

  /**
   * Check if MediaSource APIs are supported
   */
  static isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      "MediaSource" in window &&
      MediaSource.isTypeSupported('audio/mp4; codecs="mp4a.40.2"')
    );
  }

  private onSourceOpen(): void {
    if (!this.mediaSource) return;

    this.sourceBuffer = this.mediaSource.addSourceBuffer(
      'audio/mp4; codecs="mp4a.40.2"'
    );

    // MediaSource.duration expects seconds
    this.mediaSource.duration = this.durationMs / 1000;

    this.sourceBuffer.addEventListener("updateend", () => {
      this.isAppending = false;
      this.processAppendQueue();
    });

    this.sourceBuffer.addEventListener("error", (e) => {
      console.error("[MSEAudioProvider] SourceBuffer error:", e);
    });
  }

  private async fetchAndAppendSlice(
    sliceIndex: number,
    startMs: number,
    endMs: number
  ): Promise<void> {
    this.fetchedSlices.add(sliceIndex);

    const fetchPromise = this.fetchSlice(startMs, endMs);

    this.pendingSlices.set(sliceIndex, {
      startMs,
      endMs,
      promise: fetchPromise,
    });

    try {
      const data = await fetchPromise;
      this.queueAppend(data, startMs);
    } catch (e) {
      this.fetchedSlices.delete(sliceIndex);
      throw e;
    } finally {
      this.pendingSlices.delete(sliceIndex);
    }
  }

  private async fetchSlice(startMs: number, endMs: number): Promise<ArrayBuffer> {
    const url = `/api/media-proxy?storageKey=${encodeURIComponent(this.storageKey)}&startMs=${startMs}&endMs=${endMs}`;

    const response = await fetch(url, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch slice: ${response.status}`);
    }

    return response.arrayBuffer();
  }

  private queueAppend(data: ArrayBuffer, offsetMs: number): void {
    this.appendQueue.push({ data, offsetMs });
    this.processAppendQueue();
  }

  private processAppendQueue(): void {
    if (
      this.isAppending ||
      this.appendQueue.length === 0 ||
      !this.sourceBuffer ||
      this.sourceBuffer.updating
    ) {
      return;
    }

    const { data, offsetMs } = this.appendQueue.shift()!;
    this.isAppending = true;

    try {
      // timestampOffset expects seconds
      this.sourceBuffer.timestampOffset = offsetMs / 1000;
      this.sourceBuffer.appendBuffer(data);
    } catch (e) {
      console.error("[MSEAudioProvider] Error appending buffer:", e);
      this.isAppending = false;
    }
  }

  private isTimeBuffered(time: number): boolean {
    if (!this.sourceBuffer) return false;

    const buffered = this.sourceBuffer.buffered;
    for (let i = 0; i < buffered.length; i++) {
      if (time >= buffered.start(i) && time < buffered.end(i)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get the current buffered time ranges
   */
  getBufferedRanges(): TimeRanges | null {
    return this.sourceBuffer?.buffered ?? null;
  }
}
