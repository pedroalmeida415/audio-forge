/**
 * MSE Audio Provider
 *
 * Manages progressive audio loading using Media Source Extensions.
 * Self-managing: attaches to an audio element and handles all slice loading
 * automatically based on playback position and seeking.
 *
 * Internally uses milliseconds for precision, converts to seconds only at boundaries.
 */

export interface MSEAudioProviderConfig {
  storageKey: string;
  duration: number; // Duration in seconds (from audio metadata)
  sliceSize?: number; // Seconds per slice, defaults to 15
}

// Preload next slice when within this many ms of slice boundary
const PRELOAD_THRESHOLD_MS = 5000;

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

  // Bound event handlers for cleanup
  private handleTimeUpdate: () => void;
  private handleSeeking: () => void;

  constructor(config: MSEAudioProviderConfig) {
    this.storageKey = config.storageKey;
    this.durationMs = Math.round(config.duration * 1000);
    this.sliceSizeMs = (config.sliceSize ?? 15) * 1000;

    // Bind handlers once for proper cleanup
    this.handleTimeUpdate = this.onTimeUpdate.bind(this);
    this.handleSeeking = this.onSeeking.bind(this);
  }

  /**
   * Attach to an HTML audio element.
   * The provider will automatically manage slice loading based on playback.
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

    // Listen to audio events for automatic slice management
    audioElement.addEventListener("timeupdate", this.handleTimeUpdate);
    audioElement.addEventListener("seeking", this.handleSeeking);
  }

  /**
   * Detach from audio element and cleanup
   */
  detach(): void {
    if (this.audioElement) {
      this.audioElement.removeEventListener(
        "timeupdate",
        this.handleTimeUpdate,
      );
      this.audioElement.removeEventListener("seeking", this.handleSeeking);
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
    if (!this.audioElement) return;
    this.loadAtTime(this.audioElement.currentTime);
  }

  private onSeeking(): void {
    if (!this.audioElement) return;
    this.loadAtTime(this.audioElement.currentTime);
  }

  // ============================================================================
  // Slice Loading
  // ============================================================================

  private onSourceOpen(): void {
    if (!this.mediaSource) return;

    this.sourceBuffer = this.mediaSource.addSourceBuffer(
      'audio/mp4; codecs="mp4a.40.2"',
    );

    this.mediaSource.duration = this.durationMs / 1000;

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
    if (!this.sourceBuffer || !this.mediaSource) return;

    const timeMs = Math.round(time * 1000);
    const currentSliceIndex = Math.floor(timeMs / this.sliceSizeMs);

    // Always load current slice
    this.loadSlice(currentSliceIndex);

    // Preload next slice if within threshold of slice boundary
    const nextSliceStartMs = (currentSliceIndex + 1) * this.sliceSizeMs;
    const msUntilNextSlice = nextSliceStartMs - timeMs;

    if (msUntilNextSlice <= PRELOAD_THRESHOLD_MS && nextSliceStartMs < this.durationMs) {
      this.loadSlice(currentSliceIndex + 1);
    }
  }

  /**
   * Load a specific slice by index (if not already loaded)
   */
  private loadSlice(sliceIndex: number): void {
    const startMs = sliceIndex * this.sliceSizeMs;

    if (startMs >= this.durationMs) return;
    if (this.fetchedSlices.has(sliceIndex)) return;

    const endMs = Math.min(startMs + this.sliceSizeMs, this.durationMs);

    // Check if already buffered
    const checkTimeMs = Math.min(endMs - 100, startMs + this.sliceSizeMs / 2);
    if (this.isTimeBuffered(checkTimeMs / 1000)) return;

    this.fetchAndAppendSlice(sliceIndex, startMs, endMs);
  }

  private async fetchAndAppendSlice(
    sliceIndex: number,
    startMs: number,
    endMs: number,
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
      console.error("[MSEAudioProvider] Failed to fetch slice:", e);
    } finally {
      this.pendingSlices.delete(sliceIndex);
    }
  }

  private async fetchSlice(
    startMs: number,
    endMs: number,
  ): Promise<ArrayBuffer> {
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

    const item = this.appendQueue.shift();
    if (!item) return;

    this.isAppending = true;

    try {
      this.sourceBuffer.timestampOffset = item.offsetMs / 1000;
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
