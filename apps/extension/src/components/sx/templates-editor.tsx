import { useState } from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "~components/ui/tabs"
import { Textarea } from "~components/ui/textarea"
import { cn } from "~lib/utils"
import { MAX_VARIANTS, MIN_VARIANTS, toVariants } from "~sidepanel/draft"
import type { MessageTemplates } from "~sidepanel/model"

import { Var } from "./field"

const FAMILIES: { id: keyof MessageTemplates; label: string }[] = [
  { id: "dm", label: "DM" },
  { id: "ackSent", label: "Envoyé" },
  { id: "ackDmClosed", label: "DM fermé" },
]

export function TemplatesEditor({
  templates,
  onChange,
}: {
  templates: MessageTemplates
  onChange: (templates: MessageTemplates) => void
}) {
  // Keep raw text per family so typing a newline is not swallowed by the split/join round trip.
  const [raw, setRaw] = useState(() => ({
    dm: templates.dm.join("\n"),
    ackSent: templates.ackSent.join("\n"),
    ackDmClosed: templates.ackDmClosed.join("\n"),
  }))

  return (
    <Tabs defaultValue="dm">
      <TabsList>
        {FAMILIES.map((f) => (
          <TabsTrigger key={f.id} value={f.id}>
            {f.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {FAMILIES.map((f) => {
        const count = templates[f.id].length
        const ok = count >= MIN_VARIANTS && count <= MAX_VARIANTS
        return (
          <TabsContent key={f.id} value={f.id} className="flex flex-col gap-2">
            <Textarea
              aria-label={`Variantes ${f.label}`}
              rows={5}
              className="max-h-48 text-[13px] leading-[18px]"
              value={raw[f.id]}
              onChange={(e) => {
                const text = e.target.value
                setRaw((r) => ({ ...r, [f.id]: text }))
                onChange({ ...templates, [f.id]: toVariants(text) })
              }}
            />
            <div className="flex items-start justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Variables : <Var>{"{prénom}"}</Var> <Var>{"{@handle}"}</Var> et une variante par ligne
              </span>
              <span className={cn("text-mono flex-none", !ok && "text-destructive")}>
                {count}/{MAX_VARIANTS}
              </span>
            </div>
          </TabsContent>
        )
      })}
    </Tabs>
  )
}
