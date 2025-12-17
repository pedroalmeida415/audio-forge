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
bun run db:migrate    # Run migrations
bun run db:push       # Push schema directly (dev)
```

## Architecture

### Tech Stack
- **Framework**: Next.js 15 with App Router, React 19, TypeScript
- **Styling**: Tailwind CSS v4 with tw-animate-css
- **API**: tRPC v11 with SuperJSON transformer
- **Database**: PostgreSQL via Drizzle ORM
- **Auth**: better-auth with Drizzle adapter
- **State**: Zustand with immer middleware (for clipping workspace)
- **Services**: Effect-ts for service layer abstraction
- **Storage**: Cloudflare R2 via AWS SDK

### Project Structure
```
src/
├── app/                    # Next.js App Router
│   ├── (app)/app/          # Authenticated app routes
│   │   ├── clipping/       # Audio clipping workspace
│   │   ├── diarization/    # Upload & process audio
│   │   └── project/        # Projects & collections
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

**React Compiler**: The project uses the experimental React Compiler (`babel-plugin-react-compiler`). Do NOT use `useCallback`, `useMemo`, or `memo()` — the compiler handles memoization automatically (unless necessary in manual memoizations for dependecies of `useEffect`).

**tRPC Procedures**: Use `publicProcedure` or `protectedProcedure` from `~/server/api/trpc`. Context includes `db` and `session`.

**Effect Services**: Services use Effect.js Context.Tag pattern. Combine with `ServicesLive` layer from `~/services`.

**Database Schema**: Drizzle schema at `src/server/db/schema.ts`. Main entities: `projects`, `collections`, `clips`, `diarizations`, `files`.

**Path Alias**: Use `~/` to import from `src/` directory.

**Clipping Workspace State**: Complex audio editing state managed via Zustand store factory (`createClippingStore`) with React Context for scoped instances.

### Domain Model
- **Project** → has many **Collections** → has many **Clips**
- **Diarization** → processes audio files, produces speaker segments stored as JSONB
- **File** → S3-compatible storage reference (R2)
