// Runs in the MAIN world of x.com (a Plasmo content script installs it). The service worker reaches it
// through chrome.scripting.executeScript, so requests carry the page's cookies, Origin and fingerprint.
import { ClientTransaction } from "x-client-transaction-id"

export const BRIDGE_KEY = "__sx_bridge_1"

/** The public web bearer token, the one in x.com's own bundle. */
const WEB_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"
const TRANSACTION_MAX_AGE = 30 * 60_000

export interface PageRequest {
  method: "GET" | "POST"
  /** Path under x.com, e.g. /i/api/graphql/<qid>/TweetDetail */
  path: string
  query?: Record<string, string>
  body?: unknown
}

export interface PageResponse {
  status: number
  json: unknown
}

export interface Operation {
  queryId: string
  features: Record<string, boolean>
  fieldToggles: string[]
}

export interface Discovery {
  bundle: string
  operations: Record<string, Operation>
}

export interface Bridge {
  version: 1
  viewerId(): string | null
  request(request: PageRequest): Promise<PageResponse>
  discover(): Promise<Discovery | null>
}

function cookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]!) : null
}

interface FeatureSwitchState {
  featureSwitch?: {
    defaultConfig?: Record<string, { value?: unknown }>
    user?: { config?: Record<string, { value?: unknown }> }
  }
}

function parseInitialState(html: string): FeatureSwitchState | null {
  const start = html.indexOf("window.__INITIAL_STATE__=")
  if (start < 0) return null
  const from = start + "window.__INITIAL_STATE__=".length
  const end = html.indexOf(";window.__META_DATA__", from)
  try {
    return JSON.parse(html.slice(from, end > 0 ? end : html.indexOf("</script>", from))) as FeatureSwitchState
  } catch {
    return null
  }
}

const OPERATION = /queryId:"([^"]+)",operationName:"([^"]+)",operationType:"(?:query|mutation)",metadata:\{featureSwitches:\[([^\]]*)\],fieldToggles:\[([^\]]*)\]/g

function names(list: string): string[] {
  return [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]!)
}

export function createBridge(): Bridge {
  let transaction: { client: ClientTransaction; at: number } | null = null
  let home: { html: string; at: number } | null = null

  async function homeHtml(): Promise<string> {
    if (home && Date.now() - home.at < TRANSACTION_MAX_AGE) return home.html
    const html = await (await fetch("/home", { credentials: "include" })).text()
    home = { html, at: Date.now() }
    return html
  }

  async function transactionId(method: string, path: string, fresh = false): Promise<string | null> {
    try {
      if (fresh || !transaction || Date.now() - transaction.at > TRANSACTION_MAX_AGE) {
        if (fresh) home = null
        const doc = new DOMParser().parseFromString(await homeHtml(), "text/html")
        transaction = { client: await ClientTransaction.create(doc), at: Date.now() }
      }
      return await transaction.client.generateTransactionId(method, path)
    } catch {
      return null
    }
  }

  async function send(request: PageRequest, fresh: boolean): Promise<PageResponse> {
    const url = new URL(request.path, location.origin)
    for (const [key, value] of Object.entries(request.query ?? {})) url.searchParams.set(key, value)
    const headers: Record<string, string> = {
      authorization: `Bearer ${WEB_BEARER}`,
      "x-csrf-token": cookie("ct0") ?? "",
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-active-user": document.visibilityState === "visible" ? "yes" : "no",
      "x-twitter-client-language": document.documentElement.lang || "en",
    }
    const id = await transactionId(request.method, url.pathname, fresh)
    if (id) headers["x-client-transaction-id"] = id
    if (request.body !== undefined) headers["content-type"] = "application/json"

    const response = await fetch(url, {
      method: request.method,
      headers,
      credentials: "include",
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    })
    const json: unknown = await response.json().catch(() => null)
    return { status: response.status, json }
  }

  return {
    version: 1,

    viewerId() {
      return cookie("twid")?.match(/u=(\d+)/)?.[1] ?? null
    },

    async request(request) {
      try {
        const response = await send(request, false)
        // A 404 on a known operation is often a stale transaction id: regenerate once.
        return response.status === 404 ? await send(request, true) : response
      } catch {
        return { status: 0, json: null }
      }
    },

    async discover() {
      try {
        const bundle =
          document.querySelector<HTMLScriptElement>('script[src*="/responsive-web/client-web/main."]')?.src ??
          performance
            .getEntriesByType("resource")
            .map((e) => e.name)
            .find((name) => /\/responsive-web\/client-web\/main\.[\w]+\.js/.test(name))
        if (!bundle) return null
        const source = await (await fetch(bundle)).text()
        const state =
          (window as unknown as { __INITIAL_STATE__?: FeatureSwitchState }).__INITIAL_STATE__ ??
          parseInitialState(await homeHtml())
        const switches = state?.featureSwitch
        const operations: Record<string, Operation> = {}
        for (const match of source.matchAll(OPERATION)) {
          const [, queryId, name, featureList, toggleList] = match
          const features: Record<string, boolean> = {}
          for (const feature of names(featureList!)) {
            const value = switches?.user?.config?.[feature]?.value ?? switches?.defaultConfig?.[feature]?.value
            features[feature] = value === true
          }
          operations[name!] = { queryId: queryId!, features, fieldToggles: names(toggleList!) }
        }
        return { bundle, operations }
      } catch {
        return null
      }
    },
  }
}

/** Installs the bridge once per page, non-enumerable so it stays out of the page's way. */
export function installBridge(target: object = window): void {
  if (BRIDGE_KEY in target) return
  Object.defineProperty(target, BRIDGE_KEY, { value: createBridge(), enumerable: false })
}
