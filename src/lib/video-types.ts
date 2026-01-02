/**
 * Accepted video MIME types for upload
 * These formats are commonly supported by FFmpeg for audio extraction
 */
export const ACCEPTED_VIDEO_TYPES = {
  "video/mp4": [".mp4"],
  "video/quicktime": [".mov"],
  "video/x-matroska": [".mkv"],
  "video/webm": [".webm"],
  "video/x-msvideo": [".avi"],
  "video/x-m4v": [".m4v"],
} as const;

/**
 * Check if a MIME type is a video type
 */
export function isVideoMimeType(mimeType: string): boolean {
  return mimeType.startsWith("video/");
}

/**
 * Get all accepted video extensions as a flat array
 */
export function getAcceptedVideoExtensions(): string[] {
  return Object.values(ACCEPTED_VIDEO_TYPES).flat();
}
