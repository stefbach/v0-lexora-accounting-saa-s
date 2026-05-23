import type { Jurisdiction } from './jurisdiction.interface'
import type { JurisdictionCode } from './types'

/**
 * Central registry of all available jurisdictions.
 * Each jurisdiction module self-registers via registerJurisdiction().
 */
const registry = new Map<JurisdictionCode, Jurisdiction>()

export function registerJurisdiction(jurisdiction: Jurisdiction): void {
  registry.set(jurisdiction.config.code, jurisdiction)
}

export function getJurisdiction(code: JurisdictionCode): Jurisdiction {
  const j = registry.get(code)
  if (!j) {
    throw new Error(`Jurisdiction "${code}" is not registered. Available: ${listJurisdictionCodes().join(', ')}`)
  }
  return j
}

export function tryGetJurisdiction(code: JurisdictionCode): Jurisdiction | undefined {
  return registry.get(code)
}

export function listJurisdictionCodes(): JurisdictionCode[] {
  return Array.from(registry.keys())
}

export function listJurisdictions(): Jurisdiction[] {
  return Array.from(registry.values())
}

export function isJurisdictionRegistered(code: JurisdictionCode): boolean {
  return registry.has(code)
}

export function getOhadaJurisdictions(): Jurisdiction[] {
  return listJurisdictions().filter(j => j.config.framework === 'SYSCOHADA')
}
