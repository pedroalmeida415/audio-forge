import { Effect, Fiber } from "effect";
import { AppRuntime } from "../src/services";
import { startWorker } from "./lib/create-worker";
import { startPollingSystem } from "./lib/pull-system";

// Re-export types needed by other parts of the app (e.g. SSE bridges)
export type { ClipJobResult, LJSpeechExportResult } from "./lib/types";

if (typeof Bun === "undefined") {
  console.error(
    "❌ Error: This worker relies on Bun-specific APIs and MUST be run with the Bun runtime.",
  );
  process.exit(1);
}

// ============================================================================
// Main Worker Program
// ============================================================================

const main = Effect.gen(function* () {
  console.log("\n[AudioQueue] Starting...");

  yield* Effect.fork(startWorker);
  yield* Effect.fork(startPollingSystem);

  // Block forever — interrupted by signal handlers below.
  yield* Effect.never;
});

// ============================================================================
// Bootstrap & Signal Handling
// ============================================================================

const fiber = AppRuntime.runFork(main);

const shutdown = () => {
  console.log("\n[AudioQueue] Interrupting fiber...");

  // Safety net: force exit if graceful shutdown takes too long
  const forceTimer = setTimeout(() => {
    console.error("\n[AudioQueue] Shutdown timed out. Force exiting...");
    process.exit(1);
  }, 5_000);
  forceTimer.unref();

  AppRuntime.runPromise(Fiber.interrupt(fiber))
    .then(() => {
      console.log("\n[AudioQueue] Fiber interrupted. Exiting process...");
      process.exit(0);
    })
    .catch((err) => {
      console.error("\n[AudioQueue] Error during shutdown:", err);
      process.exit(1);
    });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
