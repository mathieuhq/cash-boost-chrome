import { UpstreamUnavailable, type Mailer } from "../application"

export const RESEND_URL = "https://api.resend.com/emails"
export const DEFAULT_MAIL_FROM = "Cash Boost <contact@mail.example.com>"

export interface ResendOptions {
  apiKey: string
  /** `Name <address>` on a domain verified in Resend. */
  from?: string
  fetch?: typeof fetch
  timeoutMs?: number
}

/** Transactional emails through the Resend REST API (POST /emails). */
export class ResendMailer implements Mailer {
  private readonly fetchImpl: typeof fetch

  constructor(private readonly options: ResendOptions) {
    this.fetchImpl = options.fetch ?? ((...args) => fetch(...args))
  }

  async sendStudentCode(to: string, code: string): Promise<void> {
    let response: Response
    try {
      response = await this.fetchImpl(RESEND_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${this.options.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: this.options.from ?? DEFAULT_MAIL_FROM, to, ...studentCodeEmail(code) }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      })
    } catch {
      throw new UpstreamUnavailable("resend")
    }
    if (!response.ok) throw new UpstreamUnavailable("resend")
  }
}

/** Local dev without RESEND_API_KEY: the code goes to the backend console. */
export class ConsoleMailer implements Mailer {
  async sendStudentCode(to: string, code: string): Promise<void> {
    console.info(`[mail] student code for ${to}: ${code}`)
  }
}

export function studentCodeEmail(code: string): { subject: string; text: string; html: string } {
  const lines = [
    "Bonjour,",
    "Voici ton code pour lier ton achat Growth Boost à Cash Boost :",
    code,
    "Il est valable 15 minutes. Si tu n'as rien demandé, ignore cet email : ton achat reste lié à personne.",
  ]
  return {
    subject: `${code} est ton code Cash Boost`,
    text: lines.join("\n\n"),
    html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#0f1419">
<p>${lines[0]}</p>
<p>${lines[1]}</p>
<p style="font-size:28px;font-weight:600;letter-spacing:6px;font-family:ui-monospace,Menlo,monospace">${code}</p>
<p style="color:#536471">${lines[3]}</p>
</div>`,
  }
}
