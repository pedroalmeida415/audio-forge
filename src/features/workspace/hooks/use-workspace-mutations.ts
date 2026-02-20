"use client";

import { DEFAULT_LOCAL_SPEAKER_COLOR } from "~/lib/speaker-colors";
import type { RouterInputs, RouterOutputs } from "~/trpc/react";
import { api } from "~/trpc/react";
import {
  applyOptimisticCreateSegment,
  applyOptimisticCreateSpeaker,
  applyOptimisticDeleteSegments,
  applyOptimisticSplitSegment,
  applyOptimisticUpdateSegments,
  replaceTempSegment,
  replaceTempSegmentId,
  replaceTempSpeaker,
  restoreWorkspaceSegmentsSnapshot,
  restoreWorkspaceSourceSpeakersSnapshot,
  type WorkspaceSegmentMutationContext,
} from "../utils/source-cache-patches";

type WorkspaceUtils = ReturnType<typeof api.useUtils>;

type CreateSegmentInput = RouterInputs["segment"]["createSegment"];
type CreateSegmentOutput = RouterOutputs["segment"]["createSegment"];

type UpdateSegmentsInput = RouterInputs["segment"]["updateSegments"];
type UpdateSegmentsOutput = RouterOutputs["segment"]["updateSegments"];

type DeleteSegmentsInput = RouterInputs["segment"]["deleteSegments"];
type DeleteSegmentsOutput = RouterOutputs["segment"]["deleteSegments"];

type SplitSegmentInput = RouterInputs["segment"]["splitSegment"];
type SplitSegmentOutput = RouterOutputs["segment"]["splitSegment"];

type CreateSpeakerInput = RouterInputs["speaker"]["createSpeaker"];
type CreateSpeakerOutput = RouterOutputs["speaker"]["createSpeaker"];

type MaybePromise<T> = T | Promise<T>;

interface WorkspaceMutationHandlers<TData, TVariables> {
  onSuccess?: (
    data: TData,
    variables: TVariables,
    context: WorkspaceSegmentMutationContext | undefined,
  ) => MaybePromise<void>;
  onError?: (
    error: unknown,
    variables: TVariables,
    context: WorkspaceSegmentMutationContext | undefined,
  ) => MaybePromise<void>;
  onSettled?: (
    data: TData | undefined,
    error: unknown,
    variables: TVariables,
    context: WorkspaceSegmentMutationContext | undefined,
  ) => MaybePromise<void>;
}

function createTempId() {
  return `temp:${crypto.randomUUID()}`;
}

async function invalidateWorkspaceSegmentCaches(
  utils: WorkspaceUtils,
  sourceId: string,
) {
  await Promise.all([
    utils.segment.getBySource.invalidate({ sourceId }),
    utils.segment.getBySpeaker.invalidate(),
  ]);
}

export function useWorkspaceCreateSegmentMutation(
  handlers: WorkspaceMutationHandlers<
    CreateSegmentOutput,
    CreateSegmentInput
  > = {},
) {
  const utils = api.useUtils();

  return api.segment.createSegment.useMutation({
    onMutate: async (variables): Promise<WorkspaceSegmentMutationContext> => {
      const tempId = createTempId();
      await utils.segment.getBySource.cancel({ sourceId: variables.sourceId });

      const previousSegmentsBySource = utils.segment.getBySource.getData({
        sourceId: variables.sourceId,
      });

      if (previousSegmentsBySource) {
        utils.segment.getBySource.setData(
          { sourceId: variables.sourceId },
          applyOptimisticCreateSegment({
            segmentList: previousSegmentsBySource,
            sourceId: variables.sourceId,
            segment: variables.segment,
            tempId,
          }),
        );
      }

      return {
        sourceId: variables.sourceId,
        previousSegmentsBySource,
        tempIds: [tempId],
      };
    },
    onSuccess: async (data, variables, context) => {
      const tempId = context?.tempIds?.[0];
      const createdSegment = data.segment;
      if (tempId && createdSegment) {
        utils.segment.getBySource.setData(
          { sourceId: variables.sourceId },
          (old) => {
            if (!old) {
              return old;
            }

            return replaceTempSegment({
              segmentList: old,
              tempId,
              segment: createdSegment,
            });
          },
        );
      }

      await handlers.onSuccess?.(data, variables, context);
    },
    onError: async (error, variables, context) => {
      if (context?.previousSegmentsBySource) {
        utils.segment.getBySource.setData(
          { sourceId: variables.sourceId },
          restoreWorkspaceSegmentsSnapshot({
            segmentList: context.previousSegmentsBySource,
            context,
          }),
        );
      }

      await handlers.onError?.(error, variables, context);
    },
    onSettled: async (data, error, variables, context) => {
      await invalidateWorkspaceSegmentCaches(
        utils,
        context?.sourceId ?? variables.sourceId,
      );
      await handlers.onSettled?.(data, error, variables, context);
    },
  });
}

export function useWorkspaceUpdateSegmentsMutation(
  handlers: WorkspaceMutationHandlers<
    UpdateSegmentsOutput,
    UpdateSegmentsInput
  > = {},
) {
  const utils = api.useUtils();

  return api.segment.updateSegments.useMutation({
    onMutate: async (variables): Promise<WorkspaceSegmentMutationContext> => {
      await utils.segment.getBySource.cancel({ sourceId: variables.sourceId });

      const previousSegmentsBySource = utils.segment.getBySource.getData({
        sourceId: variables.sourceId,
      });

      if (previousSegmentsBySource) {
        utils.segment.getBySource.setData(
          { sourceId: variables.sourceId },
          applyOptimisticUpdateSegments({
            segmentList: previousSegmentsBySource,
            segmentIds: variables.segmentIds,
            updates: variables.updates,
          }),
        );
      }

      return {
        sourceId: variables.sourceId,
        previousSegmentsBySource,
      };
    },
    onSuccess: async (data, variables, context) => {
      await handlers.onSuccess?.(data, variables, context);
    },
    onError: async (error, variables, context) => {
      if (context?.previousSegmentsBySource) {
        utils.segment.getBySource.setData(
          { sourceId: variables.sourceId },
          restoreWorkspaceSegmentsSnapshot({
            segmentList: context.previousSegmentsBySource,
            context,
          }),
        );
      }

      await handlers.onError?.(error, variables, context);
    },
    onSettled: async (data, error, variables, context) => {
      await invalidateWorkspaceSegmentCaches(
        utils,
        context?.sourceId ?? variables.sourceId,
      );
      await handlers.onSettled?.(data, error, variables, context);
    },
  });
}

export function useWorkspaceDeleteSegmentsMutation(
  handlers: WorkspaceMutationHandlers<
    DeleteSegmentsOutput,
    DeleteSegmentsInput
  > = {},
) {
  const utils = api.useUtils();

  return api.segment.deleteSegments.useMutation({
    onMutate: async (variables): Promise<WorkspaceSegmentMutationContext> => {
      await utils.segment.getBySource.cancel({ sourceId: variables.sourceId });

      const previousSegmentsBySource = utils.segment.getBySource.getData({
        sourceId: variables.sourceId,
      });

      if (previousSegmentsBySource) {
        utils.segment.getBySource.setData(
          { sourceId: variables.sourceId },
          applyOptimisticDeleteSegments({
            segmentList: previousSegmentsBySource,
            segmentIds: variables.segmentIds,
          }),
        );
      }

      return {
        sourceId: variables.sourceId,
        previousSegmentsBySource,
      };
    },
    onSuccess: async (data, variables, context) => {
      await handlers.onSuccess?.(data, variables, context);
    },
    onError: async (error, variables, context) => {
      if (context?.previousSegmentsBySource) {
        utils.segment.getBySource.setData(
          { sourceId: variables.sourceId },
          restoreWorkspaceSegmentsSnapshot({
            segmentList: context.previousSegmentsBySource,
            context,
          }),
        );
      }

      await handlers.onError?.(error, variables, context);
    },
    onSettled: async (data, error, variables, context) => {
      await invalidateWorkspaceSegmentCaches(
        utils,
        context?.sourceId ?? variables.sourceId,
      );
      await handlers.onSettled?.(data, error, variables, context);
    },
  });
}

export function useWorkspaceSplitSegmentMutation(
  handlers: WorkspaceMutationHandlers<
    SplitSegmentOutput,
    SplitSegmentInput
  > = {},
) {
  const utils = api.useUtils();

  return api.segment.splitSegment.useMutation({
    onMutate: async (variables): Promise<WorkspaceSegmentMutationContext> => {
      const tempId = createTempId();
      await utils.segment.getBySource.cancel({ sourceId: variables.sourceId });

      const previousSegmentsBySource = utils.segment.getBySource.getData({
        sourceId: variables.sourceId,
      });

      if (previousSegmentsBySource) {
        utils.segment.getBySource.setData(
          { sourceId: variables.sourceId },
          applyOptimisticSplitSegment({
            segmentList: previousSegmentsBySource,
            segmentId: variables.segmentId,
            splitTime: variables.splitTime,
            tempId,
          }),
        );
      }

      return {
        sourceId: variables.sourceId,
        previousSegmentsBySource,
        tempIds: [tempId],
      };
    },
    onSuccess: async (data, variables, context) => {
      const tempId = context?.tempIds?.[0];
      if (tempId) {
        utils.segment.getBySource.setData(
          { sourceId: variables.sourceId },
          (old) => {
            if (!old) {
              return old;
            }

            return replaceTempSegmentId({
              segmentList: old,
              tempId,
              segmentId: data.secondSegmentId,
            });
          },
        );
      }

      await handlers.onSuccess?.(data, variables, context);
    },
    onError: async (error, variables, context) => {
      if (context?.previousSegmentsBySource) {
        utils.segment.getBySource.setData(
          { sourceId: variables.sourceId },
          restoreWorkspaceSegmentsSnapshot({
            segmentList: context.previousSegmentsBySource,
            context,
          }),
        );
      }

      await handlers.onError?.(error, variables, context);
    },
    onSettled: async (data, error, variables, context) => {
      await invalidateWorkspaceSegmentCaches(
        utils,
        context?.sourceId ?? variables.sourceId,
      );
      await handlers.onSettled?.(data, error, variables, context);
    },
  });
}

export function useWorkspaceCreateSpeakerMutation(
  sourceId: string,
  handlers: WorkspaceMutationHandlers<
    CreateSpeakerOutput,
    CreateSpeakerInput
  > = {},
) {
  const utils = api.useUtils();

  return api.speaker.createSpeaker.useMutation({
    onMutate: async (variables): Promise<WorkspaceSegmentMutationContext> => {
      const tempId = createTempId();
      await utils.speaker.getBySource.cancel({ sourceId });

      const previousSourceSpeakers = utils.speaker.getBySource.getData({
        sourceId,
      });

      if (previousSourceSpeakers) {
        utils.speaker.getBySource.setData(
          { sourceId },
          applyOptimisticCreateSpeaker({
            speakers: previousSourceSpeakers,
            speaker: variables,
            tempId,
            fallbackColor: DEFAULT_LOCAL_SPEAKER_COLOR,
          }),
        );
      }

      return {
        sourceId,
        previousSourceSpeakers,
        tempIds: [tempId],
      };
    },
    onSuccess: async (data, variables, context) => {
      const tempId = context?.tempIds?.[0];
      const createdSpeaker = data.speaker;
      if (tempId && createdSpeaker) {
        utils.speaker.getBySource.setData({ sourceId }, (old) => {
          if (!old) {
            return old;
          }

          return replaceTempSpeaker({
            speakers: old,
            tempId,
            speaker: createdSpeaker,
          });
        });
      }

      await handlers.onSuccess?.(data, variables, context);
    },
    onError: async (error, variables, context) => {
      if (context?.previousSourceSpeakers) {
        utils.speaker.getBySource.setData(
          { sourceId },
          restoreWorkspaceSourceSpeakersSnapshot({
            speakers: context.previousSourceSpeakers,
            context,
          }),
        );
      }

      await handlers.onError?.(error, variables, context);
    },
    onSettled: async (data, error, variables, context) => {
      await utils.speaker.getBySource.invalidate({
        sourceId: context?.sourceId ?? sourceId,
      });
      await handlers.onSettled?.(data, error, variables, context);
    },
  });
}
