import { relations } from "drizzle-orm";
import {
  bigint,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTableCreator,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `t3-app_${name}`);

// ============================================================================
// ENUMS
// ============================================================================

export const jobStatusEnum = pgEnum("t3-app_job_status", [
  "pending",
  "uploading",
  "processing",
  "completed",
  "failed",
]);

export const segmentStatusEnum = pgEnum("t3-app_segment_status", [
  "pending",
  "approved",
  "excluded",
  "extracted",
]);

export const processingTypeEnum = pgEnum("t3-app_processing_type", [
  "denoise",
  "remove_bg_music",
  "remove_overlap",
  "normalize",
  "upsample",
]);

export const processingStatusEnum = pgEnum("t3-app_processing_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

// ============================================================================
// TABLES
// ============================================================================

/**
 * Projects - Top-level containers for organizing voice collections
 */
export const projects = createTable(
  "project",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("project_name_idx").on(table.name)]
);

/**
 * Collections - Speaker-specific containers within projects
 * Each collection represents a single speaker/voice
 */
export const collections = createTable(
  "collection",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    speakerMetadata: jsonb("speaker_metadata").$type<{
      notes?: string;
      voiceCharacteristics?: string;
      language?: string;
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("collection_project_id_idx").on(table.projectId),
    index("collection_name_idx").on(table.projectId, table.name),
  ]
);

/**
 * Diarization Jobs - One job per audio file (1:1 relationship)
 * Jobs are global (not tied to projects) - connection happens via segment assignment
 */
export const diarizationJobs = createTable(
  "diarization_job",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Job status
    status: jobStatusEnum("status").default("pending").notNull(),
    errorMessage: text("error_message"),

    // MinIO storage info
    storageBucket: varchar("storage_bucket", { length: 255 }),
    storageKey: varchar("storage_key", { length: 1024 }),

    // Original file metadata
    originalFilename: varchar("original_filename", { length: 255 }),
    mimeType: varchar("mime_type", { length: 100 }),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),

    // Audio metadata (populated after upload/analysis)
    durationSeconds: doublePrecision("duration_seconds"),
    sampleRate: integer("sample_rate"),
    channels: integer("channels"),

    // Pyannote processing info
    pyannoteJobId: varchar("pyannote_job_id", { length: 255 }),
    pyannoteMediaUrl: varchar("pyannote_media_url", { length: 1024 }),

    // Timestamps
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("diarization_job_status_idx").on(table.status)]
);

/**
 * Segments - Diarization results per job
 * Stores both original Pyannote timestamps and user-edited timestamps
 */
export const segments = createTable(
  "segment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => diarizationJobs.id, { onDelete: "cascade" }),
    // Temporary speaker label from Pyannote (e.g., "SPEAKER_00")
    pyannoteSpeakerLabel: varchar("pyannote_speaker_label", {
      length: 50,
    }).notNull(),
    // User-assigned collection (null until user assigns)
    collectionId: uuid("collection_id").references(() => collections.id, {
      onDelete: "set null",
    }),
    // Original timestamps from Pyannote (immutable)
    originalStartTime: doublePrecision("original_start_time").notNull(),
    originalEndTime: doublePrecision("original_end_time").notNull(),
    // User-edited timestamps (initialized from original, user can modify)
    editedStartTime: doublePrecision("edited_start_time").notNull(),
    editedEndTime: doublePrecision("edited_end_time").notNull(),
    // Confidence score from Pyannote (0.0 to 1.0)
    confidence: doublePrecision("confidence"),
    // Segment status
    status: segmentStatusEnum("status").default("pending").notNull(),
    // Optional user notes
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("segment_job_id_idx").on(table.jobId),
    index("segment_collection_id_idx").on(table.collectionId),
    index("segment_status_idx").on(table.status),
    index("segment_speaker_label_idx").on(
      table.jobId,
      table.pyannoteSpeakerLabel
    ),
    index("segment_time_range_idx").on(
      table.jobId,
      table.editedStartTime,
      table.editedEndTime
    ),
  ]
);

/**
 * Audio Clips - Extracted clips stored in collections
 */
export const audioClips = createTable(
  "audio_clip",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    segmentId: uuid("segment_id")
      .notNull()
      .references(() => segments.id, { onDelete: "cascade" }),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    // MinIO storage info for extracted clip
    storageBucket: varchar("storage_bucket", { length: 255 }).notNull(),
    storageKey: varchar("storage_key", { length: 1024 }).notNull(),
    // Clip metadata
    durationSeconds: doublePrecision("duration_seconds").notNull(),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }).notNull(),
    format: varchar("format", { length: 10 }).notNull(), // mp3, wav, flac
    // Timestamps used for extraction (snapshot from segment at extraction time)
    extractedStartTime: doublePrecision("extracted_start_time").notNull(),
    extractedEndTime: doublePrecision("extracted_end_time").notNull(),
    // Optional transcript (for future transcription feature)
    transcript: text("transcript"),
    transcriptMetadata: jsonb("transcript_metadata").$type<{
      language?: string;
      provider?: string;
      confidence?: number;
      wordTimestamps?: Array<{
        word: string;
        start: number;
        end: number;
      }>;
    }>(),
    // MOS (Mean Opinion Score) rating 1.0-5.0
    mosScore: doublePrecision("mos_score"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("audio_clip_segment_id_idx").on(table.segmentId),
    index("audio_clip_collection_id_idx").on(table.collectionId),
  ]
);

/**
 * Processed Clips - Enhanced versions of original audio clips
 * Each processing operation creates a new record, preserving history
 */
export const processedClips = createTable(
  "processed_clip",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Reference to the original audio clip
    originalClipId: uuid("original_clip_id")
      .notNull()
      .references(() => audioClips.id, { onDelete: "cascade" }),
    // Reference to parent processed clip (for chained processing)
    parentProcessedClipId: uuid("parent_processed_clip_id").references(
      (): ReturnType<typeof createTable> => processedClips.id,
      { onDelete: "set null" }
    ),
    // Processing applied
    processingType: processingTypeEnum("processing_type").notNull(),
    processingStatus: processingStatusEnum("processing_status")
      .default("pending")
      .notNull(),
    // Processing parameters (varies by type)
    processingParams: jsonb("processing_params").$type<{
      // Denoise params
      noiseReduction?: number; // 0-1
      // Normalize params
      targetLufs?: number; // e.g., -14
      peakLimit?: number; // e.g., -1
      // Upsample params
      targetSampleRate?: number; // e.g., 48000
      // Remove overlap params
      aggressiveness?: number; // 0-1
    }>(),
    // MinIO storage info for processed clip
    storageBucket: varchar("storage_bucket", { length: 255 }),
    storageKey: varchar("storage_key", { length: 1024 }),
    // Processed clip metadata
    durationSeconds: doublePrecision("duration_seconds"),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    format: varchar("format", { length: 10 }),
    sampleRate: integer("sample_rate"),
    // MOS score for quality comparison
    mosScore: doublePrecision("mos_score"),
    // Error message if processing failed
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("processed_clip_original_id_idx").on(table.originalClipId),
    index("processed_clip_parent_id_idx").on(table.parentProcessedClipId),
    index("processed_clip_type_idx").on(table.processingType),
    index("processed_clip_status_idx").on(table.processingStatus),
  ]
);

// ============================================================================
// RELATIONS
// ============================================================================

export const projectsRelations = relations(projects, ({ many }) => ({
  collections: many(collections),
}));

export const collectionsRelations = relations(collections, ({ one, many }) => ({
  project: one(projects, {
    fields: [collections.projectId],
    references: [projects.id],
  }),
  segments: many(segments),
  audioClips: many(audioClips),
}));

export const diarizationJobsRelations = relations(
  diarizationJobs,
  ({ many }) => ({
    segments: many(segments),
  })
);

export const segmentsRelations = relations(segments, ({ one }) => ({
  job: one(diarizationJobs, {
    fields: [segments.jobId],
    references: [diarizationJobs.id],
  }),
  collection: one(collections, {
    fields: [segments.collectionId],
    references: [collections.id],
  }),
  audioClip: one(audioClips, {
    fields: [segments.id],
    references: [audioClips.segmentId],
  }),
}));

export const audioClipsRelations = relations(audioClips, ({ one, many }) => ({
  segment: one(segments, {
    fields: [audioClips.segmentId],
    references: [segments.id],
  }),
  collection: one(collections, {
    fields: [audioClips.collectionId],
    references: [collections.id],
  }),
  processedClips: many(processedClips),
}));

export const processedClipsRelations = relations(
  processedClips,
  ({ one }) => ({
    originalClip: one(audioClips, {
      fields: [processedClips.originalClipId],
      references: [audioClips.id],
    }),
    parentProcessedClip: one(processedClips, {
      fields: [processedClips.parentProcessedClipId],
      references: [processedClips.id],
      relationName: "processingChain",
    }),
  })
);

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;

export type DiarizationJob = typeof diarizationJobs.$inferSelect;
export type NewDiarizationJob = typeof diarizationJobs.$inferInsert;

export type Segment = typeof segments.$inferSelect;
export type NewSegment = typeof segments.$inferInsert;

export type AudioClip = typeof audioClips.$inferSelect;
export type NewAudioClip = typeof audioClips.$inferInsert;

export type ProcessedClip = typeof processedClips.$inferSelect;
export type NewProcessedClip = typeof processedClips.$inferInsert;

export type JobStatus = (typeof jobStatusEnum.enumValues)[number];
export type SegmentStatus = (typeof segmentStatusEnum.enumValues)[number];
export type ProcessingType = (typeof processingTypeEnum.enumValues)[number];
export type ProcessingStatus = (typeof processingStatusEnum.enumValues)[number];
