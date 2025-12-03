import { eq, desc, and, inArray } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  audioClips,
  processedClips,
  type ProcessingType,
} from "~/server/db/schema";
import {
  processAudio,
  estimateMOS,
  type ProcessingParams,
} from "~/server/services/audio-processing";
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
    targetSampleRate: z.number().min(8000).max(96000).optional(),
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

export const processingRouter = createTRPCRouter({
  /**
   * Start processing a single clip
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
      const originalClip = await ctx.db.query.audioClips.findFirst({
        where: eq(audioClips.id, input.clipId),
      });

      if (!originalClip) {
        throw new Error("Clip not found");
      }

      // Create a pending processed clip record
      const [pendingClip] = await ctx.db
        .insert(processedClips)
        .values({
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
        const audioStream = await getObjectStream(originalClip.storageKey);
        if (!audioStream) {
          throw new Error("Could not retrieve audio file from storage");
        }

        // Convert stream to buffer
        const chunks: Buffer[] = [];
        for await (const chunk of audioStream as AsyncIterable<Buffer>) {
          chunks.push(chunk);
        }
        const audioBuffer = Buffer.concat(chunks);

        // Process the audio
        const result = await processAudio(
          audioBuffer,
          input.processingType as ProcessingType,
          input.params,
          input.format
        );

        // Estimate MOS for the processed audio
        const mosScore = await estimateMOS(result.buffer);

        // Generate storage key and upload
        const storageKey = generateProcessedClipKey(
          input.clipId,
          input.processingType,
          input.format
        );

        await uploadObject(storageKey, result.buffer, `audio/${input.format}`);

        // Update the processed clip record
        const [updatedClip] = await ctx.db
          .update(processedClips)
          .set({
            processingStatus: "completed",
            storageBucket: BUCKET_NAME,
            storageKey,
            durationSeconds: result.durationSeconds,
            fileSizeBytes: result.buffer.length,
            sampleRate: result.sampleRate,
            mosScore,
          })
          .where(eq(processedClips.id, pendingClip.id))
          .returning();

        return updatedClip;
      } catch (error) {
        // Update with error status
        await ctx.db
          .update(processedClips)
          .set({
            processingStatus: "failed",
            errorMessage:
              error instanceof Error ? error.message : "Unknown error",
          })
          .where(eq(processedClips.id, pendingClip.id));

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
          const originalClip = await ctx.db.query.audioClips.findFirst({
            where: eq(audioClips.id, clipId),
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

          // Create a pending processed clip record
          const [pendingClip] = await ctx.db
            .insert(processedClips)
            .values({
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
          const audioStream = await getObjectStream(originalClip.storageKey);
          if (!audioStream) {
            await ctx.db
              .update(processedClips)
              .set({
                processingStatus: "failed",
                errorMessage: "Could not retrieve audio",
              })
              .where(eq(processedClips.id, pendingClip.id));

            results.push({
              clipId,
              processedClipId: pendingClip.id,
              success: false,
              error: "Could not retrieve audio",
            });
            continue;
          }

          const chunks: Buffer[] = [];
          for await (const chunk of audioStream as AsyncIterable<Buffer>) {
            chunks.push(chunk);
          }
          const audioBuffer = Buffer.concat(chunks);

          const result = await processAudio(
            audioBuffer,
            input.processingType as ProcessingType,
            input.params,
            input.format
          );

          const mosScore = await estimateMOS(result.buffer);

          const storageKey = generateProcessedClipKey(
            clipId,
            input.processingType,
            input.format
          );

          await uploadObject(storageKey, result.buffer, `audio/${input.format}`);

          await ctx.db
            .update(processedClips)
            .set({
              processingStatus: "completed",
              storageBucket: BUCKET_NAME,
              storageKey,
              durationSeconds: result.durationSeconds,
              fileSizeBytes: result.buffer.length,
              sampleRate: result.sampleRate,
              mosScore,
            })
            .where(eq(processedClips.id, pendingClip.id));

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
   * Get processing history for a clip
   */
  getHistory: publicProcedure
    .input(z.object({ clipId: z.string().uuid() }))
    .query(async ({ ctx, input }) =>
      ctx.db.query.processedClips.findMany({
        where: eq(processedClips.originalClipId, input.clipId),
        orderBy: [desc(processedClips.createdAt)],
      })
    ),

  /**
   * Get presigned URL for a processed clip
   */
  getProcessedClipUrl: publicProcedure
    .input(z.object({ processedClipId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const clip = await ctx.db.query.processedClips.findFirst({
        where: eq(processedClips.id, input.processedClipId),
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
      const clip = await ctx.db.query.processedClips.findFirst({
        where: eq(processedClips.id, input.processedClipId),
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
      await ctx.db
        .delete(processedClips)
        .where(eq(processedClips.id, input.processedClipId));

      return { success: true };
    }),

  /**
   * Calculate MOS for an original clip
   */
  calculateMOS: publicProcedure
    .input(z.object({ clipId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const clip = await ctx.db.query.audioClips.findFirst({
        where: eq(audioClips.id, input.clipId),
      });

      if (!clip) {
        throw new Error("Clip not found");
      }

      // Download clip
      const audioStream = await getObjectStream(clip.storageKey);
      if (!audioStream) {
        throw new Error("Could not retrieve audio file");
      }

      const chunks: Buffer[] = [];
      for await (const chunk of audioStream as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }
      const audioBuffer = Buffer.concat(chunks);

      // Calculate MOS
      const mosScore = await estimateMOS(audioBuffer);

      // Update clip with MOS score
      await ctx.db
        .update(audioClips)
        .set({ mosScore })
        .where(eq(audioClips.id, input.clipId));

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
          const clip = await ctx.db.query.audioClips.findFirst({
            where: eq(audioClips.id, clipId),
          });

          if (!clip) {
            results.push({ clipId, mosScore: null, success: false });
            continue;
          }

          const audioStream = await getObjectStream(clip.storageKey);
          if (!audioStream) {
            results.push({ clipId, mosScore: null, success: false });
            continue;
          }

          const chunks: Buffer[] = [];
          for await (const chunk of audioStream as AsyncIterable<Buffer>) {
            chunks.push(chunk);
          }
          const audioBuffer = Buffer.concat(chunks);

          const mosScore = await estimateMOS(audioBuffer);

          await ctx.db
            .update(audioClips)
            .set({ mosScore })
            .where(eq(audioClips.id, clipId));

          results.push({ clipId, mosScore, success: true });
        } catch {
          results.push({ clipId, mosScore: null, success: false });
        }
      }

      return { results };
    }),
});
