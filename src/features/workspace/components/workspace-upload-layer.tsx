"use client";

import { AlertCircle, Loader2, Upload } from "lucide-react";
import { useParams } from "next/navigation";
import { useQueryState } from "nuqs";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { workspaceParams } from "~/features/workspace/search-params";
import { api } from "~/trpc/react";

const EXTENSION_CONTENT_TYPE: Record<string, string> = {
  ".aac": "audio/aac",
  ".avi": "video/x-msvideo",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".m4v": "video/x-m4v",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".webm": "video/webm",
};

type IngestStatus = "pending" | "processing" | "completed" | "failed";

interface WorkspaceUploadContextValue {
  openFilePicker: () => void;
  isUploading: boolean;
  uploadError: string | null;
  ingestStatus: IngestStatus | null;
  ingestError: string | null;
}

const WorkspaceUploadContext =
  createContext<WorkspaceUploadContextValue | null>(null);

function isSupportedUploadType(contentType: string): boolean {
  return contentType.startsWith("audio/") || contentType.startsWith("video/");
}

function resolveUploadContentType(file: File): string | null {
  if (file.type && isSupportedUploadType(file.type)) {
    return file.type;
  }

  const lowerName = file.name.toLowerCase();
  const extension = lowerName.includes(".")
    ? lowerName.slice(lowerName.lastIndexOf("."))
    : "";
  const inferred = EXTENSION_CONTENT_TYPE[extension];
  return inferred ?? null;
}

function readTrpcError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as {
    error?: {
      message?: string;
      json?: {
        message?: string;
      };
    };
  };

  return value.error?.json?.message ?? value.error?.message ?? null;
}

function readUploadSourceId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const value = payload as {
    result?: {
      data?:
        | {
            json?: {
              sourceId?: string;
            };
            sourceId?: string;
          }
        | {
            sourceId?: string;
          };
    };
  };

  const data = value.result?.data;
  if (!data || typeof data !== "object") return null;

  const jsonData = "json" in data && data.json ? data.json : data;
  if (!jsonData || typeof jsonData !== "object") return null;

  return "sourceId" in jsonData && typeof jsonData.sourceId === "string"
    ? jsonData.sourceId
    : null;
}

function hasDragFiles(event: DragEvent): boolean {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes("Files");
}

export function WorkspaceUploadLayer({ children }: { children: ReactNode }) {
  const { projectId } = useParams<{ projectId: string }>();
  const utils = api.useUtils();

  const [sourceId, setSourceId] = useQueryState(
    "sourceId",
    workspaceParams.sourceId,
  );
  const [, setSpeakerId] = useQueryState(
    "speakerId",
    workspaceParams.speakerId,
  );

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const lastInvalidatedCompletedSourceRef = useRef<string | null>(null);

  const ingestStatusQuery = api.source.getIngestStatus.useQuery(
    { sourceId: sourceId ?? "" },
    {
      enabled: !!sourceId,
      refetchOnWindowFocus: false,
      refetchInterval: (query) => {
        const status = query.state.data?.ingestStatus;
        if (status === "pending" || status === "processing") {
          return 2000;
        }
        return false;
      },
      refetchIntervalInBackground: true,
    },
  );

  useEffect(() => {
    if (!sourceId) {
      lastInvalidatedCompletedSourceRef.current = null;
      return;
    }

    if (
      ingestStatusQuery.data?.ingestStatus === "completed" &&
      lastInvalidatedCompletedSourceRef.current !== sourceId
    ) {
      lastInvalidatedCompletedSourceRef.current = sourceId;
      void Promise.all([
        utils.source.getById.invalidate({ id: sourceId }),
        utils.source.listByProject.invalidate({ projectId }),
        utils.segment.getBySource.invalidate({ sourceId }),
        utils.segment.getBySpeaker.invalidate(),
      ]);
    }
  }, [ingestStatusQuery.data?.ingestStatus, projectId, sourceId, utils]);

  async function uploadFile(file: File) {
    const contentType = resolveUploadContentType(file);

    if (!contentType) {
      setUploadError("Unsupported file type. Upload an audio or video file.");
      return;
    }

    setUploadError(null);
    setIsUploading(true);

    try {
      const response = await fetch("/api/trpc/source.upload", {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-content-type": contentType,
          "x-filename": file.name || "upload",
          "x-project-id": projectId,
        },
        body: file,
      });

      const payload = (await response.json()) as unknown;
      const trpcError = readTrpcError(payload);
      if (!response.ok || trpcError) {
        throw new Error(
          trpcError ?? `Upload failed with status ${response.status}`,
        );
      }

      const nextSourceId = readUploadSourceId(payload);
      if (!nextSourceId) {
        throw new Error("Upload succeeded but no source id was returned");
      }

      await setSourceId(nextSourceId);
      await setSpeakerId(null);

      await Promise.all([
        utils.source.listByProject.invalidate({ projectId }),
        utils.source.getById.invalidate({ id: nextSourceId }),
        utils.segment.getBySource.invalidate({ sourceId: nextSourceId }),
      ]);
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Failed to upload source",
      );
    } finally {
      setIsUploading(false);
    }
  }

  function uploadFirstSupportedFile(files: File[]) {
    const first = files.find((file) => resolveUploadContentType(file) !== null);
    if (!first) {
      setUploadError("Drop an audio or video file to upload.");
      return;
    }

    void uploadFile(first);
  }

  useEffect(() => {
    function handleDragEnter(event: DragEvent) {
      if (!hasDragFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDragging(true);
    }

    function handleDragOver(event: DragEvent) {
      if (!hasDragFiles(event)) return;
      event.preventDefault();
    }

    function handleDragLeave(event: DragEvent) {
      if (!hasDragFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDragging(false);
      }
    }

    function handleDrop(event: DragEvent) {
      if (!hasDragFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDragging(false);

      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return;
      uploadFirstSupportedFile(Array.from(files));
    }

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  const contextValue: WorkspaceUploadContextValue = {
    openFilePicker: () => fileInputRef.current?.click(),
    isUploading,
    uploadError,
    ingestStatus: ingestStatusQuery.data?.ingestStatus ?? null,
    ingestError:
      ingestStatusQuery.data?.ingestError ??
      ingestStatusQuery.data?.waveformError ??
      null,
  };

  return (
    <WorkspaceUploadContext.Provider value={contextValue}>
      {children}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="audio/*,video/*"
        onChange={(event) => {
          const files = event.target.files;
          if (files?.length) {
            uploadFirstSupportedFile(Array.from(files));
          }

          event.target.value = "";
        }}
      />

      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-xs">
          <div className="flex w-[360px] flex-col items-center gap-3 rounded-lg border border-primary/60 border-dashed bg-card p-8 text-center">
            <Upload className="size-7 text-primary" />
            <p className="font-medium text-sm">Drop audio or video to upload</p>
            <p className="text-muted-foreground text-xs">
              The source will ingest asynchronously in the background.
            </p>
          </div>
        </div>
      )}

      {(isUploading || uploadError) && (
        <div className="fixed right-4 bottom-4 z-50 rounded-md border bg-card px-3 py-2 shadow">
          {isUploading ? (
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
              <span>Uploading source...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="size-4" />
              <span>{uploadError}</span>
            </div>
          )}
        </div>
      )}
    </WorkspaceUploadContext.Provider>
  );
}

export function useWorkspaceUpload() {
  const context = useContext(WorkspaceUploadContext);
  if (!context) {
    throw new Error(
      "useWorkspaceUpload must be used within WorkspaceUploadLayer",
    );
  }
  return context;
}
