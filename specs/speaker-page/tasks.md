---
spec: speaker-page
phase: tasks
total_tasks: 42
created: 2026-01-16
---

# Tasks: Speaker Page

## Phase 1: Make It Work (POC)

Focus: Validate the idea works end-to-end. Skip tests, accept hardcoded values, get core functionality working.

### Database Layer

- [x] 1.1 Add transcription column to segments table
  - **Do**: Add nullable `transcription` TEXT column to segments table in schema.ts
  - **Files**: `src/server/db/schema.ts`
  - **Done when**: Schema has transcription column, type exports include it
  - **Verify**: `bun run db:push` succeeds
  - **Commit**: `feat(db): add transcription column to segments table`
  - _Requirements: FR-1_
  - _Design: Database Schema Changes_

- [x] 1.2 Create clips table with enum and relations
  - **Do**:
    1. Add `clipStatus` pgEnum with values: pending, processing, completed, failed
    2. Create `clips` table with: id, segmentId (unique constraint), storageKey, duration, status, errorMessage, mosScore, isDenoised, hasOverlapRemoved, timestamps
    3. Add indexes on segmentId and status
    4. Add clipRelations (one-to-one with segment)
    5. Update segmentRelations to include clip relation
    6. Export Clip type
  - **Files**: `src/server/db/schema.ts`
  - **Done when**: Clips table defined with all columns, relations, and types exported
  - **Verify**: `bun run db:push` succeeds
  - **Commit**: `feat(db): create clips table with 1:1 segment relationship`
  - _Requirements: FR-2_
  - _Design: Database Schema Changes - clips table_

- [x] 1.3 [VERIFY] Quality checkpoint: database schema
  - **Do**: Run lint check and verify types via MCP getDiagnostics on schema.ts
  - **Verify**: `bun run biome:check -- "src/server/db/schema.ts"` exits 0, no type errors
  - **Done when**: No lint errors, no type errors
  - **Commit**: `chore(db): pass quality checkpoint` (only if fixes needed)

### Service Layer (Effect.js)

- [x] 1.4 Create TranscriptionService interface with mock implementation
  - **Do**:
    1. Create service file with TranscribeParams, TranscribeResult interfaces
    2. Define TranscriptionService using Context.Tag pattern
    3. Define TranscriptionError using Data.TaggedError
    4. Implement MockTranscriptionServiceLive that returns placeholder text
  - **Files**: `src/services/transcription/transcription-service.ts`
  - **Done when**: Service interface and mock layer exported
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(services): add TranscriptionService interface with mock`
  - _Requirements: FR-9_
  - _Design: Service Interfaces - TranscriptionService_

- [x] 1.5 Create ClipGenerationService interface with mock implementation
  - **Do**:
    1. Create service file with GenerateClipParams, GenerateClipResult interfaces
    2. Define ClipGenerationService using Context.Tag pattern
    3. Define ClipGenerationError using Data.TaggedError
    4. Implement MockClipGenerationServiceLive that returns empty buffer
  - **Files**: `src/services/clip/clip-generation-service.ts`
  - **Done when**: Service interface and mock layer exported
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(services): add ClipGenerationService interface with mock`
  - _Requirements: FR-12_
  - _Design: Service Interfaces - ClipGenerationService_

- [x] 1.6 Create DenoiseService interface with mock implementation
  - **Do**:
    1. Create service file with DenoiseParams, DenoiseResult interfaces
    2. Define DenoiseService using Context.Tag pattern
    3. Define DenoiseError using Data.TaggedError
    4. Implement MockDenoiseServiceLive that returns input unchanged
  - **Files**: `src/services/denoise/denoise-service.ts`
  - **Done when**: Service interface and mock layer exported
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(services): add DenoiseService interface with mock`
  - _Requirements: FR-10_
  - _Design: Service Interfaces - DenoiseService_

- [x] 1.7 Create OverlapRemovalService interface with mock implementation
  - **Do**:
    1. Create service file with OverlapRemovalParams, OverlapRemovalResult interfaces
    2. Define OverlapRemovalService using Context.Tag pattern
    3. Define OverlapRemovalError using Data.TaggedError
    4. Implement MockOverlapRemovalServiceLive that returns input unchanged
  - **Files**: `src/services/overlap/overlap-removal-service.ts`
  - **Done when**: Service interface and mock layer exported
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(services): add OverlapRemovalService interface with mock`
  - _Requirements: FR-11_
  - _Design: Service Interfaces - OverlapRemovalService_

- [x] 1.8 [VERIFY] Quality checkpoint: services
  - **Do**: Run lint check on all new service files
  - **Verify**: `bun run biome:check -- "src/services/transcription" && bun run biome:check -- "src/services/clip" && bun run biome:check -- "src/services/denoise" && bun run biome:check -- "src/services/overlap"` exits 0
  - **Done when**: No lint errors, no type errors
  - **Commit**: `chore(services): pass quality checkpoint` (only if fixes needed)

- [x] 1.9 Extend QueueService with clip processing and transcription methods
  - **Do**:
    1. Add ClipProcessingJobPayload and TranscriptionJobPayload interfaces
    2. Add ClipProcessingEnqueueResult and TranscriptionEnqueueResult interfaces
    3. Extend QueueService interface with: enqueueClipProcessing, enqueueTranscription, getProcessingQueueStatus
  - **Files**: `src/services/queue/queue-service.ts`
  - **Done when**: Queue service interface includes new methods
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(queue): extend QueueService with clip and transcription methods`
  - _Requirements: FR-13_
  - _Design: Queue Job Types_

- [ ] 1.10 Implement BullMQ queues for clip processing and transcription
  - **Do**:
    1. Create clip-processing Queue with same config pattern as waveform
    2. Create transcription Queue with same config pattern as waveform
    3. Implement enqueueClipProcessing method
    4. Implement enqueueTranscription method
    5. Implement getProcessingQueueStatus method (returns waiting/active counts)
  - **Files**: `src/services/queue/bullmq-queue-service.ts`
  - **Done when**: Both queues created and all methods implemented
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(queue): implement BullMQ clip-processing and transcription queues`
  - _Requirements: FR-13_
  - _Design: Queue Layer_

- [ ] 1.11 Update services index to export new services
  - **Do**:
    1. Import and export TranscriptionService, ClipGenerationService, DenoiseService, OverlapRemovalService
    2. Add mock service layers to ServicesLive (use mock implementations for now)
  - **Files**: `src/services/index.ts`
  - **Done when**: All new services exported and layers merged
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(services): export new processing services`
  - _Design: Service Layer_

- [ ] 1.12 [VERIFY] Quality checkpoint: queue and services index
  - **Do**: Run lint check and type verification
  - **Verify**: `bun run biome:check -- "src/services"` exits 0, no type errors via MCP
  - **Done when**: No lint errors, no type errors
  - **Commit**: `chore(services): pass quality checkpoint` (only if fixes needed)

### tRPC Router

- [ ] 1.13 Create speaker tRPC router with getWithSegments endpoint
  - **Do**:
    1. Create speaker router file
    2. Implement getWithSegments procedure: input speakerId, query speaker + segments with clips and session info, verify ownership
    3. Return structure: { speaker, segments: SegmentWithClip[] }
  - **Files**: `src/server/api/routers/speaker.ts`
  - **Done when**: Router returns speaker data with segments and clips
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(api): create speaker router with getWithSegments`
  - _Requirements: FR-3, AC-1.1, AC-1.5_
  - _Design: tRPC Router - getWithSegments_

- [ ] 1.14 Add updateTranscription mutation to speaker router
  - **Do**:
    1. Add updateTranscription procedure: input segmentId + transcription text
    2. Verify ownership via segment -> speaker -> project -> user chain
    3. Update segment.transcription in database
  - **Files**: `src/server/api/routers/speaker.ts`
  - **Done when**: Mutation updates transcription and returns success
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(api): add updateTranscription mutation`
  - _Requirements: AC-3.3_
  - _Design: tRPC Router - updateTranscription_

- [ ] 1.15 Add enqueueTranscription and enqueueProcessing mutations
  - **Do**:
    1. Add enqueueTranscription: input segmentIds array, queue jobs via QueueService
    2. Add enqueueProcessing: input segmentIds + operations array, queue processing jobs
    3. Return count of queued jobs
  - **Files**: `src/server/api/routers/speaker.ts`
  - **Done when**: Both mutations queue jobs and return counts
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(api): add enqueue mutations for transcription and processing`
  - _Requirements: AC-6.4, AC-7.4_
  - _Design: tRPC Router - enqueueTranscription, enqueueProcessing_

- [ ] 1.16 Add deleteClip and getQueueStatus to speaker router
  - **Do**:
    1. Add deleteClip: input clipId, delete from R2 via StorageService, delete from DB
    2. Add getQueueStatus: return processing queue counts from QueueService
  - **Files**: `src/server/api/routers/speaker.ts`
  - **Done when**: Both procedures work as expected
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(api): add deleteClip and getQueueStatus to speaker router`
  - _Requirements: AC-8.3, AC-7.6_
  - _Design: tRPC Router - deleteClip, getQueueStatus_

- [ ] 1.17 Add getClipPresignedUrl query to speaker router
  - **Do**:
    1. Add getClipPresignedUrl: input clipId, verify ownership
    2. Generate pre-signed URL using StorageService with 15 min expiration
    3. Return { url, expiresAt }
  - **Files**: `src/server/api/routers/speaker.ts`
  - **Done when**: Query returns pre-signed URL with expiration
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(api): add getClipPresignedUrl query`
  - _Design: tRPC Router - getClipPresignedUrl_

- [ ] 1.18 Register speaker router in root router
  - **Do**: Import speakerRouter and add to appRouter
  - **Files**: `src/server/api/root.ts`
  - **Done when**: Speaker router accessible via api.speaker
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(api): register speaker router`
  - _Design: File Structure - root.ts modify_

- [ ] 1.19 [VERIFY] Quality checkpoint: tRPC router
  - **Do**: Run lint check on router files
  - **Verify**: `bun run biome:check -- "src/server/api/routers/speaker.ts" && bun run biome:check -- "src/server/api/root.ts"` exits 0
  - **Done when**: No lint errors, no type errors
  - **Commit**: `chore(api): pass quality checkpoint` (only if fixes needed)

### Speaker Page UI - Core Structure

- [ ] 1.20 Create speaker page store with Legend-State
  - **Do**:
    1. Define SpeakerPageStoreState interface with: speakerId, projectId, speaker, segments, filters, selectedSegmentIds
    2. Define filter types and default values
    3. Implement computed filteredSegments() based on filters
    4. Implement statistics() computed (totals, averages, distributions)
    5. Implement actions: setFilter, clearFilters, toggleSegmentSelection, selectAll, clearSelection, updateTranscription
  - **Files**: `src/features/speaker/store/speaker-store.ts`
  - **Done when**: Store factory function returns typed observable
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(speaker): create speaker page Legend-State store`
  - _Design: SpeakerPageStore_

- [ ] 1.21 Create histogram calculation utility
  - **Do**:
    1. Create histogram.ts with calculateHistogram function
    2. Input: array of numbers, bucketCount (default 10)
    3. Output: { buckets: HistogramBucket[], min, max, bucketSize }
    4. Handle edge cases: empty array, single value, all same values
  - **Files**: `src/features/speaker/utils/histogram.ts`
  - **Done when**: Function returns correct histogram data
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(speaker): add histogram calculation utility`
  - _Design: Statistics Section - Histogram Implementation_

- [ ] 1.22 Create store context provider and hook
  - **Do**:
    1. Create SpeakerStoreProvider component that initializes store
    2. Create useSpeakerStore hook for accessing store
    3. Follow clipping feature context pattern
  - **Files**: `src/features/speaker/context/store-context.tsx`
  - **Done when**: Provider and hook export correctly
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(speaker): create store context provider`
  - _Design: SpeakerPageStore_

- [ ] 1.23 [VERIFY] Quality checkpoint: store layer
  - **Do**: Run lint check on store files
  - **Verify**: `bun run biome:check -- "src/features/speaker"` exits 0
  - **Done when**: No lint errors, no type errors
  - **Commit**: `chore(speaker): pass quality checkpoint` (only if fixes needed)

- [ ] 1.24 Create speaker page route with data fetching
  - **Do**:
    1. Create page.tsx with server component
    2. Fetch speaker via tRPC prefetch or server-side call
    3. Wrap with SpeakerStoreProvider
    4. Render SpeakerPageContent client component (placeholder for now)
    5. Handle notFound() if speaker not found
  - **Files**: `src/app/(app)/app/project/[projectId]/speaker/[speakerId]/page.tsx`
  - **Done when**: Page route renders with fetched data
  - **Verify**: Navigate to `/app/project/{id}/speaker/{id}` in browser, see page
  - **Commit**: `feat(speaker): create speaker page route`
  - _Requirements: FR-4, AC-10.1_
  - _Design: Speaker Page Route_

- [ ] 1.25 Create loading and not-found pages
  - **Do**:
    1. Create loading.tsx with spinner/skeleton
    2. Create not-found.tsx with message and back link
  - **Files**:
    - `src/app/(app)/app/project/[projectId]/speaker/[speakerId]/loading.tsx`
    - `src/app/(app)/app/project/[projectId]/speaker/[speakerId]/not-found.tsx`
  - **Done when**: Loading state shows, 404 page works
  - **Verify**: Manually test loading and invalid speaker ID
  - **Commit**: `feat(speaker): add loading and not-found pages`
  - _Requirements: AC-10.4, AC-10.5_
  - _Design: Speaker Page Route_

- [ ] 1.26 Create speaker header component
  - **Do**:
    1. Create speaker-header.tsx
    2. Display back button (link to project), speaker name, export button
    3. Export button triggers onExportClick callback (modal wiring later)
  - **Files**: `src/features/speaker/components/speaker-header.tsx`
  - **Done when**: Header renders with all elements
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(speaker): create speaker header component`
  - _Requirements: AC-10.2, AC-10.3_
  - _Design: Speaker Header_

- [ ] 1.27 [VERIFY] Quality checkpoint: page components
  - **Do**: Run lint check on page and component files
  - **Verify**: `bun run biome:check -- "src/app/(app)/app/project/[projectId]/speaker" && bun run biome:check -- "src/features/speaker/components"` exits 0
  - **Done when**: No lint errors, no type errors
  - **Commit**: `chore(speaker): pass quality checkpoint` (only if fixes needed)

### Speaker Page UI - Audio Players

- [ ] 1.28 Create segment audio player with lazy loading
  - **Do**:
    1. Create segment-audio-player.tsx
    2. On first play, fetch blob from media-proxy with storageKey, startMs, endMs
    3. Create blob URL, set as audio src
    4. Show loading spinner during fetch
    5. Revoke blob URL on unmount
    6. Display duration label
  - **Files**: `src/features/speaker/components/segment-audio-player.tsx`
  - **Done when**: Player lazily loads and plays segment audio
  - **Verify**: Manually test audio playback in browser
  - **Commit**: `feat(speaker): create segment audio player with lazy loading`
  - _Requirements: FR-6, AC-1.2, AC-1.3_
  - _Design: Segment Audio Player_

- [ ] 1.29 Create clip audio player with pre-signed URL caching
  - **Do**:
    1. Create clip-audio-player.tsx
    2. On first play, call speaker.getClipPresignedUrl via tRPC
    3. Cache URL with expiresAt timestamp
    4. Check expiration before subsequent plays, re-fetch if needed
    5. Show loading spinner during URL fetch
    6. Display MOS badge, denoised/overlap badges if applicable
  - **Files**: `src/features/speaker/components/clip-audio-player.tsx`
  - **Done when**: Player fetches URL, caches, and plays
  - **Verify**: Manually test with a clip
  - **Commit**: `feat(speaker): create clip audio player with presigned URL caching`
  - _Requirements: AC-2.2, AC-2.3, AC-2.5_
  - _Design: Clip Audio Player_

- [ ] 1.30 Create segment unit card component
  - **Do**:
    1. Create segment-unit-card.tsx
    2. Render segment audio player (left) and clip audio player or "No clip" indicator (right)
    3. Render transcription below (or empty state)
    4. Display duration formatted as mm:ss.ms
    5. Selection checkbox, delete clip button
    6. Basic styling with Tailwind
  - **Files**: `src/features/speaker/components/segment-unit-card.tsx`
  - **Done when**: Card renders segment/clip/transcription layout
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(speaker): create segment unit card component`
  - _Requirements: FR-5, AC-1.4, AC-2.1, AC-2.4, AC-3.1, AC-3.2_
  - _Design: Segment Unit Card_

- [ ] 1.31 [VERIFY] Quality checkpoint: audio components
  - **Do**: Run lint check on audio player components
  - **Verify**: `bun run biome:check -- "src/features/speaker/components"` exits 0
  - **Done when**: No lint errors, no type errors
  - **Commit**: `chore(speaker): pass quality checkpoint` (only if fixes needed)

### Speaker Page UI - List and Sidebar

- [ ] 1.32 Create segment list component
  - **Do**:
    1. Create segment-list.tsx
    2. Render list header (placeholder for filters)
    3. Map filtered segments from store to SegmentUnitCard
    4. Handle selection toggle
    5. Show empty state when no segments match filters
  - **Files**: `src/features/speaker/components/segment-list.tsx`
  - **Done when**: List renders cards for all filtered segments
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(speaker): create segment list component`
  - _Design: Segment List_

- [ ] 1.33 Create transcription editor component
  - **Do**:
    1. Create transcription-editor.tsx
    2. Display text or "No transcription" empty state
    3. Click to enter edit mode with textarea
    4. Save/Cancel buttons
    5. Character count display
    6. Call store.updateTranscription on save (optimistic)
  - **Files**: `src/features/speaker/components/transcription-editor.tsx`
  - **Done when**: Editor toggles modes, saves changes
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(speaker): create inline transcription editor`
  - _Requirements: FR-17, AC-3.3, AC-3.4_
  - _Design: Inline Transcription Editor_

- [ ] 1.34 Create statistics section component
  - **Do**:
    1. Create statistics-section.tsx
    2. Display: total segments, total duration, average MOS, transcription coverage %
    3. Render MOS distribution histogram (simple bar chart)
    4. Render duration distribution histogram
    5. Use histogram utility for calculations
  - **Files**: `src/features/speaker/components/statistics-section.tsx`
  - **Done when**: Statistics display with histograms
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(speaker): create statistics section with histograms`
  - _Requirements: FR-8, AC-5.1, AC-5.2, AC-5.3, AC-5.4, AC-5.5, AC-5.6_
  - _Design: Statistics Section_

- [ ] 1.35 Create processing actions section
  - **Do**:
    1. Create processing-actions.tsx
    2. Transcribe button: transcribe selected or all missing
    3. Denoise button: denoise selected
    4. Remove overlap button: process selected
    5. Call tRPC mutations on click
    6. Disable when no valid targets
  - **Files**: `src/features/speaker/components/processing-actions.tsx`
  - **Done when**: Buttons trigger queue mutations
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(speaker): create processing actions section`
  - _Requirements: FR-20, AC-6.1, AC-6.2, AC-6.3, AC-7.1, AC-7.2_
  - _Design: Processing Actions Section_

- [ ] 1.36 Create queue status section
  - **Do**:
    1. Create queue-status.tsx
    2. Poll getQueueStatus every 5 seconds
    3. Display waiting/active counts by job type
    4. Show processing indicator when jobs active
  - **Files**: `src/features/speaker/components/queue-status.tsx`
  - **Done when**: Queue status displays and auto-updates
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(speaker): create queue status section`
  - _Requirements: FR-19, AC-6.5, AC-7.6_
  - _Design: Queue Status Section_

- [ ] 1.37 Create speaker sidebar container
  - **Do**:
    1. Create speaker-sidebar.tsx
    2. Compose StatisticsSection (top) and ProcessingActions + QueueStatus (bottom)
    3. Style with proper spacing
  - **Files**: `src/features/speaker/components/speaker-sidebar.tsx`
  - **Done when**: Sidebar renders all sections
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(speaker): create speaker sidebar container`
  - _Design: Speaker Sidebar_

- [ ] 1.38 Create filter controls component
  - **Do**:
    1. Create filter-controls.tsx
    2. Duration range sliders (min/max seconds)
    3. MOS score range sliders (1-5)
    4. Transcription status radio (all/has/missing)
    5. Clear filters button
    6. Active filter count badge
  - **Files**: `src/features/speaker/components/filter-controls.tsx`
  - **Done when**: Filters update store state
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(speaker): create filter controls component`
  - _Requirements: FR-7, AC-4.1, AC-4.2, AC-4.3, AC-4.4, AC-4.5, AC-4.6, AC-4.7_
  - _Design: Filter Controls_

- [ ] 1.39 Wire up speaker page layout
  - **Do**:
    1. Update speaker page to render: SpeakerHeader, SegmentList (with FilterControls), SpeakerSidebar
    2. Create component index file for exports
    3. Apply page layout styling (header full width, list + sidebar below)
  - **Files**:
    - `src/app/(app)/app/project/[projectId]/speaker/[speakerId]/page.tsx`
    - `src/features/speaker/components/index.ts`
  - **Done when**: Full page layout renders with all components
  - **Verify**: Navigate to speaker page in browser, see complete layout
  - **Commit**: `feat(speaker): wire up complete page layout`
  - _Requirements: FR-4_
  - _Design: Speaker Page Route_

- [ ] 1.40 [VERIFY] Quality checkpoint: full POC
  - **Do**: Run lint check on all speaker feature files
  - **Verify**: `bun run biome:check -- "src/features/speaker" && bun run biome:check -- "src/app/(app)/app/project/[projectId]/speaker"` exits 0
  - **Done when**: No lint errors, no type errors
  - **Commit**: `chore(speaker): pass quality checkpoint` (only if fixes needed)

- [ ] 1.41 POC Checkpoint
  - **Do**: Verify feature works end-to-end:
    1. Navigate to speaker page from project
    2. See list of segments with audio players
    3. Play segment audio (lazy loads from media-proxy)
    4. Edit transcription inline
    5. Apply filters and see list update
    6. See statistics in sidebar
    7. Trigger processing action (jobs queued)
  - **Done when**: Core speaker page flow demonstrable
  - **Verify**: Manual walkthrough of all POC features
  - **Commit**: `feat(speaker): complete POC for speaker page`
  - _Requirements: US-1, US-2, US-3, US-4, US-5, US-6_

## Phase 2: Refactoring

After POC validated, clean up code and add missing features.

- [ ] 2.1 Create export modal component
  - **Do**:
    1. Create export-modal.tsx with Dialog
    2. Audio format select (WAV, FLAC, MP3)
    3. Sample rate select (8000, 16000, 22050, 44100, 48000)
    4. Bit depth select for WAV (16, 24)
    5. Channels select (mono, stereo)
    6. LJSpeech preset button (auto-fills 22050, 16-bit, mono)
    7. Export button triggers download
  - **Files**: `src/features/speaker/components/export-modal.tsx`
  - **Done when**: Modal configures and triggers export
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(speaker): create export configuration modal`
  - _Requirements: FR-14, FR-15, AC-9.1, AC-9.2, AC-9.3, AC-9.4, AC-9.5, AC-9.6_
  - _Design: Export Modal_

- [ ] 2.2 Create streaming ZIP export utilities
  - **Do**:
    1. Create stream-zip.ts with createZipStream function
    2. Use archiver library for ZIP creation
    3. Support adding files and metadata CSV
    4. Convert Node stream to Web ReadableStream for Next.js
  - **Files**: `src/lib/export/stream-zip.ts`
  - **Done when**: Utility creates streaming ZIP
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(export): create streaming ZIP utilities`
  - _Design: Export Flow_

- [ ] 2.3 Create FFmpeg format conversion utilities
  - **Do**:
    1. Create ffmpeg-convert.ts
    2. Function to convert buffer from FLAC to target format
    3. Support WAV (with sample rate, bit depth), MP3, FLAC passthrough
    4. Support mono/stereo conversion
  - **Files**: `src/lib/export/ffmpeg-convert.ts`
  - **Done when**: Conversion functions work for all formats
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(export): create FFmpeg format conversion utilities`
  - _Design: Export Flow_

- [ ] 2.4 Create speaker export API endpoint
  - **Do**:
    1. Create route.ts as GET handler
    2. Accept query params: speakerId, format, sampleRate, bitDepth, channels, filterParams
    3. Verify user ownership
    4. Fetch clips with transcriptions (respect filters)
    5. Stream clips from R2, convert via FFmpeg, add to ZIP
    6. Generate metadata.csv (pipe-delimited for LJSpeech)
    7. Stream ZIP response
  - **Files**: `src/app/api/export/speaker/route.ts`
  - **Done when**: Endpoint streams ZIP download
  - **Verify**: Manually test export download
  - **Commit**: `feat(export): create streaming speaker export endpoint`
  - _Requirements: FR-16, AC-9.7, AC-9.8, AC-9.9, AC-9.10, AC-9.11_
  - _Design: Export Flow_

- [ ] 2.5 [VERIFY] Quality checkpoint: export feature
  - **Do**: Run lint check on export files
  - **Verify**: `bun run biome:check -- "src/lib/export" && bun run biome:check -- "src/app/api/export"` exits 0
  - **Done when**: No lint errors, no type errors
  - **Commit**: `chore(export): pass quality checkpoint` (only if fixes needed)

- [ ] 2.6 Create processing worker for clips
  - **Do**:
    1. Create processing-worker.ts following waveform-worker pattern
    2. Process clip-processing queue jobs
    3. For each job: check if clip exists, if not generate via ClipGenerationService
    4. Apply operations (denoise, overlap) via respective services
    5. Upload result to R2, update clip record
  - **Files**: `workers/processing-worker.ts`
  - **Done when**: Worker processes clip jobs
  - **Verify**: Queue job creates/updates clip
  - **Commit**: `feat(worker): create clip processing worker`
  - _Requirements: AC-7.3, AC-7.5_
  - _Design: Workers - processing-worker.ts_

- [ ] 2.7 Create transcription worker
  - **Do**:
    1. Create transcription-worker.ts following waveform-worker pattern
    2. Process transcription queue jobs
    3. For each job: ensure clip exists (generate if needed), get audio, call TranscriptionService
    4. Update segment.transcription in DB
  - **Files**: `workers/transcription-worker.ts`
  - **Done when**: Worker transcribes segments
  - **Verify**: Queue job updates transcription
  - **Commit**: `feat(worker): create transcription worker`
  - _Requirements: AC-6.6_
  - _Design: Workers - transcription-worker.ts_

- [ ] 2.8 Add delete clip confirmation dialog
  - **Do**:
    1. Add confirmation dialog to segment unit card
    2. Show warning that clip will be deleted, transcription preserved
    3. On confirm, call speaker.deleteClip mutation
  - **Files**: `src/features/speaker/components/segment-unit-card.tsx`
  - **Done when**: Delete requires confirmation
  - **Verify**: MCP getDiagnostics shows no type errors
  - **Commit**: `feat(speaker): add delete clip confirmation dialog`
  - _Requirements: FR-18, AC-8.1, AC-8.2, AC-8.4, AC-8.5_
  - _Design: Segment Unit Card_

- [ ] 2.9 [VERIFY] Quality checkpoint: workers and dialogs
  - **Do**: Run lint check on worker files
  - **Verify**: `bun run biome:check -- "workers"` exits 0
  - **Done when**: No lint errors, no type errors
  - **Commit**: `chore(workers): pass quality checkpoint` (only if fixes needed)

- [ ] 2.10 Add link to speaker page from project page
  - **Do**:
    1. Find speaker cards/list on project page
    2. Add navigation link to `/app/project/{projectId}/speaker/{speakerId}`
  - **Files**: `src/app/(app)/app/project/[projectId]/page.tsx` (or relevant component)
  - **Done when**: Can click speaker to navigate to speaker page
  - **Verify**: Navigation works in browser
  - **Commit**: `feat(project): add navigation link to speaker page`
  - _Design: File Structure_

## Phase 3: Testing

- [ ] 3.1 Add unit tests for histogram utility
  - **Do**:
    1. Create test file
    2. Test normal distribution
    3. Test edge cases: empty array, single value, all same values
    4. Test bucket label formatting
  - **Files**: `src/features/speaker/utils/__tests__/histogram.test.ts`
  - **Done when**: All histogram edge cases covered
  - **Verify**: `bun test src/features/speaker/utils`
  - **Commit**: `test(speaker): add unit tests for histogram utility`
  - _Design: Test Strategy - Unit Tests_

- [ ] 3.2 Add unit tests for speaker store
  - **Do**:
    1. Create test file
    2. Test filter computation
    3. Test statistics calculation
    4. Test selection state management
  - **Files**: `src/features/speaker/store/__tests__/speaker-store.test.ts`
  - **Done when**: Core store logic tested
  - **Verify**: `bun test src/features/speaker/store`
  - **Commit**: `test(speaker): add unit tests for speaker store`
  - _Design: Test Strategy - Unit Tests_

- [ ] 3.3 Add integration tests for speaker router
  - **Do**:
    1. Create test file
    2. Test getWithSegments returns correct structure
    3. Test updateTranscription updates DB
    4. Test ownership checks
  - **Files**: `src/server/api/routers/__tests__/speaker.test.ts`
  - **Done when**: Router endpoints tested
  - **Verify**: `bun test src/server/api/routers/__tests__/speaker.test.ts`
  - **Commit**: `test(api): add integration tests for speaker router`
  - _Design: Test Strategy - Integration Tests_

- [ ] 3.4 [VERIFY] Quality checkpoint: tests
  - **Do**: Run all tests
  - **Verify**: `bun test` exits 0
  - **Done when**: All tests pass
  - **Commit**: `chore(speaker): pass test checkpoint` (only if fixes needed)

## Phase 4: Quality Gates

- [ ] 4.1 [VERIFY] Full local CI: lint, type check, test, build
  - **Do**: Run complete local CI suite
  - **Verify**: All commands pass:
    - `bun run biome:check -- "src"` (lint)
    - MCP getDiagnostics on key files (type check)
    - `bun test` (tests)
    - `bun run build` (build)
  - **Done when**: Build succeeds, all tests pass
  - **Commit**: `chore(speaker): pass local CI` (if fixes needed)

- [ ] 4.2 [VERIFY] CI pipeline passes
  - **Do**: Verify GitHub Actions/CI passes after push
  - **Verify**: `gh pr checks` shows all green
  - **Done when**: CI pipeline passes
  - **Commit**: None

- [ ] 4.3 [VERIFY] AC checklist
  - **Do**: Read requirements.md, verify each AC-* is satisfied:
    - US-1: View segments (AC-1.1 to AC-1.5)
    - US-2: View clips (AC-2.1 to AC-2.5)
    - US-3: Transcriptions (AC-3.1 to AC-3.4)
    - US-4: Filters (AC-4.1 to AC-4.7)
    - US-5: Statistics (AC-5.1 to AC-5.6)
    - US-6: Transcription processing (AC-6.1 to AC-6.6)
    - US-7: Audio processing (AC-7.1 to AC-7.6)
    - US-8: Delete clip (AC-8.1 to AC-8.5)
    - US-9: Export (AC-9.1 to AC-9.11)
    - US-10: Navigation (AC-10.1 to AC-10.5)
  - **Verify**: Manual review against implementation
  - **Done when**: All acceptance criteria confirmed met
  - **Commit**: None

## Notes

**POC shortcuts taken**:
- Mock service implementations (no actual transcription, denoise, overlap removal)
- No virtual scrolling yet (add if >100 segments)
- Basic styling, no polish
- No optimistic updates for queue mutations (just invalidate)

**Production TODOs (future phases)**:
- Real TranscriptionService integration (OpenAI Whisper or self-hosted)
- Real DenoiseService integration
- Real OverlapRemovalService integration
- Virtual scrolling with @tanstack/react-virtual
- Optimistic update patterns for all mutations
- Export progress indicator
- Rate limiting for queue operations
