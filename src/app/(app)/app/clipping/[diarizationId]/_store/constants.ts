export const TIMELINE_CONSTANTS = {
  // Zoom range: 10% = entire audio visible, 100% = 15 seconds visible
  MIN_ZOOM: 10,
  MAX_ZOOM: 100,
  DEFAULT_ZOOM: 10, // Start fully zoomed out
  ZOOM_IN_TARGET: 15, // Seconds visible at max zoom

  // Wheel zoom settings
  WHEEL_ZOOM_SPEED: 10, // Zoom units per deltaY=100

  // Progressive waveform settings
  WAVEFORM_DEBOUNCE_MS: 300, // Delay before triggering detailed calculation
  COARSE_PEAKS: 500, // Fast initial render
  DETAILED_PEAKS: 2000, // High detail after zoom stops
} as const;
