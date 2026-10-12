import type { Scheduler } from "@super-x/application"

export const ALARMS = { tick: "superx:tick", act: "superx:act" } as const

/** chrome.alarms survive the service worker being stopped; scheduling again replaces the alarm. */
export class ChromeScheduler implements Scheduler {
  async scheduleTick(at: number) {
    await chrome.alarms.create(ALARMS.tick, { when: at })
  }

  async scheduleAction(at: number) {
    await chrome.alarms.create(ALARMS.act, { when: at })
  }
}
