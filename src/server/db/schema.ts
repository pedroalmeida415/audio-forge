import { relations } from "drizzle-orm";
import {
  doublePrecision,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  boolean,
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
// MAIN TABLES
// ============================================================================

export const projects = pgTable(
  "project",
  {
    id: uuid("id").defaultRandom().defaultRandom().primaryKey(),
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
 * Speakers - Project-level speaker identities
 *
 * Speakers with names starting with "SPEAKER_" are diarization-generated
 * and are hidden from project-level views. They are immutable (no rename allowed).
 *
 * Regular speakers (e.g., "John", "Sarah") represent real speaker identities
 * and serve as the "collections" for organizing clips.
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
    color: varchar("color", { length: 50 }),

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
  ],
);

/**
 * Segments - Normalized time ranges with speaker assignment
 *
 * Segments belong to a clipping session and are always assigned to a speaker.
 * The speaker reference determines which "collection" the segment belongs to.
 */
export const segments = pgTable(
  "segment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => clippingSessions.id, { onDelete: "cascade" }),
    speakerId: uuid("speaker_id")
      .notNull()
      .references(() => speakers.id, { onDelete: "cascade" }),

    startTime: doublePrecision("start_time").notNull(),
    endTime: doublePrecision("end_time").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("segment_session_id_idx").on(table.sessionId),
    index("segment_speaker_id_idx").on(table.speakerId),
    index("segment_start_time_idx").on(table.startTime),
  ],
);

export const clipStatus = pgEnum("clip_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

/**
 * Clips - Processed audio outputs with transcription
 *
 * Clips reference their source segment. The speaker is derived via:
 * clip → segment → speaker
 */
export const clips = pgTable(
  "clip",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    // Source segment (derives session, speaker, times)
    segmentId: uuid("segment_id")
      .notNull()
      .references(() => segments.id, { onDelete: "cascade" }),

    // Output file (nullable until processing completes)
    fileId: uuid("file_id").references(() => files.id, { onDelete: "cascade" }),

    // Job status
    status: clipStatus("status").default("pending").notNull(),
    errorMessage: text("error_message"),

    // Transcription and quality
    transcription: text("transcription"),
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
    index("clip_segment_id_idx").on(table.segmentId),
    index("clip_status_idx").on(table.status),
  ],
);

/**
 * Files - Pure storage reference for audio files
 */
export const files = pgTable(
  "file",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    // Project association
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),

    storageKey: varchar("storage_key", { length: 1024 }),

    // Audio duration in seconds (set on upload)
    duration: doublePrecision("duration"),

    // Display name (editable by user)
    name: varchar("name", { length: 255 }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("file_project_id_idx").on(table.projectId),
    index("file_user_id_idx").on(table.userId),
  ],
);

/**
 * Diarization job info - embedded in clipping session
 */
export interface DiarizationInfo {
  jobId: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

/**
 * Clipping Sessions - Workspace state for editing audio
 * One session per file (1:1 relationship)
 */
export const clippingSessions = pgTable(
  "clipping_session",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" })
      .unique(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    // Session name (defaults to file name, editable by user)
    name: varchar("name", { length: 255 }),

    // Embedded diarization job info (metadata only)
    diarization: jsonb("diarization").$type<DiarizationInfo>(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("clipping_session_file_id_idx").on(table.fileId),
    index("clipping_session_project_id_idx").on(table.projectId),
  ],
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
  clippingSessions: many(clippingSessions),
  files: many(files),
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
  segments: many(segments),
}));

export const segmentRelations = relations(segments, ({ one, many }) => ({
  session: one(clippingSessions, {
    fields: [segments.sessionId],
    references: [clippingSessions.id],
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
  file: one(files, {
    fields: [clips.fileId],
    references: [files.id],
  }),
  user: one(user, {
    fields: [clips.userId],
    references: [user.id],
  }),
}));

export const clippingSessionRelations = relations(
  clippingSessions,
  ({ one, many }) => ({
    file: one(files, {
      fields: [clippingSessions.fileId],
      references: [files.id],
    }),
    project: one(projects, {
      fields: [clippingSessions.projectId],
      references: [projects.id],
    }),
    user: one(user, {
      fields: [clippingSessions.userId],
      references: [user.id],
    }),
    segments: many(segments),
  }),
);

export const fileRelations = relations(files, ({ one, many }) => ({
  user: one(user, { fields: [files.userId], references: [user.id] }),
  project: one(projects, {
    fields: [files.projectId],
    references: [projects.id],
  }),
  clippingSession: one(clippingSessions),
  clips: many(clips),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type ClippingSession = typeof clippingSessions.$inferSelect;
export type Clip = typeof clips.$inferSelect;
export type File = typeof files.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Speaker = typeof speakers.$inferSelect;
export type Segment = typeof segments.$inferSelect;
