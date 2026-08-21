/**
 * lib/pos/ecritures.ts — Écritures comptables du point de vente.
 *
 * Réf. spec : docs/roadmap/inventaire-pos.md §2.4 :
 *   Encaissement ticket (journal POS, ref_folio POS-<vente_id>) :
 *     D 530 Caisse / 5118 Monétique en transit / 512 Banque (par moyen, TTC)
 *     C 701 Ventes de marchandises (HT, par compte de vente produit)
 *     C 4457 TVA collectée
 *   Écart de caisse à la clôture (ref_folio POS-SES-<session_id>) :
 *     manque  (écart < 0) : D 6588 / C 530
 *     surplus (écart > 0) : D 530  / C 758
 *
 * Le COGS (D 6037 / C 3701 au CUMP) est généré par le socle inventaire —
 * createEcrituresForMouvementStock — sur les mouvements `sortie_vente`
 * créés par la RPC valider_vente_pos : aucune logique dupliquée ici.
 *
 * Règles : équilibre R1 vérifié avant insertion (isBalanced), idempotence
 * par ref_folio, montants via lib/money (Decimal.js).
 */

import { isBalanced, money, round2 } from '@/lib/money'

// Client admin ou serveur — même convention que lib/inventaire/ecritures.ts
type SupabaseClient = any

export const COMPTE_CAISSE = '530'
export const COMPTE_MONETIQUE_TRANSIT = '5118'
export const COMPTE_VENTES_DEFAUT = '701'
export const COMPTE_TVA_COLLECTEE = '4457'
export const COMPTE_ECART_CAISSE_MANQUE = '6588'
export const COMPTE_ECART_CAISSE_SURPLUS = '758'

const NOMS_COMPTES: Record<string, string> = {
  [COMPTE_CAISSE]: 'Caisse',
  [COMPTE_MONETIQUE_TRANSIT]: 'Monétique en transit',
  '512': 'Banque (compte principal)',
  [COMPTE_VENTES_DEFAUT]: 'Ventes de marchandises',
  [COMPTE_TVA_COLLECTEE]: 'TVA collectée',
  [COMPTE_ECART_CAISSE_MANQUE]: "Écarts d'inventaire",
  [COMPTE_ECART_CAISSE_SURPLUS]: 'Produits divers de gestion courante',
}

export function nomComptePos(compte: string): string {
  return NOMS_COMPTES[compte] || `Compte ${compte}`
}

export interface EcriturePosLine {
  societe_id: string
  dossier_id: string | null
  date_ecriture: string
  journal: 'POS'
  ref_folio: string
  numero_compte: string
  nom_compte: string
  libelle: string
  description: string
  debit_mur: number
  credit_mur: number
  exercice: string
}

/** ref_folio d'un ticket POS — distinct de FAC-<id> et STK-<id>. */
export function refFolioVente(venteId: string): string {
  return `POS-${venteId}`
}

/** ref_folio de l'écart de caisse d'une session. */
export function refFolioSession(sessionId: string): string {
  return `POS-SES-${sessionId}`
}

export interface VentePourEcritures {
  id: string
  societe_id: string
  dossier_id?: string | null
  numero_ticket: string
  /** Timestamp ou date ISO — seule la partie date est utilisée. */
  date_vente: string
  montant_tva: number
}

export interface LignePourEcritures {
  montant_ht: number
  compte_vente?: string | null
}

export interface PaiementPourEcritures {
  compte_comptable: string
  montant: number
}

function baseLine(
  societeId: string,
  dossierId: string | null,
  date: string,
  refFolio: string,
  libelle: string,
) {
  const dateEcriture = date.slice(0, 10)
  return {
    societe_id: societeId,
    dossier_id: dossierId,
    date_ecriture: dateEcriture,
    journal: 'POS' as const,
    ref_folio: refFolio,
    libelle,
    description: libelle,
    exercice: dateEcriture.slice(0, 4),
  }
}

/**
 * Écriture d'encaissement ÉQUILIBRÉE d'un ticket validé :
 * un débit par compte d'encaissement (TTC), crédits HT par compte de vente
 * + crédit TVA collectée. Pure — lève R1 si le ticket est déséquilibré.
 */
export function buildEcrituresVentePos(
  vente: VentePourEcritures,
  lignes: LignePourEcritures[],
  paiements: PaiementPourEcritures[],
): EcriturePosLine[] {
  if (lignes.length === 0 || paiements.length === 0) return []

  const libelle = `Vente POS ${vente.numero_ticket}`
  const base = baseLine(
    vente.societe_id,
    vente.dossier_id ?? null,
    vente.date_vente,
    refFolioVente(vente.id),
    libelle,
  )

  const debitsParCompte = new Map<string, number>()
  for (const p of paiements) {
    const compte = p.compte_comptable || COMPTE_CAISSE
    debitsParCompte.set(compte, round2(money(debitsParCompte.get(compte) || 0).plus(money(p.montant))))
  }

  const htParCompte = new Map<string, number>()
  for (const l of lignes) {
    const compte = l.compte_vente || COMPTE_VENTES_DEFAUT
    htParCompte.set(compte, round2(money(htParCompte.get(compte) || 0).plus(money(l.montant_ht))))
  }

  const out: EcriturePosLine[] = []
  for (const [compte, montant] of debitsParCompte) {
    if (montant <= 0) continue
    out.push({ ...base, numero_compte: compte, nom_compte: nomComptePos(compte), debit_mur: montant, credit_mur: 0 })
  }
  for (const [compte, montant] of htParCompte) {
    if (montant <= 0) continue
    out.push({ ...base, numero_compte: compte, nom_compte: nomComptePos(compte), debit_mur: 0, credit_mur: montant })
  }
  const tva = round2(vente.montant_tva)
  if (tva > 0) {
    out.push({
      ...base,
      numero_compte: COMPTE_TVA_COLLECTEE,
      nom_compte: nomComptePos(COMPTE_TVA_COLLECTEE),
      debit_mur: 0,
      credit_mur: tva,
    })
  }

  if (!isBalanced(out.map((l) => l.debit_mur), out.map((l) => l.credit_mur))) {
    throw new Error(`R1 violée — écriture POS déséquilibrée pour le ticket ${vente.numero_ticket}`)
  }
  return out
}

export interface SessionPourEcritures {
  id: string
  societe_id: string
  dossier_id?: string | null
  ecart_caisse: number
  /** Date de fermeture (ISO) — partie date utilisée pour l'écriture. */
  fermee_at: string
}

/**
 * Écriture d'écart de caisse à la clôture de session.
 * Écart nul ⇒ [] ; manque ⇒ D 6588 / C 530 ; surplus ⇒ D 530 / C 758.
 */
export function buildEcrituresEcartCaisse(session: SessionPourEcritures): EcriturePosLine[] {
  const ecart = round2(session.ecart_caisse)
  if (ecart === 0) return []
  const montant = round2(money(ecart).abs())
  const manque = ecart < 0

  const libelle = manque
    ? `Écart de caisse (manque) — clôture session ${session.id.slice(0, 8)}`
    : `Écart de caisse (surplus) — clôture session ${session.id.slice(0, 8)}`
  const base = baseLine(
    session.societe_id,
    session.dossier_id ?? null,
    session.fermee_at,
    refFolioSession(session.id),
    libelle,
  )

  const debit = manque ? COMPTE_ECART_CAISSE_MANQUE : COMPTE_CAISSE
  const credit = manque ? COMPTE_CAISSE : COMPTE_ECART_CAISSE_SURPLUS
  const out: EcriturePosLine[] = [
    { ...base, numero_compte: debit, nom_compte: nomComptePos(debit), debit_mur: montant, credit_mur: 0 },
    { ...base, numero_compte: credit, nom_compte: nomComptePos(credit), debit_mur: 0, credit_mur: montant },
  ]
  if (!isBalanced(out.map((l) => l.debit_mur), out.map((l) => l.credit_mur))) {
    throw new Error('R1 violée — écriture d\'écart de caisse déséquilibrée')
  }
  return out
}

async function resolveDossierId(
  supabase: SupabaseClient,
  societeId: string,
  dossierId: string | null | undefined,
): Promise<string | null> {
  if (dossierId) return dossierId
  const { data } = await supabase
    .from('dossiers')
    .select('id')
    .eq('societe_id', societeId)
    .limit(1)
    .maybeSingle()
  return data?.id || null
}

async function insertIdempotent(
  supabase: SupabaseClient,
  societeId: string,
  refFolio: string,
  lignes: EcriturePosLine[],
): Promise<{ ok: boolean; nb_entries: number; error?: string }> {
  if (lignes.length === 0) return { ok: true, nb_entries: 0 }
  const { data: existing } = await supabase
    .from('ecritures_comptables_v2')
    .select('id')
    .eq('societe_id', societeId)
    .eq('ref_folio', refFolio)
    .limit(1)
  if (existing && existing.length > 0) return { ok: true, nb_entries: 0 }

  const { error } = await supabase.from('ecritures_comptables_v2').insert(lignes)
  if (error) return { ok: false, nb_entries: 0, error: error.message }
  return { ok: true, nb_entries: lignes.length }
}

/**
 * Insère l'écriture d'encaissement d'un ticket dans ecritures_comptables_v2.
 * Idempotent par ref_folio POS-<vente_id> ; complète dossier_id si absent.
 */
export async function createEcrituresForVentePos(
  supabase: SupabaseClient,
  vente: VentePourEcritures,
  lignes: LignePourEcritures[],
  paiements: PaiementPourEcritures[],
): Promise<{ ok: boolean; nb_entries: number; error?: string }> {
  try {
    const dossierId = await resolveDossierId(supabase, vente.societe_id, vente.dossier_id)
    const ecritures = buildEcrituresVentePos({ ...vente, dossier_id: dossierId }, lignes, paiements)
    return await insertIdempotent(supabase, vente.societe_id, refFolioVente(vente.id), ecritures)
  } catch (e: any) {
    return { ok: false, nb_entries: 0, error: e?.message || 'Erreur inconnue' }
  }
}

/**
 * Insère l'écriture d'écart de caisse d'une session fermée.
 * Idempotent par ref_folio POS-SES-<session_id> ; écart nul ⇒ aucune écriture.
 */
export async function createEcrituresForEcartCaisse(
  supabase: SupabaseClient,
  session: SessionPourEcritures,
): Promise<{ ok: boolean; nb_entries: number; error?: string }> {
  try {
    const dossierId = await resolveDossierId(supabase, session.societe_id, session.dossier_id)
    const ecritures = buildEcrituresEcartCaisse({ ...session, dossier_id: dossierId })
    return await insertIdempotent(supabase, session.societe_id, refFolioSession(session.id), ecritures)
  } catch (e: any) {
    return { ok: false, nb_entries: 0, error: e?.message || 'Erreur inconnue' }
  }
}
