/**
 * MOS API Client
 *
 * Infrastructure implementation for MOS calculation.
 * This client interacts with external MOS estimation APIs.
 */

import { Effect } from "effect";
import {
  MOSCalculationError,
  MOSProviderUnavailableError,
} from "~/core/domain/errors";
import type {
  CalculateMOSInput,
  MOSBreakdown,
  MOSResult,
  ProviderInfo,
} from "~/core/domain/dtos";

// ============================================================================
// API Response Types (External API shapes)
// ============================================================================

/**
 * Response from MOS estimation API
 */
type MOSApiResponse = {
  score: number;
  confidence?: number;
  breakdown?: {
    rms_level?: number;
    peak_level?: number;
    crest_factor?: number;
    has_clipping?: boolean;
    silence_count?: number;
    signal_to_noise?: number;
  };
  processing_time_ms?: number;
};

// ============================================================================
// DTO Mappers
// ============================================================================

/**
 * Maps API response breakdown to domain breakdown
 */
function mapBreakdown(apiBreakdown?: MOSApiResponse["breakdown"]): MOSBreakdown | undefined {
  if (!apiBreakdown) return undefined;

  return {
    rmsLevel: apiBreakdown.rms_level,
    peakLevel: apiBreakdown.peak_level,
    crestFactor: apiBreakdown.crest_factor,
    hasClipping: apiBreakdown.has_clipping,
    silenceCount: apiBreakdown.silence_count,
    signalToNoise: apiBreakdown.signal_to_noise,
  };
}

/**
 * Maps API response to domain result
 */
function mapToResult(response: MOSApiResponse, provider: string, startTime: number): MOSResult {
  return {
    score: response.score,
    confidence: response.confidence ?? 0.7,
    breakdown: mapBreakdown(response.breakdown),
    provider,
    processingTimeMs: response.processing_time_ms ?? Date.now() - startTime,
  };
}

// ============================================================================
// API Client Configuration
// ============================================================================

export type MOSApiClientConfig = {
  readonly providerId: string;
  readonly providerName: string;
  readonly baseUrl?: string;
  readonly apiKey?: string;
};

// ============================================================================
// API Client Implementation
// ============================================================================

/**
 * Create MOS API client
 *
 * This is a placeholder implementation that simulates an external API.
 * Replace with actual API calls when integrating with real MOS services.
 */
export function createMOSApiClient(config: MOSApiClientConfig) {
  const { providerId, providerName, baseUrl, apiKey } = config;

  const isAvailable = (): Effect.Effect<boolean> =>
    Effect.succeed(true); // Placeholder always available

  const calculateMOS = (
    input: CalculateMOSInput
  ): Effect.Effect<MOSResult, MOSCalculationError | MOSProviderUnavailableError> =>
    Effect.gen(function* () {
      const available = yield* isAvailable();
      if (!available) {
        return yield* Effect.fail(
          new MOSProviderUnavailableError({
            provider: providerId,
            message: `MOS provider ${providerName} is not available`,
          })
        );
      }

      const startTime = Date.now();

      // TODO: Replace with actual API call
      // Example:
      // const response = yield* Effect.tryPromise({
      //   try: () => fetch(`${baseUrl}/analyze`, {
      //     method: "POST",
      //     headers: { Authorization: `Bearer ${apiKey}` },
      //     body: input.audioSource instanceof Buffer
      //       ? input.audioSource
      //       : JSON.stringify({ url: input.audioSource }),
      //   }).then(r => r.json() as Promise<MOSApiResponse>),
      //   catch: (error) => new MOSCalculationError({
      //     message: "API request failed",
      //     cause: error,
      //   }),
      // });

      // Placeholder: Simulate API response
      yield* Effect.sleep("100 millis");

      const simulatedResponse: MOSApiResponse = {
        score: 3.5 + Math.random() * 1.0, // Random score between 3.5-4.5
        confidence: 0.85,
        breakdown: {
          rms_level: -18 + Math.random() * 6,
          peak_level: -3 + Math.random() * 2,
          crest_factor: 12 + Math.random() * 6,
          has_clipping: Math.random() > 0.9,
          silence_count: Math.floor(Math.random() * 3),
        },
        processing_time_ms: Date.now() - startTime,
      };

      return mapToResult(simulatedResponse, providerId, startTime);
    });

  const getProviderInfo = (): Effect.Effect<ProviderInfo> =>
    Effect.succeed({
      id: providerId,
      name: providerName,
      type: "mos" as const,
      isAvailable: true,
      capabilities: ["basic_analysis", "breakdown"],
    });

  return {
    calculateMOS,
    isAvailable,
    getProviderInfo,
  };
}

// ============================================================================
// Pre-configured Clients
// ============================================================================

/**
 * Placeholder MOS client for development
 */
export const placeholderMOSClient = createMOSApiClient({
  providerId: "placeholder",
  providerName: "Placeholder MOS (Development)",
});
