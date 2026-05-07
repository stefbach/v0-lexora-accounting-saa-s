/**
 * POST /api/agent/factures
 *
 * "Lex Factures" — agent comptable qui analyse les factures (clients +
 * fournisseurs) pour détecter :
 *   - Récurrences (monthly, quarterly, yearly) par tiers
 *   - Périodes manquantes dans une série (ex: factures jan/fév/avr → mar manquante)
 *   - Pénalités potentielles (montant > X% du montant usuel)
 *   - Variations de prix suspectes
 *
 * Auth : bearer LEXORA_AGENT_SECRET OU session navigateur (avec accès société)
 * Body : { societe_id: string }
 */
import { NextResponse } from "next/server"
import { authenticateAgentRequest } from "@/lib/agent-auth"
import { getAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const AGENT_NAME = "Lex Factures"

interface Facture {
  id: string
  numero_facture: string | null
  tiers: string | null
  type_facture: "client" | "fournisseur" | null
  date_facture: string | null
  montant_ttc: number
  montant_mur: number | null
  devise: string | null
  statut: string | null
}

interface Anomalie {
  severity: "critical" | "warning" | "info"
  code: string
  message: string
  tiers: string
  type: "client" | "fournisseur"
  details?: any
}

interface TiersAnalysis {
  tiers: string
  type: "client" | "fournisseur"
  nb_factures: number
  date_debut: string
  date_fin: string
  intervalle_median_jours: number
  frequence_detectee: "mensuel" | "trimestriel" | "annuel" | "irregulier" | "unique"
  montant_median: number
  montant_min: number
  montant_max: number
  montant_ecart_max_pct: number
  devise: string
  periodes_manquantes: string[]
  factures_avec_supplement: Array<{
    id: string
    numero: string | null
    date: string
    montant: number
    montant_attendu: number
    ecart_pct: number
  }>
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function dayDiff(d1: string, d2: string): number {
  return Math.abs(
    (new Date(d2).getTime() - new Date(d1).getTime()) / 86400000
  )
}

function detectFrequency(intervalDays: number):
  | "mensuel"
  | "trimestriel"
  | "annuel"
  | "irregulier"
  | "unique" {
  if (intervalDays >= 25 && intervalDays <= 35) return "mensuel"
  if (intervalDays >= 80 && intervalDays <= 100) return "trimestriel"
  if (intervalDays >= 350 && intervalDays <= 380) return "annuel"
  return "irregulier"
}

// Génère les périodes attendues (1er du mois) entre 2 dates pour une fréquence
function expectedPeriods(start: string, end: string, freq: string): string[] {
  const out: string[] = []
  const startD = new Date(start)
  const endD = new Date(end)
  if (freq === "mensuel") {
    const cur = new Date(startD.getFullYear(), startD.getMonth(), 1)
    while (cur <= endD) {
      out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`)
      cur.setMonth(cur.getMonth() + 1)
    }
  } else if (freq === "trimestriel") {
    const cur = new Date(startD.getFullYear(), startD.getMonth(), 1)
    while (cur <= endD) {
      out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`)
      cur.setMonth(cur.getMonth() + 3)
    }
  } else if (freq === "annuel") {
    const cur = new Date(startD.getFullYear(), 0, 1)
    while (cur <= endD) {
      out.push(`${cur.getFullYear()}`)
      cur.setFullYear(cur.getFullYear() + 1)
    }
  }
  return out
}

function periodKey(date: string, freq: string): string {
  const d = new Date(date)
  if (freq === "mensuel" || freq === "trimestriel") {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  }
  if (freq === "annuel") return `${d.getFullYear()}`
  return date
}

export async function POST(request: Request) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 })
  }
  const societe_id: string | undefined = body?.societe_id
  if (!societe_id) {
    return NextResponse.json({ error: "societe_id requis" }, { status: 400 })
  }
  const auth = await authenticateAgentRequest(request, societe_id)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const sb = getAdminClient()
  const { data: facturesRaw, error } = await sb
    .from("factures")
    .select(
      "id, numero_facture, tiers, type_facture, date_facture, montant_ttc, montant_mur, devise, statut"
    )
    .eq("societe_id", societe_id)
    .neq("statut", "annule")
    .order("date_facture", { ascending: true })
    .limit(5000)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const factures: Facture[] = (facturesRaw || []).filter(
    (f: any) => f.date_facture && f.tiers && f.type_facture
  ) as any

  // Group par (tiers, type_facture)
  const groups = new Map<string, Facture[]>()
  for (const f of factures) {
    const key = `${f.type_facture}|${f.tiers}`
    const arr = groups.get(key) || []
    arr.push(f)
    groups.set(key, arr)
  }

  const analyses: TiersAnalysis[] = []
  const alerts: Anomalie[] = []
  const today = new Date().toISOString().slice(0, 10)

  for (const [key, arr] of groups) {
    if (arr.length < 2) {
      // Tiers unique : pas d'analyse de récurrence possible
      analyses.push({
        tiers: arr[0].tiers!,
        type: arr[0].type_facture!,
        nb_factures: arr.length,
        date_debut: arr[0].date_facture!,
        date_fin: arr[0].date_facture!,
        intervalle_median_jours: 0,
        frequence_detectee: "unique",
        montant_median: arr[0].montant_ttc,
        montant_min: arr[0].montant_ttc,
        montant_max: arr[0].montant_ttc,
        montant_ecart_max_pct: 0,
        devise: arr[0].devise || "MUR",
        periodes_manquantes: [],
        factures_avec_supplement: [],
      })
      continue
    }

    arr.sort((a, b) => (a.date_facture || "").localeCompare(b.date_facture || ""))
    const dates = arr.map((f) => f.date_facture!)
    const montants = arr.map((f) => Number(f.montant_ttc) || 0)

    // Calcul intervalles entre factures consécutives
    const intervals: number[] = []
    for (let i = 1; i < dates.length; i++) {
      intervals.push(dayDiff(dates[i - 1], dates[i]))
    }
    const intervalleMedian = median(intervals)
    const frequence = detectFrequency(intervalleMedian)

    // Stats montant
    const mMedian = median(montants)
    const mMin = Math.min(...montants)
    const mMax = Math.max(...montants)
    const ecartMaxPct = mMedian > 0 ? Math.round(((mMax - mMedian) / mMedian) * 1000) / 10 : 0

    // Périodes manquantes (si récurrence détectée)
    const periodesManquantes: string[] = []
    if (
      frequence === "mensuel" ||
      frequence === "trimestriel" ||
      frequence === "annuel"
    ) {
      const expected = expectedPeriods(dates[0], today, frequence)
      const presents = new Set(arr.map((f) => periodKey(f.date_facture!, frequence)))
      for (const p of expected) {
        if (!presents.has(p)) periodesManquantes.push(p)
      }
    }

    // Factures avec supplément (montant > 105% du médian → potentiel pénalité)
    const facturesAvecSupplement: any[] = []
    for (const f of arr) {
      const m = Number(f.montant_ttc) || 0
      if (mMedian > 0 && m > mMedian * 1.05) {
        const ecart = ((m - mMedian) / mMedian) * 100
        facturesAvecSupplement.push({
          id: f.id,
          numero: f.numero_facture,
          date: f.date_facture,
          montant: m,
          montant_attendu: mMedian,
          ecart_pct: Math.round(ecart * 10) / 10,
        })
      }
    }

    const analysis: TiersAnalysis = {
      tiers: arr[0].tiers!,
      type: arr[0].type_facture!,
      nb_factures: arr.length,
      date_debut: dates[0],
      date_fin: dates[dates.length - 1],
      intervalle_median_jours: Math.round(intervalleMedian),
      frequence_detectee: frequence,
      montant_median: Math.round(mMedian * 100) / 100,
      montant_min: mMin,
      montant_max: mMax,
      montant_ecart_max_pct: ecartMaxPct,
      devise: arr[0].devise || "MUR",
      periodes_manquantes: periodesManquantes,
      factures_avec_supplement: facturesAvecSupplement,
    }
    analyses.push(analysis)

    // Génération des alertes
    if (periodesManquantes.length > 0 && frequence !== "irregulier") {
      alerts.push({
        severity: periodesManquantes.length > 2 ? "critical" : "warning",
        code: "MISSING_PERIODS",
        message: `${arr[0].tiers} (${arr[0].type_facture}) : facturation ${frequence}, ${periodesManquantes.length} période(s) manquante(s) — ${periodesManquantes.slice(0, 5).join(", ")}${periodesManquantes.length > 5 ? "…" : ""}`,
        tiers: arr[0].tiers!,
        type: arr[0].type_facture!,
        details: { frequence, periodes_manquantes: periodesManquantes },
      })
    }

    // Dernière facture trop ancienne pour la fréquence détectée
    if (frequence === "mensuel" || frequence === "trimestriel" || frequence === "annuel") {
      const daysSinceLast = dayDiff(dates[dates.length - 1], today)
      const expectedMax =
        frequence === "mensuel" ? 45 : frequence === "trimestriel" ? 110 : 400
      if (daysSinceLast > expectedMax) {
        alerts.push({
          severity: "warning",
          code: "OVERDUE_RECURRING",
          message: `${arr[0].tiers} (${arr[0].type_facture}) : pas de facture depuis ${Math.round(daysSinceLast)}j alors que la cadence est ${frequence}`,
          tiers: arr[0].tiers!,
          type: arr[0].type_facture!,
          details: { days_since_last: Math.round(daysSinceLast), frequence },
        })
      }
    }

    // Pénalités potentielles
    if (facturesAvecSupplement.length > 0) {
      alerts.push({
        severity: facturesAvecSupplement.some((s: any) => s.ecart_pct > 20)
          ? "warning"
          : "info",
        code: "POSSIBLE_PENALTY",
        message: `${arr[0].tiers} : ${facturesAvecSupplement.length} facture(s) avec montant supérieur de plus de 5% au montant médian (${mMedian.toFixed(0)} ${arr[0].devise || "MUR"}) — potentielle pénalité, retard, intérêts ou surfacturation`,
        tiers: arr[0].tiers!,
        type: arr[0].type_facture!,
        details: { montant_median: mMedian, factures: facturesAvecSupplement.slice(0, 5) },
      })
    }
  }

  // Trier les analyses : récurrents d'abord (ceux avec récurrence détectée),
  // puis par nb_factures DESC
  analyses.sort((a, b) => {
    const aRec = a.frequence_detectee !== "irregulier" && a.frequence_detectee !== "unique" ? 1 : 0
    const bRec = b.frequence_detectee !== "irregulier" && b.frequence_detectee !== "unique" ? 1 : 0
    if (aRec !== bRec) return bRec - aRec
    return b.nb_factures - a.nb_factures
  })

  // Trier les alertes par sévérité
  const sevOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 }
  alerts.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity])

  const critical = alerts.filter((a) => a.severity === "critical").length
  const warnings = alerts.filter((a) => a.severity === "warning").length
  const score = Math.max(0, 100 - critical * 20 - warnings * 5)

  return NextResponse.json({
    ok: true,
    agent: AGENT_NAME,
    audited_at: new Date().toISOString(),
    societe_id,
    score,
    severity: critical > 0 ? "critical" : warnings > 0 ? "warning" : "ok",
    summary: {
      total_factures: factures.length,
      total_tiers: groups.size,
      tiers_avec_recurrence: analyses.filter(
        (a) => a.frequence_detectee !== "irregulier" && a.frequence_detectee !== "unique"
      ).length,
      total_periodes_manquantes: analyses.reduce(
        (s, a) => s + a.periodes_manquantes.length,
        0
      ),
      total_factures_supplement: analyses.reduce(
        (s, a) => s + a.factures_avec_supplement.length,
        0
      ),
    },
    alerts,
    analyses,
  })
}
