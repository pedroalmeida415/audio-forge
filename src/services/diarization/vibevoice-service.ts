import { Data, Effect } from "effect";
import { env } from "~/env";

// ============================================================================
// Types
// ============================================================================

export interface VibeVoiceSegment {
  /** Speaker index (0, 1, 2, …) */
  speaker: number;
  /** Start time in seconds */
  start: number;
  /** End time in seconds */
  end: number;
  /** Transcribed content */
  content: string;
}

export interface TranscribeParams {
  /** Presigned URL to the audio file in R2 */
  audioUrl: string;
  /** Maximum duration (seconds) — streaming stops when timestamps exceed this */
  maxDurationSeconds: number;
}

export interface TranscribeResult {
  segments: VibeVoiceSegment[];
  /** The raw accumulated text from the model */
  rawText: string;
}

// ============================================================================
// Errors
// ============================================================================

export class VibeVoiceError extends Data.TaggedError("VibeVoiceError")<{
  operation: "transcribe" | "health";
  message: string;
  cause?: unknown;
}> {}

// ============================================================================
// Parsing helpers
// ============================================================================

/**
 * VibeVoice returns JSON content like:
 * ```json
 * [
 *   {"Start": 0, "End": 30.48, "Speaker": 0, "Content": "hello world"},
 *   ...
 * ]
 * ```
 *
 * Start/End are already numbers (seconds), Speaker is a numeric index.
 * The accumulated text may be truncated mid-stream, so we try to fixup
 * common truncation patterns before parsing.
 */
function parseVibeVoiceOutput(rawText: string): VibeVoiceSegment[] {
  let text = rawText.trim();

  // If it doesn't start with '[', wrap it
  if (!text.startsWith("[")) {
    text = `[${text}`;
  }

  // If it doesn't end with ']', try to close it
  if (!text.endsWith("]")) {
    // Remove trailing comma if present
    if (text.endsWith(",")) {
      text = text.slice(0, -1);
    }
    // If the last object is incomplete (no closing brace), remove it
    const lastOpenBrace = text.lastIndexOf("{");
    const lastCloseBrace = text.lastIndexOf("}");
    if (lastOpenBrace > lastCloseBrace) {
      text = text.slice(0, lastOpenBrace);
      if (text.endsWith(",")) {
        text = text.slice(0, -1);
      }
    }
    text = `${text}]`;
  }

  try {
    const parsed = JSON.parse(text) as Array<{
      Start?: number;
      End?: number;
      Speaker?: number;
      Content?: string;
    }>;
    const segments: VibeVoiceSegment[] = [];

    for (const item of parsed) {
      if (
        typeof item.Start !== "number" ||
        typeof item.End !== "number" ||
        typeof item.Speaker !== "number"
      ) {
        continue;
      }

      segments.push({
        speaker: item.Speaker,
        start: item.Start,
        end: item.End,
        content: item.Content ?? "",
      });
    }

    return segments;
  } catch {
    return [];
  }
}

// ============================================================================
// Service
// ============================================================================

/** Default health check settings */
const HEALTH_CHECK_INTERVAL_MS = 5_000;
const HEALTH_CHECK_TIMEOUT_MS = 5 * 60 * 1_000; // 5 minutes

/**
 * VibeVoice-ASR client for speaker diarization + transcription.
 *
 * Uses Microsoft's VibeVoice-ASR model deployed on Modal with vLLM.
 * The model provides speaker-attributed transcription via an OpenAI-compatible
 * streaming chat completions endpoint.
 *
 * Key behaviors:
 * - Polls `/health` before sending requests (cold-start resilience)
 * - Monitors streamed response timestamps and force-stops when they exceed
 *   the source audio's duration (hallucination prevention)
 */
export class VibeVoiceService extends Effect.Service<VibeVoiceService>()(
  "VibeVoiceService",
  {
    effect: Effect.gen(function* () {
      const baseUrl = env.VIBEVOICE_ASR_URL;

      if (!baseUrl) {
        return yield* Effect.fail(
          new VibeVoiceError({
            operation: "health",
            message: "VibeVoice ASR is not configured. Set VIBEVOICE_ASR_URL.",
          }),
        );
      }

      return {
        /**
         * Wait for the vLLM server to be ready.
         *
         * After a cold start the vLLM server takes a while to spin up.
         * This polls `/health` every few seconds until it returns 200
         * or a timeout is reached.
         */
        waitForReady: () =>
          Effect.tryPromise({
            try: async () => {
              const start = Date.now();
              let lastError: unknown;

              while (Date.now() - start < HEALTH_CHECK_TIMEOUT_MS) {
                try {
                  const response = await fetch(`${baseUrl}/health`);
                  if (response.ok) {
                    console.log("[VibeVoice] Server is ready");
                    return;
                  }
                  lastError = new Error(
                    `Health check returned ${response.status}`,
                  );
                } catch (err) {
                  lastError = err;
                }

                console.log(
                  `[VibeVoice] Waiting for server... (${Math.round((Date.now() - start) / 1000)}s elapsed)`,
                );
                await new Promise((resolve) =>
                  setTimeout(resolve, HEALTH_CHECK_INTERVAL_MS),
                );
              }

              throw new Error(
                `VibeVoice server did not become ready within ${HEALTH_CHECK_TIMEOUT_MS / 1000}s`,
                { cause: lastError },
              );
            },
            catch: (error) =>
              new VibeVoiceError({
                operation: "health",
                message: "VibeVoice server health check failed",
                cause: error,
              }),
          }),

        /**
         * Run streaming transcription via the OpenAI-compatible endpoint.
         *
         * Accepts a presigned R2 URL directly — no need to upload to a
         * separate file server. Monitors `End` timestamps in the streamed
         * response and forcefully aborts when they exceed `maxDurationSeconds`
         * to prevent hallucination past the original audio's length.
         */
        transcribe: (params: TranscribeParams) =>
          Effect.tryPromise({
            try: async () => {
              const payload = {
                model: "vibevoice",
                messages: [
                  {
                    role: "system",
                    content:
                      "You are a helpful assistant that transcribes audio input into text output in JSON format.",
                  },
                  {
                    role: "user",
                    content: [
                      {
                        type: "audio_url",
                        audio_url: { url: params.audioUrl },
                      },
                      {
                        type: "text",
                        text: `This is a ${params.maxDurationSeconds.toFixed(2)} seconds audio, please transcribe it with these keys: Start, End, Speaker, Content`,
                      },
                    ],
                  },
                ],
                max_tokens: 16384,
                temperature: 0.0,
                stream: true,
                top_p: 1.0,
              };

              // AbortController lets us kill the HTTP connection entirely,
              // forcing vLLM to stop generating tokens for this request.
              const abortController = new AbortController();

              const response = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                signal: abortController.signal,
              });

              if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                  `VibeVoice transcription failed: ${response.status} - ${errorText}`,
                );
              }

              if (!response.body) {
                throw new Error("VibeVoice response has no body");
              }

              // Stream and accumulate content, monitoring timestamps
              let accumulatedText = "";
              let forceStopped = false;

              const reader = response.body.getReader();
              const decoder = new TextDecoder();

              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;

                  const chunk = decoder.decode(value, { stream: true });

                  for (const line of chunk.split("\n")) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === "data: [DONE]") continue;
                    if (!trimmed.startsWith("data: ")) continue;

                    const jsonStr = trimmed.slice("data: ".length);
                    try {
                      const parsed = JSON.parse(jsonStr) as {
                        choices: Array<{
                          delta: { content?: string };
                        }>;
                      };
                      const content = parsed.choices[0]?.delta?.content;
                      if (content) {
                        // vLLM may emit either incremental deltas OR the
                        // full accumulated text. Detect which mode and
                        // handle accordingly to avoid doubled output.
                        if (content.startsWith(accumulatedText)) {
                          accumulatedText = content;
                        } else {
                          accumulatedText += content;
                        }
                      }
                    } catch {
                      // Skip malformed JSON chunks
                    }
                  }

                  // Check if the latest End timestamps exceed the audio duration.
                  // Since End values are plain numbers, just scan for them with regex.
                  const endMatches = accumulatedText.matchAll(
                    /"End"\s*:\s*(\d+(?:\.\d+)?)/g,
                  );
                  let latestEnd = 0;
                  for (const match of endMatches) {
                    const captured = match[1];
                    if (!captured) continue;
                    const t = Number(captured);
                    if (t > latestEnd) latestEnd = t;
                  }

                  if (latestEnd > params.maxDurationSeconds + 1) {
                    console.log(
                      `[VibeVoice] Force-stopping stream: latest End ${latestEnd.toFixed(1)}s exceeds duration ${params.maxDurationSeconds.toFixed(1)}s`,
                    );
                    forceStopped = true;
                    break;
                  }
                }
              } finally {
                // Abort the request entirely — this tears down the HTTP connection
                // so vLLM detects the disconnect and stops generation immediately.
                abortController.abort();
                reader.cancel().catch(() => {});
              }

              const segments = parseVibeVoiceOutput(accumulatedText);

              // Filter out any segments past the audio duration (safety net)
              const validSegments = segments.filter(
                (s) => s.start < params.maxDurationSeconds + 1,
              );

              if (forceStopped) {
                console.log(
                  `[VibeVoice] Parsed ${validSegments.length} valid segments (force-stopped, filtered from ${segments.length})`,
                );
              } else {
                console.log(
                  `[VibeVoice] Parsed ${validSegments.length} segments`,
                );
              }

              return {
                segments: validSegments,
                rawText: accumulatedText,
              } satisfies TranscribeResult;
            },
            catch: (error) =>
              new VibeVoiceError({
                operation: "transcribe",
                message: "Failed to transcribe audio with VibeVoice",
                cause: error,
              }),
          }),
      };
    }),
    accessors: true,
  },
) {}
