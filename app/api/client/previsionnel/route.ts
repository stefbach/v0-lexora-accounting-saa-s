import { createClient } from '@supabase/supabase-js'
import { CLAUDE_MODEL } from '@/lib/claude'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getTauxChange } from '@/lib/taux-change'
import { SYSTEM_PROMPT_TRESORERIE_J90, injectTauxChange } from '@/lib/ai/prompts'

export const maxDuration = 60

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.SUPABASE_SERVICE_ROLE_KEY)!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function convertToMUR(amount: number, devise: string, rates: Record<string, number>): number {
  if (!devise || devise === 'MUR') return amount
  const key = devise.toUpperCase()
  const rate = rates[key]
  if (rate) return amount * rate
  return amount
}

// GET — AI-powered J+30/J+60/J+90 treasury forecast for a client
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
    let dossierQuery = supabase.from('dossiers').select('id, societe_id').eq('client_id', targetClientId)
    if (requestedSocieteId) dossierQuery = dossierQuery.eq('societe_id', requestedSocieteId)
    const { data: dossiers } = await dossierQuery

    if (!dossiers || dossiers.length === 0) {
      return NextResponse.json({ previsionnel: null, message: 'Aucun dossier trouve' })
    }

    const dossierIds = dossiers.map(d => d.id)
    const societeIds = [...new Set(dossiers.map(d => d.societe_id))]

    // Fetch data in parallel: recent ecritures (last 90 days), bank accounts, documents
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    const sinceDate = ninetyDaysAgo.toISOString().split('T')[0]

    const [ecrituresRes, comptesRes, documentsRes] = await Promise.all([
      supabase.from('ecritures_comptables').select('*').in('dossier_id', dossierIds)
        .gte('date_ecriture', sinceDate)
        .order('date_ecriture', { ascending: false }),
      supabase.from('comptes_bancaires').select('*').in('societe_id', societeIds).eq('actif', true),
      supabase.from('documents').select('id, nom_fichier, type_document, statut, n8n_result, created_at')
        .in('dossier_id', dossierIds).eq('statut', 'traite')
        .order('created_at', { ascending: false }).limit(50),
    ])

    const ecritures = ecrituresRes.data || []
    const comptes = comptesRes.data || []
    const documents = documentsRes.data || []

    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    // Bank balances
    const bankAccounts = comptes.map(c => ({
      banque: c.banque, nom_compte: c.nom_compte, devise: c.devise,
      solde_actuel: Number(c.solde_actuel) || 0,
      solde_mur: convertToMUR(Number(c.solde_actuel) || 0, c.devise, rates),
    }))
    const totalBankMUR = bankAccounts.reduce((s, a) => s + a.solde_mur, 0)

    // Monthly revenue and expenses (last 3 months for averages)
    const months: Record<string, { revenus: number; depenses: number }> = {}
    for (const e of ecritures) {
      const month = e.date_ecriture?.substring(0, 7)
      if (!month) continue
      if (!months[month]) months[month] = { revenus: 0, depenses: 0 }
      if (e.compte?.startsWith('7')) {
        months[month].revenus += (Number(e.credit) || 0) - (Number(e.debit) || 0)
      } else if (e.compte?.startsWith('6')) {
        months[month].depenses += (Number(e.debit) || 0) - (Number(e.credit) || 0)
      }
    }

    // Payroll costs
    const salaires = ecritures
      .filter(e => e.compte?.startsWith('421') || e.compte?.startsWith('42'))
      .reduce((sum: number, e: any) => sum + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0)

    // TVA obligations
    const tvaCollectee = ecritures
      .filter(e => e.compte?.startsWith('4457') && e.date_ecriture?.startsWith(currentMonth))
      .reduce((sum: number, e: any) => sum + (Number(e.credit) || 0) - (Number(e.debit) || 0), 0)

    const tvaDeductible = ecritures
      .filter(e => e.compte?.startsWith('4456') && e.date_ecriture?.startsWith(currentMonth))
      .reduce((sum: number, e: any) => sum + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0)

    // Pending invoices (receivables and payables) from documents
    const pendingReceivables: any[] = []
    const pendingPayables: any[] = []
    for (const doc of documents) {
      const ext = doc.n8n_result?.extraction || {}
      const montantRestant = Number(ext.montant_restant_du) || 0
      if (montantRestant <= 0) continue
      const devise = (ext.devise || 'MUR').replace(/[^A-Za-z]/g, '').toUpperCase() || 'MUR'
      const entry = {
        reference: ext.numero_reference || doc.nom_fichier,
        montant: montantRestant,
        devise,
        montant_mur: convertToMUR(montantRestant, devise, rates),
        echeance: ext.date_echeance || null,
      }
      if (doc.type_document === 'facture_client') {
        pendingReceivables.push(entry)
      } else if (doc.type_document === 'facture_fournisseur') {
        pendingPayables.push(entry)
      }
    }

    // Build context for Claude
    const treasuryContext = JSON.stringify({
      date_analyse: now.toISOString().split('T')[0],
      solde_consolide_mur: Math.round(totalBankMUR * 100) / 100,
      comptes_bancaires: bankAccounts,
      flux_mensuels: Object.entries(months)
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 3)
        .map(([mois, data]) => ({
          mois,
          revenus: Math.round(data.revenus * 100) / 100,
          depenses: Math.round(data.depenses * 100) / 100,
          solde_net: Math.round((data.revenus - data.depenses) * 100) / 100,
        })),
      masse_salariale_periode: Math.round(salaires * 100) / 100,
      tva_mois_courant: {
        collectee: Math.round(tvaCollectee * 100) / 100,
        deductible: Math.round(tvaDeductible * 100) / 100,
        nette: Math.round((tvaCollectee - tvaDeductible) * 100) / 100,
      },
      creances_en_attente: pendingReceivables,
      total_creances_mur: Math.round(pendingReceivables.reduce((s, r) => s + r.montant_mur, 0) * 100) / 100,
      dettes_en_attente: pendingPayables,
      total_dettes_mur: Math.round(pendingPayables.reduce((s, p) => s + p.montant_mur, 0) * 100) / 100,
      nombre_ecritures_90j: ecritures.length,
      taux_change: rates,
    }, null, 2)

    // Inject exchange rates into prompt
    const systemPrompt = injectTauxChange(SYSTEM_PROMPT_TRESORERIE_J90, rates)

    // Call Claude AI
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Voici les donnees de tresorerie actuelles. Calcule les previsions J+30, J+60 et J+90:\n\n${treasuryContext}` }],
    })

    // Extract text response
    const textBlock = response.content.find(b => b.type === 'text')
    const rawText = textBlock && textBlock.type === 'text' ? textBlock.text : ''

    // Parse JSON from response
    let previsionnel: any = null
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        previsionnel = JSON.parse(jsonMatch[0])
      }
    } catch {
      previsionnel = { raw_response: rawText }
    }

    return NextResponse.json({ previsionnel })
  } catch (e: unknown) {
    console.error('Previsionnel API error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
