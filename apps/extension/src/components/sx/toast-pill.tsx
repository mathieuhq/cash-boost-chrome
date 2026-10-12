import type { LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { Avatar } from "./avatar"

interface ToastPillProps {
  people?: string[]
  icon?: LucideIcon
  children: React.ReactNode
}

/** Rerun's floating pill: card at 95 % with backdrop blur, entrance with a small bounce. */
export function ToastPill({ people, icon: Icon, children }: ToastPillProps) {
  return (
    <div
      role="status"
      className="sx-toast-in inline-flex h-[34px] items-center gap-2 rounded-full bg-card/95 pr-3 pl-2 text-xs font-medium whitespace-nowrap text-card-foreground shadow-[0_0_0_1px_var(--border),var(--elevation-toast)] backdrop-blur-[8px]">
      {people?.length ? (
        <span className="inline-flex [&>*+*]:-ml-1.5">
          {people.slice(0, 3).map((name) => (
            <Avatar key={name} name={name} size="sm" />
          ))}
        </span>
      ) : Icon ? (
        <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
      ) : (
        <span className="sx-ping" aria-hidden="true" />
      )}
      <span>{children}</span>
    </div>
  )
}

export function notify(props: ToastPillProps) {
  toast.custom(() => <ToastPill {...props} />)
}
