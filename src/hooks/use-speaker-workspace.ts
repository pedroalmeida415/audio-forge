import { useCallback, useMemo, useState } from "react";
import type { DiarizationSegment } from "~/server/db/schema";
import { api } from "~/trpc/react";

/**
 * State for a speaker group - collection assignment and UI state
 */
export type SpeakerGroupState = {
  collectionId: string | null;
  collectionName: string | null;
  projectId: string | null;
  projectName: string | null;
  isExpanded: boolean;
};

/**
 * Excluded segment with original speaker for restore context
 */
export type ExcludedSegment = {
  segment: DiarizationSegment;
  originalSpeaker: string;
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

export type UseSpeakerWorkspaceReturn = {
  // Job data
  job: JobData | undefined;
  isLoading: boolean;
  refetch: () => void;
  audioUrl: string | null;

  // Derived speaker data
  speakerGroups: Map<string, DiarizationSegment[]>;
  speakerOrder: string[];

  // Speaker group state
  speakerStates: Map<string, SpeakerGroupState>;
  setSpeakerCollection: (
    speaker: string,
    collectionId: string | null,
    collectionName: string | null,
    projectId: string | null,
    projectName: string | null
  ) => void;
  toggleSpeakerExpanded: (speaker: string) => void;
  expandAllSpeakers: () => void;
  collapseAllSpeakers: () => void;

  // Excluded segments (session-only)
  excludedSegmentIds: Set<string>;
  excludeSegment: (segmentId: string) => void;
  restoreSegment: (segmentId: string) => void;
  restoreAllExcluded: () => void;
  getExcludedSegmentsList: () => ExcludedSegment[];

  // Active segment for waveform highlight
  activeSegmentId: string | null;
  setActiveSegmentId: (id: string | null) => void;

  // Visible segments (excludes hidden ones)
  visibleSegments: DiarizationSegment[];

  // Extraction
  handleExtractClips: (format?: "mp3" | "wav" | "flac") => void;
  isExtracting: boolean;
  extractableGroupCount: number;

  // Speaker reassignment
  reassignSegmentSpeaker: (
    segmentId: string,
    newSpeaker: string
  ) => Promise<void>;
  isReassigning: boolean;
};

export function useSpeakerWorkspace(jobId: string): UseSpeakerWorkspaceReturn {
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [speakerStates, setSpeakerStates] = useState<
    Map<string, SpeakerGroupState>
  >(new Map());
  const [excludedSegmentIds, setExcludedSegmentIds] = useState<Set<string>>(
    new Set()
  );

  const utils = api.useUtils();

  // Fetch job with polling for processing state
  const {
    data: job,
    isLoading,
    refetch,
  } = api.diarization.getJob.useQuery(
    { id: jobId },
    {
      refetchInterval: (query) => {
        const data = query.state.data;
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

  // Fetch audio URL when job is complete
  const { data: audioUrlData } = api.diarization.getAudioUrl.useQuery(
    { jobId },
    { enabled: !!jobId && job?.status === "completed" }
  );

  // Mutations
  const extractClips = api.clip.extractClips.useMutation({
    onSuccess: () => {
      utils.diarization.getJob.invalidate({ id: jobId });
    },
  });

  const reassignMutation = api.diarization.reassignSegmentSpeaker.useMutation({
    onSuccess: () => {
      utils.diarization.getJob.invalidate({ id: jobId });
    },
  });

  // All segments from job
  const allSegments = useMemo(
    () => (job?.segments as DiarizationSegment[]) ?? [],
    [job?.segments]
  );

  // Visible segments (excluding hidden ones)
  const visibleSegments = useMemo(
    () => allSegments.filter((s) => !excludedSegmentIds.has(s.id)),
    [allSegments, excludedSegmentIds]
  );

  // Group visible segments by speaker
  const speakerGroups = useMemo(() => {
    const groups = new Map<string, DiarizationSegment[]>();
    for (const segment of visibleSegments) {
      const existing = groups.get(segment.speaker) ?? [];
      existing.push(segment);
      groups.set(segment.speaker, existing);
    }
    // Sort segments within each group by start time
    for (const [speaker, segments] of groups) {
      groups.set(
        speaker,
        segments.sort((a, b) => a.start - b.start)
      );
    }
    return groups;
  }, [visibleSegments]);

  // Consistent speaker ordering (by first appearance in segments)
  const speakerOrder = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const segment of allSegments) {
      if (!seen.has(segment.speaker)) {
        seen.add(segment.speaker);
        order.push(segment.speaker);
      }
    }
    return order;
  }, [allSegments]);

  const audioUrl = useMemo(
    () => audioUrlData?.url ?? null,
    [audioUrlData?.url]
  );

  // Initialize speaker states for new speakers
  const getOrInitSpeakerState = useCallback(
    (speaker: string): SpeakerGroupState => {
      return (
        speakerStates.get(speaker) ?? {
          collectionId: null,
          collectionName: null,
          projectId: null,
          projectName: null,
          isExpanded: true, // Default to expanded
        }
      );
    },
    [speakerStates]
  );

  // Speaker state management
  const setSpeakerCollection = useCallback(
    (
      speaker: string,
      collectionId: string | null,
      collectionName: string | null,
      projectId: string | null,
      projectName: string | null
    ) => {
      setSpeakerStates((prev) => {
        const next = new Map(prev);
        const current = getOrInitSpeakerState(speaker);
        next.set(speaker, {
          ...current,
          collectionId,
          collectionName,
          projectId,
          projectName,
        });
        return next;
      });
    },
    [getOrInitSpeakerState]
  );

  const toggleSpeakerExpanded = useCallback(
    (speaker: string) => {
      setSpeakerStates((prev) => {
        const next = new Map(prev);
        const current = getOrInitSpeakerState(speaker);
        next.set(speaker, {
          ...current,
          isExpanded: !current.isExpanded,
        });
        return next;
      });
    },
    [getOrInitSpeakerState]
  );

  const expandAllSpeakers = useCallback(() => {
    setSpeakerStates((prev) => {
      const next = new Map(prev);
      for (const speaker of speakerOrder) {
        const current = next.get(speaker) ?? getOrInitSpeakerState(speaker);
        next.set(speaker, { ...current, isExpanded: true });
      }
      return next;
    });
  }, [speakerOrder, getOrInitSpeakerState]);

  const collapseAllSpeakers = useCallback(() => {
    setSpeakerStates((prev) => {
      const next = new Map(prev);
      for (const speaker of speakerOrder) {
        const current = next.get(speaker) ?? getOrInitSpeakerState(speaker);
        next.set(speaker, { ...current, isExpanded: false });
      }
      return next;
    });
  }, [speakerOrder, getOrInitSpeakerState]);

  // Excluded segments management
  const excludeSegment = useCallback((segmentId: string) => {
    setExcludedSegmentIds((prev) => {
      const next = new Set(prev);
      next.add(segmentId);
      return next;
    });
  }, []);

  const restoreSegment = useCallback((segmentId: string) => {
    setExcludedSegmentIds((prev) => {
      const next = new Set(prev);
      next.delete(segmentId);
      return next;
    });
  }, []);

  const restoreAllExcluded = useCallback(() => {
    setExcludedSegmentIds(new Set());
  }, []);

  const getExcludedSegmentsList = useCallback(
    (): ExcludedSegment[] =>
      allSegments
        .filter((s) => excludedSegmentIds.has(s.id))
        .map((segment) => ({
          segment,
          originalSpeaker: segment.speaker,
        })),
    [allSegments, excludedSegmentIds]
  );

  // Count groups that have collections assigned (extractable)
  const extractableGroupCount = useMemo(() => {
    let count = 0;
    for (const speaker of speakerOrder) {
      const state = speakerStates.get(speaker);
      const hasSegments = (speakerGroups.get(speaker)?.length ?? 0) > 0;
      if (state?.collectionId && state?.projectId && hasSegments) {
        count++;
      }
    }
    return count;
  }, [speakerOrder, speakerStates, speakerGroups]);

  // Extract all clips from groups with assigned collections
  const handleExtractClips = useCallback(
    (format: "mp3" | "wav" | "flac" = "mp3") => {
      const segmentsToExtract: {
        segmentId: string;
        collectionId: string;
        projectId: string;
        startTime: number;
        endTime: number;
        speakerLabel: string;
      }[] = [];

      for (const speaker of speakerOrder) {
        const state = speakerStates.get(speaker);
        const segments = speakerGroups.get(speaker) ?? [];

        if (state?.collectionId && state?.projectId && segments.length > 0) {
          for (const segment of segments) {
            segmentsToExtract.push({
              segmentId: segment.id,
              collectionId: state.collectionId,
              projectId: state.projectId,
              startTime: segment.start,
              endTime: segment.end,
              speakerLabel: segment.speaker,
            });
          }
        }
      }

      if (segmentsToExtract.length === 0) {
        return;
      }

      extractClips.mutate({
        jobId,
        segments: segmentsToExtract,
        format,
      });
    },
    [jobId, speakerOrder, speakerStates, speakerGroups, extractClips]
  );

  // Reassign segment to different speaker
  const reassignSegmentSpeaker = useCallback(
    async (segmentId: string, newSpeaker: string) => {
      await reassignMutation.mutateAsync({
        jobId,
        segmentId,
        newSpeaker,
      });
    },
    [jobId, reassignMutation]
  );

  return {
    job: job as JobData | undefined,
    isLoading,
    refetch,
    audioUrl,
    speakerGroups,
    speakerOrder,
    speakerStates,
    setSpeakerCollection,
    toggleSpeakerExpanded,
    expandAllSpeakers,
    collapseAllSpeakers,
    excludedSegmentIds,
    excludeSegment,
    restoreSegment,
    restoreAllExcluded,
    getExcludedSegmentsList,
    activeSegmentId,
    setActiveSegmentId,
    visibleSegments,
    handleExtractClips,
    isExtracting: extractClips.isPending,
    extractableGroupCount,
    reassignSegmentSpeaker,
    isReassigning: reassignMutation.isPending,
  };
}
