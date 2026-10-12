#!/usr/bin/env node
// `pnpm dev` starts the backend and the extension. `pnpm dev --test` signs in with a local test account
// instead of Google (backend SUPERX_TEST_AUTH=1, extension PLASMO_PUBLIC_TEST_AUTH=1).
import { spawn } from "node:child_process"

const args = process.argv.slice(2)
const test = args.includes("--test")
const env = { ...process.env }
if (test) {
  env.SUPERX_TEST_AUTH = "1"
  env.PLASMO_PUBLIC_TEST_AUTH = "1"
  console.log("Mode test : connexion sans Google (compte test@superx.local, admin sur http://localhost:8787/admin/test-login)")
}

const turbo = spawn("pnpm", ["exec", "turbo", "run", "dev", ...args.filter((a) => a !== "--test")], { stdio: "inherit", env })
turbo.on("exit", (code) => process.exit(code ?? 0))
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => turbo.kill(signal))
