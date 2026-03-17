import { Effect } from "effect";

// ============================================================================
// Server Configuration
// ============================================================================

const speechProcessingServerUrl =
  process.env.SPEECH_PROCESSING_SERVER_URL ?? "http://localhost:8000";

// ============================================================================
// Response Types
// ============================================================================

/** DNSMOS score response from scoring server */
export interface DNSMOSResponse {
  DNSMOS: {
    SIG: number;
    BAK: number;
    OVRL: number;
    P808_MOS: number;
  };
}

/** Transcription response from transcription server */
export interface TranscriptionResponse {
  text: string;
}

// ============================================================================
// Server Callers
// ============================================================================

/**
 * Call the speech scoring server to calculate DNSMOS scores.
 * Sends a URL that the scoring server will download from.
 */
export const callScoringServer = (audioUrl: string) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(`${speechProcessingServerUrl}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: audioUrl }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Scoring server error: ${response.status} - ${text}`);
      }

      return (await response.json()) as DNSMOSResponse;
    },
    catch: (error) =>
      new Error(
        `Failed to call scoring server: ${error instanceof Error ? error.message : String(error)}`,
      ),
  });

/**
 * Call the speech processing server to transcribe audio.
 * Sends a URL that the transcription server will download from.
 */
export const callTranscriptionServer = (audioUrl: string) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(`${speechProcessingServerUrl}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: audioUrl }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Transcription server error: ${response.status} - ${text}`,
        );
      }

      return (await response.json()) as TranscriptionResponse;
    },
    catch: (error) =>
      new Error(
        `Failed to call transcription server: ${error instanceof Error ? error.message : String(error)}`,
      ),
  });

/**
 * Call the speech processing server to denoise audio.
 * Sends a URL that the denoise server will download from.
 * Returns the response body as a ReadableStream for direct piping
 * to S3 upload — zero disk I/O, zero buffering.
 */
export const callDenoiseServer = (audioUrl: string) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(`${speechProcessingServerUrl}/denoise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: audioUrl }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Denoise server error: ${response.status} - ${text}`);
      }

      if (!response.body) {
        throw new Error("Denoise server returned no body");
      }

      return { body: response.body as ReadableStream };
    },
    catch: (error) =>
      new Error(
        `Failed to call denoise server: ${error instanceof Error ? error.message : String(error)}`,
      ),
  });
