# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

Audio Forge is a webapp designed to streamline the process of creating high-quality speech datasets (like LJSpeech format) for TTS and ASR training. Users upload audio, run speaker diarization, curate segments in a timeline editor, and export structured datasets with transcriptions.

## Important

- **Package Manager**: Use BUN exclusively. NEVER use npm or pnpm.
- **No Barrel Files**: Do NOT create `index.ts` files that re-export from other modules. Import directly from specific files instead.
- **React Compiler**: Enabled (`experimental.reactCompiler`). Do not add manual `useMemo`/`useCallback` -- the compiler handles memoization.
- **TypeScript Strictness**: `noUncheckedIndexedAccess: true` -- array/object index access returns `T | undefined`, so handle accordingly.
- **Tailwind v4**: Config is CSS-based in `src/styles/globals.css` (via `@theme` directive), not a JS/TS config file. Uses OKLCH color space with `light-dark()` function.

## Commands

```bash
# Development
bun dev                    # Start Next.js dev server with Turbopack
bun worker:start           # Start audio processing worker (separate terminal)
bun worker:admin           # Start BullMQ admin UI
bun media:start            # Start standalone media server (port 3002)

# Database
bun db:generate            # Generate Drizzle migrations
bun db:push                # Push schema changes directly (dev only)
bun db:migrate             # Run migrations
bun db:studio              # Open Drizzle Studio

# Linting & Formatting
bun biome:check -- "<path>"    # Check linting/formatting issues (double dash required between command and file path)
bun biome:fix -- "<path>"      # Auto-fix linting/formatting issues (double dash required between command and file path)

# Testing
bun test                   # Run Vitest (unit tests)
bun test-storybook         # Run Storybook tests (browser tests)
bun test <path>            # Run specific test file
bun storybook              # Start Storybook dev server (port 6006)
```

## Architecture Overview

### Tech Stack
- **Framework**: Next.js 15 (App Router) + React 19 + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **API**: tRPC v11 for type-safe RPCs
- **Auth**: better-auth
- **Media Server**: Standalone Hono server for audio streaming (media-server/)
- **Storage**: Cloudflare R2 (S3-compatible)
- **State Management**: Valtio (proxy-based) + valtio-reactive (effects/computed)
- **Services Layer**: Effect-TS for dependency injection and error handling
- **Queue**: BullMQ with Redis for background jobs
- **Styling**: Tailwind CSS v4 + shadcn/ui + Radix UI primitives

### Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (web)/              # Public marketing pages
│   ├── (app)/app/          # Authenticated app routes
│   │   └── project/[projectId]/
│   │       └── workspace/  # Unified workspace editor
│   └── api/                # API routes (trpc, webhooks)
├── features/workspace/     # Workspace feature module
│   ├── components/         # UI components
│   │   ├── clip-studio/    # Timeline editor (waveform, scrubber, segments)
│   │   └── table/          # Segments table (virtualized)
│   ├── store/              # Valtio store (WorkspaceStore class)
│   ├── context/            # React context for store provider
│   ├── hooks/              # Feature-specific hooks
│   ├── utils/              # Timeline/zoom/segment utilities
│   └── search-params.ts    # URL state (nuqs)
├── server/
│   ├── api/                # tRPC routers
│   │   ├── trpc.ts         # tRPC setup with context
│   │   ├── root.ts         # Router composition
│   │   └── routers/        # project, source, segment, speaker, file, export
│   ├── db/
│   │   └── schema.ts       # Drizzle schema (single source of truth)
│   ├── events/             # Server-sent event types and bridges
│   └── better-auth/        # Auth configuration
├── services/               # Effect-TS service layer
│   ├── index.ts            # ServicesLive composition + AppRuntime
│   ├── infra/              # Database, S3ClientService, RedisService
│   ├── storage/            # StorageService (presigned URLs, object ops)
│   ├── queue/              # QueueService (BullMQ operations)
│   ├── diarization/        # PyannoteService (speaker diarization API)
│   └── audio/              # AudioProcessingService (ffmpeg, waveforms)
├── components/ui/          # Shared UI components (shadcn/ui style)
├── trpc/                   # tRPC client setup
└── lib/                    # Utility functions
workers/                    # BullMQ worker processes
media-server/               # Standalone Hono audio streaming server
```

### Key Patterns

**Effect-TS Services**: Backend services use `Effect.Service` API:

```typescript
// Infrastructure services with lifecycle (scoped) - for clients/connections
class S3ClientService extends Effect.Service<S3ClientService>()("S3ClientService", {
  scoped: Effect.acquireRelease(
    Effect.sync(() => new S3Client({ ... })),
    (client) => Effect.sync(() => client.destroy()),
  ),
}) {}

// Domain services with dependencies - use `effect` + `dependencies`
class StorageService extends Effect.Service<StorageService>()("StorageService", {
  effect: Effect.gen(function* () {
    const client = yield* S3ClientService;
    return {
      // Don't annotate return types - let TypeScript infer from implementation
      upload: (params: { key: string; data: Buffer }) =>
        Effect.tryPromise({
          try: async () => { ... },
          catch: (error) => new StorageError({ operation: "upload", message: "...", cause: error }),
        }),
    };
  }),
  dependencies: [S3ClientService.Default],
  accessors: true,
}) {}

// Stateless services - use `succeed`
class AudioProcessingService extends Effect.Service<AudioProcessingService>()("AudioProcessingService", {
  succeed: {
    probe: (params: { inputPath: string }) => probeFile(params.inputPath),
  },
  accessors: true,
}) {}
```

**Effect Service Conventions**:
- One error type per service with `operation` discriminator: `StorageError`, `QueueError`, etc.
- Don't manually annotate Effect return types -- let TypeScript infer them
- Use `Effect.async<A, E>((resume) => ...)` for callback-based APIs (ffmpeg, child_process)
- Use `Effect.tryPromise({ try, catch })` for Promise-based APIs
- Use `accessors: true` to enable direct method calls via the service tag
- Provide services via `.Default` layer which includes all dependencies

**Effect-TS in tRPC Routers**: Procedures execute Effect programs via `AppRuntime`:
```typescript
export const myRouter = createTRPCRouter({
  doSomething: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.runtime.runPromise(
        Effect.gen(function* () {
          const db = yield* Database;
          // Use services directly (if accessors: true)
          const result = yield* StorageService.upload({ ... });
          // Throw tRPC errors via Effect.fail
          if (!found) yield* Effect.fail(new TRPCError({ code: "NOT_FOUND" }));
          return result;
        }),
      );
    }),
});
```

**tRPC Procedures**: `publicProcedure` includes timing middleware (adds artificial 100-500ms delay in dev to catch waterfalls). `protectedProcedure` adds auth check and narrows `ctx.session` to non-nullable.

**tRPC Client Links** (in `src/trpc/react.tsx`):
- Subscriptions -> SSE via `httpSubscriptionLink`
- Non-JSON-serializable inputs (e.g., `ReadableStream`) -> regular `httpLink`
- Default -> `httpBatchStreamLink` for batched streaming

**Valtio Store**: Client state uses a proxy-based class store with computed selectors:
```typescript
// Store is a plain class, wrapped with proxy() in provider
class WorkspaceStore {
  selectedSegmentIds: Set<string> = proxySet();
  isPlaying = false;
  zoomLevel = 100;
  refs = ref({ audioElement: null }); // ref() = not tracked by proxy

  // Methods mutate directly
  toggleSelection(id: string) {
    if (this.selectedSegmentIds.has(id)) {
      this.selectedSegmentIds.delete(id);
    } else {
      this.selectedSegmentIds.add(id);
    }
  }

  // Use batch() to group multiple mutations
  zoomAtPoint(newZoom: number, focalTime: number, viewportOffset: number) {
    batch(() => {
      this.zoomLevel = clampedZoom;
      this.scrollOffset = clampedOffset;
    });
  }
}

// Computed values created alongside the store
const comp = computed({
  pixelsPerSecond: () => calculatePPS(store.zoomLevel, store.duration, store.containerWidth),
  selectionRange: () => { ... },
});
```

**Valtio Store Conventions**:
- **Mutate directly** -- Valtio tracks mutations through proxies. Use `.add()`, `.delete()`, `.clear()` on Set/Map.
- Use `ref()` to wrap values that should NOT be tracked (DOM refs, audio elements)
- Use `proxySet()` / `proxyMap()` for trackable Set/Map instances
- Use `batch(() => { ... })` to group multiple mutations into one reactive update
- Use `effect()` from `valtio-reactive` for fine-grained subscriptions in hooks
- Use `computed()` from `valtio-reactive` for derived reactive values
- Use `useSnapshot()` in components for reactive reads
- Store created once via `useRef` in provider to prevent re-initialization

**Store Context Provider**:
```typescript
function WorkspaceStoreProvider({ children }) {
  const ctx = useRef<WorkspaceCtx | null>(null);
  if (!ctx.current) {
    const store = proxy(new WorkspaceStore());
    const comp = createComputed(store);
    ctx.current = { store, computed: comp };
  }
  return <WorkspaceStoreContext value={ctx.current}>{children}</WorkspaceStoreContext>;
}

// Access: const { store, computed } = useWorkspaceStore();
```

### Domain Model

- **Project**: Container for sources, speakers, and segments
- **Source**: Uploaded audio file with waveform + diarization metadata (replaces old files + clippingSessions)
- **Speaker**: Project-level identity. `origin: "diarization"` speakers are auto-generated and linked to a source. `origin: "user"` speakers are user-created.
- **Segment**: Time range within a source, always assigned to a speaker. Carries transcription, tags, and quality scores.
- **Clip**: Processed audio from a segment (1:1). Has its own storage key, duration, and quality scores.

### Database Schema (Drizzle)

**Enums**: `waveformStatus`, `diarizationStatus`, `speakerOrigin`, `clipProcessingStatus`

**Tables**:
- `projects`: id, name, description, userId
- `sources`: id, userId, projectId, storageKey, duration, name, originalFileName, waveform fields, diarization fields
- `speakers`: id, projectId, userId, name, color, sourceId (nullable), origin
- `segments`: id, sourceId, speakerId, startTime, endTime, transcription, tags (text[]), scores (JSONB)
- `clips`: id, segmentId (unique), userId, storageKey, duration, processingStatus, processingError, scores (JSONB)

**JSONB type -- AudioScores**:
```typescript
interface AudioScores {
  DNSMOS: { SIG: number; BAK: number; OVRL: number; P808_MOS: number };
  _meta?: { scoredAt: string; model: string };
}
```

**Drizzle Conventions**:
- All tables: `uuid("id").defaultRandom().primaryKey()` with `createdAt`/`updatedAt` timestamps
- Enums: defined with `pgEnum()` before tables
- Relations: defined separately after tables using `relations()` helper
- JSONB typing: `.jsonb("column").$type<InterfaceName>()`
- Type inference: `typeof table.$inferSelect`

### Media Server

Standalone Hono server (`media-server/`) handles audio streaming with LRU cache.
- **Endpoints**: `GET /health` (cache stats), `GET /audio` (authenticated streaming)
- **Audio params**: `storageKey`, `startMs`, `endMs`, `format` (fMP4 for browser MSE, FLAC for workers)
- **Auth**: Internal bearer token for worker requests, better-auth session cookie for browser requests
- **Cache**: LRU with configurable size (10GB default) and TTL (24hr default)

### BullMQ Workers

Single audio processing queue with job types:
- `GenerateWaveform`: source -> .dat waveform file -> R2
- `Denoise`: segment -> extract slice -> denoise -> create clip
- `RemoveOverlap`: segment audio overlap removal
- `Transcribe`: segment -> transcription text
- `CalculateScore`: segment/clip -> DNSMOS quality scores
- `LJSpeechExport`: speaker -> ZIP archive with WAV files + metadata.csv

**Gotchas**:
- `QueueEvents` "completed" handler: `returnvalue` is already parsed object, not JSON string
- Worker must `return await handler(job)` (not just `await`) to capture return values in `job.returnvalue`
- Processing jobs auto-enqueue scoring jobs on completion

### Server-Sent Events

Event types for real-time updates:
- `DiarizationEvent`: source diarization status changes
- `ClipEvent`: clip processing completion (includes scores)
- `ExportProgressEvent`: export job progress tracking

Event bridges (`*-events-bridge.ts`) connect BullMQ job completion to SSE streams consumed by tRPC subscriptions.

### Biome Conventions
- `useSortedClasses` is enforced (warn) for `clsx`, `cva`, and `cn` -- keep Tailwind classes sorted.
- `useExhaustiveDependencies` is disabled (Valtio effects handle their own subscriptions).
- 2-space indentation.
- a11y rules are off.

### Path Alias
Use `~` for src imports: `import { api } from "~/trpc/react"`
