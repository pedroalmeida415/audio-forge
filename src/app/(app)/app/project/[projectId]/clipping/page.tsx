"use client";

import { ArrowLeft, Film, Loader2, Music, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "~/components/ui/button";
import { Progress } from "~/components/ui/progress";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Separator } from "~/components/ui/separator";
import { cn } from "~/lib/utils";
import {
  ACCEPTED_VIDEO_TYPES,
  isVideoMimeType,
} from "~/lib/video-types";
import { api } from "~/trpc/react";

const ACCEPTED_AUDIO_TYPES = {
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "audio/flac": [".flac"],
  "audio/ogg": [".ogg"],
  "audio/mp4": [".m4a"],
};

// Combined accepted types for dropzone
const ACCEPTED_MEDIA_TYPES = {
  ...ACCEPTED_AUDIO_TYPES,
  ...ACCEPTED_VIDEO_TYPES,
};

// File size limits
const MAX_AUDIO_SIZE = 500 * 1024 * 1024; // 500MB
const MAX_VIDEO_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

function isVideoFile(file: File): boolean {
  return isVideoMimeType(file.type);
}

export default function ClippingEmptyStatePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [existingSessions] = api.clippingSession.listByProject.useSuspenseQuery(
    { projectId },
    { refetchOnWindowFocus: false },
  );

  const getUploadUrl = api.file.getUploadUrl.useMutation();
  const createFile = api.file.create.useMutation({
    onSuccess: ({ session }) => {
      router.push(`/app/project/${projectId}/clipping/${session.id}`);
    },
  });

  const onDrop = (acceptedFiles: File[]) => {
    const mediaFile = acceptedFiles[0];
    if (mediaFile) {
      setFile(mediaFile);
      setUploadProgress(0);
      setUploadError(null);
    }
  };

  // Validate file size based on type
  const validateFileSize = (file: File): boolean => {
    const maxSize = isVideoFile(file) ? MAX_VIDEO_SIZE : MAX_AUDIO_SIZE;
    return file.size <= maxSize;
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_MEDIA_TYPES,
    maxFiles: 1,
    maxSize: MAX_VIDEO_SIZE, // Use larger limit, validate specifically in onDrop
    validator: (file) => {
      if (!validateFileSize(file)) {
        const maxSize = isVideoFile(file) ? "2GB" : "500MB";
        return {
          code: "file-too-large",
          message: `File is too large. Maximum size is ${maxSize}.`,
        };
      }
      return null;
    },
  });

  // Handle audio upload (existing flow)
  const handleAudioUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      // 1. Get presigned URL
      const { url, key } = await getUploadUrl.mutateAsync({
        fileName: file.name,
        contentType: file.type,
      });

      // 2. Upload to R2 with progress
      await uploadWithProgress(url, file, setUploadProgress);

      // 3. Create file record and navigate
      await createFile.mutateAsync({
        storageKey: key,
        projectId,
        name: file.name,
      });
    } catch (error) {
      console.error("Upload failed:", error);
      setUploadError(
        error instanceof Error ? error.message : "Upload failed",
      );
      setIsUploading(false);
    }
  };

  // Handle video upload (upload to server, extract audio)
  const handleVideoUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      // Upload video to server with progress, then extract audio
      const result = await uploadVideoWithProgress(
        file,
        projectId,
        setUploadProgress,
        () => {
          setIsExtracting(true);
        },
      );

      // Navigate to the new session
      router.push(`/app/project/${projectId}/clipping/${result.session.id}`);
    } catch (error) {
      console.error("Video upload failed:", error);
      setUploadError(
        error instanceof Error ? error.message : "Video upload failed",
      );
      setIsUploading(false);
      setIsExtracting(false);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    if (isVideoFile(file)) {
      await handleVideoUpload();
    } else {
      await handleAudioUpload();
    }
  };

  const isLoading =
    isUploading ||
    isExtracting ||
    getUploadUrl.isPending ||
    createFile.isPending;

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-background px-4 py-2">
        <div className="flex items-center gap-3">
          <Link href={`/app/project/${projectId}`}>
            <Button size="icon" variant="ghost">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="font-medium text-sm">Clipping Workspace</h1>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-xl space-y-8">
          {/* Upload section */}
          <div className="space-y-4">
            <div className="text-center">
              <h2 className="font-semibold text-xl">Upload Media</h2>
              <p className="text-muted-foreground text-sm">
                Upload audio or video to start creating segments
              </p>
            </div>

            {/* Dropzone */}
            <div
              {...getRootProps()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors",
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50",
                file && "border-primary/30 bg-primary/5",
              )}
            >
              <input {...getInputProps()} />
              {file ? (
                <div className="flex items-center gap-3">
                  {isVideoFile(file) ? (
                    <Film className="h-8 w-8 text-primary" />
                  ) : (
                    <Music className="h-8 w-8 text-primary" />
                  )}
                  <div>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-muted-foreground text-sm">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                      {isVideoFile(file) && " (video)"}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="mb-1 text-center font-medium">
                    {isDragActive
                      ? "Drop file here"
                      : "Drag and drop audio or video, or click to select"}
                  </p>
                  <p className="text-center text-muted-foreground text-sm">
                    Audio: MP3, WAV, FLAC, OGG, M4A (max 500MB)
                  </p>
                  <p className="text-center text-muted-foreground text-sm">
                    Video: MP4, MOV, MKV, WebM, AVI (max 2GB)
                  </p>
                </>
              )}
            </div>

            {/* Upload button and progress */}
            {file && (
              <div className="space-y-4">
                <Button
                  onClick={handleUpload}
                  disabled={isLoading}
                  className="w-full"
                  size="lg"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isExtracting
                        ? "Extracting audio..."
                        : uploadProgress < 100
                          ? "Uploading..."
                          : "Creating..."}
                    </>
                  ) : (
                    "Upload & Start Clipping"
                  )}
                </Button>

                {/* Progress indicator */}
                {isUploading && (
                  <div className="space-y-2">
                    {isExtracting ? (
                      <>
                        <div className="flex justify-between text-sm">
                          <span>Extracting audio from video...</span>
                        </div>
                        <Progress value={100} className="animate-pulse" />
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between text-sm">
                          <span>
                            {isVideoFile(file)
                              ? "Uploading video..."
                              : "Uploading..."}
                          </span>
                          <span>{uploadProgress}%</span>
                        </div>
                        <Progress value={uploadProgress} />
                      </>
                    )}
                  </div>
                )}

                {/* Error display */}
                {uploadError && (
                  <p className="text-center text-destructive text-sm">
                    {uploadError}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Existing sessions section */}
          {existingSessions.length > 0 && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator className="w-full" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or select existing session
                  </span>
                </div>
              </div>

              <ScrollArea className="h-48">
                <div className="space-y-2">
                  {existingSessions.map((session) => (
                    <button
                      key={session.id}
                      onClick={() =>
                        router.push(
                          `/app/project/${projectId}/clipping/${session.id}`,
                        )
                      }
                      className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <Music className="h-5 w-5 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-sm">
                          {session.name ??
                            session.file?.name ??
                            session.file?.storageKey?.split("/").pop() ??
                            "Untitled"}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {new Date(session.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper function for upload with progress
async function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (progress: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100);
        onProgress(progress);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Upload failed")));

    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.send(file);
  });
}

// Helper function for video upload with progress to tRPC endpoint
interface VideoUploadResult {
  file: { id: string };
  session: { id: string };
}

async function uploadVideoWithProgress(
  file: File,
  projectId: string,
  onProgress: (progress: number) => void,
  onExtractionStart: () => void,
): Promise<VideoUploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100);
        onProgress(progress);
        // When upload is complete, extraction begins
        if (progress === 100) {
          onExtractionStart();
        }
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          // Parse tRPC response - format is { result: { data: { json: ... } } }
          const response = JSON.parse(xhr.responseText);

          // tRPC with superjson wraps data in result.data.json
          const data = response.result?.data?.json ?? response.result?.data;

          if (data?.session?.id) {
            resolve(data);
          } else if (response.error) {
            const errorMessage =
              response.error.json?.message ??
              response.error.message ??
              "Video processing failed";
            reject(new Error(errorMessage));
          } else {
            reject(new Error("Unexpected response format"));
          }
        } catch {
          reject(new Error("Failed to parse response"));
        }
      } else {
        try {
          const response = JSON.parse(xhr.responseText);
          const errorMessage =
            response.error?.json?.message ??
            response.error?.message ??
            `Upload failed with status ${xhr.status}`;
          reject(new Error(errorMessage));
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener("error", () =>
      reject(new Error("Network error during upload")),
    );

    // POST to tRPC endpoint with file as body, metadata in headers
    // Use application/octet-stream for tRPC's octetInputParser
    // Pass actual content type in custom header for validation
    xhr.open("POST", "/api/trpc/file.uploadVideo");
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("x-content-type", file.type);
    xhr.setRequestHeader("x-project-id", projectId);
    xhr.setRequestHeader("x-filename", file.name);
    xhr.send(file);
  });
}
