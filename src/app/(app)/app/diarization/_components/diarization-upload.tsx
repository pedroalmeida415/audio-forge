"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Loader2, Music, Upload } from "lucide-react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Progress } from "~/components/ui/progress";
import { cn } from "~/lib/utils";

const ACCEPTED_AUDIO_TYPES = {
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "audio/flac": [".flac"],
  "audio/ogg": [".ogg"],
  "audio/mp4": [".m4a"],
};

export function DiarizationUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [numSpeakers, setNumSpeakers] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);

  const utils = api.useUtils();

  const getUploadUrl = api.diarization.getUploadUrl.useMutation();
  const createDiarization = api.diarization.create.useMutation({
    onSuccess: () => {
      utils.diarization.list.invalidate();
      setFile(null);
      setUploadProgress(0);
      setNumSpeakers("");
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const audioFile = acceptedFiles[0];
    if (audioFile) {
      setFile(audioFile);
      setUploadProgress(0);
    }
  }, []);

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

      // 3. Create diarization job
      await createDiarization.mutateAsync({
        storageKey: key,
        numSpeakers: numSpeakers ? parseInt(numSpeakers, 10) : undefined,
      });
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const isLoading =
    isUploading || getUploadUrl.isPending || createDiarization.isPending;

  return (
    <Card>
      <CardContent className="pt-6">
        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors",
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

        {/* Options and Upload Button */}
        {file && (
          <div className="mt-6 space-y-4">
            <div className="flex items-end gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="numSpeakers">
                  Number of speakers (optional)
                </Label>
                <Input
                  id="numSpeakers"
                  type="number"
                  min="1"
                  max="20"
                  placeholder="Auto-detect"
                  value={numSpeakers}
                  onChange={(e) => setNumSpeakers(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <Button
                onClick={handleUpload}
                disabled={isLoading}
                className="min-w-32"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Start Diarization"
                )}
              </Button>
            </div>

            {/* Progress bar */}
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
      </CardContent>
    </Card>
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
