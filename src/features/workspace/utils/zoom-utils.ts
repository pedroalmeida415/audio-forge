import { TIMELINE_CONSTANTS } from "~/features/workspace/store/constants";

const { MIN_ZOOM, MAX_ZOOM, ZOOM_IN_TARGET } = TIMELINE_CONSTANTS;

/**
 * Calculates visible timespan using logarithmic interpolation.
 *
 * At MIN_ZOOM (50%): visibleTimespan = duration (entire audio visible)
 * At MAX_ZOOM (150%): visibleTimespan = ZOOM_IN_TARGET (15 seconds)
 *
 * Formula: visibleTimespan = duration * (15/duration)^((zoom-50)/100)
 */
export function calculateVisibleTimespan(
  zoomLevel: number,
  duration: number,
): number {
  if (duration <= 0) return 0;

  // Clamp zoom level
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomLevel));

  // At MIN_ZOOM, exponent = 0, so result = duration * 1 = duration
  // At MAX_ZOOM, exponent = 1, so result = duration * (15/duration) = 15
  const exponent = (zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
  const ratio = ZOOM_IN_TARGET / duration;

  // For short audio where duration <= ZOOM_IN_TARGET, ratio >= 1
  // This naturally clamps the visible timespan to duration
  return duration * ratio ** exponent;
}

/**
 * Calculates pixels per second for the current zoom/container.
 */
export function calculatePixelsPerSecond(
  zoomLevel: number,
  duration: number,
  containerWidth: number,
): number {
  const visibleTimespan = calculateVisibleTimespan(zoomLevel, duration);
  if (visibleTimespan <= 0) return 0;
  return containerWidth / visibleTimespan;
}

/**
 * Converts time (seconds) to pixel position.
 */
export function timeToPixels(
  time: number,
  zoomLevel: number,
  duration: number,
  containerWidth: number,
): number {
  const pps = calculatePixelsPerSecond(zoomLevel, duration, containerWidth);
  return time * pps;
}

/**
 * Converts pixel position to time (seconds).
 */
export function pixelsToTime(
  pixels: number,
  zoomLevel: number,
  duration: number,
  containerWidth: number,
): number {
  const pps = calculatePixelsPerSecond(zoomLevel, duration, containerWidth);
  if (pps <= 0) return 0;
  return pixels / pps;
}

/**
 * Determines if zoom should be enabled for this audio duration.
 * Zoom is disabled for audio shorter than ZOOM_IN_TARGET (15s).
 */
export function isZoomEnabled(duration: number): boolean {
  return duration > ZOOM_IN_TARGET;
}
