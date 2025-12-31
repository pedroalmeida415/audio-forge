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
 * Formats seconds to a timestamp string with milliseconds (MM:SS.mmm or H:MM:SS.mmm)
 * @param seconds - Time in seconds
 * @returns Formatted timestamp string with milliseconds
 */
export function formatTimestampWithMs(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "00:00.000";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);

  const mmss = `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;

  if (hours > 0) {
    return `${hours}:${mmss}`;
  }

  return mmss;
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
 * Parses a timestamp string to seconds
 * Supports formats: "SS", "M:SS", "MM:SS", "H:MM:SS"
 * Also supports decimal seconds: "1:30.5"
 * @param timestamp - Timestamp string to parse
 * @returns Time in seconds, or null if invalid
 */
export function parseTimestamp(timestamp: string): number | null {
  const trimmed = timestamp.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(":");

  // Parse each part, allowing decimal in the last part
  const parsedParts = parts.map((p, i) => {
    const num =
      i === parts.length - 1 ? Number.parseFloat(p) : Number.parseInt(p, 10);
    return num;
  });

  // Check for NaN or negative values
  if (parsedParts.some((p) => !Number.isFinite(p) || p < 0)) return null;

  // Validate ranges (minutes and seconds should be < 60 except for pure seconds)
  if (parts.length === 1) {
    // Pure seconds
    return parsedParts[0];
  }

  if (parts.length === 2) {
    // M:SS or MM:SS
    const [minutes, seconds] = parsedParts;
    if (seconds >= 60) return null;
    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    // H:MM:SS
    const [hours, minutes, seconds] = parsedParts;
    if (minutes >= 60 || seconds >= 60) return null;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return null;
}
