import { useEffect, useState } from "react"

/** Current time, refreshed every `everyMs` (relative times in the panel). */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}
