import { HttpResponse, http } from "msw";
import { trpcMutation, trpcQuery, trpcSubscription } from "./trpc";

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
 * Handler for updateSegments mutation - batch segment updates.
 */
export const updateSegmentsHandler = trpcMutation(
  "clippingSession.updateSegments",
  () => ({ success: true }),
);

/**
 * Handler for deleteSegments mutation.
 */
export const deleteSegmentsHandler = trpcMutation(
  "clippingSession.deleteSegments",
  () => ({ success: true }),
);

/**
 * Handler for splitSegment mutation.
 */
export const splitSegmentHandler = trpcMutation(
  "clippingSession.splitSegment",
  () => ({
    success: true,
    firstSegmentId: crypto.randomUUID(),
    secondSegmentId: crypto.randomUUID(),
  }),
);

/**
 * Handler for createSegment mutation.
 */
export const createSegmentHandler = trpcMutation(
  "clippingSession.createSegment",
  () => ({
    success: true,
    segment: {
      id: crypto.randomUUID(),
      sessionId: "mock-session",
      speakerId: "speaker-1",
      startTime: 0,
      endTime: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  }),
);

/**
 * Handler for createSpeaker mutation.
 */
export const createSpeakerHandler = trpcMutation("speaker.create", () => ({
  id: crypto.randomUUID(),
  projectId: "mock-project",
  userId: "mock-user",
  name: "NEW_SPEAKER",
  color: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}));

/**
 * Default handlers for timeline stories.
 */
export const timelineHandlers = [
  mediaProxyHandler,
  getWaveformUrlHandler,
  diarizationSubscriptionHandler,
  updateSegmentsHandler,
  deleteSegmentsHandler,
  splitSegmentHandler,
  createSegmentHandler,
  createSpeakerHandler,
];
