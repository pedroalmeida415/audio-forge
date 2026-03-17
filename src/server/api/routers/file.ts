import { TRPCError } from "@trpc/server";
import { Effect } from "effect";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { StorageService } from "~/services/storage/storage-service";

export const fileRouter = createTRPCRouter({
  /**
   * Generate a presigned download URL for an R2 object.
   *
   * The returned URL is self-authenticating (the signature IS the credential)
   * and is used by browser consumers to construct media server URLs for
   * audio playback and by workers for speech processing API calls.
   *
   * Security: The storageKey must contain the authenticated user's ID,
   * preventing access to other users' files. This mirrors the ownership
   * check that was previously in the media server's auth middleware.
   */
  getPresignedUrl: protectedProcedure
    .input(
      z.object({
        storageKey: z.string().min(1),
      }),
    )
    .query(
      async ({ ctx, input }) =>
        await ctx.runtime.runPromise(
          Effect.gen(function* () {
            // Validate ownership — storageKey must contain user ID
            if (!input.storageKey.includes(ctx.session.user.id)) {
              return yield* Effect.fail(
                new TRPCError({
                  code: "FORBIDDEN",
                  message: "Access denied",
                }),
              );
            }

            const result = yield* StorageService.generatePresignedUrl({
              key: input.storageKey,
              operation: "download",
              expiresIn: 3600,
            }).pipe(
              Effect.catchTag("StorageError", (error) =>
                Effect.fail(
                  new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: `Failed to generate presigned URL: ${error.message}`,
                  }),
                ),
              ),
            );

            return {
              url: result.url,
              expiresAt: result.expiresAt.toISOString(),
            };
          }),
        ),
    ),
});
