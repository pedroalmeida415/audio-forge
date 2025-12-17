import type { DiarizationData } from "../_store/clipping-workspace-store";
import { PlaybackProvider } from "./playback.context";
import { ClippingStoreProvider } from "./store.context";

export interface ClippingWorkspaceInitialData {
  diarization: DiarizationData;
  audioDataBuffer: ArrayBuffer;
}

export default function ClippingWorkspaceProviders({
  children,
  initialData,
}: {
  children: React.ReactNode;
  initialData: ClippingWorkspaceInitialData;
}) {
  const { audioDataBuffer, diarization } = initialData;

  return (
    <ClippingStoreProvider initialData={{ diarization }}>
      <PlaybackProvider initialData={{ audioDataBuffer }}>
        {children}
      </PlaybackProvider>
    </ClippingStoreProvider>
  );
}
