/**
 * GET /api/comptable/gbc/audit/judge?societe_id=…&exercice=…&locale=fr
 *
 * Revue adverse (LLM-as-judge) des constats du moteur : un 2ᵉ passage Claude
 * challenge chaque constat (réel vs faux positif), attribue une confiance et une
 * recommandation. C'est la couche « confiance » — réduit les faux positifs.
 *
 * Grounding strict : on ne transmet que les constats STRUCTURÉS déjà calculés.
 * ⚠️ Aide au pré-audit, ne remplace pas le jugement de l'auditeur.
 */
import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { generateAuditFile, AuditDataError } from '@/lib/accounting/audit/server'
import { CLAUDE_CONFIG } from '@/lib/ai/prompts'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function parseVerdicts(raw: string): any[] {
  const tryArr = (s: string) => { try { const p = JSON.parse(s); return Array.isArray(p) ? p : (Array.isArray(p?.verdicts) ? p.verdicts : null) } catch { return null } }
  let v = tryArr(raw.trim())
  if (v) return v
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) { v = tryArr(fence[1].trim()); if (v) return v }
  const first = raw.indexOf('['), last = raw.lastIndexOf(']')
  if (first !== -1 && last > first) { v = tryArr(raw.substring(first, last + 1)); if (v) return v }
  return []
}

export async function GET(request: Request) {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const societe_id = searchParams.get('societe_id')
  const exercice = searchParams.get('exercice')
  const locale = searchParams.get('locale') === 'en' ? 'en' : 'fr'
  if (!societe_id || !exercice) return NextResponse.json({ error: 'societe_id et exercice requis' }, { status: 400 })

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquant' }, { status: 503 })

  const admin = getAdminClient()
  try {
    await assertSocieteAccess(admin, user.id, societe_id)
  } catch (err) {
    if (err instanceof SocieteAccessError) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    throw err
  }

  let file
  try {
    ({ file } = await generateAuditFile(admin, societe_id, exercice, new Date().toISOString()))
  } catch (err) {
    if (err instanceof AuditDataError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }

  if (file.findings.length === 0) return NextResponse.json({ verdicts: [] })

  const items = file.findings.map((f) => ({ key: f.key, severity: f.severity, titre: f.titre, explication: f.explication }))

  const system = locale === 'en'
    ? `You are an independent senior auditor performing an adversarial review of automated pre-audit findings for a Mauritian GBC. For EACH finding, decide if it is a genuine issue or a likely false positive, considering normal business reality. Be sceptical but fair. Use ONLY the provided information; never invent figures. Return ONLY a JSON array, one object per finding: {"key": string, "verdict": "confirmed"|"likely_false_positive"|"needs_info", "confidence": 0-1, "comment": short string}.`
    : `Tu es un auditeur senior indépendant qui mène une revue adverse des constats de pré-audit automatiques d'une GBC mauricienne. Pour CHAQUE constat, décide s'il s'agit d'un vrai problème ou d'un probable faux positif, au regard de la réalité métier normale. Sois sceptique mais juste. Utilise UNIQUEMENT les informations fournies ; n'invente aucun chiffre. Renvoie UNIQUEMENT un tableau JSON, un objet par constat : {"key": string, "verdict": "confirmed"|"likely_false_positive"|"needs_info", "confidence": 0-1, "comment": courte chaîne}.`

  const userPrompt = (locale === 'en' ? 'Findings to review:\n' : 'Constats à examiner :\n')
    + '```json\n' + JSON.stringify(items, null, 2) + '\n```'

  try {
    const client = new Anthropic({ apiKey: key })
    const resp = await client.messages.create({
      model: CLAUDE_CONFIG.model,
      max_tokens: 2000,
      temperature: 0.1,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    })
    const raw = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    const verdicts = parseVerdicts(raw)
      .filter((v) => v && typeof v.key === 'string')
      .map((v) => ({
        key: v.key,
        verdict: ['confirmed', 'likely_false_positive', 'needs_info'].includes(v.verdict) ? v.verdict : 'needs_info',
        confidence: typeof v.confidence === 'number' ? Math.max(0, Math.min(1, v.confidence)) : null,
        comment: typeof v.comment === 'string' ? v.comment.slice(0, 400) : '',
      }))
    return NextResponse.json({ verdicts, model: CLAUDE_CONFIG.model, disclaimer: file.disclaimer })
  } catch (e: any) {
    return NextResponse.json({ error: `Revue adverse échouée : ${e?.message || String(e)}` }, { status: 500 })
  }
}
