import { useCallback, useMemo, useState } from "react";
import type { DiarizationSegment } from "~/server/db/schema";
import { api } from "~/trpc/react";

/**
 * Segment selection state - managed client-side
 */
type SegmentSelection = {
  selected: boolean;
  collectionId: string | null;
  projectId: string | null;
};

type UseJobWorkspaceReturn = {
  job: JobData | undefined;
  isLoading: boolean;
  activeSegmentId: string | null;
  setActiveSegmentId: (id: string | null) => void;
  segments: DiarizationSegment[];
  audioUrl: string | null;

  // Selection state (client-side)
  selections: Map<string, SegmentSelection>;
  toggleSegmentSelection: (segmentId: string) => void;
  setSegmentCollection: (
    segmentId: string,
    collectionId: string | null,
    projectId: string | null
  ) => void;
  selectAllBySpeaker: (speaker: string) => void;
  deselectAllBySpeaker: (speaker: string) => void;
  clearSelection: () => void;

  // Extraction
  handleExtractClips: (format?: "mp3" | "wav" | "flac") => void;
  isExtracting: boolean;
  extractableSegments: DiarizationSegment[];

  refetch: () => void;
};

type JobData = {
  id: string;
  status: string;
  errorMessage: string | null;
  originalFilename: string | null;
  durationSeconds: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  segments: DiarizationSegment[];
};

export function useJobWorkspace(jobId: string): UseJobWorkspaceReturn {
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [selections, setSelections] = useState<Map<string, SegmentSelection>>(
    new Map()
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
    { jobId },
    { enabled: !!jobId && job?.status === "completed" }
  );

  const extractClips = api.clip.extractClips.useMutation({
    onSuccess: () => {
      utils.diarization.getJob.invalidate({ id: jobId });
      // Clear selection after successful extraction
      setSelections(new Map());
    },
  });

  const segments = useMemo(
    () => (job?.segments as DiarizationSegment[]) ?? [],
    [job?.segments]
  );

  const audioUrl = useMemo(
    () => audioUrlData?.url ?? null,
    [audioUrlData?.url]
  );

  // Selection management
  const toggleSegmentSelection = useCallback((segmentId: string) => {
    setSelections((prev) => {
      const next = new Map(prev);
      const current = next.get(segmentId);
      if (current?.selected) {
        next.delete(segmentId);
      } else {
        next.set(segmentId, {
          selected: true,
          collectionId: current?.collectionId ?? null,
          projectId: current?.projectId ?? null,
        });
      }
      return next;
    });
  }, []);

  const setSegmentCollection = useCallback(
    (
      segmentId: string,
      collectionId: string | null,
      projectId: string | null
    ) => {
      setSelections((prev) => {
        const next = new Map(prev);
        const current = next.get(segmentId);
        next.set(segmentId, {
          selected: current?.selected ?? true,
          collectionId,
          projectId,
        });
        return next;
      });
    },
    []
  );

  const selectAllBySpeaker = useCallback(
    (speaker: string) => {
      setSelections((prev) => {
        const next = new Map(prev);
        for (const segment of segments) {
          if (segment.speaker === speaker) {
            const current = next.get(segment.id);
            next.set(segment.id, {
              selected: true,
              collectionId: current?.collectionId ?? null,
              projectId: current?.projectId ?? null,
            });
          }
        }
        return next;
      });
    },
    [segments]
  );

  const deselectAllBySpeaker = useCallback(
    (speaker: string) => {
      setSelections((prev) => {
        const next = new Map(prev);
        for (const segment of segments) {
          if (segment.speaker === speaker) {
            next.delete(segment.id);
          }
        }
        return next;
      });
    },
    [segments]
  );

  const clearSelection = useCallback(() => {
    setSelections(new Map());
  }, []);

  // Get segments that are ready to extract (selected + have collection)
  const extractableSegments = useMemo(
    () =>
      segments.filter((s) => {
        const selection = selections.get(s.id);
        return (
          selection?.selected && selection.collectionId && selection.projectId
        );
      }),
    [segments, selections]
  );

  const handleExtractClips = useCallback(
    (format: "mp3" | "wav" | "flac" = "mp3") => {
      if (extractableSegments.length === 0) {
        return;
      }

      // Build segment data for extraction
      const segmentsToExtract = extractableSegments.map((segment) => {
        const selection = selections.get(segment.id)!;
        return {
          segmentId: segment.id,
          collectionId: selection.collectionId!,
          projectId: selection.projectId!,
          startTime: segment.start,
          endTime: segment.end,
          speakerLabel: segment.speaker,
        };
      });

      extractClips.mutate({
        jobId,
        segments: segmentsToExtract,
        format,
      });
    },
    [jobId, extractableSegments, selections, extractClips]
  );

  return {
    job: job as JobData | undefined,
    isLoading,
    activeSegmentId,
    setActiveSegmentId,
    segments,
    audioUrl,
    selections,
    toggleSegmentSelection,
    setSegmentCollection,
    selectAllBySpeaker,
    deselectAllBySpeaker,
    clearSelection,
    handleExtractClips,
    isExtracting: extractClips.isPending,
    extractableSegments,
    refetch,
  };
}
