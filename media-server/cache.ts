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
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

interface CacheEntry {
  path: string;
  storageKey: string;
  lastAccessed: number;
  size: number;
}

interface CacheIndex {
  entries: Array<{
    storageKey: string;
    filename: string;
    lastAccessed: number;
    size: number;
  }>;
}

interface MediaCacheConfig {
  cacheDir: string;
  maxSizeBytes: number;
  maxAgeMs: number;
  // R2 configuration
  r2Endpoint: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2Bucket: string;
}

export class MediaCache {
  private entries: Map<string, CacheEntry> = new Map();
  private config: MediaCacheConfig;
  private s3Client: S3Client;
  private totalSize = 0;
  private downloadLocks: Map<string, Promise<string>> = new Map();
  private indexPath: string;
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: MediaCacheConfig) {
    this.config = config;
    this.indexPath = join(config.cacheDir, "cache-index.json");

    this.s3Client = new S3Client({
      region: "auto",
      endpoint: config.r2Endpoint,
      forcePathStyle: true, // Use path-style URLs to avoid bucket subdomain resolving to blocked IP
      credentials: {
        accessKeyId: config.r2AccessKeyId,
        secretAccessKey: config.r2SecretAccessKey,
      },
    });

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
        this.entries.set(entry.storageKey, {
          path: filePath,
          storageKey: entry.storageKey,
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
        storageKey: entry.storageKey,
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
  get(storageKey: string): string | null {
    const entry = this.entries.get(storageKey);
    if (!entry) return null;

    // Check if file still exists
    if (!existsSync(entry.path)) {
      this.entries.delete(storageKey);
      this.totalSize -= entry.size;
      this.saveIndex();
      return null;
    }

    // Check if expired
    if (Date.now() - entry.lastAccessed > this.config.maxAgeMs) {
      this.remove(storageKey);
      return null;
    }

    // Update last accessed time (resets the expiration timer)
    entry.lastAccessed = Date.now();
    this.saveIndex();

    return entry.path;
  }

  /**
   * Get or download file from R2
   * Uses a lock to prevent duplicate downloads of the same file
   */
  async getOrDownload(storageKey: string): Promise<string> {
    // Check cache first
    const cached = this.get(storageKey);
    if (cached) return cached;

    // Check if already downloading
    const existingDownload = this.downloadLocks.get(storageKey);
    if (existingDownload) {
      return existingDownload;
    }

    // Start download
    const downloadPromise = this.download(storageKey);
    this.downloadLocks.set(storageKey, downloadPromise);

    try {
      const path = await downloadPromise;
      return path;
    } finally {
      this.downloadLocks.delete(storageKey);
    }
  }

  private async download(storageKey: string): Promise<string> {
    // Evict if necessary before downloading
    await this.evictIfNeeded();

    const localPath = this.getLocalPath(storageKey);

    const command = new GetObjectCommand({
      Bucket: this.config.r2Bucket,
      Key: storageKey,
    });

    const response = await this.s3Client.send(command);

    if (!response.Body) {
      throw new Error(`No body in R2 response for key: ${storageKey}`);
    }

    // Stream to disk
    await pipeline(response.Body as Readable, createWriteStream(localPath));

    // Get file size
    const stats = statSync(localPath);
    const size = stats.size;

    // Add to cache
    this.entries.set(storageKey, {
      path: localPath,
      storageKey,
      lastAccessed: Date.now(),
      size,
    });
    this.totalSize += size;

    // Persist cache index
    this.saveIndex();

    console.log(
      `[MediaCache] Downloaded ${storageKey} (${(size / 1024 / 1024).toFixed(2)} MB)`,
    );

    return localPath;
  }

  /**
   * Remove entry from cache
   */
  private remove(storageKey: string): void {
    const entry = this.entries.get(storageKey);
    if (!entry) return;

    try {
      if (existsSync(entry.path)) {
        rmSync(entry.path);
      }
    } catch {
      // Ignore removal errors
    }

    this.totalSize -= entry.size;
    this.entries.delete(storageKey);
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
   * Extract file ID from storage key for use as cache filename.
   * StorageKey format examples:
   * - "diarization/{userId}/{fileId}.flac" -> "{fileId}.flac"
   * - "clips/{userId}/{segmentId}.flac" -> "{segmentId}.flac"
   */
  private getLocalPath(storageKey: string): string {
    // Extract filename (last segment of the path)
    const filename = basename(storageKey);
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
