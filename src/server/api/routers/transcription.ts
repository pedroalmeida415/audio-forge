import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { clips } from "~/server/db/schema";
import { getObjectStream } from "~/server/services/minio";
import { getDefaultTranscriptionProviderSync } from "~/server/services/providers";

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

export const transcriptionRouter = createTRPCRouter({
  /**
   * Update transcript for a clip (manual entry)
   */
  updateTranscript: publicProcedure
    .input(
      z.object({
        clipId: z.string().uuid(),
        transcript: z.string(),
        language: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(clips)
        .set({
          transcript: input.transcript,
          transcriptMetadata: {
            language: input.language,
            provider: "manual",
            confidence: 1.0,
          },
        })
        .where(and(eq(clips.id, input.clipId), eq(clips.clipType, "original")))
        .returning();

      if (!updated) {
        throw new Error("Clip not found");
      }

      return updated;
    }),

  /**
   * Auto-transcribe a clip using speech recognition
   */
  autoTranscribe: publicProcedure
    .input(
      z.object({
        clipId: z.string().uuid(),
        language: z.string().default("en"),
      })
    )
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

      // Download clip for transcription
      const audioBuffer = await downloadAudioBuffer(clip.storageKey);

      // Get the transcription provider
      const transcriptionProvider = getDefaultTranscriptionProviderSync();
      const result = await transcriptionProvider.transcribe(audioBuffer, {
        language: input.language,
        includeWordTimestamps: true,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      // Update the clip with transcription
      const [updated] = await ctx.db
        .update(clips)
        .set({
          transcript: result.data.text,
          transcriptMetadata: {
            language: result.data.language,
            provider: transcriptionProvider.config.id,
            confidence: result.data.confidence,
            wordTimestamps: result.data.wordTimestamps,
          },
        })
        .where(eq(clips.id, input.clipId))
        .returning();

      return updated;
    }),

  /**
   * Batch auto-transcribe multiple clips
   */
  batchTranscribe: publicProcedure
    .input(
      z.object({
        clipIds: z.array(z.string().uuid()),
        language: z.string().default("en"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const results: Array<{
        clipId: string;
        success: boolean;
        transcript?: string;
        error?: string;
      }> = [];

      // Get provider (reuse for all clips)
      const transcriptionProvider = getDefaultTranscriptionProviderSync();

      for (const clipId of input.clipIds) {
        try {
          const clip = await ctx.db.query.clips.findFirst({
            where: and(eq(clips.id, clipId), eq(clips.clipType, "original")),
          });

          if (!clip?.storageKey) {
            results.push({
              clipId,
              success: false,
              error: "Clip not found or has no storage",
            });
            continue;
          }

          const audioBuffer = await downloadAudioBuffer(clip.storageKey);
          const result = await transcriptionProvider.transcribe(audioBuffer, {
            language: input.language,
            includeWordTimestamps: true,
          });

          if (!result.success) {
            results.push({
              clipId,
              success: false,
              error: result.error,
            });
            continue;
          }

          await ctx.db
            .update(clips)
            .set({
              transcript: result.data.text,
              transcriptMetadata: {
                language: result.data.language,
                provider: transcriptionProvider.config.id,
                confidence: result.data.confidence,
                wordTimestamps: result.data.wordTimestamps,
              },
            })
            .where(eq(clips.id, clipId));

          results.push({
            clipId,
            success: true,
            transcript: result.data.text,
          });
        } catch (error) {
          results.push({
            clipId,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      return {
        totalTranscribed: results.filter((r) => r.success).length,
        totalFailed: results.filter((r) => !r.success).length,
        results,
      };
    }),

  /**
   * Clear transcript for a clip
   */
  clearTranscript: publicProcedure
    .input(z.object({ clipId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(clips)
        .set({
          transcript: null,
          transcriptMetadata: null,
        })
        .where(and(eq(clips.id, input.clipId), eq(clips.clipType, "original")))
        .returning();

      if (!updated) {
        throw new Error("Clip not found");
      }

      return { success: true };
    }),
});
