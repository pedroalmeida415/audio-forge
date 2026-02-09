import { ClipStudioPanel } from "~/features/speaker/components/clip-studio-panel";
import { api, HydrateClient } from "~/trpc/server";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  void api.projects.getById.prefetch({ id: projectId });
  void api.clippingSession.listByProject.prefetch({ projectId });

  return (
    <HydrateClient>
      {children}
      <ClipStudioPanel />
    </HydrateClient>
  );
}
