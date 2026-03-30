import { Duration, Effect, Schedule } from "effect";
import { env } from "~/env";
import { VibeVoiceError } from "../vibevoice.types";

const HEALTH_CHECK_TIMEOUT_MS = Duration.toMillis("5 minutes");

/**
 * Poll `/health` until the VibeVoice server responds OK.
 * Uses a fixed-interval schedule capped by a 5-minute timeout.
 */
export function awaitServerReady() {
  const baseUrl = env.VIBEVOICE_ASR_URL;

  const healthCheck = Effect.gen(function* () {
    const response = yield* Effect.tryPromise(() => fetch(`${baseUrl}/health`));

    if (!response.ok) {
      return yield* Effect.fail(
        new VibeVoiceError({
          operation: "health",
          message: `Health check returned ${response.status}`,
        }),
      );
    }

    yield* Effect.log("[VibeVoice] Server is ready");
  });

  const retrySchedule = Schedule.intersect(
    Schedule.spaced("5 seconds"),
    Schedule.elapsed.pipe(
      Schedule.whileOutput(
        (elapsed) => Duration.toMillis(elapsed) < HEALTH_CHECK_TIMEOUT_MS,
      ),
    ),
  );

  return healthCheck.pipe(Effect.retry(retrySchedule));
}
