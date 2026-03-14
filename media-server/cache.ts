import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

interface CacheEntry {
  path: string;
  /** Cache key derived from the URL pathname (stable across presigned URL renewals) */
  cacheKey: string;
  lastAccessed: number;
  size: number;
}

interface CacheIndex {
  entries: Array<{
    cacheKey: string;
    filename: string;
    lastAccessed: number;
    size: number;
  }>;
}

interface MediaCacheConfig {
  cacheDir: string;
  maxSizeBytes: number;
  maxAgeMs: number;
}

/**
 * Derive a stable cache key from a presigned URL.
 *
 * Presigned URLs change on every request (new signature, expiry, etc.),
 * but the pathname (the object key) is always the same for the same file.
 * We use the pathname as the cache key so that different presigned URLs
 * for the same object hit the same cache entry.
 *
 * Example:
 *   https://r2.example.com/bucket/sources/user123/file.flac?X-Amz-Signature=...
 *   → "/bucket/sources/user123/file.flac"
 */
export function deriveCacheKey(presignedUrl: string): string {
  return new URL(presignedUrl).pathname;
}

export class MediaCache {
  private entries: Map<string, CacheEntry> = new Map();
  private config: MediaCacheConfig;
  private totalSize = 0;
  private downloadLocks: Map<string, Promise<string>> = new Map();
  private indexPath: string;
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: MediaCacheConfig) {
    this.config = config;
    this.indexPath = join(config.cacheDir, "cache-index.json");

    // Ensure cache directory exists
    if (!existsSync(this.config.cacheDir)) {
      mkdirSync(this.config.cacheDir, { recursive: true });
    }

    // Load persisted cache index
    this.loadIndex();
  }

  /**
   * Load cache index from disk and validate entries
   */
  private loadIndex(): void {
    if (!existsSync(this.indexPath)) {
      console.log("[MediaCache] No cache index found, starting fresh");
      return;
    }

    try {
      const data = readFileSync(this.indexPath, "utf-8");
      const index: CacheIndex = JSON.parse(data);

      let loadedCount = 0;
      let skippedCount = 0;

      for (const entry of index.entries) {
        const filePath = join(this.config.cacheDir, entry.filename);

        // Verify file still exists on disk
        if (!existsSync(filePath)) {
          skippedCount++;
          continue;
        }

        // Verify file size matches (corruption check)
        const stats = statSync(filePath);
        if (stats.size !== entry.size) {
          console.log(
            `[MediaCache] Size mismatch for ${entry.filename}, removing`,
          );
          rmSync(filePath, { force: true });
          skippedCount++;
          continue;
        }

        // Check if expired
        if (Date.now() - entry.lastAccessed > this.config.maxAgeMs) {
          console.log(`[MediaCache] Expired entry ${entry.filename}, removing`);
          rmSync(filePath, { force: true });
          skippedCount++;
          continue;
        }

        // Entry is valid, add to cache
        this.entries.set(entry.cacheKey, {
          path: filePath,
          cacheKey: entry.cacheKey,
          lastAccessed: entry.lastAccessed,
          size: entry.size,
        });
        this.totalSize += entry.size;
        loadedCount++;
      }

      console.log(
        `[MediaCache] Loaded ${loadedCount} entries from index (skipped ${skippedCount})`,
      );
      console.log(
        `[MediaCache] Total cached size: ${(this.totalSize / 1024 / 1024).toFixed(2)} MB`,
      );
    } catch (error) {
      console.error("[MediaCache] Failed to load cache index:", error);
      // Start fresh if index is corrupted
      this.entries.clear();
      this.totalSize = 0;
    }
  }

  /**
   * Save cache index to disk (debounced to avoid excessive writes)
   */
  private saveIndex(): void {
    // Debounce saves to avoid excessive disk writes
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(() => {
      this.saveIndexNow();
      this.saveDebounceTimer = null;
    }, 1000);
  }

  /**
   * Immediately save cache index to disk
   */
  private saveIndexNow(): void {
    const index: CacheIndex = {
      entries: Array.from(this.entries.values()).map((entry) => ({
        cacheKey: entry.cacheKey,
        filename: basename(entry.path),
        lastAccessed: entry.lastAccessed,
        size: entry.size,
      })),
    };

    try {
      writeFileSync(this.indexPath, JSON.stringify(index, null, 2));
    } catch (error) {
      console.error("[MediaCache] Failed to save cache index:", error);
    }
  }

  /**
   * Get cached file path, or null if not cached
   */
  get(cacheKey: string): string | null {
    const entry = this.entries.get(cacheKey);
    if (!entry) return null;

    // Check if file still exists
    if (!existsSync(entry.path)) {
      this.entries.delete(cacheKey);
      this.totalSize -= entry.size;
      this.saveIndex();
      return null;
    }

    // Check if expired
    if (Date.now() - entry.lastAccessed > this.config.maxAgeMs) {
      this.remove(cacheKey);
      return null;
    }

    // Update last accessed time (resets the expiration timer)
    entry.lastAccessed = Date.now();
    this.saveIndex();

    return entry.path;
  }

  /**
   * Get or download file from the provided URL.
   *
   * The cacheKey is derived from the URL pathname (stable across presigned URL renewals).
   * On cache miss, the file is downloaded using the provided presigned URL.
   * Uses a lock to prevent duplicate downloads of the same file.
   */
  async getOrDownload(presignedUrl: string): Promise<string> {
    const cacheKey = deriveCacheKey(presignedUrl);

    // Check cache first
    const cached = this.get(cacheKey);
    if (cached) return cached;

    // Check if already downloading
    const existingDownload = this.downloadLocks.get(cacheKey);
    if (existingDownload) {
      return existingDownload;
    }

    // Start download
    const downloadPromise = this.download(presignedUrl, cacheKey);
    this.downloadLocks.set(cacheKey, downloadPromise);

    try {
      const path = await downloadPromise;
      return path;
    } finally {
      this.downloadLocks.delete(cacheKey);
    }
  }

  /**
   * Download a file from a presigned URL to the local cache.
   */
  private async download(
    presignedUrl: string,
    cacheKey: string,
  ): Promise<string> {
    // Evict if necessary before downloading
    await this.evictIfNeeded();

    const localPath = this.getLocalPath(cacheKey);

    // Download via HTTP (presigned URL is self-authenticating)
    const response = await fetch(presignedUrl);

    if (!response.ok) {
      throw new Error(
        `Failed to download from presigned URL: ${response.status} ${response.statusText}`,
      );
    }

    if (!response.body) {
      throw new Error("No body in download response");
    }

    // Stream response body to disk
    const nodeStream = Readable.fromWeb(
      response.body as ReadableStream<Uint8Array>,
    );
    await pipeline(nodeStream, createWriteStream(localPath));

    // Get file size
    const stats = statSync(localPath);
    const size = stats.size;

    // Add to cache
    this.entries.set(cacheKey, {
      path: localPath,
      cacheKey,
      lastAccessed: Date.now(),
      size,
    });
    this.totalSize += size;

    // Persist cache index
    this.saveIndex();

    console.log(
      `[MediaCache] Downloaded ${cacheKey} (${(size / 1024 / 1024).toFixed(2)} MB)`,
    );

    return localPath;
  }

  /**
   * Remove entry from cache
   */
  private remove(cacheKey: string): void {
    const entry = this.entries.get(cacheKey);
    if (!entry) return;

    try {
      if (existsSync(entry.path)) {
        rmSync(entry.path);
      }
    } catch {
      // Ignore removal errors
    }

    this.totalSize -= entry.size;
    this.entries.delete(cacheKey);
    this.saveIndex();
  }

  /**
   * Evict oldest entries until cache is under limit
   */
  private async evictIfNeeded(): Promise<void> {
    if (this.totalSize <= this.config.maxSizeBytes) return;

    // Sort by last accessed (oldest first)
    const sorted = Array.from(this.entries.entries()).sort(
      (a, b) => a[1].lastAccessed - b[1].lastAccessed,
    );

    // Remove oldest until under limit
    for (const [key] of sorted) {
      if (this.totalSize <= this.config.maxSizeBytes * 0.8) {
        break; // Target 80% capacity to avoid frequent evictions
      }
      this.remove(key);
      console.log(`[MediaCache] Evicted ${key}`);
    }
  }

  /**
   * Extract a stable filename from the cache key (URL pathname).
   * Cache key example: "/bucket/sources/user123/1710342000-abc.flac"
   * → "1710342000-abc.flac"
   */
  private getLocalPath(cacheKey: string): string {
    const filename = basename(cacheKey);
    return join(this.config.cacheDir, filename);
  }

  /**
   * Get cache statistics
   */
  getStats(): { entries: number; sizeBytes: number } {
    return {
      entries: this.entries.size,
      sizeBytes: this.totalSize,
    };
  }

  /**
   * Flush pending index writes (useful for graceful shutdown)
   */
  flush(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    this.saveIndexNow();
  }
}
