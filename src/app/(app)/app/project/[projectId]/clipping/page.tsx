"use client";

import { ArrowLeft, Loader2, Music, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "~/components/ui/button";
import { Progress } from "~/components/ui/progress";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Separator } from "~/components/ui/separator";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

const ACCEPTED_AUDIO_TYPES = {
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "audio/flac": [".flac"],
  "audio/ogg": [".ogg"],
  "audio/mp4": [".m4a"],
};

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
    const audioFile = acceptedFiles[0];
    if (audioFile) {
      setFile(audioFile);
      setUploadProgress(0);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_AUDIO_TYPES,
    maxFiles: 1,
    maxSize: 500 * 1024 * 1024, // 500MB
  });

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);

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
      setIsUploading(false);
    }
  };

  const isLoading =
    isUploading || getUploadUrl.isPending || createFile.isPending;

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
              <h2 className="font-semibold text-xl">Upload Audio</h2>
              <p className="text-muted-foreground text-sm">
                Upload an audio file to start creating clips
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
                  <Music className="h-8 w-8 text-primary" />
                  <div>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-muted-foreground text-sm">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="mb-1 text-center font-medium">
                    {isDragActive
                      ? "Drop audio file here"
                      : "Drag and drop audio file, or click to select"}
                  </p>
                  <p className="text-center text-muted-foreground text-sm">
                    Supports MP3, WAV, FLAC, OGG, M4A (max 500MB)
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
                      {uploadProgress < 100 ? "Uploading..." : "Creating..."}
                    </>
                  ) : (
                    "Upload & Start Clipping"
                  )}
                </Button>

                {isUploading && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Uploading...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} />
                  </div>
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
