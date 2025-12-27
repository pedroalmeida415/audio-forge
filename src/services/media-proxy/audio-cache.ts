import { createHash } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";

interface CacheEntry {
  localPath: string;
  storageKey: string;
  size: number;
  createdAt: number;
  lastAccess: number;
}

interface AudioCacheConfig {
  cacheDir: string;
  maxSizeBytes: number;
  ttlMs: number;
}

const DEFAULT_CONFIG: AudioCacheConfig = {
  cacheDir: join(tmpdir(), "audio-forge-cache"),
  maxSizeBytes: 1024 * 1024 * 1024, // 1GB
  ttlMs: 60 * 60 * 1000, // 1 hour
};

/**
 * LRU Audio Cache for storing downloaded source audio files
 *
 * Prevents repeated R2 downloads for the same source file.
 * Uses LRU eviction when cache exceeds max size.
 */
export class AudioCache {
  private entries: Map<string, CacheEntry> = new Map();
  private config: AudioCacheConfig;
  private s3Client: S3Client;
  private bucket: string;
  private pendingDownloads: Map<string, Promise<string>> = new Map();
  private initialized = false;

  constructor(
    s3Client: S3Client,
    bucket: string,
    config: Partial<AudioCacheConfig> = {},
  ) {
    this.s3Client = s3Client;
    this.bucket = bucket;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize cache directory and recover existing entries
   */
  private initialize(): void {
    if (this.initialized) return;

    // Ensure cache directory exists
    if (!existsSync(this.config.cacheDir)) {
      mkdirSync(this.config.cacheDir, { recursive: true });
    }

    // Recover existing cache entries from disk
    this.recoverFromDisk();
    this.initialized = true;
  }

  /**
   * Recover cache entries from disk on startup
   */
  private recoverFromDisk(): void {
    try {
      const files = readdirSync(this.config.cacheDir);

      for (const file of files) {
        if (!file.endsWith(".audio")) continue;

        const localPath = join(this.config.cacheDir, file);
        try {
          const stats = statSync(localPath);
          const age = Date.now() - stats.mtimeMs;

          // Skip expired files
          if (age > this.config.ttlMs) {
            unlinkSync(localPath);
            continue;
          }

          // Extract storage key from filename
          const storageKey = this.filenameToStorageKey(file);

          this.entries.set(storageKey, {
            localPath,
            storageKey,
            size: stats.size,
            createdAt: stats.birthtimeMs,
            lastAccess: stats.atimeMs,
          });
        } catch {
          // Ignore individual file errors
        }
      }

      console.log(
        `[AudioCache] Recovered ${this.entries.size} entries from disk`,
      );
    } catch (error) {
      console.warn("[AudioCache] Failed to recover from disk:", error);
    }
  }

  /**
   * Convert storage key to safe filename
   */
  private storageKeyToFilename(key: string): string {
    const hash = createHash("sha256").update(key).digest("hex").slice(0, 16);
    return `${hash}.audio`;
  }

  /**
   * Convert filename back to storage key (not possible - use hash as lookup key)
   */
  private filenameToStorageKey(filename: string): string {
    // We can't reverse the hash, so just use the filename as a pseudo-key
    // Real keys are tracked in the entries map
    return filename.replace(".audio", "");
  }

  /**
   * Get or fetch audio file from cache
   *
   * Returns local file path. Downloads from R2 if not cached.
   * Handles concurrent requests for same file.
   */
  async getOrFetch(storageKey: string): Promise<string> {
    this.initialize();

    // Check if already cached and valid
    const cached = this.entries.get(storageKey);
    if (cached && !this.isExpired(cached) && existsSync(cached.localPath)) {
      cached.lastAccess = Date.now();
      return cached.localPath;
    }

    // Check if download already in progress
    const pendingDownload = this.pendingDownloads.get(storageKey);
    if (pendingDownload) {
      return pendingDownload;
    }

    // Start new download
    const downloadPromise = this.downloadAndCache(storageKey);
    this.pendingDownloads.set(storageKey, downloadPromise);

    try {
      const localPath = await downloadPromise;
      return localPath;
    } finally {
      this.pendingDownloads.delete(storageKey);
    }
  }

  /**
   * Check if cache entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.createdAt > this.config.ttlMs;
  }

  /**
   * Download file from R2 and add to cache
   */
  private async downloadAndCache(storageKey: string): Promise<string> {
    const filename = this.storageKeyToFilename(storageKey);
    const localPath = join(this.config.cacheDir, filename);

    console.log(`[AudioCache] Downloading: ${storageKey}`);

    // Download from R2
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    });

    const response = await this.s3Client.send(command);
    const stream = response.Body as Readable;

    // Write to local file
    await new Promise<void>((resolve, reject) => {
      const writeStream = createWriteStream(localPath);
      stream.pipe(writeStream);
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });

    // Get file size
    const stats = statSync(localPath);

    // Add to cache entries
    const entry: CacheEntry = {
      localPath,
      storageKey,
      size: stats.size,
      createdAt: Date.now(),
      lastAccess: Date.now(),
    };
    this.entries.set(storageKey, entry);

    // Enforce max size (async, don't await)
    this.enforceMaxSize().catch((err) => {
      console.warn("[AudioCache] Failed to enforce max size:", err);
    });

    console.log(
      `[AudioCache] Cached: ${storageKey} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`,
    );

    return localPath;
  }

  /**
   * Enforce max cache size using LRU eviction
   */
  private async enforceMaxSize(): Promise<void> {
    // Calculate total size
    let totalSize = 0;
    for (const entry of this.entries.values()) {
      totalSize += entry.size;
    }

    if (totalSize <= this.config.maxSizeBytes) {
      return;
    }

    // Sort by last access time (oldest first)
    const sorted = Array.from(this.entries.values()).sort(
      (a, b) => a.lastAccess - b.lastAccess,
    );

    // Remove oldest entries until under limit
    for (const entry of sorted) {
      if (totalSize <= this.config.maxSizeBytes) break;

      try {
        if (existsSync(entry.localPath)) {
          unlinkSync(entry.localPath);
        }
        this.entries.delete(entry.storageKey);
        totalSize -= entry.size;
        console.log(`[AudioCache] Evicted: ${entry.storageKey}`);
      } catch {
        // Ignore individual delete errors
      }
    }
  }

  /**
   * Remove expired entries
   */
  async cleanup(): Promise<void> {
    this.initialize();

    const now = Date.now();
    const expired: string[] = [];

    for (const [key, entry] of this.entries) {
      if (now - entry.createdAt > this.config.ttlMs) {
        expired.push(key);
      }
    }

    for (const key of expired) {
      const entry = this.entries.get(key);
      if (entry) {
        try {
          if (existsSync(entry.localPath)) {
            unlinkSync(entry.localPath);
          }
        } catch {
          // Ignore
        }
        this.entries.delete(key);
      }
    }

    if (expired.length > 0) {
      console.log(`[AudioCache] Cleaned up ${expired.length} expired entries`);
    }
  }

  /**
   * Clear all cached files
   */
  async clear(): Promise<void> {
    this.initialize();

    try {
      rmSync(this.config.cacheDir, { recursive: true, force: true });
      this.entries.clear();
      mkdirSync(this.config.cacheDir, { recursive: true });
      console.log("[AudioCache] Cache cleared");
    } catch (error) {
      console.error("[AudioCache] Failed to clear cache:", error);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    entryCount: number;
    totalSizeBytes: number;
    maxSizeBytes: number;
    cacheDir: string;
  } {
    let totalSize = 0;
    for (const entry of this.entries.values()) {
      totalSize += entry.size;
    }

    return {
      entryCount: this.entries.size,
      totalSizeBytes: totalSize,
      maxSizeBytes: this.config.maxSizeBytes,
      cacheDir: this.config.cacheDir,
    };
  }
}

// Singleton instance (created lazily)
let audioCacheInstance: AudioCache | null = null;

/**
 * Get the singleton AudioCache instance
 */
export function getAudioCache(s3Client: S3Client, bucket: string): AudioCache {
  if (!audioCacheInstance) {
    audioCacheInstance = new AudioCache(s3Client, bucket);
  }
  return audioCacheInstance;
}
