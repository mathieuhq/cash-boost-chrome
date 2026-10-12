import { useState } from "react"

import { initials } from "~lib/format"
import { cn } from "~lib/utils"

/** Initials, or the picture when given (X profile). Falls back to initials if the image fails. */
export function Avatar({
  name,
  src,
  size = "default"
}: {
  name: string
  src?: string | null
  size?: "default" | "sm"
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showImage = !!src && src !== failedSrc
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid flex-none place-items-center overflow-hidden rounded-full bg-muted leading-none font-medium text-muted-foreground",
        size === "default"
          ? "size-8 text-xs shadow-[inset_0_0_0_1px_var(--border)]"
          : "size-5 text-[9px] shadow-[0_0_0_2px_var(--card)]"
      )}>
      {showImage ? (
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        initials(name)
      )}
    </span>
  )
}
