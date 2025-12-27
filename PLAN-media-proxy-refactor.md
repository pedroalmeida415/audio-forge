# Media Proxy Refactor: On-Demand Clip Generation

## Implementation Status

| Component | Status | Location |
|-----------|--------|----------|
| FFmpeg Transcoder Service | Done | `src/services/media-proxy/ffmpeg-transcoder.ts` |
| Audio Cache Service (LRU) | Done | `src/services/media-proxy/audio-cache.ts` |
| Media Proxy API Route | Done | `src/app/api/media-proxy/route.ts` |
| Database Schema Update | Done | `src/server/db/schema.ts` |
| Clips Router Refactor | Done | `src/server/api/routers/clips.ts` |
| useClipPlayer Hook | Done | `src/hooks/use-clip-player.ts` |
| Database Migration | Done | `drizzle/migrations/0001_add_virtual_clip_status.sql` |

### New tRPC Procedures

- `clips.createClips` - Create virtual clips (no file generation)
- `clips.getClipPlaybackInfo` - Get playback info (proxy params or direct URL)
- `clips.exportClips` - Export virtual clips to actual files
- `clips.deleteClips` - Delete clips and their files (if any)

### To Apply Migration

```bash
# Apply the migration to add 'virtual' status
psql $DATABASE_URL -f drizzle/migrations/0001_add_virtual_clip_status.sql
```

---

## Problem Statement

Currently, the clipping system generates individual MP3 files for every clip:
- User selects segments → Worker extracts each segment → Each clip uploaded to R2
- Collections can have 1000+ clips = 1000+ individual files
- Massive R2 consumption: storage, Class A operations (PUT), Class B operations (GET)
- Files are often just copies of portions of the original audio

## Proposed Solution

Shift from **eager file generation** to **lazy on-demand streaming**:

1. **Clips become timestamp references** - Just store `startTime` and `endTime`
2. **Media proxy server** - Transcodes segments on-the-fly from source audio
3. **Client-side MSE playback** - Uses Media Source Extensions for seamless streaming
4. **Deferred file generation** - Only create actual files when needed (export, processing)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                             │
├─────────────────────────────────────────────────────────────────────┤
│  ClippingWorkspace                                                   │
│    ├── Timeline (waveform, segments) - uses source audio            │
│    ├── Segment Playback - uses MSE + media proxy                    │
│    └── Clip Preview - uses MSE + media proxy                        │
│                                                                      │
│  MediaSourcePlayer                                                   │
│    ├── Creates MediaSource with SourceBuffer                        │
│    ├── Fetches segments from /api/media-proxy                       │
│    └── Appends fragmented MP4/AAC chunks                            │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    /api/media-proxy (Next.js Route)                  │
├─────────────────────────────────────────────────────────────────────┤
│  Input:  storageKey, start (µs), end (µs), codec, format            │
│  Output: Fragmented MP4/AAC stream (MSE-compatible)                 │
│                                                                      │
│  Process:                                                            │
│    1. Validate request + check auth                                  │
│    2. Get/cache source audio from R2                                 │
│    3. FFmpeg transcode: seek → extract → encode → stream            │
│    4. Return with cache headers + server-timing                      │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Local Audio Cache (Server)                       │
├─────────────────────────────────────────────────────────────────────┤
│  - Downloads source audio from R2 once                               │
│  - Stores locally with TTL (e.g., 1 hour)                            │
│  - LRU eviction when cache size exceeded                             │
│  - Avoids repeated R2 downloads for same source                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema Changes

### Current `clips` Table
```sql
clips (
  id, collectionId, sourceSegmentId,
  startTime, endTime,           -- ✓ Already have timestamps
  fileId,                       -- → Make nullable (only set when exported)
  status,                       -- → New statuses needed
  ...
)
```

### Proposed Changes

```typescript
// src/server/db/schema.ts

export const clips = pgTable("clips", {
  id: uuid("id").primaryKey().defaultRandom(),
  collectionId: uuid("collection_id").notNull().references(() => collections.id),

  // Source reference (diarization segment OR custom segment)
  sourceSegmentId: text("source_segment_id"),  // nullable for custom clips
  sourceDiarizationId: uuid("source_diarization_id").references(() => diarizations.id),

  // Timestamp data (the core clip definition)
  startTime: real("start_time").notNull(),     // seconds
  endTime: real("end_time").notNull(),         // seconds

  // Generated file (only when explicitly exported/processed)
  fileId: uuid("file_id").references(() => files.id),  // nullable

  // Status reflects whether clip has been materialized to a file
  status: text("status", {
    enum: ["virtual", "exporting", "exported", "failed"]
  }).default("virtual").notNull(),

  // Metadata
  speaker: text("speaker"),
  transcript: text("transcript"),
  mosScore: real("mos_score"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

**Status Meanings:**
- `virtual` - Clip exists as timestamps only, streamed via proxy
- `exporting` - File generation in progress (for export/processing)
- `exported` - File exists in R2, can use direct URL
- `failed` - Export failed, falls back to virtual

---

## Implementation Plan

### Phase 1: Media Proxy Server

#### 1.1 Create Media Proxy API Route

**File: `src/app/api/media-proxy/route.ts`**

```typescript
// Request: GET /api/media-proxy?key=diarization/{userId}/{file}&start=260000000&end=270000000&codec=aac&format=mp4
// Response: Fragmented MP4 stream with AAC audio

export async function GET(request: NextRequest) {
  // 1. Parse and validate query params
  const { searchParams } = new URL(request.url);
  const storageKey = searchParams.get("key");
  const startMicros = parseInt(searchParams.get("start") || "0");
  const endMicros = parseInt(searchParams.get("end") || "0");
  const codec = searchParams.get("codec") || "aac";
  const format = searchParams.get("format") || "mp4";

  // 2. Authenticate user (check session owns this resource)
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response("Unauthorized", { status: 401 });

  // 3. Get source audio (from cache or R2)
  const sourcePath = await audioCache.getOrFetch(storageKey);

  // 4. Transcode segment with FFmpeg
  const startSeconds = startMicros / 1_000_000;
  const duration = (endMicros - startMicros) / 1_000_000;

  const ffmpegStream = await transcodeSegment({
    inputPath: sourcePath,
    startSeconds,
    duration,
    codec,        // "aac" for MSE compatibility
    format,       // "mp4" fragmented for MSE
  });

  // 5. Stream response with timing headers
  return new Response(ffmpegStream, {
    headers: {
      "Content-Type": "audio/mp4",
      "Cache-Control": "private, max-age=3600",
      "Server-Timing": `ffmpeg;dur=${transcodeTime}`,
    },
  });
}
```

#### 1.2 Audio Cache Service

**File: `src/services/media-proxy/audio-cache.ts`**

```typescript
interface AudioCacheConfig {
  cacheDir: string;        // /tmp/audio-cache
  maxSizeBytes: number;    // 1GB
  ttlMs: number;           // 1 hour
}

class AudioCache {
  private entries: Map<string, CacheEntry>;

  async getOrFetch(storageKey: string): Promise<string> {
    // Check if cached and not expired
    const cached = this.entries.get(storageKey);
    if (cached && !this.isExpired(cached)) {
      cached.lastAccess = Date.now();
      return cached.localPath;
    }

    // Download from R2
    const localPath = await this.downloadFromR2(storageKey);

    // Evict old entries if needed
    await this.enforceMaxSize();

    // Add to cache
    this.entries.set(storageKey, {
      localPath,
      storageKey,
      size: await getFileSize(localPath),
      createdAt: Date.now(),
      lastAccess: Date.now(),
    });

    return localPath;
  }

  private async enforceMaxSize() {
    // LRU eviction when cache exceeds maxSizeBytes
  }
}
```

#### 1.3 FFmpeg Transcoding Service

**File: `src/services/media-proxy/ffmpeg-transcoder.ts`**

```typescript
import ffmpeg from "fluent-ffmpeg";
import { PassThrough } from "stream";

interface TranscodeOptions {
  inputPath: string;
  startSeconds: number;
  duration: number;
  codec: "aac" | "mp3" | "opus";
  format: "mp4" | "webm" | "mp3";
}

export async function transcodeSegment(options: TranscodeOptions): Promise<Readable> {
  const { inputPath, startSeconds, duration, codec, format } = options;

  const outputStream = new PassThrough();

  const command = ffmpeg(inputPath)
    .setStartTime(startSeconds)
    .setDuration(duration)
    .audioCodec(codec === "aac" ? "aac" : codec)
    .audioBitrate("128k")
    .audioChannels(2)
    .audioFrequency(44100);

  // For MSE compatibility, use fragmented MP4
  if (format === "mp4") {
    command
      .format("mp4")
      .outputOptions([
        "-movflags", "frag_keyframe+empty_moov+default_base_moof",
        "-frag_duration", "1000000",  // 1 second fragments
      ]);
  }

  command
    .pipe(outputStream, { end: true })
    .on("error", (err) => outputStream.destroy(err));

  return outputStream;
}
```

---

### Phase 2: Client-Side MSE Player

#### 2.1 MediaSource Player Component

**File: `src/components/media-source-player.tsx`**

```typescript
interface MediaSourcePlayerProps {
  storageKey: string;
  startTime: number;      // seconds
  endTime: number;        // seconds
  onTimeUpdate?: (time: number) => void;
  onEnded?: () => void;
}

export function MediaSourcePlayer({
  storageKey,
  startTime,
  endTime,
  onTimeUpdate,
  onEnded,
}: MediaSourcePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);

  useEffect(() => {
    if (!audioRef.current) return;

    const mediaSource = new MediaSource();
    mediaSourceRef.current = mediaSource;
    audioRef.current.src = URL.createObjectURL(mediaSource);

    mediaSource.addEventListener("sourceopen", async () => {
      // AAC in MP4 container for best compatibility
      const mimeType = 'audio/mp4; codecs="mp4a.40.2"';
      const sourceBuffer = mediaSource.addSourceBuffer(mimeType);
      sourceBufferRef.current = sourceBuffer;

      // Fetch segment from media proxy
      const response = await fetch(
        `/api/media-proxy?` + new URLSearchParams({
          key: storageKey,
          start: String(startTime * 1_000_000),
          end: String(endTime * 1_000_000),
          codec: "aac",
          format: "mp4",
        })
      );

      const arrayBuffer = await response.arrayBuffer();
      sourceBuffer.appendBuffer(arrayBuffer);

      sourceBuffer.addEventListener("updateend", () => {
        if (!sourceBuffer.updating) {
          mediaSource.endOfStream();
        }
      });
    });

    return () => {
      URL.revokeObjectURL(audioRef.current?.src || "");
    };
  }, [storageKey, startTime, endTime]);

  return (
    <audio
      ref={audioRef}
      onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
      onEnded={onEnded}
    />
  );
}
```

#### 2.2 useSegmentPlayer Hook

**File: `src/app/(app)/app/clipping/[diarizationId]/_hooks/use-segment-player.ts`**

```typescript
// Replaces direct audio playback for segment previews

export function useSegmentPlayer(storageKey: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playSegment = useCallback(async (startTime: number, endTime: number) => {
    setIsLoading(true);
    setError(null);

    try {
      // Clean up previous playback
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }

      // Fetch segment from media proxy
      const response = await fetch(
        `/api/media-proxy?` + new URLSearchParams({
          key: storageKey,
          start: String(startTime * 1_000_000),
          end: String(endTime * 1_000_000),
          codec: "aac",
          format: "mp4",
        })
      );

      if (!response.ok) throw new Error("Failed to load segment");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      audioRef.current = new Audio(url);
      await audioRef.current.play();

    } catch (err) {
      setError(err instanceof Error ? err.message : "Playback failed");
    } finally {
      setIsLoading(false);
    }
  }, [storageKey]);

  return { playSegment, isLoading, error };
}
```

---

### Phase 3: Clip Generation Refactor

#### 3.1 Update Clip Creation (No Files)

**File: `src/server/api/routers/clips.ts`**

```typescript
// Before: enqueueGeneration creates pending clips → worker generates files
// After: createClips just stores timestamp references

createClips: protectedProcedure
  .input(z.object({
    collectionId: z.string().uuid(),
    segments: z.array(z.object({
      segmentId: z.string(),
      diarizationId: z.string().uuid(),
      startTime: z.number(),
      endTime: z.number(),
      speaker: z.string().optional(),
    })),
  }))
  .mutation(async ({ ctx, input }) => {
    const { collectionId, segments } = input;

    // Just insert clip records - no queue, no worker
    const clips = await ctx.db.insert(clipsTable).values(
      segments.map((seg) => ({
        collectionId,
        sourceSegmentId: seg.segmentId,
        sourceDiarizationId: seg.diarizationId,
        startTime: seg.startTime,
        endTime: seg.endTime,
        speaker: seg.speaker,
        status: "virtual",  // No file generated
      }))
    ).returning();

    return clips;
  }),
```

#### 3.2 Clip Playback (Via Proxy)

```typescript
getClipPlaybackUrl: protectedProcedure
  .input(z.object({ clipId: z.string().uuid() }))
  .query(async ({ ctx, input }) => {
    const clip = await ctx.db.query.clips.findFirst({
      where: eq(clips.id, input.clipId),
      with: {
        sourceDiarization: {
          with: { file: true }
        }
      }
    });

    if (!clip) throw new TRPCError({ code: "NOT_FOUND" });

    // If exported, return direct R2 URL
    if (clip.status === "exported" && clip.fileId) {
      return {
        type: "direct",
        url: await generatePresignedDownloadUrl(clip.file.storageKey),
      };
    }

    // Otherwise, return proxy params for client
    return {
      type: "proxy",
      storageKey: clip.sourceDiarization.file.storageKey,
      startTime: clip.startTime,
      endTime: clip.endTime,
    };
  }),
```

#### 3.3 Export Clips (When Files Actually Needed)

```typescript
exportClips: protectedProcedure
  .input(z.object({
    clipIds: z.array(z.string().uuid()),
  }))
  .mutation(async ({ ctx, input }) => {
    // Only now do we create actual files
    // Enqueue to worker for batch processing

    await ctx.db.update(clips)
      .set({ status: "exporting" })
      .where(inArray(clips.id, input.clipIds));

    for (const clipId of input.clipIds) {
      await clipQueue.add("export-clip", { clipId });
    }

    return { queued: input.clipIds.length };
  }),
```

---

### Phase 4: Migration & Backward Compatibility

#### 4.1 Database Migration

```typescript
// drizzle/migrations/XXXX_add_virtual_clips.ts

export async function up(db: Database) {
  // Add new column for source diarization reference
  await db.execute(sql`
    ALTER TABLE clips
    ADD COLUMN source_diarization_id UUID REFERENCES diarizations(id)
  `);

  // Update status enum to include 'virtual'
  await db.execute(sql`
    ALTER TABLE clips
    ALTER COLUMN status TYPE TEXT
  `);

  // Make fileId nullable
  await db.execute(sql`
    ALTER TABLE clips
    ALTER COLUMN file_id DROP NOT NULL
  `);

  // Backfill source_diarization_id from existing clips
  await db.execute(sql`
    UPDATE clips c
    SET source_diarization_id = (
      SELECT d.id FROM diarizations d
      WHERE d.output @> jsonb_build_array(jsonb_build_object('id', c.source_segment_id))
    )
    WHERE c.source_diarization_id IS NULL
  `);
}
```

#### 4.2 Backward Compatibility

Existing clips with `fileId` continue to work:
- Status `exported` → use direct R2 URL
- Status `virtual` → use media proxy
- Gradual migration: new clips are virtual, old clips keep files

---

## File Structure

```
src/
├── app/
│   └── api/
│       └── media-proxy/
│           └── route.ts           # Main proxy endpoint
├── services/
│   └── media-proxy/
│       ├── index.ts               # Service barrel export
│       ├── audio-cache.ts         # LRU cache for source audio
│       ├── ffmpeg-transcoder.ts   # FFmpeg streaming transcoder
│       └── types.ts               # Shared types
├── components/
│   └── media-source-player.tsx    # MSE-based audio player
└── app/(app)/app/clipping/
    └── [diarizationId]/
        └── _hooks/
            └── use-segment-player.ts  # Hook for segment playback
```

---

## Performance Considerations

### Server-Side
1. **Audio Cache**: Prevents repeated R2 downloads
   - TTL: 1 hour (configurable)
   - Max size: 1GB (LRU eviction)
   - Key: storageKey

2. **FFmpeg Optimization**:
   - Use `-ss` before `-i` for fast seeking
   - Fragment MP4 for streaming (no need to wait for full transcode)
   - Consider prebuilt FFmpeg with minimal codecs

3. **Response Caching**:
   - Cache transcoded segments by hash(storageKey + start + end)
   - Short TTL (5-15 minutes) to balance memory vs repeated requests

### Client-Side
1. **Preload Adjacent Segments**: When playing a clip, preload ±1 segment
2. **Buffering Strategy**: Show loading state while fetching
3. **Fallback**: If MSE not supported, fall back to full segment fetch

---

## Security Considerations

1. **Authentication**: All proxy requests require valid session
2. **Authorization**: Verify user owns the diarization/file being accessed
3. **Rate Limiting**: Prevent abuse of transcoding resources
4. **Input Validation**: Sanitize time ranges, prevent path traversal in storageKey
5. **Resource Limits**: Max segment duration (e.g., 5 minutes), timeout FFmpeg

---

## Cost Analysis

### Before (Eager Generation)
- 1000 clips × 30s average × 192kbps = ~720MB storage
- 1000 PUT operations (Class A)
- 1000× GET operations for playback (Class B)

### After (Lazy Streaming)
- 0 additional storage (clips are just DB rows)
- 0 PUT operations for clips
- Compute cost for transcoding (but this is typically cheaper than storage)
- Source file downloaded once and cached

**Expected Savings**: 95%+ reduction in R2 storage and operations

---

## Implementation Order

1. **Phase 1.3**: FFmpeg transcoder service (foundation)
2. **Phase 1.2**: Audio cache service
3. **Phase 1.1**: Media proxy API route
4. **Phase 2.2**: useSegmentPlayer hook
5. **Phase 3.1**: Update clip creation to skip file generation
6. **Phase 3.2**: Update clip playback to use proxy
7. **Phase 4.1**: Database migration
8. **Phase 2.1**: MediaSourcePlayer component (optional, for advanced streaming)
9. **Phase 3.3**: Export functionality (for when files are actually needed)

---

## Open Questions

1. **MSE Browser Support**: Safari has quirks with MSE - need fallback?
2. **Serverless Deployment**: If using Vercel, FFmpeg needs custom runtime
3. **Concurrent Requests**: How many simultaneous transcodes to allow?
4. **Segment Caching**: Cache transcoded segments or always transcode on-the-fly?
5. **Export Format**: Keep MP3 or switch to AAC/M4A for exports?
