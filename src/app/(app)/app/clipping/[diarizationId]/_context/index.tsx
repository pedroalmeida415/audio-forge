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
  return (
    <ClippingWorkspaceStoreProvider initialData={initialData}>
      <PlaybackProvider>{children}</PlaybackProvider>
    </ClippingWorkspaceStoreProvider>
  );
}
