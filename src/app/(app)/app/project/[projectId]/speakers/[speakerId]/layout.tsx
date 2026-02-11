import { api, HydrateClient } from "~/trpc/server";

export default async function SpeakerLayout({
  params,
  children,
}: {
  params: Promise<{ projectId: string; speakerId: string }>;
  children: React.ReactNode;
}) {
  const { speakerId } = await params;

  // Prefetch segment IDs for windowed fetching
  void api.segment.getIdsBySpeaker.prefetch({ speakerId });

  return <HydrateClient>{children}</HydrateClient>;
}
