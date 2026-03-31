import type { VibeVoiceSegment } from "../vibevoice.types";

const MAX_CONTENT_LENGTH = 500;

/**
 * Sentinel speaker index for recovered incomplete segments
 * missing the Speaker field.
 */
export const UNKNOWN_SPEAKER = -1;

// ── Stream helpers ──────────────────────────────────────────────────────────

/** Position after the last complete segment boundary (`},`), or -1. */
export function lastCompleteBoundary(text: string): number {
  const pos = text.lastIndexOf("},");
  return pos !== -1 ? pos + 2 : -1;
}

/** Last complete segment boundary before `maxPos`, or 0. */
export function safeBoundaryBefore(text: string, maxPos: number): number {
  const pos = text.slice(0, maxPos).lastIndexOf("},");
  return pos !== -1 ? pos + 2 : 0;
}

/**
 * Walk backwards `count` segment boundaries from `fromPos`.
 * Used by recovery to give the model a different "running start".
 */
export function rewindSegments(
  text: string,
  fromPos: number,
  count: number,
): number {
  let pos = fromPos;
  for (let i = 0; i < count; i++) {
    if (pos <= 2) return 0;
    const boundary = text.slice(0, pos - 2).lastIndexOf("},");
    if (boundary === -1) return 0;
    pos = boundary + 2;
  }
  return pos;
}

/**
 * Strip leading artifacts from model continuations (`[`, `[{`, `},`, `}`).
 * Also fixes `{"2.99,...` → `{"Start":2.99,...`.
 */
export function cleanContinuation(newText: string): string {
  let t = newText.trimStart();

  if (t.startsWith("[{")) {
    t = t.slice(1);
  } else if (t.startsWith("[")) {
    t = t.slice(1);
  } else if (t.startsWith("},")) {
    t = t.slice(2);
  } else if (t.startsWith("}") && !t.startsWith("}]")) {
    t = t.slice(1);
  }

  const malformed = t.match(/^{"(\d+\.?\d*),/);
  if (malformed?.[1]) {
    t = `{"Start":${malformed[1]},${t.slice(malformed[0].length)}`;
  }

  return t;
}

// ── Normalisation ───────────────────────────────────────────────────────────

function toVibeVoiceSegment(
  raw: Record<string, unknown>,
): VibeVoiceSegment | null {
  const start = raw.Start;
  const end = raw.End;
  const speaker = raw.Speaker;

  if (
    typeof start !== "number" ||
    typeof end !== "number" ||
    typeof speaker !== "number"
  ) {
    return null;
  }

  let content = typeof raw.Content === "string" ? raw.Content : "";
  if (content.length > MAX_CONTENT_LENGTH) {
    content = `${content.slice(0, MAX_CONTENT_LENGTH)}…`;
  }

  return { speaker, start, end, content };
}

function isSegmentLike(obj: unknown): obj is Record<string, unknown> {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return "Start" in o && "End" in o && ("Content" in o || "Speaker" in o);
}

// ── Strategy 1: direct JSON.parse ───────────────────────────────────────────

function tryDirectParse(text: string): VibeVoiceSegment[] | null {
  try {
    const result = JSON.parse(text) as unknown;
    if (Array.isArray(result)) {
      return result
        .filter(isSegmentLike)
        .map(toVibeVoiceSegment)
        .filter((s): s is VibeVoiceSegment => s !== null);
    }
    if (
      typeof result === "object" &&
      result !== null &&
      isSegmentLike(result)
    ) {
      const seg = toVibeVoiceSegment(result as Record<string, unknown>);
      return seg ? [seg] : null;
    }
  } catch {
    // not valid JSON
  }
  return null;
}

// ── Strategy 2: bracket fixup ───────────────────────────────────────────────

function trySimpleFixup(rawText: string): VibeVoiceSegment[] | null {
  let text = rawText;

  if (!text.startsWith("[")) text = `[${text}`;

  if (!text.endsWith("]")) {
    if (text.endsWith(",")) text = text.slice(0, -1);

    const lastOpen = text.lastIndexOf("{");
    const lastClose = text.lastIndexOf("}");
    if (lastOpen > lastClose) return null;

    text = `${text}]`;
  }

  try {
    const parsed = JSON.parse(text) as unknown[];
    const segments = parsed
      .filter(isSegmentLike)
      .map(toVibeVoiceSegment)
      .filter((s): s is VibeVoiceSegment => s !== null);
    return segments.length > 0 ? segments : null;
  } catch {
    return null;
  }
}

// ── Strategy 3: brace-depth extraction ──────────────────────────────────────

/**
 * Scan for `{…}` objects using brace-depth tracking with string awareness.
 *
 * This is the last-resort fallback — it handles arbitrarily mangled text
 * by individually extracting + parsing each top-level object.
 *
 * NOTE: we intentionally skip any preamble before the first `{`
 * (the old code used `indexOf("[")` which matched `[` inside JSON
 * string values like `"[Breath]"`, causing the scanner to start from
 * a wrong position). The brace-depth scanner does not need `[`.
 */
function extractObjectsByDepth(text: string): VibeVoiceSegment[] {
  // Skip to the first `{` — ignores any non-JSON preamble.
  const firstBrace = text.indexOf("{");
  if (firstBrace === -1) return [];
  const src = text.slice(firstBrace);

  const segments: VibeVoiceSegment[] = [];
  let depth = 0;
  let objStart = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === undefined) continue;

    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === "\\") {
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try {
          const obj = JSON.parse(src.slice(objStart, i + 1)) as unknown;
          if (isSegmentLike(obj)) {
            const seg = toVibeVoiceSegment(obj as Record<string, unknown>);
            if (seg) segments.push(seg);
          }
        } catch {
          /* malformed, skip */
        }
        objStart = -1;
      }
    }
  }

  if (objStart !== -1) {
    const recovered = recoverIncompleteSegment(src.slice(objStart));
    if (recovered) segments.push(recovered);
  }

  return segments;
}

/** Extract fields from a half-formed JSON object via regex. */
function recoverIncompleteSegment(incomplete: string): VibeVoiceSegment | null {
  const startVal = incomplete.match(/"Start"\s*:\s*([0-9.]+)/)?.[1];
  const endVal = incomplete.match(/"End"\s*:\s*([0-9.]+)/)?.[1];
  const speakerVal = incomplete.match(/"Speaker"\s*:\s*([0-9]+)/)?.[1];

  if (startVal === undefined || endVal === undefined) return null;

  let content = "";
  const contentMatch = incomplete.match(/"Content"\s*:\s*"/);
  if (contentMatch) {
    const contentStart = (contentMatch.index ?? 0) + contentMatch[0].length;
    let raw = incomplete.slice(contentStart);
    if (raw.endsWith('"')) raw = raw.slice(0, -1);
    if (raw.length > MAX_CONTENT_LENGTH)
      raw = `${raw.slice(0, MAX_CONTENT_LENGTH)}…`;
    content = raw;
  }

  return {
    speaker: speakerVal !== undefined ? Number(speakerVal) : UNKNOWN_SPEAKER,
    start: Number(startVal),
    end: Number(endVal),
    content,
  };
}

/**
 * Extract segments from raw text using a three-tier strategy:
 * 1. Direct `JSON.parse` (clean output)
 * 2. Bracket fixup + parse (truncated stream)
 * 3. Brace-depth extraction (badly mangled text)
 */
export function extractSegments(rawText: string): VibeVoiceSegment[] {
  const text = rawText.trim();
  if (!text) return [];

  const direct = tryDirectParse(text);
  if (direct && direct.length > 0) return direct;

  const fixed = trySimpleFixup(text);
  if (fixed && fixed.length > 0) return fixed;

  return extractObjectsByDepth(text);
}

// ── Diagnostics ─────────────────────────────────────────────────────────────

function tail(s: string, n = 120): string {
  return s.length <= n ? s : `…${s.slice(-n)}`;
}

function head(s: string, n = 120): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

/** Try JSON.parse and return the error message, or null on success. */
function jsonParseError(text: string): string | null {
  try {
    JSON.parse(text);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/**
 * Run every parsing strategy and report exactly what went wrong at each tier.
 *
 * Call this when `extractSegments` returns 0 segments on non-empty text
 * to get a loggable diagnostic string that pinpoints the failure.
 */
export function diagnoseParseFailure(rawText: string): string {
  const text = rawText.trim();
  const lines: string[] = [
    `Parse diagnostics for ${text.length} chars`,
    `  head: ${head(text)}`,
    `  tail: ${tail(text)}`,
    `  startsWithBracket: ${text.startsWith("[")}`,
    `  startsWithBrace: ${text.startsWith("{")}`,
    `  endsWithBracket: ${text.endsWith("]")}`,
  ];

  // Strategy 1: direct parse
  const directErr = jsonParseError(text);
  if (directErr) {
    lines.push(`  strategy1 (direct): FAILED — ${directErr}`);
  } else {
    const result = tryDirectParse(text);
    lines.push(
      `  strategy1 (direct): parsed OK — ${result?.length ?? 0} segment-like objects`,
    );
  }

  // Strategy 2: bracket fixup
  let fixedText = text;
  if (!fixedText.startsWith("[")) fixedText = `[${fixedText}`;
  if (!fixedText.endsWith("]")) {
    if (fixedText.endsWith(",")) fixedText = fixedText.slice(0, -1);
    const lastOpen = fixedText.lastIndexOf("{");
    const lastClose = fixedText.lastIndexOf("}");
    if (lastOpen > lastClose) {
      lines.push(
        `  strategy2 (fixup): FAILED — incomplete trailing object` +
          ` (lastOpen=${lastOpen}, lastClose=${lastClose})`,
      );
    } else {
      fixedText = `${fixedText}]`;
    }
  }
  if (!lines.some((l) => l.includes("strategy2"))) {
    const fixupErr = jsonParseError(fixedText);
    if (fixupErr) {
      // Try to narrow down where the JSON is broken
      const posMatch = fixupErr.match(/position\s+(\d+)/i);
      const pos = posMatch?.[1] ? Number(posMatch[1]) : null;
      let context = "";
      if (pos !== null) {
        const start = Math.max(0, pos - 40);
        const end = Math.min(fixedText.length, pos + 40);
        context = ` | around pos ${pos}: «${fixedText.slice(start, end)}»`;
      }
      lines.push(`  strategy2 (fixup): FAILED — ${fixupErr}${context}`);
    } else {
      const result = trySimpleFixup(text);
      lines.push(
        `  strategy2 (fixup): parsed OK — ${result?.length ?? 0} segments`,
      );
    }
  }

  // Strategy 3: brace-depth
  const braceResult = extractObjectsByDepth(text);
  lines.push(
    `  strategy3 (brace-depth): extracted ${braceResult.length} segments`,
  );

  return lines.join("\n");
}
