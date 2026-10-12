// Composition root of the service worker (ADR 0002): wires the engine to Chrome, X and OpenRouter.
import {
  ALARMS,
  CAMPAIGN_DEFAULTS,
  ChromeScheduler,
  ChromeStateStore,
  chromeKv,
  OPENROUTER_KEY,
  XChatTab,
  XTab,
} from "@super-x/adapters-chrome"
import { OpenRouterJev } from "@super-x/adapters-openrouter"
import { XWebGateway } from "@super-x/adapters-x"
import { DEFAULT_CONFIG, Engine } from "@super-x/application"

import type { Command, CommandResult } from "~messages"

const clock = { now: () => Date.now() }
const config = { get: async () => DEFAULT_CONFIG }
const scheduler = new ChromeScheduler()

const engine = new Engine({
  x: new XWebGateway(new XTab(), config, new XChatTab()),
  classifier: new OpenRouterJev({ apiKey: () => chromeKv.get<string>(OPENROUTER_KEY) }),
  config,
  store: new ChromeStateStore(),
  scheduler,
  clock,
  random: Math.random,
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ids: () => crypto.randomUUID(),
})

const ok: CommandResult = { ok: true }

async function handle(command: Command): Promise<CommandResult> {
  switch (command.type) {
    case "setOpenRouterKey": {
      const key = command.key?.trim()
      if (key) await chromeKv.set(OPENROUTER_KEY, key)
      else await chromeKv.remove(OPENROUTER_KEY)
      // Comments left unclassified are picked up right away.
      if (key) await scheduler.scheduleTick(clock.now())
      return ok
    }
    case "setCampaignDefaults":
      await chromeKv.set(CAMPAIGN_DEFAULTS, command.defaults)
      return ok
    case "connectX": {
      const result = await engine.connect()
      if (result.ok) await scheduler.scheduleTick(clock.now())
      return result.ok ? ok : result
    }
    case "acceptTos":
      await engine.acceptTos()
      return ok
    case "launch": {
      const result = await engine.launchCampaign(command.input)
      return result.ok ? ok : result
    }
    case "pause":
      await engine.pause(command.campaignId)
      return ok
    case "resume": {
      const result = await engine.resume(command.campaignId)
      return result.ok ? ok : result
    }
    case "delete":
      await engine.deleteCampaign(command.campaignId)
      return ok
    case "approve":
      await engine.approveReview(command.reviewId)
      return ok
    case "reject":
      await engine.rejectReview(command.reviewId)
      return ok
    case "killSwitch":
      await engine.killSwitch()
      return ok
    case "restart": {
      const result = await engine.restart()
      return result.ok ? ok : result
    }
  }
}

chrome.runtime.onMessage.addListener((message: Command, sender, sendResponse) => {
  // Only the extension's own pages (the side panel) may drive the engine.
  if (sender.id !== chrome.runtime.id || sender.tab) return false
  handle(message)
    .then(sendResponse)
    .catch((error: unknown) => {
      console.error(error)
      sendResponse({ ok: false, error: "internal" } satisfies CommandResult)
    })
  return true
})

chrome.alarms.onAlarm.addListener(async (alarm) => {
  try {
    if (alarm.name === ALARMS.tick) {
      await engine.tick()
    } else if (alarm.name === ALARMS.act) {
      await engine.act()
    }
  } catch (error) {
    console.error(alarm.name, error)
  }
})

const kickOff = () => scheduler.scheduleTick(clock.now()).catch(console.error)
chrome.runtime.onStartup.addListener(kickOff)
chrome.runtime.onInstalled.addListener(kickOff)

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error)

export {}
