# Audio Forge

A tool for creating high-quality speech datasets (LJSpeech format) from audio files. Upload audio, diarize speakers, curate segments in a workspace, and export datasets with transcriptions for TTS and ASR training.

It is for speech dataset creators and researchers preparing recordings for text-to-speech (TTS) or automatic speech recognition (ASR) training.

## Built With

- Next.js 15, React 19, and TypeScript
- Bun for package management and worker/media-server runtime
- PostgreSQL with Drizzle ORM, and Redis with BullMQ for background jobs
- tRPC for application APIs
- Cloudflare R2 for audio storage
- Pyannote for diarization, plus configurable VibeVoice ASR and speech-processing services

## Run Locally

### Prerequisites

- Bun and Docker Compose
- GitHub OAuth application credentials
- Cloudflare R2 credentials and buckets
- A Pyannote API key and a public webhook URL for diarization callbacks
- VibeVoice ASR and speech-processing services for transcription, denoising, and quality scoring

The web app can start without live provider credentials if the placeholder values are left in place, but provider-backed workflows will not work until you configure the services above.

### Setup

```sh
git clone git@github.com:pedroalmeida415/audio-forge.git
cd audio-forge
bun install
cp .env.example .env
```

Edit `.env` and replace the placeholder values. Keep the database password in `DATABASE_URL` and `POSTGRES_PASSWORD` the same. Never commit `.env` or real credentials.

Start the local database and queue, apply the database schema, and start Next.js:

```sh
docker compose up -d postgres redis
bun run db:push
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). The app expects PostgreSQL and the required environment variables in `.env`; set the provider URLs and credentials before using external services.

### Background services

Run these in separate terminals when you need their functionality:

```sh
bun run worker:start  # audio processing jobs
bun run media:start   # audio streaming and cache server
bun run worker:admin  # BullMQ job dashboard
```

The worker and media server use `MEDIA_SERVER_URL` and the configured speech-processing service. Set up the VibeVoice ASR service separately and point `VIBEVOICE_ASR_URL` to it. `start-database.sh` is an alternative for starting a local PostgreSQL container; use the Docker Compose instructions above when you also need Redis.

## How It Works

1. **Upload audio** (or video, which gets audio extracted)
2. **Run speaker diarization** to automatically identify speakers and segment audio
3. **Curate segments** in the workspace: review, delete, adjust boundaries, add transcriptions
4. **Reassign segments** from diarization speakers (`SPEAKER_XX`) to real project-level speakers
5. **Process segments** into clips with denoising and quality scoring
6. **Export datasets** in LJSpeech format per speaker

## Core Concepts

### Projects

Top-level container. Everything (sources, speakers, segments) is project-scoped.

### Sources

An uploaded audio file with its processing metadata. Each source tracks:
- The original audio file in cloud storage
- Waveform generation status (for timeline visualization)
- Diarization job status (pending, running, completed, failed)

Sources replace the old separate "files" and "clipping sessions" concepts.

### Speakers

Project-level speaker identities that organize segments. Two origins:
- **Diarization speakers** (`origin: "diarization"`): auto-created during diarization with `SPEAKER_XX` naming. Linked to a specific source. Hidden from project-level views.
- **User speakers** (`origin: "user"`): manually created by the user (e.g., "John", "Sarah"). Persist across sources. These are the real speaker identities.

### Segments

Time ranges within a source audio file, always assigned to one speaker. Segments are the single source of truth for time boundaries. They can carry:
- Transcription text
- Tags (array of strings)
- Audio quality scores (DNSMOS)

Created via diarization or manually via the timeline drag-to-select UI.

### Clips

Processed audio outputs from segments (1:1 relationship). Created when a segment is processed through the denoising pipeline. Clips get their own audio file in storage and carry quality scores.

### Workspace

Unified view for managing a project's audio data. Users can filter by source or by speaker, view/edit segments in a table, and use the clip studio timeline for waveform visualization, playback, and segment creation.

## Data Flow

```
Source Upload ──> Diarization ──> SPEAKER_XX speakers + segments created
                                        |
                     ┌──────────────────┼──────────────────┐
                     v                  v                  v
                SPEAKER_00         SPEAKER_01         SPEAKER_02
                (hidden)           (hidden)           (hidden)
                     |                  |                  |
                     v                  v                  v
              ┌─────────────────────────────────────────────────┐
              │        User reassigns segments to speakers       │
              └─────────────────────────────────────────────────┘
                     |                  |
                     v                  v
               "John"              "Sarah"
            (user speaker)      (user speaker)
                     |                  |
                     v                  v
              Process clips       Process clips
            (denoise + score)   (denoise + score)
                     |                  |
                     v                  v
              Export dataset      Export dataset
             (LJSpeech ZIP)     (LJSpeech ZIP)
```

## Business Rules

1. **No segment duplication**: segments live in one table, organized by speaker reference
2. **Speakers ARE collections**: segments are grouped by their speaker assignment
3. **Diarization speakers are immutable**: `SPEAKER_XX` names cannot be renamed and are hidden from project-level views
4. **Hard deletes**: deleting a segment removes it from the database entirely (cascade removes its clip)
5. **Clips reference segments**: speaker is derived via clip -> segment -> speaker
6. **Speaker delete cascades**: deleting a speaker cascades to its segments and their clips
7. **Source delete cascades**: deleting a source cascades to its segments, clips, and linked diarization speakers
8. **Select-all with exclusions**: bulk operations support "all except these" pattern for efficient server-side processing
9. **Auto-scoring pipeline**: processing a clip auto-enqueues a quality scoring job on completion

## Dataset Export

LJSpeech export per speaker:
- WAV files (mono, 16-bit, configurable sample rate 8000-48000 Hz)
- `metadata.csv` with pipe-delimited format: `filename|transcription|normalized_transcription`
- Delivered as a ZIP archive with a time-limited download URL
- Only segments with both a clip AND transcription are included
