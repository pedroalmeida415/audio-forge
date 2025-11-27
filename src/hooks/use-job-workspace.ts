import { useCallback, useEffect, useMemo, useState } from "react";
import type { AudioFile, Segment } from "~/server/db/schema";
import { api } from "~/trpc/react";

type UseJobWorkspaceReturn = {
  job: JobWithRelations | undefined;
  isLoading: boolean;
  selectedFile: AudioFileWithSegments | undefined;
  selectedFileId: string | null;
  setSelectedFileId: (id: string | null) => void;
  selectedSegmentId: string | null;
  setSelectedSegmentId: (id: string | null) => void;
  segments: SegmentWithCollection[];
  audioUrl: string | null;
  handleSegmentUpdate: (
    segmentId: string,
    startTime: number,
    endTime: number
  ) => void;
  handleExtractClips: () => void;
  isExtracting: boolean;
  extractableCount: number;
  refetch: () => void;
};

type SegmentWithCollection = Segment & {
  collection: { id: string; name: string } | null;
};

type AudioFileWithSegments = AudioFile & {
  segments: SegmentWithCollection[];
};

type JobWithRelations = {
  id: string;
  projectId: string;
  status: string;
  totalFiles: number;
  processedFiles: number;
  errorMessage: string | null;
  errorDetails: unknown;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  project: {
    id: string;
    name: string;
  };
  audioFiles: AudioFileWithSegments[];
};

export function useJobWorkspace(jobId: string): UseJobWorkspaceReturn {
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(
    null
  );

  const utils = api.useUtils();

  const {
    data: job,
    isLoading,
    refetch,
  } = api.diarization.getJob.useQuery(
    { id: jobId },
    {
      refetchInterval: (query) => {
        const data = query.state.data;
        // Poll every 3 seconds if still processing
        if (
          data?.status === "processing" ||
          data?.status === "uploading" ||
          data?.status === "pending"
        ) {
          return 3000;
        }
        return false;
      },
    }
  );

  const { data: audioUrlData } = api.diarization.getAudioUrl.useQuery(
    { audioFileId: selectedFileId ?? "" },
    { enabled: !!selectedFileId }
  );

  const extractClips = api.clip.extractClips.useMutation({
    onSuccess: () => {
      utils.diarization.getJob.invalidate({ id: jobId });
    },
  });

  const updateSegmentTimestamps = api.segment.updateTimestamps.useMutation({
    onSuccess: () => {
      utils.diarization.getJob.invalidate({ id: jobId });
    },
  });

  // Set first file as selected when job loads
  useEffect(() => {
    const firstFile = job?.audioFiles[0];
    if (
      job?.audioFiles &&
      job.audioFiles.length > 0 &&
      !selectedFileId &&
      firstFile
    ) {
      setSelectedFileId(firstFile.id);
    }
  }, [job?.audioFiles, selectedFileId]);

  const selectedFile = useMemo(
    () => job?.audioFiles.find((f) => f.id === selectedFileId),
    [job?.audioFiles, selectedFileId]
  );

  const segments = useMemo(
    () => selectedFile?.segments ?? [],
    [selectedFile?.segments]
  );

  const audioUrl = useMemo(
    () => audioUrlData?.url ?? null,
    [audioUrlData?.url]
  );

  const handleSegmentUpdate = useCallback(
    (segmentId: string, startTime: number, endTime: number) => {
      updateSegmentTimestamps.mutate({
        segmentId,
        editedStartTime: startTime,
        editedEndTime: endTime,
      });
    },
    [updateSegmentTimestamps]
  );

  const extractableCount = useMemo(
    () =>
      segments.filter((s) => s.status === "approved" && s.collectionId).length,
    [segments]
  );

  const handleExtractClips = useCallback(() => {
    if (!selectedFileId) {
      return;
    }

    // Get segments that are approved and have collections assigned
    const extractableSegments = segments.filter(
      (s) => s.status === "approved" && s.collectionId
    );

    if (extractableSegments.length === 0) {
      return;
    }

    extractClips.mutate({
      audioFileId: selectedFileId,
      segmentIds: extractableSegments.map((s) => s.id),
      format: "mp3",
    });
  }, [selectedFileId, segments, extractClips]);

  return {
    job,
    isLoading,
    selectedFile,
    selectedFileId,
    setSelectedFileId,
    selectedSegmentId,
    setSelectedSegmentId,
    segments,
    audioUrl,
    handleSegmentUpdate,
    handleExtractClips,
    isExtracting: extractClips.isPending,
    extractableCount,
    refetch,
  };
}
