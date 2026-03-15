import { eq } from "drizzle-orm";
import { Effect, Schedule } from "effect";
import { sources } from "../../src/server/db/schema";
import { Database } from "../../src/services/infra/database";
import {
  AudioJobs,
  QueueService,
  Queues,
} from "../../src/services/queue/queue-service";
import { StorageService } from "../../src/services/storage/storage-service";

const MAX_PENDING_MS = 60 * 60 * 1000;

/**
 * Repeating pull loop that checks for pending source uploads.
 *
 * Checks R2 for sources with status "pending", marks stale ones as failed,
 * and enqueues ingest jobs for those whose uploads have completed.
 *
 * Errors are caught and logged so the repeating schedule is never interrupted.
 */
export const startPollingSystem = Effect.repeat(
  Effect.gen(function* () {
    console.log(`\n[PullSystem] Checking for pending sources...`);
    const db = yield* Database;
    const pendingSources = yield* db.query.sources.findMany({
      where: eq(sources.status, "pending"),
    });

    if (pendingSources.length > 0) {
      console.log(
        `\n[PullSystem] Checking ${pendingSources.length} pending source(s)...`,
      );
    } else {
      console.log("\n[PullSystem] No pending sources found.");
    }

    const now = Date.now();

    yield* Effect.forEach(
      pendingSources,
      (source) =>
        Effect.gen(function* () {
          const isStale = now - source.createdAt.getTime() > MAX_PENDING_MS;

          if (isStale) {
            console.warn(
              `[PullSystem] Source ${source.id} has been pending for over 1 hour. Marking as failed.`,
            );
            yield* db
              .update(sources)
              .set({
                status: "failed",
                error: "Upload timed out or was aborted.",
              })
              .where(eq(sources.id, source.id));
            return;
          }

          console.log(`[PullSystem] Verifying ${source.storageKey}`);

          const fileExists = yield* StorageService.exists({
            key: source.storageKey,
          });

          if (fileExists) {
            console.log(
              `[PullSystem] HEAD successful! ${source.storageKey} is fully uploaded.`,
            );
            yield* db
              .update(sources)
              .set({ status: "processing" })
              .where(eq(sources.id, source.id));

            yield* QueueService.enqueueJob(
              Queues.AudioProcessing,
              AudioJobs.IngestSource,
              {
                entryId: source.id,
                queueDiarization: source.diarization?.status === "pending",
              },
            );

            console.log(`[PullSystem] Enqueued ingest for source ${source.id}`);
          } else {
            console.log(
              `[PullSystem] Still pending/uploading: ${source.storageKey}`,
            );
          }
        }).pipe(
          Effect.catchTag("StorageError", (error) =>
            error.cause instanceof Error && error.cause.name === "NotFound"
              ? Effect.succeed(false)
              : Effect.fail(error),
          ),
          Effect.catchAll((error) =>
            Effect.sync(() =>
              console.error(
                `[PullSystem] Error checking source ${source.id}:`,
                error,
              ),
            ),
          ),
        ),
      { discard: true },
    );
  }).pipe(
    Effect.catchAll((error) =>
      Effect.sync(() =>
        console.error("[PullSystem] Poll cycle failed:", error),
      ),
    ),
  ),
  Schedule.spaced("10 seconds"),
);
