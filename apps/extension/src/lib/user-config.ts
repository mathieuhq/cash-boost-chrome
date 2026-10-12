// The user's own settings (Options tab) laid over the bundled Config, for the service worker and the panel alike.
import type { Config } from "@super-x/application"

import type { ActiveHoursChoice, RampUpChoice } from "~sidepanel/model"

export interface UserOptions {
  activeHours?: ActiveHoursChoice
  rampUp?: RampUpChoice
}

export function userConfig(base: Config, options: UserOptions): Config {
  const { pacing, volume } = base
  return {
    ...base,
    pacing: options.activeHours ? { ...pacing, activeHours: { ...pacing.activeHours, ...options.activeHours } } : pacing,
    volume: options.rampUp
      ? {
          ...volume,
          // Off: the limits are whole from day one.
          rampUp: options.rampUp.enabled ? { ...volume.rampUp, days: options.rampUp.days } : { ...volume.rampUp, startFraction: 1 },
        }
      : volume,
  }
}
