import { useEffect } from "react";
import { useWorkspaceStore } from "~/features/workspace/context/workspace-store-context";

/**
 * Global keyboard listener to toggle playback with Spacebar.
 * Only active when a source is loaded and ignores input fields.
 */
export function useSpacebarPlayback(hasSource: boolean) {
  const { store } = useWorkspaceStore();

  useEffect(() => {
    if (!hasSource) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input or textarea
      const activeTag = document.activeElement?.tagName;
      if (
        activeTag === "INPUT" ||
        activeTag === "TEXTAREA" ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        // Toggle playback only if audio is fully loaded
        if (!store.isLoading && store.refs.audioElement) {
          store.togglePlayback();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [store, hasSource]);
}
