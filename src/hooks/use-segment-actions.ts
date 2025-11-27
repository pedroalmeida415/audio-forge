import { api } from "~/trpc/react";

type UseSegmentActionsParams = {
  audioFileId: string;
  projectId: string;
};

export function useSegmentActions({
  audioFileId,
  projectId,
}: UseSegmentActionsParams) {
  const utils = api.useUtils();

  const assignCollectionMutation = api.segment.assignCollection.useMutation({
    onSuccess: () => {
      utils.diarization.getJob.invalidate();
      utils.segment.listByAudioFile.invalidate({ audioFileId });
    },
  });

  const setExcludedMutation = api.segment.setExcluded.useMutation({
    onSuccess: () => {
      utils.diarization.getJob.invalidate();
      utils.segment.listByAudioFile.invalidate({ audioFileId });
    },
  });

  const resetTimestampsMutation = api.segment.resetTimestamps.useMutation({
    onSuccess: () => {
      utils.diarization.getJob.invalidate();
      utils.segment.listByAudioFile.invalidate({ audioFileId });
    },
  });

  const createCollectionMutation = api.collection.create.useMutation({
    onSuccess: () => {
      utils.collection.search.invalidate({ projectId });
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

  const createAndAssign = (segmentId: string, collectionName: string) => {
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
