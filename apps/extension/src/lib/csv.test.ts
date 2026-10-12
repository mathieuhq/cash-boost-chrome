import { describe, expect, it } from "vitest"

import type { LeadView } from "~sidepanel/model"

import { leadsToCsv } from "./csv"

const leads: LeadView[] = [
  { id: "l1", campaignId: "c1", campaign: "Guide Notion gratuit", name: "Marie Dupont", handle: "marie_dpt", comment: "GUIDE", status: "sent", at: Date.UTC(2026, 9, 11, 11, 58) },
]

describe("leadsToCsv", () => {
  it("writes the SPEC columns, one row per lead", () => {
    const lines = leadsToCsv(leads.slice(0, 1)).split("\n")
    expect(lines[0]).toBe("handle,nom,date,statut DM,campagne")
    expect(lines[1]).toBe("@marie_dpt,Marie Dupont,2026-10-11T11:58:00.000Z,DM envoyé,Guide Notion gratuit")
  })

  it("quotes cells holding separators or quotes", () => {
    const lead = { ...leads[0]!, name: 'Le "boss", vraiment' }
    expect(leadsToCsv([lead]).split("\n")[1]).toContain('"Le ""boss"", vraiment"')
  })
})
