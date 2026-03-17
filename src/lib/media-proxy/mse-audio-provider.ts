/**
 * MSE Audio Provider
 *
 * Manages progressive audio loading using Media Source Extensions.
 * Self-managing: creates its own audio element and handles all slice loading
 * automatically based on playback position and seeking.
 *
 * Internally uses milliseconds for precision, converts to seconds only at boundaries.
 */

import { env } from "~/env";

export interface MSEAudioProviderConfig {
  storageKey: string;
  duration: number; // Duration in seconds (from audio metadata)
  sliceSize?: number; // Seconds per slice, defaults to 15
  /**
   * Callback to get a presigned download URL for the storage key.
   * Called once on initialization and the URL is reused for all slice requests
   * (presigned URLs typically last 1 hour, well beyond a session).
   */
  getPresignedUrl: (storageKey: string) => Promise<string>;
}

const PRELOAD_THRESHOLD = 5.0; // seconds

// Debounce seeking to avoid downloading every slice during scrubbing
const SEEK_DEBOUNCE_MS = 200;

interface PendingSlice {
  start: number;
  end: number;
  promise: Promise<ArrayBuffer>;
}

export class MSEAudioProvider {
  private storageKey: string;
  private duration: number;
  private sliceSize: number;
  private getPresignedUrl: (storageKey: string) => Promise<string>;
  private presignedUrlPromise: Promise<string> | null = null;

  private mediaSource: MediaSource;
  private sourceBuffer: SourceBuffer | null = null;

  private pendingSlices: Map<number, PendingSlice> = new Map();
  private fetchedSlices: Set<number> = new Set();
  private appendQueue: { data: ArrayBuffer; offset: number }[] = [];
  private isAppending = false;
  private seekDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Bound event handlers for cleanup
  private handleTimeUpdate: () => void;
  private handleSeeking: () => void;

  // Public audio element - created and owned by the provider
  readonly audioElement: HTMLAudioElement;

  constructor(config: MSEAudioProviderConfig) {
    this.storageKey = config.storageKey;
    this.duration = config.duration;
    this.sliceSize = config.sliceSize ?? 15;
    this.getPresignedUrl = config.getPresignedUrl;

    // Pre-fetch the presigned URL eagerly so it's ready for the first slice
    this.presignedUrlPromise = this.getPresignedUrl(this.storageKey);

    // Bind handlers once for proper cleanup
    this.handleTimeUpdate = this.onTimeUpdate.bind(this);
    this.handleSeeking = this.onSeeking.bind(this);

    // Create audio element
    this.audioElement = document.createElement("audio");
    this.audioElement.preload = "none";

    // Create and attach MediaSource
    this.mediaSource = new MediaSource();
    this.audioElement.src = URL.createObjectURL(this.mediaSource);

    this.mediaSource.addEventListener("sourceopen", () => {
      this.onSourceOpen();
    });

    // Listen to audio events for automatic slice management
    this.audioElement.addEventListener("timeupdate", this.handleTimeUpdate);
    this.audioElement.addEventListener("seeking", this.handleSeeking);
  }

  /**
   * Detach and cleanup all resources
   */
  detach(): void {
    if (this.seekDebounceTimer) {
      clearTimeout(this.seekDebounceTimer);
      this.seekDebounceTimer = null;
    }

    this.audioElement.removeEventListener("timeupdate", this.handleTimeUpdate);
    this.audioElement.removeEventListener("seeking", this.handleSeeking);
    this.audioElement.pause();
    URL.revokeObjectURL(this.audioElement.src);
    this.audioElement.src = "";

    this.sourceBuffer = null;
    this.pendingSlices.clear();
    this.fetchedSlices.clear();
    this.appendQueue = [];
    this.presignedUrlPromise = null;
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

  /**
   * Get the current buffered time ranges
   */
  getBufferedRanges(): TimeRanges | null {
    return this.sourceBuffer?.buffered ?? null;
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private onTimeUpdate(): void {
    this.loadAtTime(this.audioElement.currentTime);
  }

  private onSeeking(): void {
    // Debounce to avoid downloading every slice during rapid scrubbing
    if (this.seekDebounceTimer) {
      clearTimeout(this.seekDebounceTimer);
    }

    this.seekDebounceTimer = setTimeout(() => {
      this.loadAtTime(this.audioElement.currentTime);
      this.seekDebounceTimer = null;
    }, SEEK_DEBOUNCE_MS);
  }

  // ============================================================================
  // Slice Loading
  // ============================================================================

  private onSourceOpen(): void {
    this.sourceBuffer = this.mediaSource.addSourceBuffer(
      'audio/mp4; codecs="mp4a.40.2"',
    );

    this.mediaSource.duration = this.duration;

    this.sourceBuffer.addEventListener("updateend", () => {
      this.isAppending = false;
      this.processAppendQueue();
    });

    this.sourceBuffer.addEventListener("error", (e) => {
      console.error("[MSEAudioProvider] SourceBuffer error:", e);
    });

    // Load initial slice so playback can start immediately
    this.loadAtTime(0);
  }

  /**
   * Load the slice at current time, and preload next slice if within threshold
   */
  private loadAtTime(time: number): void {
    if (!this.sourceBuffer) return;

    const currentSliceIndex = Math.floor(time / this.sliceSize);

    // Always load current slice
    this.loadSlice(currentSliceIndex);

    // Preload next slice if within threshold of slice boundary
    const nextSliceStart = (currentSliceIndex + 1) * this.sliceSize;
    const timeUntilNextSlice = nextSliceStart - time;

    if (
      timeUntilNextSlice <= PRELOAD_THRESHOLD &&
      nextSliceStart < this.duration
    ) {
      this.loadSlice(currentSliceIndex + 1);
    }
  }

  /**
   * Load a specific slice by index (if not already loaded)
   */
  private loadSlice(sliceIndex: number): void {
    const start = sliceIndex * this.sliceSize;

    if (start >= this.duration) return;
    if (this.fetchedSlices.has(sliceIndex)) return;

    const end = Math.min(start + this.sliceSize, this.duration);

    // Check if already buffered
    const checkTime = Math.min(end - 0.1, start + this.sliceSize / 2);
    if (this.isTimeBuffered(checkTime)) return;

    this.fetchAndAppendSlice(sliceIndex, start, end);
  }

  private async fetchAndAppendSlice(
    sliceIndex: number,
    start: number,
    end: number,
  ): Promise<void> {
    this.fetchedSlices.add(sliceIndex);

    const fetchPromise = this.fetchSlice(start, end);

    this.pendingSlices.set(sliceIndex, {
      start,
      end,
      promise: fetchPromise,
    });

    try {
      const data = await fetchPromise;
      this.queueAppend(data, start);
    } catch (e) {
      this.fetchedSlices.delete(sliceIndex);
      console.error("[MSEAudioProvider] Failed to fetch slice:", e);
    } finally {
      this.pendingSlices.delete(sliceIndex);
    }
  }

  /**
   * Get the presigned URL, using the cached promise to avoid redundant calls.
   */
  private async getOrFetchPresignedUrl(): Promise<string> {
    if (!this.presignedUrlPromise) {
      this.presignedUrlPromise = this.getPresignedUrl(this.storageKey);
    }
    return this.presignedUrlPromise;
  }

  private async fetchSlice(start: number, end: number): Promise<ArrayBuffer> {
    const mediaServerUrl = env.NEXT_PUBLIC_MEDIA_SERVER_URL;
    if (!mediaServerUrl) {
      throw new Error("NEXT_PUBLIC_MEDIA_SERVER_URL is not configured");
    }

    const presignedUrl = await this.getOrFetchPresignedUrl();
    const url = `${mediaServerUrl}/audio?url=${encodeURIComponent(presignedUrl)}&start=${start}&end=${end}&format=fmp4`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch slice: ${response.status}`);
    }

    return response.arrayBuffer();
  }

  private queueAppend(data: ArrayBuffer, offset: number): void {
    this.appendQueue.push({ data, offset });
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

    const item = this.appendQueue.shift();
    if (!item) return;

    this.isAppending = true;

    try {
      this.sourceBuffer.timestampOffset = item.offset;
      this.sourceBuffer.appendBuffer(item.data);
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
}
