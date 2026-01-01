# Audio Forge

A streamlined tool for creating speech datasets (like LJSpeech) from audio files. Upload audio, diarize speakers, curate segments, and export datasets with transcriptions.

## Product Overview

Audio Forge helps you transform raw audio into structured speech datasets by:
1. Uploading audio files
2. Running speaker diarization to identify speakers and segment audio
3. Curating segments in a clipping workspace (review, delete, adjust boundaries)
4. Assigning segments to project-level speakers
5. Processing segments into clips with transcriptions
6. Exporting datasets in standard formats (LJSpeech, etc.)

## Core Concepts

### Clipping Sessions
A workspace for processing a single audio file. Each session contains:
- Reference to the source audio file
- Segments (time ranges) belonging to project-level speakers
- Diarization job metadata (status, completion time, errors)

### Speakers
Project-level speaker identities that organize segments. Key rules:
- Speakers are **project-scoped** - they persist across sessions
- Diarization creates speakers with `SPEAKER_XX` naming convention
- `SPEAKER_*` speakers are **immutable** (no rename allowed) and hidden from project views
- Regular speakers (e.g., "John", "Sarah") represent real speaker identities
- Segments reference speakers directly - speakers ARE the "collections"

### Segments
Normalized time-range references within source audio. Key rules:
- Segments belong to a clipping session and reference a project-level speaker
- Segments are the **single source of truth** - no duplication across tables
- Editing a segment (start/end time, speaker assignment) propagates everywhere
- Deleting a segment is a **hard delete** - removed from database entirely
- Segments can be created via diarization or manually

### Clips
Processed outputs ready for dataset export. Key rules:
- Clips are created by processing segments
- Each clip references its **source segment** (speaker derived via segment → speaker)
- Clips have an **actual audio file** (nullable until processing completes)
- Clips include **transcription text** (required for speech datasets)
- Clips may include quality metrics (MOS score)

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIPPING WORKSPACE                             │
│                                                                          │
│  Audio File ──► Diarization ──► SPEAKER_XX (auto-created) + Segments   │
│                                      │                                   │
│                         ┌────────────┼────────────┐                     │
│                         ▼            ▼            ▼                     │
│                    SPEAKER_00   SPEAKER_01   SPEAKER_02                 │
│                    (hidden)     (hidden)     (hidden)                   │
│                         │            │            │                     │
│                         ▼            ▼            ▼                     │
│              ┌──────────────────────────────────────────────┐           │
│              │   USER REASSIGNS SEGMENTS TO REAL SPEAKERS    │           │
│              └──────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
        ┌───────────────────┐ ┌───────────────┐ ┌───────────────┐
        │     "John"        │ │    "Sarah"    │ │  SPEAKER_02   │
        │                   │ │               │ │  (unassigned) │
        │ - seg from Sess A │ │ - seg from A  │ │ - seg from C  │
        │ - seg from Sess B │ │ - seg from B  │ │               │
        │ - seg from Sess D │ │               │ │               │
        └─────────┬─────────┘ └───────┬───────┘ └───────────────┘
                  │                   │
                  ▼                   ▼
        ┌───────────────────┐ ┌───────────────┐
        │  PROCESS CLIPS    │ │ PROCESS CLIPS │
        │  + Transcription  │ │ + Transcription│
        └─────────┬─────────┘ └───────┬───────┘
                  │                   │
                  ▼                   ▼
        ┌───────────────────┐ ┌───────────────┐
        │  EXPORT DATASET   │ │ EXPORT DATASET│
        │  (LJSpeech, etc.) │ │               │
        └───────────────────┘ └───────────────┘
```

## Data Model

```sql
-- Project-level speakers (replaces collections concept)
speakers
├── id UUID PK
├── projectId UUID FK NOT NULL
├── userId UUID FK NOT NULL
├── name VARCHAR(255) NOT NULL      -- "SPEAKER_00" or "John"
├── color VARCHAR(50)               -- Optional custom color
├── createdAt TIMESTAMPTZ
└── updatedAt TIMESTAMPTZ

-- Normalized segments with speaker assignment
segments
├── id UUID PK
├── sessionId UUID FK NOT NULL      -- References clipping_session
├── speakerId UUID FK NOT NULL      -- References speaker (always assigned)
├── startTime DOUBLE PRECISION NOT NULL
├── endTime DOUBLE PRECISION NOT NULL
├── createdAt TIMESTAMPTZ
└── updatedAt TIMESTAMPTZ

-- Clipping sessions (workspace for single audio file)
clipping_sessions
├── id UUID PK
├── fileId UUID FK NOT NULL UNIQUE  -- 1:1 with file
├── projectId UUID FK NOT NULL
├── userId UUID FK NOT NULL
├── name VARCHAR(255)
├── diarization JSONB               -- Job metadata only (jobId, status, etc.)
├── createdAt TIMESTAMPTZ
└── updatedAt TIMESTAMPTZ

-- Clips reference segments (speaker derived via join)
clips
├── id UUID PK
├── userId UUID FK NOT NULL
├── segmentId UUID FK NOT NULL      -- Source segment
├── fileId UUID FK                  -- Processed audio (nullable until generated)
├── status ENUM('pending', 'processing', 'completed', 'failed')
├── errorMessage TEXT
├── transcription TEXT
├── mosScore DOUBLE PRECISION
├── createdAt TIMESTAMPTZ
└── updatedAt TIMESTAMPTZ
```

## Key Business Rules

1. **No segment duplication**: Segments live in one place, organized by speaker reference
2. **Speakers ARE collections**: The collections concept is replaced by project-level speakers
3. **SPEAKER_* convention**: Diarization speakers start with "SPEAKER_" prefix, are immutable and hidden from project views
4. **Hard deletes**: Deleting a segment removes it from the database entirely
5. **Clips reference segments**: Speaker is derived via clip → segment → speaker chain
6. **Session speaker delete**: Removing a speaker from a session deletes segments (not the speaker itself)

## Media Proxy (Planned)

To reduce storage costs, segment playback uses on-demand transcoding:
- Segments are streamed via `/api/media-proxy` (no pre-generated files)
- Source audio is cached locally (LRU, 1GB max, 1hr TTL)
- FFmpeg transcodes segments on-the-fly
- Clips (processed outputs) get actual files only when needed for export

## Tech Stack

- **Framework**: Next.js 15, React 19, TypeScript
- **Database**: PostgreSQL via Drizzle ORM
- **API**: tRPC v11
- **Auth**: better-auth
- **Storage**: Cloudflare R2
- **State**: Legend-State (clipping workspace)
- **Services**: Effect-ts
