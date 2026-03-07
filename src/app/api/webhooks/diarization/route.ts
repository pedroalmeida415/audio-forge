import { eq } from "drizzle-orm";
import { Cause, Data, Effect } from "effect";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DEFAULT_LOCAL_SPEAKER_COLOR } from "~/lib/speaker-colors";
import { segments, sources, speakers } from "~/server/db/schema";
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

class SourceNotFoundError extends Data.TaggedError("SourceNotFoundError")<{
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

    // Find the source by diarization job ID
    const source = yield* db.query.sources.findFirst({
      where: eq(sources.diarizationJobId, payload.jobId),
    });

    if (!source) {
      return yield* Effect.fail(
        new SourceNotFoundError({ jobId: payload.jobId }),
      );
    }

    const now = new Date();

    // Update based on status
    if (payload.status === "succeeded" && payload.output) {
      // Extract unique speaker labels from diarization output
      const speakerLabels = [
        ...new Set(payload.output.diarization.map((s) => s.speaker)),
      ];

      // Create real speaker rows in DB
      const speakerRows = yield* db
        .insert(speakers)
        .values(
          speakerLabels.map((label) => ({
            projectId: source.projectId!,
            userId: source.userId,
            name: label,
            color: DEFAULT_LOCAL_SPEAKER_COLOR,
            sourceId: source.id,
            origin: "diarization" as const,
          })),
        )
        .returning();

      // Build speaker map (label -> speaker row) for segment creation
      const speakerMap = new Map(
        speakerRows.map((s, i) => [speakerLabels[i]!, s]),
      );

      // Create real segment rows in DB
      yield* db.insert(segments).values(
        payload.output.diarization.map((seg) => ({
          sourceId: source.id,
          speakerId: speakerMap.get(seg.speaker)!.id,
          startTime: seg.start,
          endTime: seg.end,
        })),
      );

      // Update source diarization status
      yield* db
        .update(sources)
        .set({
          diarizationStatus: "completed",
          diarizationCompletedAt: now,
          diarizationError: null,
        })
        .where(eq(sources.id, source.id));

      console.log(
        `[Diarization] Completed for source ${source.id}: ${speakerRows.length} speakers, ${payload.output.diarization.length} segments`,
      );
    } else if (payload.status === "failed" || payload.status === "canceled") {
      // Update source with failed status
      yield* db
        .update(sources)
        .set({
          diarizationStatus: "failed",
          diarizationCompletedAt: now,
          diarizationError:
            payload.status === "canceled"
              ? "Diarization was canceled"
              : "Diarization failed",
        })
        .where(eq(sources.id, source.id));
    } else if (payload.status === "running") {
      // Update status to running
      yield* db
        .update(sources)
        .set({ diarizationStatus: "running" })
        .where(eq(sources.id, source.id));
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
        SourceNotFoundError: (error) => {
          console.error(
            `[Diarization Webhook] Source not found for job: ${error.jobId}`,
          );
          return Effect.succeed(
            NextResponse.json(
              { error: "Source not found" },
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
