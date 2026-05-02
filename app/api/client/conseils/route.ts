import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { getTauxChange } from '@/lib/taux-change'
import { SYSTEM_PROMPT_RECOMMANDATIONS_CFO } from '@/lib/ai/prompts'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'

export const maxDuration = 60

function convertToMUR(amount: number, devise: string, rates: Record<string, number>): number {
  if (!devise || devise === 'MUR') return amount
  const key = devise.toUpperCase()
  const rate = rates[key]
  if (rate) return amount * rate
  return amount
}

// GET — AI-powered CFO recommendations for a client
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 })

    const supabase = getAdminClient()
    const rates = await getTauxChange()

    // Determine target client
    const { searchParams } = new URL(request.url)
    const requestedClientId = searchParams.get('client_id')

    let targetClientId = user.id

    if (requestedClientId && requestedClientId !== user.id) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (!profile || !['comptable', 'comptable_dedie', 'admin'].includes(profile.role)) {
        return NextResponse.json({ error: 'Acces non autorise' }, { status: 403 })
      }
      targetClientId = requestedClientId
    }

    // Get client's dossiers, optionally filtered by société
    const requestedSocieteId = searchParams.get('societe_id')
    if (requestedSocieteId) {
      await assertSocieteAccess(supabase, user.id, requestedSocieteId)
    }
    let dossierQuery = supabase.from('dossiers').select('id, societe_id').eq('client_id', targetClientId)
    if (requestedSocieteId) dossierQuery = dossierQuery.eq('societe_id', requestedSocieteId)
    const { data: dossiers } = await dossierQuery

    if (!dossiers || dossiers.length === 0) {
      return NextResponse.json({ conseils: null, message: 'Aucun dossier trouve' })
    }

    const dossierIds = dossiers.map(d => d.id)
    const societeIds = [...new Set(dossiers.map(d => d.societe_id))]

    // Fetch financial data in parallel
    // ⚠️ V2 ONLY (mig 230) : ecritures_comptables (V1) est une vue sur V2,
    // on lit V2 directement. Aliases V1→V2 appliqués après pour rester
    // compatibles avec le code aval qui consomme `compte`, `debit`, `credit`.
    const [ecrituresRes, documentsRes, comptesRes, tvaRes] = await Promise.all([
      supabase.from('ecritures_comptables_v2').select('*').in('societe_id', societeIds)
        .order('date_ecriture', { ascending: false }),
      supabase.from('documents').select('id, nom_fichier, type_document, statut, n8n_result, created_at')
        .in('dossier_id', dossierIds).eq('statut', 'traite')
        .order('created_at', { ascending: false }),
      supabase.from('comptes_bancaires').select('*').in('societe_id', societeIds).eq('actif', true),
      supabase.from('tva_mensuelle').select('*').in('societe_id', societeIds)
        .order('periode', { ascending: false }).limit(6),
    ])

    const ecritures = (ecrituresRes.data || []).map((e: any) => ({
      ...e,
      compte: e.numero_compte,
      debit: e.debit_mur,
      credit: e.credit_mur,
    }))
    const documents = documentsRes.data || []
    const comptes = comptesRes.data || []
    const tvaRecords = tvaRes.data || []

    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    // Compute financial summary for Claude
    const totalRevenue = ecritures
      .filter(e => e.compte?.startsWith('7'))
      .reduce((sum: number, e: any) => sum + (Number(e.credit) || 0) - (Number(e.debit) || 0), 0)

    const monthlyRevenue = ecritures
      .filter(e => e.compte?.startsWith('7') && e.date_ecriture?.startsWith(currentMonth))
      .reduce((sum: number, e: any) => sum + (Number(e.credit) || 0) - (Number(e.debit) || 0), 0)

    const totalExpenses = ecritures
      .filter(e => e.compte?.startsWith('6'))
      .reduce((sum: number, e: any) => sum + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0)

    const monthlyExpenses = ecritures
      .filter(e => e.compte?.startsWith('6') && e.date_ecriture?.startsWith(currentMonth))
      .reduce((sum: number, e: any) => sum + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0)

    const tvaCollectee = ecritures
      .filter(e => e.compte?.startsWith('4457'))
      .reduce((sum: number, e: any) => sum + (Number(e.credit) || 0) - (Number(e.debit) || 0), 0)

    const tvaDeductible = ecritures
      .filter(e => e.compte?.startsWith('4456'))
      .reduce((sum: number, e: any) => sum + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0)

    const bankAccounts = comptes.map(c => ({
      banque: c.banque, devise: c.devise,
      solde_actuel: Number(c.solde_actuel) || 0,
      solde_mur: convertToMUR(Number(c.solde_actuel) || 0, c.devise, rates),
    }))
    const totalBankMUR = bankAccounts.reduce((s, a) => s + a.solde_mur, 0)

    // Masse salariale = charges de paie (compte 641) — PAS le compte 421 qui
    // est une dette de paie (passif). Mêmes exclusions que /api/client/financial :
    //  - 6418 (ajustements techniques `FAC-... écart`, hors masse réelle)
    //  - journal ACH (un 641 en ACH = doublon avec une facture fournisseur)
    const salaires = ecritures
      .filter(e =>
        e.compte?.startsWith('641')
        && !e.compte?.startsWith('6418')
        && e.journal !== 'ACH'
      )
      .reduce((sum: number, e: any) => sum + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0)

    // Expense breakdown by category (top charges)
    const chargesParCompte: Record<string, number> = {}
    for (const e of ecritures.filter(e => e.compte?.startsWith('6'))) {
      const prefix = e.compte?.substring(0, 3) || '6xx'
      chargesParCompte[prefix] = (chargesParCompte[prefix] || 0) + (Number(e.debit) || 0) - (Number(e.credit) || 0)
    }
    const topCharges = Object.entries(chargesParCompte)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([compte, montant]) => ({ compte, montant: Math.round(montant * 100) / 100 }))

    // Build user message for Claude
    const financialSummary = JSON.stringify({
      periode: currentMonth,
      chiffre_affaires_total: Math.round(totalRevenue * 100) / 100,
      chiffre_affaires_mensuel: Math.round(monthlyRevenue * 100) / 100,
      charges_totales: Math.round(totalExpenses * 100) / 100,
      charges_mensuelles: Math.round(monthlyExpenses * 100) / 100,
      resultat_net: Math.round((totalRevenue - totalExpenses) * 100) / 100,
      marge_pct: totalRevenue > 0 ? Math.round(((totalRevenue - totalExpenses) / totalRevenue) * 10000) / 100 : 0,
      tva_collectee: Math.round(tvaCollectee * 100) / 100,
      tva_deductible: Math.round(tvaDeductible * 100) / 100,
      tva_nette: Math.round((tvaCollectee - tvaDeductible) * 100) / 100,
      tresorerie_totale_mur: Math.round(totalBankMUR * 100) / 100,
      comptes_bancaires: bankAccounts,
      masse_salariale: Math.round(salaires * 100) / 100,
      top_charges: topCharges,
      nombre_ecritures: ecritures.length,
      nombre_documents: documents.length,
      tva_historique: tvaRecords.slice(0, 6),
    }, null, 2)

    // Call Claude AI
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      temperature: 0,
      system: SYSTEM_PROMPT_RECOMMANDATIONS_CFO,
      messages: [{ role: 'user', content: `Voici les donnees financieres de l'entreprise. Analyse et fournis tes recommandations CFO en JSON:\n\n${financialSummary}` }],
    })

    // Extract text response
    const textBlock = response.content.find(b => b.type === 'text')
    const rawText = textBlock && textBlock.type === 'text' ? textBlock.text : ''

    // Parse JSON from response
    let conseils: any = null
    try {
      // Try to extract JSON from the response (handles cases where Claude wraps in markdown)
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        conseils = JSON.parse(jsonMatch[0])
      }
    } catch {
      // If JSON parsing fails, return as raw text
      conseils = { raw_response: rawText }
    }

    return NextResponse.json({ conseils })
  } catch (e: unknown) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    console.error('Conseils API error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
