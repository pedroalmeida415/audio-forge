/**
 * Dynamic speaker color generation for consistent visual representation.
 * Colors are generated as HSL values and distributed evenly across the color wheel.
 */

/**
 * Generate a color for a speaker based on their index and total speaker count.
 * Returns an HSL color string (e.g., "hsl(120, 70%, 50%)").
 */
export function generateSpeakerColor(
  index: number,
  totalSpeakers: number,
): string {
  const hue = (index * 360) / Math.max(totalSpeakers, 1);
  return `hsl(${Math.round(hue)}, 70%, 50%)`;
}

/**
 * Create a color map for a list of speakers.
 * Returns a Record from speaker ID to their HSL color string.
 */
export function createSpeakerColorMap(
  speakers: string[],
): Record<string, string> {
  const sorted = [...speakers].sort();
  const total = sorted.length;
  return Object.fromEntries(
    sorted.map((speaker, i) => [speaker, generateSpeakerColor(i, total)]),
  );
}

/**
 * Get a transparent background version of an HSL color.
 * Converts "hsl(h, s%, l%)" to "hsla(h, s%, l%, alpha)".
 */
export function withAlpha(hslColor: string, alpha: number): string {
  return hslColor.replace("hsl(", "hsla(").replace(")", `, ${alpha})`);
}
