/**
 * LRU cache for segment audio blobs.
 *
 * Manages HTMLAudioElement instances and blob URLs for segment playback.
 * Playing segments are exempt from eviction.
 */

interface CachedAudio {
  segmentId: string;
  audioElement: HTMLAudioElement;
  blobUrl: string;
  lastAccessed: number;
}

export class AudioCache {
  private cache: Map<string, CachedAudio> = new Map();
  private playingIds: Set<string> = new Set();
  private maxSize: number;

  constructor(maxSize = 10) {
    this.maxSize = maxSize;
  }

  /**
   * Get cached audio or fetch and create new entry.
   */
  async getOrCreate(
    segmentId: string,
    storageKey: string,
    startMs: number,
    endMs: number,
  ): Promise<CachedAudio> {
    // Check cache first
    const existing = this.cache.get(segmentId);
    if (existing) {
      existing.lastAccessed = Date.now();
      return existing;
    }

    // Evict if over limit (but never evict playing segments)
    this.evictIfNeeded();

    // Fetch audio slice from media proxy
    const url = `/api/media-proxy?storageKey=${encodeURIComponent(storageKey)}&startMs=${startMs}&endMs=${endMs}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.status}`);
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const audioElement = new Audio(blobUrl);
    audioElement.preload = "auto";

    const cached: CachedAudio = {
      segmentId,
      audioElement,
      blobUrl,
      lastAccessed: Date.now(),
    };

    this.cache.set(segmentId, cached);
    return cached;
  }

  /**
   * Get cached audio without fetching.
   */
  get(segmentId: string): CachedAudio | undefined {
    const cached = this.cache.get(segmentId);
    if (cached) {
      cached.lastAccessed = Date.now();
    }
    return cached;
  }

  /**
   * Mark a segment as playing (exempt from eviction).
   */
  markPlaying(segmentId: string): void {
    this.playingIds.add(segmentId);
  }

  /**
   * Mark a segment as stopped (eligible for eviction).
   */
  markStopped(segmentId: string): void {
    this.playingIds.delete(segmentId);
  }

  /**
   * Check if a segment is currently playing.
   */
  isPlaying(segmentId: string): boolean {
    return this.playingIds.has(segmentId);
  }

  /**
   * Release a cached audio entry, revoking its blob URL.
   * Does nothing if the segment is currently playing.
   */
  release(segmentId: string): void {
    // Don't release if still playing
    if (this.playingIds.has(segmentId)) {
      return;
    }

    const cached = this.cache.get(segmentId);
    if (!cached) return;

    // Cleanup audio element
    cached.audioElement.pause();
    cached.audioElement.src = "";

    // Revoke blob URL to free memory
    URL.revokeObjectURL(cached.blobUrl);

    this.cache.delete(segmentId);
  }

  /**
   * Release all non-playing cached entries.
   */
  releaseAll(): void {
    for (const [segmentId] of this.cache) {
      if (!this.playingIds.has(segmentId)) {
        this.release(segmentId);
      }
    }
  }

  /**
   * Stop and release all entries, including playing ones.
   */
  destroy(): void {
    for (const [segmentId, cached] of this.cache) {
      cached.audioElement.pause();
      cached.audioElement.src = "";
      URL.revokeObjectURL(cached.blobUrl);
      this.cache.delete(segmentId);
    }
    this.playingIds.clear();
  }

  /**
   * Get the number of cached entries.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Evict least recently used entries if cache is at capacity.
   * Never evicts playing segments.
   */
  private evictIfNeeded(): void {
    if (this.cache.size < this.maxSize) return;

    // Find oldest non-playing entry
    let oldestId: string | null = null;
    let oldestTime = Number.POSITIVE_INFINITY;

    for (const [id, cached] of this.cache) {
      // Skip playing segments
      if (this.playingIds.has(id)) continue;

      if (cached.lastAccessed < oldestTime) {
        oldestTime = cached.lastAccessed;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.release(oldestId);
    }
  }
}
