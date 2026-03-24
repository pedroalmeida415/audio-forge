import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { DEFAULT_LOCAL_SPEAKER_COLOR } from "~/lib/speaker-colors";
import {
  type DiarizationInfo,
  type Source,
  segments,
  sources,
  speakers,
} from "~/server/db/schema";
import { Database } from "~/services/infra/database";

// ============================================================================
// Types
// ============================================================================

/** A single diarization segment result from any provider. */
export interface DiarizationSegmentResult {
  /** Speaker label (e.g. "SPEAKER_00") */
  speaker: string;
  start: number;
  end: number;
  /** Optional transcription text (VibeVoice provides this) */
  transcription?: string;
}

// ============================================================================
// Shared processing logic
// ============================================================================

/**
 * Process a completed diarization result for a source.
 *
 * Creates speaker + segment rows in the DB and marks the source's
 * diarization JSONB as completed. Used by both the Pyannote webhook
 * handler and the VibeVoice worker handler to share a single data flow.
 */
export function processDiarizationCompleted(params: {
  source: Source;
  segments: DiarizationSegmentResult[];
}) {
  return Effect.gen(function* () {
    const { source } = params;
    const db = yield* Database;

    // Extract unique speaker labels
    const speakerLabels = [...new Set(params.segments.map((s) => s.speaker))];

    // Create speaker rows in DB
    const speakerRows = yield* db
      .insert(speakers)
      .values(
        speakerLabels.map((label) => ({
          projectId: source.projectId ?? "",
          userId: source.userId,
          name: label,
          color: DEFAULT_LOCAL_SPEAKER_COLOR,
          sourceId: source.id,
          origin: "diarization" as const,
        })),
      )
      .returning();

    // Build speaker map (label -> speaker row)
    const speakerMap = new Map(
      speakerRows.map((s, i) => {
        const label = speakerLabels[i];
        return [label, s] as const;
      }),
    );

    // Create segment rows (with optional transcriptions)
    yield* db.insert(segments).values(
      params.segments.map((seg) => {
        const matchedSpeaker = speakerMap.get(seg.speaker);
        if (!matchedSpeaker) {
          throw new Error(`Speaker not found in map: ${seg.speaker}`);
        }
        return {
          sourceId: source.id,
          speakerId: matchedSpeaker.id,
          startTime: seg.start,
          endTime: seg.end,
          transcription: seg.transcription || null,
        };
      }),
    );

    // Update source diarization status to completed
    const completedDiarization: DiarizationInfo = {
      ...source.diarization,
      status: "completed",
      completedAt: new Date().toISOString(),
      error: undefined,
    };

    yield* db
      .update(sources)
      .set({ diarization: completedDiarization })
      .where(eq(sources.id, source.id));

    console.log(
      `[Diarization] Completed for source ${source.id}: ${speakerRows.length} speakers, ${params.segments.length} segments`,
    );

    return {
      speakerCount: speakerRows.length,
      segmentCount: params.segments.length,
    };
  });
}
