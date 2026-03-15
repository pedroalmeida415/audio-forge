import type { Job } from "bullmq";
import type { Effect, Layer } from "effect";
import type { ServicesLive } from "../../src/services";

// ============================================================================
// Clip & Segment Types
// ============================================================================

/** All services provided by the AppRuntime */
export type AppContext = Layer.Layer.Success<typeof ServicesLive>;

/** Clip data returned from ensureClipExists for SSE notifications */
export interface ClipData {
  id: string;
  segmentId: string;
  userId: string;
  storageKey: string;
  duration: number;
  createdAt: string;
}

/** Result of ensureClipExists */
export interface EnsureClipResult {
  segmentId: string;
  speakerId: string;
  clip: ClipData;
  segmentTags?: string[] | null;
}

/** Result returned from clip job handlers for SSE notifications */
export interface ClipJobResult {
  segmentId: string;
  speakerId: string;
  clip: ClipData;
  segmentTags?: string[] | null;
}

/** Context needed to create a clip */
export interface SegmentContext {
  segmentId: string;
  speakerId: string;
  userId: string;
  startTime: number;
  endTime: number;
}

// ============================================================================
// Handler Types
// ============================================================================

/** Result returned from LJSpeech export jobs */
export interface LJSpeechExportResult {
  downloadUrl: string;
  fileCount: number;
  totalDuration: number;
  skippedCount: number;
}

/**
 * Base handler type — accepts any BullMQ job and returns an Effect.
 * Individual handlers narrow the job payload type internally.
 */
export type AnyJobHandler = (
  // biome-ignore lint/suspicious/noExplicitAny: BullMQ Worker callback is untyped; individual handlers narrow internally
  job: Job<any>,
) => Effect.Effect<unknown, unknown, AppContext>;

/** Audio processing handler (entryId-based jobs) */
export type JobHandler = AnyJobHandler;

/** Export handler (speaker/export-based jobs) */
export type ExportJobHandler = AnyJobHandler;
