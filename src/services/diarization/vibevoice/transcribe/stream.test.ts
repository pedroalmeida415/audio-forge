import { describe, expect, it } from "vitest";
import { checkRepetition } from "./stream.utils";

// ============================================================================
// Test data
// ============================================================================

/** Real-world transcription JSON (Rick & Morty clip) — must NOT trigger. */
const REALISTIC_TRANSCRIPTION = JSON.stringify([
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
]);

// ============================================================================
// Tests
// ============================================================================

describe.skip("checkRepetition", () => {
  // --------------------------------------------------------------------------
  // True negatives — must NOT fire
  // --------------------------------------------------------------------------

  describe("does NOT fire on valid content", () => {
    it("returns looping: false for realistic transcription JSON", () => {
      const result = checkRepetition(REALISTIC_TRANSCRIPTION);
      expect(result.looping).toBe(false);
    });

    it("returns looping: false for text shorter than MIN_TOTAL_CHARS", () => {
      expect(checkRepetition("").looping).toBe(false);
      expect(checkRepetition("short text").looping).toBe(false);
      expect(checkRepetition("a".repeat(59)).looping).toBe(false);
    });

    it("returns looping: false for segments with similar structure but different content", () => {
      // Three segments that share JSON keys but have different values
      const text = JSON.stringify([
        { Start: 0, End: 5, Speaker: 0, Content: "Hello there" },
        { Start: 5, End: 10, Speaker: 0, Content: "How are you" },
        { Start: 10, End: 15, Speaker: 1, Content: "I am fine" },
      ]);
      expect(checkRepetition(text).looping).toBe(false);
    });

    it("returns looping: false for many short segments with the same speaker", () => {
      // Same speaker, same structure, but timestamps differ → not a loop
      const segments = Array.from({ length: 20 }, (_, i) => ({
        Start: i * 2,
        End: i * 2 + 1.5,
        Speaker: 0,
        Content: `Word${i}`,
      }));
      expect(checkRepetition(JSON.stringify(segments)).looping).toBe(false);
    });

    it("returns looping: false for text with natural word repetition", () => {
      // Someone stuttering or repeating a word naturally
      const text =
        '[{"Start":0,"End":5,"Speaker":0,"Content":"I I I I think we should go go go now"}]';
      expect(checkRepetition(text).looping).toBe(false);
    });

    it("returns looping: false for longer naturally-repetitive speech", () => {
      // A longer passage with common repeated phrases that should not trigger
      const text = [
        'And then he said "okay okay okay" and she was like "yeah yeah"',
        "and then we went to the store and then we went to the park",
        'and then we went home and she said "okay okay" again',
        'and I was like "you know what I mean" and he was like',
        '"you know what I mean" too, it was really funny you know',
      ].join(" ");
      expect(checkRepetition(text).looping).toBe(false);
    });

    it("returns looping: false for structurally similar segments with incrementing timestamps", () => {
      // This is the most critical false-positive scenario in production:
      // JSON segments share keys/structure but have different values
      const segments = Array.from({ length: 10 }, (_, i) => ({
        Start: i * 5,
        End: i * 5 + 4.5,
        Speaker: i % 3,
        Content: `Sentence number ${i + 1} has unique words here`,
      }));
      expect(checkRepetition(JSON.stringify(segments)).looping).toBe(false);
    });

    it("returns looping: false for segments that share the same Content but differ in timestamps", () => {
      // Model might legitimately produce the same phrase at different times
      const text = JSON.stringify([
        { Start: 0, End: 2, Speaker: 0, Content: "Okay" },
        { Start: 10, End: 12, Speaker: 0, Content: "Okay" },
        { Start: 20, End: 22, Speaker: 0, Content: "Okay" },
      ]);
      expect(checkRepetition(text).looping).toBe(false);
    });

    it("returns looping: false when streaming the transcription incrementally", () => {
      // Simulate the check running on every growing prefix of valid text
      const fullText = REALISTIC_TRANSCRIPTION;
      for (let i = 10; i < fullText.length; i += 10) {
        const prefix = fullText.slice(0, i);
        const result = checkRepetition(prefix);
        expect(result.looping, `False positive at position ${i}`).toBe(false);
      }
    });
  });

  // --------------------------------------------------------------------------
  // True positives — MUST fire
  // --------------------------------------------------------------------------

  describe("detects real hallucination loops", () => {
    it("detects a full segment object repeated in raw stream text", () => {
      // In a real hallucination, the model emits the same object back-to-back
      // as raw text (no separating comma/bracket resets the period)
      const segment =
        '{"Start":55.35,"End":56.16,"Speaker":3,"Content":"Come on!"}';
      const text = segment.repeat(3);
      const result = checkRepetition(text);
      expect(result.looping).toBe(true);
    });

    it("detects identical segments separated by commas in ongoing stream", () => {
      // In a real hallucination, the stream keeps emitting — no closing bracket
      const segment =
        '{"Start":55.35,"End":56.16,"Speaker":3,"Content":"Come on!"},';
      const text = `[${segment}${segment}${segment}`;
      const result = checkRepetition(text);
      expect(result.looping).toBe(true);
    });

    it("detects a repeated segment with a partial trailing copy", () => {
      const segment =
        '{"Start":10,"End":15,"Speaker":0,"Content":"Hello world"}';
      const partial = '{"Start":10,"End":15,"Sp';
      const text = `[${segment},${segment},${partial}`;
      const result = checkRepetition(text);
      expect(result.looping).toBe(true);
    });

    it("detects short repeating JSON fragments", () => {
      // e.g. model outputs garbled partial objects
      const pattern = '{"S":1,"E":2},';
      const text = `[{"Start":0,"End":5}${pattern.repeat(10)}`;
      const result = checkRepetition(text);
      expect(result.looping).toBe(true);
    });

    it("detects single character repeated 60+ times", () => {
      const text = `prefix${"x".repeat(65)}`;
      const result = checkRepetition(text);
      expect(result.looping).toBe(true);
    });

    it("detects repeating word phrases in raw text", () => {
      const text = "oh my god ".repeat(15);
      const result = checkRepetition(text);
      expect(result.looping).toBe(true);
    });

    it("detects identical segments appended as raw stream text", () => {
      const good = '[{"Start":0,"End":5,"Speaker":0,"Content":"Good"},';
      const repeated = '{"Start":5,"End":10,"Speaker":0,"Content":"Bad"}';
      const text = good + `${repeated},`.repeat(3);
      const result = checkRepetition(text);
      expect(result.looping).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // goodEndPos accuracy
  // --------------------------------------------------------------------------

  describe("goodEndPos calculation", () => {
    it("places goodEndPos after exactly one copy of the pattern", () => {
      const prefix = "UNIQUE_PREFIX_";
      // Use a non-periodic pattern so the detected period matches the full pattern length
      const pattern = "The quick brown fox!";
      const text = prefix + pattern.repeat(4);
      const result = checkRepetition(text);

      expect(result.looping).toBe(true);
      if (result.looping) {
        // goodEndPos = repetitionStart + period = prefix.length + pattern.length
        expect(result.goodEndPos).toBe(prefix.length + pattern.length);
      }
    });

    it("does not keep a copy for unmeaningful patterns", () => {
      // Pattern with < 3 unique chars → unmeaningful → no copy kept
      const text = `prefix_${"ab".repeat(40)}`;
      const result = checkRepetition(text);

      expect(result.looping).toBe(true);
      if (result.looping) {
        // goodEndPos should be at the very start of repetition (no copy kept)
        expect(result.goodEndPos).toBeLessThanOrEqual("prefix_".length);
      }
    });

    it("keeps one copy for meaningful patterns", () => {
      const prefix = "PREFIX";
      const pattern =
        '{"Start":10,"End":15,"Speaker":0,"Content":"Hello world"},';
      const text = prefix + pattern.repeat(3);
      const result = checkRepetition(text);

      expect(result.looping).toBe(true);
      if (result.looping) {
        // Should keep one copy of the pattern
        expect(result.goodEndPos).toBeGreaterThan(prefix.length);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------

  describe("edge cases", () => {
    it("handles text exactly at MIN_TOTAL_CHARS boundary", () => {
      // 60 identical chars = exactly at threshold
      const text = "a".repeat(60);
      const result = checkRepetition(text);
      expect(result.looping).toBe(true);
    });

    it("handles text just below MIN_TOTAL_CHARS boundary", () => {
      const text = "a".repeat(59);
      expect(checkRepetition(text).looping).toBe(false);
    });

    it("handles text larger than WINDOW_SIZE", () => {
      // Genuinely non-periodic prefix that pushes total length past WINDOW_SIZE
      let uniquePrefix = "";
      for (let i = 0; i < 200; i++) {
        uniquePrefix += String.fromCharCode(65 + (i % 26)) + i.toString(36);
      }
      const pattern = "REPEAT_THIS_SEGMENT_OK,";
      const text = uniquePrefix + pattern.repeat(5);
      const result = checkRepetition(text);
      expect(result.looping).toBe(true);
    });

    it("detects repetition when period equals maxPeriod", () => {
      // Build text where the repeating unit is exactly maxPeriod = floor(n / MIN_COPIES)
      // For a string of length L with MIN_COPIES=2, maxPeriod = floor(L/2)
      // So 2 copies of a 60-char pattern = 120 chars, period=60 = floor(120/2)
      const pattern =
        "A_long_enough_pattern_to_reach_sixty_characters_exactly!!!!_";
      expect(pattern.length).toBe(60);
      const text = pattern.repeat(2);
      const result = checkRepetition(text);
      expect(result.looping).toBe(true);
    });

    it("does not fire on repetition in the middle followed by unique content", () => {
      // Repetition happened earlier but stopped — tail is truly unique
      const repeated = "abc".repeat(30); // 90 chars of repetition
      // Use non-repeating content so the tail itself isn't periodic
      let uniqueTail = "";
      for (let i = 0; i < 100; i++) {
        uniqueTail += String.fromCharCode(65 + (i % 26)) + i;
      }
      const text = repeated + uniqueTail;
      // The consecutive match from the tail breaks immediately at unique content
      expect(checkRepetition(text).looping).toBe(false);
    });
  });
});
