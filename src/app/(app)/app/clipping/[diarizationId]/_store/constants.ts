export const TIMELINE_CONSTANTS = {
  // Zoom range: 50% = entire audio visible, 150% = 15 seconds visible
  MIN_ZOOM: 50,
  MAX_ZOOM: 150,
  DEFAULT_ZOOM: 100, // Start fully zoomed out
  ZOOM_IN_TARGET: 10, // Seconds visible at max zoom

  // Wheel zoom settings
  ZOOM_FACTOR: 1.2, // Exponential zoom multiplier per wheel tick

  // Waveform settings
  PEAKS_PER_SECOND: 50, // 1 peak per 0.02 seconds - gives ~4px bars at max zoom
} as const;

export const SELECTION_CONSTANTS = {
  // Minimum mouse movement before drag is recognized (prevents accidental drags)
  DRAG_THRESHOLD: 5, // pixels

  // Minimum duration for a valid selection
  MIN_SELECTION_DURATION: 0.1, // seconds
} as const;
