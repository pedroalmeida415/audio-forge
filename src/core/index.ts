/**
 * Core Module
 *
 * Clean architecture implementation with three layers:
 * - Domain: Business contracts, DTOs, errors, value objects
 * - Application: Service implementations with Effect Layers
 * - Infrastructure: External API client implementations
 *
 * Usage:
 * ```typescript
 * import { Effect } from "effect";
 * import { MOSService, TranscriptionService, runWithServices } from "~/core";
 *
 * // Define your program
 * const program = Effect.gen(function* () {
 *   const mos = yield* MOSService;
 *   const transcription = yield* TranscriptionService;
 *
 *   const mosResult = yield* mos.calculateMOS({ audioSource: buffer });
 *   const transcriptResult = yield* transcription.transcribe({ audioSource: buffer });
 *
 *   return { mosResult, transcriptResult };
 * });
 *
 * // Run with all services provided
 * const result = await runWithServices(program);
 * ```
 */

// Re-export everything from layers
export * from "./domain";
export * from "./application";
export * from "./infrastructure";

// Runtime helpers
export { runWithServices, runWithServicesDev } from "./runtime";
