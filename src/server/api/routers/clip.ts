import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { clips } from "~/server/db/schema";
import { Database } from "~/services/infra/database";
import { StorageService } from "~/services/storage/storage-service";

export const clipRouter = createTRPCRouter({
  // Get presigned download URL for a clip (on-demand, not upfront)
  getDownloadUrl: protectedProcedure
    .input(
      z.object({
        clipId: z.string().uuid(),
      }),
    )
    .query(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            const db = yield* Database;

            // Get clip with file and segment info to verify ownership
            const clip = yield* db.query.clips.findFirst({
              where: eq(clips.id, input.clipId),
              with: {
                file: true,
                segment: {
                  with: {
                    speaker: true,
                  },
                },
              },
            });

            if (!clip) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "NOT_FOUND",
                  message: "Clip not found",
                }),
              );
            }

            // Verify user owns this clip via speaker
            if (clip.segment.speaker.userId !== ctx.session.user.id) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "FORBIDDEN",
                  message: "You do not have access to this clip",
                }),
              );
            }

            // Get the storage key from the file
            const storageKey = clip.file.storageKey;
            if (!storageKey) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "NOT_FOUND",
                  message: "Clip file not found in storage",
                }),
              );
            }

            // Generate presigned download URL
            const url = yield* StorageService.generatePresignedDownloadUrl({
              key: storageKey,
              expiresIn: 3600, // 1 hour
            });

            return {
              url,
              duration: clip.file.duration,
            };
          }),
        ),
    ),
});
