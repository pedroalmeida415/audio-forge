import { api, HydrateClient } from "~/trpc/server";

export default async function ClippingLayout({
  params,
  children,
}: {
  params: Promise<{ projectId: string }>;
  children: React.ReactNode;
}) {
  const { projectId } = await params;

  // Prefetch session list for the project
  void api.source.listByProject.prefetch({ projectId });

  return <HydrateClient>{children}</HydrateClient>;
}
