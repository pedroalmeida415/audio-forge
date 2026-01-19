import { Effect } from "effect";
import IORedis from "ioredis";
import { env } from "~/env";

/**
 * Infrastructure service that provides a Redis connection.
 * Used by QueueService and any other service that needs Redis.
 *
 * Uses `scoped` for proper lifecycle management:
 * - Connection is created when the layer is first used
 * - Connection is closed when the scope closes (runtime shutdown)
 *
 * @example
 * ```ts
 * const program = Effect.gen(function* () {
 *   const redis = yield* RedisService;
 *   // use redis...
 * });
 *
 * // Run with RedisService.Default
 * Effect.runPromise(program.pipe(Effect.provide(RedisService.Default)));
 * ```
 */
export class RedisService extends Effect.Service<RedisService>()(
  "RedisService",
  {
    scoped: Effect.acquireRelease(
      Effect.sync(
        () =>
          new IORedis(env.REDIS_URL ?? "redis://localhost:6379", {
            maxRetriesPerRequest: null,
          }),
      ),
      (redis) => Effect.promise(() => redis.quit()),
    ),
  },
) {}
