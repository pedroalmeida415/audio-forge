import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { diarizations, files } from "~/server/db/schema";
import { DiarizationService, ServicesLive, StorageService } from "~/services";

// Helper to run Effect with services
const runEffect = <A, E>(
  effect: Effect.Effect<A, E, StorageService | DiarizationService>,
) => Effect.runPromise(Effect.provide(effect, ServicesLive));

export const diarizationRouter = createTRPCRouter({
  // Get presigned URL for uploading audio to R2
  getUploadUrl: protectedProcedure
    .input(
      z.object({
        fileName: z.string().min(1),
        contentType: z.string().regex(/^audio\//),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await runEffect(
        Effect.flatMap(StorageService, (storage) =>
          storage.generatePresignedUploadUrl({
            fileName: input.fileName,
            contentType: input.contentType,
            userId: ctx.session.user.id,
          }),
        ),
      );

      return result;
    }),

  // Create file record and start diarization job
  create: protectedProcedure
    .input(
      z.object({
        storageKey: z.string().min(1),
        projectId: z.string().uuid(),
        numSpeakers: z.number().int().min(1).max(20).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Create file record
      const [file] = await ctx.db
        .insert(files)
        .values({
          userId: ctx.session.user.id,
          storageKey: input.storageKey,
        })
        .returning();

      if (!file) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create file record",
        });
      }

      // 2. Generate presigned download URL for Pyannote
      const audioUrl = await runEffect(
        Effect.flatMap(StorageService, (storage) =>
          storage.generatePresignedDownloadUrl({
            key: input.storageKey,
            expiresIn: 7200, // 2 hours for processing
          }),
        ),
      );

      // 3. Submit diarization job
      const webhookUrl = `${env.PYANNOTE_WEBHOOK_URL}/api/webhooks/diarization`;
      const jobResult = await runEffect(
        Effect.flatMap(DiarizationService, (diarization) =>
          diarization.submitJob({
            audioUrl,
            webhookUrl,
            numSpeakers: input.numSpeakers,
            confidence: true,
          }),
        ),
      );

      // 4. Create diarization record
      const [diarization] = await ctx.db
        .insert(diarizations)
        .values({
          userId: ctx.session.user.id,
          projectId: input.projectId,
          fileId: file.id,
          diarizationJobId: jobResult.jobId,
          startedAt: new Date(),
        })
        .returning();

      if (!diarization) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create diarization record",
        });
      }

      return {
        id: diarization.id,
        jobId: jobResult.jobId,
        status: jobResult.status,
        warning: jobResult.warning,
      };
    }),

  // Get status of a specific diarization
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const diarization = await ctx.db.query.diarizations.findFirst({
        where: and(
          eq(diarizations.id, input.id),
          eq(diarizations.userId, ctx.session.user.id),
        ),
        with: {
          file: true,
          project: true,
        },
      });

      if (!diarization) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Diarization not found",
        });
      }

      // If not completed, fetch latest status from Pyannote
      if (!diarization.completedAt && diarization.diarizationJobId) {
        const statusResult = await runEffect(
          Effect.flatMap(DiarizationService, (service) =>
            service.getJobStatus(diarization.diarizationJobId!),
          ),
        );

        return {
          ...diarization,
          liveStatus: statusResult.status,
        };
      }

      return diarization;
    }),

  // List all diarizations for the user
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.diarizations.findMany({
      where: eq(diarizations.userId, ctx.session.user.id),
      orderBy: [desc(diarizations.createdAt)],
      with: {
        file: true,
      },
    });
  }),

  // Get presigned URL for audio playback
  getAudioUrl: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const diarization = await ctx.db.query.diarizations.findFirst({
        where: and(
          eq(diarizations.id, input.id),
          eq(diarizations.userId, ctx.session.user.id),
        ),
        with: {
          file: true,
        },
      });

      if (!diarization) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Diarization not found",
        });
      }

      const storageKey = diarization.file?.storageKey;
      if (!storageKey) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Audio file not found",
        });
      }

      const audioUrl = await runEffect(
        Effect.flatMap(StorageService, (storage) =>
          storage.generatePresignedDownloadUrl({
            key: storageKey,
            expiresIn: 3600, // 1 hour
          }),
        ),
      );

      return audioUrl;
    }),

  // Delete a diarization
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const diarization = await ctx.db.query.diarizations.findFirst({
        where: and(
          eq(diarizations.id, input.id),
          eq(diarizations.userId, ctx.session.user.id),
        ),
        with: {
          file: true,
        },
      });

      if (!diarization) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Diarization not found",
        });
      }

      // Delete from storage if file exists
      if (diarization.file?.storageKey) {
        await runEffect(
          Effect.flatMap(StorageService, (storage) =>
            storage.deleteObject({ key: diarization.file!.storageKey! }),
          ),
        ).catch(() => {
          // Log but don't fail if storage deletion fails
          console.error("Failed to delete file from storage");
        });
      }

      // Delete diarization (cascade will delete file)
      await ctx.db.delete(diarizations).where(eq(diarizations.id, input.id));

      return { success: true };
    }),

  // Set speaker-to-collection mapping
  setSpeakerCollection: protectedProcedure
    .input(
      z.object({
        diarizationId: z.string().uuid(),
        speaker: z.string().min(1),
        collectionId: z.string().uuid(),
        collectionName: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const diarization = await ctx.db.query.diarizations.findFirst({
        where: and(
          eq(diarizations.id, input.diarizationId),
          eq(diarizations.userId, ctx.session.user.id),
        ),
      });

      if (!diarization) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Diarization not found",
        });
      }

      const currentMappings = diarization.speakerCollections ?? {};
      const updatedMappings = {
        ...currentMappings,
        [input.speaker]: {
          collectionId: input.collectionId,
          collectionName: input.collectionName,
        },
      };

      await ctx.db
        .update(diarizations)
        .set({ speakerCollections: updatedMappings })
        .where(eq(diarizations.id, input.diarizationId));

      return { success: true };
    }),
});
