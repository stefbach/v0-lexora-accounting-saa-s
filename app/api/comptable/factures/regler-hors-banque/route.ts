/**
 * POST /api/comptable/factures/regler-hors-banque
 *
 * Marque une ou plusieurs factures comme payées HORS BANQUE, en créant
 * les écritures comptables OD-TIERS qui imputent le règlement sur un
 * compte de tiers (associé, société liée, exploitant…).
 *
 * Body :
 *   {
 *     societe_id: string,
 *     facture_ids: string[],            // 1 ou N factures
 *     compte_paiement_tiers_id: string, // FK vers comptes_paiement_tiers
 *     date_paiement: 'YYYY-MM-DD',
 *     libelle?: string,
 *   }
 *
 * Pour chaque facture :
 *   • Vérifie statut (en_attente/retard/partiel) — refuse si paye/annule
 *   • Marque paye, solde_non_paye = 0
 *   • Crée écriture OD-TIERS : D 401/411 / C <code_compte_tiers>
 *   • Lettre la facture (VTE/ACH) avec le même code que le règlement
 *
 * Audit + rollback complet en cas d'échec partiel.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { createEcrituresReglementTiers } from '@/lib/accounting/reglement-tiers'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: Request) {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { societe_id, facture_ids, compte_paiement_tiers_id, date_paiement, libelle } = body

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    if (!Array.isArray(facture_ids) || facture_ids.length === 0) {
      return NextResponse.json({ error: 'facture_ids requis (array non vide)' }, { status: 400 })
    }
    if (!compte_paiement_tiers_id) {
      return NextResponse.json({ error: 'compte_paiement_tiers_id requis' }, { status: 400 })
    }
    if (!date_paiement || !/^\d{4}-\d{2}-\d{2}$/.test(date_paiement)) {
      return NextResponse.json({ error: 'date_paiement invalide (format YYYY-MM-DD)' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // 1. Charger le compte tiers (whitelist) et vérifier qu'il est actif
    const { data: compteTiers, error: ctErr } = await supabase
      .from('comptes_paiement_tiers')
      .select('id, societe_id, code_compte, nom_compte, type, actif')
      .eq('id', compte_paiement_tiers_id).maybeSingle()
    if (ctErr || !compteTiers) {
      return NextResponse.json({ error: 'Compte de paiement tiers introuvable' }, { status: 404 })
    }
    if (compteTiers.societe_id !== societe_id) {
      return NextResponse.json({ error: 'Compte tiers n\'appartient pas à cette société' }, { status: 403 })
    }
    if (!compteTiers.actif) {
      return NextResponse.json({ error: 'Compte tiers désactivé' }, { status: 400 })
    }

    // 2. Charger les factures
    const fIds: string[] = facture_ids.filter((x: any) => typeof x === 'string' && x.length > 0)
    const { data: factures, error: fErr } = await supabase
      .from('factures')
      .select('id, numero_facture, tiers, type_facture, montant_ttc, montant_mur, solde_non_paye, statut, devise, societe_id')
      .in('id', fIds)
    if (fErr || !factures || factures.length !== fIds.length) {
      return NextResponse.json({
        error: `Factures introuvables (attendu ${fIds.length}, trouvé ${factures?.length || 0})`,
      }, { status: 404 })
    }
    if (factures.some(f => f.societe_id !== societe_id)) {
      return NextResponse.json({ error: 'Une facture n\'appartient pas à cette société' }, { status: 403 })
    }
    if (factures.some(f => f.statut === 'paye' || f.statut === 'annule')) {
      return NextResponse.json({
        error: 'Une ou plusieurs factures sont déjà payées ou annulées',
      }, { status: 400 })
    }

    // 3. Lettre commune pour le lot
    const lettreCode = `HB${String(Date.now()).slice(-5)}`
    const refFolioBase = `REG-HB-${lettreCode}`

    const rollback: Array<() => Promise<any>> = []
    const processed: { facture_id: string; montant: number; bnq_ids?: string[] }[] = []
    let totalRegle = 0

    try {
      for (const f of factures) {
        const soldeAvant = f.solde_non_paye != null ? Number(f.solde_non_paye) : Number(f.montant_ttc) || 0
        const montant = soldeAvant > 0 ? soldeAvant : (Number((f as any).montant_mur) || Number(f.montant_ttc) || 0)
        if (montant <= 0) continue

        const prevState = {
          statut: f.statut, solde_non_paye: f.solde_non_paye,
        }

        // Update facture
        const { error: updErr } = await supabase.from('factures').update({
          statut: 'paye',
          solde_non_paye: 0,
          rapproche_date: date_paiement,
          rapproche_source: 'hors_banque',
        }).eq('id', f.id)
        if (updErr) throw new Error(`Facture ${f.numero_facture || f.id} update failed: ${updErr.message}`)
        rollback.unshift(async () => {
          await supabase.from('factures').update(prevState).eq('id', f.id)
        })

        // Créer écritures OD-TIERS
        const refFolio = `${refFolioBase}-${f.id}`
        const res = await createEcrituresReglementTiers(supabase as any, {
          societe_id,
          date_paiement,
          amount_mur: montant,
          type: f.type_facture === 'fournisseur' ? 'supplier' : 'client',
          tiers: String(f.tiers || '').trim(),
          facture_id: f.id,
          facture_numero: f.numero_facture,
          compte_tiers: compteTiers.code_compte,
          nom_compte_tiers: compteTiers.nom_compte,
          ref_folio: refFolio,
          lettre_code: lettreCode,
          description: libelle
            ? `${libelle} — ${f.numero_facture || ''}`.trim()
            : `Règlement hors banque ${f.numero_facture || ''} via ${compteTiers.nom_compte}`,
        })
        if (!res.ok) {
          throw new Error(`Écritures OD-TIERS échouées pour facture ${f.numero_facture || f.id}: ${res.error}`)
        }
        rollback.unshift(async () => {
          await supabase.from('ecritures_comptables_v2').delete()
            .eq('societe_id', societe_id).eq('ref_folio', refFolio)
        })

        processed.push({ facture_id: f.id, montant, bnq_ids: res.ids })
        totalRegle += montant
      }

      // 4. Audit log (best-effort)
      try {
        await supabase.from('rapprochement_audit_log').insert({
          societe_id, action: 'regler_hors_banque',
          releve_id: null, transaction_idx: null,
          facture_ids: fIds, ecriture_id: null,
          lettre_code: lettreCode, montant: totalRegle,
          devise: 'MUR',
          reason: `Règlement hors banque via ${compteTiers.code_compte} ${compteTiers.nom_compte} (${fIds.length} factures)`,
          before_state: { compte_tiers: compteTiers },
          after_state: { processed },
          user_id: user.id, user_email: user.email || null,
        })
      } catch (auditErr) {
        console.warn('[regler_hors_banque] audit log failed:', auditErr)
      }

      return NextResponse.json({
        success: true,
        lettre: lettreCode,
        nb_factures: processed.length,
        montant_total: totalRegle,
        compte_tiers: { code: compteTiers.code_compte, nom: compteTiers.nom_compte },
      })
    } catch (err: any) {
      console.error('[regler_hors_banque] failure, rolling back:', err.message)
      for (const undo of rollback) {
        try { await undo() } catch (e) { console.error('[regler_hors_banque] rollback step failed:', e) }
      }
      return NextResponse.json({
        error: `Règlement échoué (rollback ${processed.length} factures): ${err.message}`,
      }, { status: 500 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
