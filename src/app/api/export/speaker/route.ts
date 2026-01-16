import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import {
  type AudioFormat,
  type BitDepth,
  type Channels,
  convertAudio,
  type SampleRate,
} from "~/lib/export/ffmpeg-convert";
import { createZipStream, generateMetadataCSV } from "~/lib/export/stream-zip";
import { auth } from "~/server/better-auth";
import { db } from "~/server/db";
import { projects, segments, speakers } from "~/server/db/schema";
import { getSourceCache } from "~/services/media-proxy/source-cache";

// ============================================================================
// Types
// ============================================================================

interface ExportParams {
  speakerId: string;
  format: AudioFormat;
  sampleRate: SampleRate;
  bitDepth: BitDepth;
  channels: Channels;
  // Filter params (optional)
  minDuration?: number;
  maxDuration?: number;
  minMos?: number;
  maxMos?: number;
  hasTranscription?: boolean;
}

interface ClipWithTranscription {
  clipId: string;
  segmentId: string;
  storageKey: string;
  transcription: string;
  duration: number;
}

// ============================================================================
// Helpers
// ============================================================================

function parseQueryParams(params: URLSearchParams): ExportParams | null {
  const speakerId = params.get("speakerId");
  const format = params.get("format") as AudioFormat | null;
  const sampleRate = params.get("sampleRate");
  const bitDepth = params.get("bitDepth");
  const channels = params.get("channels");

  if (!speakerId || !format || !sampleRate || !channels) {
    return null;
  }

  const sampleRateNum = Number(sampleRate) as SampleRate;
  const bitDepthNum = (bitDepth ? Number(bitDepth) : 16) as BitDepth;
  const channelsNum = Number(channels) as Channels;

  // Validate values
  const validFormats: AudioFormat[] = ["wav", "flac", "mp3"];
  const validSampleRates: SampleRate[] = [8000, 16000, 22050, 44100, 48000];
  const validBitDepths: BitDepth[] = [16, 24];
  const validChannels: Channels[] = [1, 2];

  if (!validFormats.includes(format)) return null;
  if (!validSampleRates.includes(sampleRateNum)) return null;
  if (!validBitDepths.includes(bitDepthNum)) return null;
  if (!validChannels.includes(channelsNum)) return null;

  // Parse optional filter params
  const minDuration = params.get("minDuration");
  const maxDuration = params.get("maxDuration");
  const minMos = params.get("minMos");
  const maxMos = params.get("maxMos");
  const hasTranscription = params.get("hasTranscription");

  return {
    speakerId,
    format,
    sampleRate: sampleRateNum,
    bitDepth: bitDepthNum,
    channels: channelsNum,
    minDuration: minDuration ? Number(minDuration) : undefined,
    maxDuration: maxDuration ? Number(maxDuration) : undefined,
    minMos: minMos ? Number(minMos) : undefined,
    maxMos: maxMos ? Number(maxMos) : undefined,
    hasTranscription:
      hasTranscription === "true"
        ? true
        : hasTranscription === "false"
          ? false
          : undefined,
  };
}

async function verifyOwnership(
  speakerId: string,
  userId: string,
): Promise<{
  speaker: typeof speakers.$inferSelect;
  projectId: string;
} | null> {
  // Get the speaker
  const speaker = await db.query.speakers.findFirst({
    where: eq(speakers.id, speakerId),
  });

  if (!speaker) {
    return null;
  }

  // Verify ownership through project
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, speaker.projectId),
  });

  if (!project || project.userId !== userId) {
    return null;
  }

  return { speaker, projectId: project.id };
}

async function fetchClipsWithTranscriptions(
  speakerId: string,
  filterParams: Partial<ExportParams>,
): Promise<ClipWithTranscription[]> {
  // Get all segments for this speaker with their clips
  const speakerSegments = await db.query.segments.findMany({
    where: eq(segments.speakerId, speakerId),
    with: {
      clip: true,
    },
  });

  // Filter to only segments with completed clips and transcriptions
  const clipsWithTranscriptions: ClipWithTranscription[] = [];

  for (const segment of speakerSegments) {
    // Skip segments without transcription (AC-9.7: only export clips with transcriptions)
    if (!segment.transcription) {
      continue;
    }

    // Skip segments without completed clips
    if (
      !segment.clip ||
      segment.clip.status !== "completed" ||
      !segment.clip.storageKey
    ) {
      continue;
    }

    const clipDuration =
      segment.clip.duration ?? segment.endTime - segment.startTime;

    // Apply duration filters
    if (
      filterParams.minDuration !== undefined &&
      clipDuration < filterParams.minDuration
    ) {
      continue;
    }
    if (
      filterParams.maxDuration !== undefined &&
      clipDuration > filterParams.maxDuration
    ) {
      continue;
    }

    // Apply MOS score filters
    if (filterParams.minMos !== undefined && segment.clip.mosScore !== null) {
      if (segment.clip.mosScore < filterParams.minMos) {
        continue;
      }
    }
    if (filterParams.maxMos !== undefined && segment.clip.mosScore !== null) {
      if (segment.clip.mosScore > filterParams.maxMos) {
        continue;
      }
    }

    clipsWithTranscriptions.push({
      clipId: segment.clip.id,
      segmentId: segment.id,
      storageKey: segment.clip.storageKey,
      transcription: segment.transcription,
      duration: clipDuration,
    });
  }

  return clipsWithTranscriptions;
}

function generateFilename(index: number, extension: string): string {
  // LJSpeech naming convention: 6-digit padded numbers
  const paddedIndex = String(index + 1).padStart(6, "0");
  return `${paddedIndex}.${extension}`;
}

// ============================================================================
// Route Handler
// ============================================================================

/**
 * Speaker Export API Endpoint
 *
 * GET /api/export/speaker?speakerId=X&format=wav&sampleRate=22050&bitDepth=16&channels=1
 *
 * Streams a ZIP file containing:
 * - wavs/ folder with converted audio files
 * - metadata.csv with LJSpeech-format pipe-delimited transcriptions
 *
 * Query Parameters:
 * - speakerId: UUID of the speaker to export
 * - format: Audio format (wav, flac, mp3)
 * - sampleRate: Sample rate in Hz (8000, 16000, 22050, 44100, 48000)
 * - bitDepth: Bit depth for WAV (16, 24) - optional, defaults to 16
 * - channels: Number of channels (1 = mono, 2 = stereo)
 * - minDuration: Minimum clip duration filter (optional)
 * - maxDuration: Maximum clip duration filter (optional)
 * - minMos: Minimum MOS score filter (optional)
 * - maxMos: Maximum MOS score filter (optional)
 * - hasTranscription: Filter by transcription presence (optional) - always true for export
 */
export async function GET(request: NextRequest) {
  // 1. Auth - verify user is logged in
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse and validate query params
  const exportParams = parseQueryParams(request.nextUrl.searchParams);
  if (!exportParams) {
    return NextResponse.json(
      { error: "Invalid export parameters" },
      { status: 400 },
    );
  }

  // 3. Verify ownership of the speaker
  const ownershipResult = await verifyOwnership(
    exportParams.speakerId,
    session.user.id,
  );
  if (!ownershipResult) {
    return NextResponse.json(
      { error: "Speaker not found or access denied" },
      { status: 403 },
    );
  }

  const { speaker } = ownershipResult;

  // 4. Fetch clips with transcriptions (applying filters)
  const clipsToExport = await fetchClipsWithTranscriptions(
    exportParams.speakerId,
    exportParams,
  );

  if (clipsToExport.length === 0) {
    return NextResponse.json(
      { error: "No clips with transcriptions found for export" },
      { status: 404 },
    );
  }

  // 5. Create ZIP stream
  const { stream, addFile, addMetadataCSV, finalize } = createZipStream();

  // 6. Process clips asynchronously
  const sourceCache = getSourceCache();
  const metadataEntries: Array<{ filename: string; transcription: string }> =
    [];
  const extension = exportParams.format;

  // Process clips in background (async iteration)
  (async () => {
    try {
      for (let i = 0; i < clipsToExport.length; i++) {
        const clip = clipsToExport[i];
        if (!clip) continue;

        const filename = generateFilename(i, extension);

        try {
          // Download clip from R2 (via cache)
          const localPath = await sourceCache.getOrDownload(clip.storageKey);
          const inputBuffer = await readFile(localPath);

          // Convert to target format
          const { buffer: convertedBuffer } = await convertAudio(inputBuffer, {
            format: exportParams.format,
            sampleRate: exportParams.sampleRate,
            bitDepth: exportParams.bitDepth,
            channels: exportParams.channels,
          });

          // Add to ZIP in wavs/ folder (LJSpeech convention)
          addFile({
            name: `wavs/${filename}`,
            data: convertedBuffer,
          });

          // Track for metadata
          metadataEntries.push({
            filename: filename,
            transcription: clip.transcription,
          });
        } catch (error) {
          console.error(
            `[export] Failed to process clip ${clip.clipId}:`,
            error,
          );
          // Continue with other clips
        }
      }

      // 7. Generate and add metadata.csv (LJSpeech format: pipe-delimited)
      const metadataCSV = generateMetadataCSV(metadataEntries);
      addMetadataCSV("metadata.csv", metadataCSV);

      // 8. Finalize the archive
      finalize();
    } catch (error) {
      console.error("[export] Error during ZIP creation:", error);
      // Archive will be incomplete but we can't abort the stream
    }
  })();

  // 9. Return streaming response
  const speakerName = speaker.name.replace(/[^a-zA-Z0-9-_]/g, "_");
  const downloadFilename = `${speakerName}_export.zip`;

  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${downloadFilename}"`,
      "Cache-Control": "no-cache",
    },
  });
}
