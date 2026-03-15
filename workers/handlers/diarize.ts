import { eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import { env } from "../../src/env";
import { type DiarizationInfo, sources } from "../../src/server/db/schema";
import { PyannoteService } from "../../src/services/diarization/pyannote-service";
import { Database } from "../../src/services/infra/database";
import { StorageService } from "../../src/services/storage/storage-service";
import { formatErrorMessage } from "../lib/errors";
import { buildMediaServerUrl } from "../lib/media";
import { callDenoiseServer } from "../lib/speech-server";
import type { JobHandler } from "../lib/types";

/**
 * Diarize a source — optionally denoise first, then submit to Pyannote.
 * entryId = sourceId
 *
 * Reads `source.diarization.denoise` to decide whether to denoise.
 * Updates `source.diarization` JSONB throughout the process.
 */
export const handleDiarize: JobHandler = (job) =>
  Effect.gen(function* () {
    const sourceId = job.data.entryId;
    console.log(`[Diarize] Starting for source ${sourceId}`);

    const db = yield* Database;

    // Fetch source record
    const source = yield* db.query.sources.findFirst({
      where: eq(sources.id, sourceId),
    });

    if (!source) {
      throw new Error(`Source ${sourceId} not found`);
    }

    if (!source.storageKey) {
      throw new Error(`Source ${sourceId} has no storage key`);
    }

    const shouldDenoise = source.diarization?.denoise === true;
    let audioUrl: string;

    if (shouldDenoise) {
      console.log(`[Diarize] Denoising source ${sourceId} before diarization`);

      // Get source audio URL via media server
      const { url: presignedUrl } = yield* StorageService.generatePresignedUrl({
        key: source.storageKey,
        operation: "download",
        expiresIn: 3600,
      });
      const mediaUrl = buildMediaServerUrl({
        presignedUrl,
        format: "flac",
      });

      // Stream denoised audio directly to temp R2 bucket (true stream pipe)
      const { body } = yield* callDenoiseServer(mediaUrl);
      const tempKey = `denoised/${source.userId}/${Date.now()}-${sourceId}.flac`;

      yield* StorageService.upload({
        key: tempKey,
        body,
        contentType: "audio/flac",
        bucket: env.CLOUDFLARE_R2_TEMP_BUCKET,
      });

      console.log(`[Diarize] Denoised audio uploaded to temp: ${tempKey}`);

      // Generate presigned URL from temp bucket for Pyannote
      const { url: denoisedUrl } = yield* StorageService.generatePresignedUrl({
        key: tempKey,
        operation: "download",
        expiresIn: 7200,
        bucket: env.CLOUDFLARE_R2_TEMP_BUCKET,
      });

      audioUrl = denoisedUrl;
    } else {
      const { url } = yield* StorageService.generatePresignedUrl({
        key: source.storageKey,
        operation: "download",
        expiresIn: 7200,
      });
      audioUrl = url;
    }

    // Submit to Pyannote
    const diarizationJob = yield* PyannoteService.submitJob({
      audioUrl,
    });

    console.log(
      `[Diarize] Submitted to Pyannote for ${sourceId}: job ${diarizationJob.jobId}`,
    );

    // Update diarization JSONB with job info
    const updatedDiarization: DiarizationInfo = {
      ...source.diarization,
      status: "pending",
      jobId: diarizationJob.jobId,
      startedAt: source.diarization?.startedAt ?? new Date().toISOString(),
    };

    yield* db
      .update(sources)
      .set({ diarization: updatedDiarization })
      .where(eq(sources.id, sourceId));

    return undefined;
  }).pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        const sourceId = job.data.entryId;
        const db = yield* Database;
        const message = formatErrorMessage(error);

        // Log the full error for stack trace / debug details
        console.error(`[Diarize] Failed for source ${sourceId}:`, error);

        // Merge failure fields into existing JSONB so config like `denoise` is preserved.
        const patch = JSON.stringify({
          status: "failed",
          error: message,
          completedAt: new Date().toISOString(),
        });

        yield* db
          .update(sources)
          .set({
            diarization: sql`COALESCE(${sources.diarization}, '{}') || ${patch}::jsonb`,
          })
          .where(eq(sources.id, sourceId))
          .pipe(Effect.catchAll(() => Effect.void));

        return yield* Effect.fail(error);
      }),
    ),
  );
