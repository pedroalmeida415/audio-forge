import { api, HydrateClient } from "~/trpc/server";

export default async function CollectionDetailLayout({
  params,
  children,
}: {
  params: Promise<{ projectId: string; collectionId: string }>;
  children: React.ReactNode;
}) {
  const { collectionId } = await params;

  void api.collection.getById.prefetch({
    id: collectionId,
  });
  void api.clip.listByCollection.prefetch({
    collectionId,
  });

  return <HydrateClient>{children}</HydrateClient>;
}
