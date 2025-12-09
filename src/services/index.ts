import { Layer } from "effect";
import { PyannoteServiceLive } from "./diarization/pyannote-service";
import { R2StorageServiceLive } from "./storage/r2-storage-service";

export * from "./diarization/diarization-service";
// Re-export service interfaces
export * from "./storage/storage-service";

// Combined live layer with all services
export const ServicesLive = Layer.mergeAll(
  R2StorageServiceLive,
  PyannoteServiceLive,
);
