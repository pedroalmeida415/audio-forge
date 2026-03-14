import { relations } from "drizzle-orm";
import {
  boolean,
  customType,
  doublePrecision,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ============================================================================
// AUTHENTICATION TABLES
// ============================================================================

export const user = pgTable("user", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const session = pgTable("session", {
  id: uuid("id").defaultRandom().primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const account = pgTable("account", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const verification = pgTable("verification", {
  id: uuid("id").defaultRandom().primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

// ============================================================================
// AUDIO QUALITY SCORES
// ============================================================================

/**
 * DNSMOS (Deep Noise Suppression MOS) scores for audio quality assessment.
 * Scale: 1-5 (higher is better)
 */
export interface DNSMOSScores {
  /** Speech signal quality (1-5) */
  SIG: number;
  /** Background noise quality (1-5) - higher means less noise */
  BAK: number;
  /** Overall quality (1-5) */
  OVRL: number;
  /** P.808 MOS prediction (1-5) */
  P808_MOS: number;
}

/**
 * Audio quality scores stored as JSONB.
 * Currently supports DNSMOS, extensible for future metrics.
 */
export interface AudioScores {
  DNSMOS: DNSMOSScores;
  _meta?: {
    scoredAt: string;
    model: string;
  };
}

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// ============================================================================
// ENUMS
// ============================================================================

export const sourceStatus = pgEnum("source_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const diarizationStatus = pgEnum("diarization_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

export const speakerOrigin = pgEnum("speaker_origin", ["diarization", "user"]);

export const clipProcessingStatus = pgEnum("clip_processing_status", [
  "pending",
  "processing",
  "complete",
  "failed",
]);

// ============================================================================
// MAIN TABLES
// ============================================================================

export const projects = pgTable(
  "project",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("project_id_idx").on(table.id)],
);

/**
 * Sources - Audio source files with diarization metadata
 *
 * Replaces the old `files` + `clippingSessions` tables.
 * Each source is a single audio file that can be diarized and clipped.
 */
export const sources = pgTable(
  "source",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),

    storageKey: varchar("storage_key", { length: 1024 }).notNull(),
    duration: doublePrecision("duration"),
    name: varchar("name", { length: 255 }),
    originalFileName: varchar("original_file_name", { length: 255 }),

    // Processing state (ingest + waveform)
    status: sourceStatus("status").default("pending"),
    error: text("error"),

    // Waveform data
    waveformData: bytea("waveform_data"),

    // Diarization (formerly in clippingSessions JSONB)
    diarizationJobId: varchar("diarization_job_id", { length: 255 }),
    diarizationStatus: diarizationStatus("diarization_status"),
    diarizationStartedAt: timestamp("diarization_started_at", {
      withTimezone: true,
    }),
    diarizationCompletedAt: timestamp("diarization_completed_at", {
      withTimezone: true,
    }),
    diarizationError: text("diarization_error"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("source_project_id_idx").on(table.projectId),
    index("source_user_id_idx").on(table.userId),
    index("source_diarization_job_id_idx").on(table.diarizationJobId),
  ],
);

/**
 * Speakers - Project-level speaker identities
 *
 * Speakers with `origin: "diarization"` are auto-generated from diarization
 * and linked to a specific source via `sourceId`.
 *
 * Speakers with `origin: "user"` are created manually by the user.
 */
export const speakers = pgTable(
  "speaker",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 255 }).notNull(),
    color: varchar("color", { length: 50 }).notNull(),

    // Source link (set for diarization speakers)
    sourceId: uuid("source_id").references(() => sources.id, {
      onDelete: "cascade",
    }),
    origin: speakerOrigin("origin").notNull().default("user"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("speaker_project_id_idx").on(table.projectId),
    index("speaker_user_id_idx").on(table.userId),
    index("speaker_name_idx").on(table.name),
    index("speaker_source_id_idx").on(table.sourceId),
  ],
);

/**
 * Segments - Normalized time ranges with speaker assignment
 *
 * Segments belong to a source and are always assigned to a speaker.
 */
export const segments = pgTable(
  "segment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    speakerId: uuid("speaker_id")
      .notNull()
      .references(() => speakers.id, { onDelete: "cascade" }),

    startTime: doublePrecision("start_time").notNull(),
    endTime: doublePrecision("end_time").notNull(),

    transcription: text("transcription"),
    tags: text("tags").array(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("segment_source_id_idx").on(table.sourceId),
    index("segment_speaker_id_idx").on(table.speakerId),
    index("segment_start_time_idx").on(table.startTime),
  ],
);

/**
 * Clips - Processed audio from segments
 *
 * Self-contained: stores its own storageKey and duration directly
 * (no longer references a separate file record).
 * 1:N relationship with segments.
 */
export const clips = pgTable(
  "clip",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    segmentId: uuid("segment_id")
      .notNull()
      .references(() => segments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    storageKey: varchar("storage_key", { length: 1024 }).notNull(),
    duration: doublePrecision("duration").notNull(),

    processingStatus: clipProcessingStatus("processing_status"),
    processingError: text("processing_error"),

    scores: jsonb("scores").$type<AudioScores>(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("clip_segment_id_idx").on(table.segmentId)],
);

// ============================================================================
// RELATIONS
// ============================================================================

export const userRelations = relations(user, ({ many }) => ({
  account: many(account),
  session: many(session),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const projectRelations = relations(projects, ({ many }) => ({
  speakers: many(speakers),
  sources: many(sources),
}));

export const sourceRelations = relations(sources, ({ one, many }) => ({
  user: one(user, { fields: [sources.userId], references: [user.id] }),
  project: one(projects, {
    fields: [sources.projectId],
    references: [projects.id],
  }),
  segments: many(segments),
  speakers: many(speakers),
}));

export const speakerRelations = relations(speakers, ({ one, many }) => ({
  project: one(projects, {
    fields: [speakers.projectId],
    references: [projects.id],
  }),
  user: one(user, {
    fields: [speakers.userId],
    references: [user.id],
  }),
  source: one(sources, {
    fields: [speakers.sourceId],
    references: [sources.id],
  }),
  segments: many(segments),
}));

export const segmentRelations = relations(segments, ({ one, many }) => ({
  source: one(sources, {
    fields: [segments.sourceId],
    references: [sources.id],
  }),
  speaker: one(speakers, {
    fields: [segments.speakerId],
    references: [speakers.id],
  }),
  clips: many(clips),
}));

export const clipRelations = relations(clips, ({ one }) => ({
  segment: one(segments, {
    fields: [clips.segmentId],
    references: [segments.id],
  }),
  user: one(user, {
    fields: [clips.userId],
    references: [user.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Source = typeof sources.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Speaker = typeof speakers.$inferSelect;
export type Segment = typeof segments.$inferSelect;
export type Clip = typeof clips.$inferSelect;
