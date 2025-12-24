/**
 * Parser for audiowaveform .dat binary format.
 *
 * The audiowaveform tool (BBC) generates binary waveform data with this structure:
 *
 * Version 1 Header (20 bytes):
 * - version (int32)        - Format version (1 or 2)
 * - flags (uint32)         - Bit 0: 0 = 16-bit, 1 = 8-bit resolution
 * - sampleRate (int32)     - Original audio sample rate
 * - samplesPerPixel (int32)- Samples per peak point
 * - length (uint32)        - Number of min/max pairs per channel
 *
 * Version 2 Header (24 bytes):
 * - Same as v1, plus:
 * - channels (int32)       - Number of audio channels
 *
 * Data (variable):
 * - Alternating min/max values, interleaved by channel
 *
 * @see https://github.com/bbc/audiowaveform/blob/master/doc/DataFormat.md
 */

export interface WaveformDatHeader {
  version: number;
  flags: number;
  sampleRate: number;
  samplesPerPixel: number;
  length: number;
  channels: number;
}

export interface WaveformDatData {
  header: WaveformDatHeader;
  /** Normalized peaks (0-1), reduced from min/max pairs to single absolute max */
  peaks: Float32Array;
}

const HEADER_SIZE_V1 = 20;
const HEADER_SIZE_V2 = 24;

/**
 * Parse an audiowaveform .dat binary file into normalized peaks.
 *
 * @param buffer - ArrayBuffer containing the .dat file contents
 * @returns Parsed header and normalized peak data
 * @throws Error if the buffer is too small or has invalid format
 */
export function parseWaveformDat(buffer: ArrayBuffer): WaveformDatData {
  if (buffer.byteLength < HEADER_SIZE_V1) {
    throw new Error(
      `Invalid .dat file: buffer too small (${buffer.byteLength} bytes, need at least ${HEADER_SIZE_V1})`,
    );
  }

  const view = new DataView(buffer);

  // Read version first to determine header size
  const version = view.getInt32(0, true);

  // Validate version
  if (version !== 1 && version !== 2) {
    throw new Error(
      `Unsupported .dat version: ${version} (expected 1 or 2)`,
    );
  }

  const headerSize = version === 1 ? HEADER_SIZE_V1 : HEADER_SIZE_V2;

  if (buffer.byteLength < headerSize) {
    throw new Error(
      `Invalid .dat file: buffer too small for v${version} header (${buffer.byteLength} bytes, need ${headerSize})`,
    );
  }

  // Read header (little-endian)
  const header: WaveformDatHeader = {
    version,
    flags: view.getUint32(4, true),
    sampleRate: view.getInt32(8, true),
    samplesPerPixel: view.getInt32(12, true),
    length: view.getUint32(16, true),
    channels: version === 2 ? view.getInt32(20, true) : 1,
  };

  console.log("[parseWaveformDat] Parsed header:", header);
  console.log("[parseWaveformDat] Buffer size:", buffer.byteLength);

  // Determine bit depth from flags (bit 0: 0 = 16-bit, 1 = 8-bit)
  const is8Bit = (header.flags & 0x1) === 1;
  const bytesPerValue = is8Bit ? 1 : 2;

  // Each point has min/max pair per channel
  const valuesPerPoint = 2 * header.channels;
  const dataSize = header.length * valuesPerPoint * bytesPerValue;

  console.log("[parseWaveformDat] Calculated:", {
    is8Bit,
    bytesPerValue,
    channels: header.channels,
    valuesPerPoint,
    dataSize,
    expectedSize: headerSize + dataSize,
  });

  const expectedSize = headerSize + dataSize;
  if (buffer.byteLength < expectedSize) {
    throw new Error(
      `Invalid .dat file: buffer too small for declared length (${buffer.byteLength} bytes, need ${expectedSize})`,
    );
  }

  // Parse peaks - convert min/max pairs to single normalized absolute max
  // For multi-channel, we take the max across all channels
  const peaks = new Float32Array(header.length);
  let globalMax = 0;

  for (let i = 0; i < header.length; i++) {
    // Each point has min/max pairs for each channel, interleaved
    const pointOffset = headerSize + i * valuesPerPoint * bytesPerValue;

    let pointMax = 0;

    // Iterate over channels and find the max absolute value
    for (let ch = 0; ch < header.channels; ch++) {
      const channelOffset = pointOffset + ch * 2 * bytesPerValue;

      let min: number;
      let max: number;

      if (is8Bit) {
        min = view.getInt8(channelOffset);
        max = view.getInt8(channelOffset + 1);
      } else {
        min = view.getInt16(channelOffset, true);
        max = view.getInt16(channelOffset + 2, true);
      }

      const absMax = Math.max(Math.abs(min), Math.abs(max));
      if (absMax > pointMax) {
        pointMax = absMax;
      }
    }

    peaks[i] = pointMax;

    if (pointMax > globalMax) {
      globalMax = pointMax;
    }
  }

  // Normalize to 0-1 range
  if (globalMax > 0) {
    for (let i = 0; i < peaks.length; i++) {
      peaks[i] = peaks[i] / globalMax;
    }
  }

  return { header, peaks };
}

/**
 * Calculate the duration of the audio from .dat header.
 *
 * @param header - Parsed .dat header
 * @returns Duration in seconds
 */
export function calculateDurationFromDat(header: WaveformDatHeader): number {
  return (header.length * header.samplesPerPixel) / header.sampleRate;
}
