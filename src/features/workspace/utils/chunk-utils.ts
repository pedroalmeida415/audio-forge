/**
 * Chunk-based utilities for timeline virtualization.
 *
 * The timeline is divided into fixed-duration chunks (10 seconds each).
 * This enables virtualization - only visible chunks are rendered.
 */

/** Duration of each chunk in seconds */
export const CHUNK_DURATION = 10;

/**
 * Get the total number of chunks for a given audio duration.
 */
export function getChunkCount(duration: number): number {
  if (duration <= 0) return 0;
  return Math.ceil(duration / CHUNK_DURATION);
}

/**
 * Get the chunk index for a given time.
 */
export function getChunkForTime(time: number): number {
  return Math.floor(time / CHUNK_DURATION);
}

/**
 * Get the time range (start/end) for a given chunk index.
 */
export function getChunkTimeRange(
  chunkIndex: number,
  duration?: number,
): { start: number; end: number } {
  const start = chunkIndex * CHUNK_DURATION;
  const end = duration
    ? Math.min((chunkIndex + 1) * CHUNK_DURATION, duration)
    : (chunkIndex + 1) * CHUNK_DURATION;

  return { start, end };
}

/**
 * Get the pixel range for a given chunk at a specific pixels-per-second rate.
 */
export function getChunkPixelRange(
  chunkIndex: number,
  pixelsPerSecond: number,
  duration?: number,
): { start: number; width: number } {
  const timeRange = getChunkTimeRange(chunkIndex, duration);
  return {
    start: timeRange.start * pixelsPerSecond,
    width: (timeRange.end - timeRange.start) * pixelsPerSecond,
  };
}

/**
 * Get the visible chunk indices for a given scroll position and container width.
 * Includes overscan buffer for smooth scrolling.
 */
export function getVisibleChunkIndices(
  scrollLeft: number,
  containerWidth: number,
  pixelsPerSecond: number,
  duration: number,
  overscan = 2,
): { startIndex: number; endIndex: number } {
  if (duration <= 0 || pixelsPerSecond <= 0) {
    return { startIndex: 0, endIndex: 0 };
  }

  const startTime = scrollLeft / pixelsPerSecond;
  const endTime = (scrollLeft + containerWidth) / pixelsPerSecond;

  const startIndex = Math.max(0, getChunkForTime(startTime) - overscan);
  const endIndex = Math.min(
    getChunkCount(duration) - 1,
    getChunkForTime(endTime) + overscan,
  );

  return { startIndex, endIndex };
}
