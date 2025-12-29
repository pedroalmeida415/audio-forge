import { api, HydrateClient } from "~/trpc/server";

export default async function ClippingWorkspaceLayout({
  params,
  children,
}: {
  params: Promise<{ diarizationId: string }>;
  children: React.ReactNode;
}) {
  const { diarizationId } = await params;

  void api.diarization.getById.prefetch({ id: diarizationId });
  void api.diarization.getAudioUrl.prefetch({ id: diarizationId });

  return <HydrateClient>{children}</HydrateClient>;
}
