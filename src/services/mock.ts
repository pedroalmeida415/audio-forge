/**
 * Mock implementations of Effect services for testing and Storybook
 *
 * These mocks provide deterministic behavior without external dependencies
 * (no S3, no Pyannote API, no Redis, no Docker, no ffmpeg)
 */

import { Effect, Layer } from "effect";
import {
  type DiarizationSegment,
  DiarizationService,
  type JobStatusResult,
  type SubmitJobResult,
} from "./diarization/diarization-service";
import {
  QueueService,
  type WaveformEnqueueResult,
} from "./queue/queue-service";
import {
  type PresignedUrlResult,
  StorageService,
} from "./storage/storage-service";
import {
  type AudioExtractionResult,
  VideoExtractionService,
  type VideoProbeResult,
} from "./video/video-extraction-service";
import {
  type WaveformResult,
  WaveformService,
} from "./waveform/waveform-service";

/**
 * Mock Storage Service
 * Returns fake presigned URLs without hitting S3
 */
export const MockStorageService = Layer.succeed(
  StorageService,
  StorageService.of({
    generatePresignedUploadUrl: ({ fileName, userId }) =>
      Effect.succeed<PresignedUrlResult>({
        url: `https://mock-storage.example.com/upload/${userId}/${fileName}`,
        key: `${userId}/${crypto.randomUUID()}-${fileName}`,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour from now
      }),

    generatePresignedDownloadUrl: ({ key, expiresIn = 3600 }) =>
      Effect.succeed(
        `https://mock-storage.example.com/download/${key}?expires=${expiresIn}`,
      ),

    deleteObject: () => Effect.succeed(void 0),
  }),
);

/**
 * Mock Diarization Service
 * Returns fake job IDs and mock diarization results
 */
export const MockDiarizationService = Layer.succeed(
  DiarizationService,
  DiarizationService.of({
    submitJob: ({ audioUrl, numSpeakers }) =>
      Effect.succeed<SubmitJobResult>({
        jobId: `mock-job-${crypto.randomUUID()}`,
        status: "created",
        warning: numSpeakers
          ? `Mock: Using ${numSpeakers} speakers (from ${audioUrl})`
          : undefined,
      }),

    getJobStatus: (jobId) =>
      Effect.succeed<JobStatusResult>({
        jobId,
        status: "succeeded",
        createdAt: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
        updatedAt: new Date().toISOString(),
        output: {
          diarization: generateMockDiarizationSegments(),
        },
      }),
  }),
);

/**
 * Mock Queue Service
 * Returns fake queue positions without Redis/BullMQ
 */
export const MockQueueService = Layer.succeed(
  QueueService,
  QueueService.of({
    enqueueWaveformGeneration: ({ fileId }) =>
      Effect.succeed<WaveformEnqueueResult>({
        fileId,
        position: 0, // Always first in queue
      }),

    getWaveformPosition: () => Effect.succeed(null), // Job completed
  }),
);

/**
 * Mock Video Extraction Service
 * Returns fake metadata and paths without ffmpeg
 */
export const MockVideoExtractionService = Layer.succeed(
  VideoExtractionService,
  VideoExtractionService.of({
    probeVideo: () =>
      Effect.succeed<VideoProbeResult>({
        hasAudio: true,
        durationSeconds: 120.5,
        audioStreams: [
          {
            codec: "aac",
            channels: 2,
            sampleRate: 48000,
            bitrate: 128000,
          },
        ],
      }),

    extractAudio: ({ outputPath }) =>
      Effect.succeed<AudioExtractionResult>({
        durationSeconds: 120.5,
        outputPath,
      }),
  }),
);

/**
 * Mock Waveform Service
 * Returns fake waveform paths without Docker/audiowaveform
 */
export const MockWaveformService = Layer.succeed(
  WaveformService,
  WaveformService.of({
    generateWaveform: ({ outputPath }) =>
      Effect.succeed<WaveformResult>({
        outputPath,
      }),
  }),
);

/**
 * Combined mock services layer
 * Use this in test/Storybook environments
 */
export const MockServicesLayer = Layer.mergeAll(
  MockStorageService,
  MockDiarizationService,
  MockQueueService,
  MockVideoExtractionService,
  MockWaveformService,
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate realistic mock diarization segments
 */
function generateMockDiarizationSegments(): DiarizationSegment[] {
  return [
    {
      speaker: "SPEAKER_00",
      start: 0.5,
      end: 3.2,
      confidence: 0.95,
    },
    {
      speaker: "SPEAKER_01",
      start: 3.5,
      end: 7.8,
      confidence: 0.92,
    },
    {
      speaker: "SPEAKER_00",
      start: 8.1,
      end: 12.4,
      confidence: 0.94,
    },
    {
      speaker: "SPEAKER_01",
      start: 12.7,
      end: 18.2,
      confidence: 0.91,
    },
    {
      speaker: "SPEAKER_00",
      start: 18.5,
      end: 22.9,
      confidence: 0.93,
    },
  ];
}
