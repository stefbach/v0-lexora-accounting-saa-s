import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { fetchAllPaginated } from '@/lib/supabase/paginate'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * GET /api/comptable/rapprochement/kpis?societe_id=...
 * Spec: NIVEAU P3-B4 — Indicateurs de performance rapprochement
 *
 * Cibles:
 * - Taux rapprochement auto: >80%
 * - Transactions "inconnu": <5
 * - Délai moyen traitement écarts: <48h
 * - Taux lettrage 401/411: >95% à J+8
 * - Solde 580 transit: 0 après 3j ouvrés
 * - Alertes conformité actives: 0 critical
 */
export async function GET(request: Request) {
  try {
    // FIX MCP : resolveUserAuth pour outil MCP `get_rapprochement_status`.
    const user = await resolveUserAuth(request)
    if (!user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()

    // Récupérer le dossier
    const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()

    // Helper pour exécuter une requête Supabase qui peut échouer si la table n'existe pas
    const safeQuery = async <T = any>(queryPromise: PromiseLike<{ data: T | null; error: any }>): Promise<{ data: T | null }> => {
      try {
        const result = await queryPromise
        if (result.error) return { data: null }
        return { data: result.data }
      } catch {
        return { data: null }
      }
    }

    // Toutes les requêtes en parallèle
    const [
      relevesRes,
      facturesRes,
      ecr401Res,
      ecrBNQRes,
      alertsRes,
      reconciliationsRes,
    ] = await Promise.all([
      safeQuery(supabase.from('releves_bancaires').select('id, transactions_json').eq('societe_id', societe_id).is('superseded_by_id', null)),
      safeQuery(supabase.from('factures').select('id, statut, solde_non_paye, montant_ttc, rapproche_date, date_facture, societe_id, dossier_id').eq('societe_id', societe_id)),
      dossier
        ? fetchAllPaginated<any>(() =>
            supabase.from('ecritures_comptables_v2').select('numero_compte, debit_mur, credit_mur, lettre, date_ecriture').eq('dossier_id', dossier.id)
          ).then((data) => ({ data })).catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
      dossier
        ? fetchAllPaginated<any>(() =>
            supabase.from('ecritures_comptables_v2').select('numero_compte, debit_mur, credit_mur').eq('dossier_id', dossier.id).eq('numero_compte', '580')
          ).then((data) => ({ data })).catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
      safeQuery(supabase.from('compliance_alerts').select('severity, status').eq('societe_id', societe_id).eq('status', 'open')),
      safeQuery(supabase.from('bank_reconciliations').select('status, period_end').eq('societe_id', societe_id)),
    ])

    const releves = relevesRes.data || []
    let factures = facturesRes.data || []

    // Fallback: si aucune facture via societe_id mais un dossier existe, tenter via dossier_id
    // (certains imports historiques peuvent avoir dossier_id sans societe_id)
    if (factures.length === 0 && dossier) {
      const fb = await safeQuery(
        supabase.from('factures').select('id, statut, solde_non_paye, montant_ttc, rapproche_date, date_facture, societe_id, dossier_id').eq('dossier_id', dossier.id)
      )
      factures = fb.data || []
      if (factures.length > 0) {
        console.warn(`[kpis] fallback dossier_id=${dossier.id} → ${factures.length} factures`)
      }
    }

    if (factures.length === 0) {
      console.warn(`[kpis] WARNING: 0 factures pour societe_id=${societe_id} dossier_id=${dossier?.id || 'n/a'}`)
    }

    // Calculer les KPIs
    let totalTx = 0, autoMatched = 0, unknown = 0, qualificationRequise = 0
    for (const r of releves || []) {
      const txs = (r as any).transactions_json || []
      for (const tx of txs) {
        totalTx++
        if (tx.statut === 'rapproche' || tx.statut === 'interne') autoMatched++
        else if (tx.statut === 'non_identifie') unknown++
        if (tx.matched_type === 'qualification_requise') qualificationRequise++
      }
    }
    const tauxAuto = totalTx > 0 ? Math.round((autoMatched / totalTx) * 100) : 0

    // Lettrage 401/411
    const ecr401Data: any[] = (ecr401Res as any)?.data || []
    const ecr401 = ecr401Data.filter((e: any) => (e.numero_compte || '').match(/^(401|411)/))
    const ecr401Lettrees = ecr401.filter((e: any) => e.lettre)
    const tauxLettrage = ecr401.length > 0 ? Math.round((ecr401Lettrees.length / ecr401.length) * 100) : 0

    // Solde 580 transit
    const ecrBNQData: any[] = (ecrBNQRes as any)?.data || []
    const solde580 = ecrBNQData.reduce((s: number, e: any) => s + (Number(e.debit_mur) || 0) - (Number(e.credit_mur) || 0), 0)

    // Factures
    const totalFact = (factures || []).length
    const facturesPaye = (factures || []).filter((f: any) => f.statut === 'paye').length
    const facturesPartiel = (factures || []).filter((f: any) => f.statut === 'partiel' || (Number(f.solde_non_paye) || 0) > 0).length
    const facturesAttente = (factures || []).filter((f: any) => f.statut === 'en_attente' || f.statut === 'retard').length
    const tauxPaye = totalFact > 0 ? Math.round((facturesPaye / totalFact) * 100) : 0

    // Alertes conformité
    const alertsData = (alertsRes as any)?.data || []
    const alertsCritical = alertsData.filter((a: any) => a.severity === 'critical').length
    const alertsHigh = alertsData.filter((a: any) => a.severity === 'high').length
    const alertsTotal = alertsData.length

    // Rapprochements mensuels
    const recon: any[] = (reconciliationsRes as any)?.data || []
    const reconLocked = recon.filter((r: any) => r.status === 'locked').length
    const reconValidated = recon.filter((r: any) => r.status === 'validated').length
    const reconDraft = recon.filter((r: any) => r.status === 'draft').length

    // Balance âgée fournisseurs
    // Si solde_non_paye n'est pas défini (legacy), on prend montant_ttc pour les factures
    // non payées. Seules les factures avec statut 'paye' sont exclues.
    const today = new Date()
    const aged = { '0-30': 0, '31-60': 0, '61-90': 0, '>90': 0 }
    for (const f of factures || []) {
      if (f.statut === 'paye') continue
      const snp = Number(f.solde_non_paye)
      const mtt = Number(f.montant_ttc) || 0
      // Si solde_non_paye est null/undefined/0, on prend montant_ttc (cas legacy)
      const soldeRestant = (f.solde_non_paye !== null && f.solde_non_paye !== undefined && !isNaN(snp) && snp > 0) ? snp : mtt
      if (soldeRestant <= 0) continue
      const factDate = f.date_facture ? new Date(f.date_facture) : today
      const days = Math.floor((today.getTime() - factDate.getTime()) / (1000 * 60 * 60 * 24))
      if (days <= 30) aged['0-30'] += soldeRestant
      else if (days <= 60) aged['31-60'] += soldeRestant
      else if (days <= 90) aged['61-90'] += soldeRestant
      else aged['>90'] += soldeRestant
    }

    return NextResponse.json({
      kpis: {
        // Cibles référentiel
        taux_auto: { value: tauxAuto, target: 80, status: tauxAuto >= 80 ? 'ok' : 'warning', label: 'Rapprochement automatique' },
        transactions_inconnu: { value: unknown, target: 5, status: unknown < 5 ? 'ok' : unknown < 20 ? 'warning' : 'error', label: 'Transactions non identifiées' },
        taux_lettrage_401: { value: tauxLettrage, target: 95, status: tauxLettrage >= 95 ? 'ok' : tauxLettrage >= 80 ? 'warning' : 'error', label: 'Lettrage 401/411' },
        solde_580_transit: { value: Math.round(solde580 * 100) / 100, target: 0, status: Math.abs(solde580) < 1 ? 'ok' : 'warning', label: 'Solde 580 transit' },
        alertes_critiques: { value: alertsCritical, target: 0, status: alertsCritical === 0 ? 'ok' : 'error', label: 'Alertes critiques ouvertes' },
        qualification_requise: { value: qualificationRequise, target: 0, status: qualificationRequise === 0 ? 'ok' : 'warning', label: 'Qualifications en attente' },

        // Métriques factures
        factures: {
          total: totalFact,
          paye: facturesPaye,
          partiel: facturesPartiel,
          attente: facturesAttente,
          taux_paye: tauxPaye,
        },

        // Balance âgée
        aged_balance: aged,

        // Rapprochements
        reconciliations: {
          locked: reconLocked,
          validated: reconValidated,
          draft: reconDraft,
          total: recon.length,
        },

        // Alertes conformité
        compliance: {
          critical: alertsCritical,
          high: alertsHigh,
          total_open: alertsTotal,
        },

        // Summary
        summary: {
          total_transactions: totalTx,
          matched: autoMatched,
          unknown: unknown,
        },
      },
    })
  } catch (e: any) {
    console.error('[kpis]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
