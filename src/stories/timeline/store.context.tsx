"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCReact, httpBatchLink } from "@trpc/react-query";
import { createContext, type ReactNode, use, useState } from "react";
import SuperJSON from "superjson";
import { usePlayback } from "~/app/(app)/app/project/[projectId]/clipping/[sessionId]/_hooks/use-playback";
import {
  type $ClippingStore,
  type ClippingStoreInitialData,
  createClippingStore,
  type SegmentWithSpeaker,
} from "~/app/(app)/app/project/[projectId]/clipping/[sessionId]/_store/clipping-store";
import type { AppRouter } from "~/server/api/root";
import type { Speaker } from "~/server/db/schema";

// ============================================================================
// Mock tRPC Setup
// ============================================================================

// Create a separate tRPC instance for Storybook (replaces ~/trpc/react)
export const api = createTRPCReact<AppRouter>();

function MockTRPCProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
        mutations: { retry: false },
      },
    });

    // Pre-populate waveform URL query - uses tRPC's query key format
    client.setQueryData(
      [
        ["file", "getWaveformUrl"],
        { input: { fileId: "mock-file" }, type: "query" },
      ],
      { status: "completed", url: "/test-audio.dat", error: null },
    );

    return client;
  });

  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        httpBatchLink({
          transformer: SuperJSON,
          url: "http://localhost:3000/api/trpc",
          // No-op fetch - all data is pre-populated in queryClient
          fetch: async () => {
            return new Response(JSON.stringify([{ result: { data: null } }]), {
              headers: { "Content-Type": "application/json" },
            });
          },
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <api.Provider client={trpcClient} queryClient={queryClient}>
        {children}
      </api.Provider>
    </QueryClientProvider>
  );
}

// ============================================================================
// Store Context (mirrors real implementation)
// ============================================================================

const ClippingStoreContext = createContext<$ClippingStore | null>(null);

/**
 * Hook to access the clipping store - mirrors the real useClippingStore.
 * This export is what gets aliased in Storybook via the Vite plugin.
 */
export function useClippingStore(): $ClippingStore {
  const $store = use(ClippingStoreContext);

  if (!$store) {
    throw new Error(
      "useClippingStore must be used within ClippingStoreProvider",
    );
  }

  return $store;
}

// ============================================================================
// Storybook Store Provider
// ============================================================================

interface StorybookStoreProviderProps {
  children: ReactNode;
  initialData: ClippingStoreInitialData;
  stateOverrides?: StoreStateOverrides;
}

/**
 * Provider that uses the REAL createClippingStore.
 * Includes PlaybackInitializer for real audio/playback behavior.
 * Only skips DiarizationSubscriber (SSE) since we don't need real-time updates in Storybook.
 */
function StorybookStoreProvider({
  children,
  initialData,
  stateOverrides,
}: StorybookStoreProviderProps) {
  // Use the REAL store factory - this is what we're actually testing
  const $store = createClippingStore(initialData);

  // Apply optional state overrides for testing different visual states
  // These are applied after the real hooks run, so they can override initial values
  if (stateOverrides) {
    if (stateOverrides.zoomLevel !== undefined) {
      $store.timeline.zoomLevel.set(stateOverrides.zoomLevel);
    }
    if (stateOverrides.scrollOffset !== undefined) {
      $store.timeline.scrollOffset.set(stateOverrides.scrollOffset);
    }
    if (stateOverrides.selectedSpeakerId !== undefined) {
      $store.selectedSpeakerId.set(stateOverrides.selectedSpeakerId);
    }
    if (stateOverrides.activeSegmentId !== undefined) {
      $store.activeSegmentId.set(stateOverrides.activeSegmentId);
    }
  }

  return (
    <ClippingStoreContext.Provider value={$store}>
      <PlaybackInitializer stateOverrides={stateOverrides} />
      {children}
    </ClippingStoreContext.Provider>
  );
}

/**
 * Initializes real playback behavior using the usePlayback hook.
 * Audio will fail gracefully since we don't have real audio data.
 */
function PlaybackInitializer({
  stateOverrides,
}: {
  stateOverrides?: StoreStateOverrides;
}) {
  const $store = useClippingStore();

  // Use the REAL playback hook - this sets up audio, RAF loops, etc.
  usePlayback($store);

  // Apply playback-specific overrides after the hook initializes
  if (stateOverrides?.currentTime !== undefined) {
    $store.playback.currentTime.set(stateOverrides.currentTime);
  }
  if (stateOverrides?.isPlaying !== undefined) {
    $store.playback.isPlaying.set(stateOverrides.isPlaying);
  }

  return null;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Optional state overrides for testing different visual states.
 * These are applied after the real store is created.
 */
export interface StoreStateOverrides {
  currentTime?: number;
  isPlaying?: boolean;
  zoomLevel?: number;
  scrollOffset?: number;
  selectedSpeakerId?: string | null;
  activeSegmentId?: string | null;
}

export interface MockStoreProviderProps {
  children: ReactNode;
  initialData: ClippingStoreInitialData;
  stateOverrides?: StoreStateOverrides;
}

/**
 * Main provider for Storybook stories.
 * Uses the real store with mocked external dependencies (tRPC, audio).
 */
export function MockStoreProvider({
  children,
  initialData,
  stateOverrides,
}: MockStoreProviderProps) {
  return (
    <MockTRPCProvider>
      <StorybookStoreProvider
        initialData={initialData}
        stateOverrides={stateOverrides}
      >
        {children}
      </StorybookStoreProvider>
    </MockTRPCProvider>
  );
}

// ============================================================================
// Test Data Helpers
// ============================================================================

export function createMockSpeaker(
  id: string,
  name: string,
  color?: string,
): Speaker {
  return {
    id,
    projectId: "mock-project",
    userId: "mock-user",
    name,
    color: color ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function createMockSegment(
  id: string,
  speaker: Speaker,
  startTime: number,
  endTime: number,
): SegmentWithSpeaker {
  return {
    id,
    sessionId: "mock-session",
    speakerId: speaker.id,
    startTime,
    endTime,
    createdAt: new Date(),
    updatedAt: new Date(),
    speaker,
  };
}

// Default test data
const defaultSpeaker1 = createMockSpeaker("speaker-1", "SPEAKER_00");
const defaultSpeaker2 = createMockSpeaker("speaker-2", "SPEAKER_01");
const defaultSpeaker3 = createMockSpeaker("speaker-3", "SPEAKER_02");

export const defaultSpeakers: Speaker[] = [
  defaultSpeaker1,
  defaultSpeaker2,
  defaultSpeaker3,
];

export const defaultSegments: SegmentWithSpeaker[] = [
  createMockSegment("seg-1", defaultSpeaker1, 0, 5),
  createMockSegment("seg-2", defaultSpeaker2, 6, 12),
  createMockSegment("seg-3", defaultSpeaker1, 15, 22),
  createMockSegment("seg-4", defaultSpeaker3, 25, 35),
  createMockSegment("seg-5", defaultSpeaker2, 38, 45),
  createMockSegment("seg-6", defaultSpeaker1, 48, 55),
  createMockSegment("seg-7", defaultSpeaker3, 58, 65),
];

/**
 * Helper to create initialData for stories.
 */
export function createInitialData(
  overrides: Partial<{
    segments: SegmentWithSpeaker[];
    speakers: Speaker[];
    duration: number;
  }> = {},
): ClippingStoreInitialData {
  const speakers = overrides.speakers ?? defaultSpeakers;
  const segments = overrides.segments ?? defaultSegments;
  const duration = overrides.duration ?? 120;

  return {
    session: {
      id: "mock-session",
      fileId: "mock-file",
      projectId: "mock-project",
      segments,
      speakers,
    },
    audio: {
      storageKey: "mock-storage-key",
      duration,
    },
  };
}
