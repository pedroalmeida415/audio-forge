import { eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { DEFAULT_LOCAL_SPEAKER_COLOR } from "~/lib/speaker-colors";
import { db } from "~/server/db";
import {
  clippingSessions,
  type DiarizationInfo,
  type LocalSegment,
  type LocalSpeaker,
} from "~/server/db/schema";
import { diarizationEvents } from "~/server/events/diarization-events";

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = webhookPayloadSchema.parse(body);

    // Find the clipping session by diarization job ID
    const session = await db.query.clippingSessions.findFirst({
      where: sql`${clippingSessions.diarization}->>'jobId' = ${payload.jobId}`,
    });

    if (!session) {
      console.error(`Clipping session not found for job: ${payload.jobId}`);
      return NextResponse.json(
        { error: "Clipping session not found" },
        { status: 404 },
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
          speakerId: speakerMap.get(seg.speaker)?.id ?? "",
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

      await db
        .update(clippingSessions)
        .set({
          diarization: diarizationInfo,
        })
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

      await db
        .update(clippingSessions)
        .set({
          diarization: diarizationInfo,
        })
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

      await db
        .update(clippingSessions)
        .set({
          diarization: diarizationInfo,
        })
        .where(eq(clippingSessions.id, session.id));
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Allow Pyannote to verify the endpoint
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
