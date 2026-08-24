import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { callClaudeJSON } from '@/lib/claude'
import {
  OPERATIONS_INSIGHT_PROMPTS,
  type OperationsInsightModule,
} from '@/lib/ai/prompts'
import {
  assertSocieteAccess,
  mapSocieteAccessError,
} from '@/lib/supabase/assert-societe-access'

export const maxDuration = 60

/** Taille max du payload agrégé accepté (anti-abus / anti-explosion tokens). */
const MAX_PAYLOAD_CHARS = 20_000

const VALID_MODULES = Object.keys(OPERATIONS_INSIGHT_PROMPTS) as OperationsInsightModule[]

type InsightSeverity = 'danger' | 'warning' | 'info' | 'success'
type Insight = {
  severity: InsightSeverity
  title: string
  detail?: string
  recommendation?: string
}

const ALLOWED_SEVERITIES: InsightSeverity[] = ['danger', 'warning', 'info', 'success']

/**
 * Normalise/valide la sortie du modèle : garde uniquement les insights bien
 * formés, borne à 6, filtre les sévérités inconnues → 'info'.
 */
function sanitizeInsights(raw: unknown): Insight[] {
  const arr = Array.isArray((raw as any)?.insights) ? (raw as any).insights : []
  const out: Insight[] = []
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue
    const title = typeof it.title === 'string' ? it.title.trim() : ''
    if (!title) continue
    const sev: InsightSeverity = ALLOWED_SEVERITIES.includes(it.severity)
      ? it.severity
      : 'info'
    out.push({
      severity: sev,
      title: title.slice(0, 160),
      detail: typeof it.detail === 'string' ? it.detail.slice(0, 400) : undefined,
      recommendation:
        typeof it.recommendation === 'string'
          ? it.recommendation.slice(0, 400)
          : undefined,
    })
    if (out.length >= 6) break
  }
  return out
}

/**
 * POST /api/client/operations/insights
 *
 * Body : { module: 'inventaire'|'pos'|'production'|'jobs', societe_id, payload }
 * Réponse : { insights: Insight[], error?: string }
 *
 * - 401 si non authentifié, 403 si pas d'accès à la société, 400 si module/payload invalide.
 * - En cas d'échec IA : 200 avec { insights: [], error } (jamais 500) pour ne pas
 *   casser l'UI du dashboard.
 */
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ insights: [], error: 'Non authentifié' }, { status: 401 })
    }

    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ insights: [], error: 'Corps de requête invalide' }, { status: 400 })
    }

    const module = body?.module as OperationsInsightModule
    const societeId = body?.societe_id as string
    const payload = body?.payload

    if (!module || !VALID_MODULES.includes(module)) {
      return NextResponse.json(
        { insights: [], error: `Module invalide (attendu: ${VALID_MODULES.join(', ')})` },
        { status: 400 },
      )
    }
    if (!societeId || typeof societeId !== 'string') {
      return NextResponse.json({ insights: [], error: 'societe_id manquant' }, { status: 400 })
    }

    // Garde-fou d'accès société (obligatoire).
    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societeId)

    // Sérialisation + borne de taille du payload.
    let payloadStr = ''
    try {
      payloadStr = JSON.stringify(payload ?? {})
    } catch {
      return NextResponse.json({ insights: [], error: 'Payload non sérialisable' }, { status: 400 })
    }
    if (payloadStr.length > MAX_PAYLOAD_CHARS) {
      payloadStr = payloadStr.slice(0, MAX_PAYLOAD_CHARS)
    }

    // Appel IA — toute erreur ici → insights vide + message (pas de 500).
    const systemPrompt = OPERATIONS_INSIGHT_PROMPTS[module]
    try {
      const raw = await callClaudeJSON<{ insights?: unknown }>(
        systemPrompt,
        `Voici les données agrégées du module « ${module} ». Analyse et renvoie les insights en JSON strict :\n\n${payloadStr}`,
        2048,
      )
      return NextResponse.json({ insights: sanitizeInsights(raw) })
    } catch (aiErr) {
      console.error('Operations insights AI error:', aiErr)
      return NextResponse.json({
        insights: [],
        error: "L'analyse IA est momentanément indisponible. Réessayez dans un instant.",
      })
    }
  } catch (e: unknown) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json({ insights: [], ...mapped.body }, { status: mapped.status })
    console.error('Operations insights error:', e)
    return NextResponse.json(
      { insights: [], error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    )
  }
}
