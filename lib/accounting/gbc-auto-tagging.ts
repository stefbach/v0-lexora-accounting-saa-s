/**
 * Phase J — Auto-tagging GBC depuis l'OCR.
 *
 * Ce module est appelé après la création d'une facture (par l'OCR upload
 * ou par l'API factures) pour enrichir automatiquement avec :
 *   1. Auto-classification PER (Phase B) — tag per_category sur la facture
 *      et écritures de revenu, à partir du compte comptable + tiers + description
 *   2. Auto-flag related_party (Phase D) — détecte si le tiers fait partie
 *      des sociétés liées (via ifrs9_counterparty_params.secteur='related'
 *      ou via la table societes_relationships) → flag + crée tp_transactions
 *      si seuil dépassé (MUR 1M)
 *   3. Translation IAS 21 (Phase A) — si la société a devise_fonctionnelle
 *      ≠ MUR, calcule debit_fonctionnelle / credit_fonctionnelle / taux
 *      pour chaque écriture créée
 *
 * Conçu comme une fonction unique applyGbcAutoTagging() qui ne fait rien
 * pour une société MUR-only domestique (zéro impact). Les sociétés GBC
 * (devise_fonctionnelle ≠ MUR OU régime FSC) reçoivent l'enrichissement.
 */

import { autoClassifyPer, type PerCategory } from './per'
import { classifyAccount, getTranslationRate, type TranslationRates } from './functional-currency'
import { getDocumentationTier } from './transfer-pricing'

type SupabaseLike = any

export type AutoTaggingInput = {
  facture_id: string
  societe_id: string
  tiers: string | null
  tiers_country_iso?: string | null
  type_facture: 'client' | 'fournisseur'
  numero_compte_principal?: string | null   // ex: '706', '607', '761'
  description?: string | null
  montant_mur: number
  date_facture?: string | null
}

export type AutoTaggingResult = {
  per_category: PerCategory | null
  related_party: boolean
  related_party_type: string | null
  tp_transaction_created: boolean
  ias21_translated: boolean
  ias21_rate_used?: number
  warnings: string[]
}

/**
 * Point d'entrée principal du tagging GBC.
 * À appeler APRÈS createEcrituresForFacture pour enrichir les écritures
 * et la facture déjà créées.
 */
export async function applyGbcAutoTagging(
  supabase: SupabaseLike,
  input: AutoTaggingInput,
): Promise<AutoTaggingResult> {
  const result: AutoTaggingResult = {
    per_category: null,
    related_party: false,
    related_party_type: null,
    tp_transaction_created: false,
    ias21_translated: false,
    warnings: [],
  }

  // Récupère la société : devise_fonctionnelle + tags GBC potentiels
  const { data: societe, error: socErr } = await supabase
    .from('societes')
    .select('id, nom, devise_fonctionnelle')
    .eq('id', input.societe_id)
    .single()

  if (socErr || !societe) {
    result.warnings.push(`Société ${input.societe_id} introuvable — auto-tagging skipped`)
    return result
  }

  const deviseFonct = (societe.devise_fonctionnelle || 'MUR').toUpperCase()
  const isGbc = deviseFonct !== 'MUR'

  // ── 1. Auto-classification PER (Phase B) ──────────────────────────────
  // Applicable uniquement pour les factures CLIENT (revenu) — les
  // factures fournisseur ne génèrent jamais de revenu PER-éligible.
  if (input.type_facture === 'client') {
    const detected = autoClassifyPer({
      numero_compte: input.numero_compte_principal,
      tiers: input.tiers,
      tiers_country_iso: input.tiers_country_iso,
      description: input.description,
    })
    if (detected !== 'not_eligible') {
      // Tag la facture
      await supabase.from('factures').update({ per_category: detected }).eq('id', input.facture_id)
      // Tag les écritures de revenu (classe 7) liées à cette facture
      await supabase.from('ecritures_comptables_v2')
        .update({ per_category: detected })
        .eq('facture_id', input.facture_id)
        .like('numero_compte', '7%')
      result.per_category = detected
    } else if (isGbc) {
      // Pour une GBC, on tag explicitement not_eligible plutôt que NULL
      await supabase.from('factures').update({ per_category: 'not_eligible' }).eq('id', input.facture_id)
      result.per_category = 'not_eligible'
    }
  }

  // ── 2. Auto-flag related_party (Phase D) ──────────────────────────────
  // Heuristique : tiers est related si le nom matche une société liée du
  // groupe (societes_relationships) OU si déjà marqué dans une facture
  // antérieure de cette société.
  if (input.tiers) {
    // Check 1 : société du groupe via raison sociale
    const { data: relations } = await supabase
      .from('societes_relationships')
      .select('child_societe_id, parent_societe_id, child:societes!child_societe_id(nom), parent:societes!parent_societe_id(nom)')
      .or(`parent_societe_id.eq.${input.societe_id},child_societe_id.eq.${input.societe_id}`)
      .is('effective_to', null)

    const tiersLower = input.tiers.toLowerCase().trim()
    let foundRelType: string | null = null
    for (const r of (relations || []) as any[]) {
      const childName = (r.child?.nom || '').toLowerCase().trim()
      const parentName = (r.parent?.nom || '').toLowerCase().trim()
      if (childName && childName === tiersLower) {
        foundRelType = r.parent_societe_id === input.societe_id ? 'subsidiary' : 'common_control'
        break
      }
      if (parentName && parentName === tiersLower) {
        foundRelType = r.child_societe_id === input.societe_id ? 'parent' : 'common_control'
        break
      }
    }

    // Check 2 : précédente facture pour ce tiers déjà flaggée related_party
    if (!foundRelType) {
      const { data: prev } = await supabase
        .from('factures')
        .select('related_party, related_party_type')
        .eq('societe_id', input.societe_id)
        .eq('tiers', input.tiers)
        .eq('related_party', true)
        .limit(1)
      if (prev && prev.length > 0) {
        foundRelType = prev[0].related_party_type || 'common_control'
      }
    }

    if (foundRelType) {
      await supabase.from('factures').update({
        related_party: true,
        related_party_type: foundRelType,
      }).eq('id', input.facture_id)
      result.related_party = true
      result.related_party_type = foundRelType

      // Auto-création d'une entrée tp_transactions si seuil > MUR 1M
      const docTier = getDocumentationTier(input.montant_mur)
      if (docTier !== 'optional') {
        const exerciceYear = input.date_facture ? new Date(input.date_facture).getFullYear() : new Date().getFullYear()
        const exerciceMonth = input.date_facture ? new Date(input.date_facture).getMonth() : new Date().getMonth()
        const exerciceStart = exerciceMonth >= 6 ? exerciceYear : exerciceYear - 1
        const exercice = `${exerciceStart}-${exerciceStart + 1}`
        const { error: tpErr } = await supabase.from('tp_transactions').insert({
          societe_id: input.societe_id, exercice,
          related_party_name: input.tiers,
          related_party_country: input.tiers_country_iso || null,
          relationship_type: foundRelType,
          transaction_type: input.type_facture === 'client' ? 'services' : 'goods',
          amount_mur: input.montant_mur,
          rationale: `Auto-créé depuis OCR upload facture ${input.facture_id} (seuil ${docTier})`,
        })
        if (!tpErr) result.tp_transaction_created = true
        else result.warnings.push(`tp_transactions insert failed: ${tpErr.message}`)
      }
    }
  }

  // ── 3. Translation IAS 21 (Phase A) ───────────────────────────────────
  // Si société GBC (devise ≠ MUR), translate les écritures de cette facture.
  // On suppose que createEcrituresForFacture a déjà créé les écritures en MUR.
  // Pour la translation : closing rate ~= taux du jour (à raffiner avec
  // un système de taux de clôture mensuels).
  if (isGbc) {
    // Récupère le taux actuel de la devise fonctionnelle → MUR
    const { data: taux } = await supabase
      .from('taux_change')
      .select('taux')
      .eq('devise', deviseFonct)
      .order('date_taux', { ascending: false })
      .limit(1)
      .maybeSingle()
    const closingRate = Number(taux?.taux) || 1
    if (closingRate <= 0 || closingRate === 1) {
      result.warnings.push(`Taux ${deviseFonct}/MUR introuvable ou =1 — translation skip`)
    } else {
      const rates: TranslationRates = { closing: closingRate, average: closingRate, transaction: closingRate }
      // Récupère les écritures créées pour cette facture
      const { data: ecritures } = await supabase
        .from('ecritures_comptables_v2')
        .select('id, numero_compte, debit_mur, credit_mur')
        .eq('facture_id', input.facture_id)
      let count = 0
      for (const e of (ecritures || []) as any[]) {
        const rate = getTranslationRate(e.numero_compte, rates)
        // Inverse : si écriture créée en MUR au taux de transaction,
        // la version fonctionnelle = montant_mur / rate
        const debitF = rate > 0 ? Math.round((Number(e.debit_mur) || 0) / rate * 100) / 100 : 0
        const creditF = rate > 0 ? Math.round((Number(e.credit_mur) || 0) / rate * 100) / 100 : 0
        await supabase.from('ecritures_comptables_v2').update({
          debit_fonctionnelle: debitF,
          credit_fonctionnelle: creditF,
          devise_origine: deviseFonct,
          taux_fonct_vers_mur: rate,
        }).eq('id', e.id)
        count++
      }
      result.ias21_translated = count > 0
      result.ias21_rate_used = closingRate
    }
  }

  return result
}
