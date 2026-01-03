/**
 * Mock context for testing and Storybook
 *
 * This module provides mock implementations of session, database, and services
 * for use in test environments (Storybook, Vitest) without requiring real external dependencies.
 */

import type { Session } from "better-auth";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";

/**
 * Create a mock session for testing
 * Matches the shape of better-auth Session type
 */
export function createMockSession(
  overrides?: Partial<Session>,
): Session | null {
  return {
    session: {
      id: "mock-session-id",
      userId: "mock-user-id",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), // 7 days from now
      token: "mock-token",
      ipAddress: "127.0.0.1",
      userAgent: "Mock User Agent",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides?.session,
    },
    user: {
      id: "mock-user-id",
      name: "Test User",
      email: "test@example.com",
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides?.user,
    },
  };
}

/**
 * Create an in-memory SQLite database for testing
 * Uses Drizzle ORM with the same schema as production
 */
export function createMockDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });

  // Initialize tables
  // Note: SQLite schema differs slightly from Postgres, so we create minimal compatible schema
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      ip_address TEXT,
      user_agent TEXT,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS collection (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      project_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS file (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      waveform_storage_key TEXT,
      file_type TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      duration_seconds REAL,
      speakers TEXT,
      segments TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS clip (
      id TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL,
      name TEXT NOT NULL,
      transcript TEXT,
      start_time REAL NOT NULL,
      end_time REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      video_storage_key TEXT,
      video_url TEXT,
      generation_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (collection_id) REFERENCES collection(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS diarization (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      job_id TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (file_id) REFERENCES file(id) ON DELETE CASCADE
    );
  `);

  return db;
}

/**
 * Seed the mock database with test data
 * Can be called with custom fixtures or use defaults
 */
export function seedMockDb(
  db: ReturnType<typeof createMockDb>,
  fixtures?: {
    users?: Array<typeof schema.user.$inferInsert>;
    projects?: Array<typeof schema.projects.$inferInsert>;
    files?: Array<typeof schema.files.$inferInsert>;
  },
) {
  const now = new Date().toISOString();

  // Insert default user if not provided
  const users = fixtures?.users ?? [
    {
      id: "mock-user-id",
      name: "Test User",
      email: "test@example.com",
      emailVerified: true,
      image: null,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    },
  ];

  for (const user of users) {
    db.insert(schema.user).values(user).run();
  }

  // Insert projects if provided
  if (fixtures?.projects) {
    for (const project of fixtures.projects) {
      db.insert(schema.projects).values(project).run();
    }
  }

  // Insert files if provided
  if (fixtures?.files) {
    for (const file of fixtures.files) {
      db.insert(schema.files).values(file).run();
    }
  }

  return db;
}
