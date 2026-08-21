/**
 * lib/pos/session.ts — Sessions de caisse : validation d'ouverture,
 * calcul de fermeture (fond théorique, écart) et récapitulatif de shift.
 * Miroir des calculs de la RPC `fermer_session_caisse` (migration 486).
 */

import { money, round2, sumMoney } from '@/lib/money'
import type { MoyenPaiement } from './types'

export interface OuverturePayload {
  depot_id: string | null
  fond_ouverture: number
  notes: string | null
}

type ResultatOuverture = { ok: true; data: OuverturePayload } | { ok: false; error: string }

export function validateOuverturePayload(body: unknown): ResultatOuverture {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body JSON requis' }
  const b = body as Record<string, unknown>
  const fond = b.fond_ouverture == null || b.fond_ouverture === '' ? 0 : Number(b.fond_ouverture)
  if (!Number.isFinite(fond) || fond < 0) {
    return { ok: false, error: 'fond_ouverture doit être positif ou nul' }
  }
  return {
    ok: true,
    data: {
      depot_id: typeof b.depot_id === 'string' && b.depot_id.trim() ? b.depot_id.trim() : null,
      fond_ouverture: round2(fond),
      notes: b.notes ? String(b.notes).trim().slice(0, 1000) : null,
    },
  }
}

export interface FermetureCalculee {
  fond_fermeture_theorique: number
  ecart_caisse: number
}

/**
 * Fond théorique = fond d'ouverture + Σ encaissements espèces du shift ;
 * écart = fond compté − fond théorique (négatif ⇒ manque de caisse).
 */
export function calculerFermeture(
  fondOuverture: number,
  totalEspeces: number,
  fondCompte: number,
): FermetureCalculee {
  const theorique = round2(money(fondOuverture).plus(money(totalEspeces)))
  return {
    fond_fermeture_theorique: theorique,
    ecart_caisse: round2(money(fondCompte).minus(theorique)),
  }
}

export interface VentePourRecap {
  montant_ht: number
  montant_tva: number
  montant_ttc: number
  statut: string
}

export interface PaiementPourRecap {
  moyen_paiement: MoyenPaiement | string
  montant: number
}

export interface RecapSession {
  nb_tickets: number
  total_ht: number
  total_tva: number
  total_ttc: number
  par_moyen: Record<string, number>
}

/** Récapitulatif d'un shift à partir des tickets validés et de leurs paiements. */
export function buildRecapSession(
  ventes: VentePourRecap[],
  paiements: PaiementPourRecap[],
): RecapSession {
  const validees = ventes.filter((v) => v.statut === 'validee')
  const parMoyen: Record<string, number> = {}
  for (const p of paiements) {
    parMoyen[p.moyen_paiement] = round2(money(parMoyen[p.moyen_paiement] || 0).plus(money(p.montant)))
  }
  return {
    nb_tickets: validees.length,
    total_ht: sumMoney(validees.map((v) => v.montant_ht)),
    total_tva: sumMoney(validees.map((v) => v.montant_tva)),
    total_ttc: sumMoney(validees.map((v) => v.montant_ttc)),
    par_moyen: parMoyen,
  }
}
