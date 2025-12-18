/**
 * Migration script to add UUIDs to existing diarization segments
 *
 * Run with: bun run scripts/migrate-segment-uuids.ts
 */

import { randomUUID } from "crypto";
import { eq, isNotNull } from "drizzle-orm";
import { db } from "~/server/db";
import { type DiarizationSegment, diarizations } from "~/server/db/schema";

async function migrateSegmentUUIDs() {
  console.log("Starting segment UUID migration...");

  // Fetch all diarizations with output
  const allDiarizations = await db.query.diarizations.findMany({
    where: isNotNull(diarizations.output),
  });

  console.log(`Found ${allDiarizations.length} diarizations to process`);

  let migratedCount = 0;
  let skippedCount = 0;

  for (const diarization of allDiarizations) {
    if (!diarization.output?.segments?.length) {
      skippedCount++;
      continue;
    }

    // Check if segments already have UUIDs (idempotent)
    const firstSegment = diarization.output.segments[0];
    if (firstSegment && "id" in firstSegment && firstSegment.id) {
      console.log(`Skipping diarization ${diarization.id} - already has UUIDs`);
      skippedCount++;
      continue;
    }

    // Add UUIDs to each segment
    const migratedSegments: DiarizationSegment[] = diarization.output.segments.map(
      (segment) => ({
        ...segment,
        id: randomUUID(),
        isDeleted: segment.isDeleted ?? false,
        isReviewed: segment.isReviewed ?? false,
      }),
    );

    await db
      .update(diarizations)
      .set({ output: { segments: migratedSegments } })
      .where(eq(diarizations.id, diarization.id));

    migratedCount++;
    console.log(
      `Migrated diarization ${diarization.id} - ${migratedSegments.length} segments`,
    );
  }

  console.log("\nMigration complete!");
  console.log(`  Migrated: ${migratedCount}`);
  console.log(`  Skipped: ${skippedCount}`);
}

migrateSegmentUUIDs()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
