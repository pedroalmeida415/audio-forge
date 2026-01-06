import { HttpResponse, http } from "msw";
import { trpcQuery, trpcSubscription } from "./trpc";

/**
 * Handler for media proxy - serves test audio file.
 */
export const mediaProxyHandler = http.get("/api/media-proxy", async () => {
  const response = await fetch("/test-audio.m4a");
  return new HttpResponse(await response.arrayBuffer(), {
    headers: { "Content-Type": "audio/mp4" },
  });
});

/**
 * Handler for getWaveformUrl - returns completed waveform status.
 * Type-safe: return type must match RouterOutputs["file"]["getWaveformUrl"]
 */
export const getWaveformUrlHandler = trpcQuery("file.getWaveformUrl", () => ({
  status: "completed" as const,
  url: "/test-audio.dat",
  error: null,
}));

/**
 * Handler for diarization subscription - SSE stream that stays open.
 */
export const diarizationSubscriptionHandler = trpcSubscription(
  "clippingSession.onDiarizationComplete",
);

/**
 * Default handlers for timeline stories.
 */
export const timelineHandlers = [
  mediaProxyHandler,
  getWaveformUrlHandler,
  diarizationSubscriptionHandler,
];
