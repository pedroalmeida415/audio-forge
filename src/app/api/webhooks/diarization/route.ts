import { and, eq, inArray, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "~/server/db";
import {
  clippingSessions,
  type DiarizationInfo,
  segments,
  speakers,
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

      // Check for existing speakers with these names in the project
      const existingSpeakers = await db.query.speakers.findMany({
        where: and(
          eq(speakers.projectId, session.projectId),
          inArray(speakers.name, speakerLabels),
        ),
      });

      const existingMap = new Map(existingSpeakers.map((s) => [s.name, s]));
      const newSpeakerLabels = speakerLabels.filter(
        (label) => !existingMap.has(label),
      );

      // Create only new speakers (reuse existing ones)
      let createdSpeakers: typeof existingSpeakers = [];
      if (newSpeakerLabels.length > 0) {
        createdSpeakers = await db
          .insert(speakers)
          .values(
            newSpeakerLabels.map((label) => ({
              projectId: session.projectId,
              userId: session.userId,
              name: label,
            })),
          )
          .returning();
      }

      // Build complete speaker map (name -> speaker record)
      const speakerMap = new Map([
        ...existingSpeakers.map((s) => [s.name, s] as const),
        ...createdSpeakers.map((s) => [s.name, s] as const),
      ]);

      // Create segments with real speaker IDs
      await db.insert(segments).values(
        payload.output.diarization.map((seg) => ({
          sessionId: session.id,
          speakerId: speakerMap.get(seg.speaker)!.id,
          startTime: seg.start,
          endTime: seg.end,
        })),
      );

      // Update diarization info (metadata only, no more JSONB segments/speakers)
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
          diarization: diarizationInfo,
        })
        .where(eq(clippingSessions.id, session.id));

      // Emit completion event for SSE subscribers
      diarizationEvents.emitCompletion(session.id, "completed");

      console.log(
        `[Diarization] Completed for session ${session.id}: ${createdSpeakers.length} new speakers, ${existingSpeakers.length} reused, ${payload.output.diarization.length} segments`,
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
