// Installs the X bridge in x.com's MAIN world; the service worker calls it through chrome.scripting.
import { installBridge } from "@super-x/adapters-x/page"
import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://x.com/*"],
  world: "MAIN",
  run_at: "document_start",
}

installBridge(window)
