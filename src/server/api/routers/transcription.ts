import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { clips } from "~/server/db/schema";
import { getObjectStream } from "~/server/services/minio";

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
   * Note: This is a placeholder - actual implementation would use Whisper API or similar
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
      const audioStream = await getObjectStream(clip.storageKey);
      if (!audioStream) {
        throw new Error("Could not retrieve audio file");
      }

      // Convert stream to buffer (for API call)
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }
      const audioBuffer = Buffer.concat(chunks);

      // Placeholder: In production, this would call Whisper API or similar
      // For now, we'll return a placeholder indicating the feature
      const transcript = await performTranscription(
        audioBuffer,
        input.language
      );

      // Update the clip with transcription
      const [updated] = await ctx.db
        .update(clips)
        .set({
          transcript: transcript.text,
          transcriptMetadata: {
            language: input.language,
            provider: "whisper",
            confidence: transcript.confidence,
            wordTimestamps: transcript.words,
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

          const audioStream = await getObjectStream(clip.storageKey);
          if (!audioStream) {
            results.push({
              clipId,
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

          const transcript = await performTranscription(
            audioBuffer,
            input.language
          );

          await ctx.db
            .update(clips)
            .set({
              transcript: transcript.text,
              transcriptMetadata: {
                language: input.language,
                provider: "whisper",
                confidence: transcript.confidence,
                wordTimestamps: transcript.words,
              },
            })
            .where(eq(clips.id, clipId));

          results.push({
            clipId,
            success: true,
            transcript: transcript.text,
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

/**
 * Placeholder transcription function
 * In production, this would integrate with Whisper API, Google Speech-to-Text, etc.
 */
async function performTranscription(
  _audioBuffer: Buffer,
  _language: string
): Promise<{
  text: string;
  confidence: number;
  words?: Array<{ word: string; start: number; end: number }>;
}> {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Return placeholder - in production, call actual transcription API
  return {
    text: "[Transcription pending - configure Whisper API]",
    confidence: 0,
  };
}
