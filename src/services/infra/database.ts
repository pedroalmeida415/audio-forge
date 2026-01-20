import { make as makeDrizzle } from "@effect/sql-drizzle/Pg";
import { PgClient } from "@effect/sql-pg";
import { Effect, Redacted } from "effect";
import { env } from "~/env";
import * as schema from "~/server/db/schema";

/**
 * PostgreSQL client layer configured from environment.
 *
 * Provides the underlying SQL client that PgDrizzle depends on.
 */
export const PgClientLive = PgClient.layer({
  url: Redacted.make(env.DATABASE_URL),
  minConnections: 2,
  maxConnections: 10,
});

/**
 * Drizzle ORM layer with our application schema.
 *
 * Queries are native Effects - no need for Effect.tryPromise wrappers.
 * Errors are typed as SqlError from @effect/sql.
 *
 * @example
 * ```ts
 * import { Database } from "~/services/infra/database";
 *
 * const program = Effect.gen(function* () {
 *   const db = yield* Database;
 *   const users = yield* db.query.users.findMany();
 *   const [newUser] = yield* db.insert(users).values({ name: "Alice" }).returning();
 * });
 * ```
 */
export class Database extends Effect.Service<Database>()("Database", {
  effect: makeDrizzle({ schema }),
  dependencies: [PgClientLive],
}) {}
