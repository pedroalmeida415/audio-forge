/**
 * Bun supports async iteration on ReadableStream, but TypeScript's
 * DOM lib doesn't declare [Symbol.asyncIterator] on it.
 * @see https://bun.sh/docs/api/streams
 */

// biome-ignore lint/correctness/noUnusedVariables: global declaration
interface ReadableStream<R = unknown> {
  [Symbol.asyncIterator](): AsyncIterableIterator<R>;
}
