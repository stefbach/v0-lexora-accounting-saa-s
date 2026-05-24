/**
 * Helpers de lettrage extraits de
 * `app/api/comptable/rapprochement/route.ts` (V3-22, batch 2).
 *
 * Ce module regroupe les constantes et fonctions pures utilisées par les
 * différents handlers de lettrage (lettrer_manuel, lettrer_multi,
 * auto_lettrage_bnq, etc.). Les handlers eux-mêmes restent dans
 * route.ts car ils sont étroitement couplés au contexte de la requête
 * (supabase, user, body, fonctions internes). On extrait ici la logique
 * "pure" pour réduire la taille du fichier route et permettre des tests
 * unitaires ciblés.
 *
 * IMPORTANT — Aucune modification de comportement : ces fonctions
 * reproduisent à l'identique la logique inline antérieure.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────
// 1) Mapping classification manuelle → compte comptable (lettrer_manuel)
//
// Utilisé par l'action `lettrer_manuel` quand l'opérateur classe une
// transaction bancaire SANS facture (MRA, frais, associé, charge
// diverse…). Mapping étendu correspondant au menu "Classer…" du
// rapprochement Part 2.
// ─────────────────────────────────────────────────────────────────────────
export const CLASSE_COMPTES: Record<string, string> = {
  fournisseur: '401',
  client: '411',
  compte_courant_associe: '455',
  cca: '455',
  remboursement_associe: '108',
  avance_personnel: '425',
  charge_diverse: '658',
  paiement_mra: '444',
  frais_bancaires: '627',
  salaire: '4210',
  salaire_bulk: '421',
  virement_interne: '5800',
  remboursement_personnel: '108',
  loyer: '613',
  entretien: '615',
  assurance: '616',
  honoraires: '622',
  deplacement: '625',
  telecom: '626',
  impot_taxe: '635',
  materiel: '606',
  produit_divers: '706',
  charge_sociale: '431',
  autre: '471',
}

export function resolveCompteForClassification(classification: string): string {
  return CLASSE_COMPTES[classification] || '471'
}

// ─────────────────────────────────────────────────────────────────────────
// 2) Classifications éligibles au "lettrage croisé"
//
// Lorsque l'opérateur classe une tx sortante dans une de ces catégories,
// on cherche à lettrer en même temps l'écriture SAL/OD non-lettrée
// pré-existante (paye, MRA, cotisations…). Voir le bloc Step 3.5 dans
// `lettrer_manuel`.
// ─────────────────────────────────────────────────────────────────────────
export const CLASSIFICATIONS_AVEC_LETTRAGE_CROISE: ReadonlySet<string> = new Set([
  'salaire',
  'salaire_bulk',
  'paiement_mra',
  'charge_sociale',
  'remboursement_personnel',
])

// ─────────────────────────────────────────────────────────────────────────
// 3) Fenêtre/tolérance pour le lettrage croisé (lettrer_manuel)
// ─────────────────────────────────────────────────────────────────────────
export const LETTRAGE_CROISE_DATE_WINDOW_DAYS = 60

/**
 * Tolérance en MUR pour considérer deux montants "égaux" lors du
 * lettrage croisé. min 0.5 MUR pour absorber les arrondis de change
 * et de centimes, sinon 0.5% du montant.
 */
export function lettrageCroiseTolerance(amountMur: number): number {
  return Math.max(0.5, amountMur * 0.005)
}

/**
 * Sélectionne, parmi des candidats, l'écriture la plus proche en date
 * de la date de référence. Utilisé quand plusieurs candidats matchent
 * le montant ET le compte (lettrage croisé, plusieurs paies du même
 * montant, etc.).
 */
export function selectClosestByDate<T extends { date_ecriture?: string | null }>(
  candidates: T[],
  dateRef: Date,
): T | null {
  if (!candidates || candidates.length === 0) return null
  return candidates.reduce((best, c) => {
    const cDelta = Math.abs(new Date(c.date_ecriture || '').getTime() - dateRef.getTime())
    const bestDelta = Math.abs(new Date(best.date_ecriture || '').getTime() - dateRef.getTime())
    return cDelta < bestDelta ? c : best
  })
}

// ─────────────────────────────────────────────────────────────────────────
// 4) Lettrage multi-factures : seuils et calcul du compte d'écart (PCG Mauritius)
//
// Règles :
//   'auto'         → |ecart| ≤ 1 MUR → 658/758 (régularisation)
//   'change'       → 666 perte / 766 gain
//   'escompte'     → 665 escompte accordé / 765 escompte obtenu
//   'penalite'     → 631 (toujours côté charge)
//   'exceptionnel' → 658 / 758
//   'a_regulariser'→ 471 (compte d'attente)
// ─────────────────────────────────────────────────────────────────────────
export const LETTRER_MULTI_SEUIL_AUTO_ABS = 100 // MUR — petits écarts toujours acceptés
export const LETTRER_MULTI_SEUIL_AUTO_PCT = 0.02 // 2 %

export type TypeEcart =
  | 'auto'
  | 'change'
  | 'escompte'
  | 'penalite'
  | 'exceptionnel'
  | 'a_regulariser'

export interface EcartCompteResult {
  compte: string
  libelle: string
  /** debit_mur à poser sur l'écriture OD d'écart */
  debit: number
  /** credit_mur à poser sur l'écriture OD d'écart */
  credit: number
}

/**
 * Calcule le compte d'écart + libellé + sens (débit/crédit) pour une
 * écriture OD générée par `lettrer_multi`. Extrait tel quel de la
 * logique inline (route.ts lignes ~2900-2960) sans modification.
 *
 * @param ecart      |txAmount - facturesTotal| (toujours ≥ 0)
 * @param ecartSigne txAmount - facturesTotal (peut être négatif)
 * @param lettreCode code de lettre (ex "RM1234") repris dans le libellé
 * @param typeEcart  qualification utilisateur (ou undefined pour auto)
 */
export function computeEcartCompte(
  ecart: number,
  ecartSigne: number,
  lettreCode: string,
  typeEcart: TypeEcart | undefined,
): EcartCompteResult {
  const ecartAbs = Math.round(ecart * 100) / 100
  let compteEcart: string
  let libelleEcart: string

  if (ecart <= LETTRER_MULTI_SEUIL_AUTO_ABS) {
    // Régularisation automatique <100 MUR (en pratique <1 MUR — le test
    // historique utilise ≤ SEUIL_AUTO_ABS pour rester aligné avec
    // l'autorisation 2%/100 MUR du seuil de qualification).
    compteEcart = ecartSigne > 0 ? '758' : '658'
    libelleEcart = `Régularisation écart <1 MUR — ${lettreCode}`
  } else {
    switch (typeEcart) {
      case 'change':
        compteEcart = ecartSigne > 0 ? '766' : '666'
        libelleEcart = `${ecartSigne > 0 ? 'Gain' : 'Perte'} de change — ${lettreCode}`
        break
      case 'escompte':
        compteEcart = ecartSigne > 0 ? '765' : '665'
        libelleEcart = `${ecartSigne > 0 ? 'Escompte obtenu' : 'Escompte accordé'} — ${lettreCode}`
        break
      case 'penalite':
        compteEcart = '631'
        libelleEcart = `Pénalité de retard — ${lettreCode}`
        break
      case 'a_regulariser':
        compteEcart = '471'
        libelleEcart = `Écart forcé — à régulariser (${ecartSigne > 0 ? '+' : ''}${ecartAbs.toFixed(2)} MUR) — ${lettreCode}`
        break
      case 'exceptionnel':
      default:
        compteEcart = ecartSigne > 0 ? '758' : '658'
        libelleEcart = `Écart exceptionnel rapprochement — ${lettreCode}`
        break
    }
  }

  // Sens débit/crédit selon classe du compte :
  //   • 6xxx (charge) → débit
  //   • 7xxx (produit) → crédit
  //   • 4xxx (471 attente) → inverse de ecartSigne pour neutraliser 411/401
  let debit = 0
  let credit = 0
  if (/^6/.test(compteEcart)) debit = ecartAbs
  else if (/^7/.test(compteEcart)) credit = ecartAbs
  else if (/^4/.test(compteEcart)) {
    if (ecartSigne > 0) credit = ecartAbs
    else debit = ecartAbs
  }

  return { compte: compteEcart, libelle: libelleEcart, debit, credit }
}

/**
 * Décide si l'écart entre la tx et le total factures nécessite une
 * qualification explicite par l'opérateur (règle R4). Retourne `true`
 * si on doit renvoyer un 409 avec les options de qualification.
 */
export function ecartRequiresQualification(
  ecart: number,
  facturesTotal: number,
  typeEcart: TypeEcart | undefined,
): boolean {
  if (typeEcart) return false
  const ecartPct = facturesTotal > 0 ? ecart / facturesTotal : 0
  return ecart > LETTRER_MULTI_SEUIL_AUTO_ABS && ecartPct > LETTRER_MULTI_SEUIL_AUTO_PCT
}

// ─────────────────────────────────────────────────────────────────────────
// 5) Auto-lettrage BNQ ↔ ACH — détection de candidats opposés
//
// Pour une écriture BNQ déjà lettrée sur 4[01]1, on cherche la
// contrepartie ACH non lettrée (sens opposé, même montant ±2%).
// Extrait du handler `auto_lettrage_bnq`.
// ─────────────────────────────────────────────────────────────────────────
export const AUTO_LETTRAGE_BNQ_TOLERANCE_PCT = 0.02

export interface AchCandidate {
  id: string
  credit?: number | null
  debit?: number | null
  date_ecriture?: string | null
  libelle?: string | null
}

/**
 * Recherche jusqu'à `limit` candidates ACH non lettrés sur le même
 * compte, en sens opposé, avec un montant proche (±2 %). Trie par
 * `date_ecriture` desc. Le caller doit ensuite choisir le plus
 * proche en date via `selectClosestByDate`.
 *
 * Reproduit fidèlement la requête inline de `auto_lettrage_bnq`.
 */
export async function findAchCandidatesForBnq(
  supabase: SupabaseClient,
  args: {
    dossierId: string
    compte: string
    bnqAmount: number
    isDebit: boolean
    limit?: number
  },
): Promise<AchCandidate[]> {
  const { dossierId, compte, bnqAmount, isDebit } = args
  const limit = args.limit ?? 5
  const oppositeCol = isDebit ? 'credit' : 'debit'
  const minAmt = Math.round(bnqAmount * (1 - AUTO_LETTRAGE_BNQ_TOLERANCE_PCT) * 100) / 100
  const maxAmt = Math.round(bnqAmount * (1 + AUTO_LETTRAGE_BNQ_TOLERANCE_PCT) * 100) / 100

  const { data } = await supabase
    .from('ecritures_comptables_v2')
    .select('id, credit:credit_mur, debit:debit_mur, date_ecriture, libelle')
    .eq('dossier_id', dossierId)
    .eq('compte', compte)
    .is('lettre', null)
    .gte(oppositeCol, minAmt)
    .lte(oppositeCol, maxAmt)
    .order('date_ecriture', { ascending: false })
    .limit(limit)

  return (data || []) as AchCandidate[]
}

// ─────────────────────────────────────────────────────────────────────────
// 6) Helpers communs aux handlers de lettrage manuel/multi
// ─────────────────────────────────────────────────────────────────────────

/**
 * Génère un code de lettre court basé sur l'horodatage. Pas de garantie
 * d'unicité absolue (4 derniers chiffres du ms) mais suffisant pour les
 * lettres ad-hoc — les lettres R### (sync_lettrage) gardent leur propre
 * compteur incrémental.
 *
 * Préfixes utilisés :
 *   - "M"   → lettrer_manuel (lettrage simple)
 *   - "MC"  → lettrer_manuel (classification sans facture)
 *   - "RM"  → lettrer_multi
 *   - "LE"  → lettrer_ecritures (hors range V3-22)
 */
export function genLettreCode(prefix: 'M' | 'MC' | 'RM' | 'LE'): string {
  return `${prefix}${String(Date.now()).slice(-4)}`
}

/**
 * Détermine, à partir du sens d'une transaction (debit > 0 ⇒ sortie)
 * et du type de facture, le type de paiement à passer à
 * `createEcrituresForPayment` : 'supplier' (paiement fournisseur) ou
 * 'client' (encaissement client). Centralise la convention type_facture
 * 'fournisseur' ⇒ 'supplier'.
 */
export function payTypeFromFactureType(
  typeFacture: string | null | undefined,
): 'supplier' | 'client' {
  return typeFacture === 'fournisseur' ? 'supplier' : 'client'
}

/**
 * Calcule le montant absolu d'une transaction (max entre debit et credit)
 * sans signe. Utilisé pour comparer aux montants des factures.
 */
export function txAbsoluteAmount(tx: { debit?: unknown; credit?: unknown }): number {
  const d = Number(tx.debit) || 0
  const c = Number(tx.credit) || 0
  return Math.max(d, c)
}
