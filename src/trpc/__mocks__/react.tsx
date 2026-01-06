"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TRPCLink } from "@trpc/client";
import {
  httpLink,
  httpSubscriptionLink,
  loggerLink,
  splitLink,
} from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { observable } from "@trpc/server/observable";
import { useMemo } from "react";
import SuperJSON from "superjson";
import type { AppRouter } from "~/server/api/root";
import type {
  AppProcedurePath,
  ProcedureCall,
  ProcedureSpy,
} from "~/trpc/__mocks__/types";

// ============================================================================
// Procedure Spy - tracks all tRPC calls for test assertions
// ============================================================================

// Internal storage uses unknown for flexibility
type InternalCall = {
  path: AppProcedurePath;
  type: "query" | "mutation" | "subscription";
  input: unknown;
  output?: unknown;
};

const calls: InternalCall[] = [];

const spyMethods = {
  getCalls: () => [...calls] as ProcedureCall[],
  getCallsFor: <P extends AppProcedurePath>(path: P) =>
    calls.filter((c) => c.path === path) as ProcedureCall<P>[],
  wasCalled: (path: AppProcedurePath) => calls.some((c) => c.path === path),
  reset: () => {
    calls.length = 0;
  },
};

/**
 * Spy utility for asserting tRPC procedure calls in Storybook tests.
 *
 * @example
 * ```tsx
 * // Property access (recommended)
 * procedureSpy["file.getWaveformUrl"].wasCalled
 * procedureSpy["file.getWaveformUrl"].calls[0]?.input
 * procedureSpy["file.getWaveformUrl"].calls[0]?.output
 *
 * // Method access (also available)
 * procedureSpy.wasCalled("file.getWaveformUrl")
 * procedureSpy.getCallsFor("file.getWaveformUrl")
 * ```
 */
export const procedureSpy: ProcedureSpy = new Proxy(spyMethods as ProcedureSpy, {
  get(target, prop) {
    // Return methods if accessing known spy methods
    if (prop in target) {
      return target[prop as keyof typeof spyMethods];
    }

    // Otherwise treat as procedure path and return accessor
    const path = prop as AppProcedurePath;
    return {
      get wasCalled() {
        return calls.some((c) => c.path === path);
      },
      get calls() {
        return calls.filter((c) => c.path === path);
      },
    };
  },
});

/**
 * tRPC link that records all procedure calls for test assertions.
 */
const spyLink: TRPCLink<AppRouter> = () => {
  return ({ next, op }) => {
    return observable((observer) => {
      // Track the call (output added when response arrives)
      const call: InternalCall = {
        path: op.path as AppProcedurePath,
        type: op.type,
        input: op.input,
      };
      calls.push(call);

      const unsubscribe = next(op).subscribe({
        next(value) {
          // Capture output when we receive data
          if (value.result.type === "data") {
            call.output = value.result.data;
          }
          observer.next(value);
        },
        error(err) {
          observer.error(err);
        },
        complete() {
          observer.complete();
        },
      });

      return unsubscribe;
    });
  };
};

// ============================================================================
// Mock TRPC Provider for Storybook
// ============================================================================

export const api = createTRPCReact<AppRouter>();

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
export function TRPCReactProvider({ children }: { children: React.ReactNode }) {
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
          spyLink,
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
