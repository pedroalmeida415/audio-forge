import { relations } from "drizzle-orm";
import {
  boolean,
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

export const collections = pgTable(
  "collection",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

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
  (table) => [index("collection_id_idx").on(table.id)],
);

export const clipStatus = pgEnum("clip_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const clips = pgTable(
  "clip",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),

    // Source audio file
    sourceFileId: uuid("source_file_id").references(() => files.id, {
      onDelete: "cascade",
    }),

    // Clipping session reference (for tracking source)
    clippingSessionId: uuid("clipping_session_id").references(
      () => clippingSessions.id,
      { onDelete: "set null" },
    ),

    // Output file (nullable until processing completes)
    fileId: uuid("file_id").references(() => files.id, { onDelete: "cascade" }),

    // Source segment info (known at creation time)
    sourceSegmentId: varchar("source_segment_id", { length: 255 }).notNull(),
    startTime: doublePrecision("start_time").notNull(),
    endTime: doublePrecision("end_time").notNull(),
    duration: doublePrecision("duration").notNull(),

    // Speaker label at time of export (denormalized for history)
    speakerLabel: varchar("speaker_label", { length: 255 }),

    // Job status (clip record doubles as job record)
    status: clipStatus("status").default("pending").notNull(),
    errorMessage: text("error_message"),

    // Optional metadata
    mosScore: doublePrecision("mos_score"),
    transcript: text("transcript"),

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
    index("clip_source_file_id_idx").on(table.sourceFileId),
    index("clip_status_idx").on(table.status),
  ],
);

/**
 * Workspace-local speaker definition
 * Speakers are scoped to the clipping session
 */
export interface WorkspaceSpeaker {
  id: string;
  label: string;
  color?: string;
  createdAt: string;
}

/**
 * Segment status - tracks workflow state
 * - new: Unreviewed segment (default)
 * - reviewed: User has reviewed/approved the segment
 * - done: Segment has been exported
 */
export type SegmentStatus = "new" | "reviewed" | "done";

/**
 * Segment - represents a time range with speaker assignment
 * Can come from diarization or be manually created
 */
export interface FileSegment {
  id: string;
  speakerId: string;
  start: number;
  end: number;
  confidence?: number;
  source: "diarization" | "manual";
  isDeleted?: boolean;
  status?: SegmentStatus;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

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

    // Workspace data
    segments: jsonb("segments").$type<FileSegment[]>(),
    speakers: jsonb("speakers").$type<WorkspaceSpeaker[]>(),

    // Embedded diarization job info
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
  collections: many(collections),
  clippingSessions: many(clippingSessions),
  files: many(files),
}));

export const collectionRelations = relations(collections, ({ many, one }) => ({
  clips: many(clips),
  project: one(projects, {
    fields: [collections.projectId],
    references: [projects.id],
  }),
}));

export const clipRelations = relations(clips, ({ one }) => ({
  collection: one(collections, {
    fields: [clips.collectionId],
    references: [collections.id],
  }),
  sourceFile: one(files, {
    fields: [clips.sourceFileId],
    references: [files.id],
    relationName: "sourceFile",
  }),
  clippingSession: one(clippingSessions, {
    fields: [clips.clippingSessionId],
    references: [clippingSessions.id],
  }),
  file: one(files, {
    fields: [clips.fileId],
    references: [files.id],
    relationName: "outputFile",
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
    clips: many(clips),
  }),
);

export const fileRelations = relations(files, ({ one, many }) => ({
  user: one(user, { fields: [files.userId], references: [user.id] }),
  project: one(projects, {
    fields: [files.projectId],
    references: [projects.id],
  }),
  clippingSession: one(clippingSessions),
  sourceClips: many(clips, { relationName: "sourceFile" }),
  outputClips: many(clips, { relationName: "outputFile" }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type ClippingSession = typeof clippingSessions.$inferSelect;
export type Clip = typeof clips.$inferSelect;
export type File = typeof files.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Collection = typeof collections.$inferSelect;
