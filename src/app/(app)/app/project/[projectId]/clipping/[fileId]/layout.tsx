import { api, HydrateClient } from "~/trpc/server";

export default async function ClippingWorkspaceLayout({
  params,
  children,
}: {
  params: Promise<{ projectId: string; fileId: string }>;
  children: React.ReactNode;
}) {
  const { fileId } = await params;

  // Prefetch file data and audio URL for the workspace
  void api.file.getById.prefetch({ id: fileId });
  void api.file.getAudioUrl.prefetch({ fileId });

  return <HydrateClient>{children}</HydrateClient>;
}
