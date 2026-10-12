// Installs the X bridge in x.com's MAIN world; the service worker calls it through chrome.scripting.
import { installBridge } from "@super-x/adapters-x/page"
import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  world: "MAIN",
  run_at: "document_start",
  matches: ["https://x.com/*"],
}

installBridge(window)
