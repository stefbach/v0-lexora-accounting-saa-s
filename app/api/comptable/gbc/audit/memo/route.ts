/**
 * GET /api/comptable/gbc/audit/memo?societe_id=…&exercice=…&locale=fr
 *
 * Synthèse exécutive de pré-audit générée par LLM (Claude) à partir des constats
 * STRUCTURÉS du moteur. Le LLM hiérarchise les risques et propose des actions —
 * il NE recalcule ni n'invente AUCUN chiffre (anti-hallucination : on ne lui
 * passe que les données déjà calculées). Différenciateur multi-LLM.
 *
 * ⚠️ Aide à la préparation. Ne constitue pas une opinion d'audit.
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

  let societe, file
  try {
    ({ societe, file } = await generateAuditFile(admin, societe_id, exercice, new Date().toISOString()))
  } catch (err) {
    if (err instanceof AuditDataError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }

  // On ne transmet au LLM que les données DÉJÀ calculées (pas d'écritures brutes).
  const payload = {
    societe: societe.nom,
    regime: file.regime,
    devise: file.devise,
    exercice: file.exercice,
    exercice_n1: file.exercice_n1,
    equilibre: file.equilibre,
    materialite: file.materialite,
    resume: file.resume,
    findings: file.findings.map((f) => ({ severity: f.severity, titre: f.titre, explication: f.explication })),
    postes_signales: file.leadSchedules.filter((l) => l.flagged).map((l) => ({ rubrique: l.caption, variation: l.variation, variation_pct: l.variation_pct })),
    pbc_manquantes: file.pbc.filter((p) => p.obligatoire && !p.fourni).map((p) => p.intitule),
  }

  const system = locale === 'en'
    ? `You are a senior audit manager preparing a pre-audit executive memo for a Mauritian Global Business Company. Use ONLY the structured data provided — never invent or recompute figures. Prioritise risks for the statutory auditor, be concise and concrete. Always end by stating this is pre-audit support and that the statutory audit opinion must be issued and signed by an independent MIPA-licensed auditor. Output Markdown.`
    : `Tu es un manager d'audit senior qui prépare un mémo exécutif de pré-audit pour une Global Business Company mauricienne. Utilise UNIQUEMENT les données structurées fournies — n'invente ni ne recalcule aucun chiffre. Hiérarchise les risques pour l'auditeur statutaire, sois concis et concret. Termine TOUJOURS en rappelant qu'il s'agit d'une aide au pré-audit et que l'opinion d'audit statutaire doit être émise et signée par un auditeur agréé MIPA indépendant. Réponds en Markdown.`

  const userPrompt = (locale === 'en' ? 'Structured pre-audit data:\n' : 'Données de pré-audit structurées :\n')
    + '```json\n' + JSON.stringify(payload, null, 2) + '\n```\n'
    + (locale === 'en'
      ? 'Write the executive memo: 1) Overall readiness, 2) Top risks ranked, 3) Recommended actions before fieldwork, 4) Missing documents. Keep it under ~500 words.'
      : 'Rédige le mémo exécutif : 1) Niveau de préparation global, 2) Risques majeurs hiérarchisés, 3) Actions recommandées avant la mission, 4) Pièces manquantes. ~500 mots maximum.')

  try {
    const client = new Anthropic({ apiKey: key })
    const resp = await client.messages.create({
      model: CLAUDE_CONFIG.model,
      max_tokens: 1500,
      temperature: 0.2,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    })
    const memo = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim()
    return NextResponse.json({ memo, model: CLAUDE_CONFIG.model, disclaimer: file.disclaimer })
  } catch (e: any) {
    return NextResponse.json({ error: `Génération du mémo échouée : ${e?.message || String(e)}` }, { status: 500 })
  }
}
