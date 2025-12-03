import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { clips, diarizationJobs } from "~/server/db/schema";
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
   * Extract clips from segments in a diarization job
   * Segments are read from job JSONB, collection assignment comes from input
   */
  extractClips: publicProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        segments: z.array(
          z.object({
            segmentId: z.string().uuid(),
            collectionId: z.string().uuid(),
            projectId: z.string().uuid(),
            startTime: z.number().min(0),
            endTime: z.number().min(0),
            speakerLabel: z.string(),
          })
        ),
        format: z.enum(["mp3", "wav", "flac"]).default("mp3"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.segments.length === 0) {
        throw new Error("No segments to extract");
      }

      // Get diarization job for audio file info
      const job = await ctx.db.query.diarizationJobs.findFirst({
        where: eq(diarizationJobs.id, input.jobId),
        columns: {
          id: true,
          storageKey: true,
          storageBucket: true,
          originalFilename: true,
        },
      });

      if (!job) {
        throw new Error("Diarization job not found");
      }

      if (!job.storageKey) {
        throw new Error("Job has no associated audio file");
      }

      // Download audio file from MinIO
      const audioStream = await getObjectStream(job.storageKey);
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
      for (const segment of input.segments) {
        try {
          // Extract clip using FFmpeg
          const result = await extractClip(audioBuffer, {
            startTime: segment.startTime,
            endTime: segment.endTime,
            format: input.format,
          });

          const storageKey = generateClipKey(
            segment.projectId,
            segment.collectionId,
            segment.segmentId,
            input.format
          );

          // Upload to MinIO
          await uploadObject(
            storageKey,
            result.buffer,
            `audio/${input.format}`
          );

          // Create clip record in unified clips table
          const [clip] = await ctx.db
            .insert(clips)
            .values({
              collectionId: segment.collectionId,
              clipType: "original",
              storageBucket: BUCKET_NAME,
              storageKey,
              durationSeconds: result.durationSeconds,
              fileSizeBytes: result.buffer.length,
              format: input.format,
              sourceFilename: job.originalFilename,
              sourceSpeakerLabel: segment.speakerLabel,
              extractedStartTime: segment.startTime,
              extractedEndTime: segment.endTime,
            })
            .returning();

          if (!clip) {
            throw new Error("Failed to create clip record");
          }

          extractedClips.push({
            segmentId: segment.segmentId,
            clipId: clip.id,
            storageKey,
          });
        } catch (error) {
          console.error(
            `Failed to extract segment ${segment.segmentId}:`,
            error
          );
          // Continue with other segments
        }
      }

      return {
        success: true,
        extractedCount: extractedClips.length,
        totalSegments: input.segments.length,
        clips: extractedClips,
      };
    }),

  /**
   * Get presigned URL for downloading a clip
   */
  getClipUrl: publicProcedure
    .input(z.object({ clipId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const clip = await ctx.db.query.clips.findFirst({
        where: eq(clips.id, input.clipId),
        columns: {
          storageKey: true,
        },
      });

      if (!clip?.storageKey) {
        throw new Error("Clip not found or has no storage key");
      }

      const url = await getPresignedDownloadUrl(clip.storageKey);
      return { url };
    }),

  /**
   * List original clips for a collection (excludes processed clips)
   */
  listByCollection: publicProcedure
    .input(
      z.object({
        collectionId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      // Get original clips (clipType = 'original', no originalClipId)
      const originalClips = await ctx.db.query.clips.findMany({
        where: and(
          eq(clips.collectionId, input.collectionId),
          eq(clips.clipType, "original")
        ),
        limit: input.limit,
        offset: input.offset,
        orderBy: (clip, { desc }) => [desc(clip.createdAt)],
        with: {
          processedVersions: true,
        },
      });

      return originalClips;
    }),

  /**
   * Delete a clip and its processed versions
   */
  delete: publicProcedure
    .input(z.object({ clipId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Get the clip with storage info and processed versions
      const clip = await ctx.db.query.clips.findFirst({
        where: eq(clips.id, input.clipId),
        columns: {
          id: true,
          storageKey: true,
          clipType: true,
        },
        with: {
          processedVersions: {
            columns: {
              id: true,
              storageKey: true,
            },
          },
        },
      });

      if (!clip) {
        throw new Error("Clip not found");
      }

      // Collect all storage keys to delete
      const storageKeysToDelete: string[] = [];
      if (clip.storageKey) {
        storageKeysToDelete.push(clip.storageKey);
      }

      // For original clips, also delete processed versions
      if (clip.clipType === "original" && clip.processedVersions) {
        for (const processed of clip.processedVersions) {
          if (processed.storageKey) {
            storageKeysToDelete.push(processed.storageKey);
          }
        }
      }

      // Delete files from MinIO storage
      for (const key of storageKeysToDelete) {
        try {
          await deleteObject(key);
        } catch (error) {
          console.error(
            `Failed to delete file ${key}:`,
            error instanceof Error ? error.message : "Unknown error"
          );
        }
      }

      // Delete clip from database (cascade will delete processed versions)
      await ctx.db.delete(clips).where(eq(clips.id, input.clipId));

      return { success: true };
    }),

  /**
   * Get original clip count for a collection
   */
  getCountByCollection: publicProcedure
    .input(z.object({ collectionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const clipList = await ctx.db.query.clips.findMany({
        where: and(
          eq(clips.collectionId, input.collectionId),
          eq(clips.clipType, "original")
        ),
        columns: { id: true },
      });

      return { count: clipList.length };
    }),
});
