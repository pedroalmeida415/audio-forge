import { api, HydrateClient } from "~/trpc/server";

export default async function ClippingWorkspaceLayout({
  params,
  children,
}: {
  params: Promise<{ projectId: string; sessionId: string }>;
  children: React.ReactNode;
}) {
  const { sessionId } = await params;

  // Prefetch session data for the workspace
  // Note: audio URL prefetch needs session data first, so we only prefetch session here
  void api.source.getById.prefetch({ id: sessionId });

  return <HydrateClient>{children}</HydrateClient>;
}
