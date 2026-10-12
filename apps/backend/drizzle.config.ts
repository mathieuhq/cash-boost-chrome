import { defineConfig } from "drizzle-kit"

// Only generates SQL from the schema; `pnpm db:migrate` applies it (scripts/migrate.ts).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/adapters/db/schema.ts",
  out: "./drizzle",
})
