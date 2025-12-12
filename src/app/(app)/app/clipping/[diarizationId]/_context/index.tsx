import type { DiarizationSegment } from "../_store/clipping-workspace-store";
import { PlaybackProvider } from "./playback.context";
import { ClippingWorkspaceStoreProvider } from "./store.context";

export interface ClippingWorkspaceInitialData {
  segments: DiarizationSegment[];
  audioDataBuffer: ArrayBuffer;
}

export default function ClippingWorkspaceProviders({
  children,
  initialData,
}: {
  children: React.ReactNode;
  initialData: ClippingWorkspaceInitialData;
}) {
  const { audioDataBuffer, segments } = initialData;

  return (
    <ClippingWorkspaceStoreProvider initialData={{ segments }}>
      <PlaybackProvider initialData={{ audioDataBuffer }}>
        {children}
      </PlaybackProvider>
    </ClippingWorkspaceStoreProvider>
  );
}
