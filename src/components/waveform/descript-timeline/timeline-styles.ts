/**
 * Descript-style timeline CSS styles and constants
 */

export const TIMELINE_CONSTANTS = {
  /** Height of the timestrip (time markers row) */
  TIMESTRIP_HEIGHT: 24,
  /** Height of the speaker bar */
  SPEAKER_BAR_HEIGHT: 28,
  /** Height of the waveform track */
  TRACK_HEIGHT: 140,
  /** Height of the scrubber bar */
  SCRUBBER_HEIGHT: 4,
  /** Height of the toolbar */
  TOOLBAR_HEIGHT: 44,
  /** Minimum pixels per second for zoom */
  MIN_PX_PER_SEC: 20,
  /** Maximum pixels per second for zoom */
  MAX_PX_PER_SEC: 500,
  /** Default pixels per second */
  DEFAULT_PX_PER_SEC: 80,
  /** Playhead width */
  PLAYHEAD_WIDTH: 2,
  /** Time marker interval in seconds at default zoom */
  MARKER_INTERVAL: 2,
} as const;

export const ZOOM_PRESETS = [
  { label: "25%", value: 25 },
  { label: "50%", value: 50 },
  { label: "75%", value: 75 },
  { label: "100%", value: 100 },
  { label: "150%", value: 150 },
  { label: "200%", value: 200 },
] as const;

/** Calculate zoom value from percentage (relative to default) */
export function zoomPercentToPxPerSec(percent: number): number {
  return (percent / 100) * TIMELINE_CONSTANTS.DEFAULT_PX_PER_SEC;
}

/** Calculate percentage from zoom value */
export function pxPerSecToZoomPercent(pxPerSec: number): number {
  return Math.round((pxPerSec / TIMELINE_CONSTANTS.DEFAULT_PX_PER_SEC) * 100);
}

/** Format time as M:SS.d */
export function formatTime(seconds: number): { main: string; decimal: string } {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return {
    main: `${mins}:${secs.toString().padStart(2, "0")}`,
    decimal: `.${ms}`,
  };
}

/** Format time as simple M:SS */
export function formatTimeSimple(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
