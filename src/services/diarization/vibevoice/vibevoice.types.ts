import { Data } from "effect";

export interface VibeVoiceSegment {
  /** Speaker index (0, 1, 2, …) */
  speaker: number;
  /** Start time in seconds */
  start: number;
  /** End time in seconds */
  end: number;
  /** Transcribed content */
  content: string;
}

export interface TranscribeParams {
  /** Presigned URL to the audio file in R2 */
  audioUrl: string;
  /** Maximum duration (seconds) — streaming stops when timestamps exceed this */
  maxDurationSeconds: number;
}

export interface TranscribeResult {
  segments: VibeVoiceSegment[];
  /** The raw accumulated text from the model */
  rawText: string;
}

export class VibeVoiceError extends Data.TaggedError("VibeVoiceError")<{
  operation: "transcribe" | "health";
  message: string;
  cause?: unknown;
}> {}
