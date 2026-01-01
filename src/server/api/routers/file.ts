import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { clippingSessions, files } from "~/server/db/schema";
import { ServicesLive, StorageService } from "~/services";

// Helper to run Effect with services
const runEffect = <A, E>(effect: Effect.Effect<A, E, StorageService>) =>
  Effect.runPromise(Effect.provide(effect, ServicesLive));

export const fileRouter = createTRPCRouter({
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

  // Create file record and clipping session after upload
  create: protectedProcedure
    .input(
      z.object({
        storageKey: z.string().min(1),
        projectId: z.string().uuid(),
        name: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Extract filename from storage key if not provided
      const fileName =
        input.name ?? input.storageKey.split("/").pop() ?? "Untitled";

      // Create file record
      const [file] = await ctx.db
        .insert(files)
        .values({
          userId: ctx.session.user.id,
          projectId: input.projectId,
          storageKey: input.storageKey,
          name: fileName,
        })
        .returning();

      if (!file) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create file record",
        });
      }

      // Create clipping session for this file (name defaults to file name)
      const [session] = await ctx.db
        .insert(clippingSessions)
        .values({
          fileId: file.id,
          projectId: input.projectId,
          userId: ctx.session.user.id,
          name: fileName,
        })
        .returning();

      if (!session) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create clipping session",
        });
      }

      return {
        file,
        session,
      };
    }),

  // Get presigned URL for audio playback
  getAudioUrl: protectedProcedure
    .input(z.object({ fileId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const file = await ctx.db.query.files.findFirst({
        where: and(
          eq(files.id, input.fileId),
          eq(files.userId, ctx.session.user.id),
        ),
      });

      if (!file) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "File not found",
        });
      }

      const storageKey = file.storageKey;
      if (!storageKey) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Audio file not found in storage",
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

  // Delete a file (cascade will handle session and clips)
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const file = await ctx.db.query.files.findFirst({
        where: and(
          eq(files.id, input.id),
          eq(files.userId, ctx.session.user.id),
        ),
      });

      if (!file) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "File not found",
        });
      }

      // Delete from storage if file exists
      const storageKey = file.storageKey;
      if (storageKey) {
        await runEffect(
          Effect.flatMap(StorageService, (storage) =>
            storage.deleteObject({ key: storageKey }),
          ),
        ).catch(() => {
          // Log but don't fail if storage deletion fails
          console.error("Failed to delete file from storage");
        });
      }

      // Delete file (cascade will handle related records)
      await ctx.db.delete(files).where(eq(files.id, input.id));

      return { success: true };
    }),
});
