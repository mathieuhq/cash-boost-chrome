import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"

import { MIGRATIONS_FOLDER, type Database } from "./database"
import * as schema from "./schema"

/** In-memory without `dataDir` (tests), file-backed otherwise (local dev). Migrations applied. */
export async function createPgliteDatabase(dataDir?: string): Promise<{ db: Database; close: () => Promise<void> }> {
  const client = dataDir ? new PGlite(dataDir) : new PGlite()
  const db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
  return { db: db as unknown as Database, close: () => client.close() }
}
