// Composition root of the service worker (ADR 0002): wires the engine to Chrome, X and the backend.
import {
  BackendAccess,
  BackendClassifier,
  BackendClient,
  BackendConfig,
  BackendErrorReporter,
} from "@super-x/adapters-backend"
import {
  ALARMS,
  ChromeScheduler,
  ChromeStateStore,
  chromeKv,
  openCheckout,
  requestStudentCode,
  signInForTest,
  signInWithGoogle,
  verifyStudentCode,
  XChatTab,
  XTab,
} from "@super-x/adapters-chrome"
import { XWebGateway } from "@super-x/adapters-x"
import { Engine } from "@super-x/application"

import { BACKEND_URL, TEST_AUTH } from "~env"
import type { Command, CommandResult } from "~messages"

const clock = { now: () => Date.now() }
const client = new BackendClient({ baseUrl: BACKEND_URL, kv: chromeKv })
const config = new BackendConfig(client, clock)
const access = new BackendAccess(client, clock)
const reporter = new BackendErrorReporter(client, chrome.runtime.getManifest().version)
const scheduler = new ChromeScheduler()

const engine = new Engine({
  x: new XWebGateway(new XTab(), config, new XChatTab()),
  classifier: new BackendClassifier(client),
  access,
  config,
  store: new ChromeStateStore(),
  scheduler,
  clock,
  random: Math.random,
  ids: () => crypto.randomUUID(),
  reporter,
})

const ok: CommandResult = { ok: true }

async function handle(command: Command): Promise<CommandResult> {
  switch (command.type) {
    case "signIn": {
      const result = await (TEST_AUTH ? signInForTest(client) : signInWithGoogle(client))
      if (!result.ok) return result
      await access.refresh().catch(() => undefined)
      await engine.connect()
      await scheduler.scheduleTick(clock.now())
      return ok
    }
    case "signOut":
      await client.signOut()
      return ok
    case "refreshAccess":
      try {
        await access.refresh()
        return ok
      } catch {
        return { ok: false, error: "network" }
      }
    case "linkStudent":
      return requestStudentCode(client, command.email)
    case "verifyStudent": {
      const result = await verifyStudentCode(client, command.code)
      if (result.ok) {
        await access.refresh().catch(() => undefined)
        await scheduler.scheduleTick(clock.now())
      }
      return result
    }
    case "checkout":
      return openCheckout(client)
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
      await reporter.flush((await config.get()).version)
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
