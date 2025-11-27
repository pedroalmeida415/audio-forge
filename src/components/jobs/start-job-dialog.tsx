"use client";

import { FileAudio, Loader2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Progress } from "~/components/ui/progress";
import {
  ACCEPTED_TYPES,
  MAX_FILES,
  useJobUpload,
} from "~/hooks/use-job-upload";

type StartJobDialogProps = {
  projectId: string;
  children: React.ReactNode;
};

export function StartJobDialog({ projectId, children }: StartJobDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const { files, isUploading, addFiles, removeFile, startJob, totalProgress } =
    useJobUpload({
      projectId,
      onSuccess: (jobId) => {
        // Navigate to job page if single file, project page if multiple
        if (jobId && files.length === 1) {
          router.push(`/projects/${projectId}/jobs/${jobId}`);
        } else {
          router.push(`/projects/${projectId}`);
        }
        setOpen(false);
      },
    });

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      addFiles(acceptedFiles);
    },
    [addFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: MAX_FILES,
    disabled: isUploading || files.length >= MAX_FILES,
  });

  const handleStartJob = async () => {
    try {
      await startJob();
    } catch (_error) {
      // Error already handled in hook
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isUploading) {
      setOpen(isOpen);
    }
  };

  const getDropzoneClassName = () => {
    if (isDragActive) {
      return "cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors border-primary bg-primary/10";
    }
    if (files.length >= MAX_FILES) {
      return "cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-not-allowed border-muted bg-muted/50";
    }
    return "cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors border-muted hover:border-primary";
  };

  const renderDropzoneContent = () => {
    if (files.length >= MAX_FILES) {
      return <p className="text-muted-foreground">Maximum files reached</p>;
    }
    if (isDragActive) {
      return <p>Drop files here...</p>;
    }
    return (
      <>
        <p>Drag & drop audio files, or click to select</p>
        <p className="mt-1 text-muted-foreground text-sm">
          MP3, WAV, M4A, FLAC, OGG supported
        </p>
      </>
    );
  };

  return (
    <Dialog onOpenChange={handleClose} open={open}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Start Diarization Job</DialogTitle>
          <DialogDescription>
            Upload audio files to process. Maximum {MAX_FILES} files per job.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Dropzone */}
          <div {...getRootProps()} className={getDropzoneClassName()}>
            <input {...getInputProps()} />
            <Upload className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
            {renderDropzoneContent()}
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((fileWithProgress, index) => (
                <div
                  className="flex items-center gap-3 rounded-lg border p-3"
                  key={`${fileWithProgress.file.name}-${index}`}
                >
                  <FileAudio className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">
                      {fileWithProgress.file.name}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {(fileWithProgress.file.size / (1024 * 1024)).toFixed(1)}{" "}
                      MB
                    </p>
                    {fileWithProgress.status === "uploading" && (
                      <Progress
                        className="mt-1 h-1"
                        value={fileWithProgress.progress}
                      />
                    )}
                    {fileWithProgress.status === "error" && (
                      <p className="text-destructive text-xs">
                        {fileWithProgress.error}
                      </p>
                    )}
                  </div>
                  {fileWithProgress.status === "uploading" && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {fileWithProgress.status === "uploaded" && (
                    <span className="text-green-600 text-xs">Uploaded</span>
                  )}
                  {!isUploading && fileWithProgress.status === "pending" && (
                    <Button
                      onClick={() => removeFile(index)}
                      size="icon"
                      variant="ghost"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Overall progress */}
          {isUploading && (
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>Uploading files...</span>
                <span>{totalProgress}%</span>
              </div>
              <Progress value={totalProgress} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            disabled={isUploading}
            onClick={() => handleClose(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={files.length === 0 || isUploading}
            onClick={handleStartJob}
            type="button"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              `Start Job (${files.length} file${files.length !== 1 ? "s" : ""})`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
