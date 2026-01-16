import { Layer } from "effect";
import { MockClipGenerationServiceLive } from "./clip/clip-generation-service";
import { MockDenoiseServiceLive } from "./denoise/denoise-service";
import { PyannoteServiceLive } from "./diarization/pyannote-service";
import { MockOverlapRemovalServiceLive } from "./overlap/overlap-removal-service";
import { BullMQQueueServiceLive } from "./queue/bullmq-queue-service";
import { R2StorageServiceLive } from "./storage/r2-storage-service";
import { MockTranscriptionServiceLive } from "./transcription/transcription-service";
import { VideoExtractionServiceLive } from "./video/video-extraction-service";
import { WaveformServiceLive } from "./waveform/waveform-service";

export * from "./clip/clip-generation-service";
export * from "./denoise/denoise-service";
export * from "./diarization/diarization-service";
export * from "./overlap/overlap-removal-service";
export * from "./queue/queue-service";
export * from "./storage/storage-service";
export * from "./transcription/transcription-service";
export * from "./video";
export * from "./waveform";

// Combined live layer with all services
export const ServicesLive = Layer.mergeAll(
  R2StorageServiceLive,
  PyannoteServiceLive,
  BullMQQueueServiceLive,
  VideoExtractionServiceLive,
  WaveformServiceLive,
  MockTranscriptionServiceLive,
  MockClipGenerationServiceLive,
  MockDenoiseServiceLive,
  MockOverlapRemovalServiceLive,
);
