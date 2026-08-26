/**
 * lib/pos/payments.ts — Fondation « connexion paiement » (couche PURE).
 *
 * Métadonnées par moyen de paiement (compte d'encaissement, caractère
 * électronique, besoin de référence, rapprochement) et contrat d'adaptateur
 * *pluggable* pour brancher un vrai fournisseur (MCB Juice / QR, terminal carte,
 * Stripe) sans toucher le reste du POS. Aucun appel réseau ici.
 */

import type { MoyenPaiement } from './types'
import { COMPTE_PAR_MOYEN } from './types'

export type CaptureStatut = 'en_attente' | 'capture' | 'echoue' | 'rembourse'

export interface PaymentMethodMeta {
  moyen: MoyenPaiement
  /** Compte d'encaissement (miroir de COMPTE_PAR_MOYEN). */
  compte: string
  /** Encaissement électronique (passe par 5118 « monétique en transit »). */
  electronique: boolean
  /** Une référence de transaction est-elle attendue (rapprochement bancaire) ? */
  reference_requise: boolean
  /** Fournisseur par défaut affiché (indicatif). */
  provider_defaut: string
}

/** 5118 = monétique en transit : soldé plus tard par le rapprochement bancaire. */
const COMPTE_MONETIQUE_TRANSIT = '5118'

export const PAYMENT_METHODS: Record<MoyenPaiement, PaymentMethodMeta> = {
  especes: { moyen: 'especes', compte: COMPTE_PAR_MOYEN.especes, electronique: false, reference_requise: false, provider_defaut: 'caisse' },
  carte: { moyen: 'carte', compte: COMPTE_PAR_MOYEN.carte, electronique: true, reference_requise: true, provider_defaut: 'terminal_carte' },
  mobile_money: { moyen: 'mobile_money', compte: COMPTE_PAR_MOYEN.mobile_money, electronique: true, reference_requise: true, provider_defaut: 'mcb_juice' },
  virement: { moyen: 'virement', compte: COMPTE_PAR_MOYEN.virement, electronique: true, reference_requise: true, provider_defaut: 'banque' },
}

export function isElectronique(moyen: MoyenPaiement): boolean {
  return PAYMENT_METHODS[moyen]?.electronique ?? false
}

/** Un encaissement électronique transite par 5118 (à rapprocher). */
export function estEnTransit(moyen: MoyenPaiement): boolean {
  return PAYMENT_METHODS[moyen]?.compte === COMPTE_MONETIQUE_TRANSIT
}

/** Fournisseur par défaut pour un moyen (NULL pour les espèces = manuel). */
export function providerParDefaut(moyen: MoyenPaiement): string | null {
  if (!isElectronique(moyen)) return null
  return PAYMENT_METHODS[moyen]?.provider_defaut ?? null
}

// ── Contrat d'adaptateur (brancher un vrai provider ultérieurement) ──────────

export interface PaiementDemande {
  moyen: MoyenPaiement
  montant: number
  reference?: string | null
}

export interface PaiementResultat {
  provider: string | null
  transaction_ref: string | null
  statut_capture: CaptureStatut
  terminal_ref?: string | null
  /** Charge utile QR à afficher (MCB Juice…), si applicable. */
  qr_payload?: string | null
}

/**
 * Un adaptateur encapsule un fournisseur : il « prépare » un paiement (statut,
 * référence, éventuel QR). L'adaptateur `manuel` est le comportement actuel :
 * capture immédiate, référence saisie à la main. Les adaptateurs réels
 * (MCB Juice, terminal) implémenteront `preparer` avec un appel provider.
 */
export interface PaymentAdapter {
  id: string
  label: string
  supporte(moyen: MoyenPaiement): boolean
  preparer(demande: PaiementDemande): PaiementResultat
}

export const manualAdapter: PaymentAdapter = {
  id: 'manuel',
  label: 'Manuel (saisie caissier)',
  supporte: () => true,
  preparer: (d) => ({
    provider: providerParDefaut(d.moyen),
    transaction_ref: d.reference?.trim() || null,
    statut_capture: 'capture',
    terminal_ref: null,
    qr_payload: null,
  }),
}

const ADAPTERS: PaymentAdapter[] = [manualAdapter]

/** Sélectionne l'adaptateur pour un moyen (manuel par défaut tant qu'aucun
 *  provider live n'est branché). */
export function resolveAdapter(moyen: MoyenPaiement, providerId?: string): PaymentAdapter {
  if (providerId) {
    const a = ADAPTERS.find((x) => x.id === providerId && x.supporte(moyen))
    if (a) return a
  }
  return manualAdapter
}
