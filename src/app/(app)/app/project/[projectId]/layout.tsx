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
  void api.source.listByProject.prefetch({ projectId });

  return <HydrateClient>{children}</HydrateClient>;
}
