import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
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

export const clipTypeEnum = pgEnum("t3-app_clip_type", [
  "original",
  "processed",
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
// JSONB TYPES
// ============================================================================

/**
 * Diarization segment stored as JSONB in the job.
 * Pure timestamp/speaker data for clip extraction reference.
 */
export type DiarizationSegment = {
  id: string;
  speaker: string;
  start: number;
  end: number;
  confidence?: number;
};

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
 * Diarization Jobs - One job per audio file
 * Segments are stored as JSONB array (pure timestamp data)
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

    // Diarization segments stored as JSONB
    segments: jsonb("segments").$type<DiarizationSegment[]>().default([]),

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
 * Clips - Unified table for both original extracted clips and processed versions
 * Clips only connect to collections (no job/segment references as FKs)
 */
export const clips = createTable(
  "clip",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Collection relationship (required for all clips)
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),

    // Clip type distinguishes original from processed
    clipType: clipTypeEnum("clip_type").notNull(),

    // Storage (MinIO)
    storageBucket: varchar("storage_bucket", { length: 255 }),
    storageKey: varchar("storage_key", { length: 1024 }),

    // Audio metadata
    durationSeconds: doublePrecision("duration_seconds"),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    format: varchar("format", { length: 10 }), // mp3, wav, flac
    sampleRate: integer("sample_rate"),

    // Original clip extraction metadata (only for clipType = 'original')
    sourceFilename: varchar("source_filename", { length: 255 }),
    sourceSpeakerLabel: varchar("source_speaker_label", { length: 50 }),
    extractedStartTime: doublePrecision("extracted_start_time"),
    extractedEndTime: doublePrecision("extracted_end_time"),

    // Processing metadata (only for clipType = 'processed')
    originalClipId: uuid("original_clip_id"),
    processingType: processingTypeEnum("processing_type"),
    processingStatus: processingStatusEnum("processing_status"),
    processingParams: jsonb("processing_params").$type<{
      noiseReduction?: number;
      targetLufs?: number;
      peakLimit?: number;
      targetSampleRate?: number;
      aggressiveness?: number;
    }>(),
    processingErrorMessage: text("processing_error_message"),

    // Quality & content
    mosScore: doublePrecision("mos_score"),
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

    // Export status (only for clipType = 'original')
    readyForExport: boolean("ready_for_export").default(false).notNull(),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("clip_collection_id_idx").on(table.collectionId),
    index("clip_original_clip_id_idx").on(table.originalClipId),
    index("clip_type_idx").on(table.clipType),
    index("clip_processing_status_idx").on(table.processingStatus),
    index("clip_ready_for_export_idx").on(table.readyForExport),
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
  clips: many(clips),
}));

export const diarizationJobsRelations = relations(diarizationJobs, () => ({
  // No relations - segments are JSONB, clips don't reference jobs
}));

export const clipsRelations = relations(clips, ({ one, many }) => ({
  collection: one(collections, {
    fields: [clips.collectionId],
    references: [collections.id],
  }),
  originalClip: one(clips, {
    fields: [clips.originalClipId],
    references: [clips.id],
    relationName: "processedVersions",
  }),
  processedVersions: many(clips, {
    relationName: "processedVersions",
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;

export type DiarizationJob = typeof diarizationJobs.$inferSelect;
export type NewDiarizationJob = typeof diarizationJobs.$inferInsert;

export type Clip = typeof clips.$inferSelect;
export type NewClip = typeof clips.$inferInsert;

export type JobStatus = (typeof jobStatusEnum.enumValues)[number];
export type ClipType = (typeof clipTypeEnum.enumValues)[number];
export type ProcessingType = (typeof processingTypeEnum.enumValues)[number];
export type ProcessingStatus = (typeof processingStatusEnum.enumValues)[number];
