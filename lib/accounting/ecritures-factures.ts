// Use any for Supabase client to support both admin and server clients
type SupabaseClient = any

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

    // Delete any existing entries for this facture (idempotent)
    const refFolio = `FAC-${facture.id}`
    await supabase
      .from('ecritures_comptables_v2')
      .delete()
      .eq('societe_id', facture.societe_id)
      .eq('ref_folio', refFolio)

    const libelle = `Facture ${facture.numero_facture || ''} — ${facture.tiers || ''}`.trim()
    const isClient = facture.type_facture === 'client'
    const journal = isClient ? 'VTE' : 'ACH'
    const exercice = new Date(facture.date_facture).getFullYear().toString()

    const entries: Array<Record<string, unknown>> = []

    if (isClient) {
      // Debit 411 Clients
      entries.push({
        societe_id: facture.societe_id,
        dossier_id,
        date_ecriture: facture.date_facture,
        journal,
        ref_folio: refFolio,
        numero_piece: facture.numero_facture || null,
        numero_compte: '411',
        nom_compte: 'Clients',
        libelle,
        description: libelle,
        debit_mur: Number(facture.montant_ttc) || 0,
        credit_mur: 0,
        exercice,
      })
      // Credit 706 Prestations
      if (Number(facture.montant_ht) > 0) {
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
          credit_mur: Number(facture.montant_ht) || 0,
          exercice,
        })
      }
      // Credit 4457 TVA collectee
      if (Number(facture.montant_tva) > 0) {
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
          credit_mur: Number(facture.montant_tva) || 0,
          exercice,
        })
      }
    } else {
      // FOURNISSEUR (supplier): journal ACH
      // Debit 607 Achats
      if (Number(facture.montant_ht) > 0) {
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
          debit_mur: Number(facture.montant_ht) || 0,
          credit_mur: 0,
          exercice,
        })
      }
      // Debit 4456 TVA deductible
      if (Number(facture.montant_tva) > 0) {
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
          debit_mur: Number(facture.montant_tva) || 0,
          credit_mur: 0,
          exercice,
        })
      }
      // Credit 401 Fournisseurs
      entries.push({
        societe_id: facture.societe_id,
        dossier_id,
        date_ecriture: facture.date_facture,
        journal,
        ref_folio: refFolio,
        numero_piece: facture.numero_facture || null,
        numero_compte: '401',
        nom_compte: 'Fournisseurs',
        libelle,
        description: libelle,
        debit_mur: 0,
        credit_mur: Number(facture.montant_ttc) || 0,
        exercice,
      })
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
 *   Debit  401 Fournisseurs  = amount  (cancels the original credit)
 *   Credit 512 Banque        = amount
 *
 * For client payment (credit bancaire):
 *   Debit  512 Banque        = amount
 *   Credit 411 Clients       = amount  (cancels the original debit)
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
  }
): Promise<{ ok: boolean; error?: string }> {
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

    const entries: Array<Record<string, unknown>> = isSupplier
      ? [
          {
            societe_id: payment.societe_id,
            dossier_id: dossier?.id || null,
            date_ecriture: payment.date_payment,
            journal: 'BNQ',
            ref_folio: payment.ref_folio,
            numero_compte: '401',
            nom_compte: 'Fournisseurs',
            libelle,
            description: libelle,
            debit_mur: payment.amount_mur,
            credit_mur: 0,
            exercice,
          },
          {
            societe_id: payment.societe_id,
            dossier_id: dossier?.id || null,
            date_ecriture: payment.date_payment,
            journal: 'BNQ',
            ref_folio: payment.ref_folio,
            numero_compte: '512',
            nom_compte: 'Banque',
            libelle,
            description: libelle,
            debit_mur: 0,
            credit_mur: payment.amount_mur,
            exercice,
          },
        ]
      : [
          {
            societe_id: payment.societe_id,
            dossier_id: dossier?.id || null,
            date_ecriture: payment.date_payment,
            journal: 'BNQ',
            ref_folio: payment.ref_folio,
            numero_compte: '512',
            nom_compte: 'Banque',
            libelle,
            description: libelle,
            debit_mur: payment.amount_mur,
            credit_mur: 0,
            exercice,
          },
          {
            societe_id: payment.societe_id,
            dossier_id: dossier?.id || null,
            date_ecriture: payment.date_payment,
            journal: 'BNQ',
            ref_folio: payment.ref_folio,
            numero_compte: '411',
            nom_compte: 'Clients',
            libelle,
            description: libelle,
            debit_mur: 0,
            credit_mur: payment.amount_mur,
            exercice,
          },
        ]

    const { error } = await supabase.from('ecritures_comptables_v2').insert(entries)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e.message || 'Erreur' }
  }
}
