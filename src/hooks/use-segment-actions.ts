import { api } from "~/trpc/react";

/**
 * Hook for collection management in the clipping workspace.
 * Since segments are now pure timestamp data (no DB status/collection assignment),
 * this hook only handles collection creation for the selection workflow.
 */
export function useSegmentActions() {
  const utils = api.useUtils();

  const createCollectionMutation = api.collection.create.useMutation({
    onSuccess: () => {
      utils.collection.listAll.invalidate();
      utils.collection.searchGlobal.invalidate();
    },
  });

  /**
   * Create a new collection and return its ID for assignment
   */
  const createCollection = async (name: string, projectId: string) => {
    const result = await createCollectionMutation.mutateAsync({
      projectId,
      name,
    });
    return result;
  };

  return {
    createCollection,
    isCreatingCollection: createCollectionMutation.isPending,
  };
}
