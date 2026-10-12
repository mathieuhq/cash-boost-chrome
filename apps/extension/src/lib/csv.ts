import type { LeadView } from "~sidepanel/model"

const DELIVERY_LABEL: Record<LeadView["status"], string> = {
  queued: "En file",
  sent: "DM envoyé",
  dm_closed: "DM fermé",
  failed: "Échec",
}

function cell(value: string): string {
  return /[",\n\r;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** CSV export per SPEC: handle, nom, date, statut DM, campagne. */
export function leadsToCsv(leads: LeadView[]): string {
  const rows = leads.map((lead) =>
    [
      `@${lead.handle}`,
      lead.name,
      new Date(lead.at).toISOString(),
      DELIVERY_LABEL[lead.status],
      lead.campaign,
    ]
      .map(cell)
      .join(",")
  )
  return ["handle,nom,date,statut DM,campagne", ...rows].join("\n")
}

export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
