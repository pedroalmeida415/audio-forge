import { describe, expect, it } from "vitest";
import { calculateHistogram } from "../histogram";

describe("calculateHistogram", () => {
  describe("normal distribution", () => {
    it("distributes values into correct buckets", () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = calculateHistogram(values, { bucketCount: 5 });

      expect(result.min).toBe(1);
      expect(result.max).toBe(10);
      expect(result.buckets).toHaveLength(5);
      expect(result.bucketSize).toBeCloseTo(1.8); // (10-1)/5
    });

    it("counts values correctly in each bucket", () => {
      // Values: 0-2 range, 5 buckets, each bucket is 0.4 wide
      const values = [0, 0.3, 0.5, 1.0, 1.5, 2.0];
      const result = calculateHistogram(values, { bucketCount: 5 });

      // Bucket 0: 0-0.4 (values: 0, 0.3) = 2
      // Bucket 1: 0.4-0.8 (values: 0.5) = 1
      // Bucket 2: 0.8-1.2 (values: 1.0) = 1
      // Bucket 3: 1.2-1.6 (values: 1.5) = 1
      // Bucket 4: 1.6-2.0 (values: 2.0) = 1
      const totalCount = result.buckets.reduce((sum, b) => sum + b.count, 0);
      expect(totalCount).toBe(values.length);
    });

    it("places max value in last bucket", () => {
      const values = [1, 5, 10];
      const result = calculateHistogram(values, { bucketCount: 3 });

      // Max value (10) should be in the last bucket
      const lastBucket = result.buckets[result.buckets.length - 1];
      expect(lastBucket?.count).toBeGreaterThanOrEqual(1);
    });
  });

  describe("edge cases", () => {
    it("handles empty array", () => {
      const result = calculateHistogram([]);

      expect(result.buckets).toHaveLength(0);
      expect(result.min).toBe(0);
      expect(result.max).toBe(0);
      expect(result.bucketSize).toBe(0);
    });

    it("handles single value", () => {
      const result = calculateHistogram([5.5], { precision: 2 });

      expect(result.buckets).toHaveLength(1);
      expect(result.buckets[0]?.count).toBe(1);
      expect(result.buckets[0]?.rangeStart).toBe(5.5);
      expect(result.buckets[0]?.rangeEnd).toBe(5.5);
      expect(result.min).toBe(5.5);
      expect(result.max).toBe(5.5);
      expect(result.bucketSize).toBe(0);
    });

    it("handles all same values", () => {
      const result = calculateHistogram([3, 3, 3, 3, 3]);

      expect(result.buckets).toHaveLength(1);
      expect(result.buckets[0]?.count).toBe(5);
      expect(result.buckets[0]?.rangeStart).toBe(3);
      expect(result.buckets[0]?.rangeEnd).toBe(3);
      expect(result.bucketSize).toBe(0);
    });

    it("handles negative values", () => {
      const values = [-10, -5, 0, 5, 10];
      const result = calculateHistogram(values, { bucketCount: 4 });

      expect(result.min).toBe(-10);
      expect(result.max).toBe(10);
      expect(result.buckets).toHaveLength(4);
      expect(result.bucketSize).toBe(5); // (10-(-10))/4
    });

    it("handles two distinct values", () => {
      const result = calculateHistogram([1, 10], { bucketCount: 3 });

      expect(result.min).toBe(1);
      expect(result.max).toBe(10);
      expect(result.buckets).toHaveLength(3);
      // First value goes to first bucket, last value goes to last bucket
      expect(result.buckets[0]?.count).toBe(1);
      expect(result.buckets[2]?.count).toBe(1);
    });
  });

  describe("bucket label formatting", () => {
    it("formats labels without suffix", () => {
      const result = calculateHistogram([1, 2, 3], {
        bucketCount: 2,
        precision: 1,
      });

      // Labels should be "start-end" format
      expect(result.buckets[0]?.label).toMatch(/^\d+\.\d+-\d+\.\d+$/);
    });

    it("formats labels with suffix", () => {
      const result = calculateHistogram([1, 2, 3], {
        bucketCount: 2,
        precision: 1,
        labelSuffix: "s",
      });

      // Labels should be "starts-ends" format
      expect(result.buckets[0]?.label).toMatch(/^\d+\.\d+s-\d+\.\d+s$/);
    });

    it("respects precision setting", () => {
      const result = calculateHistogram([1.12345, 2.98765], {
        bucketCount: 2,
        precision: 2,
      });

      // Check that labels use 2 decimal places
      const label = result.buckets[0]?.label ?? "";
      const parts = label.split("-");
      expect(parts[0]).toMatch(/^\d+\.\d{2}$/);
      expect(parts[1]).toMatch(/^\d+\.\d{2}$/);
    });

    it("uses default precision of 1", () => {
      const result = calculateHistogram([1.555, 2.555]);

      const label = result.buckets[0]?.label ?? "";
      const parts = label.split("-");
      expect(parts[0]).toMatch(/^\d+\.\d$/);
    });

    it("formats single value bucket label correctly", () => {
      const result = calculateHistogram([5.5], {
        precision: 1,
        labelSuffix: "ms",
      });

      expect(result.buckets[0]?.label).toBe("5.5ms");
    });

    it("formats single value bucket without suffix", () => {
      const result = calculateHistogram([3.0], { precision: 1 });

      expect(result.buckets[0]?.label).toBe("3.0");
    });
  });

  describe("default options", () => {
    it("uses default bucket count of 10", () => {
      const values = Array.from({ length: 100 }, (_, i) => i);
      const result = calculateHistogram(values);

      expect(result.buckets).toHaveLength(10);
    });

    it("uses default precision of 1", () => {
      const result = calculateHistogram([0, 10]);

      const label = result.buckets[0]?.label ?? "";
      expect(label).toContain("."); // Has decimal
      const decimalPart = label.split("-")[0]?.split(".")[1];
      expect(decimalPart).toHaveLength(1);
    });
  });

  describe("bucket range properties", () => {
    it("sets correct rangeStart and rangeEnd for each bucket", () => {
      const result = calculateHistogram([0, 10], { bucketCount: 5 });

      expect(result.buckets[0]?.rangeStart).toBe(0);
      expect(result.buckets[0]?.rangeEnd).toBe(2);
      expect(result.buckets[1]?.rangeStart).toBe(2);
      expect(result.buckets[1]?.rangeEnd).toBe(4);
      expect(result.buckets[4]?.rangeStart).toBe(8);
      expect(result.buckets[4]?.rangeEnd).toBe(10);
    });

    it("buckets are contiguous", () => {
      const result = calculateHistogram([1, 100], { bucketCount: 10 });

      for (let i = 0; i < result.buckets.length - 1; i++) {
        const current = result.buckets[i];
        const next = result.buckets[i + 1];
        expect(current?.rangeEnd).toBeCloseTo(next?.rangeStart ?? 0);
      }
    });
  });
});
