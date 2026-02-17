import { api, HydrateClient } from "~/trpc/server";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  void api.speaker.getByProject.prefetch({ projectId });

  return <HydrateClient>{children}</HydrateClient>;
}
