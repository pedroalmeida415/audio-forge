"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  httpLink,
  httpSubscriptionLink,
  loggerLink,
  splitLink,
} from "@trpc/client";
import { useMemo } from "react";
import SuperJSON from "superjson";
import { api } from "~/trpc/react";

// ============================================================================
// Mock TRPC Provider for Storybook
// ============================================================================

export interface MockTRPCProviderProps {
  children: React.ReactNode;
}

/**
 * Mock TRPC provider for Storybook stories.
 *
 * Uses httpLink (not batch) so each procedure is a separate request.
 * MSW intercepts these requests at `/api/trpc/{procedure}`.
 *
 * @example
 * ```tsx
 * // In your story
 * export const MyStory: Story = {
 *   parameters: {
 *     msw: {
 *       handlers: [
 *         http.post('/api/trpc/file.getWaveformUrl', () => {
 *           return HttpResponse.json({
 *             result: { data: { status: 'completed', url: '/test.dat', error: null } }
 *           });
 *         }),
 *       ],
 *     },
 *   },
 * };
 * ```
 */
export function MockTRPCProvider({ children }: MockTRPCProviderProps) {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
          mutations: { retry: false },
        },
      }),
    [],
  );

  const trpcClient = useMemo(
    () =>
      api.createClient({
        links: [
          loggerLink({
            enabled: (op) =>
              process.env.NODE_ENV === "development" ||
              (op.direction === "down" && op.result instanceof Error),
          }),
          splitLink({
            // Route subscriptions through SSE link (MSW can intercept these)
            condition: (op) => op.type === "subscription",
            true: httpSubscriptionLink({
              url: "/api/trpc",
              transformer: SuperJSON,
            }),
            // Queries/mutations use simple httpLink (MSW intercepts at /api/trpc/{procedure})
            false: httpLink({
              url: "/api/trpc",
              transformer: SuperJSON,
            }),
          }),
        ],
      }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <api.Provider client={trpcClient} queryClient={queryClient}>
        {children}
      </api.Provider>
    </QueryClientProvider>
  );
}
