/**
 * Histogram calculation utility for speaker statistics.
 * Used for MOS score and segment duration distribution visualization.
 */

export interface HistogramBucket {
  rangeStart: number;
  rangeEnd: number;
  count: number;
  label: string;
}

export interface HistogramData {
  buckets: HistogramBucket[];
  min: number;
  max: number;
  bucketSize: number;
}

export interface CalculateHistogramOptions {
  bucketCount?: number;
  labelSuffix?: string;
  precision?: number;
}

const DEFAULT_BUCKET_COUNT = 10;
const DEFAULT_PRECISION = 1;

/**
 * Formats a number for bucket labels with specified precision.
 */
function formatValue(value: number, precision: number): string {
  return value.toFixed(precision);
}

/**
 * Generates a label for a histogram bucket.
 * @example formatBucketLabel(1.0, 1.5, 1, 's') => "1.0s-1.5s"
 * @example formatBucketLabel(2.0, 2.5, 1) => "2.0-2.5"
 */
function formatBucketLabel(
  rangeStart: number,
  rangeEnd: number,
  precision: number,
  suffix?: string
): string {
  const start = formatValue(rangeStart, precision);
  const end = formatValue(rangeEnd, precision);
  if (suffix) {
    return `${start}${suffix}-${end}${suffix}`;
  }
  return `${start}-${end}`;
}

/**
 * Calculates a histogram from an array of numeric values.
 *
 * @param values - Array of numbers to distribute into buckets
 * @param options - Configuration options
 * @returns HistogramData with buckets, min, max, and bucketSize
 *
 * @example
 * // MOS score distribution (1-5 scale)
 * calculateHistogram([3.2, 4.1, 3.8, 4.5], { precision: 1 })
 *
 * @example
 * // Duration distribution with suffix
 * calculateHistogram([1.5, 2.3, 3.1], { labelSuffix: 's', precision: 1 })
 */
export function calculateHistogram(
  values: number[],
  options: CalculateHistogramOptions = {}
): HistogramData {
  const {
    bucketCount = DEFAULT_BUCKET_COUNT,
    labelSuffix,
    precision = DEFAULT_PRECISION,
  } = options;

  // Handle empty array
  if (values.length === 0) {
    return {
      buckets: [],
      min: 0,
      max: 0,
      bucketSize: 0,
    };
  }

  // Calculate min and max
  const min = Math.min(...values);
  const max = Math.max(...values);

  // Handle single value or all same values (min === max)
  if (min === max) {
    // Create a single bucket containing all values
    const bucket: HistogramBucket = {
      rangeStart: min,
      rangeEnd: max,
      count: values.length,
      label: formatValue(min, precision) + (labelSuffix ?? ""),
    };
    return {
      buckets: [bucket],
      min,
      max,
      bucketSize: 0,
    };
  }

  // Calculate bucket size
  const range = max - min;
  const bucketSize = range / bucketCount;

  // Initialize buckets
  const buckets: HistogramBucket[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const rangeStart = min + i * bucketSize;
    const rangeEnd = min + (i + 1) * bucketSize;
    buckets.push({
      rangeStart,
      rangeEnd,
      count: 0,
      label: formatBucketLabel(rangeStart, rangeEnd, precision, labelSuffix),
    });
  }

  // Distribute values into buckets
  for (const value of values) {
    // Calculate bucket index
    let bucketIndex = Math.floor((value - min) / bucketSize);

    // Handle edge case: value equals max (goes into last bucket)
    if (bucketIndex >= bucketCount) {
      bucketIndex = bucketCount - 1;
    }

    buckets[bucketIndex].count++;
  }

  return {
    buckets,
    min,
    max,
    bucketSize,
  };
}
