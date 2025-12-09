import { Context, Data, type Effect } from "effect";

export interface PresignedUrlResult {
  url: string;
  key: string;
  expiresAt: Date;
}

export class StorageService extends Context.Tag("StorageService")<
  StorageService,
  {
    readonly generatePresignedUploadUrl: (params: {
      fileName: string;
      contentType: string;
      userId: string;
    }) => Effect.Effect<PresignedUrlResult, StoragePresignError>;

    readonly generatePresignedDownloadUrl: (params: {
      key: string;
      expiresIn?: number;
    }) => Effect.Effect<string, StoragePresignError>;

    readonly deleteObject: (params: {
      key: string;
    }) => Effect.Effect<void, StorageUploadError>;
  }
>() {}

// Storage errors
export class StorageUploadError extends Data.TaggedError("StorageUploadError")<{
  message: string;
  cause?: unknown;
}> {}

export class StoragePresignError extends Data.TaggedError(
  "StoragePresignError",
)<{
  message: string;
  cause?: unknown;
}> {}
