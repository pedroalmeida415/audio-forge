import { S3Client } from "@aws-sdk/client-s3";
import { Effect } from "effect";
import { env } from "~/env";

/**
 * Infrastructure service that provides an S3-compatible client.
 * Used by StorageService and any other service that needs object storage.
 *
 * Uses `scoped` for proper lifecycle management:
 * - Client is created when the layer is first used
 * - Client is destroyed when the scope closes (runtime shutdown)
 *
 * @example
 * ```ts
 * const program = Effect.gen(function* () {
 *   const client = yield* S3ClientService;
 *   // use client...
 * });
 *
 * // Run with S3ClientService.Default
 * Effect.runPromise(program.pipe(Effect.provide(S3ClientService.Default)));
 * ```
 */
export class S3ClientService extends Effect.Service<S3ClientService>()(
  "S3ClientService",
  {
    scoped: Effect.acquireRelease(
      Effect.sync(
        () =>
          new S3Client({
            region: "auto",
            endpoint: env.CLOUDFLARE_R2_ENDPOINT,
            credentials: {
              accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
              secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
            },
          }),
      ),
      (client) => Effect.sync(() => client.destroy()),
    ),
  },
) {}
