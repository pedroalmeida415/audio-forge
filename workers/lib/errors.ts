/**
 * Extract a detailed error message that includes the full cause chain.
 *
 * Effect tagged errors (e.g. `StorageError`) carry a `cause` field
 * that holds the underlying SDK/network error. Plain `error.message`
 * only gives the wrapper message ("Failed to upload file") and loses
 * the actual reason. This helper walks the chain to surface it.
 *
 * @example
 * ```
 * // StorageError { message: "Failed to upload file", cause: TypeError("fetch failed") }
 * formatErrorMessage(error)
 * // → "Failed to upload file → fetch failed"
 * ```
 */
export function formatErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const parts: string[] = [error.message];

  let current: unknown = "cause" in error ? error.cause : undefined;
  // Walk at most 5 levels deep to avoid infinite loops
  for (let i = 0; i < 5 && current; i++) {
    if (current instanceof Error) {
      parts.push(current.message);
      current = "cause" in current ? current.cause : undefined;
    } else {
      parts.push(String(current));
      break;
    }
  }

  return parts.join(" → ");
}
