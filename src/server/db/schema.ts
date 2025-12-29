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

    // Source audio file (nullable for migration, will be backfilled)
    sourceFileId: uuid("source_file_id").references(() => files.id, {
      onDelete: "cascade",
    }),

    // Diarization reference (nullable - manual segments don't need diarization)
    diarizationId: uuid("diarization_id").references(() => diarizations.id, {
      onDelete: "set null",
    }),

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
 * Segment type for diarization output
 */
export interface DiarizationSegment {
  id: string;
  speaker: string;
  start: number;
  end: number;
  confidence?: number;
  isDeleted?: boolean;
  isReviewed?: boolean;
}

/**
 * Workspace-local speaker definition
 * Speakers are scoped to the audio file, not to collections
 */
export interface WorkspaceSpeaker {
  id: string;
  label: string;
  color?: string;
  createdAt: string;
}

/**
 * File segment - represents a time range with speaker assignment
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
  isReviewed?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Diarizations - One diarization per audio file
 * Segments are stored as JSONB array (pure timestamp data)
 */
export const diarizations = pgTable(
  "diarization",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),

    // Pyannote processing info
    diarizationJobId: varchar("diarization_job_id", { length: 255 }),

    // Diarization segments stored as JSONB
    output: jsonb("output").$type<{
      segments: DiarizationSegment[];
    }>(),

    // Speaker-to-collection mappings stored as JSONB
    speakerCollections: jsonb("speaker_collections").$type<
      Record<string, { collectionId: string; collectionName: string }>
    >(),

    // Timestamps
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("diarization_id_idx").on(table.id)],
);

export const files = pgTable(
  "file",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    // Project association (nullable for migration, will be backfilled)
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),

    storageKey: varchar("storage_key", { length: 1024 }),

    // Display name (editable by user)
    name: varchar("name", { length: 255 }),

    // Workspace-local speakers (not tied to collections)
    speakers: jsonb("speakers").$type<WorkspaceSpeaker[]>(),

    // Workspace segments (user-created or from diarization)
    segments: jsonb("segments").$type<FileSegment[]>(),

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
  diarizations: many(diarizations),
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
  diarization: one(diarizations, {
    fields: [clips.diarizationId],
    references: [diarizations.id],
  }),
  file: one(files, {
    fields: [clips.fileId],
    references: [files.id],
    relationName: "outputFile",
  }),
}));

export const diarizationRelations = relations(diarizations, ({ one }) => ({
  file: one(files, { fields: [diarizations.fileId], references: [files.id] }),
  project: one(projects, {
    fields: [diarizations.projectId],
    references: [projects.id],
  }),
}));

export const fileRelations = relations(files, ({ one, many }) => ({
  user: one(user, { fields: [files.userId], references: [user.id] }),
  project: one(projects, {
    fields: [files.projectId],
    references: [projects.id],
  }),
  diarizations: many(diarizations),
  sourceClips: many(clips, { relationName: "sourceFile" }),
  outputClips: many(clips, { relationName: "outputFile" }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Diarization = typeof diarizations.$inferSelect;
export type Clip = typeof clips.$inferSelect;
export type File = typeof files.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Collection = typeof collections.$inferSelect;
