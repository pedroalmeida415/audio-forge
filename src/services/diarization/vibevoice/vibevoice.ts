import { Effect } from "effect";
import { extractSegments } from "./transcribe/parser";
import { awaitServerReady } from "./transcribe/server-readiness";
import { streamWithRecovery } from "./transcribe/stream";
import type { TranscribeParams, TranscribeResult } from "./vibevoice.types";

export { UNKNOWN_SPEAKER } from "./transcribe/parser";
export type {
  TranscribeParams,
  TranscribeResult,
  VibeVoiceSegment,
} from "./vibevoice.types";
export { VibeVoiceError } from "./vibevoice.types";

/**
 * VibeVoice-ASR client for speaker diarization + transcription.
 *
 * Uses Microsoft's VibeVoice-ASR model deployed on Modal with vLLM.
 * Provides speaker-attributed transcription via an OpenAI-compatible
 * streaming chat completions endpoint.
 */
export class VibeVoiceService extends Effect.Service<VibeVoiceService>()(
  "VibeVoiceService",
  {
    succeed: {
      /** Transcribe audio with speaker diarization. */
      transcribe: (params: TranscribeParams) =>
        Effect.gen(function* () {
          // Wait for the VibeVoice server to be ready (cold-start resilience)
          yield* awaitServerReady();

          // Stream transcription with hallucination auto-recovery
          const prompt = `This is a ${params.maxDurationSeconds.toFixed(2)} seconds audio, please transcribe it with these keys: Start, End, Speaker, Content`;
          const rawText = yield* streamWithRecovery(params, prompt);

          // Parse and filter model output into structured segments
          const segments = extractSegments(rawText).filter(
            (s) => s.start < params.maxDurationSeconds + 1,
          );

          yield* Effect.log(`[VibeVoice] Parsed ${segments.length} segments`);

          return { segments, rawText } satisfies TranscribeResult;
        }),
    },
    accessors: true,
  },
) {}
