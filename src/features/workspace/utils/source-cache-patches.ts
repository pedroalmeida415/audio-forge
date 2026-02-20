import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "~/server/api/root";

type RouterInputs = inferRouterInputs<AppRouter>;
type RouterOutputs = inferRouterOutputs<AppRouter>;

type CreatedSegment = NonNullable<
  RouterOutputs["segment"]["createSegment"]["segment"]
>;

export type WorkspaceSegmentListSnapshot =
  RouterOutputs["segment"]["getBySource"];
export type WorkspaceSegmentListItem =
  WorkspaceSegmentListSnapshot["segments"][number];

export type WorkspaceSourceSpeakersSnapshot =
  RouterOutputs["speaker"]["getBySource"];
export type WorkspaceSpeaker = WorkspaceSourceSpeakersSnapshot[number];

export interface WorkspaceSegmentMutationContext {
  sourceId?: string;
  projectId?: string;
  previousSegmentsBySource?: WorkspaceSegmentListSnapshot;
  previousSourceSpeakers?: WorkspaceSourceSpeakersSnapshot;
  tempIds?: string[];
}

interface OptimisticCreateSegmentInput {
  segmentList: WorkspaceSegmentListSnapshot;
  sourceId: string;
  segment: RouterInputs["segment"]["createSegment"]["segment"];
  tempId: string;
}

interface OptimisticUpdateSegmentsInput {
  segmentList: WorkspaceSegmentListSnapshot;
  segmentIds: RouterInputs["segment"]["updateSegments"]["segmentIds"];
  updates: RouterInputs["segment"]["updateSegments"]["updates"];
}

interface OptimisticDeleteSegmentsInput {
  segmentList: WorkspaceSegmentListSnapshot;
  segmentIds: string[];
}

interface OptimisticSplitSegmentInput {
  segmentList: WorkspaceSegmentListSnapshot;
  segmentId: string;
  splitTime: number;
  tempId: string;
}

interface OptimisticCreateSpeakerInput {
  speakers: WorkspaceSourceSpeakersSnapshot;
  speaker: RouterInputs["speaker"]["createSpeaker"];
  tempId: string;
  fallbackColor: string;
}

interface ReplaceTempSegmentInput {
  segmentList: WorkspaceSegmentListSnapshot;
  tempId: string;
  segment: CreatedSegment;
}

interface ReplaceTempSegmentIdInput {
  segmentList: WorkspaceSegmentListSnapshot;
  tempId: string;
  segmentId: string;
}

interface ReplaceTempSpeakerInput {
  speakers: WorkspaceSourceSpeakersSnapshot;
  tempId: string;
  speaker: WorkspaceSpeaker;
}

interface RestoreSegmentListSnapshotInput {
  segmentList: WorkspaceSegmentListSnapshot;
  context?: WorkspaceSegmentMutationContext;
}

interface RestoreSourceSpeakersSnapshotInput {
  speakers: WorkspaceSourceSpeakersSnapshot;
  context?: WorkspaceSegmentMutationContext;
}

function sortSegmentsByStartTime(
  segments: WorkspaceSegmentListItem[],
): WorkspaceSegmentListItem[] {
  return [...segments].sort((a, b) => a.startTime - b.startTime);
}

function normalizeSegmentIds(
  segmentIds: RouterInputs["segment"]["updateSegments"]["segmentIds"],
): string[] {
  return Array.isArray(segmentIds) ? segmentIds : [segmentIds];
}

export function applyOptimisticCreateSegment({
  segmentList,
  sourceId,
  segment,
  tempId,
}: OptimisticCreateSegmentInput): WorkspaceSegmentListSnapshot {
  if (segment.endTime <= segment.startTime) {
    return segmentList;
  }

  const now = new Date();
  const fallbackSource = segmentList.segments[0]?.source ?? {
    id: sourceId,
    name: null,
    storageKey: null,
  };

  const optimisticSegment: WorkspaceSegmentListItem = {
    id: tempId,
    sourceId,
    speakerId: segment.speakerId,
    startTime: segment.startTime,
    endTime: segment.endTime,
    transcription: null,
    tags: null,
    scores: null,
    clip: null,
    source: fallbackSource,
    createdAt: now,
    updatedAt: now,
  };

  return {
    ...segmentList,
    segments: sortSegmentsByStartTime([
      ...segmentList.segments,
      optimisticSegment,
    ]),
  };
}

export function applyOptimisticUpdateSegments({
  segmentList,
  segmentIds,
  updates,
}: OptimisticUpdateSegmentsInput): WorkspaceSegmentListSnapshot {
  const normalizedIds = normalizeSegmentIds(segmentIds);
  if (normalizedIds.length === 0) {
    return segmentList;
  }

  const segmentIdSet = new Set(normalizedIds);
  const timeChanged =
    updates.startTime !== undefined || updates.endTime !== undefined;
  let didChange = false;

  const nextSegments = segmentList.segments.map((segment) => {
    if (!segmentIdSet.has(segment.id)) {
      return segment;
    }

    const nextStartTime = updates.startTime ?? segment.startTime;
    const nextEndTime = updates.endTime ?? segment.endTime;

    if (nextEndTime <= nextStartTime) {
      return segment;
    }

    const nextSpeakerId = updates.speakerId ?? segment.speakerId;
    const hasSegmentChange =
      nextStartTime !== segment.startTime ||
      nextEndTime !== segment.endTime ||
      nextSpeakerId !== segment.speakerId;

    if (!hasSegmentChange) {
      return segment;
    }

    didChange = true;
    return {
      ...segment,
      startTime: nextStartTime,
      endTime: nextEndTime,
      speakerId: nextSpeakerId,
      updatedAt: new Date(),
    };
  });

  if (!didChange) {
    return segmentList;
  }

  return {
    ...segmentList,
    segments: timeChanged
      ? sortSegmentsByStartTime(nextSegments)
      : nextSegments,
  };
}

export function applyOptimisticDeleteSegments({
  segmentList,
  segmentIds,
}: OptimisticDeleteSegmentsInput): WorkspaceSegmentListSnapshot {
  if (segmentIds.length === 0) {
    return segmentList;
  }

  const segmentIdSet = new Set(segmentIds);
  const nextSegments = segmentList.segments.filter((segment) => {
    return !segmentIdSet.has(segment.id);
  });

  if (nextSegments.length === segmentList.segments.length) {
    return segmentList;
  }

  return {
    ...segmentList,
    segments: nextSegments,
  };
}

export function applyOptimisticSplitSegment({
  segmentList,
  segmentId,
  splitTime,
  tempId,
}: OptimisticSplitSegmentInput): WorkspaceSegmentListSnapshot {
  const targetSegment = segmentList.segments.find(
    (segment) => segment.id === segmentId,
  );
  if (!targetSegment) {
    return segmentList;
  }

  if (
    splitTime <= targetSegment.startTime ||
    splitTime >= targetSegment.endTime
  ) {
    return segmentList;
  }

  const now = new Date();
  const firstSegment: WorkspaceSegmentListItem = {
    ...targetSegment,
    endTime: splitTime,
    clip: null,
    updatedAt: now,
  };

  const secondSegment: WorkspaceSegmentListItem = {
    ...targetSegment,
    id: tempId,
    startTime: splitTime,
    transcription: null,
    tags: null,
    scores: null,
    clip: null,
    createdAt: now,
    updatedAt: now,
  };

  const nextSegments = segmentList.segments.flatMap((segment) => {
    if (segment.id !== segmentId) {
      return [segment];
    }

    return [firstSegment, secondSegment];
  });

  return {
    ...segmentList,
    segments: sortSegmentsByStartTime(nextSegments),
  };
}

export function applyOptimisticCreateSpeaker({
  speakers,
  speaker,
  tempId,
  fallbackColor,
}: OptimisticCreateSpeakerInput): WorkspaceSourceSpeakersSnapshot {
  const trimmedName = speaker.name.trim();
  if (!trimmedName) {
    return speakers;
  }

  const now = new Date();
  const optimisticSpeaker: WorkspaceSpeaker = {
    id: tempId,
    projectId: speaker.projectId,
    userId: speakers[0]?.userId ?? "temp-user",
    name: trimmedName,
    color: speaker.color ?? fallbackColor,
    sourceId: speaker.sourceId ?? null,
    origin: "user",
    createdAt: now,
    updatedAt: now,
  };

  return [...speakers, optimisticSpeaker];
}

export function replaceTempSegment({
  segmentList,
  tempId,
  segment,
}: ReplaceTempSegmentInput): WorkspaceSegmentListSnapshot {
  let didReplace = false;
  const nextSegments = segmentList.segments.map((item) => {
    if (item.id !== tempId) {
      return item;
    }

    didReplace = true;
    return {
      ...item,
      ...segment,
      source: item.source,
    };
  });

  if (!didReplace) {
    return segmentList;
  }

  return {
    ...segmentList,
    segments: sortSegmentsByStartTime(nextSegments),
  };
}

export function replaceTempSegmentId({
  segmentList,
  tempId,
  segmentId,
}: ReplaceTempSegmentIdInput): WorkspaceSegmentListSnapshot {
  let didReplace = false;
  const nextSegments = segmentList.segments.map((segment) => {
    if (segment.id !== tempId) {
      return segment;
    }

    didReplace = true;
    return { ...segment, id: segmentId };
  });

  if (!didReplace) {
    return segmentList;
  }

  return {
    ...segmentList,
    segments: sortSegmentsByStartTime(nextSegments),
  };
}

export function replaceTempSpeaker({
  speakers,
  tempId,
  speaker,
}: ReplaceTempSpeakerInput): WorkspaceSourceSpeakersSnapshot {
  let didReplace = false;
  const nextSpeakers = speakers.map((item) => {
    if (item.id !== tempId) {
      return item;
    }

    didReplace = true;
    return speaker;
  });

  if (!didReplace) {
    return speakers;
  }

  return nextSpeakers;
}

export function restoreWorkspaceSegmentsSnapshot({
  segmentList,
  context,
}: RestoreSegmentListSnapshotInput): WorkspaceSegmentListSnapshot {
  return context?.previousSegmentsBySource ?? segmentList;
}

export function restoreWorkspaceSourceSpeakersSnapshot({
  speakers,
  context,
}: RestoreSourceSpeakersSnapshotInput): WorkspaceSourceSpeakersSnapshot {
  return context?.previousSourceSpeakers ?? speakers;
}
