export const TIMELINE_CONSTANTS = {
  // Zoom range: 10% = entire audio visible, 100% = 15 seconds visible
  MIN_ZOOM: 10,
  MAX_ZOOM: 100,
  DEFAULT_ZOOM: 10, // Start fully zoomed out
  ZOOM_IN_TARGET: 15, // Seconds visible at max zoom

  // Wheel zoom settings
  WHEEL_ZOOM_SPEED: 10, // Zoom units per deltaY=100

  // Waveform settings
  PEAKS_PER_SECOND: 50, // 1 peak per 0.1 seconds - gives ~4px bars at max zoom
} as const;
