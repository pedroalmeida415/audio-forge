"use client";

import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useQueryStates } from "nuqs";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Progress } from "~/components/ui/progress";
import { Switch } from "~/components/ui/switch";
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
type UploadItemStatus = "queued" | "uploading" | "completed" | "failed";

interface UploadBatchItem {
  id: string;
  name: string;
  size: number;
  status: UploadItemStatus;
  progress?: number;
  error: string | null;
}

interface SelectedUploadFile {
  file: File;
  contentType: string;
  itemId: string;
}

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

function readErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }

  const precision = unit === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unit]}`;
}

function formatUploadStatus(item: UploadBatchItem): string {
  switch (item.status) {
    case "queued":
      return "Queued";
    case "uploading":
      return item.progress !== undefined
        ? `Uploading ${item.progress}%`
        : "Uploading";
    case "completed":
      return "Uploaded";
    case "failed":
      return item.error ?? "Failed";
  }
}

function createUploadItemId(file: File, index: number): string {
  return `${Date.now()}-${file.lastModified}-${index}-${file.name}`;
}

function hasDragFiles(event: DragEvent): boolean {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes("Files");
}

export function WorkspaceUploadLayer({ children }: { children: ReactNode }) {
  const { projectId } = useParams<{ projectId: string }>();
  const utils = api.useUtils();

  const [{ sourceId }] = useQueryStates({
    sourceId: workspaceParams.sourceId,
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [queueDiarizationOnUpload, setQueueDiarizationOnUpload] =
    useState(false);
  const [denoiseBeforeDiarization, setDenoiseBeforeDiarization] =
    useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadItems, setUploadItems] = useState<UploadBatchItem[]>([]);
  const [selectedUploads, setSelectedUploads] = useState<SelectedUploadFile[]>(
    [],
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadFilesRef = useRef<(files: File[]) => void>(() => {});
  const dragDepthRef = useRef(0);
  const prevIngestRef = useRef<{
    sourceId: string;
    status: IngestStatus;
  } | null>(null);

  const ingestStatusQuery = api.source.getStatus.useQuery(
    { sourceId: sourceId ?? "" },
    {
      enabled: !!sourceId,
      refetchOnWindowFocus: false,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === "pending" || status === "processing") {
          return 2000;
        }
        return false;
      },
      refetchIntervalInBackground: true,
    },
  );

  useEffect(() => {
    const status = ingestStatusQuery.data?.status ?? null;

    if (!sourceId || !status) {
      prevIngestRef.current = null;
      return;
    }

    const prev = prevIngestRef.current;
    prevIngestRef.current = { sourceId, status };

    // Only invalidate when transitioning TO completed from a non-completed state
    // for the SAME source. Skip if completed on first load (prev is null) or if
    // the sourceId changed (prev.sourceId !== sourceId) since queries already
    // have fresh data from the initial fetch.
    if (
      status === "completed" &&
      prev != null &&
      prev.sourceId === sourceId &&
      prev.status !== "completed"
    ) {
      void Promise.all([
        utils.source.getById.invalidate({ id: sourceId }),
        utils.source.listByProject.invalidate({ projectId }),
        utils.segment.getBySource.invalidate({ sourceId }),
        utils.segment.getBySpeaker.invalidate(),
      ]);
    }
  }, [ingestStatusQuery.data?.status, projectId, sourceId, utils]);

  function updateUploadItem(
    itemId: string,
    updater: (item: UploadBatchItem) => UploadBatchItem,
  ) {
    setUploadItems((prev) =>
      prev.map((item) => (item.id === itemId ? updater(item) : item)),
    );
  }

  async function uploadSingleFile(params: {
    file: File;
    contentType: string;
    itemId: string;
  }) {
    updateUploadItem(params.itemId, (item) => ({
      ...item,
      status: "uploading",
      progress: 0,
      error: null,
    }));

    try {
      // 1. Request upload URL and get sourceId
      const { sourceId, uploadUrl } =
        await utils.client.source.requestUpload.mutate({
          projectId,
          filename: params.file.name || "upload",
          contentType: params.contentType,
          queueDiarization: queueDiarizationOnUpload,
          denoise: queueDiarizationOnUpload && denoiseBeforeDiarization,
        });

      // 2. Upload file directly to R2 using the presigned URL with XHR to track progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            updateUploadItem(params.itemId, (item) => ({
              ...item,
              progress,
            }));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(
              new Error(
                `Upload failed with status: ${xhr.status} ${xhr.statusText}`,
              ),
            );
          }
        };

        xhr.onerror = () => {
          reject(new Error("Network error occurred during upload"));
        };

        xhr.open("PUT", uploadUrl, true);
        xhr.setRequestHeader("Content-Type", params.contentType);
        xhr.send(params.file);
      });

      updateUploadItem(params.itemId, (item) => ({
        ...item,
        status: "completed",
        progress: 100,
      }));

      return sourceId;
    } catch (error) {
      const message = readErrorMessage(error, "Failed to upload source");
      updateUploadItem(params.itemId, (item) => ({
        ...item,
        status: "failed",
        error: message,
      }));
      throw new Error(message);
    }
  }

  function selectFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }

    if (isUploading) {
      setIsUploadDialogOpen(true);
      setUploadError("An upload is already running. Wait for it to complete.");
      return;
    }

    const supportedFiles: SelectedUploadFile[] = [];
    let unsupportedCount = 0;

    for (const [index, file] of files.entries()) {
      const contentType = resolveUploadContentType(file);
      if (!contentType) {
        unsupportedCount += 1;
        continue;
      }

      supportedFiles.push({
        file,
        contentType,
        itemId: createUploadItemId(file, index),
      });
    }

    if (supportedFiles.length === 0) {
      setIsUploadDialogOpen(true);
      setUploadError("Select at least one supported audio or video file.");
      return;
    }

    setIsUploadDialogOpen(true);
    setSelectedUploads((prev) => [...prev, ...supportedFiles]);
    setUploadItems((prev) => [
      ...prev,
      ...supportedFiles.map((entry) => ({
        id: entry.itemId,
        name: entry.file.name || "upload",
        size: entry.file.size,
        status: "queued" as const,
        progress: 0,
        error: null,
      })),
    ]);
    setUploadError(
      unsupportedCount > 0
        ? `${unsupportedCount} unsupported file${unsupportedCount === 1 ? "" : "s"} skipped.`
        : null,
    );
  }

  async function startUploadBatch() {
    if (isUploading) {
      return;
    }

    if (selectedUploads.length === 0) {
      setUploadError("Select at least one supported audio or video file.");
      return;
    }

    const uploadsToRun = [...selectedUploads];
    const uploadIds = new Set(uploadsToRun.map((entry) => entry.itemId));

    setUploadError(null);
    setUploadItems((prev) =>
      prev.map((item) =>
        uploadIds.has(item.id)
          ? { ...item, status: "queued", progress: 0, error: null }
          : item,
      ),
    );
    setIsUploading(true);

    let failedCount = 0;
    const failedUploads: SelectedUploadFile[] = [];
    const uploadedSourceIds: string[] = [];

    try {
      for (const entry of uploadsToRun) {
        try {
          const sourceId = await uploadSingleFile({
            file: entry.file,
            contentType: entry.contentType,
            itemId: entry.itemId,
          });
          uploadedSourceIds.push(sourceId);
        } catch {
          failedCount += 1;
          failedUploads.push(entry);
        }
      }

      if (uploadedSourceIds.length > 0) {
        await Promise.all([
          utils.source.listByProject.invalidate({ projectId }),
          ...uploadedSourceIds.map((id) =>
            utils.source.getById.invalidate({ id }),
          ),
        ]);
      }

      if (failedCount > 0) {
        const failedIds = new Set(
          failedUploads.map((failedUpload) => failedUpload.itemId),
        );
        setSelectedUploads(failedUploads);
        setUploadItems((prev) => prev.filter((item) => failedIds.has(item.id)));
        setUploadError(
          `${failedCount} file${failedCount === 1 ? "" : "s"} failed to upload.`,
        );
        return;
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 2000);
      });

      setUploadError(null);
      setSelectedUploads([]);
      setUploadItems([]);
      setIsUploadDialogOpen(false);
    } catch (error) {
      setUploadError(readErrorMessage(error, "Failed to upload sources"));
    } finally {
      setIsUploading(false);
    }
  }

  useEffect(() => {
    uploadFilesRef.current = (files) => {
      selectFiles(files);
    };
  }, [selectFiles]);

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
      uploadFilesRef.current(Array.from(files));
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

  const totalUploads = uploadItems.length;
  const completedUploads = uploadItems.filter(
    (item) => item.status === "completed",
  ).length;
  const failedUploads = uploadItems.filter(
    (item) => item.status === "failed",
  ).length;
  const processedUploads = completedUploads + failedUploads;
  const uploadProgress =
    totalUploads > 0 ? Math.round((processedUploads / totalUploads) * 100) : 0;

  const contextValue: WorkspaceUploadContextValue = {
    openFilePicker: () => setIsUploadDialogOpen(true),
    isUploading,
    uploadError,
    ingestStatus: ingestStatusQuery.data?.status ?? null,
    ingestError: ingestStatusQuery.data?.error ?? null,
  };

  return (
    <WorkspaceUploadContext.Provider value={contextValue}>
      {children}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="audio/*,video/*"
        multiple
        onChange={(event) => {
          const files = event.target.files;
          if (files?.length) {
            selectFiles(Array.from(files));
          }

          event.target.value = "";
        }}
      />

      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-xs">
          <div className="flex w-[360px] flex-col items-center gap-3 rounded-lg border border-primary/60 border-dashed bg-card p-8 text-center">
            <Upload className="size-7 text-primary" />
            <p className="font-medium text-sm">
              Drop audio or video files to upload
            </p>
            <p className="text-muted-foreground text-xs">
              Uploads stream directly to the server and ingest runs in the
              background.
            </p>
          </div>
        </div>
      )}

      <Dialog
        open={isUploadDialogOpen}
        onOpenChange={(nextOpen) => {
          if (isUploading) {
            return;
          }

          setIsUploadDialogOpen(nextOpen);

          if (!nextOpen && !isUploading) {
            setSelectedUploads([]);
            setUploadItems([]);
            setUploadError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg" showCloseButton={!isUploading}>
          <DialogHeader>
            <DialogTitle>Upload sources</DialogTitle>
            <DialogDescription>
              Select one or more audio/video files, then click upload when
              ready.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
              <div className="space-y-1">
                <p className="font-medium text-sm">
                  Queue diarization after ingest
                </p>
                <p className="text-muted-foreground text-xs">
                  Automatically submit each uploaded source to diarization when
                  ingest completes after upload.
                </p>
              </div>
              <Switch
                checked={queueDiarizationOnUpload}
                disabled={isUploading}
                onCheckedChange={setQueueDiarizationOnUpload}
              />
            </div>

            {queueDiarizationOnUpload && (
              <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
                <div className="space-y-1">
                  <p className="font-medium text-sm">
                    Denoise before diarization
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Clean up background noise before sending to diarization for
                    better speaker detection accuracy.
                  </p>
                </div>
                <Switch
                  checked={denoiseBeforeDiarization}
                  disabled={isUploading}
                  onCheckedChange={setDenoiseBeforeDiarization}
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <Button
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <Upload className="size-4" />
                Select files
              </Button>
              <span className="text-muted-foreground text-xs">
                {isUploading
                  ? `${processedUploads}/${totalUploads} processed`
                  : `${selectedUploads.length} selected`}
              </span>
            </div>

            {totalUploads > 0 && (
              <div className="space-y-2">
                <Progress value={uploadProgress} />
                <p className="text-muted-foreground text-xs">
                  {processedUploads} of {totalUploads} file
                  {totalUploads === 1 ? "" : "s"} uploaded
                </p>
              </div>
            )}

            {uploadItems.length > 0 && (
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-2">
                {uploadItems.map((item) => (
                  <div
                    className="flex items-start justify-between gap-2 rounded px-1 py-1"
                    key={item.id}
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm">{item.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {formatBytes(item.size)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 text-xs">
                      {item.status === "uploading" && (
                        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                      )}
                      {item.status === "completed" && (
                        <CheckCircle2 className="size-3.5 text-green-600" />
                      )}
                      {item.status === "failed" && (
                        <XCircle className="size-3.5 text-destructive" />
                      )}
                      <span
                        className={
                          item.status === "failed"
                            ? "max-w-[180px] truncate text-destructive"
                            : "text-muted-foreground"
                        }
                      >
                        {formatUploadStatus(item)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {uploadError && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-xs">
                <AlertCircle className="size-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              disabled={isUploading || selectedUploads.length === 0}
              onClick={() => {
                void startUploadBatch();
              }}
              type="button"
            >
              {isUploading && <Loader2 className="size-4 animate-spin" />}
              {queueDiarizationOnUpload ? "Upload & diarize" : "Upload"}
            </Button>
            <Button
              disabled={isUploading}
              onClick={() => setIsUploadDialogOpen(false)}
              type="button"
              variant="outline"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isUploading && (
        <div className="fixed right-4 bottom-4 z-50 rounded-md border bg-card px-3 py-2 shadow">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span>
              Uploading {processedUploads}/{totalUploads} files...
            </span>
          </div>
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
