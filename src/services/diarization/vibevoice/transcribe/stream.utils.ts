/**
 * Detects repetition/hallucination loops in streaming text output.
 *
 * Uses character-level period detection: for each candidate period P,
 * counts how many consecutive characters from the tail satisfy
 * `window[i] === window[i - P]`. This naturally handles partial trailing
 * copies — no alignment with the pattern boundary is required.
 *
 * Adaptive threshold based on total span of the periodic region:
 * - Total span (consecutive matches + period) must reach MIN_TOTAL_CHARS
 * - At least MIN_COPIES full copies must exist
 *
 * This gives us: a full segment object (~60 chars) is caught after just
 * 2 copies, while a single repeated character needs ≥60 consecutive copies.
 */

/** Minimum total characters of periodicity needed to flag a loop. */
const MIN_TOTAL_CHARS = 60;

/** Never fire with fewer than this many copies, regardless of period. */
const MIN_COPIES = 2;

export const WINDOW_SIZE = 400;

export type RepetitionResult =
  | { looping: false }
  | { looping: true; goodEndPos: number };

/**
 * Pure function — checks whether the tail of `text` contains a periodic
 * repetition (hallucination loop). Operates on a trailing window.
 *
 * For each candidate period (1 to maxPeriod), counts consecutive character
 * matches scanning backwards from the tail. If the periodic region spans
 * enough characters with enough copies, reports a loop.
 *
 * O(n) amortized for typical inputs (mismatches break early),
 * O(n²) worst case on a 400-char window (~80K comparisons, <100μs).
 */
export function checkRepetition(text: string): RepetitionResult {
  if (text.length < MIN_TOTAL_CHARS) {
    return { looping: false };
  }

  const window = text.length > WINDOW_SIZE ? text.slice(-WINDOW_SIZE) : text;
  const n = window.length;
  const maxPeriod = Math.floor(n / MIN_COPIES);

  for (let period = 1; period <= maxPeriod; period++) {
    const matches = countConsecutivePeriodMatches(window, period);
    const totalSpan = matches + period;
    const copies = totalSpan / period;

    if (totalSpan >= MIN_TOTAL_CHARS && copies >= MIN_COPIES) {
      const pattern = window.slice(n - totalSpan, n - totalSpan + period);
      const repetitionStart = text.length - totalSpan;
      const goodEnd = isMeaningful(pattern)
        ? repetitionStart + period
        : repetitionStart;

      return { looping: true, goodEndPos: goodEnd };
    }
  }

  return { looping: false };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Count consecutive character matches from the tail where each character
 * equals the one `period` positions before it.
 *
 * For `window = "XYZabcabc"` and `period = 3`:
 *   i=8: 'c' === 'c' ✓  i=7: 'b' === 'b' ✓  i=6: 'a' === 'a' ✓
 *   i=5: 'c' === 'Z' ✗  → 3 matches (totalSpan = 6, ~2 copies)
 *
 * Handles partial copies naturally:
 *   `window = "XYZabcab"` → "ab" at tail matches "ab" in previous copy,
 *   finding 5 matches for period=3 (totalSpan = 8, ~2.67 copies).
 */
function countConsecutivePeriodMatches(window: string, period: number): number {
  const n = window.length;
  let matches = 0;

  for (let i = n - 1; i >= period; i--) {
    if (window[i] !== window[i - period]) break;
    matches++;
  }

  return matches;
}

/** A pattern is meaningful if it has real content (not just whitespace/single char). */
function isMeaningful(pattern: string): boolean {
  const clean = pattern.trim();
  if (!clean) return false;
  if (new Set(clean).size < 3) return false;
  return true;
}

export function extractSSEContent(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed === "data: [DONE]" || !trimmed.startsWith("data: ")) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed.slice("data: ".length)) as {
      choices: Array<{ delta: { content?: string } }>;
    };
    return parsed.choices[0]?.delta?.content ?? null;
  } catch {
    return null;
  }
}

export function findLatestEnd(text: string): number {
  let latest = 0;
  for (const match of text.matchAll(/"End"\s*:\s*(\d+(?:\.\d+)?)/g)) {
    const val = match[1];
    if (val) {
      const t = Number(val);
      if (t > latest) latest = t;
    }
  }
  return latest;
}
