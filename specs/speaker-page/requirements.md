---
spec: speaker-page
phase: requirements
created: 2026-01-15
---

# Requirements: Speaker Page

## Goal

Enable users to view, process, and export all audio segments belonging to a specific speaker across all clipping sessions, with associated clips and transcriptions, to prepare high-quality datasets for speech synthesis and machine learning applications.

**Scope Note:** This phase focuses on building the UI, data layer, and service interfaces with mock implementations. Actual third-party integrations for processing services (transcription, denoise, overlap removal) are deferred to a future phase. The mock implementations enable end-to-end demo workflow.

## User Stories

### US-1: View Speaker Segments

**As a** dataset creator
**I want to** see all segments belonging to a specific speaker in one place
**So that** I can review and manage all audio data for that speaker across sessions

**Acceptance Criteria:**
- [ ] AC-1.1: Page displays all segments where `speakerId` matches the target speaker
- [ ] AC-1.2: Segment audio can be played via lazy-loaded media-proxy endpoint
- [ ] AC-1.3: Loading spinner displays while segment audio downloads
- [ ] AC-1.4: Segment duration is visible (formatted as mm:ss.ms)
- [ ] AC-1.5: Page loads all segments in a single query (no pagination)

### US-2: View and Play Clips

**As a** dataset creator
**I want to** see generated clips alongside their source segments
**So that** I can verify the processed audio matches my expectations

**Acceptance Criteria:**
- [ ] AC-2.1: Each segment displays its associated clip (if exists) side-by-side
- [ ] AC-2.2: Clip audio can be played independently via lazy loading
- [ ] AC-2.3: Clips display their format and quality score (if available)
- [ ] AC-2.4: Visual indicator shows when segment has no clip yet
- [ ] AC-2.5: Loading spinner displays while clip audio downloads

### US-3: View and Edit Transcriptions

**As a** dataset creator
**I want to** see transcriptions below each segment/clip pair
**So that** I can verify accuracy and make corrections

**Acceptance Criteria:**
- [ ] AC-3.1: Transcription text displays below segment/clip pair
- [ ] AC-3.2: Empty state shows when transcription is missing
- [ ] AC-3.3: Transcription is editable inline with save/cancel
- [ ] AC-3.4: Character count displays for transcription text

### US-4: Filter Segments

**As a** dataset creator
**I want to** filter the segment list by various criteria
**So that** I can focus on specific subsets of data

**Acceptance Criteria:**
- [ ] AC-4.1: Filter by duration range (min/max seconds)
- [ ] AC-4.2: Filter by quality score range (1-5 MOS)
- [ ] AC-4.3: Filter by transcription status (has/missing transcription)
- [ ] AC-4.4: Filters are combined with AND logic
- [ ] AC-4.5: Filter controls appear in list header
- [ ] AC-4.6: Clear filters button resets all filters
- [ ] AC-4.7: Active filter count badge displays when filters applied

### US-5: View Speaker Statistics

**As a** dataset creator
**I want to** see aggregate statistics about the speaker's data
**So that** I can assess dataset quality and completeness

**Acceptance Criteria:**
- [ ] AC-5.1: Total segment count displays in sidebar
- [ ] AC-5.2: Total duration of all segments displays
- [ ] AC-5.3: Average MOS score displays (when scores exist)
- [ ] AC-5.4: MOS score distribution chart displays
- [ ] AC-5.5: Segment duration distribution chart displays
- [ ] AC-5.6: Transcription coverage percentage displays

### US-6: Trigger Transcription Processing

**As a** dataset creator
**I want to** transcribe segments that lack transcriptions
**So that** I can complete my dataset for export

**Acceptance Criteria:**
- [ ] AC-6.1: Transcribe action available in sidebar processing section
- [ ] AC-6.2: Can transcribe all segments without transcription (batch)
- [ ] AC-6.3: Can transcribe selected/filtered segments only
- [ ] AC-6.4: Jobs are queued via BullMQ (not processed inline)
- [ ] AC-6.5: Progress indicator shows pending transcription jobs
- [ ] AC-6.6: Clip is automatically generated if segment has none

### US-7: Trigger Audio Processing Operations

**As a** dataset creator
**I want to** apply audio processing operations (denoise, remove overlap)
**So that** I can improve clip quality for my dataset

**Acceptance Criteria:**
- [ ] AC-7.1: Denoise action available in sidebar processing section
- [ ] AC-7.2: Remove overlap action available in sidebar processing section
- [ ] AC-7.3: Processing operations create/update clips (additive)
- [ ] AC-7.4: All processing goes through BullMQ queue
- [ ] AC-7.5: Clip is automatically generated if segment has none before processing
- [ ] AC-7.6: Processing queue summary displays in sidebar (jobs pending/active)

### US-8: Delete Clip to Reset Processing

**As a** dataset creator
**I want to** delete a clip to restart processing from the source segment
**So that** I can undo processing mistakes

**Acceptance Criteria:**
- [ ] AC-8.1: Delete clip action available per segment
- [ ] AC-8.2: Confirmation dialog before deletion
- [ ] AC-8.3: Deleting clip removes R2 file and database record
- [ ] AC-8.4: Segment remains intact after clip deletion
- [ ] AC-8.5: Transcription is preserved when clip is deleted

### US-9: Export Dataset

**As a** dataset creator
**I want to** export clips with transcriptions in standard formats
**So that** I can use the data for speech synthesis training

**Acceptance Criteria:**
- [ ] AC-9.1: Export button in header opens export configuration modal
- [ ] AC-9.2: Can select audio format (WAV, FLAC, MP3)
- [ ] AC-9.3: Can configure sample rate (8000, 16000, 22050, 44100, 48000 Hz)
- [ ] AC-9.4: Can configure bit depth for WAV (16-bit, 24-bit)
- [ ] AC-9.5: Can configure mono/stereo output
- [ ] AC-9.6: LJSpeech preset auto-configures: 22050Hz, 16-bit mono WAV
- [ ] AC-9.7: Export includes only clips with transcriptions
- [ ] AC-9.8: Export generates metadata file (pipe-delimited CSV for LJSpeech)
- [ ] AC-9.9: ZIP is streamed directly to client (not stored in R2)
- [ ] AC-9.10: Progress indicator shows export progress
- [ ] AC-9.11: Export respects current filter selection

### US-10: Navigate Speaker Page

**As a** user
**I want to** easily navigate to and from the speaker page
**So that** I can efficiently work within the application

**Acceptance Criteria:**
- [ ] AC-10.1: Speaker page accessible via `/app/project/[projectId]/speaker/[speakerId]`
- [ ] AC-10.2: Header displays speaker name prominently
- [ ] AC-10.3: Back button returns to previous page
- [ ] AC-10.4: Page shows loading state while data fetches
- [ ] AC-10.5: 404 page displays if speaker not found

## Functional Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-1 | Add `transcription` column to segments table | P0 | Migration adds nullable TEXT column; existing segments unaffected |
| FR-2 | Create `clips` table with 1:1 segment relationship | P0 | Table has unique constraint on segmentId; includes storageKey, format, mosScore |
| FR-3 | tRPC endpoint to fetch all segments for a speaker | P0 | Returns segments with clips, ordered by startTime |
| FR-4 | Speaker page route and layout component | P0 | Renders header, list area, sidebar per design spec |
| FR-5 | Segment/clip core unit component | P0 | Renders segment, clip (if exists), transcription in specified layout |
| FR-6 | Lazy audio loading with media-proxy | P0 | Audio loads on-demand; spinner shows during load |
| FR-7 | Filter controls in list header | P1 | Duration, MOS score, transcription status filters |
| FR-8 | Speaker statistics sidebar section | P1 | Displays counts, averages, distribution charts |
| FR-9 | TranscriptionService interface + mock | P0 | Defines service protocol with mock implementation for demo |
| FR-10 | DenoiseService interface + mock | P1 | Defines service protocol with mock implementation for demo |
| FR-11 | OverlapRemovalService interface + mock | P1 | Defines service protocol with mock implementation for demo |
| FR-12 | ClipGenerationService interface + mock | P0 | Defines service protocol with mock implementation for demo |
| FR-13 | Processing queue integration | P0 | Jobs queued via BullMQ; sidebar shows queue status |
| FR-14 | Export configuration modal | P1 | Format, sample rate, bit depth, channel configuration |
| FR-15 | LJSpeech export preset | P1 | One-click configuration for LJSpeech format |
| FR-16 | Streaming ZIP export endpoint | P1 | Converts FLAC clips to target format; streams ZIP |
| FR-17 | Inline transcription editing | P2 | Edit, save, cancel transcription text |
| FR-18 | Delete clip functionality | P2 | Removes clip from R2 and database |
| FR-19 | Processing queue summary component | P1 | Shows pending/active job counts per operation type |
| FR-20 | Batch processing action triggers | P1 | Transcribe all, denoise all, based on filter/selection |

## Non-Functional Requirements

| ID | Requirement | Metric | Target |
|----|-------------|--------|--------|
| NFR-1 | Page load performance | Time to interactive | Under 2 seconds for 500 segments |
| NFR-2 | Audio playback latency | Time from click to audio start | Under 500ms for cached segments |
| NFR-3 | Export throughput | Clips processed per minute | Minimum 30 clips/minute conversion |
| NFR-4 | Queue processing reliability | Job success rate | 99% success with retry |
| NFR-5 | R2 storage efficiency | Storage format | FLAC for lossless compression |
| NFR-6 | Client memory management | Memory per segment | Under 5MB per visible segment |
| NFR-7 | Responsive layout | Breakpoint support | Desktop-first, minimum 1024px width |

## Glossary

- **Segment**: A time-bounded portion of audio from a clipping session, assigned to a speaker. Stored in `segments` table with startTime/endTime.
- **Clip**: A processed audio file derived from a segment, stored in R2 as FLAC. One clip per segment maximum.
- **Transcription**: Text representation of the spoken content in a segment. Stored as column in segments table.
- **MOS Score**: Mean Opinion Score (1-5 scale) indicating perceived audio quality. Used for filtering, not automated scoring.
- **LJSpeech**: A standard TTS dataset format using 22050Hz, 16-bit mono WAV with pipe-delimited metadata.
- **Processing Queue**: BullMQ-backed job queue for async operations (transcription, denoise, clip generation).
- **Media Proxy**: API endpoint that streams audio from R2 with optional time-slice support via FFmpeg.
- **Local Speaker**: Diarization-generated speaker identity stored in session JSONB (names like SPEAKER_00).
- **Project Speaker**: User-created speaker identity stored in speakers table (real names like "John").

## Out of Scope

- Clip history/versioning (only latest clip retained)
- Automated MOS scoring (manual annotation only)
- Cursor-based pagination (fetch all segments at once)
- Mobile-responsive layout (desktop-only for v1)
- Real-time collaboration (single-user workflow)
- **Actual processing service implementations** - All services (TranscriptionService, DenoiseService, OverlapRemovalService, ClipGenerationService) will have mock implementations only. Third-party integrations deferred to later phase.
- Batch speaker operations across multiple speakers
- Segment merging or splitting from speaker page
- Custom export format templates beyond presets
- Export to cloud storage (local download only)

## Dependencies

- **Schema Migration**: Requires database migration to add transcription column and clips table
- **BullMQ Infrastructure**: Existing Redis/BullMQ setup must be extended for new job types
- **FFmpeg**: Required for audio format conversion during export (already available)
- **R2 Storage**: Clips stored in R2 using existing storage patterns
- **Media Proxy**: Existing endpoint supports segment audio; needs extension for clip audio
- **Effect Library**: Service interfaces follow existing Effect.js patterns

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large segment counts may impact performance | High | Implement virtual scrolling for list; optimize query with indexes |
| Export of many clips may timeout | Medium | Use streaming ZIP; implement chunked processing |
| Queue backlog during batch operations | Medium | Rate limiting; queue priority levels |

## Success Criteria

1. User can view all segments for a speaker in under 2 seconds
2. User can play segment and clip audio with lazy loading
3. User can filter segments by duration, MOS score, and transcription status
4. User can trigger batch transcription for segments without transcriptions
5. User can export filtered clips as LJSpeech-format ZIP
6. All processing operations go through queue with visible status
7. Service interfaces with mock implementations enable end-to-end demo workflow (actual third-party integrations deferred)
