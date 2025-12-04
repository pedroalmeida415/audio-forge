# Voice Dataset Builder

A full-stack web application for creating TTS (Text-to-Speech) training datasets through speaker diarization, segment editing, and audio clip extraction.

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 15 (App Router), React 19 |
| **Language** | TypeScript 5.9 (strict mode) |
| **API** | tRPC 11 with React Query |
| **Database** | PostgreSQL 16 via Drizzle ORM |
| **Storage** | MinIO (S3-compatible) |
| **AI/Processing** | Pyannote API (diarization), FFmpeg (audio) |
| **Styling** | Tailwind CSS 4, shadcn/ui |
| **Code Quality** | Biome |
| **Package Manager** | Bun |

## Quick Commands

```bash
bun dev              # Start dev server (with Turbopack)
bun build            # Production build
bun db:push          # Push schema changes to database
bun db:studio        # Open Drizzle Studio
bun biome:fix -- <file-path>        # Format and fix lint issues
bun biome:check -- <file-path>        # Check lint issues
```

## Project Structure

```
src/
├── app/                          # Next.js App Router
│   ├── @modal/                   # Parallel routes for modals
│   │   ├── (.)clipping/          # Clipping modal (intercepted route)
│   │   ├── (.)diarization/       # Diarization modal
│   │   └── [...catchAll]/        # Modal dismissal handler
│   ├── api/                      # API routes
│   │   ├── transfer/             # File transfer endpoint
│   │   └── trpc/[trpc]/          # tRPC handler
│   ├── clipping/                 # Clipping workspace page
│   ├── diarization/              # Diarization upload page
│   └── projects/                 # Project management
│       └── [projectId]/collections/[collectionId]/
│
├── components/
│   ├── ui/                       # shadcn/ui primitives
│   ├── nav/                      # Global navigation
│   ├── clipping/                 # Clipping-specific components
│   ├── diarization/              # Upload flow components
│   ├── projects/                 # Project/collection dialogs
│   ├── segments/                 # Segment list display
│   └── waveform/                 # WaveSurfer.js visualization
│
├── server/
│   ├── db/
│   │   ├── schema.ts             # Drizzle schema definitions
│   │   └── index.ts              # Database client
│   ├── api/
│   │   ├── root.ts               # Root tRPC router
│   │   ├── trpc.ts               # tRPC context setup
│   │   └── routers/              # Feature routers
│   │       ├── diarization.ts    # Job lifecycle management
│   │       ├── project.ts        # Project CRUD
│   │       ├── collection.ts     # Collection management
│   │       ├── segment.ts        # Segment operations
│   │       └── clip.ts           # Audio extraction
│   └── services/
│       ├── minio.ts              # Object storage client
│       ├── pyannote.ts           # Diarization API
│       └── ffmpeg.ts             # Audio processing
│
├── trpc/
│   ├── react.tsx                 # tRPC React client
│   ├── server.ts                 # Server-side caller
│   └── query-client.ts           # React Query config
│
├── hooks/
│   ├── use-job-workspace.ts      # Diarization workspace state
│   └── use-segment-actions.ts    # Segment operations
│
├── lib/
│   └── utils.ts                  # cn() utility function
│
└── env.js                        # Environment validation (Zod)
```

## Core Workflow

The application follows a three-step process:

1. **Diarize** - Upload audio → Pyannote identifies speakers → Segments saved to database
2. **Clip** - View waveform → Edit segment timestamps → Assign to collections
3. **Extract** - Select format → FFmpeg extracts clips → Stored in MinIO

## Development Patterns

### tRPC Procedures

All API routes use tRPC with Zod validation:

```typescript
// server/api/routers/example.ts
export const exampleRouter = createTRPCRouter({
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.examples.findFirst({
        where: eq(examples.id, input.id),
      });
    }),

  create: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [result] = await ctx.db.insert(examples).values(input).returning();
      return result;
    }),
});
```

### Database Schema

Tables use UUID primary keys with automatic timestamps:

```typescript
// server/db/schema.ts
export const examples = createTable("example", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
});
```

### React Query Usage

Components consume tRPC via React Query hooks:

```typescript
// Query with polling
const { data: job } = api.diarization.getJob.useQuery(
  { jobId },
  { refetchInterval: job?.status === "processing" ? 3000 : false }
);

// Mutation with cache invalidation
const utils = api.useUtils();
const mutation = api.project.create.useMutation({
  onSuccess: () => utils.project.list.invalidate(),
});
```

### Custom Hooks

Complex state is encapsulated in hooks:

- `useJobWorkspace(jobId)` - Manages diarization workspace: job polling, segment selection, audio URL
- `useSegmentActions()` - Handles segment status updates and collection assignment

### Component Patterns

- Use `"use client"` directive only when needed (interactivity, hooks)
- Server Components for data fetching where possible
- Loading states via React Suspense or isLoading checks
- Modal routes use Next.js parallel routes (`@modal`)

## Environment Variables

Required variables (see `.env.example`):

```
DATABASE_URL=postgresql://...
PYANNOTE_API_KEY=...
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MINIO_BUCKET=audio-forge
```

## Infrastructure

Docker Compose provides local services:

```bash
docker compose up -d    # Start PostgreSQL + MinIO
docker compose down     # Stop services
```

---
