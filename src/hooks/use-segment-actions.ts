import { api } from "~/trpc/react";

type UseSegmentActionsParams = {
  jobId: string;
};

export function useSegmentActions({ jobId }: UseSegmentActionsParams) {
  const utils = api.useUtils();

  const assignCollectionMutation = api.segment.assignCollection.useMutation({
    onSuccess: () => {
      utils.diarization.getJob.invalidate();
      utils.segment.listByJob.invalidate({ jobId });
    },
  });

  const setExcludedMutation = api.segment.setExcluded.useMutation({
    onSuccess: () => {
      utils.diarization.getJob.invalidate();
      utils.segment.listByJob.invalidate({ jobId });
    },
  });

  const resetTimestampsMutation = api.segment.resetTimestamps.useMutation({
    onSuccess: () => {
      utils.diarization.getJob.invalidate();
      utils.segment.listByJob.invalidate({ jobId });
    },
  });

  const createCollectionMutation = api.collection.create.useMutation({
    onSuccess: () => {
      // Invalidate global collection queries
      utils.collection.listAll.invalidate();
      utils.collection.searchGlobal.invalidate();
    },
  });

  const assignToCollection = (
    segmentId: string,
    collectionId: string | null
  ) => {
    assignCollectionMutation.mutate({
      segmentId,
      collectionId,
    });
  };

  const toggleExcluded = (segmentId: string, currentlyExcluded: boolean) => {
    setExcludedMutation.mutate({
      segmentId,
      excluded: !currentlyExcluded,
    });
  };

  const resetTimestamps = (segmentId: string) => {
    resetTimestampsMutation.mutate({ segmentId });
  };

  const createAndAssign = (
    segmentId: string,
    collectionName: string,
    projectId: string
  ) => {
    createCollectionMutation.mutate(
      {
        projectId,
        name: collectionName,
      },
      {
        onSuccess: (collection) => {
          if (collection) {
            assignCollectionMutation.mutate({
              segmentId,
              collectionId: collection.id,
            });
          }
        },
      }
    );
  };

  const isPending =
    assignCollectionMutation.isPending ||
    setExcludedMutation.isPending ||
    resetTimestampsMutation.isPending ||
    createCollectionMutation.isPending;

  return {
    assignToCollection,
    toggleExcluded,
    resetTimestamps,
    createAndAssign,
    isPending,
  };
}
