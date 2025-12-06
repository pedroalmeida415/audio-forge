/**
 * Effect Runtime Helpers
 *
 * Provides convenience functions for running Effect programs
 * with the appropriate service layers.
 */

import { Effect, Exit, Cause } from "effect";
import { MainLayer, DevLayer } from "./application";
import type { MOSService, TranscriptionService, AudioProcessingService } from "./domain/services";

// ============================================================================
// Types
// ============================================================================

/**
 * Services available in the main runtime
 */
export type MainServices = MOSService | TranscriptionService | AudioProcessingService;

// ============================================================================
// Runtime Functions
// ============================================================================

/**
 * Run an Effect program with all production services provided
 *
 * @example
 * ```typescript
 * const result = await runWithServices(
 *   Effect.gen(function* () {
 *     const mos = yield* MOSService;
 *     return yield* mos.calculateMOS({ audioSource: buffer });
 *   })
 * );
 * ```
 */
export async function runWithServices<A, E>(
  effect: Effect.Effect<A, E, MainServices>
): Promise<A> {
  const exit = await Effect.runPromiseExit(
    Effect.provide(effect, MainLayer)
  );

  if (Exit.isFailure(exit)) {
    const error = Cause.squash(exit.cause);
    throw error;
  }

  return exit.value;
}

/**
 * Run an Effect program with development/placeholder services
 *
 * Uses placeholder implementations for external APIs.
 */
export async function runWithServicesDev<A, E>(
  effect: Effect.Effect<A, E, MainServices>
): Promise<A> {
  const exit = await Effect.runPromiseExit(
    Effect.provide(effect, DevLayer)
  );

  if (Exit.isFailure(exit)) {
    const error = Cause.squash(exit.cause);
    throw error;
  }

  return exit.value;
}

/**
 * Run an Effect program and return an Either-like result
 *
 * Returns { success: true, data } or { success: false, error }
 */
export async function runWithServicesResult<A, E>(
  effect: Effect.Effect<A, E, MainServices>
): Promise<{ success: true; data: A } | { success: false; error: E }> {
  const exit = await Effect.runPromiseExit(
    Effect.provide(effect, MainLayer)
  );

  if (Exit.isSuccess(exit)) {
    return { success: true, data: exit.value };
  }

  const error = Cause.failureOption(exit.cause);
  if (error._tag === "Some") {
    return { success: false, error: error.value };
  }

  // Defect or interruption
  throw Cause.squash(exit.cause);
}
