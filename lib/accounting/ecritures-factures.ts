// Use any for Supabase client to support both admin and server clients
type SupabaseClient = any

import { safeInsertBnq } from './bnq-dedupe'

export interface FactureForEcritures {
  id: string
  societe_id: string
  numero_facture: string
  tiers: string
  date_facture: string
  montant_ht: number
  montant_tva: number
  montant_ttc: number
  type_facture: 'client' | 'fournisseur'
  // MUR conversion — sans ces champs, les factures en devise étrangère
  // étaient écrites en montant d'origine sur `debit_mur` / `credit_mur`, ce
  // qui causait un écart 411/401 massif lorsque le paiement bancaire (BNQ)
  // était, lui, converti en MUR.
  //
  // Règle appliquée par `createEcrituresForFacture` :
  //   - `montant_mur` fourni → utilisé tel quel pour la ligne TTC (411/401)
  //   - sinon fallback `montant_ttc × (taux_change || 1)`
  //   - `devise` par défaut 'MUR' (taux = 1)
  //   - les lignes HT (607/706) et TVA (4456/4457) sont converties au taux
  //     de la facture pour rester cohérentes avec la ligne TTC.
  devise?: string
  taux_change?: number
  montant_mur?: number
}

/**
 * Auto-generate journal entries for a facture (client or fournisseur).
 *
 * CLIENT invoice (sales, journal VTE):
 *   Debit  411 Clients            = montant_ttc
 *   Credit 706 Prestations        = montant_ht
 *   Credit 4457 TVA collectee     = montant_tva (if > 0)
 *
 * FOURNISSEUR invoice (purchase, journal ACH):
 *   Debit  607 Achats             = montant_ht
 *   Debit  4456 TVA deductible    = montant_tva (if > 0)
 *   Credit 401 Fournisseurs       = montant_ttc
 *
 * All entries get linked via ref_folio = facture_id for later matching/unmatching.
 */
export async function createEcrituresForFacture(
  supabase: SupabaseClient,
  facture: FactureForEcritures
): Promise<{ ok: boolean; error?: string; nb_entries?: number }> {
  try {
    if (!facture.societe_id || !facture.date_facture) {
      return { ok: false, error: 'societe_id et date_facture requis' }
    }

    // Find dossier for FK compatibility
    const { data: dossier } = await supabase
      .from('dossiers')
      .select('id')
      .eq('societe_id', facture.societe_id)
      .limit(1)
      .maybeSingle()

    const dossier_id = dossier?.id || null

    // Delete any existing UNlettered entries for this facture (idempotent)
    // IMPORTANT : ne PAS supprimer les écritures déjà lettrées (rapprochées)
    // sinon le backfill casse le lettrage existant.
    const refFolio = `FAC-${facture.id}`
    await supabase
      .from('ecritures_comptables_v2')
      .delete()
      .eq('societe_id', facture.societe_id)
      .eq('ref_folio', refFolio)
      .is('lettre', null)

    // Clean legacy duplicates (non lettrées uniquement)
    await supabase
      .from('ecritures_comptables_v2')
      .delete()
      .eq('societe_id', facture.societe_id)
      .eq('ref_folio', facture.id)
      .is('lettre', null)

    if (dossier_id) {
      await supabase
        .from('ecritures_comptables_v2')
        .delete()
        .eq('dossier_id', dossier_id)
        .eq('facture_id', facture.id)
        .in('journal', ['ACH', 'VTE'])
        .is('lettre', null)
    }

    const libelle = `Facture ${facture.numero_facture || ''} — ${facture.tiers || ''}`.trim()
    const isClient = facture.type_facture === 'client'
    const journal = isClient ? 'VTE' : 'ACH'

    // ── Conversion MUR ─────────────────────────────────────────────────
    // Priorité : (1) montant_mur fourni par l'appelant (colonne DB déjà
    // calculée à la création/MàJ de la facture côté /api/client/factures)
    // (2) fallback montant_ttc × taux_change pour les appelants legacy.
    const devise = (facture.devise || 'MUR').toUpperCase()
    const taux = Number(facture.taux_change) > 0 ? Number(facture.taux_change) : 1
    const ttcMur = Number.isFinite(Number(facture.montant_mur)) && Number(facture.montant_mur) > 0
      ? Number(facture.montant_mur)
      : Number(facture.montant_ttc || 0) * taux
    // Pour préserver la cohérence ttc = ht + tva en MUR, on ventile au prorata.
    const ttcRaw = Number(facture.montant_ttc) || 0
    const htRaw = Number(facture.montant_ht) || 0
    const tvaRaw = Number(facture.montant_tva) || 0
    const murRatio = ttcRaw > 0 ? ttcMur / ttcRaw : taux
    const htMur = Math.round(htRaw * murRatio * 100) / 100
    // Arrondi au centime près ; on force tvaMur = ttcMur - htMur pour éviter
    // des écarts d'arrondi qui casseraient l'équilibre débit/crédit.
    const tvaMur = Math.round((ttcMur - htMur) * 100) / 100
    if (devise !== 'MUR' && Math.abs(taux - 1) < 0.001 && !facture.montant_mur) {
      console.warn(`[createEcrituresForFacture] facture ${facture.id} en ${devise} sans taux_change ni montant_mur — debit_mur écrit en devise d'origine`)
    }

    // Vérifier si des écritures ACH/VTE existent déjà pour cette facture
    // (par ref_folio OU par facture_id) — évite les doublons au re-backfill
    const { data: byRef } = await supabase
      .from('ecritures_comptables_v2')
      .select('id')
      .eq('societe_id', facture.societe_id)
      .eq('journal', journal)
      .eq('ref_folio', refFolio)
      .limit(1)
    if (byRef && byRef.length > 0) {
      return { ok: true, nb_entries: 0 }
    }
    const { data: byFk } = await supabase
      .from('ecritures_comptables_v2')
      .select('id')
      .eq('societe_id', facture.societe_id)
      .eq('journal', journal)
      .eq('facture_id', facture.id)
      .limit(1)
    if (byFk && byFk.length > 0) {
      return { ok: true, nb_entries: 0 }
    }
    const exercice = new Date(facture.date_facture).getFullYear().toString()

    // ── Sous-comptes auxiliaires par tiers (PCM Maurice) ─────────────────
    // Si la société a `comptes_auxiliaires_actif=true` (mig 226), on génère
    // 411<HASH6> ou 401<HASH6> spécifique au tiers via la RPC. Sinon on
    // garde le compte global (comportement par défaut).
    let compteTier: string = isClient ? '411' : '401'
    let nomCompteTier: string = isClient ? 'Clients' : 'Fournisseurs'
    if (facture.tiers && facture.tiers.trim().length > 0) {
      try {
        const { data: aux } = await supabase.rpc('get_or_create_compte_auxiliaire', {
          p_societe_id: facture.societe_id,
          p_tiers: facture.tiers,
          p_type_facture: isClient ? 'client' : 'fournisseur',
        })
        if (aux && typeof aux === 'string' && aux.length > 0) {
          compteTier = aux
          nomCompteTier = (isClient ? 'Client ' : 'Fournisseur ') + facture.tiers
        }
      } catch (e: any) {
        // RPC absente sur env legacy → fallback compte global, OK
        console.warn('[createEcritures] sous-compte aux non dispo, fallback', e?.message)
      }
    }

    const entries: Array<Record<string, unknown>> = []

    if (isClient) {
      // Debit 411 (ou 411<HASH6> si auxiliaires actifs) — TTC en MUR
      entries.push({
        societe_id: facture.societe_id,
        dossier_id,
        date_ecriture: facture.date_facture,
        journal,
        ref_folio: refFolio,
        numero_piece: facture.numero_facture || null,
        numero_compte: compteTier,
        nom_compte: nomCompteTier,
        libelle,
        description: libelle,
        debit_mur: ttcMur,
        credit_mur: 0,
        exercice,
        facture_id: facture.id,
      })
      // Credit 706 Prestations (HT en MUR)
      if (htMur > 0) {
        entries.push({
          societe_id: facture.societe_id,
          dossier_id,
          date_ecriture: facture.date_facture,
          journal,
          ref_folio: refFolio,
          numero_piece: facture.numero_facture || null,
          numero_compte: '706',
          nom_compte: 'Prestations de services',
          libelle,
          description: libelle,
          debit_mur: 0,
          credit_mur: htMur,
          exercice,
          facture_id: facture.id,
        })
      }
      // Credit 4457 TVA collectée (TVA en MUR)
      if (tvaMur > 0) {
        entries.push({
          societe_id: facture.societe_id,
          dossier_id,
          date_ecriture: facture.date_facture,
          journal,
          ref_folio: refFolio,
          numero_piece: facture.numero_facture || null,
          numero_compte: '4457',
          nom_compte: 'TVA collectee',
          libelle,
          description: libelle,
          debit_mur: 0,
          credit_mur: tvaMur,
          exercice,
          facture_id: facture.id,
        })
      }
    } else {
      // FOURNISSEUR (supplier): journal ACH — tous montants en MUR
      // Debit 607 Achats (HT en MUR)
      if (htMur > 0) {
        entries.push({
          societe_id: facture.societe_id,
          dossier_id,
          date_ecriture: facture.date_facture,
          journal,
          ref_folio: refFolio,
          numero_piece: facture.numero_facture || null,
          numero_compte: '607',
          nom_compte: 'Achats',
          libelle,
          description: libelle,
          debit_mur: htMur,
          credit_mur: 0,
          exercice,
          facture_id: facture.id,
        })
      }
      // Debit 4456 TVA déductible (TVA en MUR)
      if (tvaMur > 0) {
        entries.push({
          societe_id: facture.societe_id,
          dossier_id,
          date_ecriture: facture.date_facture,
          journal,
          ref_folio: refFolio,
          numero_piece: facture.numero_facture || null,
          numero_compte: '4456',
          nom_compte: 'TVA deductible',
          libelle,
          description: libelle,
          debit_mur: tvaMur,
          credit_mur: 0,
          exercice,
          facture_id: facture.id,
        })
      }
      // TDS Maurice — Section 111A : si facture fournisseur a tds_montant > 0,
      // on retient ce montant à la source. Le crédit fournisseur est diminué
      // de ce montant et on crédite 4471 (TDS retenu à reverser à la MRA).
      // Lecture défensive : ces colonnes peuvent ne pas exister sur env legacy
      // pré-mig 226 → fallback à 0.
      const tdsMontant = Number((facture as any).tds_montant) || 0
      const ttcAprèsTds = ttcMur - tdsMontant

      // Credit 401/401<HASH> Fournisseurs — TTC NET du TDS retenu
      entries.push({
        societe_id: facture.societe_id,
        dossier_id,
        date_ecriture: facture.date_facture,
        journal,
        ref_folio: refFolio,
        numero_piece: facture.numero_facture || null,
        numero_compte: compteTier,
        nom_compte: nomCompteTier,
        libelle,
        description: libelle,
        debit_mur: 0,
        credit_mur: ttcAprèsTds,
        exercice,
        facture_id: facture.id,
      })

      // Crédit 4471 TDS retenu à reverser à la MRA (si TDS > 0)
      if (tdsMontant > 0.01) {
        entries.push({
          societe_id: facture.societe_id,
          dossier_id,
          date_ecriture: facture.date_facture,
          journal,
          ref_folio: refFolio,
          numero_piece: facture.numero_facture || null,
          numero_compte: '4471',
          nom_compte: 'TDS retenu à reverser à la MRA',
          libelle: `TDS retenu — ${facture.tiers || ''}`,
          description: `TDS retenu (cat. ${(facture as any).tds_categorie || '?'}, taux ${(facture as any).tds_taux_pct || '?'}%)`,
          debit_mur: 0,
          credit_mur: tdsMontant,
          exercice,
          facture_id: facture.id,
        })
      }
    }

    if (entries.length === 0) {
      return { ok: false, error: 'Aucune ligne a generer' }
    }

    const { error } = await supabase.from('ecritures_comptables_v2').insert(entries)
    if (error) {
      console.error('[createEcrituresForFacture] insert error:', error.message)
      return { ok: false, error: error.message }
    }

    return { ok: true, nb_entries: entries.length }
  } catch (e: any) {
    console.error('[createEcrituresForFacture] exception:', e.message)
    return { ok: false, error: e.message || 'Erreur inconnue' }
  }
}

/**
 * Generate payment entries when a bank reconciliation matches a facture.
 * This creates the offsetting 401 debit / 411 credit entries, NOT new 401/411 entries.
 *
 * For supplier payment (debit bancaire):
 *   Debit  401 Fournisseurs     = amount  (cancels the original credit)
 *   Credit 512xxx Banque         = amount  (on the specific bank account)
 *
 * For client payment (credit bancaire):
 *   Debit  512xxx Banque         = amount
 *   Credit 411 Clients           = amount  (cancels the original debit)
 *
 * FIX 1 — params :
 *   • compte_banque : ex. '512100' (DDS MUR), '512200' (DDS EUR), …
 *     Résolu par l'appelant depuis comptes_bancaires.compte_comptable.
 *     Fallback '512' si non fourni (rétrocompat).
 *   • facture_id   : propagé sur les 2 écritures BNQ pour permettre le
 *     lettrage direct par facture_id plus tard.
 *   • lettre_code  : si fourni, pose la lettre sur les 2 BNQ + sur
 *     l'écriture ACH 401/411 qui porte le même facture_id (ou ref_folio
 *     FAC-<id> en fallback).
 *   • numero_piece : texte de référence (ex. libellé de la transaction
 *     bancaire « Règlement FT… »).
 *
 * Retourne aussi les IDs des écritures BNQ créées pour que l'appelant
 * puisse faire des mises à jour (lettrage group à 3, etc.).
 */
export async function createEcrituresForPayment(
  supabase: SupabaseClient,
  payment: {
    societe_id: string
    date_payment: string
    amount_mur: number
    type: 'supplier' | 'client'
    tiers: string
    ref_folio: string // e.g. 'BANK-<releve_id>-<tx_idx>'
    description?: string
    compte_banque?: string // FIX 1 — '512100' etc., from comptes_bancaires.compte_comptable
    facture_id?: string | null
    lettre_code?: string | null
    numero_piece?: string | null
    // ── Migration 172 — taux figé par écriture ────────────────────────
    // Propagés depuis la transaction bancaire (transactions_json) au moment
    // du rapprochement. Cf. docs/TX_JSON_SCHEMA.md. Règle : on fige ici le
    // taux utilisé à la création de l'écriture pour que le reporting futur
    // ne recalcule jamais avec le taux du jour.
    //   • devise_origine       : ex. 'EUR', 'USD' ; NULL = MUR natif.
    //   • montant_origine      : montant dans la devise d'origine (avant × taux).
    //   • taux_change_applique : taux ORIGINE→MUR figé ; NULL = MUR natif.
    devise_origine?: string | null
    montant_origine?: number | null
    taux_change_applique?: number | null
  }
): Promise<{ ok: boolean; error?: string; bnq_ids?: string[] }> {
  try {
    const { data: dossier } = await supabase
      .from('dossiers')
      .select('id')
      .eq('societe_id', payment.societe_id)
      .limit(1)
      .maybeSingle()

    // Delete existing payment entries with this ref_folio
    await supabase
      .from('ecritures_comptables_v2')
      .delete()
      .eq('societe_id', payment.societe_id)
      .eq('ref_folio', payment.ref_folio)

    const isSupplier = payment.type === 'supplier'
    const libelle = payment.description || `Paiement ${isSupplier ? 'fournisseur' : 'client'} ${payment.tiers}`
    const exercice = new Date(payment.date_payment).getFullYear().toString()
    const compteBanque = (payment.compte_banque || '512').trim() || '512'
    const nomBanque = compteBanque.startsWith('512') ? `Banque ${compteBanque.slice(3) || ''}`.trim() : 'Banque'

    // ── Migration 172 — normalisation du taux figé ─────────────────────
    // On écrit NULL pour une tx MUR native ou quand le caller n'a pas fourni
    // le taux (ex. paiement interne sans devise). On n'accepte que des
    // valeurs strictement positives pour taux/montant.
    const deviseOrigine: string | null =
      typeof payment.devise_origine === 'string' && payment.devise_origine.trim().length > 0
        ? payment.devise_origine.trim().toUpperCase()
        : null
    const tauxRaw = Number(payment.taux_change_applique)
    const tauxChangeApplique: number | null =
      Number.isFinite(tauxRaw) && tauxRaw > 0 ? tauxRaw : null
    const montantRaw = Number(payment.montant_origine)
    const montantOrigine: number | null =
      Number.isFinite(montantRaw) && montantRaw > 0 ? montantRaw : null
    // Si la tx est en MUR natif (pas de devise_origine ou devise = MUR),
    // on neutralise taux/montant pour éviter des lignes incohérentes.
    const isMurNative = deviseOrigine === null || deviseOrigine === 'MUR'
    const deviseFinale: string | null = isMurNative ? null : deviseOrigine
    const tauxFinal: number | null = isMurNative ? null : tauxChangeApplique
    const montantFinal: number | null = isMurNative ? null : montantOrigine

    // Base fields shared by both sides of the écriture
    const base = {
      societe_id: payment.societe_id,
      dossier_id: dossier?.id || null,
      date_ecriture: payment.date_payment,
      journal: 'BNQ',
      ref_folio: payment.ref_folio,
      numero_piece: payment.numero_piece || null,
      libelle,
      description: libelle,
      exercice,
      // FIX 1 — facture_id propagé sur les 2 lignes BNQ (mig 133)
      facture_id: payment.facture_id || null,
      // FIX 1 — lettre apposée dès la création quand un code est fourni
      lettre: payment.lettre_code || null,
      date_lettrage: payment.lettre_code ? payment.date_payment : null,
      // Migration 172 — taux figé propagé sur les 2 lignes BNQ.
      devise_origine: deviseFinale,
      montant_origine: montantFinal,
      taux_change_applique: tauxFinal,
    }

    const tierSide = {
      ...base,
      numero_compte: isSupplier ? '401' : '411',
      nom_compte: isSupplier ? 'Fournisseurs' : 'Clients',
      debit_mur: isSupplier ? payment.amount_mur : 0,
      credit_mur: isSupplier ? 0 : payment.amount_mur,
    }
    const bankSide = {
      ...base,
      numero_compte: compteBanque,
      nom_compte: nomBanque,
      debit_mur: isSupplier ? 0 : payment.amount_mur,
      credit_mur: isSupplier ? payment.amount_mur : 0,
    }

    // Sprint 2 — Anti-doublon BNQ : si l'utilisateur clique 2x sur
    // « rapprocher » ou si sync_lettrage tourne 2 fois, on ne crée pas
    // 2 paires d'écritures BNQ identiques. Le bankSide a toujours
    // journal='BNQ' donc dedupBnqEntries le filtre. Le tierSide a
    // aussi journal='BNQ' (cf. base.journal = 'BNQ' ci-dessus) donc
    // les deux sont vérifiés.
    const insRes = await safeInsertBnq(supabase, [tierSide, bankSide])
    if (insRes.error) return { ok: false, error: insRes.error.message }
    if (insRes.skipped > 0) {
      console.log(`[createEcrituresForPayment] skipped ${insRes.skipped} doublon(s) BNQ:`, insRes.skipReasons)
    }
    const inserted = insRes.data || []

    // ── Écart de change réalisé (IAS 21 §28) ─────────────────────────────
    // Pour facture en devise étrangère : le 411/401 est figé au taux de la
    // facture (taux T0), mais le paiement BNQ est au taux du jour (T1).
    // Différence = écart de change RÉALISÉ → 666 (perte) ou 766 (gain).
    // Sans cette logique, le compte 411/401 reste avec un solde non-zéro
    // après paiement complet → lettrage incomplet, balance déséquilibrée.
    if (payment.facture_id && tauxFinal !== null && deviseFinale && deviseFinale !== 'MUR') {
      try {
        const { data: facture } = await supabase
          .from('factures')
          .select('montant_mur, montant_ttc, taux_change, devise')
          .eq('id', payment.facture_id)
          .maybeSingle()

        if (facture) {
          const factureMurAmount = Number((facture as any).montant_mur) || 0
          const ecart = Math.round((payment.amount_mur - factureMurAmount) * 100) / 100

          if (Math.abs(ecart) >= 0.02) {
            // Détermine le sens selon type de tx :
            //   • Client : 411 figé à factureMur, payé amount_mur sur 512.
            //     Après les 2 lignes BNQ ci-dessus (411 crédit amount_mur,
            //     512 débit amount_mur), 411 reste à factureMur - amount_mur
            //     non réglé. On régularise : si amount_mur < factureMur (le
            //     client a payé moins en MUR car taux baissé) → perte 666.
            //   • Fournisseur : 401 figé à factureMur, on paie amount_mur.
            //     Si amount_mur < factureMur (on paie moins) → gain 766.
            const exerciceY = exercice
            const refEcart = `${payment.ref_folio}-FX`
            const isGain = (isSupplier && ecart < 0) || (!isSupplier && ecart > 0)
            const compteFx = isGain ? '766' : '666'
            const nomFx = isGain ? 'Gains de change réalisés' : 'Pertes de change réalisés'
            const absEcart = Math.abs(ecart)

            // Régularise le 411/401 + contrepartie 666/766
            const tierFxLine = {
              ...base,
              ref_folio: refEcart,
              numero_compte: isSupplier ? '401' : '411',
              nom_compte: isSupplier ? 'Fournisseurs (écart change)' : 'Clients (écart change)',
              debit_mur:  (!isSupplier && ecart < 0) || (isSupplier && ecart > 0) ? absEcart : 0,
              credit_mur: (!isSupplier && ecart > 0) || (isSupplier && ecart < 0) ? absEcart : 0,
              libelle: `Écart de change ${facture.devise} — ${payment.tiers}`,
              description: `Écart change réalisé au paiement (taux fact ${facture.taux_change} → taux paiement ${tauxFinal})`,
            }
            const fxLine = {
              ...base,
              ref_folio: refEcart,
              numero_compte: compteFx,
              nom_compte: nomFx,
              debit_mur:  isGain ? 0 : absEcart,
              credit_mur: isGain ? absEcart : 0,
              libelle: `${nomFx} — ${payment.tiers}`,
              description: `Écart de change réalisé sur paiement ${facture.devise}`,
            }

            const fxRes = await safeInsertBnq(supabase, [tierFxLine, fxLine])
            if (fxRes.error) {
              console.warn('[createEcrituresForPayment] Écart change non comptabilisé:', fxRes.error.message)
            } else {
              console.log(`[createEcrituresForPayment] Écart change ${isGain ? 'gain' : 'perte'} ${absEcart} MUR → ${compteFx}`)
            }
          }
        }
      } catch (e: any) {
        console.warn('[createEcrituresForPayment] Calcul écart change exception:', e?.message)
      }
    }

    // FIX 1 — si une lettre est posée, rattacher l'ACH/VTE 401|411 de
    // la facture au même groupe de lettrage. Tentative par facture_id
    // (le plus fiable), fallback par ref_folio FAC-<id>.
    if (payment.lettre_code && payment.facture_id) {
      const tierAccount = isSupplier ? '401' : '411'
      const tierFilter = isSupplier
        ? { credit_gt: 0 } // ACH credit 401 → lettrer
        : { debit_gt: 0 }  // VTE debit 411 → lettrer
      // On cible uniquement les écritures non encore lettrées pour ne
      // pas écraser un lettrage antérieur (R2).
      let q = supabase
        .from('ecritures_comptables_v2')
        .update({ lettre: payment.lettre_code, date_lettrage: payment.date_payment })
        .eq('societe_id', payment.societe_id)
        .eq('facture_id', payment.facture_id)
        .eq('numero_compte', tierAccount)
        .is('lettre', null)
      if ('credit_gt' in tierFilter) q = q.gt('credit_mur', 0)
      if ('debit_gt' in tierFilter)  q = q.gt('debit_mur', 0)
      const achUpd = await q
      if (achUpd.error) {
        console.warn('[createEcrituresForPayment] ACH letter by facture_id failed:', achUpd.error.message)
        // Fallback ref_folio FAC-<id>
        const fac = payment.facture_id
        const fallback = await supabase
          .from('ecritures_comptables_v2')
          .update({ lettre: payment.lettre_code, date_lettrage: payment.date_payment })
          .eq('societe_id', payment.societe_id)
          .eq('ref_folio', `FAC-${fac}`)
          .eq('numero_compte', tierAccount)
          .is('lettre', null)
        if (fallback.error) {
          console.warn('[createEcrituresForPayment] ACH letter by ref_folio failed:', fallback.error.message)
        }
      }
    }

    return { ok: true, bnq_ids: (inserted || []).map((r: any) => r.id) }
  } catch (e: any) {
    return { ok: false, error: e.message || 'Erreur' }
  }
}
