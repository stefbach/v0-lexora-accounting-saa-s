/**
 * lib/accounting/rapprochement/post-processing.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Handlers extraits du POST /api/comptable/rapprochement (V3-23, batch 3).
 *
 * Couvre les actions « post-processing » : lettrage manuel d'écritures,
 * gestion compte courant associé (CCA), paiements employés, marquer
 * payé, classification manuelle d'une transaction (+ propagation et
 * auto-learn), clôture mensuelle, remboursement note de frais, annulation
 * globale des paiements.
 *
 * Chaque handler retourne une `NextResponse` JSON identique à l'original.
 * Les paramètres communs (`supabase`, `user`, `body`) sont injectés par
 * le routeur — pas de logique d'auth ici (déjà faite par POST).
 *
 * Helpers partagés : `bnqFreezeColumns`, `resolveHistoricalRateSafe` et
 * `creerMiroirInterSociete` restent dans route.ts et sont passés en
 * dépendances pour ne pas casser le typage strict ni introduire de
 * dépendance circulaire avec inter-societes.
 *
 * IMPORTANT — ces handlers n'altèrent en RIEN le comportement runtime :
 * c'est un déplacement strict (copie 1:1 + retour explicite). Validé via
 * `npx tsc --noEmit`.
 */
import { NextResponse } from 'next/server'
import { lastDayOfMonth } from '@/lib/rh/period'
import { getTauxChange } from '@/lib/taux-change'
import { validateLettrageGroup } from '@/lib/accounting/accounting-rules'
import { checkPeriodLock } from '@/lib/accounting/period-lock'
import { resolveInterSocieteForTransaction, COMPTE_GROUPE_451 } from '@/lib/comptable/inter-societes'

// ─────────────────────────────────────────────────────────────────────────
// Types injectés par route.ts (helpers gardés en local pour limiter
// la surface d'export et préserver les invariants taux historique).
// ─────────────────────────────────────────────────────────────────────────
export type FreezeColumns = {
  devise_origine: string | null
  montant_origine: number | null
  taux_change_applique: number | null
}

export type BnqFreezeFn = (
  devise: string | null | undefined,
  montantOrigine: number | null | undefined,
  tauxChange: number | null | undefined,
) => FreezeColumns

export type HistoricalRateOutcome = {
  rate: number | null
  fromHistorical: boolean
  missing: boolean
  devise: string
  date: string
}

export type ResolveHistoricalRateFn = (
  supabase: any,
  date: string | Date | null | undefined,
  devise: string | null | undefined,
  liveRates?: Record<string, number>,
) => Promise<HistoricalRateOutcome>

export type CreerMiroirFn = (
  supabase: any,
  params: {
    user_id: string
    societe_source_id: string
    societe_dest_id: string
    date_ecriture: string
    montant_mur: number
    libelle_source: string
    isOut: boolean
    ref_folio_source: string
    devise_origine: string | null
    montant_origine: number | null
    taux_change_applique: number | null
    lettre_code: string | null
  },
) => Promise<{ created: boolean; reason?: string; mirror_ref_folio?: string }>

export type PostProcessingDeps = {
  supabase: any
  user: { id: string }
  body: any
  bnqFreezeColumns: BnqFreezeFn
  resolveHistoricalRateSafe: ResolveHistoricalRateFn
  creerMiroirInterSociete: CreerMiroirFn
}

// ─────────────────────────────────────────────────────────────────────────
// Action: lettrer_ecritures
// FIX 9 — règles R1/R2/R7 appliquées AVANT toute mutation.
// ─────────────────────────────────────────────────────────────────────────
export async function handleLettrerEcritures(deps: PostProcessingDeps) {
  const { supabase, body } = deps
  const { ecriture_ids } = body
  if (!ecriture_ids || !Array.isArray(ecriture_ids) || ecriture_ids.length < 2) {
    return NextResponse.json({ error: 'Au moins 2 ecriture_ids requis' }, { status: 400 })
  }
  const lettreCode = `LE${String(Date.now()).slice(-4)}`
  const now = new Date().toISOString().split('T')[0]

  const { data: ecrituresToLetter } = await supabase
    .from('ecritures_comptables_v2')
    .select('id, compte:numero_compte, debit:debit_mur, credit:credit_mur, date_ecriture, lettre, journal')
    .in('id', ecriture_ids)
  if (!ecrituresToLetter || ecrituresToLetter.length !== ecriture_ids.length) {
    return NextResponse.json({ error: 'Certaines écritures sont introuvables' }, { status: 404 })
  }
  const violation = validateLettrageGroup({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shape Supabase aliased select (compte/debit/credit) ne matche pas exactement le type attendu
    ecritures: ecrituresToLetter as any,
    newLettre: lettreCode,
  })
  if (violation) {
    return NextResponse.json({
      error: 'rule_violation',
      rule_violation: violation,
      message: violation,
    }, { status: 409 })
  }

  for (const eid of ecriture_ids) {
    await supabase.from('ecritures_comptables_v2')
      .update({ lettre: lettreCode, date_lettrage: now })
      .eq('id', eid)
  }
  return NextResponse.json({ success: true, lettre: lettreCode, nb: ecriture_ids.length })
}

// ─────────────────────────────────────────────────────────────────────────
// Action: paye_par_associe
// ─────────────────────────────────────────────────────────────────────────
export async function handlePayeParAssocie(deps: PostProcessingDeps) {
  const { supabase, body } = deps
  const { transaction_id, releve_id, facture_ids, societe_id, associe_nom, compte_courant_id } = body
  if (!societe_id || !facture_ids || facture_ids.length === 0) {
    return NextResponse.json({ error: 'societe_id et facture_ids[] requis' }, { status: 400 })
  }

  let ccaId = compte_courant_id
  if (!ccaId && associe_nom) {
    const { data: existingCCA } = await supabase.from('comptes_courants_associes')
      .select('id').eq('societe_id', societe_id).eq('nom', associe_nom).maybeSingle()
    if (existingCCA) {
      ccaId = existingCCA.id
    } else {
      const { data: newCCA } = await supabase.from('comptes_courants_associes')
        .insert({ societe_id, nom: associe_nom, type: 'associe', solde: 0 }).select('id').single()
      ccaId = newCCA?.id
    }
  }
  if (!ccaId) return NextResponse.json({ error: 'associe_nom ou compte_courant_id requis' }, { status: 400 })

  const { data: factures } = await supabase.from('factures').select('id, montant_ttc, tiers, numero_facture').in('id', facture_ids)
  const totalMontant = (factures || []).reduce((s: number, f: any) => s + (Number(f.montant_ttc) || 0), 0)

  // FIX 1 — rapproche_date jamais NULL.
  const associePayDate = new Date().toISOString().split('T')[0]
  for (const f of factures || []) {
    await supabase.from('factures').update({
      statut: 'paye',
      mode_paiement: 'associe',
      paye_par: associe_nom,
      rapproche_date: associePayDate,
      rapproche_source: 'paye_par_associe',
    }).eq('id', f.id)
  }

  const description = facture_ids.length === 1
    ? `Paiement facture ${(factures || [])[0]?.numero_facture || ''}`
    : `Paiement ${facture_ids.length} factures`
  await supabase.from('mouvements_compte_courant').insert({
    compte_courant_id: ccaId, societe_id,
    date_mouvement: new Date().toISOString().split('T')[0],
    type: 'avance', montant: totalMontant,
    description,
    facture_id: facture_ids.length === 1 ? facture_ids[0] : null,
  })

  const { error: rpcError } = await supabase.rpc('increment_solde_cca', { cca_id: ccaId, delta: totalMontant })
  if (rpcError) {
    const { data: ccaData } = await supabase.from('comptes_courants_associes')
      .select('solde').eq('id', ccaId).single()
    const newSolde = (Number(ccaData?.solde) || 0) + totalMontant
    await supabase.from('comptes_courants_associes').update({ solde: newSolde }).eq('id', ccaId)
  }

  const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
  if (dossier) {
    for (const f of factures || []) {
      await supabase.from('ecritures_comptables_v2').insert([
        { societe_id, dossier_id: dossier.id, date_ecriture: new Date().toISOString().split('T')[0], journal: 'OD', numero_compte: '401', libelle: `Fournisseur ${f.tiers || ''} — payé par ${associe_nom}`, debit_mur: Number(f.montant_ttc), credit_mur: 0 },
        { societe_id, dossier_id: dossier.id, date_ecriture: new Date().toISOString().split('T')[0], journal: 'OD', numero_compte: '455', libelle: `CCA ${associe_nom} — ${f.numero_facture || ''}`, debit_mur: 0, credit_mur: Number(f.montant_ttc) },
      ])
    }
  }

  if (releve_id && transaction_id) {
    const { data: releve } = await supabase.from('releves_bancaires').select('id, transactions_json').eq('id', releve_id).single()
    if (releve) {
      const txIdx = parseInt(transaction_id.split('-').pop() || '0')
      const txs = [...(releve.transactions_json || [])]
      if (txIdx < txs.length) {
        // FIX 4 — stocker facture_id(s) pour traçabilité CCA.
        txs[txIdx] = {
          ...txs[txIdx],
          lettre: `CCA${String(Date.now()).slice(-4)}`,
          statut: 'rapproche',
          paye_par_associe: associe_nom,
          facture_id: facture_ids[0] || null,
          facture_ids,
        }
        await supabase.from('releves_bancaires').update({ transactions_json: txs }).eq('id', releve_id)
      }
    }
  }

  return NextResponse.json({
    success: true,
    cca_id: ccaId,
    montant_total: totalMontant,
    nb_factures: facture_ids.length,
    associe: associe_nom,
  })
}

// ─────────────────────────────────────────────────────────────────────────
// Action: compensation (remboursement associé via virement bancaire)
// ─────────────────────────────────────────────────────────────────────────
export async function handleCompensation(deps: PostProcessingDeps) {
  const { supabase, body } = deps
  const { transaction_id, releve_id, compte_courant_id, societe_id, montant } = body
  if (!compte_courant_id || !societe_id || !montant) {
    return NextResponse.json({ error: 'compte_courant_id, societe_id, montant requis' }, { status: 400 })
  }

  const { data: cca } = await supabase.from('comptes_courants_associes')
    .select('id, nom, solde').eq('id', compte_courant_id).single()
  if (!cca) return NextResponse.json({ error: 'Compte courant non trouvé' }, { status: 404 })

  const remboursementMontant = Number(montant)

  await supabase.from('mouvements_compte_courant').insert({
    compte_courant_id, societe_id,
    date_mouvement: new Date().toISOString().split('T')[0],
    type: 'remboursement',
    montant: -remboursementMontant,
    description: `Remboursement par virement bancaire`,
  })

  const newSolde = (Number(cca.solde) || 0) - remboursementMontant
  await supabase.from('comptes_courants_associes').update({ solde: newSolde }).eq('id', compte_courant_id)

  const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
  if (dossier) {
    await supabase.from('ecritures_comptables_v2').insert([
      { societe_id, dossier_id: dossier.id, date_ecriture: new Date().toISOString().split('T')[0], journal: 'BNQ', numero_compte: '455', libelle: `Remboursement CCA ${cca.nom}`, debit_mur: remboursementMontant, credit_mur: 0 },
      { societe_id, dossier_id: dossier.id, date_ecriture: new Date().toISOString().split('T')[0], journal: 'BNQ', numero_compte: '512', libelle: `Virement remboursement ${cca.nom}`, debit_mur: 0, credit_mur: remboursementMontant },
    ])
  }

  if (releve_id && transaction_id) {
    const { data: releve } = await supabase.from('releves_bancaires').select('id, transactions_json').eq('id', releve_id).single()
    if (releve) {
      const txIdx = parseInt(transaction_id.split('-').pop() || '0')
      const txs = [...(releve.transactions_json || [])]
      if (txIdx < txs.length) {
        txs[txIdx] = { ...txs[txIdx], lettre: `RMB${String(Date.now()).slice(-4)}`, statut: 'rapproche', compensation_cca: cca.nom }
        await supabase.from('releves_bancaires').update({ transactions_json: txs }).eq('id', releve_id)
      }
    }
  }

  return NextResponse.json({
    success: true,
    ancien_solde: Number(cca.solde),
    nouveau_solde: newSolde,
    associe: cca.nom,
    montant_rembourse: remboursementMontant,
  })
}

// ─────────────────────────────────────────────────────────────────────────
// Action: paiement_employe (virement individuel, hors bulk)
// ─────────────────────────────────────────────────────────────────────────
export async function handlePaiementEmploye(deps: PostProcessingDeps) {
  const { supabase, body } = deps
  const { transaction_id, releve_id, employe_id, societe_id, periode } = body
  if (!employe_id || !societe_id) {
    return NextResponse.json({ error: 'employe_id et societe_id requis' }, { status: 400 })
  }

  const { data: employe } = await supabase.from('employes').select('id, nom, prenom, salaire_base').eq('id', employe_id).single()
  if (!employe) return NextResponse.json({ error: 'Employé non trouvé' }, { status: 404 })

  let bulletin: any = null
  if (periode) {
    const periodeDate = periode.length === 7 ? `${periode}-01` : periode
    const { data: bul } = await supabase.from('bulletins_paie')
      .select('id, salaire_net, salaire_base, periode')
      .eq('employe_id', employe_id)
      .gte('periode', periodeDate)
      .lte('periode', lastDayOfMonth(periode))
      .limit(1).maybeSingle()
    bulletin = bul
  }

  const montantNet = bulletin ? Number(bulletin.salaire_net) : Number(employe.salaire_base) || 0
  const lettreCode = `SAL${String(Date.now()).slice(-4)}`
  const nomComplet = `${employe.prenom} ${employe.nom}`

  if (releve_id && transaction_id) {
    const { data: releve } = await supabase.from('releves_bancaires').select('id, transactions_json').eq('id', releve_id).single()
    if (releve) {
      const txIdx = parseInt(transaction_id.split('-').pop() || '0')
      const txs = [...(releve.transactions_json || [])]
      if (txIdx < txs.length) {
        txs[txIdx] = {
          ...txs[txIdx],
          lettre: lettreCode,
          statut: 'rapproche',
          employe_id,
          employe_nom: nomComplet,
          type_rapprochement: 'salaire_individuel',
          bulletin_id: bulletin?.id || null,
        }
        await supabase.from('releves_bancaires').update({ transactions_json: txs }).eq('id', releve_id)
      }
    }
  }

  const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
  if (dossier) {
    const dateEcriture = new Date().toISOString().split('T')[0]
    await supabase.from('ecritures_comptables_v2').insert([
      { societe_id, dossier_id: dossier.id, date_ecriture: dateEcriture, journal: 'BNQ', numero_compte: '4210', libelle: `Virement salaire ${nomComplet}`, debit_mur: Math.round(montantNet), credit_mur: 0, lettre: lettreCode },
      { societe_id, dossier_id: dossier.id, date_ecriture: dateEcriture, journal: 'BNQ', numero_compte: '512', libelle: `Virement salaire ${nomComplet}`, debit_mur: 0, credit_mur: Math.round(montantNet), lettre: lettreCode },
    ])
  }

  if (bulletin) {
    await supabase.from('bulletins_paie').update({ statut: 'paye' }).eq('id', bulletin.id)
  }

  return NextResponse.json({
    success: true,
    lettre: lettreCode,
    employe: nomComplet,
    montant: montantNet,
    bulletin_id: bulletin?.id || null,
    bulletin_found: !!bulletin,
  })
}

// ─────────────────────────────────────────────────────────────────────────
// Action: marquer_paye (sans transaction bancaire)
// ─────────────────────────────────────────────────────────────────────────
export async function handleMarquerPaye(deps: PostProcessingDeps) {
  const { supabase, body } = deps
  const { facture_id, societe_id, date_paiement, compte_bancaire } = body
  if (!facture_id || !societe_id) {
    return NextResponse.json({ error: 'facture_id et societe_id requis' }, { status: 400 })
  }

  const { data: facture, error: factErr } = await supabase
    .from('factures')
    .select('id, numero_facture, tiers, montant_ttc, montant_mur, devise, type_facture, date_facture, statut')
    .eq('id', facture_id)
    .single()
  if (factErr || !facture) {
    return NextResponse.json({ error: `Facture non trouvée: ${factErr?.message}` }, { status: 404 })
  }
  if (facture.statut === 'paye') {
    return NextResponse.json({ error: 'Facture déjà payée' }, { status: 400 })
  }

  const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
  if (!dossier) {
    return NextResponse.json({ error: 'Dossier comptable introuvable' }, { status: 400 })
  }

  const isFournisseur = facture.type_facture === 'fournisseur' || !facture.type_facture
  const compteAux = isFournisseur ? '401' : '411'
  const compteBanque = compte_bancaire || '512'
  const montantMUR = Math.round((Number(facture.montant_mur) || Number(facture.montant_ttc) || 0) * 100) / 100
  if (montantMUR <= 0) {
    return NextResponse.json({ error: 'Montant facture invalide' }, { status: 400 })
  }
  const dateOp = date_paiement || new Date().toISOString().split('T')[0]
  const lettre = `MP${String(Date.now()).slice(-6)}`
  const refFolio = `MP-${facture.id.substring(0, 8)}`
  const tiers = (facture.tiers || '').substring(0, 80)

  const buildEcritures = (withFactureId: boolean) => {
    const withFk = (fkId: string) => withFactureId ? { facture_id: fkId } : {}
    return isFournisseur
      ? [
          {
            dossier_id: dossier.id, societe_id,
            date_ecriture: dateOp, journal: 'BNQ',
            numero_compte: compteAux,
            libelle: `Paiement ${tiers} — ${facture.numero_facture}`.substring(0, 100),
            debit_mur: montantMUR, credit_mur: 0,
            lettre, ref_folio: refFolio,
            ...withFk(facture.id),
          },
          {
            dossier_id: dossier.id, societe_id,
            date_ecriture: dateOp, journal: 'BNQ',
            numero_compte: compteBanque,
            libelle: `Banque — Paiement ${tiers}`.substring(0, 100),
            debit_mur: 0, credit_mur: montantMUR,
            lettre, ref_folio: refFolio,
          },
        ]
      : [
          {
            dossier_id: dossier.id, societe_id,
            date_ecriture: dateOp, journal: 'BNQ',
            numero_compte: compteBanque,
            libelle: `Banque — Encaissement ${tiers}`.substring(0, 100),
            debit_mur: montantMUR, credit_mur: 0,
            lettre, ref_folio: refFolio,
          },
          {
            dossier_id: dossier.id, societe_id,
            date_ecriture: dateOp, journal: 'BNQ',
            numero_compte: compteAux,
            libelle: `Encaissement ${tiers} — ${facture.numero_facture}`.substring(0, 100),
            debit_mur: 0, credit_mur: montantMUR,
            lettre, ref_folio: refFolio,
            ...withFk(facture.id),
          },
        ]
  }

  let insResult = await supabase.from('ecritures_comptables_v2').insert(buildEcritures(true))
  let insErr: any = insResult.error
  if (insErr && /facture_id/i.test(String(insErr.message || '')) && /(does not exist|column)/i.test(String(insErr.message || ''))) {
    console.warn('[marquer_paye] facture_id column missing, retry without it')
    insResult = await supabase.from('ecritures_comptables_v2').insert(buildEcritures(false))
    insErr = insResult.error
  }
  if (insErr) {
    console.error('[marquer_paye] insertion failed:', insErr.message)
    if (/duplicate key value|unique constraint/i.test(String(insErr.message || ''))) {
      console.warn('[marquer_paye] already inserted previously, continuing to mark facture paye')
    } else {
      return NextResponse.json({
        error: `Erreur insertion écritures: ${insErr.message}`,
        hint: 'La migration 128 (ref_folio unique) et 133 (facture_id) doivent être appliquées.',
      }, { status: 500 })
    }
  }

  // Lettrer l'ACH/VTE existante.
  try {
    const upd1 = await supabase
      .from('ecritures_comptables_v2')
      .update({ lettre, date_lettrage: dateOp })
      .eq('dossier_id', dossier.id)
      .eq('facture_id', facture.id)
      .in('journal', ['ACH', 'VTE'])
      .is('lettre', null)
    if (upd1.error && /facture_id/i.test(String(upd1.error.message || ''))) {
      await supabase
        .from('ecritures_comptables_v2')
        .update({ lettre, date_lettrage: dateOp })
        .eq('dossier_id', dossier.id)
        .in('journal', ['ACH', 'VTE'])
        .is('lettre', null)
        .ilike('libelle', `%${facture.numero_facture}%`)
    }
  } catch (e: any) { console.warn('[marquer_paye] lettrage ACH failed:', e.message) }

  const tryUpdate = async (payload: Record<string, any>) => {
    return supabase.from('factures').update(payload).eq('id', facture_id).select('id, statut')
  }
  let factUpdData: any = null
  let factUpdErr: any = null
  let r = await tryUpdate({ statut: 'paye', solde_non_paye: 0, rapproche_date: dateOp, rapproche_source: 'marquer_paye' })
  if (r.error && /solde_non_paye/i.test(r.error.message || '')) {
    console.warn('[marquer_paye] fallback: colonne solde_non_paye manquante (migration 128)')
    r = await tryUpdate({ statut: 'paye', rapproche_date: dateOp, rapproche_source: 'marquer_paye' })
  }
  if (r.error && /(rapproche_source|rapproche_date)/i.test(r.error.message || '')) {
    console.warn('[marquer_paye] fallback: colonnes rapproche_* manquantes (migration 121)')
    r = await tryUpdate({ statut: 'paye' })
  }
  factUpdErr = r.error
  factUpdData = r.data
  if (factUpdErr) {
    console.error('[marquer_paye] facture update FAILED:', factUpdErr.message, factUpdErr)
    return NextResponse.json({
      error: `Ecritures creees (lettre ${lettre}) MAIS facture non marquee payee: ${factUpdErr.message}`,
      hint: 'Verifiez que les colonnes statut/rapproche_date/solde_non_paye existent',
      lettre,
      nb_ecritures: 2,
    }, { status: 500 })
  }
  if (!factUpdData || factUpdData.length === 0) {
    console.error('[marquer_paye] update silencieusement ignore - RLS ou ligne non trouvee')
    return NextResponse.json({
      error: `Facture non mise a jour (0 ligne affectee). Verifiez RLS ou que la facture existe bien`,
      lettre,
      nb_ecritures: 2,
    }, { status: 500 })
  }
  console.warn('[marquer_paye] facture updated:', factUpdData)

  return NextResponse.json({
    success: true,
    facture_id,
    lettre,
    montant: montantMUR,
    nb_ecritures: 2,
    facture_updated: factUpdData[0],
  })
}

// ─────────────────────────────────────────────────────────────────────────
// Action: classer_transaction (avec propagation + auto-learn + miroir inter-sociétés)
// ─────────────────────────────────────────────────────────────────────────
export async function handleClasserTransaction(deps: PostProcessingDeps) {
  const { supabase, user, body, bnqFreezeColumns, resolveHistoricalRateSafe, creerMiroirInterSociete } = deps
  const { transaction_id, releve_id, societe_id, classification, learn_pattern, apply_to_similar, compte_custom } = body
  if (!releve_id || !transaction_id || !classification) {
    return NextResponse.json({ error: 'releve_id, transaction_id, classification requis' }, { status: 400 })
  }
  if (compte_custom) {
    const { data: pc } = await supabase.from('plan_comptable').select('compte:numero_compte').eq('compte', compte_custom).maybeSingle()
    if (!pc) {
      return NextResponse.json({ error: `Compte "${compte_custom}" absent du plan comptable` }, { status: 400 })
    }
  }
  console.warn(`[classer_transaction] societe=${societe_id} tx=${transaction_id} classification=${classification}`)

  const { data: releve, error: relErr } = await supabase
    .from('releves_bancaires').select('id, transactions_json, compte_bancaire_id').eq('id', releve_id).single()
  if (relErr || !releve) {
    console.error('[classer_transaction] relevé introuvable:', relErr?.message)
    return NextResponse.json({ error: `Relevé non trouvé: ${relErr?.message}` }, { status: 404 })
  }

  const { data: compteBancaire } = await supabase
    .from('comptes_bancaires').select('devise').eq('id', releve.compte_bancaire_id).maybeSingle()
  const compteDeviseClasser = (compteBancaire?.devise || 'MUR').toUpperCase()
  const rates: Record<string, number> = await getTauxChange().catch(() => ({ MUR: 1, EUR: 46.50, USD: 44.80, GBP: 54.20 }))
  const txDevise = compteDeviseClasser
  const tauxDevise = rates[txDevise] || 1
  console.warn(`[classer_transaction] devise_compte=${txDevise} taux=${tauxDevise}`)

  const txIdx = parseInt(transaction_id.split('-').pop() || '0')
  const txs = [...(releve.transactions_json || [])]
  if (txIdx >= txs.length) return NextResponse.json({ error: 'Transaction non trouvée' }, { status: 404 })

  const txDate = txs[txIdx]?.date
  if (txDate && societe_id) {
    const lockStatus = await checkPeriodLock(supabase, societe_id, txDate)
    if (lockStatus.locked) {
      return NextResponse.json({ error: `Période verrouillée — ${lockStatus.reason}` }, { status: 403 })
    }
  }

  const code = `CL${String(Date.now()).slice(-6)}`
  const prevTx = { ...(txs[txIdx] || {}) }
  const oldLettre = prevTx.lettre || null
  const oldFactureIds: string[] = Array.isArray(prevTx.facture_ids) && prevTx.facture_ids.length > 0
    ? prevTx.facture_ids
    : (prevTx.facture_id ? [prevTx.facture_id] : [])

  // Garde-fou anti-doublon.
  if (prevTx.statut === 'rapproche' || prevTx.statut === 'interne') {
    return NextResponse.json({
      error: 'Cette transaction est déjà rapprochée — déclassez-la d\'abord pour la reclassifier.',
      duplicate: true,
      previous_classification: prevTx.matched_type || prevTx.classification || null,
    }, { status: 409 })
  }
  // Garde-fou CCA.
  if (classification === 'compte_courant_associe' || classification === 'remboursement_associe') {
    const { data: existingCcaMvt } = await supabase
      .from('mouvements_compte_courant')
      .select('id, type, montant')
      .eq('source_releve_id', releve_id)
      .eq('source_transaction_idx', txIdx)
      .limit(1).maybeSingle()
    if (existingCcaMvt) {
      return NextResponse.json({
        error: `Cette transaction a déjà été enregistrée en CCA (mouvement ${existingCcaMvt.type}, ${existingCcaMvt.montant} MUR) — pas de double-comptabilisation.`,
        duplicate: true,
        mouvement_id: existingCcaMvt.id,
      }, { status: 409 })
    }
    const txAmtMUR = Math.max(Number(prevTx.debit) || 0, Number(prevTx.credit) || 0)
    const txDateForMatch = prevTx.date || null
    if (txDateForMatch && txAmtMUR > 0) {
      const { data: ccaList } = await supabase
        .from('mouvements_compte_courant')
        .select('id, type, montant, date_mouvement, source_releve_id, comptes_courants_associes!inner(societe_id)')
        .is('source_releve_id', null)
        .eq('comptes_courants_associes.societe_id', societe_id)
        .eq('date_mouvement', txDateForMatch)
      const tolerance = Math.max(1, txAmtMUR * 0.001)
      const heuristicMatch = (ccaList || []).find((m: any) =>
        Math.abs(Math.abs(Number(m.montant)) - txAmtMUR) < tolerance,
      )
      if (heuristicMatch) {
        return NextResponse.json({
          error: `Un mouvement CCA non rapproché existe le ${txDateForMatch} pour ${heuristicMatch.montant} MUR — il s'agit probablement de la même opération. Liez-le manuellement avant de classifier (ou supprimez le doublon).`,
          duplicate: true,
          mouvement_id: heuristicMatch.id,
          heuristic: true,
        }, { status: 409 })
      }
    }
  }
  txs[txIdx] = { ...txs[txIdx], statut: 'rapproche', matched_type: classification, lettre: code, note: `Classification manuelle: ${classification}` }
  const { error: updRelErr, data: updRelData } = await supabase
    .from('releves_bancaires')
    .update({ transactions_json: txs })
    .eq('id', releve_id)
    .select('id')
  if (updRelErr) {
    console.error('[classer_transaction] update releve FAILED:', updRelErr.message, updRelErr)
    return NextResponse.json({ error: `MAJ releve echouee: ${updRelErr.message}` }, { status: 500 })
  }
  if (!updRelData || updRelData.length === 0) {
    console.error('[classer_transaction] update silencieusement ignore (0 ligne) - probablement RLS')
    return NextResponse.json({
      error: `Relevé non mis à jour (0 ligne affectée). RLS bloquante ou relevé inexistant.`,
    }, { status: 500 })
  }
  console.warn(`[classer_transaction] releve ${releve_id} mis a jour, tx ${txIdx} classee en ${classification}`)

  const CLASSE_COMPTES: Record<string, string> = {
    fournisseur: '401',
    client: '411',
    compte_courant_associe: '455',
    remboursement_associe: '108',
    avance_personnel: '425',
    charge_diverse: '658',
    paiement_mra: '447',
    frais_bancaires: '627',
    salaire: '4210',
    salaire_bulk: '421',
    virement_interne: '5800',
    remboursement_personnel: '108',
    charge_sociale: '431',
    loyer: '613',
    entretien: '615',
    assurance: '616',
    honoraires: '622',
    deplacement: '625',
    telecom: '626',
    impot_taxe: '635',
    materiel: '606',
    produit_divers: '706',
    autre: '471',
  }
  let compte = compte_custom || CLASSE_COMPTES[classification] || '471'

  // Détection inter-sociétés.
  const ctTxForDetect = txs[txIdx] || {}
  const ctLibelleForDetect: string = String(ctTxForDetect.libelle || '')
  const ctTiersForDetect: string = String(ctTxForDetect.tiers_detecte || '')
  let ctInterSocieteDest: string | null = null
  let ctInterSocieteScore = 0
  if (
    !compte_custom &&
    (classification === 'virement_interne' || classification === 'inter_societe')
  ) {
    try {
      const detection = await resolveInterSocieteForTransaction(
        supabase,
        societe_id as string,
        ctLibelleForDetect,
        ctTiersForDetect,
      )
      if (detection.is_inter && detection.societe_dest_id) {
        compte = COMPTE_GROUPE_451
        ctInterSocieteDest = detection.societe_dest_id
        ctInterSocieteScore = detection.score
        console.warn(
          `[classer_transaction] INTER-SOCIÉTÉS détecté ` +
          `(${detection.match_method}, score=${detection.score.toFixed(2)}) — ` +
          `compte forcé à 451, dest=${detection.societe_dest_id}`,
        )
      }
    } catch (detErr: any) {
      console.warn('[classer_transaction] détection inter-sociétés échouée:', detErr?.message)
    }
  }

  const { data: dossier, error: dossierErr } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
  let nbEcritures = 0
  let nbEcrituresSupprimees = 0
  let ecrituresError: string | null = null
  let ecrituresAlreadyExisted = false
  if (!dossier) {
    ecrituresError = `Aucun dossier comptable trouve pour societe ${societe_id}${dossierErr ? ' : ' + dossierErr.message : ''}`
    console.warn('[classer_transaction]', ecrituresError)
  } else {
    const tx = txs[txIdx]
    const txAmt = Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0)
    const isOut = (Number(tx.debit) || 0) > 0
    const effectiveDevise = ((tx.devise as string | undefined) || compteDeviseClasser || 'MUR').toUpperCase()
    const dateEcrCT = tx.date || new Date().toISOString().split('T')[0]
    const ctOutcome = await resolveHistoricalRateSafe(supabase, dateEcrCT, effectiveDevise, rates)
    const effectiveTaux = ctOutcome.rate != null
      ? ctOutcome.rate
      : (effectiveDevise === 'MUR' ? 1 : (rates[effectiveDevise] || 1))
    const txAmtMUR = Math.round(txAmt * effectiveTaux * 100) / 100
    const deviseLabel = effectiveDevise === 'MUR' ? '' : ` [${effectiveDevise} @ ${effectiveTaux}]`
    const txMontantOrigineCT = effectiveDevise === 'MUR' ? null : Math.round(txAmt * 100) / 100
    const freezeCT = bnqFreezeColumns(effectiveDevise, txMontantOrigineCT, effectiveTaux)
    const refFolio = `CL-${releve_id}-${txIdx}`

    // Suppression anciennes écritures (reclassification).
    const { count: delByFolio } = await supabase
      .from('ecritures_comptables_v2')
      .delete({ count: 'exact' })
      .eq('societe_id', societe_id)
      .eq('ref_folio', refFolio)
    nbEcrituresSupprimees += (delByFolio || 0)
    const refFolioCLS = `CLS-${releve_id}-${txIdx}`
    const { count: delByCLS } = await supabase
      .from('ecritures_comptables_v2')
      .delete({ count: 'exact' })
      .eq('societe_id', societe_id)
      .eq('ref_folio', refFolioCLS)
    nbEcrituresSupprimees += (delByCLS || 0)
    const bankPrefix = `BANK-${releve_id}-${txIdx}`
    const { count: delByBankExact } = await supabase
      .from('ecritures_comptables_v2')
      .delete({ count: 'exact' })
      .eq('societe_id', societe_id)
      .eq('ref_folio', bankPrefix)
    nbEcrituresSupprimees += (delByBankExact || 0)
    const { count: delByBankPrefix } = await supabase
      .from('ecritures_comptables_v2')
      .delete({ count: 'exact' })
      .eq('societe_id', societe_id)
      .like('ref_folio', `${bankPrefix}-%`)
    nbEcrituresSupprimees += (delByBankPrefix || 0)
    for (const prefix of [`TDS-${releve_id}-${txIdx}`, `MC-${releve_id}-${txIdx}`]) {
      const { count } = await supabase
        .from('ecritures_comptables_v2')
        .delete({ count: 'exact' })
        .eq('societe_id', societe_id)
        .eq('ref_folio', prefix)
      nbEcrituresSupprimees += (count || 0)
    }
    if (oldLettre && oldLettre !== code) {
      const { count: delByLettre } = await supabase
        .from('ecritures_comptables_v2')
        .delete({ count: 'exact' })
        .eq('societe_id', societe_id)
        .eq('lettre', oldLettre)
        .eq('journal', 'BNQ')
      nbEcrituresSupprimees += (delByLettre || 0)
      await supabase
        .from('ecritures_comptables_v2')
        .update({ lettre: null, date_lettrage: null })
        .eq('societe_id', societe_id)
        .eq('lettre', oldLettre)
        .neq('journal', 'BNQ')
    }
    if (nbEcrituresSupprimees > 0) {
      console.warn(`[classer_transaction] ${nbEcrituresSupprimees} anciennes ecritures supprimees (ref_folios CL/CLS/BANK/TDS/MC, lettre=${oldLettre})`)
    }

    // Reclassification factures.
    if (oldFactureIds.length > 0 && classification !== 'fournisseur' && classification !== 'client') {
      const { error: resetFacErr } = await supabase
        .from('factures')
        .update({
          statut: 'en_attente',
          rapproche_releve_id: null,
          rapproche_transaction_idx: null,
          rapproche_date: null,
          rapproche_source: null,
        })
        .in('id', oldFactureIds)
      if (!resetFacErr) {
        console.warn(`[classer_transaction] ${oldFactureIds.length} facture(s) remise(s) en_attente (classification devient ${classification})`)
      }
      txs[txIdx] = { ...txs[txIdx], facture_id: null, facture_ids: undefined, rapprochement_multi: undefined, nb_factures: undefined }
      await supabase.from('releves_bancaires').update({ transactions_json: txs }).eq('id', releve_id)
    }

    // Reclassification CCA.
    try {
      const { data: oldMvts, count: nbMvtsSupprimees } = await supabase
        .from('mouvements_compte_courant')
        .delete({ count: 'exact' })
        .eq('societe_id', societe_id)
        .eq('source_releve_id', releve_id)
        .eq('source_transaction_idx', txIdx)
        .select('compte_courant_id, type, montant')
      if (oldMvts && oldMvts.length > 0) {
        const ccaIds = Array.from(new Set(oldMvts.map((m: any) => m.compte_courant_id)))
        for (const ccaId of ccaIds) {
          const { data: remaining } = await supabase
            .from('mouvements_compte_courant')
            .select('type, montant')
            .eq('compte_courant_id', ccaId)
          const newSolde = (remaining || []).reduce((sum: number, m: any) => {
            const sign = ['avance', 'retrait'].includes(m.type) ? -1 :
                         ['apport', 'remboursement'].includes(m.type) ? 1 : 0
            return sum + sign * (Number(m.montant) || 0)
          }, 0)
          await supabase.from('comptes_courants_associes')
            .update({ solde: Math.round(newSolde * 100) / 100, updated_at: new Date().toISOString() })
            .eq('id', ccaId)
        }
        console.warn(`[classer_transaction] ${nbMvtsSupprimees} ancien(s) mouvement(s) CCA supprimé(s) sur ${ccaIds.length} compte(s) — soldes recalculés`)
      }
    } catch (cleanupErr) {
      console.warn('[classer_transaction] CCA cleanup failed:', cleanupErr)
    }

    // R7 : pas de lettre sur 6xxx/7xxx.
    const compteClass = compte.charAt(0)
    const lettreOnCompte = (compteClass !== '6' && compteClass !== '7') ? code : null

    const ecrituresPayload = [
      {
        dossier_id: dossier.id, societe_id, date_ecriture: dateEcrCT,
        journal: 'BNQ', numero_compte: compte,
        libelle: `${classification} — ${(tx.tiers_detecte || tx.libelle || '').substring(0, 60)}${deviseLabel}`,
        debit_mur: isOut ? txAmtMUR : 0, credit_mur: isOut ? 0 : txAmtMUR,
        lettre: lettreOnCompte, ref_folio: refFolio,
        ...freezeCT,
      },
      {
        dossier_id: dossier.id, societe_id, date_ecriture: dateEcrCT,
        journal: 'BNQ', numero_compte: '512',
        libelle: `Banque${deviseLabel} — ${(tx.tiers_detecte || '').substring(0, 25)}`,
        debit_mur: isOut ? 0 : txAmtMUR, credit_mur: isOut ? txAmtMUR : 0,
        lettre: code, ref_folio: refFolio,
        ...freezeCT,
      },
    ]
    const { error: insEcrErr, data: insEcrData } = await supabase
      .from('ecritures_comptables_v2')
      .insert(ecrituresPayload)
      .select('id')
    if (insEcrErr) {
      if (/duplicate key value|unique constraint/i.test(String(insEcrErr.message || ''))) {
        ecrituresAlreadyExisted = true
        const { data: existing } = await supabase
          .from('ecritures_comptables_v2')
          .update({ lettre: code, numero_compte: compte })
          .eq('ref_folio', refFolio)
          .neq('numero_compte', '512')
          .select('id')
        await supabase
          .from('ecritures_comptables_v2')
          .update({ libelle: `${classification} — ${(tx.tiers_detecte || tx.libelle || '').substring(0, 60)}` })
          .eq('ref_folio', refFolio)
          .neq('numero_compte', '512')
        nbEcritures = (existing?.length || 0) + 1
        console.warn(`[classer_transaction] ecritures deja existantes (re-click) pour ref_folio=${refFolio}, mises a jour avec nouvelle classif=${classification}`)
      } else {
        ecrituresError = insEcrErr.message
        console.error('[classer_transaction] insertion ecritures FAILED:', insEcrErr.message, insEcrErr)
      }
    } else {
      nbEcritures = insEcrData?.length || 2
      console.warn('[classer_transaction] ecritures inserees:', nbEcritures)
    }

    // Miroir inter-sociétés.
    if (ctInterSocieteDest && !ecrituresError) {
      try {
        const mirrorRes = await creerMiroirInterSociete(supabase, {
          user_id: user.id,
          societe_source_id: societe_id as string,
          societe_dest_id: ctInterSocieteDest,
          date_ecriture: dateEcrCT,
          montant_mur: txAmtMUR,
          libelle_source: `${classification} — ${ctLibelleForDetect.substring(0, 100)}`,
          isOut,
          ref_folio_source: refFolio,
          devise_origine: freezeCT.devise_origine,
          montant_origine: freezeCT.montant_origine,
          taux_change_applique: freezeCT.taux_change_applique,
          lettre_code: code,
        })
        if (mirrorRes.created) {
          console.warn(`[classer_transaction/inter] miroir créé dest=${ctInterSocieteDest} score=${ctInterSocieteScore.toFixed(2)}`)
        } else {
          console.warn(`[classer_transaction/inter] miroir non créé : ${mirrorRes.reason}`)
        }
      } catch (mirrorErr: any) {
        console.warn('[classer_transaction/inter] miroir échoué (non-bloquant):', mirrorErr?.message)
      }
    }
  }

  // SYNC CCA.
  let ccaSynced = false
  let ccaError: string | null = null
  if (classification === 'compte_courant_associe') {
    try {
      const tx = txs[txIdx]
      const nomAssocie = (tx.tiers_detecte || '').trim()
      const BANK_LIKE_NAMES = /^(mcb|sbm|bom|bank of mauritius|mauritius commercial bank|state bank|absa|hsbc|barclays|afrasia|standard chartered)(\s|$)/i
      const FEE_LIKE_NAMES = /^(tax amount due|service fee|outward transfer|swift charge|stamp duty|merchant|bank charge|commission)/i
      if (!nomAssocie || nomAssocie.length < 3) {
        ccaError = 'Tiers absent ou trop court pour creer le CCA'
      } else if (BANK_LIKE_NAMES.test(nomAssocie) || FEE_LIKE_NAMES.test(nomAssocie)) {
        ccaError = `Tiers "${nomAssocie}" ressemble à une banque ou un frais bancaire — refus de créer un CCA. Re-classifie cette transaction en 'frais_bancaires'.`
      } else {
        const { data: existingCompte } = await supabase
          .from('comptes_courants_associes')
          .select('id, solde')
          .eq('societe_id', societe_id)
          .ilike('nom', nomAssocie)
          .limit(1)
          .maybeSingle()

        let compteId: string | null = existingCompte?.id || null
        let currentSolde = Number(existingCompte?.solde || 0)

        if (!compteId) {
          const { data: newCompte, error: createErr } = await supabase
            .from('comptes_courants_associes')
            .insert({ societe_id, nom: nomAssocie, type: 'associe', solde: 0 })
            .select('id, solde')
            .single()
          if (createErr) {
            ccaError = `Impossible de creer le compte courant: ${createErr.message}`
          } else {
            compteId = newCompte.id
            currentSolde = 0
          }
        }

        if (compteId) {
          const montantOrig = Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0)
          const ccaDevise = ((tx.devise as string | undefined) || compteDeviseClasser || 'MUR').toUpperCase()
          const ccaTaux = ccaDevise === 'MUR' ? 1 : (rates[ccaDevise] || 1)
          const montant = Math.round(montantOrig * ccaTaux * 100) / 100
          const isOut = (Number(tx.debit) || 0) > 0
          const type = isOut ? 'avance' : 'apport'
          const deltaSolde = isOut ? -montant : montant
          const conversionLabel = ccaDevise === 'MUR' ? '' : ` (${montantOrig.toFixed(2)} ${ccaDevise} @ ${ccaTaux})`
          const description = `${isOut ? 'Avance societe a associe' : 'Apport associe a societe'}${conversionLabel} — ${(tx.libelle || '').substring(0, 60)}`

          const { error: mvtErr } = await supabase
            .from('mouvements_compte_courant')
            .insert({
              compte_courant_id: compteId,
              societe_id,
              date_mouvement: tx.date || new Date().toISOString().split('T')[0],
              type,
              montant,
              description,
              source_releve_id: releve_id,
              source_transaction_idx: txIdx,
              source_kind: 'classifier',
            })
          if (mvtErr) {
            ccaError = `Mouvement CCA non cree: ${mvtErr.message}`
          } else {
            await supabase
              .from('comptes_courants_associes')
              .update({ solde: currentSolde + deltaSolde, updated_at: new Date().toISOString() })
              .eq('id', compteId)
            ccaSynced = true
            console.warn(`[classer_transaction] CCA synced: ${nomAssocie} type=${type} montant=${montant} nouveau_solde=${currentSolde + deltaSolde}`)
          }
        }
      }
    } catch (e: any) {
      ccaError = e.message
      console.error('[classer_transaction] CCA sync exception:', e)
    }
  }

  // AUTO-LEARN.
  let patternSaved = false
  let learnError: string | null = null
  try {
    const tx = txs[txIdx]
    const patternTiers = (learn_pattern?.tiers || tx.tiers_detecte || '').trim()
    if (!patternTiers || patternTiers.length < 3) {
      learnError = 'Pattern tiers trop court ou absent'
    } else {
      const { data: existing, error: existErr } = await supabase
        .from('classification_rules')
        .select('id')
        .eq('societe_id', societe_id)
        .eq('pattern_tiers', patternTiers)
        .eq('classification', classification)
        .maybeSingle()
      if (existErr && /does not exist/i.test(String(existErr.message || ''))) {
        learnError = 'Table classification_rules absente (migration 135 non appliquee)'
      } else if (existing) {
        patternSaved = true
        console.warn(`[classer_transaction] regle existe deja pour "${patternTiers}" -> ${classification}`)
      } else {
        const ruleCode = `LEARN_${societe_id.substring(0, 8)}_${Date.now().toString(36)}`
        const { error: ruleErr } = await supabase.from('classification_rules').insert({
          rule_code: ruleCode,
          societe_id,
          priority: 100,
          active: true,
          pattern_libelle: null,
          pattern_tiers: patternTiers,
          classification,
          compte_debit: compte,
          compte_credit: '512',
          libelle_template: `${classification} — {{tiers}}`,
          requires_validation: false,
        })
        if (ruleErr) {
          learnError = ruleErr.message
          console.error('[classer_transaction] auto-learn insert FAILED:', ruleErr.message, ruleErr)
        } else {
          patternSaved = true
          console.warn(`[classer_transaction] auto-learn: regle ${ruleCode} creee pour tiers="${patternTiers}" -> ${classification}`)
        }
      }
    }
  } catch (e: any) {
    learnError = e.message
    console.warn('[classer_transaction] auto-learn exception:', e.message)
  }

  // PROPAGATION.
  let nbPropagated = 0
  let propagationError: string | null = null
  const propStats = { scanned: 0, skip_facture: 0, skip_already: 0, skip_tiers_vide: 0, skip_tiers_diff: 0, matched: 0 }
  const normalize = (s: string) => (s || '')
    .trim()
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|mme|monsieur|madame|m\.|sir)\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (apply_to_similar) {
    try {
      const currentTx = txs[txIdx]
      const rawTiers = currentTx.tiers_detecte || currentTx.tiers || ''
      const targetTiers = normalize(rawTiers)
      console.warn(`[classer_transaction] propagation demarree - raw="${rawTiers}" normalized="${targetTiers}"`)
      if (!targetTiers || targetTiers.length < 3) {
        propagationError = `Tiers trop court pour propager (raw="${rawTiers}", normalized="${targetTiers}")`
      } else {
        const { data: allReleves } = await supabase
          .from('releves_bancaires')
          .select('id, transactions_json, compte_bancaire_id')
          .eq('societe_id', societe_id)

        const cbIds = Array.from(new Set((allReleves || []).map((r: any) => r.compte_bancaire_id).filter(Boolean)))
        const { data: cbData } = cbIds.length > 0
          ? await supabase.from('comptes_bancaires').select('id, devise').in('id', cbIds)
          : { data: [] }
        const deviseByCb: Record<string, string> = {}
        for (const c of cbData || []) {
          const row = c as { id: string; devise?: string | null }
          deviseByCb[row.id] = (row.devise || 'MUR').toUpperCase()
        }

        const { data: dossierProp } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()

        for (const rel of allReleves || []) {
          const relTxs = [...(rel.transactions_json || [])]
          let changed = false
          const relDevise = deviseByCb[(rel as { compte_bancaire_id?: string }).compte_bancaire_id || ''] || 'MUR'
          for (let i = 0; i < relTxs.length; i++) {
            const t = relTxs[i]
            if (rel.id === releve_id && i === txIdx) continue
            propStats.scanned++
            if (t.facture_id) { propStats.skip_facture++; continue }
            if (t.matched_type === classification) { propStats.skip_already++; continue }
            const rawTxTiers = t.tiers_detecte || t.tiers || ''
            const txTiers = normalize(rawTxTiers)
            if (!txTiers || txTiers.length < 3) { propStats.skip_tiers_vide++; continue }
            if (txTiers !== targetTiers) { propStats.skip_tiers_diff++; continue }
            propStats.matched++
            const propCode = `CL${String(Date.now()).slice(-6)}${i}`
            relTxs[i] = {
              ...t,
              statut: 'rapproche',
              matched_type: classification,
              lettre: propCode,
              note: `Propage depuis ${transaction_id} (classifie manuellement en ${classification})`,
            }
            changed = true
            nbPropagated++
            if (dossierProp) {
              const txAmtOrig = Math.max(Number(t.debit) || 0, Number(t.credit) || 0)
              const isOut = (Number(t.debit) || 0) > 0
              const propRef = `CL-${rel.id}-${i}`
              const propDate = t.date || new Date().toISOString().split('T')[0]
              const propDevise = (t.devise || relDevise || 'MUR').toUpperCase()
              const propOutcome = await resolveHistoricalRateSafe(
                supabase, propDate, propDevise, rates,
              )
              const propRate = propOutcome.rate != null
                ? propOutcome.rate
                : (propDevise === 'MUR' ? 1 : (rates[propDevise] || 1))
              const txAmt = Math.round(
                (propDevise === 'MUR' ? txAmtOrig : txAmtOrig * propRate) * 100,
              ) / 100
              const propMontantOrig = propDevise === 'MUR' ? null : Math.round(txAmtOrig * 100) / 100
              const freezeProp = bnqFreezeColumns(propDevise, propMontantOrig, propRate)
              const devLbl = propDevise === 'MUR' ? '' : ` [${propDevise} @ ${propRate}]`
              try {
                const { error: insErr } = await supabase.from('ecritures_comptables_v2').insert([
                  {
                    dossier_id: dossierProp.id, societe_id,
                    date_ecriture: propDate,
                    journal: 'BNQ', numero_compte: compte,
                    libelle: `${classification} — ${(rawTxTiers || t.libelle || '').substring(0, 60)}${devLbl}`,
                    debit_mur: isOut ? txAmt : 0, credit_mur: isOut ? 0 : txAmt,
                    lettre: propCode, ref_folio: propRef,
                    ...freezeProp,
                  },
                  {
                    dossier_id: dossierProp.id, societe_id,
                    date_ecriture: propDate,
                    journal: 'BNQ', numero_compte: '512',
                    libelle: `Banque${devLbl} — ${(rawTxTiers || '').substring(0, 25)}`,
                    debit_mur: isOut ? 0 : txAmt, credit_mur: isOut ? txAmt : 0,
                    lettre: propCode, ref_folio: propRef,
                    ...freezeProp,
                  },
                ])
                if (insErr && !/duplicate key|unique constraint/i.test(String(insErr.message))) {
                  console.warn(`[propagation] ecritures insert failed for tx=${rel.id}-${i}:`, insErr.message)
                }
              } catch (e: any) {
                console.warn(`[propagation] ecritures exception for tx=${rel.id}-${i}:`, e.message)
              }

              if (classification === 'compte_courant_associe' && rawTxTiers) {
                try {
                  const { data: existingCcaProp } = await supabase
                    .from('comptes_courants_associes')
                    .select('id, solde')
                    .eq('societe_id', societe_id)
                    .ilike('nom', rawTxTiers.trim())
                    .limit(1)
                    .maybeSingle()
                  let ccaId = existingCcaProp?.id
                  let solde = Number(existingCcaProp?.solde || 0)
                  if (!ccaId) {
                    const { data: newCca } = await supabase
                      .from('comptes_courants_associes')
                      .insert({ societe_id, nom: rawTxTiers.trim(), type: 'associe', solde: 0 })
                      .select('id, solde')
                      .single()
                    ccaId = newCca?.id
                  }
                  if (ccaId) {
                    const delta = isOut ? -txAmt : txAmt
                    const { data: existingMvt } = await supabase
                      .from('mouvements_compte_courant')
                      .select('id')
                      .eq('compte_courant_id', ccaId)
                      .eq('source_releve_id', rel.id)
                      .eq('source_transaction_idx', i)
                      .limit(1)
                    if (!existingMvt || existingMvt.length === 0) {
                      const { error: propInsErr } = await supabase.from('mouvements_compte_courant').insert({
                        compte_courant_id: ccaId, societe_id,
                        date_mouvement: t.date || new Date().toISOString().split('T')[0],
                        type: isOut ? 'avance' : 'apport',
                        montant: txAmt,
                        description: `Propage (${classification}) ${propDevise !== 'MUR' ? `[${txAmtOrig.toFixed(2)} ${propDevise} @ ${propRate}]` : ''} — ${(t.libelle || '').substring(0, 60)}`,
                        source_releve_id: rel.id,
                        source_transaction_idx: i,
                        source_kind: 'propagation',
                      })
                      if (!propInsErr) {
                        await supabase.from('comptes_courants_associes')
                          .update({ solde: solde + delta, updated_at: new Date().toISOString() })
                          .eq('id', ccaId)
                      }
                    }
                  }
                } catch (e: any) {
                  console.warn(`[propagation] CCA sync exception:`, e.message)
                }
              }
            }
          }
          if (changed) {
            await supabase.from('releves_bancaires').update({ transactions_json: relTxs }).eq('id', rel.id)
          }
        }
        console.warn(`[classer_transaction] propagation: ${nbPropagated} tx classees avec tiers "${targetTiers}" = ${classification}. Stats=`, propStats)
      }
    } catch (e: any) {
      propagationError = e.message
      console.error('[classer_transaction] propagation FAILED:', e)
    }
  }

  return NextResponse.json({
    success: true,
    lettre: code,
    classification,
    nb_ecritures: nbEcritures,
    ecritures_already_existed: ecrituresAlreadyExisted,
    pattern_saved: patternSaved,
    cca_synced: ccaSynced,
    nb_propagated: nbPropagated,
    propagation_stats: apply_to_similar ? propStats : undefined,
    warnings: {
      ecritures: ecrituresError,
      learn: learnError,
      propagation: propagationError,
      cca: ccaError,
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────
// Action: cloturer_mois (invariants + bank_reconciliation + verrou période)
// ─────────────────────────────────────────────────────────────────────────
export async function handleCloturerMois(deps: PostProcessingDeps) {
  const { supabase, user, body } = deps
  const { societe_id, mois, force } = body
  if (!societe_id || !mois) {
    return NextResponse.json({ error: 'societe_id et mois (YYYY-MM) requis' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}$/.test(mois)) {
    return NextResponse.json({ error: 'Format mois invalide - attendu YYYY-MM' }, { status: 400 })
  }

  const [annee, moisNum] = mois.split('-').map(Number)
  const period_start = `${annee}-${String(moisNum).padStart(2, '0')}-01`
  const lastDay = new Date(annee, moisNum, 0).getDate()
  const period_end = `${annee}-${String(moisNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const invariants: { check: string; ok: boolean; details?: string }[] = []

  const { data: releves } = await supabase
    .from('releves_bancaires').select('id, transactions_json, compte_bancaire_id').eq('societe_id', societe_id).is('superseded_by_id', null)
  let tx_non_identifie = 0
  let tx_a_verifier = 0
  let tx_total_mois = 0
  for (const r of releves || []) {
    for (const tx of ((r as { transactions_json?: Array<{ date?: string; statut?: string }> | null }).transactions_json || [])) {
      const d = tx.date || ''
      if (d.substring(0, 7) !== mois) continue
      tx_total_mois++
      if (tx.statut === 'non_identifie') tx_non_identifie++
      else if (tx.statut === 'a_verifier') tx_a_verifier++
    }
  }
  invariants.push({
    check: 'Aucune transaction non identifiee',
    ok: tx_non_identifie === 0,
    details: tx_non_identifie > 0 ? `${tx_non_identifie} tx en statut non_identifie` : undefined,
  })
  invariants.push({
    check: 'Aucune transaction a verifier',
    ok: tx_a_verifier === 0,
    details: tx_a_verifier > 0 ? `${tx_a_verifier} tx en statut a_verifier` : undefined,
  })

  const { data: dossierClosure } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
  let ecr_non_lettrees = 0
  let solde_580 = 0
  if (dossierClosure) {
    const { data: ecrs } = await supabase
      .from('ecritures_comptables_v2')
      .select('numero_compte, debit_mur, credit_mur, lettre')
      .eq('dossier_id', dossierClosure.id)
      .gte('date_ecriture', period_start)
      .lte('date_ecriture', period_end)
    for (const e of ecrs || []) {
      const c = String(e.numero_compte || '')
      if (!e.lettre && (c.startsWith('401') || c.startsWith('411'))) ecr_non_lettrees++
      if (c.startsWith('580')) solde_580 += (Number(e.debit_mur) || 0) - (Number(e.credit_mur) || 0)
    }
  }
  invariants.push({
    check: 'Toutes ecritures 401/411 du mois lettrees',
    ok: ecr_non_lettrees === 0,
    details: ecr_non_lettrees > 0 ? `${ecr_non_lettrees} ecritures 401/411 non lettrees` : undefined,
  })
  invariants.push({
    check: 'Solde 580 (virements internes) = 0',
    ok: Math.abs(solde_580) < 0.01,
    details: Math.abs(solde_580) >= 0.01 ? `Solde restant : ${solde_580.toFixed(2)} MUR` : undefined,
  })

  const allOk = invariants.every(i => i.ok)
  const failedChecks = invariants.filter(i => !i.ok)

  if (!allOk && !force) {
    return NextResponse.json({
      error: 'Invariants non respectes - classez toutes les transactions et lettrez les ecritures avant la cloture',
      invariants,
      blockers: failedChecks.map(f => f.check + (f.details ? ` (${f.details})` : '')),
    }, { status: 400 })
  }

  const compteBancaireIds = Array.from(new Set((releves || []).map((r: any) => r.compte_bancaire_id).filter(Boolean)))
  const createdReconciliations: any[] = []
  for (const cbId of compteBancaireIds) {
    const { data: cb } = await supabase.from('comptes_bancaires')
      .select('compte_comptable').eq('id', cbId).single()
    const numeroCompteCompta = cb?.compte_comptable || '512'

    let gl_balance = 0
    if (dossierClosure) {
      const { data: ecrGl } = await supabase
        .from('ecritures_comptables_v2')
        .select('debit_mur, credit_mur')
        .eq('dossier_id', dossierClosure.id)
        .eq('numero_compte', numeroCompteCompta)
        .lte('date_ecriture', period_end)
      gl_balance = (ecrGl || []).reduce((s: number, e: any) => s + (Number(e.debit_mur) || 0) - (Number(e.credit_mur) || 0), 0)
      gl_balance = Math.round(gl_balance * 100) / 100
    }

    const { data: reconCreated, error: reconErr } = await supabase.from('bank_reconciliations').upsert({
      societe_id, compte_bancaire_id: cbId,
      numero_compte_compta: numeroCompteCompta,
      period_start, period_end,
      bank_balance: 0,
      gl_balance,
      adjusted_bank_balance: 0,
      adjusted_gl_balance: gl_balance,
      residual_gap: -gl_balance,
      status: allOk ? 'validated' : 'draft',
      prepared_by: user.id,
      validated_by: allOk ? user.id : null,
      validated_at: allOk ? new Date().toISOString() : null,
    }, { onConflict: 'societe_id,compte_bancaire_id,period_end' }).select().single()

    if (!reconErr && reconCreated) createdReconciliations.push(reconCreated)
  }

  let periodLocked = false
  if (allOk) {
    const { error: lockErr } = await supabase.from('accounting_periods').upsert({
      societe_id, period_start, period_end,
      status: 'locked',
      closed_by: user.id,
      closed_at: new Date().toISOString(),
    }, { onConflict: 'societe_id,period_end' })
    if (!lockErr) periodLocked = true
  }

  return NextResponse.json({
    success: true,
    mois,
    period_start, period_end,
    all_invariants_ok: allOk,
    invariants,
    stats: { tx_total_mois, tx_non_identifie, tx_a_verifier, ecr_non_lettrees, solde_580 },
    reconciliations_created: createdReconciliations.length,
    period_locked: periodLocked,
    forced: !!force,
  })
}

// ─────────────────────────────────────────────────────────────────────────
// Action: rembourser_employe (NDF)
// ─────────────────────────────────────────────────────────────────────────
export async function handleRembourserEmploye(deps: PostProcessingDeps) {
  const { supabase, body, bnqFreezeColumns, resolveHistoricalRateSafe } = deps
  const { transaction_id, releve_id, societe_id, employe_id, employe_nom, description, compte_charge } = body
  if (!releve_id || !transaction_id || !societe_id) {
    return NextResponse.json({ error: 'releve_id, transaction_id, societe_id requis' }, { status: 400 })
  }

  const { data: releve } = await supabase
    .from('releves_bancaires')
    .select('id, transactions_json, compte_bancaire_id')
    .eq('id', releve_id).single()
  if (!releve) return NextResponse.json({ error: 'Releve non trouve' }, { status: 404 })

  const { data: cb } = await supabase
    .from('comptes_bancaires').select('devise').eq('id', releve.compte_bancaire_id).maybeSingle()
  const compteDeviseNdf = (cb?.devise || 'MUR').toUpperCase()
  const ratesNdfLive: Record<string, number> = await getTauxChange().catch(() => ({ MUR: 1, EUR: 46.50, USD: 44.80, GBP: 54.20 }))

  const txIdx = parseInt(transaction_id.split('-').pop() || '0')
  const txs = [...(releve.transactions_json || [])]
  if (txIdx >= txs.length) return NextResponse.json({ error: 'Transaction non trouvee' }, { status: 404 })

  const txDate = txs[txIdx]?.date
  if (txDate) {
    const lockStatus = await checkPeriodLock(supabase, societe_id, txDate)
    if (lockStatus.locked) {
      return NextResponse.json({ error: `Periode verrouillee — ${lockStatus.reason}` }, { status: 403 })
    }
  }

  const tx = txs[txIdx]
  const montantOrig = Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0)
  const devise = (tx.devise || compteDeviseNdf || 'MUR').toUpperCase()
  const dateEcrNdf = tx.date || new Date().toISOString().split('T')[0]
  const ndfOutcome = await resolveHistoricalRateSafe(supabase, dateEcrNdf, devise, ratesNdfLive)
  const taux = ndfOutcome.rate != null
    ? ndfOutcome.rate
    : (devise === 'MUR' ? 1 : (ratesNdfLive[devise] || 1))
  const montantMUR = Math.round(montantOrig * taux * 100) / 100
  const montantOrigineNdf = devise === 'MUR' ? null : Math.round(montantOrig * 100) / 100
  const freezeNdf = bnqFreezeColumns(devise, montantOrigineNdf, taux)

  let employeInfo = null
  if (employe_id) {
    const { data: emp } = await supabase.from('employes').select('id, nom, prenom').eq('id', employe_id).single()
    if (emp) employeInfo = emp
  }
  const nomEmploye = employeInfo
    ? `${employeInfo.prenom || ''} ${employeInfo.nom || ''}`.trim()
    : (employe_nom || 'Employé')

  const code = `NDF${String(Date.now()).slice(-6)}`
  const compteDebit = compte_charge || '425'
  const refFolio = `NDF-${releve_id}-${txIdx}`

  txs[txIdx] = {
    ...tx,
    statut: 'rapproche',
    matched_type: 'remboursement_personnel',
    lettre: code,
    employe_id: employeInfo?.id || null,
    employe_nom: nomEmploye,
    note: `Remboursement ${nomEmploye} — ${description || 'Note de frais'}`,
  }
  await supabase.from('releves_bancaires').update({ transactions_json: txs }).eq('id', releve_id)

  const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
  if (dossier) {
    const devLbl = devise === 'MUR' ? '' : ` [${devise} @ ${taux}]`
    await supabase.from('ecritures_comptables_v2').insert([
      {
        dossier_id: dossier.id, societe_id,
        date_ecriture: dateEcrNdf,
        journal: 'BNQ', numero_compte: compteDebit,
        libelle: `Remboursement ${nomEmploye} — ${(description || 'NDF').substring(0, 60)}${devLbl}`,
        debit_mur: montantMUR, credit_mur: 0,
        lettre: code, ref_folio: refFolio,
        ...freezeNdf,
      },
      {
        dossier_id: dossier.id, societe_id,
        date_ecriture: dateEcrNdf,
        journal: 'BNQ', numero_compte: '512',
        libelle: `Banque${devLbl} — Remboursement ${nomEmploye.substring(0, 40)}`,
        debit_mur: 0, credit_mur: montantMUR,
        lettre: code, ref_folio: refFolio,
        ...freezeNdf,
      },
    ])
  }

  return NextResponse.json({
    success: true,
    lettre: code,
    montant_mur: montantMUR,
    devise,
    employe: nomEmploye,
    compte: compteDebit,
  })
}

// ─────────────────────────────────────────────────────────────────────────
// Action: annuler_paiement_factures (reset global ou par lot)
// ─────────────────────────────────────────────────────────────────────────
export async function handleAnnulerPaiementFactures(deps: PostProcessingDeps) {
  const { supabase, body } = deps
  const { societe_id: socId, facture_ids } = body
  if (!socId) {
    return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
  }

  const isResetAll = Array.isArray(facture_ids) && facture_ids.length === 1 && facture_ids[0] === 'ALL'

  let resetQuery = supabase
    .from('factures')
    .update({
      statut: 'en_attente',
      rapproche_releve_id: null,
      rapproche_transaction_idx: null,
      rapproche_date: null,
      rapproche_source: null,
    })
    .eq('societe_id', socId)
    .neq('statut', 'annule')
    .neq('statut', 'brouillon')

  if (!isResetAll && Array.isArray(facture_ids) && facture_ids.length > 0) {
    resetQuery = resetQuery.in('id', facture_ids)
  }

  const { data: resetData, error: resetErr } = await resetQuery.select('id')
  if (resetErr) {
    return NextResponse.json({ error: resetErr.message }, { status: 500 })
  }

  let txReset = 0
  const { data: releves } = await supabase
    .from('releves_bancaires')
    .select('id, transactions_json')
    .eq('societe_id', socId)

  for (const rel of releves || []) {
    const txs = [...(rel.transactions_json || [])]
    let changed = false
    for (let i = 0; i < txs.length; i++) {
      const tx = txs[i]
      if (!tx) continue
      if (tx.statut === 'interne' || tx.matched_type === 'transfert_interne') continue
      if (tx.statut === 'rapproche' || tx.statut === 'propose' || tx.lettre || tx.facture_id || tx.facture_ids || tx.matched_type) {
        const { lettre, facture_id, facture_ids: fids, ecriture_id, matched_type, match_confidence, note, rapproche_at, rapprochement_multi, nb_factures, ecart_montant, ...rest } = tx
        txs[i] = { ...rest, statut: 'non_identifie' }
        changed = true
        txReset++
      }
    }
    if (changed) {
      await supabase.from('releves_bancaires').update({ transactions_json: txs }).eq('id', rel.id)
    }
  }

  const { count: ecrituresDeleted } = await supabase
    .from('ecritures_comptables_v2')
    .delete({ count: 'exact' })
    .eq('societe_id', socId)
    .eq('journal', 'BNQ')

  return NextResponse.json({
    ok: true,
    nb_factures_reset: (resetData || []).length,
    nb_tx_delettrees: txReset,
    nb_ecritures_supprimees: ecrituresDeleted || 0,
  })
}
