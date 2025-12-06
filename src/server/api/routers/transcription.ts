import { Effect } from "effect";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { clips } from "~/server/db/schema";
import { getObjectStream } from "~/server/services/minio";
import { TranscriptionService, MainLayer, type LanguageCode } from "~/core";

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

      // Transcribe using Effect-based service
      const transcriptionProgram = Effect.gen(function* () {
        const transcriptionService = yield* TranscriptionService;
        const providerInfo = yield* transcriptionService.getProviderInfo();

        const result = yield* transcriptionService.transcribe({
          audioSource: audioBuffer,
          language: input.language as LanguageCode,
          includeWordTimestamps: true,
        });

        return { result, providerId: providerInfo.id };
      });

      const { result, providerId } = await Effect.runPromise(
        Effect.provide(transcriptionProgram, MainLayer)
      );

      // Update the clip with transcription
      const [updated] = await ctx.db
        .update(clips)
        .set({
          transcript: result.text,
          transcriptMetadata: {
            language: result.language,
            provider: providerId,
            confidence: result.confidence,
            wordTimestamps: result.wordTimestamps?.map((w) => ({
              word: w.word,
              start: w.start,
              end: w.end,
            })),
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

          // Transcribe using Effect-based service
          const transcriptionProgram = Effect.gen(function* () {
            const transcriptionService = yield* TranscriptionService;
            const providerInfo = yield* transcriptionService.getProviderInfo();

            const result = yield* transcriptionService.transcribe({
              audioSource: audioBuffer,
              language: input.language as LanguageCode,
              includeWordTimestamps: true,
            });

            return { result, providerId: providerInfo.id };
          });

          const { result, providerId } = await Effect.runPromise(
            Effect.provide(transcriptionProgram, MainLayer)
          );

          await ctx.db
            .update(clips)
            .set({
              transcript: result.text,
              transcriptMetadata: {
                language: result.language,
                provider: providerId,
                confidence: result.confidence,
                wordTimestamps: result.wordTimestamps?.map((w) => ({
                  word: w.word,
                  start: w.start,
                  end: w.end,
                })),
              },
            })
            .where(eq(clips.id, clipId));

          results.push({
            clipId,
            success: true,
            transcript: result.text,
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
