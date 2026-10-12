import { useEffect, useState } from "react"

const query = "(prefers-color-scheme: dark)"

/** Follows the OS theme and mirrors it as the `dark` class on <html> (DS shadcn.md §5). */
export function useColorScheme(): "light" | "dark" {
  const [scheme, setScheme] = useState<"light" | "dark">(() =>
    window.matchMedia(query).matches ? "dark" : "light"
  )

  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setScheme(media.matches ? "dark" : "light")
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle("dark", scheme === "dark")
  }, [scheme])

  return scheme
}
