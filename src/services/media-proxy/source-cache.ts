import { createHash } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
} from "node:fs";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "~/env";

interface CacheEntry {
  path: string;
  storageKey: string;
  lastAccessed: number;
  size: number;
}

interface SourceCacheConfig {
  cacheDir: string;
  maxSizeBytes: number;
  maxAgeMs: number;
}

const DEFAULT_CONFIG: SourceCacheConfig = {
  cacheDir: process.env.MEDIA_PROXY_CACHE_DIR ?? "/tmp/audio-forge-cache",
  maxSizeBytes:
    (Number(process.env.MEDIA_PROXY_CACHE_MAX_SIZE_GB) || 5) *
    1024 *
    1024 *
    1024,
  maxAgeMs: 24 * 60 * 60 * 1000, // 24 hours
};

class SourceCacheService {
  private entries: Map<string, CacheEntry> = new Map();
  private config: SourceCacheConfig;
  private s3Client: S3Client;
  private bucket: string;
  private totalSize = 0;
  private downloadLocks: Map<string, Promise<string>> = new Map();

  constructor(config: Partial<SourceCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.bucket = env.CLOUDFLARE_R2_BUCKET;

    this.s3Client = new S3Client({
      region: "auto",
      endpoint: env.CLOUDFLARE_R2_ENDPOINT,
      credentials: {
        accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
        secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
      },
    });

    // Ensure cache directory exists
    if (!existsSync(this.config.cacheDir)) {
      mkdirSync(this.config.cacheDir, { recursive: true });
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
      return null;
    }

    // Check if expired
    if (Date.now() - entry.lastAccessed > this.config.maxAgeMs) {
      this.remove(storageKey);
      return null;
    }

    // Update last accessed time
    entry.lastAccessed = Date.now();
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
      Bucket: this.bucket,
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
    }
  }

  /**
   * Generate deterministic local path from storage key
   */
  private getLocalPath(storageKey: string): string {
    const hash = createHash("sha256").update(storageKey).digest("hex");
    return `${this.config.cacheDir}/${hash}`;
  }

  /**
   * Get cache statistics
   */
  getStats(): { totalSize: number; entryCount: number } {
    return {
      totalSize: this.totalSize,
      entryCount: this.entries.size,
    };
  }
}

// Singleton instance
let instance: SourceCacheService | null = null;

export function getSourceCache(): SourceCacheService {
  if (!instance) {
    instance = new SourceCacheService();
  }
  return instance;
}

export { SourceCacheService, type SourceCacheConfig };
