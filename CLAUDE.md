# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
bun run dev           # Start dev server with Turbo (port 3000)
bun run build         # Production build
bun run preview       # Build then start production server

# Linting & Formatting (Biome)
bun run biome:check -- <file-path>   # Check for lint/format issues
bun run biome:fix -- <file-path>     # Auto-fix lint/format issues
bun run biome:format -- <file-path>  # Format only

# Database (Drizzle + PostgreSQL)
bun run db:generate   # Generate migrations from schema
bun run db:push       # Push schema directly (dev)
bun run db:migrate    # Run migrations
```

## Architecture

### Tech Stack
- **Framework**: Next.js 15 with App Router, React 19, TypeScript
- **Styling**: Tailwind CSS v4 with tw-animate-css
- **API**: tRPC v11 with SuperJSON transformer
- **Database**: PostgreSQL via Drizzle ORM
- **Auth**: better-auth with Drizzle adapter
- **State**: Legend-State for clipping workspace (fine-grained reactivity)
- **Services**: Effect-ts for service layer abstraction
- **Storage**: Cloudflare R2 via AWS SDK

### Project Structure
```
src/
├── app/                    # Next.js App Router
│   ├── (app)/app/          # Authenticated app routes
│   │   ├── diarization/    # Upload & process audio
│   │   └── project/        # Projects, collections, clipping workspace
│   │       └── [projectId]/
│   │           └── clipping/
│   │               ├── page.tsx           # Empty state (upload prompt)
│   │               └── [fileId]/          # Audio-first workspace
│   │                   ├── _store/        # Legend-State store
│   │                   ├── _components/   # Workspace components
│   │                   ├── _hooks/        # Custom hooks
│   │                   └── _context/      # Store provider
│   ├── (web)/              # Public marketing routes
│   └── api/                # API routes (tRPC, auth, webhooks)
├── components/ui/          # shadcn/ui components
├── lib/                    # Utilities (cn, time-utils, speaker-colors)
├── server/
│   ├── api/                # tRPC routers & procedures
│   ├── better-auth/        # Auth configuration
│   └── db/                 # Drizzle schema & connection
├── services/               # Effect-based services
│   ├── diarization/        # Pyannote diarization integration
│   └── storage/            # R2 storage service
└── trpc/                   # tRPC client setup
```

### Key Patterns

**React Compiler**: The project uses the experimental React Compiler (`babel-plugin-react-compiler`). Generally, do NOT use `useCallback`, `useMemo`, or `memo()` — the compiler handles memoization automatically.

**Exception - Manual memoization is required when:**
- Passing data to libraries that rely on **referential equality** (not just value equality)
- Dependencies of `useEffect` that need stable references
- Input to custom hooks that internally depend on reference stability

**Example - TanStack Table:** The `useReactTable` hook internally tracks data changes by reference. If you pass `data` that is recreated on every render (e.g., from `.map()` or `.filter()`), TanStack Table sees "new" data each time, triggers auto-reset behavior, which causes re-renders, creating an infinite loop. Solution: wrap the data computation in `useMemo`:

```typescript
// ❌ BAD - creates new array/objects every render
const tableData = segments.map(s => ({ ...s, extra: computeExtra(s) }));

// ✅ GOOD - stable reference when dependencies haven't changed
const tableData = useMemo(() =>
  segments.map(s => ({ ...s, extra: computeExtra(s) })),
  [segments]
);
```

This applies to other libraries with similar patterns (React Query, some animation libraries, etc.).

**tRPC Procedures**: Use `publicProcedure` or `protectedProcedure` from `~/server/api/trpc`. Context includes `db` and `session`.

**Effect Services**: Services use Effect.js Context.Tag pattern. Combine with `ServicesLive` layer from `~/services`.

**Database Schema**: Drizzle schema at `src/server/db/schema.ts`. Main entities: `projects`, `collections`, `clips`, `diarizations`, `files`.

**Path Alias**: Use `~/` to import from `src/` directory.

### Domain Model
- **Project** → has many **Collections** → has many **Clips**
- **Project** → has many **Files** (audio files with workspace data)
- **Diarization** → processes audio files, produces speaker segments
- **File** → S3-compatible storage reference (R2) + workspace-local speakers/segments as JSONB

## Clipping Workspace Architecture

The clipping workspace uses an **audio-first** architecture where users upload audio directly, then either manually create segments or trigger diarization.

### Route Structure
```
/project/[projectId]/clipping           → Empty state (prompt upload)
/project/[projectId]/clipping/[fileId]  → Workspace with loaded audio
```

### Legend-State Store Pattern

The workspace uses Legend-State for fine-grained reactivity. Key patterns:

**Store Creation** (`_store/clipping-store.ts`):
```typescript
const $store = useObservable<ClippingStoreState>({
  // Primitive values
  fileId: file.id,
  selectedSpeakerId: null,

  // Arrays (fine-grained updates)
  segments: file.segments ?? [],
  speakers: file.speakers ?? [],

  // Computed values (use get() for reactivity)
  speakerColors: () => createSpeakerColorMap($store.speakers.get()),

  // Actions
  selectSpeaker: (speakerId) => $store.selectedSpeakerId.set(speakerId),
});
```

**Reactive Subscriptions** - Use the right method:
- `$store.value.get()` - Read value AND subscribe to changes (reactive)
- `$store.value.peek()` - Read value WITHOUT subscribing (non-reactive)
- `$store.value.set(newValue)` - Update value
- `$store.array.push(item)` - Fine-grained array mutation

**Optimistic Updates** (`_store/mutations.ts`):
```typescript
trpcUtils.file.createSpeaker.setMutationDefaults({
  onMutate: async (variables) => {
    const tempId = crypto.randomUUID();
    $store.addSpeaker({ id: tempId, label: variables.label });
    return { tempId };
  },
  onSuccess: (result, _variables, context) => {
    // Replace temp ID with real ID from server
    const index = $store.speakers.peek().findIndex(s => s.id === context.tempId);
    if (index !== -1) {
      $store.speakers[index]?.id.set(result.speaker.id);
    }
  },
  onError: (_err, _variables, context) => {
    $store.removeSpeaker(context.tempId);
  },
});
```

**Component Subscriptions**:
```typescript
// Subscribe to single value
const selectedSpeakerId = useValue($store.selectedSpeakerId);

// Subscribe with selector (computed)
const speakerCount = useValue(() => $store.speakers.get().length);

// Subscribe to whole object (use sparingly)
const speakers = useSelector(() => $store.speakers.get());
```

### Workspace Data Model

**WorkspaceSpeaker** (stored in `files.speakers` JSONB):
```typescript
interface WorkspaceSpeaker {
  id: string;           // UUID
  label: string;        // Display name (e.g., "SPEAKER_00")
  color?: string;       // Optional custom color (HSL string)
  createdAt: string;    // ISO timestamp
}
```

**FileSegment** (stored in `files.segments` JSONB):
```typescript
interface FileSegment {
  id: string;
  speakerId: string;    // References WorkspaceSpeaker.id
  start: number;        // Start time in seconds
  end: number;          // End time in seconds
  source: "diarization" | "manual";
  isDeleted?: boolean;
  isReviewed?: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### Component Architecture

The workspace uses a **nested layout pattern**:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [←]            audio-file-name.mp3  ∨                    [Diarize]       │ ← OuterHeader
├──────────────────────────────────────────────────────────────────┬───────┤
│  ┌────────────────────────────────────────────────────────┬────┐ │       │
│  │ SPEAKER_00  ✏️                                         │    │ │  [👥] │ ← OuterSidebar
│  ├────────────────────────────────────────────────────────│    │ │       │
│  │ [Table with segments]                                  │Side│ │       │
│  │                                                        │bar │ │       │
│  ├────────────────────────────────────────────────────────┴────┤ │       │
│  │ [Timeline toolbar with actions]                             │ │       │
│  │ [Timeline with waveform]                                    │ │       │
│  └─────────────────────────────────────────────────────────────┘ │       │
└──────────────────────────────────────────────────────────────────┴───────┘
```

**Key Components**:
- `OuterHeader` - Back button, file name dropdown, diarize button
- `OuterSidebar` - Narrow bar with Speakers button (opens drawer)
- `SpeakersDrawer` - Sheet for managing workspace speakers
- `SpeakerHeader` - Current speaker name with inline rename
- `TableView` - Segments table (auto-selects first speaker)
- `RightSidebar` - Selection summary, actions, export button
- `TimelineToolbar` - Navigation, playback, active segment actions, selection controls
- `ActiveSegmentActions` - Split, change speaker, delete, review toggle
- `InlineSelectionControls` - Combobox for speaker selection during drag-to-create

### File Router API

Key procedures in `src/server/api/routers/file.ts`:

- `getById` - Fetch file with speakers, segments, and latest diarization
- `getAudioUrl` - Get presigned URL for audio playback
- `updateSegments` - Batch update segments (speaker, times, deleted, reviewed)
- `createSegment` - Create manual segment from selection
- `splitSegment` - Split segment at playhead time
- `createSpeaker` / `updateSpeaker` / `deleteSpeaker` - Speaker CRUD
- `exportToCollection` - Export segments to collection for clip generation

## Storybook Testing

The project uses Storybook with `@storybook/nextjs-vite` for component development and testing.

### Commands

```bash
bun run storybook       # Start Storybook dev server
bun run test-storybook  # Run Storybook tests via Vitest
```

### Configuration

- **Framework**: `@storybook/nextjs-vite` - Supports `next/font`, `next/image`, app router
- **Testing**: Vitest with `@storybook/addon-vitest`
- **Mocking**: MSW (Mock Service Worker) via `msw-storybook-addon`
- **Config location**: `.storybook/`

### Global Setup (`.storybook/preview.tsx`)

The preview file provides:
- **Fonts**: Loads Syne and IBM Plex Sans via `next/font/google`
- **Styling**: Applies `bg-background bg-studio-grid` and gradient mesh overlay
- **tRPC**: Wraps stories with `TRPCReactProvider`
- **MSW**: Initializes MSW for network mocking
- **procedureSpy**: Resets before each story for tRPC call assertions

### Query Patterns

Use Testing Library queries correctly to ensure readable test output:

| Query Type | When to Use | Async |
|------------|-------------|-------|
| `getBy*` | Element exists immediately | No |
| `getAllBy*` | Multiple elements exist immediately | No |
| `findBy*` | Wait for element to appear | Yes |
| `findAllBy*` | Wait for multiple elements | Yes |

**Rules:**
- `findBy*` should ONLY be used when the element is NOT immediately available (e.g., waiting for async render)
- Use `getBy*` for elements that exist after initial render
- Always `await` the `expect()` calls
- Prefer `{ canvas }` from play function params over `within(canvasElement)`
- Don't create unnecessary const variables for elements that won't be reused

```typescript
// ✅ GOOD - await findBy for initial async element, then getBy for rest
play: async ({ canvas }) => {
  // Wait for component to render (async)
  await canvas.findByRole("slider", { name: /audio progress/i });

  // Elements already present after render (sync)
  await expect(canvas.getByRole("button", { name: /play/i })).toBeInTheDocument();
  await expect(canvas.getByRole("button", { name: /pause/i })).toBeInTheDocument();
}

// ❌ BAD - don't use .resolves pattern (shows "Promise" in logs)
await expect(canvas.findByRole("button")).resolves.toBeInTheDocument();

// ❌ BAD - don't use findBy for elements that already exist
await canvas.findByRole("button", { name: /play/i }); // Use getBy instead
```

### MSW Handlers for tRPC

Create type-safe MSW handlers for tRPC procedures in `__tests__/handlers/`:

```typescript
// handlers/trpc.ts
import { http, HttpResponse } from "msw";

type TRPCResponse<T> = { result: { data: { json: T } } };

export function trpcQuery<T>(procedure: string, resolver: () => T) {
  return http.get(`/api/trpc/${procedure}`, () => {
    return HttpResponse.json<TRPCResponse<T>>({
      result: { data: { json: resolver() } },
    });
  });
}

export function trpcMutation<T>(procedure: string, resolver: () => T) {
  return http.post(`/api/trpc/${procedure}`, () => {
    return HttpResponse.json<TRPCResponse<T>>({
      result: { data: { json: resolver() } },
    });
  });
}

// handlers/index.ts
export const getWaveformUrlHandler = trpcQuery("file.getWaveformUrl", () => ({
  status: "completed",
  url: "/test-audio.dat",
  error: null,
}));

export const timelineHandlers = [getWaveformUrlHandler, ...];
```

### Story Structure

```typescript
// Component.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent } from "@storybook/test";
import { myHandlers } from "./__tests__/handlers";

const meta: Meta<typeof Component> = {
  component: Component,
  parameters: {
    msw: { handlers: myHandlers },
  },
  decorators: [
    (Story) => (
      <ContextProvider>
        <Story />
      </ContextProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Component>;

export const Default: Story = {
  args: { /* initial props */ },
  play: async ({ canvas }) => {
    // Wait for async render
    await canvas.findByRole("button", { name: /submit/i });

    // Interact
    await userEvent.click(canvas.getByRole("button", { name: /submit/i }));

    // Assert
    await expect(canvas.getByText("Success")).toBeInTheDocument();
  },
};
```

### Asserting tRPC Calls

Use `procedureSpy` to assert tRPC procedures were called:

```typescript
import { procedureSpy } from "~/trpc/react";

play: async ({ canvas }) => {
  await canvas.findByRole("slider");

  // Assert procedure was called
  await expect(procedureSpy["file.getWaveformUrl"].wasCalled).toBe(true);
  await expect(procedureSpy["file.getWaveformUrl"].calls[0]?.input.fileId).toBe("mock-file");
}
