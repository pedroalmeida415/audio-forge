import { sql } from "drizzle-orm";
import { Cause, Data, Effect } from "effect";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sources } from "~/server/db/schema";
import {
  type DiarizationSegmentResult,
  processDiarizationCompleted,
} from "~/server/diarization/process-result";
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

    // Find the source by diarization job ID stored in JSONB
    const source = yield* db.query.sources.findFirst({
      where: sql`${sources.diarization}->>'jobId' = ${payload.jobId}`,
    });

    if (!source) {
      return yield* Effect.fail(
        new SourceNotFoundError({ jobId: payload.jobId }),
      );
    }

    // Update based on status
    if (payload.status === "succeeded" && payload.output) {
      // Map Pyannote segments to the shared format
      const diarizationSegments: DiarizationSegmentResult[] =
        payload.output.diarization.map((seg) => ({
          speaker: seg.speaker,
          start: seg.start,
          end: seg.end,
        }));

      yield* processDiarizationCompleted({
        source,
        segments: diarizationSegments,
      });
    } else if (payload.status === "failed" || payload.status === "canceled") {
      // Update source with failed status — use JSONB merge to preserve config
      const patch = JSON.stringify({
        status: "failed",
        completedAt: new Date().toISOString(),
        error:
          payload.status === "canceled"
            ? "Diarization was canceled"
            : "Diarization failed",
      });

      yield* db
        .update(sources)
        .set({
          diarization: sql`COALESCE(${sources.diarization}, '{}') || ${patch}::jsonb`,
        })
        .where(sql`${sources.diarization}->>'jobId' = ${payload.jobId}`);
    } else if (payload.status === "running") {
      // Update status to running — use JSONB merge to preserve config
      const patch = JSON.stringify({ status: "running" });

      yield* db
        .update(sources)
        .set({
          diarization: sql`COALESCE(${sources.diarization}, '{}') || ${patch}::jsonb`,
        })
        .where(sql`${sources.diarization}->>'jobId' = ${payload.jobId}`);
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
            NextResponse.json({ error: "Source not found" }, { status: 404 }),
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
