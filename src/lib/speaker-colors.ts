/**
 * Shared speaker color palette for consistent visual representation
 * across waveform viewer and speaker group cards
 */

export type SpeakerColor = {
  /** Background color with transparency for regions/cards */
  bg: string;
  /** Solid border color */
  border: string;
  /** Human-readable name */
  name: string;
  /** Tailwind-compatible class for background */
  bgClass: string;
  /** Tailwind-compatible class for border */
  borderClass: string;
};

export const SPEAKER_COLORS: SpeakerColor[] = [
  {
    bg: "rgba(239, 68, 68, 0.4)",
    border: "#ef4444",
    name: "Red",
    bgClass: "bg-red-500/40",
    borderClass: "border-red-500",
  },
  {
    bg: "rgba(59, 130, 246, 0.4)",
    border: "#3b82f6",
    name: "Blue",
    bgClass: "bg-blue-500/40",
    borderClass: "border-blue-500",
  },
  {
    bg: "rgba(234, 179, 8, 0.4)",
    border: "#eab308",
    name: "Yellow",
    bgClass: "bg-yellow-500/40",
    borderClass: "border-yellow-500",
  },
  {
    bg: "rgba(34, 197, 94, 0.4)",
    border: "#22c55e",
    name: "Green",
    bgClass: "bg-green-500/40",
    borderClass: "border-green-500",
  },
  {
    bg: "rgba(168, 85, 247, 0.4)",
    border: "#a855f7",
    name: "Purple",
    bgClass: "bg-purple-500/40",
    borderClass: "border-purple-500",
  },
  {
    bg: "rgba(249, 115, 22, 0.4)",
    border: "#f97316",
    name: "Orange",
    bgClass: "bg-orange-500/40",
    borderClass: "border-orange-500",
  },
  {
    bg: "rgba(236, 72, 153, 0.4)",
    border: "#ec4899",
    name: "Pink",
    bgClass: "bg-pink-500/40",
    borderClass: "border-pink-500",
  },
  {
    bg: "rgba(20, 184, 166, 0.4)",
    border: "#14b8a6",
    name: "Teal",
    bgClass: "bg-teal-500/40",
    borderClass: "border-teal-500",
  },
];

/**
 * Get color for a speaker by index
 * Cycles through colors if more speakers than colors
 */
export function getSpeakerColor(speakerIndex: number): SpeakerColor {
  return SPEAKER_COLORS[speakerIndex % SPEAKER_COLORS.length]!;
}

/**
 * Get raw background color string for waveform regions
 * Compatible with WaveSurfer.js region color format
 */
export function getSpeakerBgColor(speakerIndex: number): string {
  return getSpeakerColor(speakerIndex).bg;
}

/**
 * Get highlighted (selected) background color
 * Increases opacity from 0.4 to 0.7
 */
export function getSpeakerHighlightColor(speakerIndex: number): string {
  return getSpeakerColor(speakerIndex).bg.replace("0.4", "0.7");
}
