import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { audioClips, audioFiles, segments } from "~/server/db/schema";
import { extractClip } from "~/server/services/ffmpeg";
import {
  BUCKET_NAME,
  deleteObject,
  generateClipKey,
  getObjectStream,
  getPresignedDownloadUrl,
  uploadObject,
} from "~/server/services/minio";

export const clipRouter = createTRPCRouter({
  /**
   * Extract clips from approved segments for a single audio file
   */
  extractClips: publicProcedure
    .input(
      z.object({
        audioFileId: z.string().uuid(),
        segmentIds: z.array(z.string().uuid()).optional(),
        format: z.enum(["mp3", "wav", "flac"]).default("mp3"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get audio file
      const audioFile = await ctx.db.query.audioFiles.findFirst({
        where: eq(audioFiles.id, input.audioFileId),
        with: {
          job: {
            columns: {
              projectId: true,
            },
          },
        },
      });

      if (!audioFile) {
        throw new Error("Audio file not found");
      }

      // Get segments to extract
      const whereClause = input.segmentIds
        ? and(
            eq(segments.audioFileId, input.audioFileId),
            inArray(segments.id, input.segmentIds),
            eq(segments.status, "approved")
          )
        : and(
            eq(segments.audioFileId, input.audioFileId),
            eq(segments.status, "approved")
          );

      const segmentsToExtract = await ctx.db.query.segments.findMany({
        where: whereClause,
        orderBy: (segment, { asc }) => [asc(segment.editedStartTime)],
      });

      if (segmentsToExtract.length === 0) {
        throw new Error("No approved segments to extract");
      }

      // Verify all segments have collections assigned
      const missingCollection = segmentsToExtract.find((s) => !s.collectionId);
      if (missingCollection) {
        throw new Error("All segments must have a collection assigned");
      }

      // Download audio file from MinIO
      const audioStream = await getObjectStream(audioFile.storageKey);
      if (!audioStream) {
        throw new Error("Could not retrieve audio file from storage");
      }

      // Convert stream to buffer (for FFmpeg processing)
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }
      const audioBuffer = Buffer.concat(chunks);

      const extractedClips: Array<{
        segmentId: string;
        clipId: string;
        storageKey: string;
      }> = [];

      // Extract each segment
      for (const segment of segmentsToExtract) {
        try {
          // Extract clip using FFmpeg
          const result = await extractClip(audioBuffer, {
            startTime: segment.editedStartTime,
            endTime: segment.editedEndTime,
            format: input.format,
          });

          // Generate storage key (safe to use collectionId since we verified above)
          const collectionId = segment.collectionId;
          if (!collectionId) {
            throw new Error("Collection ID is missing");
          }

          const storageKey = generateClipKey(
            audioFile.job.projectId,
            collectionId,
            segment.id,
            input.format
          );

          // Upload to MinIO
          await uploadObject(
            storageKey,
            result.buffer,
            `audio/${input.format}`
          );

          // Create clip record
          const [clip] = await ctx.db
            .insert(audioClips)
            .values({
              segmentId: segment.id,
              collectionId,
              storageBucket: BUCKET_NAME,
              storageKey,
              durationSeconds: result.durationSeconds,
              fileSizeBytes: result.buffer.length,
              format: input.format,
              extractedStartTime: segment.editedStartTime,
              extractedEndTime: segment.editedEndTime,
            })
            .returning();

          // Update segment status
          await ctx.db
            .update(segments)
            .set({ status: "extracted" })
            .where(eq(segments.id, segment.id));

          if (!clip) {
            throw new Error("Failed to create clip record");
          }

          extractedClips.push({
            segmentId: segment.id,
            clipId: clip.id,
            storageKey,
          });
        } catch (error) {
          console.error(`Failed to extract segment ${segment.id}:`, error);
          // Continue with other segments
        }
      }

      return {
        success: true,
        extractedCount: extractedClips.length,
        totalSegments: segmentsToExtract.length,
        clips: extractedClips,
      };
    }),

  /**
   * Get presigned URL for downloading a clip
   */
  getClipUrl: publicProcedure
    .input(z.object({ clipId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const clip = await ctx.db.query.audioClips.findFirst({
        where: eq(audioClips.id, input.clipId),
        columns: {
          storageKey: true,
        },
      });

      if (!clip) {
        throw new Error("Clip not found");
      }

      const url = await getPresignedDownloadUrl(clip.storageKey);
      return { url };
    }),

  /**
   * List clips for a collection
   */
  listByCollection: publicProcedure
    .input(
      z.object({
        collectionId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) =>
      ctx.db.query.audioClips.findMany({
        where: eq(audioClips.collectionId, input.collectionId),
        limit: input.limit,
        offset: input.offset,
        orderBy: (clip, { desc }) => [desc(clip.createdAt)],
        with: {
          segment: {
            columns: {
              pyannoteSpeakerLabel: true,
            },
            with: {
              audioFile: {
                columns: {
                  originalFilename: true,
                },
              },
            },
          },
        },
      })
    ),

  /**
   * Delete a clip
   */
  delete: publicProcedure
    .input(z.object({ clipId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Get the clip with storage info
      const clip = await ctx.db.query.audioClips.findFirst({
        where: eq(audioClips.id, input.clipId),
        columns: {
          segmentId: true,
          storageKey: true,
        },
      });

      if (!clip) {
        throw new Error("Clip not found");
      }

      // Delete file from MinIO storage
      try {
        await deleteObject(clip.storageKey);
      } catch (error) {
        // Log error but continue with database deletion
        console.error(
          `Failed to delete clip file ${clip.storageKey}:`,
          error instanceof Error ? error.message : "Unknown error"
        );
      }

      // Delete clip from database
      await ctx.db.delete(audioClips).where(eq(audioClips.id, input.clipId));

      // Revert segment status to approved
      await ctx.db
        .update(segments)
        .set({ status: "approved" })
        .where(eq(segments.id, clip.segmentId));

      return { success: true };
    }),

  /**
   * Get clip count for a collection
   */
  getCountByCollection: publicProcedure
    .input(z.object({ collectionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const clips = await ctx.db.query.audioClips.findMany({
        where: eq(audioClips.collectionId, input.collectionId),
        columns: { id: true },
      });

      return { count: clips.length };
    }),
});
