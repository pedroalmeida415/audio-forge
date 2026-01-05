"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCReact, httpBatchLink } from "@trpc/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { useState } from "react";
import SuperJSON from "superjson";

import type { AppRouter } from "~/server/api/root";

// ============================================================================
// Mock tRPC Client
// ============================================================================

export const api = createTRPCReact<AppRouter>();

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

// ============================================================================
// Mock Provider
// ============================================================================

export function TRPCReactProvider(props: { children: React.ReactNode }) {
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
        {props.children}
      </api.Provider>
    </QueryClientProvider>
  );
}
