/** Section title in sentence case (never all-caps), optional action on the right. */
export function SectionHeader({ title, action }: { title: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-2">
      <h3 className="text-[13px] leading-[18px] font-medium text-muted-foreground">{title}</h3>
      {action}
    </div>
  )
}
