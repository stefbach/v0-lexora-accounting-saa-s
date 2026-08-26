/**
 * Jeu de fixtures de non-régression pour la catégorisation des factures
 * fournisseurs.
 *
 * COMPTES_POSTABLES_SNAPSHOT : instantané des comptes réels POSTABLES injectés
 * dans le prompt (classe 6 + TVA/TDS/fournisseurs), pris depuis la prod. Sert de
 * source de vérité au test : chaque compte attendu par une fixture DOIT exister
 * dans ce snapshot. Si le plan change (compte retiré/renuméroté), le test tombe —
 * exactement la classe de régression qui avait produit 6510/651, 6011/601, etc.
 *
 * Note : ce test valide le CONTRAT plan↔attentes (compte attendu présent dans le
 * plan), pas l'appel LLM lui-même. Une éval end-to-end (appel modèle réel) reste
 * manuelle, avec ANTHROPIC_API_KEY.
 */

export interface CompteSnapshot {
  compte: string
  libelle: string
}

export const COMPTES_POSTABLES_SNAPSHOT: CompteSnapshot[] = [
  { compte: '401', libelle: 'Fournisseurs' },
  { compte: '4010', libelle: 'Fournisseurs — achats de biens et services' },
  { compte: '4011', libelle: 'Fournisseurs — achats hors exploitation' },
  { compte: '4452', libelle: 'TVA due intracommunautaire' },
  { compte: '4456', libelle: 'TVA déductible' },
  { compte: '601', libelle: 'Achats de marchandises' },
  { compte: '606', libelle: 'Achats non stockés (fournitures)' },
  { compte: '607', libelle: 'Achats (services et prestations)' },
  { compte: '611', libelle: 'Sous-traitance générale' },
  { compte: '612', libelle: 'Loyers et charges locatives' },
  { compte: '6131', libelle: 'Loyers' },
  { compte: '6135', libelle: 'Charges locatives' },
  { compte: '6151', libelle: 'Entretien et réparations' },
  { compte: '6160', libelle: 'Assurances' },
  { compte: '621', libelle: "Personnel extérieur à l'entreprise" },
  { compte: '6221', libelle: 'Honoraires comptables' },
  { compte: '6225', libelle: 'Honoraires juridiques et conseils' },
  { compte: '623', libelle: 'Publicité et marketing' },
  { compte: '624', libelle: 'Transport de biens et transports collectifs' },
  { compte: '6251', libelle: 'Frais de déplacement' },
  { compte: '6256', libelle: 'Missions et réceptions' },
  { compte: '6261', libelle: 'Téléphone et internet' },
  { compte: '6263', libelle: 'Électricité' },
  { compte: '6264', libelle: 'Eau' },
  { compte: '6271', libelle: 'Frais bancaires' },
  { compte: '6272', libelle: 'Commissions bancaires (SWIFT, cables)' },
  { compte: '628', libelle: 'Charges externes diverses' },
  { compte: '6351', libelle: 'Droits de timbre et enregistrement' },
  { compte: '6356', libelle: 'TDS sur loyer (charge)' },
  { compte: '6357', libelle: 'TDS sur services professionnels (charge)' },
  { compte: '651', libelle: 'Redevances licences SaaS' },
]

export interface FixtureFacture {
  label: string
  /** Nature attendue (aide humaine ; l'IA la déduit du document). */
  nature: string
  /** Compte de charge réel attendu (doit exister dans le snapshot). */
  compteAttendu: string
  /** Comptes alternatifs acceptables (ambiguïté légitime). */
  comptesAcceptables?: string[]
}

/**
 * Factures types couvrant les cas récurrents mauriciens. Le compte attendu est
 * le code RÉEL du plan (pas la nomenclature conceptuelle du prompt).
 */
export const FIXTURES_CATEGORISATION: FixtureFacture[] = [
  { label: 'Emtel — internet fibre', nature: 'internet / télécom', compteAttendu: '6261' },
  { label: 'Vercel — abonnement SaaS (USD)', nature: 'SaaS / logiciel', compteAttendu: '651' },
  { label: 'MW Properties — loyer bureaux', nature: 'loyer immobilier', compteAttendu: '6131' },
  { label: 'BDO — honoraires audit', nature: 'honoraires comptables/audit', compteAttendu: '6221' },
  { label: 'IBL — achat marchandises', nature: 'achat de marchandises', compteAttendu: '601' },
  { label: 'CEB — électricité', nature: 'électricité (utility)', compteAttendu: '6263' },
  { label: 'CWA — eau', nature: 'eau (utility)', compteAttendu: '6264' },
  { label: 'Google Ads — publicité', nature: 'marketing / publicité', compteAttendu: '623' },
  { label: 'Swan — assurance RC', nature: 'assurance', compteAttendu: '6160' },
  { label: 'Freelance dev récurrent', nature: 'sous-traitance', compteAttendu: '611', comptesAcceptables: ['621'] },
]

/** Codes qui existaient dans l'ANCIEN prompt statique mais PAS dans le plan réel. */
export const CODES_DERIVE_A_BANNIR = ['6510', '6011', '6120', '6112', '6222', '6262']
