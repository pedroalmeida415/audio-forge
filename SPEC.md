# Speaker Page Specification

## Overview

Implement a speaker page that displays all segments for a given speaker across all sessions, grouped with their generated clips and transcriptions, preparing the entire collection for proper dataset export.

---

## Page Layout

### Header
- **Back button**: Navigates to project speakers list
- **Speaker name**: Read-only display (editing done in speakers list)
- **Export button**: Always enabled, opens export modal

### Main Section
Split into two areas:
- **List Area (left)**: Filters + segment/clip list
- **Sidebar (right)**: Stats + processing actions + queue summary

---

## List Area

### List Header - Filters
Filters reset on each page visit. No URL state persistence.

| Filter | UI Type | Options |
|--------|---------|---------|
| Duration | Range slider | Min/max seconds with draggable handles |
| MOS Quality | Quality tiers | Poor (<2), Fair (2-3), Good (3-4), Excellent (4+) |
| Transcription | Three-way select | All, Has transcription, No transcription |

### List Item Structure

Each item displays segment and clip **side by side** with two separate audio players for A/B comparison.

```
┌─────────────────────────────────────────────────────────────────────┐
│ [Session: Recording 2024-01-15]                    [🔖 denoised]   │
├────────────────────────────────┬────────────────────────────────────┤
│ SEGMENT SOURCE                 │ PROCESSED CLIP                     │
│ ▶ ━━━━━━━━━━━━━━━━ 0:04       │ ▶ ━━━━━━━━━━━━━━━━ 0:04           │
│ MOS: 3.2                       │ MOS: 4.1                           │
├────────────────────────────────┴────────────────────────────────────┤
│ "The quick brown fox jumps over the lazy dog, and then..."  [edit] │
└─────────────────────────────────────────────────────────────────────┘
```

**When no clip exists:**
Right column shows placeholder with CTA: "Process to create clip"

**List Item States:**
| State | Display |
|-------|---------|
| Processing | Spinner + operation name (e.g., "Denoising...") |
| Audio loading | Spinner replaces play button |
| Has clip | Both players visible |
| No clip | Segment full width, clip column shows CTA placeholder |
| Stale clip | Normal display with visual indicator (badge/icon) |

**Audio Player:**
- Simple progress bar (no waveform visualization)
- Lazy load: Audio blob fetched on first play click
- Multiple items can play simultaneously (independent per-item)

**Transcription Display:**
- Text only (no confidence score)
- Truncated with ellipsis (~100 chars)
- Click to expand full text
- Inline editing (click text to enter edit mode)

**Applied Processing:**
- Visual badges showing operations applied (e.g., "denoised", "overlap-removed", "transcribed")
- Badges cleared when clip is deleted (clean slate)

### Sorting
Sortable by key metrics only:
- Duration
- Source MOS score
- Clip MOS score

### Bulk Selection
- Checkbox on each list item
- "Select all" button - selects filtered items only
- Selection clears after queueing an operation

---

## Sidebar

### Stats Section
**Always shows totals for ALL segments** (ignores active filters)

| Stat | Display |
|------|---------|
| Total segments | Count number |
| Avg MOS score | Single value |
| MOS distribution | Histogram with both source and clip MOS overlaid |
| Segment length distribution | Histogram with dynamic bucket sizes based on data |

### Processing Actions Section
**Core three operations (stubbed implementations):**
1. Denoise
2. Remove Overlap
3. Transcribe

**Workflow:**
- Processing triggered via selection + sidebar only (no per-item menus)
- Confirmation dialog: "Apply [operation] to [N] segments?"
- Re-transcription: Ask each time whether to overwrite or skip existing

### Processing Queue Summary
**Scoped to current speaker only**

- Shows all job types together in single list
- Displays pending and failed jobs
- Failed jobs persist until user dismisses them
- Simple user-friendly error messages (e.g., "Denoising failed - try again")
- Retry button per failed job

---

## Processing Queue Architecture

### Queue Backend
- **BullMQ with Redis**
- Separate consumer processes (not worker threads)

### Queue Behavior
| Aspect | Behavior |
|--------|----------|
| Concurrency | Sequential per-segment (operations queue for each segment) |
| Retries | 2 retries (3 total attempts) |
| Backoff | Exponential: 10s → 20s → 40s |
| Failed job handling | Stays in queue summary until dismissed |

### Real-time Updates
- **SSE (Server-Sent Events)** for state changes only (pending → processing → done)
- Auto-reconnect with exponential backoff on connection drop

---

## Data Model

### Segments Table Updates
- Add `transcription` column (text, nullable)
- Add `source_mos_score` column (float, nullable)

### Clips
- **One clip per segment** (no clip history)
- Storage path: `/segments/{segmentId}/clip.flac` in R2
- Add `is_stale` flag (boolean) - set when segment boundaries change
- Add `clip_mos_score` column (float, nullable)
- Add `applied_operations` column (string array) - tracks processing applied

### Clip Lifecycle
| Event | Behavior |
|-------|----------|
| Segment boundaries changed | Mark existing clip as stale |
| Clip deleted | Clear all state (no ghost badges or history) |
| Source audio missing | Clip remains playable if it exists in R2 |

---

## Audio Loading

### Segments
- Lazy load via media proxy endpoint (`/api/media-proxy`)
- Fetch on first play click
- Create objectURL for blob and attach to audio src

### Clips
- Lazy load directly from R2 (signed URLs)
- Fetch on first play click
- Same objectURL pattern as segments

---

## Export Functionality

### Export Modal

**Preset Selector:**
- Presets prefill options but are fully customizable
- Each preset defines its own folder structure and filename format
- Examples: LJSpeech, CommonVoice, custom

**Configuration Options:**
| Option | UI | Values |
|--------|-----|--------|
| Audio format | Dropdown | WAV, FLAC, MP3, OGG (preset default with override) |
| Sample rate | Dropdown | 16kHz, 22.05kHz, 44.1kHz, 48kHz |

**Export Preview:**
- Count only: "47 clips ready for export"
- Show excluded counts: "12 segments without clip, 5 without transcription"

**Export Requirements:**
- Segment must have **both clip AND transcription** to be included
- Stale clips: Included with warning in modal

### Export Generation
- **Streaming ZIP** directly to client (no R2 upload)
- Temp cache for 15 minutes to support resumable downloads
- Cancel aborts generation if download hasn't started
- Once download starts, browser handles it (user can navigate away)

### Filename Format
Preset-defined (e.g., LJSpeech uses sequential numbering)

---

## Navigation & State

### Back Button
Navigates to project speakers list

### Jobs in Progress
Silent continue - jobs run in background when user navigates away

### Filter Persistence
Filters reset on each page visit

### URL State
None - URL is simply `/speakers/{id}`

---

## Edge Cases

### Empty State
"No segments found for this speaker" message in list area

### Missing Source Audio
Clip remains playable if it exists (graceful degradation)

### Delete Confirmation
Always confirm for clip deletion

---

## Technical Implementation Notes

### Not in Scope
- Actual processing service implementations (stubbed with proper protocol/interfaces)
- Clip history (one clip per segment)
- Storage usage display
- Custom export presets (use hardcoded presets)

### Mouse-Only Interaction
No keyboard navigation support (standard click-based UI)

### Old Code
The previous `workers/clip-worker.ts` implementation should be disregarded. Implement queue consumers fresh for this new flow.
