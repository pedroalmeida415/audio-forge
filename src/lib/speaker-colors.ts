/**
 * Speaker color utilities.
 * Colors are HSL values distributed across the color wheel.
 */

/**
 * Default neutral grey color for local speakers.
 * Local speakers start with this color and get a random color on rename.
 */
export const DEFAULT_LOCAL_SPEAKER_COLOR = "hsl(0, 0%, 50%)";

/**
 * Generate a random color for a new speaker.
 * Returns an HSL color string (e.g., "hsl(120, 70%, 50%)").
 */
export function generateSpeakerColor(): string {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 70%, 50%)`;
}

/**
 * Get a transparent background version of an HSL color.
 * Converts "hsl(h, s%, l%)" to "hsla(h, s%, l%, alpha)".
 */
export function withAlpha(hslColor: string, alpha: number): string {
  return hslColor.replace("hsl(", "hsla(").replace(")", `, ${alpha})`);
}
