"use client";

import { DEFAULT_LOCAL_SPEAKER_COLOR } from "~/lib/speaker-colors";
import type { RouterInputs, RouterOutputs } from "~/trpc/react";
import { api } from "~/trpc/react";
import {
  applyOptimisticBulkChangeSpeakerInSource,
  applyOptimisticBulkDeleteFromSource,
  applyOptimisticBulkDeleteFromSpeaker,
  applyOptimisticCreateSegment,
  applyOptimisticCreateSpeaker,
  applyOptimisticDeleteSegments,
  applyOptimisticSplitSegment,
  applyOptimisticUpdateSegments,
  replaceTempSegment,
  replaceTempSegmentId,
  replaceTempSpeaker,
  restoreWorkspaceSegmentsBySpeakerSnapshot,
  restoreWorkspaceSegmentsSnapshot,
  restoreWorkspaceSourceSpeakersSnapshot,
  type WorkspaceSegmentMutationContext,
} from "../utils/source-cache-patches";

type WorkspaceUtils = ReturnType<typeof api.useUtils>;

type CreateSegmentInput = RouterInputs["segment"]["create"];
type CreateSegmentOutput = RouterOutputs["segment"]["create"];

type UpdateSegmentsInput = RouterInputs["segment"]["updateMany"];
type UpdateSegmentsOutput = RouterOutputs["segment"]["updateMany"];

type DeleteSegmentsInput = RouterInputs["segment"]["deleteMany"];
type DeleteSegmentsOutput = RouterOutputs["segment"]["deleteMany"];

type SplitSegmentInput = RouterInputs["segment"]["split"];
type SplitSegmentOutput = RouterOutputs["segment"]["split"];

type CreateSpeakerInput = RouterInputs["speaker"]["create"];
type CreateSpeakerOutput = RouterOutputs["speaker"]["create"];

type MaybePromise<T> = T | Promise<T>;

export interface WorkspaceCacheContext {
  sourceId?: string | null;
  speakerId?: string | null;
}

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
  context: { sourceId?: string; speakerId?: string },
) {
  const invalidations: Promise<unknown>[] = [];

  if (context.sourceId) {
    invalidations.push(
      utils.segment.getBySource.invalidate({ sourceId: context.sourceId }),
    );
  }

  if (context.speakerId) {
    invalidations.push(
      utils.segment.getBySpeaker.invalidate({
        speakerId: context.speakerId,
      }),
    );
  } else {
    invalidations.push(utils.segment.getBySpeaker.invalidate());
  }

  await Promise.all(invalidations);
}

function restoreCacheSnapshots(
  utils: WorkspaceUtils,
  context: WorkspaceSegmentMutationContext,
) {
  if (context.previousSegmentsBySource && context.sourceId) {
    utils.segment.getBySource.setData(
      { sourceId: context.sourceId },
      restoreWorkspaceSegmentsSnapshot({
        segmentList: context.previousSegmentsBySource,
        context,
      }),
    );
  }

  if (context.previousSegmentsBySpeaker && context.speakerId) {
    utils.segment.getBySpeaker.setData(
      { speakerId: context.speakerId },
      restoreWorkspaceSegmentsBySpeakerSnapshot({
        segmentList: context.previousSegmentsBySpeaker,
        context,
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Segment CRUD mutations (used by both timeline and table)
// ---------------------------------------------------------------------------

export function useWorkspaceCreateSegmentMutation(
  handlers: WorkspaceMutationHandlers<
    CreateSegmentOutput,
    CreateSegmentInput
  > = {},
) {
  const utils = api.useUtils();

  return api.segment.create.useMutation({
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
      await invalidateWorkspaceSegmentCaches(utils, {
        sourceId: context?.sourceId ?? variables.sourceId,
      });
      await handlers.onSettled?.(data, error, variables, context);
    },
  });
}

export function useWorkspaceUpdateSegmentsMutation(
  cacheContext: WorkspaceCacheContext,
  handlers: WorkspaceMutationHandlers<
    UpdateSegmentsOutput,
    UpdateSegmentsInput
  > = {},
) {
  const utils = api.useUtils();
  const { sourceId, speakerId } = cacheContext;

  return api.segment.updateMany.useMutation({
    onMutate: async (variables): Promise<WorkspaceSegmentMutationContext> => {
      const ctx: WorkspaceSegmentMutationContext = {};

      if (sourceId) {
        await utils.segment.getBySource.cancel({ sourceId });
        const prev = utils.segment.getBySource.getData({ sourceId });
        ctx.sourceId = sourceId;
        ctx.previousSegmentsBySource = prev;

        if (prev) {
          utils.segment.getBySource.setData(
            { sourceId },
            applyOptimisticUpdateSegments({
              segmentList: prev,
              segmentIds: variables.segmentIds,
              patch: variables.patch,
            }),
          );
        }
      }

      if (speakerId) {
        await utils.segment.getBySpeaker.cancel({ speakerId });
        const prev = utils.segment.getBySpeaker.getData({ speakerId });
        ctx.speakerId = speakerId;
        ctx.previousSegmentsBySpeaker = prev;

        if (prev) {
          if (variables.patch.speakerId) {
            // Segments are moving to another speaker — remove from current view
            utils.segment.getBySpeaker.setData(
              { speakerId },
              applyOptimisticDeleteSegments({
                segmentList: prev,
                segmentIds: variables.segmentIds,
              }),
            );
          } else {
            utils.segment.getBySpeaker.setData(
              { speakerId },
              applyOptimisticUpdateSegments({
                segmentList: prev,
                segmentIds: variables.segmentIds,
                patch: variables.patch,
              }),
            );
          }
        }
      }

      return ctx;
    },
    onSuccess: async (data, variables, context) => {
      await handlers.onSuccess?.(data, variables, context);
    },
    onError: async (error, variables, context) => {
      if (context) restoreCacheSnapshots(utils, context);
      await handlers.onError?.(error, variables, context);
    },
    onSettled: async (data, error, variables, context) => {
      await invalidateWorkspaceSegmentCaches(utils, {
        sourceId: context?.sourceId ?? sourceId ?? undefined,
        speakerId: context?.speakerId ?? speakerId ?? undefined,
      });
      await handlers.onSettled?.(data, error, variables, context);
    },
  });
}

export function useWorkspaceDeleteSegmentsMutation(
  cacheContext: WorkspaceCacheContext,
  handlers: WorkspaceMutationHandlers<
    DeleteSegmentsOutput,
    DeleteSegmentsInput
  > = {},
) {
  const utils = api.useUtils();
  const { sourceId, speakerId } = cacheContext;

  return api.segment.deleteMany.useMutation({
    onMutate: async (variables): Promise<WorkspaceSegmentMutationContext> => {
      const ctx: WorkspaceSegmentMutationContext = {};

      if (sourceId) {
        await utils.segment.getBySource.cancel({ sourceId });
        const prev = utils.segment.getBySource.getData({ sourceId });
        ctx.sourceId = sourceId;
        ctx.previousSegmentsBySource = prev;

        if (prev) {
          utils.segment.getBySource.setData(
            { sourceId },
            applyOptimisticDeleteSegments({
              segmentList: prev,
              segmentIds: variables.segmentIds,
            }),
          );
        }
      }

      if (speakerId) {
        await utils.segment.getBySpeaker.cancel({ speakerId });
        const prev = utils.segment.getBySpeaker.getData({ speakerId });
        ctx.speakerId = speakerId;
        ctx.previousSegmentsBySpeaker = prev;

        if (prev) {
          utils.segment.getBySpeaker.setData(
            { speakerId },
            applyOptimisticDeleteSegments({
              segmentList: prev,
              segmentIds: variables.segmentIds,
            }),
          );
        }
      }

      return ctx;
    },
    onSuccess: async (data, variables, context) => {
      await handlers.onSuccess?.(data, variables, context);
    },
    onError: async (error, variables, context) => {
      if (context) restoreCacheSnapshots(utils, context);
      await handlers.onError?.(error, variables, context);
    },
    onSettled: async (data, error, variables, context) => {
      await invalidateWorkspaceSegmentCaches(utils, {
        sourceId: context?.sourceId ?? sourceId ?? undefined,
        speakerId: context?.speakerId ?? speakerId ?? undefined,
      });
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

  return api.segment.split.useMutation({
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
      await invalidateWorkspaceSegmentCaches(utils, {
        sourceId: context?.sourceId ?? variables.sourceId,
      });
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

  return api.speaker.create.useMutation({
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

// ---------------------------------------------------------------------------
// Bulk mutations (table-exclusive: source.* / speaker.* conditional dispatch)
// ---------------------------------------------------------------------------

export interface BulkDeleteInput {
  excludeSegmentIds?: string[];
}

export function useWorkspaceBulkDeleteSegmentsMutation(
  cacheContext: WorkspaceCacheContext,
) {
  const utils = api.useUtils();

  const applyOptimistic = async (
    excludeSegmentIds?: string[],
  ): Promise<WorkspaceSegmentMutationContext> => {
    const ctx: WorkspaceSegmentMutationContext = {};

    if (cacheContext.sourceId && cacheContext.speakerId) {
      await utils.segment.getBySource.cancel({
        sourceId: cacheContext.sourceId,
      });
      const prev = utils.segment.getBySource.getData({
        sourceId: cacheContext.sourceId,
      });
      ctx.sourceId = cacheContext.sourceId;
      ctx.previousSegmentsBySource = prev;

      if (prev) {
        utils.segment.getBySource.setData(
          { sourceId: cacheContext.sourceId },
          applyOptimisticBulkDeleteFromSource({
            segmentList: prev,
            speakerId: cacheContext.speakerId,
            excludeSegmentIds,
          }),
        );
      }
    }

    if (cacheContext.speakerId) {
      await utils.segment.getBySpeaker.cancel({
        speakerId: cacheContext.speakerId,
      });
      const prev = utils.segment.getBySpeaker.getData({
        speakerId: cacheContext.speakerId,
      });
      ctx.speakerId = cacheContext.speakerId;
      ctx.previousSegmentsBySpeaker = prev;

      if (prev) {
        utils.segment.getBySpeaker.setData(
          { speakerId: cacheContext.speakerId },
          applyOptimisticBulkDeleteFromSpeaker({
            segmentList: prev,
            excludeSegmentIds,
          }),
        );
      }
    }

    return ctx;
  };

  const rollback = (ctx: WorkspaceSegmentMutationContext | undefined) => {
    if (ctx) restoreCacheSnapshots(utils, ctx);
  };

  const invalidate = async (
    ctx: WorkspaceSegmentMutationContext | undefined,
  ) => {
    await invalidateWorkspaceSegmentCaches(utils, {
      sourceId: ctx?.sourceId ?? cacheContext.sourceId ?? undefined,
      speakerId: ctx?.speakerId ?? cacheContext.speakerId ?? undefined,
    });
  };

  const sourceDelete = api.source.deleteSegments.useMutation({
    onMutate: async (vars) => applyOptimistic(vars.excludeSegmentIds),
    onError: async (_error, _vars, ctx) => rollback(ctx),
    onSettled: async (_data, _error, _vars, ctx) => invalidate(ctx),
  });

  const speakerDelete = api.speaker.deleteSegments.useMutation({
    onMutate: async (vars) => applyOptimistic(vars.excludeSegmentIds),
    onError: async (_error, _vars, ctx) => rollback(ctx),
    onSettled: async (_data, _error, _vars, ctx) => invalidate(ctx),
  });

  return {
    mutate(input: BulkDeleteInput = {}) {
      if (cacheContext.sourceId && cacheContext.speakerId) {
        sourceDelete.mutate({
          sourceId: cacheContext.sourceId,
          speakerId: cacheContext.speakerId,
          excludeSegmentIds: input.excludeSegmentIds,
        });
      } else if (cacheContext.speakerId) {
        speakerDelete.mutate({
          speakerId: cacheContext.speakerId,
          excludeSegmentIds: input.excludeSegmentIds,
        });
      }
    },
    isPending: sourceDelete.isPending || speakerDelete.isPending,
  };
}

export interface BulkChangeSpeakerInput {
  targetSpeakerId: string;
  excludeSegmentIds?: string[];
}

export function useWorkspaceBulkChangeSpeakerMutation(
  cacheContext: WorkspaceCacheContext,
) {
  const utils = api.useUtils();

  const applyOptimistic = async (
    toSpeakerId: string,
    excludeSegmentIds?: string[],
  ): Promise<WorkspaceSegmentMutationContext> => {
    const ctx: WorkspaceSegmentMutationContext = {};

    if (cacheContext.sourceId && cacheContext.speakerId) {
      await utils.segment.getBySource.cancel({
        sourceId: cacheContext.sourceId,
      });
      const prev = utils.segment.getBySource.getData({
        sourceId: cacheContext.sourceId,
      });
      ctx.sourceId = cacheContext.sourceId;
      ctx.previousSegmentsBySource = prev;

      if (prev) {
        utils.segment.getBySource.setData(
          { sourceId: cacheContext.sourceId },
          applyOptimisticBulkChangeSpeakerInSource({
            segmentList: prev,
            fromSpeakerId: cacheContext.speakerId,
            toSpeakerId,
            excludeSegmentIds,
          }),
        );
      }
    }

    if (cacheContext.speakerId) {
      await utils.segment.getBySpeaker.cancel({
        speakerId: cacheContext.speakerId,
      });
      const prev = utils.segment.getBySpeaker.getData({
        speakerId: cacheContext.speakerId,
      });
      ctx.speakerId = cacheContext.speakerId;
      ctx.previousSegmentsBySpeaker = prev;

      if (prev) {
        // From the current speaker's perspective, segments are leaving
        utils.segment.getBySpeaker.setData(
          { speakerId: cacheContext.speakerId },
          applyOptimisticBulkDeleteFromSpeaker({
            segmentList: prev,
            excludeSegmentIds,
          }),
        );
      }
    }

    return ctx;
  };

  const rollback = (ctx: WorkspaceSegmentMutationContext | undefined) => {
    if (ctx) restoreCacheSnapshots(utils, ctx);
  };

  const invalidate = async (
    ctx: WorkspaceSegmentMutationContext | undefined,
  ) => {
    await invalidateWorkspaceSegmentCaches(utils, {
      sourceId: ctx?.sourceId ?? cacheContext.sourceId ?? undefined,
      speakerId: ctx?.speakerId ?? cacheContext.speakerId ?? undefined,
    });
  };

  const sourceUpdate = api.source.updateSegments.useMutation({
    onMutate: async (vars) => {
      const toSpeakerId = vars.patch.speakerId;
      if (!toSpeakerId) return {};
      return applyOptimistic(toSpeakerId, vars.excludeSegmentIds);
    },
    onError: async (_error, _vars, ctx) => rollback(ctx),
    onSettled: async (_data, _error, _vars, ctx) => invalidate(ctx),
  });

  const speakerUpdate = api.speaker.updateSegments.useMutation({
    onMutate: async (vars) => {
      const toSpeakerId = vars.patch.speakerId;
      if (!toSpeakerId) return {};
      return applyOptimistic(toSpeakerId, vars.excludeSegmentIds);
    },
    onError: async (_error, _vars, ctx) => rollback(ctx),
    onSettled: async (_data, _error, _vars, ctx) => invalidate(ctx),
  });

  return {
    mutate(input: BulkChangeSpeakerInput) {
      if (cacheContext.sourceId && cacheContext.speakerId) {
        sourceUpdate.mutate({
          sourceId: cacheContext.sourceId,
          speakerId: cacheContext.speakerId,
          excludeSegmentIds: input.excludeSegmentIds,
          patch: { speakerId: input.targetSpeakerId },
        });
      } else if (cacheContext.speakerId) {
        speakerUpdate.mutate({
          speakerId: cacheContext.speakerId,
          excludeSegmentIds: input.excludeSegmentIds,
          patch: { speakerId: input.targetSpeakerId },
        });
      }
    },
    isPending: sourceUpdate.isPending || speakerUpdate.isPending,
  };
}
