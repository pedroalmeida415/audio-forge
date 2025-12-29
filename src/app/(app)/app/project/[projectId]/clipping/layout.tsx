import { api, HydrateClient } from "~/trpc/server";

export default async function ClippingLayout({
  params,
  children,
}: {
  params: Promise<{ projectId: string }>;
  children: React.ReactNode;
}) {
  const { projectId } = await params;

  // Prefetch file list for the project
  void api.file.listByProject.prefetch({ projectId });

  return <HydrateClient>{children}</HydrateClient>;
}
