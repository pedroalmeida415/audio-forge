export const TIMELINE_CONSTANTS = {
  // Zoom range: 50% = entire audio visible, 500% = 1 second visible
  MIN_ZOOM: 50,
  MAX_ZOOM: 150,
  DEFAULT_ZOOM: 100, // Balanced starting zoom
  ZOOM_IN_TARGET: 1, // Seconds visible at max zoom (150%)

  // Wheel zoom settings
  ZOOM_FACTOR: 1.05, // Lower factor for more granular steps

  // Waveform settings
  PEAKS_PER_SECOND: 50, // 1 peak per 0.02 seconds - gives ~4px bars at max zoom
} as const;

export const SELECTION_CONSTANTS = {
  // Minimum mouse movement before drag is recognized (prevents accidental drags)
  DRAG_THRESHOLD: 5, // pixels

  // Minimum duration for a valid selection
  MIN_SELECTION_DURATION: 0.1, // seconds
} as const;
