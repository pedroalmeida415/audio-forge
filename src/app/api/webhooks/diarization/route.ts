import { eq, sql } from "drizzle-orm";
import { Cause, Data, Effect } from "effect";
import { type NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { DEFAULT_LOCAL_SPEAKER_COLOR } from "~/lib/speaker-colors";
import {
  clippingSessions,
  type DiarizationInfo,
  type LocalSegment,
  type LocalSpeaker,
} from "~/server/db/schema";
import { diarizationEvents } from "~/server/events/diarization-events";
import { AppRuntime } from "~/services";
import { Database } from "~/services/infra/database";

// ============================================================================
// Errors
// ============================================================================

class JsonParseError extends Data.TaggedError("JsonParseError")<{
  cause: unknown;
}> {}

class ValidationError extends Data.TaggedError("ValidationError")<{
  message: string;
  cause: unknown;
}> {}

class SessionNotFoundError extends Data.TaggedError("SessionNotFoundError")<{
  jobId: string;
}> {}

// Pyannote webhook payload schema
const webhookPayloadSchema = z.object({
  jobId: z.string(),
  status: z.enum([
    "pending",
    "created",
    "running",
    "succeeded",
    "failed",
    "canceled",
  ]),
  output: z
    .object({
      diarization: z.array(
        z.object({
          speaker: z.string(),
          start: z.number(),
          end: z.number(),
          confidence: z.number().optional(),
        }),
      ),
    })
    .optional(),
});

const handleWebhook = (request: NextRequest) =>
  Effect.gen(function* () {
    const db = yield* Database;

    // Parse JSON body
    const body = yield* Effect.tryPromise({
      try: () => request.json(),
      catch: (cause) => new JsonParseError({ cause }),
    });

    // Validate payload
    const parseResult = webhookPayloadSchema.safeParse(body);
    if (!parseResult.success) {
      return yield* Effect.fail(
        new ValidationError({
          message: parseResult.error.message,
          cause: parseResult.error,
        }),
      );
    }
    const payload = parseResult.data;

    // Find the clipping session by diarization job ID
    const session = yield* db.query.clippingSessions.findFirst({
      where: sql`${clippingSessions.diarization}->>'jobId' = ${payload.jobId}`,
    });

    if (!session) {
      return yield* Effect.fail(
        new SessionNotFoundError({ jobId: payload.jobId }),
      );
    }

    const now = new Date().toISOString();

    // Update based on status
    if (payload.status === "succeeded" && payload.output) {
      // Extract unique speaker labels from diarization output
      const speakerLabels = [
        ...new Set(payload.output.diarization.map((s) => s.speaker)),
      ];

      // Build local speakers with generated UUIDs (NOT inserted into speakers table)
      // Local speakers start with a neutral grey color - they get a random color on rename
      const localSpeakers: LocalSpeaker[] = speakerLabels.map((label) => ({
        id: uuidv4(),
        label,
        color: DEFAULT_LOCAL_SPEAKER_COLOR,
        createdAt: now,
      }));

      // Build speaker map (label -> LocalSpeaker) for segment creation
      const speakerMap = new Map(localSpeakers.map((s) => [s.label, s]));

      // Build local segments referencing local speaker IDs
      const localSegments: LocalSegment[] = payload.output.diarization.map(
        (seg) => ({
          id: uuidv4(),
          speakerId: speakerMap.get(seg.speaker)!.id,
          startTime: seg.start,
          endTime: seg.end,
          createdAt: now,
        }),
      );

      // Update diarization info with full output stored in JSONB
      const diarizationInfo: DiarizationInfo = {
        ...(session.diarization ?? {
          jobId: payload.jobId,
          startedAt: now,
          completedAt: null,
          error: null,
        }),
        status: "completed",
        completedAt: now,
        error: null,
        speakers: localSpeakers,
        segments: localSegments,
      };

      yield* db
        .update(clippingSessions)
        .set({ diarization: diarizationInfo })
        .where(eq(clippingSessions.id, session.id));

      // Emit completion event for SSE subscribers
      diarizationEvents.emitCompletion(session.id, "completed");

      console.log(
        `[Diarization] Completed for session ${session.id}: ${localSpeakers.length} local speakers, ${localSegments.length} local segments (stored in JSONB)`,
      );
    } else if (payload.status === "failed" || payload.status === "canceled") {
      // Update diarization info with failed status
      const diarizationInfo: DiarizationInfo = {
        ...(session.diarization ?? {
          jobId: payload.jobId,
          startedAt: now,
          completedAt: null,
          error: null,
        }),
        status: "failed",
        completedAt: now,
        error:
          payload.status === "canceled"
            ? "Diarization was canceled"
            : "Diarization failed",
      };

      yield* db
        .update(clippingSessions)
        .set({ diarization: diarizationInfo })
        .where(eq(clippingSessions.id, session.id));

      // Emit failure event for SSE subscribers
      diarizationEvents.emitCompletion(session.id, "failed");
    } else if (payload.status === "running") {
      // Update status to running
      const diarizationInfo: DiarizationInfo = {
        ...(session.diarization ?? {
          jobId: payload.jobId,
          startedAt: now,
          completedAt: null,
          error: null,
        }),
        status: "running",
      };

      yield* db
        .update(clippingSessions)
        .set({ diarization: diarizationInfo })
        .where(eq(clippingSessions.id, session.id));
    }

    return NextResponse.json({ received: true });
  });

export async function POST(request: NextRequest) {
  return await AppRuntime.runPromise(
    handleWebhook(request).pipe(
      Effect.catchTags({
        JsonParseError: (error) => {
          console.error("[Diarization Webhook] JSON parse error:", error.cause);
          return Effect.succeed(
            NextResponse.json({ error: "Invalid JSON" }, { status: 400 }),
          );
        },
        ValidationError: (error) => {
          console.error(
            "[Diarization Webhook] Validation error:",
            error.message,
          );
          return Effect.succeed(
            NextResponse.json(
              { error: "Invalid payload", details: error.message },
              { status: 400 },
            ),
          );
        },
        SessionNotFoundError: (error) => {
          console.error(
            `[Diarization Webhook] Session not found for job: ${error.jobId}`,
          );
          return Effect.succeed(
            NextResponse.json(
              { error: "Clipping session not found" },
              { status: 404 },
            ),
          );
        },
      }),
      // At the HTTP boundary, catch all defects (unexpected errors like DB failures)
      // to return a proper HTTP response instead of crashing
      Effect.catchAllCause((cause) => {
        console.error("[Diarization Webhook] Defect:", Cause.pretty(cause));
        return Effect.succeed(
          NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
          ),
        );
      }),
    ),
  );
}

// Allow Pyannote to verify the endpoint
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
