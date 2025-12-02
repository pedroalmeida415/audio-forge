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
| **Code Quality** | Biome via Ultracite preset |
| **Package Manager** | Bun |

## Quick Commands

```bash
bun dev              # Start dev server (with Turbopack)
bun build            # Production build
bun db:push          # Push schema changes to database
bun db:studio        # Open Drizzle Studio
bun biome:fix        # Format and fix lint issues
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

# Ultracite Code Standards

This project uses **Ultracite**, a zero-config Biome preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `bun biome:format -- <path-to-file>`
- **Check for issues**: `bun biome:check -- <path-to-file>`
- **Fix issues**: `bun biome:fix -- <path-to-file>`

Biome (the underlying engine) provides extremely fast Rust-based linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**
- Use Next.js `<Image>` component for images
- Use App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**
- Use ref as a prop instead of `React.forwardRef`

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Biome Can't Help

Biome's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Biome can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Biome. Run `bun biome:fix` before committing to ensure compliance.
