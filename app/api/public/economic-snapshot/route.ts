/**
 * GET /api/public/economic-snapshot
 *
 * Public endpoint returning a snapshot of economic indicators relevant
 * to a Mauritian SMB running Lexora:
 *
 *  - Live FX rates (MUR → EUR, USD, GBP, INR, ZAR)
 *  - Mauritius CPI / inflation (latest annual)
 *  - Bank of Mauritius key repo rate
 *  - Key HR/regulatory deadlines (next MRA/ROC dates)
 *
 * FX: we hit the free open.er-api.com service (no API key required).
 * Inflation / BoM rate: static but versioned, set from the latest
 * published values. HR deadlines: computed from the current date.
 *
 * Cached for 1 hour at the edge.
 */

import { NextResponse } from "next/server"

export const revalidate = 3600 // 1 hour

type FxResponse = {
  result: string
  base_code: string
  time_last_update_unix: number
  rates: Record<string, number>
}

type Snapshot = {
  generatedAt: string
  fx: {
    base: "MUR"
    source: string
    updatedAt: string | null
    rates: { code: string; label: string; rate: number | null; inverse: number | null }[]
  }
  inflation: {
    country: "MU"
    label: string
    value: number
    unit: "%"
    period: string
    source: string
  }
  bomRate: {
    label: string
    value: number
    unit: "%"
    period: string
    source: string
  }
  deadlines: { label: string; date: string; daysUntil: number; category: "MRA" | "ROC" | "WRA" }[]
  hrTicker: { label: string; detail: string; accent: "blue" | "gold" | "green" }[]
}

const CURRENCIES: { code: string; label: string }[] = [
  { code: "EUR", label: "Euro" },
  { code: "USD", label: "Dollar US" },
  { code: "GBP", label: "Livre Sterling" },
  { code: "INR", label: "Roupie indienne" },
  { code: "ZAR", label: "Rand sud-africain" },
]

async function fetchFx(): Promise<FxResponse | null> {
  try {
    // Base MUR, free endpoint, no key required.
    const res = await fetch("https://open.er-api.com/v6/latest/MUR", {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const data = (await res.json()) as FxResponse
    if (data.result !== "success") return null
    return data
  } catch {
    return null
  }
}

// Next MRA/ROC deadlines computed from the current month.
// VAT declaration: 20th of the following month.
// PAYE/CSG/NSF: end of the following month.
// Annual Return ROC: 28 days after the Annual Meeting (typical: end of June for December closings).
function nextDeadlines(now: Date): Snapshot["deadlines"] {
  const items: Snapshot["deadlines"] = []

  // Next VAT return (20th of next month)
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 20)
  items.push({
    label: "Déclaration TVA (VAT)",
    date: nextMonth.toISOString().slice(0, 10),
    daysUntil: Math.max(0, Math.ceil((nextMonth.getTime() - now.getTime()) / 86_400_000)),
    category: "MRA",
  })

  // Next PAYE / CSG / NSF (end of next month)
  const payeDate = new Date(now.getFullYear(), now.getMonth() + 2, 0) // last day of next month
  items.push({
    label: "PAYE · CSG · NSF",
    date: payeDate.toISOString().slice(0, 10),
    daysUntil: Math.max(0, Math.ceil((payeDate.getTime() - now.getTime()) / 86_400_000)),
    category: "MRA",
  })

  // Next IT Form 3 (corporate tax annual return — 6 months after closing)
  // For standard Dec 31 closings: due June 30.
  const year = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear()
  const itForm3Date = new Date(year, 5, 30) // June 30
  items.push({
    label: "IT Form 3 · IS",
    date: itForm3Date.toISOString().slice(0, 10),
    daysUntil: Math.max(0, Math.ceil((itForm3Date.getTime() - now.getTime()) / 86_400_000)),
    category: "MRA",
  })

  return items.sort((a, b) => a.daysUntil - b.daysUntil)
}

export async function GET() {
  const now = new Date()

  const fx = await fetchFx()
  const fxRates = CURRENCIES.map((c) => {
    const rate = fx?.rates?.[c.code] ?? null
    return {
      code: c.code,
      label: c.label,
      rate: rate !== null ? Number(rate.toFixed(4)) : null,
      inverse: rate ? Number((1 / rate).toFixed(2)) : null,
    }
  })

  const snapshot: Snapshot = {
    generatedAt: now.toISOString(),
    fx: {
      base: "MUR",
      source: "open.er-api.com",
      updatedAt: fx?.time_last_update_unix
        ? new Date(fx.time_last_update_unix * 1000).toISOString()
        : null,
      rates: fxRates,
    },
    // Latest published values. Update when Statistics Mauritius / BoM refresh.
    inflation: {
      country: "MU",
      label: "Inflation (IPC annuel)",
      value: 3.6,
      unit: "%",
      period: "2025",
      source: "Statistics Mauritius",
    },
    bomRate: {
      label: "Taux directeur (Key Rate)",
      value: 4.5,
      unit: "%",
      period: now.toISOString().slice(0, 7),
      source: "Bank of Mauritius",
    },
    deadlines: nextDeadlines(now),
    hrTicker: [
      {
        label: "SMIC Maurice",
        detail: "Rs 16 500 / mois (WRA 2019 · dernière révision)",
        accent: "gold",
      },
      {
        label: "CSG employeur",
        detail: "Taux 3 % · plafond Rs 50 000 mensuel",
        accent: "blue",
      },
      {
        label: "NSF employeur",
        detail: "Taux 2,5 % sur salaire de base",
        accent: "blue",
      },
      {
        label: "PAYE tranche 0",
        detail: "Exonération jusqu'à Rs 390 000 / an",
        accent: "green",
      },
      {
        label: "Annual Return ROC",
        detail: "28 jours après l'assemblée générale",
        accent: "gold",
      },
      {
        label: "TIBOK Santé",
        detail: "Téléconsultation illimitée · inclus dans la paie",
        accent: "green",
      },
    ],
  }

  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
    },
  })
}
