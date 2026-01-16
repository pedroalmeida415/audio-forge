---
spec: speaker-page
phase: research
created: 2026-01-15
---

# Research: speaker-page

## Executive Summary

The speaker page feature is feasible with the current architecture. The project already has BullMQ queue infrastructure, media-proxy for audio streaming, FFmpeg capabilities via workers, and R2 storage integration. Key additions needed: clips table schema, transcription column on segments, processing queue service extension, and streaming ZIP export endpoint. LJSpeech format is well-documented and straightforward to implement.

## External Research

### LJSpeech Dataset Format Specification

Source: [The LJ Speech Dataset](https://keithito.com/LJ-Speech-Dataset/)

**Folder Structure:**
```
LJSpeech-1.1/
  metadata.csv
  wavs/
    LJ001-0001.wav
    LJ001-0002.wav
    ...
```

**Audio Requirements:**
- Single-channel (mono)
- 16-bit PCM WAV
- Sample rate: 22050 Hz
- Duration: 1-10 seconds per clip (ideal for TTS training)

**Metadata Format:**
- Pipe-delimited CSV: `<filename>|<transcription>`
- UTF-8 encoded
- Numbers/ordinals expanded to words

### Streaming ZIP Export in Next.js

Sources:
- [How to stream files from Next.js Route Handlers](https://www.ericburel.tech/blog/nextjs-stream-files)
- [GitHub: zip-stream](https://github.com/archiverjs/node-zip-stream)
- [Streaming ZIP in Node.js](https://blog.fossasia.org/sending-a-streaming-zip-file-in-node-js/)

**Recommended Approach:**
- Use `archiver` library (already handles queueing, built on zip-stream)
- Pipe archive directly to HTTP response (no file storage needed)
- Set `Content-Disposition: attachment` header
- For Next.js App Router: Convert Node stream to Web ReadableStream

**Key Code Pattern:**
```typescript
import archiver from 'archiver';

export async function GET() {
  const archive = archiver('zip', { store: true }); // store = no compression for audio

  // Convert to Web stream for Next.js
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  archive.on('data', (chunk) => writer.write(chunk));
  archive.on('end', () => writer.close());
  archive.on('error', (err) => writer.abort(err));

  // Add files...
  archive.finalize();

  return new Response(readable, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="export.zip"',
    },
  });
}
```

### Audio Format Conversion (FLAC to WAV/MP3)

Source: [Fluent-FFmpeg Library](https://medium.com/@kusalkalingainfo/convert-audio-files-using-fluent-ffmpeg-library-86aeb3c1b6b7)

**Project already has:**
- `fluent-ffmpeg` package installed
- FFmpeg usage in `stream-audio.ts` and `waveform-worker.ts`

**Conversion Commands:**
```bash
# FLAC to WAV (16-bit, 22050Hz for LJSpeech)
ffmpeg -i input.flac -ar 22050 -ac 1 -sample_fmt s16 output.wav

# FLAC to MP3 (high quality)
ffmpeg -i input.flac -codec:a libmp3lame -b:a 320k output.mp3
```

### Transcription Services

Sources:
- [OpenAI Speech to Text](https://platform.openai.com/docs/guides/speech-to-text)
- [WhisperX (Whisper + Pyannote)](https://github.com/m-bain/whisperX)

**Options for per-segment transcription:**

1. **OpenAI Whisper API** (Recommended for simplicity)
   - Models: `whisper-1`, `gpt-4o-transcribe`
   - Supports FLAC input directly
   - $0.006 per minute
   - No infrastructure needed

2. **Self-hosted Whisper** (Cost-effective at scale)
   - Run `faster-whisper` container
   - Batch processing capability
   - Full control over processing

**Pyannote does NOT provide transcription** - it only does speaker diarization. A separate service is needed for transcription.

### MOS (Mean Opinion Score) for Audio Quality

Source: [Mean Opinion Score in TTS Evaluation](https://www.futurebeeai.com/knowledge-hub/mean-opinion-score-tts)

**Scale:** 1-5 (1 = bad, 5 = excellent natural speech)

**Automated MOS Options:**
- [Microsoft Distill-MOS](https://github.com/microsoft/Distill-MOS) - Compact model for speech quality assessment
- UTMOS - Non-intrusive predictor

**Recommendation:** For MVP, implement manual quality scoring (user-assigned 1-5). Automated MOS can be added later as an optional processing action.

## Codebase Analysis

### Database Schema Analysis

**Current segments table (`src/server/db/schema.ts`):**
```typescript
export const segments = pgTable("segment", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => clippingSessions.id),
  speakerId: uuid("speaker_id").notNull().references(() => speakers.id),
  startTime: doublePrecision("start_time").notNull(),
  endTime: doublePrecision("end_time").notNull(),
  // Missing: transcription, qualityScore
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});
```

**Required additions:**
1. Add `transcription` column to segments (as specified in goal)
2. Create new `clips` table for generated audio clips

**Proposed clips table:**
```typescript
export const clips = pgTable("clip", {
  id: uuid("id").defaultRandom().primaryKey(),
  segmentId: uuid("segment_id").notNull().references(() => segments.id).unique(), // 1:1

  // Storage
  storageKey: varchar("storage_key", { length: 1024 }), // FLAC in R2
  duration: doublePrecision("duration"), // in seconds

  // Processing state
  status: clipStatus("status").default("pending"), // pending, processing, completed, failed
  errorMessage: text("error_message"),

  // Quality metrics (optional, for review)
  qualityScore: doublePrecision("quality_score"), // 1-5 MOS-like score

  // Processing flags
  isDenoised: boolean("is_denoised").default(false),
  hasOverlapRemoved: boolean("has_overlap_removed").default(false),

  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});
```

### Existing Queue Infrastructure

**BullMQ already set up (`src/services/queue/`):**
- Redis connection configured
- `WaveformJobPayload` pattern established
- Worker pattern in `workers/waveform-worker.ts`

**Extension needed:**
- Add `ClipJobPayload` interface
- Add `TranscriptionJobPayload` interface
- Create `clip-worker.ts` (note: existing one is outdated per spec)
- Create `transcription-worker.ts`

### Media Proxy Analysis

**Current endpoint (`src/app/api/media-proxy/route.ts`):**
- Streams audio slices from R2
- Supports `storageKey`, `startMs`, `endMs` params
- Uses FFmpeg for real-time transcoding to AAC
- Has source caching (LRU, 5GB default)

**Capability for segments:**
- CAN serve segment audio slices (startMs/endMs already supported)
- Will need new endpoint or mode for serving clips (full file, different format options)

### Existing UI Patterns

**Component Library:**
- Radix UI primitives (Dialog, Dropdown, Tabs, etc.)
- Custom UI components in `src/components/ui/`
- TailwindCSS for styling
- Legend-State for client state management

**Relevant existing patterns:**
- `TableView` component for speaker/segment listing
- `OuterHeader` for page headers with back button
- `RightSidebar` pattern for context-sensitive actions
- `DurationDistributionChart` for statistics visualization

**tRPC patterns:**
- Protected procedures with session validation
- Effect.js for service layer errors
- Optimistic updates with Legend-State

### Storage Patterns

**R2 key structure:**
- `diarization/{userId}/{timestamp}-{filename}` - source audio
- `{storageKey}.dat` - waveform data

**Proposed clip storage:**
- `clips/{userId}/{clipId}.flac` - processed clips

## Feasibility Assessment

| Aspect | Assessment | Notes |
|--------|------------|-------|
| Technical Viability | **High** | All required infrastructure exists |
| Effort Estimate | **L** | New page, API routes, queue extension, schema changes |
| Risk Level | **Medium** | Streaming ZIP is the main unknown; transcription service integration |

### Detailed Breakdown

1. **Schema Migration** - S (straightforward addition)
2. **Speaker Page UI** - M (new page, filters, list view)
3. **Clip Generation Worker** - M (rewrite from scratch per spec)
4. **Processing Service Interfaces** - M (define protocols, defer implementations)
5. **Export Streaming** - M (new pattern for project)
6. **Queue Infrastructure Extension** - S (add job types, status tracking)

## Recommendations for Requirements

1. **Transcription Service**: Build a decoupled service interface with clear protocols. The actual third-party integration (OpenAI Whisper, self-hosted, etc.) will be implemented later. Focus on the service layer abstraction.

2. **Quality Scoring**: Start with manual scoring (1-5). Add automated MOS as future enhancement.

3. **Clip Generation Trigger**: Clips are generated upon first processing action on a segment. When user triggers denoise, transcribe, or any processing operation, if no clip exists, one is created from the segment first, then the operation is applied.

4. **Export Presets**: Implement as configuration objects:
   ```typescript
   interface ExportPreset {
     name: string;
     format: 'wav' | 'mp3' | 'flac';
     sampleRate: number;
     bitDepth?: number;
     channels: 1 | 2;
   }

   const LJ_SPEECH_PRESET: ExportPreset = {
     name: 'LJSpeech',
     format: 'wav',
     sampleRate: 22050,
     bitDepth: 16,
     channels: 1,
   };
   ```

5. **Processing Queue UI**: Show queue status in sidebar using existing BullMQ `getWaitingCount()` pattern.

6. **Media Proxy Extension**: Add `/api/media-proxy/clip` endpoint for serving clips (vs segments which use time slicing).

7. **Processing Services Architecture**: Build service interfaces/protocols for each processing operation (denoise, transcribe, overlap removal). Actual implementations are deferred - focus on:
   - Job payload types
   - Queue integration
   - Status tracking
   - Error handling patterns

## Quality Commands

| Type | Command | Source |
|------|---------|--------|
| Lint | `bun run biome:check` | package.json scripts.biome:check |
| Format | `bun run biome:fix` | package.json scripts.biome:fix |
| TypeCheck | Not found (uses MCP getDiagnostics) | CLAUDE.md instructions |
| Unit Test | `bun test` | package.json scripts.test |
| Build | `bun run build` | package.json scripts.build |
| Storybook Test | `bun run test-storybook` | package.json scripts.test-storybook |

**Local CI**: `bun run biome:check && bun test && bun run build`

**Note**: Project uses Bun (not Node/pnpm), Biome instead of ESLint. Type checking should be done via MCP `getDiagnostics` tool per CLAUDE.md.

## Related Specs

| Spec | Relationship | mayNeedUpdate |
|------|-------------|---------------|
| (none found) | - | - |

No other specs exist in the `./specs/` directory at this time.

## Open Questions (Resolved)

1. **Transcription Service Choice**: Build a standard transcription service interface now, defer actual third-party implementation for later. Keep code decoupled and extensible with a service protocol that can accept any provider.

2. **Automatic Clip Generation**: Clips are generated upon first processing action on a segment. No separate "Generate Clip" button needed.

3. **Processing Operations Priority**: Focus on building the service interfaces and protocols in the codebase, not the actual processing implementations. Processing will be delegated to third-party services later. The queue infrastructure and job types are the priority.

4. **Export Size Limits**: No limits. Stream directly to client.

5. **Pagination**: Fetch all segments at once. No pagination needed for now.

**Additional Note**: Project uses Bun for all commands, not Node/pnpm.

## Sources

### Web Sources
- [The LJ Speech Dataset](https://keithito.com/LJ-Speech-Dataset/)
- [How to stream files from Next.js Route Handlers](https://www.ericburel.tech/blog/nextjs-stream-files)
- [GitHub: zip-stream](https://github.com/archiverjs/node-zip-stream)
- [Streaming ZIP in Node.js](https://blog.fossasia.org/sending-a-streaming-zip-file-in-node-js/)
- [Fluent-FFmpeg Library](https://medium.com/@kusalkalingainfo/convert-audio-files-using-fluent-ffmpeg-library-86aeb3c1b6b7)
- [OpenAI Speech to Text](https://platform.openai.com/docs/guides/speech-to-text)
- [WhisperX](https://github.com/m-bain/whisperX)
- [Mean Opinion Score in TTS Evaluation](https://www.futurebeeai.com/knowledge-hub/mean-opinion-score-tts)
- [Microsoft Distill-MOS](https://github.com/microsoft/Distill-MOS)

### Codebase Files
- `/home/pedro/documents/projects/audio-forge/src/server/db/schema.ts` - Database schema
- `/home/pedro/documents/projects/audio-forge/src/app/api/media-proxy/route.ts` - Media proxy endpoint
- `/home/pedro/documents/projects/audio-forge/src/services/queue/bullmq-queue-service.ts` - BullMQ setup
- `/home/pedro/documents/projects/audio-forge/workers/waveform-worker.ts` - Worker pattern reference
- `/home/pedro/documents/projects/audio-forge/src/lib/media-proxy/stream-audio.ts` - FFmpeg streaming
- `/home/pedro/documents/projects/audio-forge/src/features/clipping/components/table/table-view.tsx` - UI patterns
- `/home/pedro/documents/projects/audio-forge/src/features/clipping/components/layout/outer-header.tsx` - Header pattern
- `/home/pedro/documents/projects/audio-forge/src/features/clipping/components/sidebar/right-sidebar.tsx` - Sidebar pattern
