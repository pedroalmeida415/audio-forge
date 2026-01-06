import { HttpResponse, http } from "msw";
import SuperJSON from "superjson";
import type {
  AppProcedurePath,
  ProcedureOutput,
} from "~/trpc/__mocks__/types";

/**
 * Creates a type-safe MSW handler for a tRPC query procedure.
 * The response is automatically serialized using SuperJSON to match tRPC's format.
 *
 * @example
 * ```ts
 * const handler = trpcQuery("file.getWaveformUrl", () => ({
 *   status: "completed",
 *   url: "/test-audio.dat",
 *   error: null,
 * }));
 * ```
 */
export function trpcQuery<P extends AppProcedurePath>(
  path: P,
  resolver: () => ProcedureOutput<P>,
) {
  return http.get(`/api/trpc/${path}`, () => {
    const data = resolver();
    const serialized = SuperJSON.serialize(data);

    return HttpResponse.json({
      result: {
        data: serialized,
      },
    });
  });
}

/**
 * Creates a type-safe MSW handler for a tRPC mutation procedure.
 * The response is automatically serialized using SuperJSON to match tRPC's format.
 *
 * @example
 * ```ts
 * const handler = trpcMutation("file.create", () => ({
 *   file: { id: "123", ... },
 *   session: { id: "456", ... },
 * }));
 * ```
 */
export function trpcMutation<P extends AppProcedurePath>(
  path: P,
  resolver: () => ProcedureOutput<P>,
) {
  return http.post(`/api/trpc/${path}`, () => {
    const data = resolver();
    const serialized = SuperJSON.serialize(data);

    return HttpResponse.json({
      result: {
        data: serialized,
      },
    });
  });
}

/**
 * Creates an MSW handler for a tRPC subscription that returns an SSE stream.
 * Useful for mocking subscriptions that should stay open but not emit events.
 *
 * @example
 * ```ts
 * const handler = trpcSubscription("clippingSession.onDiarizationComplete");
 * ```
 */
export function trpcSubscription(path: AppProcedurePath) {
  return http.get(`/api/trpc/${path}`, () => {
    // Return an SSE stream that stays open but doesn't emit
    const stream = new ReadableStream({
      start(_controller) {
        // Keep connection open but don't emit anything
      },
    });

    return new HttpResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });
}
