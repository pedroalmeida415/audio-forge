# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

Audio Forge is a webapp designed to streamline the process of creating high-quality speech datasets (like LJSpeech format) for TTS and ASR training. Users upload audio, run speaker diarization, curate segments in a timeline editor, and export structured datasets with transcriptions.

## Important

- **Package Manager**: Use BUN exclusively. NEVER use npm or pnpm.
- **No Barrel Files**: Do NOT create `index.ts` files that re-export from other modules. Import directly from specific files instead.

## Commands

```bash
# Development
bun dev                    # Start Next.js dev server with Turbopack
bun worker:dev             # Start audio processing worker (separate terminal)
bun worker:admin           # Start BullMQ admin UI
bun media:start            # Start standalone media server (port 3002)

# Database
bun db:generate            # Generate Drizzle migrations
bun db:push                # Push schema changes directly (dev only)
bun db:migrate             # Run migrations
bun db:studio              # Open Drizzle Studio

# Linting & Formatting
bun biome:check -- "<path>"           # Check linting/formatting issues (double dash required between command and file path)
bun biome:fix -- "<path>"              # Auto-fix linting/formatting issues (double dash required between command and file path)

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
- **State Management**: Legend-State (reactive stores with observables)
- **Services Layer**: Effect-TS for dependency injection and error handling
- **Queue**: BullMQ with Redis for background jobs
- **Styling**: Tailwind CSS v4 + Radix UI primitives

### Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (web)/              # Public marketing pages
│   ├── (app)/app/          # Authenticated app routes
│   │   └── project/[projectId]/
│   │       ├── clipping/[sessionId]/  # Timeline editor
│   │       └── speakers/[speakerId]/  # Speaker segment list
│   └── api/                # API routes (trpc, webhooks, media-proxy)
├── features/               # Feature modules with co-located components
│   ├── clipping/           # Timeline editor feature
│   │   ├── components/     # UI components (timeline, sidebar, table)
│   │   ├── store/          # Legend-State store with slices
│   │   ├── hooks/          # Feature-specific hooks
│   │   └── context/        # React context for store provider
│   └── speaker/            # Speaker management feature
├── server/
│   ├── api/                # tRPC routers
│   │   ├── trpc.ts         # tRPC setup with context
│   │   ├── root.ts         # Router composition
│   │   └── routers/        # Individual routers
│   ├── db/
│   │   └── schema.ts       # Drizzle schema (single source of truth)
│   └── better-auth/        # Auth configuration
├── services/               # Effect-TS service layer
│   ├── index.ts            # ServicesLive composition
│   ├── infra/              # Infrastructure (S3ClientService, RedisService)
│   ├── storage/            # StorageService (presigned URLs, object ops)
│   ├── queue/              # QueueService (generic BullMQ operations)
│   ├── diarization/        # PyannoteService (speaker diarization API)
│   └── audio/              # AudioProcessingService (ffmpeg, waveforms)
├── components/ui/          # Shared UI components (shadcn/ui style)
├── trpc/                   # tRPC client setup
└── lib/                    # Utility functions
workers/                    # BullMQ worker processes (run with bun)
```

### Key Patterns

**Effect-TS Services**: Backend services use `Effect.Service` API. Key conventions:

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
  accessors: true, // Enables StorageService.upload() instead of needing to yield* first
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
- Don't manually annotate Effect return types - let TypeScript infer them
- Use `Effect.async<A, E>((resume) => ...)` for callback-based APIs (ffmpeg, child_process)
- Use `Effect.tryPromise({ try, catch })` for Promise-based APIs
- Use `accessors: true` to enable direct method calls via the service tag
- Provide services via `.Default` layer which includes all dependencies

**Legend-State Stores**: Client state uses observable stores with slices:
```typescript
// Store created in provider with useObservable
const $store = useObservable<ClippingStoreState>({...})
// Access via context: const $store = useClippingStore()
// Read: $store.segments.get() or use()
// Write: $store.segments.set([...])
```

**Legend-State Mutation Best Practices**:
- **Mutate directly** - Legend-State handles reactivity through direct mutations. Avoid re-creating Maps, Sets, arrays, or objects. Use the instance methods provided by the observable (`.set()`, `.delete()`, `.add()`, `.clear()`, etc.).
- For Maps: use `$store.map.set(key, value)`, `$store.map.delete(key)`, not `$store.map.set(new Map(...))`
- For Sets: use `$store.set.add(value)`, `$store.set.delete(value)`, not `$store.set.set(new Set(...))`
- For nested updates: `$store.segments.get(id).status.set("loaded")` instead of replacing the entire entry
- Use `.peek()` to read without subscribing (in actions), `.get()` to read with subscription (in components via `useValue`)
- ALWAYS use `useValue`. The `useSelector` hook is deprecated.

**tRPC with Optimistic Updates**: Mutations use `setupMutationDefaults` pattern in `store/mutations.ts` for optimistic updates that sync with Legend-State stores.

**Dual Data Sources**: Segments and speakers can be "local" (from diarization JSONB, not yet saved to DB) or "project" (persisted in DB). Both are unified via `SpeakerWithSource` and `SegmentWithSource` types with a `source` discriminator.

### Domain Model

- **Project**: Container for files, speakers, and sessions
- **Speaker**: Project-level identity. `SPEAKER_XX` names are diarization-generated (immutable, hidden from project views)
- **ClippingSession**: 1:1 with File, stores diarization job info in JSONB
- **Segment**: Time range within a session, always assigned to a speaker
- **Clip**: Processed audio from a segment (1:1 relationship)

### Media Server

Standalone Hono server (`media-server/`) handles audio streaming with LRU cache.
- Auth: Validates better-auth session cookies via direct DB lookup
- Cookie format: `better-auth.session_token={token}.{HMAC-SHA256-signature}` (URL-encoded)
- Env vars: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `MEDIA_SERVER_INTERNAL_TOKEN`

### BullMQ Gotchas
- `QueueEvents` "completed" handler: `returnvalue` is already parsed object, not JSON string
- Worker must `return await handler(job)` (not just `await`) to capture return values in `job.returnvalue`

### Path Alias
Use `~` for src imports: `import { api } from "~/trpc/react"`
