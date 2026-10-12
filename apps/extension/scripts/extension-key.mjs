#!/usr/bin/env node
// Generates the extension's signing key so its ID stays the same on every machine (needed by the
// Google sign-in redirect https://<id>.chromiumapp.org/ and the backend's EXTENSION_IDS).
// Usage: node scripts/extension-key.mjs  → writes .secrets/extension-key.pem (never commit it)
//        and prints CRX_PUBLIC_KEY + the extension ID.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const pemPath = join(root, ".secrets", "extension-key.pem")

let privateKey
if (existsSync(pemPath)) {
  privateKey = createPrivateKey(readFileSync(pemPath))
} else {
  privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey
  mkdirSync(dirname(pemPath), { recursive: true })
  writeFileSync(pemPath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 })
}

const der = createPublicKey(privateKey).export({ type: "spki", format: "der" })
// Chrome's ID: the first 128 bits of SHA-256(public key), each hex digit mapped to a–p.
const id = [...createHash("sha256").update(der).digest("hex").slice(0, 32)]
  .map((c) => String.fromCharCode("a".charCodeAt(0) + parseInt(c, 16)))
  .join("")

console.log(`CRX_PUBLIC_KEY=${der.toString("base64")}`)
console.log(`# Extension ID: ${id}  → add it to the backend's EXTENSION_IDS`)
