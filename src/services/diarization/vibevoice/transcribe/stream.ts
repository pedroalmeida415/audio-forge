import { Data, Effect, Sink, Stream } from "effect";
import { env } from "~/env";
import { type TranscribeParams, VibeVoiceError } from "../vibevoice.types";
import {
  cleanContinuation,
  lastCompleteBoundary,
  safeBoundaryBefore,
} from "./parser";
import {
  checkRepetition,
  extractSSEContent,
  findLatestEnd,
  WINDOW_SIZE,
} from "./stream.utils";

const MAX_RETRIES = 10;
const MAX_TOKENS = 32768;
const SKIP_FALLBACK_DURATION = 5;

const TAG = "[VibeVoice]";

/** Last N chars of a string, for logging long text without flooding. */
function tail(text: string, n = 120): string {
  if (text.length <= n) return text;
  return `…${text.slice(-n)}`;
}

class LoopDetected extends Data.TaggedError("LoopDetected")<{
  fullText: string;
  safeBoundaryPos: number;
}> {}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Stream a transcription from VibeVoice with automatic hallucination recovery.
 *
 * Flow: fetch SSE → accumulate text with loop/duration guards →
 * on loop, inject a skip segment into the prefix and retry with greedy.
 *
 * Speaker identity is preserved because we never change sampling parameters.
 * The skip segment changes the prefix, which breaks determinism and lets
 * the model continue past the stuck point.
 */
export function streamWithRecovery(
  params: TranscribeParams,
  prompt: string,
): Effect.Effect<string, VibeVoiceError> {
  return Effect.gen(function* () {
    let prefix = "";
    let attemptNum = 0;

    const singleAttempt = Effect.gen(function* () {
      yield* Effect.log(
        `${TAG} Attempt #${attemptNum} | greedy | prefix=${prefix.length} chars`,
      );

      if (prefix) {
        yield* Effect.log(`${TAG} Assistant prefix tail: ${tail(prefix)}`);
      }

      // Fetch + consume SSE, ensuring the connection is aborted on exit
      const ac = new AbortController();
      const accum = yield* Effect.gen(function* () {
        const body = yield* fetchSSE(
          params.audioUrl,
          prompt,
          prefix,
          0, // temperature — always greedy
          1.0, // top_p
          ac,
        );
        return yield* Stream.run(
          sseContentStream(body),
          contentFold(prefix, params.maxDurationSeconds),
        );
      }).pipe(Effect.ensuring(Effect.sync(() => ac.abort())));

      // Compute result
      const fullText = prefix + accum.newText;
      const safeBoundaryPos = Math.max(
        accum.safeBoundaryPos,
        lastCompleteBoundary(fullText),
      );

      yield* Effect.log(
        `${TAG} Stream finished | outcome=${accum.outcome}` +
          ` | newText=${accum.newText.length} chars` +
          ` | fullText=${fullText.length} chars` +
          ` | safeBoundary=${safeBoundaryPos}`,
      );

      if (accum.outcome === "loop_detected") {
        yield* Effect.log(
          `${TAG} Loop detected at ${fullText.length} chars | tail: ${tail(fullText)}`,
        );
        return yield* new LoopDetected({ fullText, safeBoundaryPos });
      }

      if (accum.outcome === "duration_exceeded") {
        yield* Effect.log(
          `${TAG} Force-stopping: latest End timestamp exceeded max duration ${params.maxDurationSeconds.toFixed(1)}s`,
        );
      }

      return { fullText, safeBoundaryPos };
    }).pipe(
      Effect.tapError((error) => {
        if (error._tag !== "LoopDetected") return Effect.void;
        return Effect.gen(function* () {
          const skip = buildSkipPrefix(error.fullText, error.safeBoundaryPos);
          yield* Effect.log(
            `${TAG} Recovery: ${skip.log} | next prefix=${skip.text.length} chars`,
          );
          prefix = skip.text;
          attemptNum++;
        });
      }),
    );

    const result = yield* singleAttempt.pipe(
      Effect.retry({
        times: MAX_RETRIES,
        while: (e) => e._tag === "LoopDetected",
      }),
      Effect.catchTag("LoopDetected", (lastError) =>
        Effect.gen(function* () {
          const recoveredText = prefix || lastError.fullText;
          yield* Effect.log(
            `${TAG} Max retries (${MAX_RETRIES}) exhausted` +
              ` | using ${prefix ? "best recovered prefix" : "last attempt text"}` +
              ` | ${recoveredText.length} chars`,
          );
          return {
            fullText: recoveredText,
            safeBoundaryPos: lastError.safeBoundaryPos,
          };
        }),
      ),
    );

    yield* Effect.log(
      `${TAG} Transcription complete | ${result.fullText.length} chars` +
        ` | attempts=${attemptNum + 1}`,
    );
    return result.fullText;
  });
}

// ── SSE fetch + decode ──────────────────────────────────────────────────────

function fetchSSE(
  audioUrl: string,
  prompt: string,
  assistantPrefix: string,
  temperature: number,
  topP: number,
  ac: AbortController,
) {
  const baseUrl = env.VIBEVOICE_ASR_URL;

  const messages: Array<Record<string, unknown>> = [
    {
      role: "system",
      content:
        "You are a helpful assistant that transcribes audio input into text output in JSON format.",
    },
    {
      role: "user",
      content: [
        { type: "audio_url", audio_url: { url: audioUrl } },
        { type: "text", text: prompt },
      ],
    },
  ];
  if (assistantPrefix) {
    messages.push({ role: "assistant", content: assistantPrefix });
  }

  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "vibevoice",
            messages,
            max_tokens: MAX_TOKENS,
            temperature,
            top_p: topP,
            stream: true,
          }),
          signal: ac.signal,
        }),
      catch: (err) =>
        new VibeVoiceError({
          operation: "transcribe",
          message: "Failed to connect to VibeVoice server",
          cause: err,
        }),
    });

    if (!response.ok) {
      const errorText = yield* Effect.tryPromise(() => response.text()).pipe(
        Effect.catchAll(() => Effect.succeed("(unreadable body)")),
      );
      return yield* Effect.fail(
        new VibeVoiceError({
          operation: "transcribe",
          message: `VibeVoice transcription failed: ${response.status} - ${errorText}`,
        }),
      );
    }

    if (!response.body) {
      return yield* Effect.fail(
        new VibeVoiceError({
          operation: "transcribe",
          message: "VibeVoice response has no body",
        }),
      );
    }

    return response.body;
  });
}

function sseContentStream(body: ReadableStream<Uint8Array>) {
  return Stream.fromReadableStream(
    () => body,
    (err) =>
      new VibeVoiceError({
        operation: "transcribe",
        message: "Stream read error",
        cause: err,
      }),
  ).pipe(
    Stream.decodeText(),
    Stream.splitLines,
    Stream.map(extractSSEContent),
    Stream.filter((c): c is string => c !== null),
  );
}

// ── Content fold ────────────────────────────────────────────────────────────

interface AccumState {
  newText: string;
  printed: string;
  safeBoundaryPos: number;
  outcome: "done" | "loop_detected" | "duration_exceeded";
}

function contentFold(assistantPrefix: string, maxDurationSeconds: number) {
  const initialSafeBoundary = assistantPrefix
    ? Math.max(0, lastCompleteBoundary(assistantPrefix))
    : 0;

  return Sink.fold<AccumState, string>(
    {
      newText: "",
      printed: "",
      safeBoundaryPos: initialSafeBoundary,
      outcome: "done",
    },
    (s) => s.outcome === "done",
    (state, content) => {
      const delta = content.startsWith(state.printed)
        ? content.slice(state.printed.length)
        : content;
      if (delta.length === 0) return state;

      const printed = state.printed + delta;
      let newText = state.newText + delta;

      if (assistantPrefix && state.newText.length === 0) {
        newText = cleanContinuation(newText);
      }

      const fullText = assistantPrefix + newText;

      if (checkRepetition(fullText).looping) {
        return { ...state, newText, printed, outcome: "loop_detected" };
      }

      const safeEnd = Math.max(0, fullText.length - WINDOW_SIZE);
      const boundary = safeBoundaryBefore(fullText, safeEnd);
      const safeBoundaryPos = Math.max(state.safeBoundaryPos, boundary);

      if (findLatestEnd(fullText) > maxDurationSeconds + 1) {
        return {
          newText,
          printed,
          safeBoundaryPos,
          outcome: "duration_exceeded",
        };
      }

      return { newText, printed, safeBoundaryPos, outcome: "done" };
    },
  );
}

// ── Skip-based recovery ─────────────────────────────────────────────────────

/**
 * Build a new prefix that skips past the stuck section.
 *
 * 1. Try to recover Start/End/Speaker from the stuck segment,
 *    truncate its Content to the pre-repetition portion.
 * 2. Fallback: skip SKIP_FALLBACK_DURATION seconds past the
 *    last known timestamp with "[inaudible]".
 *
 * The resulting prefix differs from the original, which breaks
 * greedy determinism and lets the model continue past the loop.
 */
function buildSkipPrefix(
  fullText: string,
  safeBoundaryPos: number,
): { text: string; log: string } {
  const safeText = fullText.slice(0, safeBoundaryPos);
  const remainder = fullText.slice(safeBoundaryPos);

  const recovered = recoverStuckSegment(remainder);
  if (recovered) {
    return {
      text: safeText + recovered.serialized,
      log:
        `Recovered stuck segment at ${recovered.start}s–${recovered.end}s` +
        ` (Speaker ${recovered.speaker}), content truncated`,
    };
  }

  // Fallback: no timestamps recoverable, skip forward
  const lastEnd = findLatestEnd(safeText);
  const skipEnd = +(lastEnd + SKIP_FALLBACK_DURATION).toFixed(2);
  const serialized = `{"Start":${lastEnd},"End":${skipEnd},"Speaker":0,"Content":"[inaudible]"},`;

  return {
    text: safeText + serialized,
    log: `No recoverable timestamps, skipping ${SKIP_FALLBACK_DURATION}s from ${lastEnd}s`,
  };
}

/**
 * Try to extract Start/End/Speaker from the text after the safe boundary.
 * The model typically outputs keys in order (Start, End, Speaker, Content),
 * so timestamps and speaker are usually present even when Content loops.
 */
function recoverStuckSegment(remainder: string): {
  serialized: string;
  start: number;
  end: number;
  speaker: number;
} | null {
  const startVal = remainder.match(/"Start"\s*:\s*(\d+(?:\.\d+)?)/)?.[1];
  const endVal = remainder.match(/"End"\s*:\s*(\d+(?:\.\d+)?)/)?.[1];

  if (startVal === undefined || endVal === undefined) return null;

  const start = Number(startVal);
  const end = Number(endVal);
  const speakerVal = remainder.match(/"Speaker"\s*:\s*(\d+)/)?.[1];
  const speaker = speakerVal !== undefined ? Number(speakerVal) : 0;

  const content = extractCleanContent(remainder);
  const serialized = `{"Start":${start},"End":${end},"Speaker":${speaker},"Content":"${content}"},`;

  return { serialized, start, end, speaker };
}

/**
 * Extract the non-repeating portion of the Content field from a stuck segment.
 *
 * The raw content is already JSON-escaped (came from the model's output),
 * so it can be placed directly into the serialized segment string.
 * Falls back to "[truncated]" if content can't be recovered.
 */
function extractCleanContent(remainder: string): string {
  const contentMatch = remainder.match(/"Content"\s*:\s*"/);
  if (!contentMatch) return "[truncated]";

  const contentStart = (contentMatch.index ?? 0) + contentMatch[0].length;
  let raw = remainder.slice(contentStart);

  // Run repetition detector to find where the good content ends.
  // The content is what's looping, so checkRepetition will identify
  // the boundary between real text and the hallucination.
  const rep = checkRepetition(raw);
  if (rep.looping) {
    raw = raw.slice(0, rep.goodEndPos);
  }

  // Cap at reasonable length
  if (raw.length > 300) raw = raw.slice(0, 300);

  // Trim trailing partial JSON escape sequences
  raw = raw.replace(/\\+$/, "");

  return raw.trim() || "[truncated]";
}
