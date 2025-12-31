import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "~/server/db";
import {
  clippingSessions,
  type DiarizationInfo,
  type FileSegment,
  type WorkspaceSpeaker,
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
      // Extract unique speakers and create WorkspaceSpeaker records
      const speakerLabels = [
        ...new Set(payload.output.diarization.map((s) => s.speaker)),
      ];
      const speakerMap = new Map<string, string>();

      const newSpeakers: WorkspaceSpeaker[] = speakerLabels.map((label) => {
        const id = randomUUID();
        speakerMap.set(label, id);
        return {
          id,
          label,
          createdAt: now,
        };
      });

      // Convert Pyannote segments to FileSegments
      const newSegments: FileSegment[] = payload.output.diarization.map(
        (segment) => ({
          id: randomUUID(),
          speakerId: speakerMap.get(segment.speaker) ?? "",
          start: segment.start,
          end: segment.end,
          confidence: segment.confidence,
          source: "diarization" as const,
          isDeleted: false,
          isReviewed: false,
          createdAt: now,
          updatedAt: now,
        }),
      );

      // Merge with existing segments and speakers
      const mergedSegments = [...(session.segments ?? []), ...newSegments];
      const mergedSpeakers = [...(session.speakers ?? []), ...newSpeakers];

      // Update diarization info
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
      };

      await db
        .update(clippingSessions)
        .set({
          segments: mergedSegments,
          speakers: mergedSpeakers,
          diarization: diarizationInfo,
        })
        .where(eq(clippingSessions.id, session.id));

      // Emit completion event for SSE subscribers
      diarizationEvents.emitCompletion(session.id, "completed");
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
