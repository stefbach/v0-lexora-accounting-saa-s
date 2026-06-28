/**
 * GET /api/comptable/gbc/audit/disclosures?societe_id=…&exercice=…&locale=fr
 *
 * Génère un BROUILLON des notes annexes Full IFRS pertinentes pour l'entité
 * (selon son régime et ses modules actifs), à partir des données structurées.
 * Le LLM rédige la trame et le texte ; il insère [À COMPLÉTER] là où une donnée
 * ou un jugement humain est requis — il N'INVENTE aucun chiffre.
 *
 * ⚠️ Brouillon d'aide. Les états financiers et l'opinion restent de la
 * responsabilité de la direction et de l'auditeur agréé MIPA.
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { generateAuditFile, AuditDataError } from '@/lib/accounting/audit/server'
import { getActiveModules, type SocieteRegime } from '@/lib/accounting/regime'
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
  if (!user) return apiError('unauthorized', 401)

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
    if (err instanceof SocieteAccessError) return apiError('access_denied', 403)
    throw err
  }

  let societe, file
  try {
    ({ societe, file } = await generateAuditFile(admin, societe_id, exercice, new Date().toISOString()))
  } catch (err) {
    if (err instanceof AuditDataError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }

  const modules = getActiveModules({ regime: file.regime as SocieteRegime, devise_fonctionnelle: file.devise })

  // Notes IFRS candidates selon le contexte (le LLM ne rédige que les pertinentes).
  const notesContext = {
    societe: societe.nom,
    regime: file.regime,
    devise_fonctionnelle: file.devise,
    exercice: file.exercice,
    exercice_n1: file.exercice_n1,
    modules_actifs: {
      ias21_devise_fonctionnelle: modules.ias21_translation_active,
      ifrs16_leases: modules.ifrs16_leases_active,
      consolidation_ifrs10: modules.consolidation_active,
      transfer_pricing: modules.tp_required,
      per_fiscalite: modules.per_active,
    },
    postes_bilan_resultat: file.leadSchedules.map((l) => ({ rubrique: l.caption, total_n: l.total_n, total_n1: l.total_n1 })),
    materialite: file.materialite.seuil,
  }

  const system = locale === 'en'
    ? `You are a Full IFRS technical accountant drafting the notes to the financial statements of a Mauritian Global Business Company. Draft ONLY the notes relevant to this entity given its regime and active modules. Always include: basis of preparation (Full IFRS), functional & presentation currency (IAS 21), significant accounting policies, related party transactions, and going concern. Add IFRS 16 (leases), IFRS 10 (consolidation), IFRS 15 (revenue), IFRS 7/IFRS 9 (financial instruments), and tax notes ONLY if relevant. Use the provided figures where available; insert "[TO COMPLETE]" wherever a specific figure, policy choice or judgement is required — NEVER invent numbers. Output clean Markdown with numbered notes. End with a line stating this is a draft to be reviewed by the directors and the independent MIPA auditor.`
    : `Tu es un comptable technique Full IFRS qui rédige les notes annexes aux états financiers d'une Global Business Company mauricienne. Rédige UNIQUEMENT les notes pertinentes pour cette entité selon son régime et ses modules actifs. Inclus toujours : base de préparation (Full IFRS), monnaie fonctionnelle et de présentation (IAS 21), principales méthodes comptables, transactions avec parties liées, et continuité d'exploitation. Ajoute IFRS 16 (locations), IFRS 10 (consolidation), IFRS 15 (produits), IFRS 7/IFRS 9 (instruments financiers) et notes fiscales UNIQUEMENT si pertinent. Utilise les chiffres fournis quand ils existent ; insère "[À COMPLÉTER]" partout où un chiffre précis, un choix de méthode ou un jugement est requis — N'INVENTE jamais de chiffre. Réponds en Markdown propre avec des notes numérotées. Termine par une ligne précisant que c'est un brouillon à revoir par la direction et l'auditeur agréé MIPA indépendant.`

  const userPrompt = (locale === 'en' ? 'Entity context:\n' : 'Contexte de l’entité :\n')
    + '```json\n' + JSON.stringify(notesContext, null, 2) + '\n```\n'
    + (locale === 'en' ? 'Draft the IFRS notes.' : 'Rédige les notes IFRS.')

  try {
    const client = new Anthropic({ apiKey: key })
    const resp = await client.messages.create({
      model: CLAUDE_CONFIG.model,
      max_tokens: 3500,
      temperature: 0.2,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    })
    const disclosures = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim()
    return NextResponse.json({ disclosures, model: CLAUDE_CONFIG.model, disclaimer: file.disclaimer })
  } catch (e: any) {
    return NextResponse.json({ error: `Génération des notes IFRS échouée : ${e?.message || String(e)}` }, { status: 500 })
  }
}
