import { Users } from "lucide-react"
import { useState } from "react"

import { EmptyState } from "~components/sx/empty-state"
import { LeadRow } from "~components/sx/lead-row"
import { SectionHeader } from "~components/sx/section-header"
import { Button } from "~components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "~components/ui/tabs"
import { downloadCsv, leadsToCsv } from "~lib/csv"

import type { DeliveryStatus } from "../model"
import { useEngine } from "../store"

const FILTERS: { id: "all" | DeliveryStatus; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "sent", label: "Envoyés" },
  { id: "dm_closed", label: "DM fermés" },
  { id: "failed", label: "Échecs" },
]

export function LeadsView() {
  const { state } = useEngine()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all")
  const leads = filter === "all" ? state.leads : state.leads.filter((l) => l.status === filter)

  if (state.leads.length === 0) {
    return (
      <EmptyState icon={Users} title="Aucun lead pour l'instant">
        Chaque personne qui commente ton mot-clé apparaît ici.
      </EmptyState>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        title={`${state.leads.length} leads`}
        action={
          <Button
            size="xs"
            variant="ghost"
            disabled={state.leads.length === 0}
            onClick={() => downloadCsv("super-x-leads.csv", leadsToCsv(state.leads))}>
            Exporter en CSV
          </Button>
        }
      />
      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList aria-label="Filtrer les leads">
          {FILTERS.map((f) => (
            <TabsTrigger key={f.id} value={f.id}>
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="rounded-xl bg-card shadow-card">
        {leads.length ? (
          leads.map((lead) => <LeadRow key={lead.id} lead={lead} />)
        ) : (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">Aucun lead ici pour l'instant.</p>
        )}
      </div>
    </div>
  )
}
