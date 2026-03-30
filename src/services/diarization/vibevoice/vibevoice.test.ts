import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TranscribeResult, VibeVoiceSegment } from "./vibevoice";

// ============================================================================
// Mock the env module before importing the service
// ============================================================================

const FAKE_BASE_URL = "http://fake-vibevoice:8000";

vi.mock("~/env", () => ({
  env: {
    VIBEVOICE_ASR_URL: FAKE_BASE_URL,
  },
}));

// Now import the service (after mock is registered)
const { VibeVoiceService, UNKNOWN_SPEAKER } = await import("./vibevoice");

// ============================================================================
// Helpers
// ============================================================================

/** The example transcription from the Rick & Morty clip. */
const EXAMPLE_SEGMENTS = [
  {
    Start: 0,
    End: 2.1,
    Speaker: 0,
    Content: "[Unintelligible Speech]",
  },
  { Start: 2.1, End: 38.41, Content: "[Music]" },
  {
    Start: 38.41,
    End: 44.21,
    Speaker: 1,
    Content: "What? Why are you looking at me? You wanna go outside? Outside?",
  },
  { Start: 44.21, End: 46.97, Content: "[Human Sounds]" },
  { Start: 46.97, End: 48.49, Speaker: 1, Content: "Outside?" },
  { Start: 48.49, End: 53.55, Content: "[Noise]" },
  { Start: 53.55, End: 55.35, Speaker: 2, Content: "Are you kidding me?" },
  { Start: 55.35, End: 56.16, Speaker: 3, Content: "Come on!" },
  { Start: 56.16, End: 57.07, Speaker: 4, Content: "Oh my god." },
  { Start: 57.07, End: 57.89, Speaker: 5, Content: "What's wrong?" },
  {
    Start: 57.89,
    End: 58.96,
    Speaker: 2,
    Content: "You're an idiot dog!",
  },
  {
    Start: 58.96,
    End: 62.36,
    Speaker: 5,
    Content:
      "Oh, he, he didn't mean it, Dad. Did you, Snuffles? You're a good boy.",
  },
  {
    Start: 62.36,
    End: 66.49,
    Speaker: 2,
    Content:
      "Don't praise him now, Morty. He just peed on the carpet. Bad dog.",
  },
  {
    Start: 66.49,
    End: 68.28,
    Speaker: 6,
    Content: "Morty, come on. I need your help tonight.",
  },
  {
    Start: 68.28,
    End: 75.89,
    Speaker: 1,
    Content:
      "Hey, wait, hold on a second, Rick. You wouldn't by any chance have some sort of crazy science thing you could whip up that might help make this dog a little smarter, would you?",
  },
  {
    Start: 75.89,
    End: 80.88,
    Speaker: 6,
    Content:
      "I thought the whole point of having a dog was to feel superior, Jerry. If I were you, I wouldn't pull that thread. Come on, Morty.",
  },
  {
    Start: 80.88,
    End: 92.68,
    Speaker: 1,
    Content:
      "Listen, Rick, if you're gonna stay here rent-free and use my son for your stupid science, the least you could do is put a little bit of it to use for the family. You make that dog smart, or Morty's grounded.",
  },
  { Start: 92.68, End: 93.39, Speaker: 4, Content: "Ha ha!" },
  { Start: 93.39, End: 94.52, Speaker: 5, Content: "Oh, man." },
  {
    Start: 94.52,
    End: 97.71,
    Speaker: 6,
    Content: "Boy, you really got me up against the wall this time, Jerry.",
  },
  { Start: 97.71, End: 101.41, Content: "[Human Sounds]" },
  {
    Start: 101.41,
    End: 103.66,
    Speaker: 6,
    Content: "Alright, Ruffles, what's his name?",
  },
  { Start: 103.66, End: 104.31, Speaker: 5, Content: "Snuffles?" },
  {
    Start: 104.31,
    End: 109.55,
    Speaker: 6,
    Content: "Snuffles, shake. Roll over. Go to the bathroom.",
  },
  { Start: 109.55, End: 112.47, Content: "[Human Sounds]" },
  { Start: 112.47, End: 114.24, Speaker: 4, Content: "No way." },
  {
    Start: 114.24,
    End: 119.13,
    Speaker: 6,
    Content:
      "Yeah, you're at the top of your game now, Jerry. Have fun. Come on, Morty.",
  },
  {
    Start: 119.16,
    End: 121.16,
    Speaker: 5,
    Content: "That was fantastic, Rick.",
  },
  {
    Start: 121.16,
    End: 124.16,
    Speaker: 6,
    Content:
      "Yeah, Morty, if you like that. Boy, you're really gonna flip your lid over this one.",
  },
  {
    Start: 124.16,
    End: 125.77,
    Speaker: 5,
    Content: "Wha- wha- wha- what is it?",
  },
  {
    Start: 125.77,
    End: 132.68,
    Speaker: 6,
    Content:
      "It's a device, Morty, that when you put it in your ear, you can enter people's dreams, Morty. It's just like that movie that you keep crowing about.",
  },
  {
    Start: 132.68,
    End: 133.79,
    Speaker: 5,
    Content: "You talking about Inception?",
  },
  {
    Start: 133.79,
    End: 138.22,
    Speaker: 6,
    Content:
      "That's right, Morty. This is gonna be a lot like that, except, you know, it's gonna make sense.",
  },
  { Start: 138.22, End: 139.18, Speaker: 5, Content: "Inception made sense?" },
  {
    Start: 139.18,
    End: 152.04,
    Speaker: 6,
    Content:
      "You don't have to try to impress me, Morty. Listen, tonight we're gonna go into the home of your math teacher, Mr. Goldenfold, and we're gonna, we're gonna incept the idea in his brain to give you A's in math, Morty. That way you could, you know, you're gonna help me with my science, Morty, all the time.",
  },
];

/** Only segments that have a Speaker field (what the service should return). */
const EXPECTED_SPEAKER_SEGMENTS = EXAMPLE_SEGMENTS.filter(
  (s) => "Speaker" in s,
);

/**
 * Build SSE-formatted chunks from a JSON string.
 * Simulates how vLLM streams OpenAI-compatible chat completions.
 *
 * @param jsonText The full JSON string the model would emit
 * @param chunkSize How many characters per SSE data event
 */
function buildSSEChunks(jsonText: string, chunkSize = 80): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < jsonText.length; i += chunkSize) {
    const content = jsonText.slice(i, i + chunkSize);
    const ssePayload = JSON.stringify({
      choices: [{ delta: { content } }],
    });
    chunks.push(`data: ${ssePayload}\n\n`);
  }
  chunks.push("data: [DONE]\n\n");
  return chunks;
}

/**
 * Create a ReadableStream that emits SSE chunks with small delays.
 */
function createSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    async pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      const chunk = chunks[i++]!;
      controller.enqueue(encoder.encode(chunk));
    },
  });
}

/**
 * Create a mock Response that simulates a successful vLLM SSE stream.
 */
function createMockStreamResponse(
  jsonText: string,
  chunkSize?: number,
): Response {
  const chunks = buildSSEChunks(jsonText, chunkSize);
  return new Response(createSSEStream(chunks), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

/**
 * Create a mock Response from pre-built SSE chunks (for custom scenarios).
 */
function createMockStreamResponseFromChunks(chunks: string[]): Response {
  return new Response(createSSEStream(chunks), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

/**
 * Run the transcribe Effect and return the result.
 */
async function runTranscribe(params: {
  audioUrl: string;
  maxDurationSeconds: number;
}): Promise<TranscribeResult> {
  const program = VibeVoiceService.transcribe(params);
  return Effect.runPromise(
    program.pipe(Effect.provide(VibeVoiceService.Default)),
  );
}

// ============================================================================
// Tests
// ============================================================================

describe("VibeVoiceService.transcribe", () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    // Route health check requests to a success response automatically;
    // all other requests (transcription) go through test-specific mocks.
    globalThis.fetch = ((url: string, ...args: unknown[]) => {
      if (typeof url === "string" && url.endsWith("/health")) {
        return Promise.resolve(new Response("OK", { status: 200 }));
      }
      return (fetchMock as Function)(url, ...args);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Happy path
  // --------------------------------------------------------------------------

  describe("happy path", () => {
    it("parses a complete transcription with speaker and non-speaker segments", async () => {
      const fullJson = JSON.stringify(EXAMPLE_SEGMENTS);
      fetchMock.mockResolvedValueOnce(createMockStreamResponse(fullJson));

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 160,
      });

      // Non-speaker segments ([Music], [Noise], [Human Sounds]) should be
      // filtered out because toVibeVoiceSegment returns null when Speaker
      // is not a number.
      expect(result.segments).toHaveLength(EXPECTED_SPEAKER_SEGMENTS.length);

      // Verify first and last segments
      expect(result.segments[0]).toEqual({
        speaker: 0,
        start: 0,
        end: 2.1,
        content: "[Unintelligible Speech]",
      });

      const last = result.segments[result.segments.length - 1]!;
      expect(last.speaker).toBe(6);
      expect(last.start).toBe(139.18);
      expect(last.end).toBe(152.04);
      expect(last.content).toContain("you're gonna help me with my science");
    });

    it("correctly maps all speaker IDs from the transcription", async () => {
      const fullJson = JSON.stringify(EXAMPLE_SEGMENTS);
      fetchMock.mockResolvedValueOnce(createMockStreamResponse(fullJson));

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 160,
      });

      const speakerIds = new Set(result.segments.map((s) => s.speaker));
      // Speakers 0-6 from the example
      expect(speakerIds).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]));
    });

    it("preserves segment ordering", async () => {
      const fullJson = JSON.stringify(EXAMPLE_SEGMENTS);
      fetchMock.mockResolvedValueOnce(createMockStreamResponse(fullJson));

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 160,
      });

      // Verify segments are in chronological order
      for (let i = 1; i < result.segments.length; i++) {
        const prev = result.segments[i - 1]!;
        const curr = result.segments[i]!;
        expect(curr.start).toBeGreaterThanOrEqual(prev.start);
      }
    });

    it("handles tiny chunk sizes (character-by-character streaming)", async () => {
      const fullJson = JSON.stringify(EXAMPLE_SEGMENTS);
      // Stream one character at a time — extreme fragmentation
      fetchMock.mockResolvedValueOnce(createMockStreamResponse(fullJson, 1));

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 160,
      });

      expect(result.segments).toHaveLength(EXPECTED_SPEAKER_SEGMENTS.length);
    });

    it("includes rawText in the result", async () => {
      const segments = [{ Start: 0, End: 5, Speaker: 0, Content: "Hello" }];
      const fullJson = JSON.stringify(segments);
      fetchMock.mockResolvedValueOnce(createMockStreamResponse(fullJson));

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 10,
      });

      expect(result.rawText).toBeDefined();
      expect(result.rawText.length).toBeGreaterThan(0);
      // rawText should contain the JSON that was parsed
      expect(result.rawText).toContain('"Start"');
      expect(result.rawText).toContain('"Hello"');
    });
  });

  // --------------------------------------------------------------------------
  // Non-speaker segment filtering
  // --------------------------------------------------------------------------

  describe("non-speaker segments", () => {
    it("filters out [Music], [Noise], [Human Sounds] segments without Speaker", async () => {
      const segments = [
        { Start: 0, End: 5, Content: "[Music]" },
        { Start: 5, End: 10, Speaker: 0, Content: "Hello world" },
        { Start: 10, End: 15, Content: "[Noise]" },
        { Start: 15, End: 20, Speaker: 1, Content: "Goodbye" },
        { Start: 20, End: 25, Content: "[Human Sounds]" },
      ];
      fetchMock.mockResolvedValueOnce(
        createMockStreamResponse(JSON.stringify(segments)),
      );

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 30,
      });

      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]!.content).toBe("Hello world");
      expect(result.segments[1]!.content).toBe("Goodbye");
    });

    it("excludes objects with Start/End but no Content or Speaker", async () => {
      const segments = [
        { Start: 0, End: 5 }, // No Content or Speaker — invalid per isValidRawSegment
        { Start: 5, End: 10, Speaker: 0, Content: "Valid segment" },
      ];
      fetchMock.mockResolvedValueOnce(
        createMockStreamResponse(JSON.stringify(segments)),
      );

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 15,
      });

      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]!.content).toBe("Valid segment");
    });
  });

  // --------------------------------------------------------------------------
  // Duration guard
  // --------------------------------------------------------------------------

  describe("duration guard", () => {
    it("filters segments that exceed maxDurationSeconds", async () => {
      // Audio is 60 seconds, but model hallucinates segments past that.
      // The post-parse filter keeps segments with start < maxDuration + 1.
      const segments = [
        { Start: 0, End: 30, Speaker: 0, Content: "First half" },
        { Start: 30, End: 55, Speaker: 0, Content: "Near end" },
        { Start: 55, End: 60, Speaker: 0, Content: "At the end" },
        // Start=60 is within tolerance (< 61), kept even though End > duration
        { Start: 60, End: 65, Speaker: 0, Content: "At boundary" },
        // Start=65 exceeds tolerance (>= 61), filtered
        { Start: 65, End: 90, Speaker: 0, Content: "Way past!" },
      ];
      fetchMock.mockResolvedValueOnce(
        createMockStreamResponse(JSON.stringify(segments)),
      );

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 60,
      });

      // Explicitly verify which segments survived
      expect(result.segments.map((s) => s.start)).toEqual([0, 30, 55, 60]);
      expect(result.segments.map((s) => s.content)).toEqual([
        "First half",
        "Near end",
        "At the end",
        "At boundary",
      ]);
    });

    it("force-stops the stream when End timestamps exceed duration", async () => {
      // Build the segments as one JSON array, but stream with TINY chunks
      // so the duration guard re-checks after each TCP read.
      // Place a valid-start segment AFTER the over-limit End in the stream.
      // If force-stop works, the stream aborts before that segment arrives.
      const segments = [
        { Start: 0, End: 10, Speaker: 0, Content: "Before limit" },
        { Start: 10, End: 20, Speaker: 0, Content: "Also before" },
        // End=35 > maxDuration(25)+1 → triggers force-stop
        { Start: 20, End: 35, Speaker: 0, Content: "Triggers force-stop" },
        // This segment has a valid Start (<26) but comes AFTER the abort
        // trigger in the stream — should NOT be present if force-stop works.
        { Start: 22, End: 24, Speaker: 0, Content: "Should NOT appear" },
      ];
      // Use chunkSize=20 (very small) so each segment boundary is in its
      // own SSE event, forcing the duration guard to run between them.
      fetchMock.mockResolvedValueOnce(
        createMockStreamResponse(JSON.stringify(segments), 20),
      );

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 25,
      });

      // Force-stop should have aborted before "Should NOT appear" was received.
      // The post-parse filter keeps segments with start < 26.
      // If force-stop did NOT work, we'd see 4 segments (all have start < 26).
      expect(result.segments.length).toBeLessThanOrEqual(3);
      expect(
        result.segments.every((s) => s.content !== "Should NOT appear"),
      ).toBe(true);
      // At minimum the first two segments should be present
      expect(result.segments.length).toBeGreaterThanOrEqual(2);
      expect(result.segments[0]!.content).toBe("Before limit");
      expect(result.segments[1]!.content).toBe("Also before");
    });
  });

  // --------------------------------------------------------------------------
  // Repetition / hallucination loop detection
  // --------------------------------------------------------------------------

  describe("repetition loop detection", () => {
    it("detects and recovers from a repeating segment pattern", async () => {
      // The repetition detector uses a 400-char window, minPatternLen=10,
      // minRepeats=10. So the repeating pattern must be ≤40 chars
      // (400/10) and repeat ≥10 times at the tail of the window.
      const goodSegments = [
        { Start: 0, End: 5, Speaker: 0, Content: "Hello there" },
      ];
      const goodPrefix = JSON.stringify(goodSegments).slice(0, -1) + ",";

      // Use a repeating pattern exactly 20 chars long (400/20 = 20 reps in window)
      const repeatingPattern = '{"S":1,"E":2},     '; // exactly 20 chars
      const loopingText = goodPrefix + repeatingPattern.repeat(25);

      // First call: looping stream. Recovery calls: fresh Response each time.
      const recoverySegments = [
        { Start: 5, End: 10, Speaker: 0, Content: "Recovered content" },
        { Start: 10, End: 15, Speaker: 1, Content: "More content" },
      ];
      const recoveryJson = JSON.stringify(recoverySegments);
      let callCount = 0;
      fetchMock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(createMockStreamResponse(loopingText));
        }
        return Promise.resolve(createMockStreamResponse(recoveryJson));
      });

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 30,
      });

      // Should have recovered and produced valid segments
      expect(result.segments.length).toBeGreaterThanOrEqual(1);
      // The fetch should have been called at least twice (initial + recovery)
      expect(callCount).toBeGreaterThanOrEqual(2);
    });

    it("detects repeating word phrases in raw stream text", async () => {
      // The repetition detector's Method 2 checks for 2-5 word phrases
      // repeated ≥10 times at the tail of the 400-char window.
      // The detection happens on the RAW accumulated text — so we need the
      // repeated words to appear as raw stream text, not inside a JSON string.
      const goodPart = '[{"Start":0,"End":5,"Speaker":0,"Content":"Good"},';
      // Repeat a 3-word phrase 15 times directly in the stream text
      const repeatingPhrase = "oh my god ".repeat(15);
      const loopingStream = goodPart + repeatingPhrase;

      let callCount = 0;
      fetchMock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(createMockStreamResponse(loopingStream));
        }
        return Promise.resolve(
          createMockStreamResponse(
            JSON.stringify([
              {
                Start: 5,
                End: 10,
                Speaker: 0,
                Content: "This is the real content",
              },
            ]),
          ),
        );
      });

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 15,
      });

      expect(result.segments.length).toBeGreaterThanOrEqual(1);
      // CRITICAL: verify recovery was actually triggered (loop was detected)
      expect(callCount).toBeGreaterThanOrEqual(2);
    });

    it("returns best recovered text when max retries exhausted", async () => {
      // All attempts return looping text. With skip-based recovery,
      // each retry injects a skip segment into the prefix. Eventually
      // MAX_RETRIES is exhausted and the service returns whatever
      // was accumulated in the prefix.
      const goodSegment = '{"Start":0,"End":5,"Speaker":0,"Content":"Saved"}';
      // Use proper "Start"/"End" keys so recoverStuckSegment can extract timestamps.
      // The pattern repeats to trigger the repetition detector.
      const repeatingSegment = '{"Start":6,"End":7,"Speaker":0,"Content":"loop loop loop loop loop loop loop loop loop loop loop loop loop loop loop "}';
      const loopingJson =
        "[" + goodSegment + "," + repeatingSegment.repeat(8);

      // Every call returns the same looping response
      fetchMock.mockImplementation(() =>
        Promise.resolve(createMockStreamResponse(loopingJson)),
      );

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 10,
      });

      // Should have retried multiple times before exhausting
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
      // Should still return the good segment from the prefix
      expect(result.segments.length).toBeGreaterThanOrEqual(1);
      expect(result.segments[0]!.content).toBe("Saved");
    });
  });

  // --------------------------------------------------------------------------
  // Incomplete / truncated JSON
  // --------------------------------------------------------------------------

  describe("incomplete JSON handling", () => {
    it("recovers from a stream that cuts off mid-segment", async () => {
      // Simulate a stream that ends abruptly in the middle of a segment
      const truncatedJson =
        '[{"Start":0,"End":5,"Speaker":0,"Content":"Complete segment"},{"Start":5,"End":10,"Speaker":1,"Content":"This is trun';

      fetchMock.mockResolvedValueOnce(createMockStreamResponse(truncatedJson));

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 15,
      });

      // Should recover at least the first complete segment
      expect(result.segments.length).toBeGreaterThanOrEqual(1);
      expect(result.segments[0]).toEqual({
        speaker: 0,
        start: 0,
        end: 5,
        content: "Complete segment",
      });

      // The second segment should be partially recovered via brace-depth extraction
      if (result.segments.length >= 2) {
        expect(result.segments[1]!.start).toBe(5);
        expect(result.segments[1]!.end).toBe(10);
        expect(result.segments[1]!.content).toContain("This is trun");
      }
    });

    it("handles a stream with no closing bracket", async () => {
      // Missing the final ']'
      const noClosingBracket =
        '[{"Start":0,"End":5,"Speaker":0,"Content":"Hello"},{"Start":5,"End":10,"Speaker":1,"Content":"World"}';

      fetchMock.mockResolvedValueOnce(
        createMockStreamResponse(noClosingBracket),
      );

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 15,
      });

      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]!.content).toBe("Hello");
      expect(result.segments[1]!.content).toBe("World");
    });

    it("handles a stream with no opening bracket", async () => {
      const noOpeningBracket =
        '{"Start":0,"End":5,"Speaker":0,"Content":"Hello"},{"Start":5,"End":10,"Speaker":1,"Content":"World"}]';

      fetchMock.mockResolvedValueOnce(
        createMockStreamResponse(noOpeningBracket),
      );

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 15,
      });

      expect(result.segments).toHaveLength(2);
    });

    it("handles trailing comma after last segment", async () => {
      const trailingComma =
        '[{"Start":0,"End":5,"Speaker":0,"Content":"Hello"},{"Start":5,"End":10,"Speaker":1,"Content":"World"},';

      fetchMock.mockResolvedValueOnce(createMockStreamResponse(trailingComma));

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 15,
      });

      expect(result.segments).toHaveLength(2);
    });

    it("recovers incomplete segment with missing Speaker (defaults to UNKNOWN_SPEAKER)", async () => {
      // Truncated before Speaker field — recovery should use UNKNOWN_SPEAKER sentinel
      const truncated =
        '[{"Start":0,"End":5,"Speaker":0,"Content":"Complete"},{"Start":5,"End":10,"Content":"No speaker';

      fetchMock.mockResolvedValueOnce(createMockStreamResponse(truncated));

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 15,
      });

      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]!.speaker).toBe(0);
      // The recovered segment should have the UNKNOWN_SPEAKER sentinel
      expect(result.segments[1]!.speaker).toBe(UNKNOWN_SPEAKER);
      expect(result.segments[1]!.content).toContain("No speaker");
    });

    it("does not recover segment with missing End timestamp", async () => {
      // Truncated before End field — recovery should return null
      const truncated =
        '[{"Start":0,"End":5,"Speaker":0,"Content":"Complete"},{"Start":5';

      fetchMock.mockResolvedValueOnce(createMockStreamResponse(truncated));

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 15,
      });

      // Only the first complete segment should be recovered
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]!.content).toBe("Complete");
    });
  });

  // --------------------------------------------------------------------------
  // Content-level hallucination
  // --------------------------------------------------------------------------

  describe("content-level hallucination", () => {
    it("truncates a single segment with extremely long content (> 500 chars)", async () => {
      // Use varied content that won't trigger the stream-level repetition
      // detector (which looks for repeating substrings within a 400-char window).
      // We generate unique sentence-like content > 500 chars.
      let longContent = "";
      for (let i = 0; i < 60; i++) {
        longContent += `Sentence number ${i} with unique words like ${String.fromCharCode(65 + (i % 26))}. `;
      }
      const segments = [
        { Start: 0, End: 60, Speaker: 0, Content: longContent },
      ];
      fetchMock.mockResolvedValueOnce(
        createMockStreamResponse(JSON.stringify(segments)),
      );
      // Queue recovery responses in case stream-level detection fires
      fetchMock.mockResolvedValue(
        createMockStreamResponse(JSON.stringify(segments)),
      );

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 65,
      });

      expect(result.segments).toHaveLength(1);
      // Content should be truncated to exactly 500 chars + "…" (1 char) = 501
      expect(result.segments[0]!.content).toHaveLength(501);
      expect(result.segments[0]!.content).toMatch(/…$/);
    });

    it("does not truncate content at exactly 500 chars", async () => {
      // Use varied content that fills exactly 500 chars without triggering
      // the stream-level repetition detector.
      let exactContent = "";
      for (let i = 0; exactContent.length < 500; i++) {
        exactContent += `w${i} `;
      }
      exactContent = exactContent.slice(0, 500);
      const segments = [
        { Start: 0, End: 10, Speaker: 0, Content: exactContent },
      ];
      fetchMock.mockResolvedValueOnce(
        createMockStreamResponse(JSON.stringify(segments)),
      );

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 15,
      });

      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]!.content).toBe(exactContent);
      expect(result.segments[0]!.content).not.toContain("…");
    });
  });

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------

  describe("edge cases", () => {
    it("handles empty response body", async () => {
      fetchMock.mockResolvedValueOnce(createMockStreamResponse(""));

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 10,
      });

      expect(result.segments).toHaveLength(0);
    });

    it("handles a single segment", async () => {
      const segments = [
        { Start: 0, End: 5, Speaker: 0, Content: "Only segment" },
      ];
      fetchMock.mockResolvedValueOnce(
        createMockStreamResponse(JSON.stringify(segments)),
      );

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 10,
      });

      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]!.content).toBe("Only segment");
    });

    it("handles HTTP error from the server", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response("Internal Server Error", { status: 500 }),
      );

      await expect(
        runTranscribe({
          audioUrl: "https://example.com/audio.wav",
          maxDurationSeconds: 10,
        }),
      ).rejects.toThrow();
    });

    it("handles network failure", async () => {
      fetchMock.mockRejectedValueOnce(new Error("Network unreachable"));

      await expect(
        runTranscribe({
          audioUrl: "https://example.com/audio.wav",
          maxDurationSeconds: 10,
        }),
      ).rejects.toThrow();
    });

    it("handles response with no body", async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

      await expect(
        runTranscribe({
          audioUrl: "https://example.com/audio.wav",
          maxDurationSeconds: 10,
        }),
      ).rejects.toThrow();
    });

    it("sends correct prompt with maxDurationSeconds", async () => {
      const segments = [{ Start: 0, End: 5, Speaker: 0, Content: "Test" }];
      fetchMock.mockResolvedValueOnce(
        createMockStreamResponse(JSON.stringify(segments)),
      );

      await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 42.5,
      });

      // Verify the request was made correctly
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(`${FAKE_BASE_URL}/v1/chat/completions`);

      const body = JSON.parse(init!.body as string);
      expect(body.model).toBe("vibevoice");
      expect(body.stream).toBe(true);
      expect(body.temperature).toBe(0);
      expect(body.top_p).toBe(1);
      expect(body.max_tokens).toBe(32768);

      // Prompt should mention duration
      const userMessage = body.messages.find(
        (m: Record<string, unknown>) => m.role === "user",
      );
      expect(userMessage.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "text",
            text: expect.stringContaining("42.50"),
          }),
        ]),
      );

      // Audio URL should be in the message
      expect(userMessage.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "audio_url",
            audio_url: { url: "https://example.com/audio.wav" },
          }),
        ]),
      );
    });

    it("handles escaped quotes in Content", async () => {
      // Content contains escaped quotes — tests string-escape tracking
      // in direct JSON.parse and brace-depth extraction
      const segments = [
        {
          Start: 0,
          End: 5,
          Speaker: 0,
          Content: 'She said "hello" and he said "goodbye"',
        },
      ];
      fetchMock.mockResolvedValueOnce(
        createMockStreamResponse(JSON.stringify(segments)),
      );

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 10,
      });

      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]!.content).toBe(
        'She said "hello" and he said "goodbye"',
      );
    });
  });

  // --------------------------------------------------------------------------
  // Stream continuation / recovery
  // --------------------------------------------------------------------------

  describe("stream continuation after recovery", () => {
    it("sends assistant prefix with skip segment on recovery attempt", async () => {
      // Build a looping stream with a compact repeated chunk that triggers
      // detection within the 400-char window (≥10 reps of ≥10-char pattern).
      const goodSegment = {
        Start: 0,
        End: 5,
        Speaker: 0,
        Content: "Good segment content here",
      };
      // Use a short repeating pattern (≤40 chars, ≥10 chars) that fits
      // many times in the 400-char detector window.
      const repeatingPattern = '{"S":5,"E":6},     '; // 20 chars
      const loopingJson =
        "[" + JSON.stringify(goodSegment) + "," + repeatingPattern.repeat(25);

      // First call: loops. Recovery calls: fresh responses.
      const recoveryJson = JSON.stringify([
        { Start: 5, End: 10, Speaker: 0, Content: "Recovered" },
      ]);
      let callCount = 0;
      fetchMock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(createMockStreamResponse(loopingJson));
        }
        return Promise.resolve(createMockStreamResponse(recoveryJson));
      });

      await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 15,
      });

      // Should have been called at least twice (initial + recovery)
      expect(callCount).toBeGreaterThanOrEqual(2);

      // Find the first recovery call (index > 0)
      const recoveryCallBody = JSON.parse(
        fetchMock.mock.calls[1]![1]!.body as string,
      );

      // Skip-based recovery always uses greedy (preserves speaker identity)
      expect(recoveryCallBody.temperature).toBe(0);
      expect(recoveryCallBody.top_p).toBe(1);

      // Should have assistant message with a skip segment prefix
      const assistantMsg = recoveryCallBody.messages.find(
        (m: Record<string, unknown>) => m.role === "assistant",
      );
      expect(assistantMsg).toBeDefined();
      expect(typeof assistantMsg.content).toBe("string");
      // The prefix should contain the good segment and a skip/inaudible marker
      expect(assistantMsg.content).toContain('"Content":"Good segment content here"');
    });
  });

  // --------------------------------------------------------------------------
  // vLLM deduplication behavior
  // --------------------------------------------------------------------------

  describe("vLLM streaming deduplication", () => {
    it("handles vLLM sending full accumulated text instead of deltas", async () => {
      // Simulate vLLM behavior where each chunk contains the FULL accumulated text
      // instead of just the delta
      const fullJson = '[{"Start":0,"End":5,"Speaker":0,"Content":"Hello"}]';
      const chunks: string[] = [];

      // Each SSE event sends the full text so far (cumulative)
      for (let i = 1; i <= fullJson.length; i += 10) {
        const accumulated = fullJson.slice(0, i);
        chunks.push(
          `data: ${JSON.stringify({ choices: [{ delta: { content: accumulated } }] })}\n\n`,
        );
      }
      // Final chunk with the complete text
      chunks.push(
        `data: ${JSON.stringify({ choices: [{ delta: { content: fullJson } }] })}\n\n`,
      );
      chunks.push("data: [DONE]\n\n");

      fetchMock.mockResolvedValueOnce(
        createMockStreamResponseFromChunks(chunks),
      );

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 10,
      });

      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]!.content).toBe("Hello");
    });
  });

  // --------------------------------------------------------------------------
  // Continuation prefix cleaning
  // --------------------------------------------------------------------------

  describe("continuation prefix artifacts", () => {
    it("handles model re-emitting opening bracket on continuation", async () => {
      // Build a stream that actually triggers the repetition detector.
      // The pattern must be ≤ 40 chars (windowSize=400 / minRepeats=10)
      // and repeat ≥ 10 times at the tail of the detector window.
      const goodSegment = '{"Start":0,"End":5,"Speaker":0,"Content":"Good"}';
      // 16-char pattern, fits 25 times = well within the 400-char window
      const shortPattern = '{"S":0,"E":5},  '; // 16 chars
      const loopingJson = "[" + goodSegment + "," + shortPattern.repeat(30);

      let callCount = 0;
      fetchMock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(createMockStreamResponse(loopingJson));
        }
        // Recovery: model re-emits "[{" at start of continuation
        // The service should clean this prefix via cleanContinuationPrefix
        return Promise.resolve(
          createMockStreamResponse(
            '[{"Start":5,"End":10,"Speaker":1,"Content":"Continuation works"}]',
          ),
        );
      });

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 15,
      });

      // Verify recovery was triggered (loop was detected)
      expect(callCount).toBeGreaterThanOrEqual(2);
      // Should have at least the good segment from the first call
      expect(result.segments.length).toBeGreaterThanOrEqual(1);
    });
  });

  // --------------------------------------------------------------------------
  // Malformed JSON edge cases (brace-depth extraction)
  // --------------------------------------------------------------------------

  describe("brace-depth extraction fallback", () => {
    it("extracts valid objects from badly mangled text", async () => {
      // Simulate garbled text with valid JSON objects embedded.
      // Must include a `[` for extractObjectsByDepth to find the start.
      const mangledText =
        'some garbage [ {"Start":0,"End":5,"Speaker":0,"Content":"Found me!"} more garbage {"Start":5,"End":10,"Speaker":1,"Content":"Me too!"} trailing junk';

      fetchMock.mockResolvedValueOnce(createMockStreamResponse(mangledText));

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 15,
      });

      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]!.content).toBe("Found me!");
      expect(result.segments[1]!.content).toBe("Me too!");
    });

    it("recovers an incomplete trailing object via regex field extraction", async () => {
      // The last object is cut off — should still recover Start/End
      const truncated =
        '[{"Start":0,"End":5,"Speaker":0,"Content":"Complete"},{"Start":5,"End":10,"Speaker":1,"Content":"Incomple';

      fetchMock.mockResolvedValueOnce(createMockStreamResponse(truncated));

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 15,
      });

      expect(result.segments).toHaveLength(2);
      // First segment should be fully parsed
      expect(result.segments[0]!.content).toBe("Complete");

      // Second segment recovered from the incomplete trailing object
      const recovered = result.segments[1]!;
      expect(recovered.start).toBe(5);
      expect(recovered.end).toBe(10);
      expect(recovered.speaker).toBe(1);
      expect(recovered.content).toContain("Incomple");
    });
  });

  // --------------------------------------------------------------------------
  // Full example transcription — golden test
  // --------------------------------------------------------------------------

  describe("golden test with example transcription", () => {
    it("matches expected output for the Rick & Morty example", async () => {
      const fullJson = JSON.stringify(EXAMPLE_SEGMENTS);
      fetchMock.mockResolvedValueOnce(createMockStreamResponse(fullJson));

      const result = await runTranscribe({
        audioUrl: "https://example.com/audio.wav",
        maxDurationSeconds: 160,
      });

      // Build expected segments (only those with Speaker field)
      const expected: VibeVoiceSegment[] = EXPECTED_SPEAKER_SEGMENTS.map(
        (s) => ({
          speaker: s.Speaker as number,
          start: s.Start,
          end: s.End,
          content: s.Content,
        }),
      );

      expect(result.segments).toEqual(expected);
    });
  });
});
