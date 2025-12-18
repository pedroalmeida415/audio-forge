import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "~/server/db";
import { type DiarizationSegment, diarizations } from "~/server/db/schema";

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

    // Find the diarization record by job ID
    const diarization = await db.query.diarizations.findFirst({
      where: eq(diarizations.diarizationJobId, payload.jobId),
    });

    if (!diarization) {
      console.error(`Diarization not found for job: ${payload.jobId}`);
      return NextResponse.json(
        { error: "Diarization not found" },
        { status: 404 },
      );
    }

    // Update based on status
    if (payload.status === "succeeded" && payload.output) {
      // Add UUIDs and default values to each segment
      const segments: DiarizationSegment[] = payload.output.diarization.map(
        (segment) => ({
          ...segment,
          id: randomUUID(),
          isDeleted: false,
          isReviewed: false,
        }),
      );

      await db
        .update(diarizations)
        .set({
          output: { segments },
          completedAt: new Date(),
        })
        .where(eq(diarizations.id, diarization.id));
    } else if (payload.status === "failed" || payload.status === "canceled") {
      await db
        .update(diarizations)
        .set({
          completedAt: new Date(),
          output: { segments: [] },
        })
        .where(eq(diarizations.id, diarization.id));
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
