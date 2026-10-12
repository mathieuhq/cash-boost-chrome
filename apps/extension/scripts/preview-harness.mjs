#!/usr/bin/env node
// Writes build/chrome-mv3-prod/preview.html: the side panel with a stubbed `chrome` API, to look at the
// gates and views in a normal browser tab. ?scenario=signin | panel | paywall
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "build", "chrome-mv3-prod")
const html = readFileSync(join(dir, "sidepanel.html"), "utf8")

const stub = `<script>
(() => {
  const scenario = new URLSearchParams(location.search).get("scenario") || "signin"
  const now = Date.now(), MIN = 60000, H = 60 * MIN
  const account = { id: "100", handle: "jane", name: "Jane", tier: "free" }
  const lead = (id, name, handle, delivery, ago, extra = {}) => ({ id, campaignId: "c1", author: { id: "u" + id, handle, name },
    comment: { id: "t" + id, text: "GUIDE" }, matchedBy: "exact", createdAt: now - ago, liked: true, delivery,
    ack: delivery === "queued" ? "none" : delivery === "sent" ? "sent" : "dm_closed", dmAttempts: 1, deliveredAt: now - ago, ...extra })
  const engine = { schema: 1, account, tosAccepted: scenario !== "signin", breaker: null,
    campaigns: [{ id: "c1", sourceTweet: { id: "1", url: "https://x.com/jane/status/1", authorId: "100", authorHandle: "jane",
      text: "J'offre mon template Notion pour gérer ses clients freelance.\\nCommente GUIDE et je te l'envoie en DM." },
      keyword: "GUIDE", leadMagnetUrl: "https://notion.so", templates: { dm: [], ackSent: [], ackDmClosed: [] }, mustFollow: false,
      durationHours: 48, createdAt: now - 17 * H, endsAt: now + 31 * H, status: scenario === "paywall" ? "paused" : "active",
      ...(scenario === "paywall" ? { stoppedBy: "access" } : {}), seenCommentIds: [], lastScanAt: now - 4 * MIN }],
    leads: [lead("1", "Marie Dupont", "marie_dpt", "sent", 2 * MIN), lead("2", "Tom Leroy", "tomleroy", "dm_closed", 4 * MIN),
      lead("3", "Sofia Martins", "sofia_m", "queued", 6 * MIN, { liked: false, dmAttempts: 0, deliveredAt: undefined })],
    reviews: [{ id: "r1", campaignId: "c1", author: { id: "u9", handle: "lucas_pt", name: "Lucas Petit" },
      comment: { id: "t9", text: "ça m'intéresse ton truc pour Notion" }, probability: 0.62, at: now }],
    history: [{ kind: "dm", at: now - 2 * MIN }, { kind: "like", at: now - 3 * MIN }, { kind: "reply", at: now - 2 * MIN }],
    activity: [{ campaignId: "c1", handle: "marie_dpt", kind: "like", at: now - 3 * MIN }, { campaignId: "c1", handle: "marie_dpt", kind: "dm", at: now - 2 * MIN },
      { campaignId: "c1", handle: "tomleroy", kind: "dm_closed", at: now - MIN }],
    tick: { phase: "idle", pending: 0, nextTickAt: now + 6 * MIN, lastDmAt: now - 2 * MIN } }
  const me = { me: { account: { id: "a1", email: "jane@example.com", name: "Jane", role: "user" },
    entitlement: scenario === "paywall" ? { kind: "none", trialEndsAt: now - H, trialAvailable: false }
      : { kind: "trial", trialEndsAt: now + 50 * H, trialAvailable: false }, studentEmail: null, checkedAt: now }, checkedAt: now }
  const store = scenario === "signin" ? {} : { "auth:session": { token: "t" }, "backend:me": me, "engine:current": "100", "engine:100": engine }
  const listeners = []
  window.chrome = {
    storage: {
      local: {
        get: async (keys) => { const list = keys == null ? Object.keys(store) : [].concat(keys); return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, store[k]])) },
        set: async (items) => { Object.assign(store, items); listeners.forEach((l) => l(items, "local")) },
        remove: async (k) => { [].concat(k).forEach((key) => delete store[key]) },
      },
      onChanged: { addListener: (l) => listeners.push(l), removeListener: () => {} },
    },
    runtime: { id: "preview", sendMessage: async (m) => { console.log("command", m); return { ok: true } }, getManifest: () => ({ version: "0.1.0" }) },
  }
})()
</script>`

writeFileSync(join(dir, "preview.html"), html.replace("<head>", `<head>${stub}`))
console.log("build/chrome-mv3-prod/preview.html written")
