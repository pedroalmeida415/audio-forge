# Voice Dataset Builder

A web application for building high-quality voice datasets for TTS (Text-to-Speech) training. Upload audio files, automatically identify speakers using AI-powered diarization, and extract clean audio clips organized by speaker.

## Features

- **Speaker Diarization** - Automatically identify and segment different speakers in audio files using [Pyannote](https://github.com/pyannote/pyannote-audio)
- **Waveform Editor** - Visual waveform display with draggable segment handles for precise timestamp adjustments
- **Flexible Organization** - Organize clips into collections within projects; segments can be assigned to any collection across projects
- **Clip Extraction** - Extract audio segments as individual clips (MP3, WAV, FLAC)
- **Audio Playback** - Preview clips directly in the browser

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Database**: [PostgreSQL](https://www.postgresql.org/) with [Drizzle ORM](https://orm.drizzle.team)
- **API**: [tRPC](https://trpc.io) for type-safe APIs
- **Storage**: [MinIO](https://min.io/) (S3-compatible object storage)
- **Diarization**: [Pyannote API](https://www.pyannote.ai/)
- **Audio Processing**: [FFmpeg](https://ffmpeg.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com/)
- **Linting**: [Biome](https://biomejs.dev/)

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Bun](https://bun.sh/) (recommended) or npm/pnpm
- [Docker](https://www.docker.com/) (for PostgreSQL and MinIO)
- [FFmpeg](https://ffmpeg.org/) installed and available in PATH
- [Pyannote API key](https://www.pyannote.ai/)

## Setup

### 1. Clone and install dependencies

```bash
git clone <repository-url>
cd t3-app
bun install
```

### 2. Start infrastructure services

```bash
docker compose up -d
```

This starts:
- PostgreSQL on port 5432
- MinIO on port 9000 (API) and 9001 (Console)

### 3. Configure environment variables

Copy the example environment file and configure:

```bash
cp .env.example .env
```

Required variables:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/voice_dataset"

# MinIO
MINIO_ENDPOINT="localhost"
MINIO_PORT="9000"
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"
MINIO_BUCKET="voice-dataset"
MINIO_USE_SSL="false"

# Pyannote
PYANNOTE_API_KEY="your-pyannote-api-key"
```

### 4. Initialize the database

```bash
bun db:push
```

### 5. Start the development server

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── @modal/             # Parallel route for modals
│   ├── clipping/           # Clipping workspace pages
│   ├── diarization/        # Diarization upload page
│   └── projects/           # Project management pages
├── components/
│   ├── clipping/           # Clipping workspace components
│   ├── diarization/        # Upload components
│   ├── nav/                # Navigation components
│   ├── projects/           # Project/collection components
│   ├── segments/           # Segment list components
│   ├── ui/                 # shadcn/ui components
│   └── waveform/           # Waveform viewer components
├── hooks/                  # React hooks
├── lib/                    # Utility functions
├── server/
│   ├── api/                # tRPC routers
│   ├── db/                 # Database schema and client
│   └── services/           # External service integrations
└── trpc/                   # tRPC client setup
```

## User Flow

1. **Diarize**: Upload an audio file for speaker diarization
2. **Clip**: Review segments, adjust timestamps, assign to collections
3. **Extract**: Generate audio clips from approved segments
4. **Organize**: Manage clips within project collections

## Scripts

```bash
bun dev           # Start development server
bun build         # Build for production
bun start         # Start production server
bun db:push       # Push schema changes to database
bun db:studio     # Open Drizzle Studio
bun biome:check -- <file-path>   # Check for linting issues
bun biome:fix -- <file-path>     # Auto-fix linting issues
```

## Architecture

- **Diarization jobs are global** - not tied to any project, allowing flexible organization
- **Segments can be assigned to any collection** - across any project
- **Projects contain collections** - which contain extracted clips
- **Original audio is preserved** - clips are extracted copies, originals remain in MinIO

## License

MIT
