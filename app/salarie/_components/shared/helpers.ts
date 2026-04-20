// Date / formatting helpers shared across salarie tabs.
// Extracted from the monolithic page.tsx during sprint-salarie V0.1.

import { MU_TZ } from "./constants"

export function lastDayOfMonth(d: Date = new Date()): string {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return last.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
}

export function todayFR(): string {
  return new Date().toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })
}

export function fmtH(h: string | null): string {
  return h ? h.slice(0, 5) : "—"
}

export function fmt(n: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n)
}

export function timeMauritius(): string {
  return new Date().toLocaleTimeString("en-GB", {
    timeZone: MU_TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  })
}

export function todayISO(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: MU_TZ }))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
