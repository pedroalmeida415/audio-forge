import { api } from "~/trpc/react";

export type CreateCollectionResult = {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
};

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

  // Get project list for name lookup
  const { data: projects = [] } = api.project.list.useQuery({
    limit: 100,
    offset: 0,
  });

  /**
   * Create a new collection and return its ID and related info for assignment
   */
  const createCollection = async (
    name: string,
    projectId: string
  ): Promise<CreateCollectionResult> => {
    const result = await createCollectionMutation.mutateAsync({
      projectId,
      name,
    });

    // Find project name
    const project = projects.find((p) => p.id === projectId);

    return {
      id: result.id,
      name: result.name,
      projectId: result.projectId,
      projectName: project?.name ?? "Unknown Project",
    };
  };

  return {
    createCollection,
    isCreatingCollection: createCollectionMutation.isPending,
  };
}
