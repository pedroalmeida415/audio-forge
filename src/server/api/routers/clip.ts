import { and, asc, desc, eq, gte, ilike, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
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

/**
 * Filter schema for clip queries
 */
const clipFiltersSchema = z
  .object({
    // MOS range filter
    mosMin: z.number().min(1).max(5).optional(),
    mosMax: z.number().min(1).max(5).optional(),
    // Duration range filter (in seconds)
    durationMin: z.number().min(0).optional(),
    durationMax: z.number().min(0).optional(),
    // Sample rate filter
    sampleRate: z.number().optional(),
    // Content filters
    hasTranscript: z.boolean().optional(),
    hasProcessed: z.boolean().optional(),
    readyForExport: z.boolean().optional(),
    // Text search on transcript
    search: z.string().optional(),
  })
  .optional();

/**
 * Sort options for clips
 */
const clipSortSchema = z
  .object({
    field: z.enum(["createdAt", "mosScore", "durationSeconds", "transcript", "sampleRate"]),
    order: z.enum(["asc", "desc"]),
  })
  .optional();

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
              sampleRate: result.sampleRate,
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
   * List original clips for a collection with filtering, search, and sorting
   */
  listByCollection: publicProcedure
    .input(
      z.object({
        collectionId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        filters: clipFiltersSchema,
        sort: clipSortSchema,
      })
    )
    .query(async ({ ctx, input }) => {
      // Build where conditions
      const conditions = [
        eq(clips.collectionId, input.collectionId),
        eq(clips.clipType, "original"),
      ];

      // Apply filters
      if (input.filters) {
        // MOS range
        if (input.filters.mosMin !== undefined) {
          conditions.push(gte(clips.mosScore, input.filters.mosMin));
        }
        if (input.filters.mosMax !== undefined) {
          conditions.push(lte(clips.mosScore, input.filters.mosMax));
        }

        // Duration range
        if (input.filters.durationMin !== undefined) {
          conditions.push(gte(clips.durationSeconds, input.filters.durationMin));
        }
        if (input.filters.durationMax !== undefined) {
          conditions.push(lte(clips.durationSeconds, input.filters.durationMax));
        }

        // Sample rate
        if (input.filters.sampleRate !== undefined) {
          conditions.push(eq(clips.sampleRate, input.filters.sampleRate));
        }

        // Has transcript
        if (input.filters.hasTranscript === true) {
          conditions.push(isNotNull(clips.transcript));
        } else if (input.filters.hasTranscript === false) {
          conditions.push(isNull(clips.transcript));
        }

        // Ready for export
        if (input.filters.readyForExport !== undefined) {
          conditions.push(eq(clips.readyForExport, input.filters.readyForExport));
        }

        // Search in transcript
        if (input.filters.search) {
          conditions.push(
            or(
              ilike(clips.transcript, `%${input.filters.search}%`),
              ilike(clips.sourceSpeakerLabel, `%${input.filters.search}%`)
            ) ?? sql`true`
          );
        }
      }

      // Build sort order
      let orderByClause: ReturnType<typeof desc | typeof asc>[];
      if (input.sort) {
        const sortColumn = (() => {
          switch (input.sort.field) {
            case "mosScore":
              return clips.mosScore;
            case "durationSeconds":
              return clips.durationSeconds;
            case "transcript":
              return clips.transcript;
            case "sampleRate":
              return clips.sampleRate;
            default:
              return clips.createdAt;
          }
        })();

        orderByClause =
          input.sort.order === "asc" ? [asc(sortColumn)] : [desc(sortColumn)];
      } else {
        orderByClause = [desc(clips.createdAt)];
      }

      // Get original clips with filters
      const originalClips = await ctx.db.query.clips.findMany({
        where: and(...conditions),
        limit: input.limit,
        offset: input.offset,
        orderBy: orderByClause,
        with: {
          processedVersions: true,
        },
      });

      // If filtering by hasProcessed, filter in JS (can't do easily in SQL with relations)
      let filteredClips = originalClips;
      if (input.filters?.hasProcessed !== undefined) {
        filteredClips = originalClips.filter((clip) => {
          const hasProcessed = clip.processedVersions.some(
            (p) => p.processingStatus === "completed"
          );
          return input.filters?.hasProcessed ? hasProcessed : !hasProcessed;
        });
      }

      return filteredClips;
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
   * Batch delete multiple clips
   */
  batchDelete: publicProcedure
    .input(z.object({ clipIds: z.array(z.string().uuid()) }))
    .mutation(async ({ ctx, input }) => {
      const results: Array<{
        clipId: string;
        success: boolean;
        error?: string;
      }> = [];

      for (const clipId of input.clipIds) {
        try {
          // Get the clip with storage info and processed versions
          const clip = await ctx.db.query.clips.findFirst({
            where: eq(clips.id, clipId),
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
            results.push({ clipId, success: false, error: "Clip not found" });
            continue;
          }

          // Collect all storage keys to delete
          const storageKeysToDelete: string[] = [];
          if (clip.storageKey) {
            storageKeysToDelete.push(clip.storageKey);
          }

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
              console.error(`Failed to delete file ${key}:`, error);
            }
          }

          // Delete clip from database
          await ctx.db.delete(clips).where(eq(clips.id, clipId));

          results.push({ clipId, success: true });
        } catch (error) {
          results.push({
            clipId,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      return {
        totalDeleted: results.filter((r) => r.success).length,
        totalFailed: results.filter((r) => !r.success).length,
        results,
      };
    }),

  /**
   * Get original clip count for a collection (with optional filters)
   */
  getCountByCollection: publicProcedure
    .input(
      z.object({
        collectionId: z.string().uuid(),
        filters: clipFiltersSchema,
      })
    )
    .query(async ({ ctx, input }) => {
      // Build where conditions
      const conditions = [
        eq(clips.collectionId, input.collectionId),
        eq(clips.clipType, "original"),
      ];

      // Apply filters
      if (input.filters) {
        if (input.filters.mosMin !== undefined) {
          conditions.push(gte(clips.mosScore, input.filters.mosMin));
        }
        if (input.filters.mosMax !== undefined) {
          conditions.push(lte(clips.mosScore, input.filters.mosMax));
        }
        if (input.filters.durationMin !== undefined) {
          conditions.push(gte(clips.durationSeconds, input.filters.durationMin));
        }
        if (input.filters.durationMax !== undefined) {
          conditions.push(lte(clips.durationSeconds, input.filters.durationMax));
        }
        if (input.filters.sampleRate !== undefined) {
          conditions.push(eq(clips.sampleRate, input.filters.sampleRate));
        }
        if (input.filters.hasTranscript === true) {
          conditions.push(isNotNull(clips.transcript));
        } else if (input.filters.hasTranscript === false) {
          conditions.push(isNull(clips.transcript));
        }
        if (input.filters.readyForExport !== undefined) {
          conditions.push(eq(clips.readyForExport, input.filters.readyForExport));
        }
        if (input.filters.search) {
          conditions.push(
            or(
              ilike(clips.transcript, `%${input.filters.search}%`),
              ilike(clips.sourceSpeakerLabel, `%${input.filters.search}%`)
            ) ?? sql`true`
          );
        }
      }

      const clipList = await ctx.db.query.clips.findMany({
        where: and(...conditions),
        columns: { id: true },
      });

      return { count: clipList.length };
    }),

  /**
   * Mark a clip as ready for export
   */
  markReadyForExport: publicProcedure
    .input(
      z.object({
        clipId: z.string().uuid(),
        ready: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(clips)
        .set({ readyForExport: input.ready })
        .where(and(eq(clips.id, input.clipId), eq(clips.clipType, "original")))
        .returning();

      if (!updated) {
        throw new Error("Clip not found");
      }

      return updated;
    }),

  /**
   * Batch mark clips as ready for export
   */
  batchMarkReadyForExport: publicProcedure
    .input(
      z.object({
        clipIds: z.array(z.string().uuid()),
        ready: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const results: Array<{
        clipId: string;
        success: boolean;
      }> = [];

      for (const clipId of input.clipIds) {
        try {
          const [updated] = await ctx.db
            .update(clips)
            .set({ readyForExport: input.ready })
            .where(and(eq(clips.id, clipId), eq(clips.clipType, "original")))
            .returning();

          results.push({ clipId, success: !!updated });
        } catch {
          results.push({ clipId, success: false });
        }
      }

      return {
        totalUpdated: results.filter((r) => r.success).length,
        totalFailed: results.filter((r) => !r.success).length,
        results,
      };
    }),

  /**
   * Get collection statistics (aggregate sizes, counts)
   */
  getCollectionStats: publicProcedure
    .input(z.object({ collectionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Get all original clips with their file sizes
      const originalClips = await ctx.db.query.clips.findMany({
        where: and(
          eq(clips.collectionId, input.collectionId),
          eq(clips.clipType, "original")
        ),
        columns: {
          id: true,
          fileSizeBytes: true,
          durationSeconds: true,
          mosScore: true,
          transcript: true,
          readyForExport: true,
          sampleRate: true,
        },
        with: {
          processedVersions: {
            columns: {
              fileSizeBytes: true,
              processingStatus: true,
            },
          },
        },
      });

      // Calculate aggregate statistics
      const totalOriginalClips = originalClips.length;
      const totalOriginalSize = originalClips.reduce(
        (sum, clip) => sum + (clip.fileSizeBytes ?? 0),
        0
      );
      const totalOriginalDuration = originalClips.reduce(
        (sum, clip) => sum + (clip.durationSeconds ?? 0),
        0
      );
      const totalProcessedSize = originalClips.reduce((sum, clip) => {
        const processedSize = clip.processedVersions
          .filter((p) => p.processingStatus === "completed")
          .reduce((pSum, p) => pSum + (p.fileSizeBytes ?? 0), 0);
        return sum + processedSize;
      }, 0);
      const totalProcessedClips = originalClips.reduce((count, clip) => {
        return (
          count +
          clip.processedVersions.filter((p) => p.processingStatus === "completed")
            .length
        );
      }, 0);

      // Content stats
      const clipsWithTranscript = originalClips.filter(
        (c) => c.transcript && c.transcript.trim().length > 0
      ).length;
      const clipsWithMOS = originalClips.filter((c) => c.mosScore !== null).length;
      const clipsReadyForExport = originalClips.filter((c) => c.readyForExport).length;

      // MOS statistics
      const mosScores = originalClips
        .filter((c) => c.mosScore !== null)
        .map((c) => c.mosScore!);
      const avgMOS =
        mosScores.length > 0
          ? mosScores.reduce((a, b) => a + b, 0) / mosScores.length
          : null;
      const minMOS = mosScores.length > 0 ? Math.min(...mosScores) : null;
      const maxMOS = mosScores.length > 0 ? Math.max(...mosScores) : null;

      // Sample rate distribution
      const sampleRates = originalClips
        .filter((c) => c.sampleRate !== null)
        .map((c) => c.sampleRate!);
      const sampleRateDistribution = sampleRates.reduce(
        (acc, rate) => {
          acc[rate] = (acc[rate] ?? 0) + 1;
          return acc;
        },
        {} as Record<number, number>
      );

      return {
        totalClips: totalOriginalClips,
        totalProcessedClips,
        totalSize: totalOriginalSize + totalProcessedSize,
        originalSize: totalOriginalSize,
        processedSize: totalProcessedSize,
        totalDuration: totalOriginalDuration,
        clipsWithTranscript,
        clipsWithMOS,
        clipsReadyForExport,
        mosStats: {
          average: avgMOS ? Math.round(avgMOS * 10) / 10 : null,
          min: minMOS,
          max: maxMOS,
        },
        sampleRateDistribution,
      };
    }),
});
