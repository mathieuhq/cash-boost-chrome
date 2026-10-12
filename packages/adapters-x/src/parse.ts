// Pure parsers for x.com GraphQL responses. User objects lost `legacy` in 2026-08: the current paths
// are read first, the legacy ones kept as a fallback (docs/research/x-internal-api.md §3).
type Json = Record<string, unknown>

function obj(value: unknown): Json | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : undefined
}
function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}
function bool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}
function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}
function at(value: unknown, ...path: string[]): unknown {
  return path.reduce<unknown>((v, key) => obj(v)?.[key], value)
}

export interface ParsedUser {
  id: string
  handle: string
  name: string
  premium: boolean
  avatar?: string
  followsMe?: boolean
  canDm?: boolean
}

export interface ParsedTweet {
  id: string
  text: string
  inReplyToId?: string
  author: ParsedUser
}

export function parseUser(result: unknown): ParsedUser | null {
  const user = obj(result)
  if (!user || (user.__typename !== undefined && user.__typename !== "User")) return null
  const legacy = obj(user.legacy)
  const id = str(user.rest_id)
  const handle = str(at(user, "core", "screen_name")) ?? str(legacy?.screen_name)
  if (!id || !handle) return null
  const followsMe = bool(at(user, "relationship_perspectives", "followed_by")) ?? bool(legacy?.followed_by)
  const canDm = bool(at(user, "dm_permissions", "can_dm")) ?? bool(legacy?.can_dm)
  const avatar = str(at(user, "avatar", "image_url")) ?? str(legacy?.profile_image_url_https)
  return {
    id,
    handle,
    name: str(at(user, "core", "name")) ?? str(legacy?.name) ?? handle,
    premium: bool(user.is_blue_verified) ?? false,
    ...(avatar?.startsWith("https://") ? { avatar } : {}),
    ...(followsMe === undefined ? {} : { followsMe }),
    ...(canDm === undefined ? {} : { canDm }),
  }
}

export function parseTweet(result: unknown): ParsedTweet | null {
  let tweet = obj(result)
  if (tweet?.__typename === "TweetWithVisibilityResults") tweet = obj(tweet.tweet)
  if (!tweet || (tweet.__typename !== undefined && tweet.__typename !== "Tweet")) return null
  const legacy = obj(tweet.legacy)
  const id = str(tweet.rest_id) ?? str(legacy?.id_str)
  const author = parseUser(at(tweet, "core", "user_results", "result"))
  if (!id || !author) return null
  const text = str(at(tweet, "note_tweet", "note_tweet_results", "result", "text")) ?? str(legacy?.full_text) ?? ""
  const inReplyToId = str(legacy?.in_reply_to_status_id_str)
  return { id, text, author, ...(inReplyToId ? { inReplyToId } : {}) }
}

export interface TweetDetailPage {
  focal: ParsedTweet | null
  tweets: ParsedTweet[]
  /** Bottom and "show more threads" cursors, to fetch the rest of the replies. */
  cursors: string[]
}

const PAGINATION = new Set(["Bottom", "ShowMoreThreads", "ShowMoreThreadsPrompt"])

function cursorOf(content: unknown): string | undefined {
  const direct = obj(content)
  const item = obj(direct?.itemContent)
  for (const candidate of [direct, item]) {
    if (candidate && PAGINATION.has(str(candidate.cursorType) ?? "")) return str(candidate.value)
  }
  return undefined
}

export function parseTweetDetail(json: unknown, focalId: string): TweetDetailPage {
  const instructions = arr(at(json, "data", "threaded_conversation_with_injections_v2", "instructions"))
  const tweets: ParsedTweet[] = []
  const cursors: string[] = []
  const take = (itemContent: unknown) => {
    const tweet = parseTweet(at(itemContent, "tweet_results", "result"))
    if (tweet) tweets.push(tweet)
  }

  for (const instruction of instructions) {
    const entries = [...arr(obj(instruction)?.entries), ...arr(obj(instruction)?.moduleItems)]
    for (const entry of entries) {
      const content = obj(entry)?.content ?? obj(entry)?.item
      const cursor = cursorOf(content)
      if (cursor) {
        cursors.push(cursor)
        continue
      }
      take(at(content, "itemContent"))
      for (const item of arr(obj(content)?.items)) {
        const itemContent = at(item, "item", "itemContent")
        const nested = cursorOf(itemContent)
        if (!nested) take(itemContent)
      }
    }
  }

  return { focal: tweets.find((t) => t.id === focalId) ?? null, tweets, cursors }
}

/** Names from "The following features cannot be null: a, b" (code 336), to self-heal the features. */
export function missingFeatures(json: unknown): string[] {
  return arr(obj(json)?.errors).flatMap((error) => {
    const message = str(obj(error)?.message) ?? ""
    const match = message.match(/cannot be null:\s*(.+)$/)
    return match ? match[1]!.split(",").map((s) => s.trim()).filter(Boolean) : []
  })
}
