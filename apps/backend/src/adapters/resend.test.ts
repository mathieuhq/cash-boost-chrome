import { describe, expect, it } from "vitest"

import { UpstreamUnavailable } from "../application"
import { DEFAULT_MAIL_FROM, RESEND_URL, ResendMailer } from "./resend"

function setup(respond: () => Response | undefined) {
  const requests: { url: string; init: RequestInit | undefined }[] = []
  const mailer = new ResendMailer({
    apiKey: "re_test",
    fetch: async (input, init) => {
      requests.push({ url: String(input), init })
      const response = respond()
      if (!response) throw new TypeError("network")
      return response
    },
  })
  return { mailer, requests }
}

describe("ResendMailer", () => {
  it("sends the code from contact@mail.example.com", async () => {
    const { mailer, requests } = setup(() => new Response(JSON.stringify({ id: "email_1" })))
    await mailer.sendStudentCode("eleve@ecole.fr", "042817")
    const [request] = requests
    expect(request!.url).toBe(RESEND_URL)
    expect(new Headers(request!.init?.headers).get("authorization")).toBe("Bearer re_test")
    const body = JSON.parse(String(request!.init?.body))
    expect(body).toMatchObject({ from: DEFAULT_MAIL_FROM, to: "eleve@ecole.fr", subject: "042817 est ton code Cash Boost" })
    expect(body.text).toContain("042817")
    expect(body.html).toContain("042817")
  })

  it("throws UpstreamUnavailable on an error status or a network failure", async () => {
    await expect(setup(() => new Response("{}", { status: 422 })).mailer.sendStudentCode("a@b.c", "1")).rejects.toBeInstanceOf(UpstreamUnavailable)
    await expect(setup(() => new Response("{}", { status: 429 })).mailer.sendStudentCode("a@b.c", "1")).rejects.toBeInstanceOf(UpstreamUnavailable)
    await expect(setup(() => undefined).mailer.sendStudentCode("a@b.c", "1")).rejects.toBeInstanceOf(UpstreamUnavailable)
  })
})
