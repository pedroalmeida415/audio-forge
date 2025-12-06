import { Effect } from "effect";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { clips } from "~/server/db/schema";
import {
  MOSService,
  AudioProcessingService,
  MainLayer,
  type ProcessingType,
  type AudioFormat,
  type ProcessingParams,
} from "~/core";
import {
  BUCKET_NAME,
  deleteObject,
  getObjectStream,
  getPresignedDownloadUrl,
  uploadObject,
} from "~/server/services/minio";

const processingTypeSchema = z.enum([
  "denoise",
  "remove_bg_music",
  "remove_overlap",
  "normalize",
  "upsample",
]);

const processingParamsSchema = z
  .object({
    noiseReduction: z.number().min(0).max(1).optional(),
    targetLufs: z.number().min(-60).max(0).optional(),
    peakLimit: z.number().min(-20).max(0).optional(),
    targetSampleRate: z.number().min(8000).max(96_000).optional(),
    aggressiveness: z.number().min(0).max(1).optional(),
  })
  .optional();

/**
 * Generate a storage key for a processed clip
 */
function generateProcessedClipKey(
  originalClipId: string,
  processingType: string,
  format: string
): string {
  const timestamp = Date.now();
  return `processed/${originalClipId}/${processingType}-${timestamp}.${format}`;
}

/**
 * Helper to download audio from storage
 */
async function downloadAudioBuffer(storageKey: string): Promise<Buffer> {
  const audioStream = await getObjectStream(storageKey);
  if (!audioStream) {
    throw new Error("Could not retrieve audio file from storage");
  }

  const chunks: Buffer[] = [];
  for await (const chunk of audioStream as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export const processingRouter = createTRPCRouter({
  /**
   * Start processing a single clip
   * Creates a new clip with clipType='processed' referencing the original
   */
  processClip: publicProcedure
    .input(
      z.object({
        clipId: z.string().uuid(),
        processingType: processingTypeSchema,
        params: processingParamsSchema,
        format: z.enum(["mp3", "wav", "flac"]).default("wav"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get the original clip
      const originalClip = await ctx.db.query.clips.findFirst({
        where: and(eq(clips.id, input.clipId), eq(clips.clipType, "original")),
      });

      if (!originalClip) {
        throw new Error("Original clip not found");
      }

      if (!originalClip.storageKey) {
        throw new Error("Original clip has no storage key");
      }

      // Create a pending processed clip record in unified clips table
      const [pendingClip] = await ctx.db
        .insert(clips)
        .values({
          collectionId: originalClip.collectionId,
          clipType: "processed",
          originalClipId: input.clipId,
          processingType: input.processingType,
          processingStatus: "processing",
          processingParams: input.params as ProcessingParams,
          format: input.format,
        })
        .returning();

      if (!pendingClip) {
        throw new Error("Failed to create processed clip record");
      }

      try {
        // Download original clip from MinIO
        const audioBuffer = await downloadAudioBuffer(originalClip.storageKey);

        // Process audio and calculate MOS using Effect-based services
        const processingProgram = Effect.gen(function* () {
          const audioService = yield* AudioProcessingService;
          const mosService = yield* MOSService;

          // Process the audio
          const processResult = yield* audioService.process({
            audioSource: audioBuffer,
            processingType: input.processingType as ProcessingType,
            params: input.params,
            outputFormat: input.format as AudioFormat,
          });

          // Calculate MOS for processed audio
          const outputBuffer = processResult.output instanceof Buffer
            ? processResult.output
            : Buffer.from(processResult.output);

          const mosResult = yield* Effect.either(
            mosService.calculateMOS({ audioSource: outputBuffer })
          );

          return {
            processResult,
            outputBuffer,
            mosScore: mosResult._tag === "Right" ? mosResult.right.score : null,
          };
        });

        const { processResult, outputBuffer, mosScore } = await Effect.runPromise(
          Effect.provide(processingProgram, MainLayer)
        );

        // Generate storage key and upload
        const storageKey = generateProcessedClipKey(
          input.clipId,
          input.processingType,
          input.format
        );

        await uploadObject(storageKey, outputBuffer, `audio/${input.format}`);

        // Update the processed clip record
        const [updatedClip] = await ctx.db
          .update(clips)
          .set({
            processingStatus: "completed",
            storageBucket: BUCKET_NAME,
            storageKey,
            durationSeconds: processResult.metadata.durationSeconds,
            fileSizeBytes: processResult.metadata.fileSizeBytes,
            sampleRate: processResult.metadata.sampleRate,
            mosScore,
          })
          .where(eq(clips.id, pendingClip.id))
          .returning();

        return updatedClip;
      } catch (error) {
        // Update with error status
        await ctx.db
          .update(clips)
          .set({
            processingStatus: "failed",
            processingErrorMessage:
              error instanceof Error ? error.message : "Unknown error",
          })
          .where(eq(clips.id, pendingClip.id));

        throw error;
      }
    }),

  /**
   * Batch process multiple clips with the same processing type
   */
  batchProcess: publicProcedure
    .input(
      z.object({
        clipIds: z.array(z.string().uuid()),
        processingType: processingTypeSchema,
        params: processingParamsSchema,
        format: z.enum(["mp3", "wav", "flac"]).default("wav"),
      })
    )
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Batch processing with error handling requires multiple conditional checks
    .mutation(async ({ ctx, input }) => {
      const results: Array<{
        clipId: string;
        processedClipId: string | null;
        success: boolean;
        error?: string;
      }> = [];

      // Process each clip
      for (const clipId of input.clipIds) {
        try {
          // Get the original clip
          const originalClip = await ctx.db.query.clips.findFirst({
            where: and(eq(clips.id, clipId), eq(clips.clipType, "original")),
          });

          if (!originalClip) {
            results.push({
              clipId,
              processedClipId: null,
              success: false,
              error: "Clip not found",
            });
            continue;
          }

          if (!originalClip.storageKey) {
            results.push({
              clipId,
              processedClipId: null,
              success: false,
              error: "Clip has no storage key",
            });
            continue;
          }

          // Create a pending processed clip record
          const [pendingClip] = await ctx.db
            .insert(clips)
            .values({
              collectionId: originalClip.collectionId,
              clipType: "processed",
              originalClipId: clipId,
              processingType: input.processingType,
              processingStatus: "processing",
              processingParams: input.params as ProcessingParams,
              format: input.format,
            })
            .returning();

          if (!pendingClip) {
            results.push({
              clipId,
              processedClipId: null,
              success: false,
              error: "Failed to create record",
            });
            continue;
          }

          // Download and process
          let audioBuffer: Buffer;
          try {
            audioBuffer = await downloadAudioBuffer(originalClip.storageKey);
          } catch {
            await ctx.db
              .update(clips)
              .set({
                processingStatus: "failed",
                processingErrorMessage: "Could not retrieve audio",
              })
              .where(eq(clips.id, pendingClip.id));

            results.push({
              clipId,
              processedClipId: pendingClip.id,
              success: false,
              error: "Could not retrieve audio",
            });
            continue;
          }

          // Process audio and calculate MOS using Effect-based services
          const processingProgram = Effect.gen(function* () {
            const audioService = yield* AudioProcessingService;
            const mosService = yield* MOSService;

            // Process the audio
            const processResult = yield* audioService.process({
              audioSource: audioBuffer,
              processingType: input.processingType as ProcessingType,
              params: input.params,
              outputFormat: input.format as AudioFormat,
            });

            // Calculate MOS for processed audio
            const outputBuffer = processResult.output instanceof Buffer
              ? processResult.output
              : Buffer.from(processResult.output);

            const mosResult = yield* Effect.either(
              mosService.calculateMOS({ audioSource: outputBuffer })
            );

            return {
              processResult,
              outputBuffer,
              mosScore: mosResult._tag === "Right" ? mosResult.right.score : null,
            };
          });

          const { processResult, outputBuffer, mosScore } = await Effect.runPromise(
            Effect.provide(processingProgram, MainLayer)
          );

          const storageKey = generateProcessedClipKey(
            clipId,
            input.processingType,
            input.format
          );

          await uploadObject(
            storageKey,
            outputBuffer,
            `audio/${input.format}`
          );

          await ctx.db
            .update(clips)
            .set({
              processingStatus: "completed",
              storageBucket: BUCKET_NAME,
              storageKey,
              durationSeconds: processResult.metadata.durationSeconds,
              fileSizeBytes: processResult.metadata.fileSizeBytes,
              sampleRate: processResult.metadata.sampleRate,
              mosScore,
            })
            .where(eq(clips.id, pendingClip.id));

          results.push({
            clipId,
            processedClipId: pendingClip.id,
            success: true,
          });
        } catch (error) {
          results.push({
            clipId,
            processedClipId: null,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      return {
        totalProcessed: results.filter((r) => r.success).length,
        totalFailed: results.filter((r) => !r.success).length,
        results,
      };
    }),

  /**
   * Get processing history for a clip (all processed versions)
   */
  getHistory: publicProcedure
    .input(z.object({ clipId: z.string().uuid() }))
    .query(async ({ ctx, input }) =>
      ctx.db.query.clips.findMany({
        where: and(
          eq(clips.originalClipId, input.clipId),
          eq(clips.clipType, "processed")
        ),
        orderBy: [desc(clips.createdAt)],
      })
    ),

  /**
   * Get presigned URL for a processed clip
   */
  getProcessedClipUrl: publicProcedure
    .input(z.object({ processedClipId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const clip = await ctx.db.query.clips.findFirst({
        where: and(
          eq(clips.id, input.processedClipId),
          eq(clips.clipType, "processed")
        ),
        columns: {
          storageKey: true,
          processingStatus: true,
        },
      });

      if (!clip) {
        throw new Error("Processed clip not found");
      }

      if (clip.processingStatus !== "completed" || !clip.storageKey) {
        throw new Error("Processed clip is not ready");
      }

      const url = await getPresignedDownloadUrl(clip.storageKey);
      return { url };
    }),

  /**
   * Delete a processed clip
   */
  deleteProcessedClip: publicProcedure
    .input(z.object({ processedClipId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const clip = await ctx.db.query.clips.findFirst({
        where: and(
          eq(clips.id, input.processedClipId),
          eq(clips.clipType, "processed")
        ),
        columns: {
          storageKey: true,
        },
      });

      if (!clip) {
        throw new Error("Processed clip not found");
      }

      // Delete from storage if exists
      if (clip.storageKey) {
        try {
          await deleteObject(clip.storageKey);
        } catch (error) {
          console.error("Failed to delete processed clip file:", error);
        }
      }

      // Delete from database
      await ctx.db.delete(clips).where(eq(clips.id, input.processedClipId));

      return { success: true };
    }),

  /**
   * Calculate MOS for an original clip
   */
  calculateMOS: publicProcedure
    .input(z.object({ clipId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const clip = await ctx.db.query.clips.findFirst({
        where: and(eq(clips.id, input.clipId), eq(clips.clipType, "original")),
      });

      if (!clip) {
        throw new Error("Clip not found");
      }

      if (!clip.storageKey) {
        throw new Error("Clip has no storage key");
      }

      // Download clip
      const audioBuffer = await downloadAudioBuffer(clip.storageKey);

      // Calculate MOS using Effect-based service
      const mosProgram = Effect.gen(function* () {
        const mosService = yield* MOSService;
        return yield* mosService.calculateMOS({ audioSource: audioBuffer });
      });

      const mosResult = await Effect.runPromise(
        Effect.provide(mosProgram, MainLayer)
      );

      const mosScore = mosResult.score;

      // Update clip with MOS score
      await ctx.db
        .update(clips)
        .set({ mosScore })
        .where(eq(clips.id, input.clipId));

      return { mosScore };
    }),

  /**
   * Batch calculate MOS for multiple clips
   */
  batchCalculateMOS: publicProcedure
    .input(z.object({ clipIds: z.array(z.string().uuid()) }))
    .mutation(async ({ ctx, input }) => {
      const results: Array<{
        clipId: string;
        mosScore: number | null;
        success: boolean;
      }> = [];

      for (const clipId of input.clipIds) {
        try {
          const clip = await ctx.db.query.clips.findFirst({
            where: and(eq(clips.id, clipId), eq(clips.clipType, "original")),
          });

          if (!clip?.storageKey) {
            results.push({ clipId, mosScore: null, success: false });
            continue;
          }

          const audioBuffer = await downloadAudioBuffer(clip.storageKey);

          // Calculate MOS using Effect-based service
          const mosProgram = Effect.gen(function* () {
            const mosService = yield* MOSService;
            return yield* mosService.calculateMOS({ audioSource: audioBuffer });
          });

          const mosResult = await Effect.runPromise(
            Effect.provide(mosProgram, MainLayer)
          );

          const mosScore = mosResult.score;

          await ctx.db
            .update(clips)
            .set({ mosScore })
            .where(eq(clips.id, clipId));

          results.push({ clipId, mosScore, success: true });
        } catch {
          results.push({ clipId, mosScore: null, success: false });
        }
      }

      return { results };
    }),
});
