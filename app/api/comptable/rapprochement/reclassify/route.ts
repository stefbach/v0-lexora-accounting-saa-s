import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { classifyTransaction, detectDirector, getComplianceSeverity, type ClassificationRule } from '@/lib/accounting/classification-engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * POST /api/comptable/rapprochement/reclassify
 * body: { societe_id, scope?: 'all' | 'unclassified' }
 *
 * Réapplique les règles R01-R07 sur toutes les transactions sans facture,
 * quel que soit leur statut actuel ('non_identifie', 'a_verifier', 'rapproche' sans facture).
 * Génère les écritures BNQ correspondantes.
 */
export async function POST(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const body = await request.json().catch(() => ({}))
    const societe_id = body.societe_id
    const scope = body.scope || 'unclassified' // 'all' = re-classify toutes, 'unclassified' = celles sans règle
    const moisFilter = body.mois // YYYY-MM optionnel - limite aux tx du mois
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()

    // Charger règles + dirigeants
    const [{ data: rulesData }, { data: directorsData }] = await Promise.all([
      supabase.from('classification_rules').select('*').eq('active', true),
      supabase.from('directors_shareholders').select('id, nom_complet, role').eq('societe_id', societe_id).eq('actif', true),
    ])
    const classificationRules = (rulesData || []) as ClassificationRule[]
    const directors = directorsData || []

    if (classificationRules.length === 0) {
      return NextResponse.json({
        error: 'Aucune règle de classification active. Vérifiez que la migration 135 a été appliquée.',
      }, { status: 400 })
    }

    // Récupérer tous les relevés
    const { data: releves } = await supabase
      .from('releves_bancaires').select('id, compte_bancaire_id, transactions_json').eq('societe_id', societe_id).is('superseded_by_id', null)
    if (!releves || releves.length === 0) {
      return NextResponse.json({ matched: 0, total: 0, message: 'Aucun relevé' })
    }

    // Compte bancaire → devise
    const compteIds = [...new Set(releves.map(r => r.compte_bancaire_id).filter(Boolean))]
    const { data: comptes } = await supabase.from('comptes_bancaires').select('id, devise').in('id', compteIds)
    const deviseByCompte: Record<string, string> = {}
    for (const c of comptes || []) deviseByCompte[c.id] = c.devise || 'MUR'

    // Dossier pour écritures
    const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()

    let totalProcessed = 0
    let matched = 0
    let directorDetected = 0
    const ruleCounts: Record<string, number> = {}
    const bnqEntries: any[] = []

    for (const releve of releves) {
      const txs = [...(releve.transactions_json || [])]
      let changed = false
      const devise = deviseByCompte[releve.compte_bancaire_id] || 'MUR'

      for (let i = 0; i < txs.length; i++) {
        // Filtre par mois si demande
        if (moisFilter && /^\d{4}-\d{2}$/.test(moisFilter)) {
          const txMois = String(txs[i]?.date || '').substring(0, 7)
          if (txMois !== moisFilter) continue
        }
        const tx = txs[i]
        totalProcessed++

        // Skip si déjà rapproché avec une facture
        if (tx.facture_id) continue

        // Skip si déjà classifié par règle et scope !== 'all'
        if (scope !== 'all' && tx.matched_type?.startsWith('rule_')) continue

        // Skip si en qualification pending (dirigeant déjà détecté)
        if (tx.matched_type === 'qualification_requise' && scope !== 'all') continue

        // Appliquer règles
        const classified = classifyTransaction({
          date: tx.date || '',
          libelle: tx.libelle || '',
          tiers_detecte: tx.tiers_detecte || null,
          debit: Number(tx.debit) || 0,
          credit: Number(tx.credit) || 0,
          devise,
        }, classificationRules)

        if (classified.matched && classified.compte_debit) {
          tx.statut = 'rapproche'
          tx.matched_type = `rule_${classified.rule_code}`
          tx.note = `Auto-classé: ${classified.classification} (règle ${classified.rule_code})`
          tx.classification_rule = classified.rule_code
          tx.classification_compte = classified.compte_debit
          txs[i] = tx
          changed = true
          matched++
          ruleCounts[classified.rule_code!] = (ruleCounts[classified.rule_code!] || 0) + 1

          // Préparer écriture BNQ
          if (dossier) {
            const txDebit = Number(tx.debit) || 0
            const txCredit = Number(tx.credit) || 0
            const txAmount = Math.max(txDebit, txCredit)
            const isOut = txDebit > 0
            const refFolio = `RC-${releve.id}-${i}`

            bnqEntries.push(
              {
                dossier_id: dossier.id,
                societe_id,
                date_ecriture: tx.date || new Date().toISOString().split('T')[0],
                journal: 'BNQ',
                numero_compte: isOut ? classified.compte_debit : classified.compte_credit,
                libelle: (classified.libelle || classified.classification || '').substring(0, 100),
                debit_mur: isOut ? txAmount : 0,
                credit_mur: isOut ? 0 : txAmount,
                lettre: null,
                ref_folio: refFolio,
              },
              {
                dossier_id: dossier.id,
                societe_id,
                date_ecriture: tx.date || new Date().toISOString().split('T')[0],
                journal: 'BNQ',
                numero_compte: '512',
                libelle: `Banque — ${(classified.classification || '').substring(0, 60)}`,
                debit_mur: isOut ? 0 : txAmount,
                credit_mur: isOut ? txAmount : 0,
                lettre: null,
                ref_folio: refFolio,
              },
            )
          }

          // Alerte compliance
          if (classified.compliance_flag) {
            try {
              await supabase.from('compliance_alerts').insert({
                societe_id,
                alert_type: classified.compliance_flag,
                severity: getComplianceSeverity(classified.compliance_flag, Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0)),
                title: classified.legal_warning?.split('.')[0] || `Alerte: ${classified.classification}`,
                description: classified.legal_warning || `Transaction nécessitant attention: ${tx.libelle}`,
                legal_reference: classified.compliance_flag === 'director_loan' ? 'Companies Act 2001, Section 166' : null,
                amount: Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0),
                related_entity_type: 'transaction',
                related_entity_id: `${releve.id}-${i}`,
                created_by: user.id,
              })
            } catch { /* best-effort */ }
          }
        } else {
          // Pas de règle → détecter dirigeant
          if (directors.length > 0) {
            const dirMatch = detectDirector({
              date: tx.date || '',
              libelle: tx.libelle || '',
              tiers_detecte: tx.tiers_detecte || null,
              debit: Number(tx.debit) || 0,
              credit: Number(tx.credit) || 0,
              devise,
            }, directors)
            if (dirMatch) {
              tx.matched_type = 'qualification_requise'
              tx.qualification_status = 'pending'
              tx.director_id = dirMatch.director_id
              tx.director_name = dirMatch.director_name
              tx.note = `⚠ Qualification requise: virement avec ${dirMatch.director_name} (${dirMatch.role})`
              txs[i] = tx
              changed = true
              directorDetected++
            }
          }
        }
      }

      if (changed) {
        await supabase.from('releves_bancaires').update({ transactions_json: txs }).eq('id', releve.id)
      }
    }

    // Insérer les écritures BNQ en batch
    if (bnqEntries.length > 0) {
      const { error: insErr } = await supabase.from('ecritures_comptables_v2').insert(bnqEntries)
      if (insErr) {
        console.warn('[reclassify] BNQ insert error:', insErr.message)
      }
    }

    return NextResponse.json({
      success: true,
      total_processed: totalProcessed,
      matched,
      director_detected: directorDetected,
      bnq_entries_created: bnqEntries.length,
      rules_used: ruleCounts,
      rules_loaded: classificationRules.length,
    })
  } catch (e: any) {
    console.error('[reclassify]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
