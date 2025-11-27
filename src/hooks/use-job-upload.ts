import { useState } from "react";
import { api } from "~/trpc/react";

export type FileWithProgress = {
  file: File;
  progress: number;
  status: "pending" | "uploading" | "uploaded" | "error";
  error?: string;
  audioFileId?: string;
};

export const MAX_FILES = 10;
export const ACCEPTED_TYPES = {
  "audio/*": [".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac"],
};

type UseJobUploadParams = {
  projectId: string;
  onSuccess?: (jobId: string) => void;
};

type UseJobUploadReturn = {
  files: FileWithProgress[];
  isUploading: boolean;
  addFiles: (files: File[]) => void;
  removeFile: (index: number) => void;
  startJob: () => Promise<void>;
  totalProgress: number;
  hasErrors: boolean;
  allUploaded: boolean;
};

/**
 * Helper function to transfer a file from MinIO to Pyannote and start diarization
 */
async function transferAndProcessFile(
  fileInfo: {
    audioFileId: string;
    storageKey: string;
    mimeType: string;
  },
  processSingleFile: ReturnType<
    typeof api.diarization.processSingleFile.useMutation
  >
): Promise<void> {
  // Call the transfer API to move file from MinIO to Pyannote
  const transferResponse = await fetch("/api/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storageKey: fileInfo.storageKey,
      contentType: fileInfo.mimeType,
    }),
  });

  if (!transferResponse.ok) {
    throw new Error(`Transfer failed: ${transferResponse.statusText}`);
  }

  const { mediaUrl } = (await transferResponse.json()) as {
    mediaUrl: string;
  };

  // Start Pyannote diarization job for this file
  await processSingleFile.mutateAsync({
    audioFileId: fileInfo.audioFileId,
    pyannoteMediaUrl: mediaUrl,
  });
}

export function useJobUpload({
  projectId,
  onSuccess,
}: UseJobUploadParams): UseJobUploadReturn {
  const [files, setFiles] = useState<FileWithProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const createJob = api.diarization.createJob.useMutation();
  const getUploadUrl = api.diarization.getUploadUrl.useMutation();
  const confirmUpload = api.diarization.confirmUpload.useMutation();
  const startProcessing = api.diarization.startProcessing.useMutation();
  const processSingleFile = api.diarization.processSingleFile.useMutation();

  const addFiles = (newFiles: File[]) => {
    const filesToAdd = newFiles.slice(0, MAX_FILES - files.length);
    const fileWithProgress = filesToAdd.map((file) => ({
      file,
      progress: 0,
      status: "pending" as const,
    }));
    setFiles((prev) => [...prev, ...fileWithProgress]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFile = async (
    fileWithProgress: FileWithProgress,
    currentJobId: string,
    index: number
  ): Promise<void> => {
    const { file } = fileWithProgress;

    try {
      // Get presigned URL
      const { uploadUrl, audioFileId } = await getUploadUrl.mutateAsync({
        jobId: currentJobId,
        filename: file.name,
        contentType: file.type || "audio/mpeg",
        fileSizeBytes: file.size,
      });

      // Update status
      setFiles((prev) =>
        prev.map((f, i) =>
          i === index ? { ...f, status: "uploading" as const, audioFileId } : f
        )
      );

      // Upload to MinIO with XMLHttpRequest for progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            setFiles((prev) =>
              prev.map((f, i) => (i === index ? { ...f, progress } : f))
            );
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        });

        xhr.addEventListener("error", () => {
          reject(new Error("Upload failed"));
        });

        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type || "audio/mpeg");
        xhr.send(file);
      });

      // Confirm upload
      await confirmUpload.mutateAsync({ audioFileId });

      // Update status to uploaded
      setFiles((prev) =>
        prev.map((f, i) =>
          i === index ? { ...f, status: "uploaded" as const, progress: 100 } : f
        )
      );
    } catch (error) {
      setFiles((prev) =>
        prev.map((f, i) =>
          i === index
            ? {
                ...f,
                status: "error" as const,
                error: error instanceof Error ? error.message : "Upload failed",
              }
            : f
        )
      );
      throw error;
    }
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Job orchestration requires sequential operations
  const startJob = async (): Promise<void> => {
    if (files.length === 0) {
      return;
    }

    setIsUploading(true);

    try {
      // Create job
      const job = await createJob.mutateAsync({ projectId });
      const currentJobId = job?.id;

      if (!currentJobId) {
        throw new Error("Failed to create job");
      }

      // Upload all files to MinIO
      await Promise.all(
        files.map((file, index) => uploadFile(file, currentJobId, index))
      );

      // Start processing (this updates job status to "uploading")
      const processingResult = await startProcessing.mutateAsync({
        jobId: currentJobId,
      });

      // Transfer each file from MinIO to Pyannote and start diarization
      if (processingResult?.files) {
        for (const fileInfo of processingResult.files) {
          try {
            await transferAndProcessFile(fileInfo, processSingleFile);
          } catch (error) {
            console.error(
              `Failed to process file ${fileInfo.audioFileId}:`,
              error
            );
            // Continue with other files even if one fails
          }
        }
      }

      // Call success callback
      if (onSuccess) {
        onSuccess(currentJobId);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const allUploaded =
    files.length > 0 && files.every((f) => f.status === "uploaded");
  const hasErrors = files.some((f) => f.status === "error");
  const totalProgress =
    files.length > 0
      ? Math.round(files.reduce((acc, f) => acc + f.progress, 0) / files.length)
      : 0;

  return {
    files,
    isUploading,
    addFiles,
    removeFile,
    startJob,
    totalProgress,
    hasErrors,
    allUploaded,
  };
}
