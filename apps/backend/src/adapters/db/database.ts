import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core"

import type * as schema from "./schema"

/** Neon (prod) and PGlite (tests, local dev) drizzle instances share this type. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>

/** drizzle-kit output, applied by the migrator of each driver. */
export const MIGRATIONS_FOLDER = new URL("../../../drizzle", import.meta.url).pathname
