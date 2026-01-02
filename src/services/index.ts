import { Layer } from "effect";
import { PyannoteServiceLive } from "./diarization/pyannote-service";
import { BullMQQueueServiceLive } from "./queue/bullmq-queue-service";
import { R2StorageServiceLive } from "./storage/r2-storage-service";
import { VideoExtractionServiceLive } from "./video/video-extraction-service";

export * from "./diarization/diarization-service";
export * from "./queue/queue-service";
export * from "./storage/storage-service";
export * from "./video";

// Combined live layer with all services
export const ServicesLive = Layer.mergeAll(
  R2StorageServiceLive,
  PyannoteServiceLive,
  BullMQQueueServiceLive,
  VideoExtractionServiceLive,
);
