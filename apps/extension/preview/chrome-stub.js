// Fake chrome.* for previewing the built side panel in a plain browser tab (scripts/preview.mjs).
// Pick a scenario with ?state=panel|empty|signin|connect|tos|paywall|breaker (default: panel).
;(() => {
  const now = Date.now()
  const min = 60_000
  const hour = 60 * min
  const scenario = new URLSearchParams(location.search).get("state") ?? "panel"

  const account = { id: "100", handle: "jane", name: "Jane", tier: "free" }
  const me = (entitlement) => ({
    me: {
      account: { id: "u1", email: "test@superx.local", name: "Jane", image: null, role: "user" },
      entitlement,
      studentEmail: null,
      checkedAt: now,
    },
    checkedAt: now,
  })
  const trial = { kind: "trial", trialEndsAt: now + 2 * 24 * hour, trialAvailable: false }
  const ended = { kind: "none", trialEndsAt: now - hour, trialAvailable: false }

  const campaign = (id, text, keyword, patch = {}) => ({
    id,
    sourceTweet: { id: `t${id}`, url: `https://x.com/jane/status/${id}`, authorId: "100", authorHandle: "jane", text },
    keyword,
    leadMagnetUrl: "https://notion.so/template",
    templates: { dm: [], ackSent: [], ackDmClosed: [] },
    mustFollow: false,
    durationHours: 48,
    createdAt: now - 6 * hour,
    endsAt: now + 42 * hour,
    status: "active",
    seenCommentIds: [],
    lastScanAt: now - min,
    ...patch,
  })
  const people = [
    ["1", "julie_growth", "Julie Martin"],
    ["2", "tomdev", "Tom Leroy"],
    ["3", "sarah.ops", "Sarah Benali"],
    ["4", "nico_saas", "Nicolas Petit"],
    ["5", "lea.design", "Léa Robert"],
    ["6", "max_freelance", "Maxime Girard"],
  ]
  const lead = ([id, handle, name], campaignId, at, patch = {}) => ({
    id,
    campaignId,
    author: { id, handle, name },
    comment: { id: `c${id}`, text: "GUIDE" },
    matchedBy: "exact",
    createdAt: at,
    liked: false,
    delivery: "queued",
    ack: "none",
    dmAttempts: 0,
    ...patch,
  })

  const engine = (patch = {}) => ({
    schema: 1,
    account,
    tosAccepted: true,
    breaker: null,
    campaigns: [
      campaign("c1", "J'offre mon template Notion pour gérer tes clients freelance.\nCommente GUIDE", "GUIDE"),
      campaign("c2", "Ma checklist de lancement SaaS en 30 points.\nCommente SAAS", "SAAS", { status: "paused" }),
    ],
    leads: [
      lead(people[0], "c1", now - 3 * min, { liked: true, delivery: "sent", ack: "sent", deliveredAt: now - 2 * min, dmAttempts: 1 }),
      lead(people[1], "c1", now - 5 * min, { liked: true, delivery: "sent", ack: "sent", deliveredAt: now - 4 * min, dmAttempts: 1 }),
      lead(people[2], "c1", now - 40 * min, { liked: true, delivery: "dm_closed", ack: "dm_closed", dmAttempts: 1 }),
      lead(people[3], "c1", now - 2 * hour, { liked: true }),
      lead(people[4], "c2", now - 5 * hour, { liked: true, delivery: "failed", failure: "rate_limited", dmAttempts: 3 }),
    ],
    reviews: [
      {
        id: "r1",
        campaignId: "c1",
        author: { id: people[5][0], handle: people[5][1], name: people[5][2] },
        comment: { id: "c6", text: "super intéressé par le guide !" },
        probability: 0.62,
        at: now - 10 * min,
      },
    ],
    history: [
      { kind: "dm", at: now - 2 * min },
      { kind: "dm", at: now - 4 * min },
      { kind: "like", at: now - 3 * min },
      { kind: "like", at: now - 5 * min },
    ],
    activity: [
      { campaignId: "c1", handle: "julie_growth", kind: "dm", at: now - 2 * min },
      { campaignId: "c1", handle: "julie_growth", kind: "like", at: now - 3 * min },
      { campaignId: "c1", handle: "tomdev", kind: "reply_sent", at: now - 4 * min },
      { campaignId: "c1", handle: "sarah.ops", kind: "dm_closed", at: now - 40 * min },
    ],
    lastCampaignId: "c1",
    tick: { phase: "acting", pending: 1, lastTickAt: now - min, nextTickAt: now + min, nextActionAt: now + 30_000, lastDmAt: now - 2 * min },
    ...patch,
  })

  const signedIn = { "auth:session": "preview-token" }
  const scenarios = {
    signin: {},
    connect: { ...signedIn, "backend:me": me(trial) },
    tos: { ...signedIn, "backend:me": me(trial), "engine:current": "100", "engine:100": engine({ tosAccepted: false }) },
    empty: {
      ...signedIn,
      "backend:me": me(trial),
      "engine:current": "100",
      "engine:100": engine({ campaigns: [], leads: [], reviews: [], history: [], activity: [], tick: { phase: "idle", pending: 0 } }),
    },
    panel: { ...signedIn, "backend:me": me(trial), "engine:current": "100", "engine:100": engine() },
    paywall: { ...signedIn, "backend:me": me(ended), "engine:current": "100", "engine:100": engine() },
    breaker: {
      ...signedIn,
      "backend:me": me(trial),
      "engine:current": "100",
      "engine:100": engine({ breaker: { reason: "kill_switch", at: now - 5 * min } }),
    },
  }

  let store = structuredClone(scenarios[scenario] ?? scenarios.panel)
  const listeners = new Set()
  const pick = (keys) => {
    if (keys == null) return structuredClone(store)
    const list = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys)
    return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, structuredClone(store[k])]))
  }
  const set = (items) => {
    const changes = {}
    for (const [k, v] of Object.entries(items)) {
      changes[k] = { oldValue: store[k], newValue: v }
      store[k] = v
    }
    queueMicrotask(() => listeners.forEach((fn) => fn(changes, "local")))
  }
  const editEngine = (fn) => {
    const id = store["engine:current"]
    if (!id) return
    const state = structuredClone(store[`engine:${id}`])
    fn(state)
    set({ [`engine:${id}`]: state })
  }

  // Enough of the service worker for the panel's buttons to do something visible.
  const commands = {
    signIn: () => set({ ...signedIn, "backend:me": me(trial) }),
    signOut: () => set({ "auth:session": undefined }),
    connectX: () => set({ "engine:current": "100", "engine:100": engine({ tosAccepted: false }) }),
    acceptTos: () => editEngine((s) => (s.tosAccepted = true)),
    killSwitch: () => editEngine((s) => (s.breaker = { reason: "kill_switch", at: Date.now() })),
    restart: () => editEngine((s) => (s.breaker = null)),
    linkStudent: () => {},
    verifyStudent: () => set({ "backend:me": { ...me({ kind: "student", trialAvailable: false }), studentEmail: "eleve@ecole.fr" } }),
    pause: ({ campaignId }) => editEngine((s) => s.campaigns.forEach((c) => c.id === campaignId && (c.status = "paused"))),
    resume: ({ campaignId }) => editEngine((s) => s.campaigns.forEach((c) => c.id === campaignId && (c.status = "active"))),
    delete: ({ campaignId }) => editEngine((s) => (s.campaigns = s.campaigns.filter((c) => c.id !== campaignId))),
    approve: ({ reviewId }) => editEngine((s) => (s.reviews = s.reviews.filter((r) => r.id !== reviewId))),
    reject: ({ reviewId }) => editEngine((s) => (s.reviews = s.reviews.filter((r) => r.id !== reviewId))),
    launch: ({ input }) =>
      editEngine((s) => {
        const id = `c${Date.now()}`
        s.campaigns.unshift(campaign(id, input?.sourceTweet?.text ?? "Nouvelle campagne", input?.keyword ?? "GUIDE"))
        s.lastCampaignId = id
      }),
  }

  const event = () => ({ addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) })
  window.chrome = {
    storage: {
      local: { get: async (keys) => pick(keys), set: async (items) => set(items), remove: async () => {} },
      onChanged: event(),
    },
    runtime: {
      id: "preview",
      getManifest: () => ({ version: "0.1.0" }),
      sendMessage: async (command) => {
        console.info("[preview] command", command)
        await new Promise((r) => setTimeout(r, 400))
        const handler = commands[command?.type]
        if (!handler) return { ok: false, error: "preview_unsupported" }
        handler(command)
        return { ok: true }
      },
      onMessage: { addListener() {}, removeListener() {} },
    },
  }
})()
