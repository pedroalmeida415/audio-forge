/**
 * Formats seconds to a timestamp string (MM:SS or H:MM:SS)
 * @param seconds - Time in seconds
 * @returns Formatted timestamp string
 */
export function formatTimestamp(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Formats seconds to a duration string (e.g., "5.2s", "2m 30s")
 * @param seconds - Duration in seconds
 * @returns Formatted duration string
 */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0s";

  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);

  if (secs === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${secs}s`;
}

/**
 * Formats a time range as "start - end"
 * @param start - Start time in seconds
 * @param end - End time in seconds
 * @returns Formatted time range string
 */
export function formatTimeRange(start: number, end: number): string {
  return `${formatTimestamp(start)} - ${formatTimestamp(end)}`;
}

/**
 * Calculates duration from start and end times
 * @param start - Start time in seconds
 * @param end - End time in seconds
 * @returns Duration in seconds
 */
export function calculateDuration(start: number, end: number): number {
  return Math.max(0, end - start);
}
