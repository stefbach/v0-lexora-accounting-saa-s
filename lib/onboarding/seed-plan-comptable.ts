/**
 * Plan comptable PCM Maurice — minimal essentiel à seeder pour une nouvelle société.
 *
 * Le plan comptable canonique est déjà inséré globalement par la migration
 * 202_plan_comptable_strict_canonique.sql (UNIQUE(compte)). Ce module
 * retourne la liste des comptes que l'on s'assure d'avoir disponibles
 * (UPSERT idempotent) à la création d'une société.
 *
 * On ne ré-insère pas tout le PCM : on s'aligne sur les ~50 comptes que
 * 95 % des PME utilisent au quotidien (ventes, achats, banque, salaires,
 * TVA, capital, immobilisations principales). Le reste est ajouté au fur
 * et à mesure par les modules métier (paie, immo, etc.).
 */
export type SeedAccount = {
  compte: string
  libelle: string
  type_compte: 'actif' | 'passif' | 'charge' | 'produit' | 'capitaux'
  sens_normal: 'D' | 'C'
  compte_parent: string | null
  niveau: number
}

export const PCM_ESSENTIEL: SeedAccount[] = [
  // ── Classe 1 : Capitaux ────────────────────────────────────────────────
  { compte: '1010', libelle: 'Capital social',                          type_compte: 'passif',  sens_normal: 'C', compte_parent: null,  niveau: 4 },
  { compte: '1061', libelle: 'Réserve légale',                          type_compte: 'passif',  sens_normal: 'C', compte_parent: '106', niveau: 4 },
  { compte: '1190', libelle: 'Report à nouveau',                        type_compte: 'passif',  sens_normal: 'C', compte_parent: '119', niveau: 4 },
  { compte: '1200', libelle: "Résultat de l'exercice",                  type_compte: 'passif',  sens_normal: 'C', compte_parent: null,  niveau: 4 },
  { compte: '1640', libelle: 'Emprunts bancaires',                      type_compte: 'passif',  sens_normal: 'C', compte_parent: '164', niveau: 4 },

  // ── Classe 2 : Immobilisations ─────────────────────────────────────────
  { compte: '2181', libelle: 'Installations générales, agencements',    type_compte: 'actif',   sens_normal: 'D', compte_parent: '218', niveau: 4 },
  { compte: '2183', libelle: 'Matériel de bureau et informatique',      type_compte: 'actif',   sens_normal: 'D', compte_parent: '218', niveau: 4 },
  { compte: '2184', libelle: 'Mobilier de bureau',                      type_compte: 'actif',   sens_normal: 'D', compte_parent: '218', niveau: 4 },
  { compte: '2815', libelle: 'Amortissement — Installations',           type_compte: 'passif',  sens_normal: 'C', compte_parent: '281', niveau: 4 },
  { compte: '2818', libelle: 'Amortissement — Autres immobilisations',  type_compte: 'passif',  sens_normal: 'C', compte_parent: '281', niveau: 4 },

  // ── Classe 4 : Tiers ───────────────────────────────────────────────────
  { compte: '401',  libelle: 'Fournisseurs',                            type_compte: 'passif',  sens_normal: 'C', compte_parent: null,  niveau: 3 },
  { compte: '411',  libelle: 'Clients',                                 type_compte: 'actif',   sens_normal: 'D', compte_parent: null,  niveau: 3 },
  { compte: '4210', libelle: 'Salaires nets à payer',                   type_compte: 'passif',  sens_normal: 'C', compte_parent: '421', niveau: 4 },
  { compte: '4311', libelle: 'CSG salarié à verser',                    type_compte: 'passif',  sens_normal: 'C', compte_parent: '431', niveau: 4 },
  { compte: '4321', libelle: 'CSG patronal à verser',                   type_compte: 'passif',  sens_normal: 'C', compte_parent: '432', niveau: 4 },
  { compte: '4330', libelle: 'PAYE à reverser à la MRA',                type_compte: 'passif',  sens_normal: 'C', compte_parent: '433', niveau: 4 },
  { compte: '4455', libelle: 'TVA à décaisser',                         type_compte: 'passif',  sens_normal: 'C', compte_parent: '445', niveau: 4 },
  { compte: '4456', libelle: 'TVA déductible',                          type_compte: 'actif',   sens_normal: 'D', compte_parent: '445', niveau: 4 },
  { compte: '4457', libelle: 'TVA collectée',                           type_compte: 'passif',  sens_normal: 'C', compte_parent: '445', niveau: 4 },
  { compte: '4710', libelle: "Comptes d'attente",                       type_compte: 'actif',   sens_normal: 'D', compte_parent: '471', niveau: 4 },

  // ── Classe 5 : Trésorerie ──────────────────────────────────────────────
  { compte: '512',  libelle: 'Banque (compte principal)',               type_compte: 'actif',   sens_normal: 'D', compte_parent: null,  niveau: 3 },
  { compte: '5121', libelle: 'Banque MUR',                              type_compte: 'actif',   sens_normal: 'D', compte_parent: '512', niveau: 4 },
  { compte: '5122', libelle: 'Banque EUR',                              type_compte: 'actif',   sens_normal: 'D', compte_parent: '512', niveau: 4 },
  { compte: '5123', libelle: 'Banque USD',                              type_compte: 'actif',   sens_normal: 'D', compte_parent: '512', niveau: 4 },
  { compte: '5800', libelle: 'Virements internes (transit)',            type_compte: 'actif',   sens_normal: 'D', compte_parent: '580', niveau: 4 },

  // ── Classe 6 : Charges ─────────────────────────────────────────────────
  { compte: '601',  libelle: 'Achats de marchandises',                  type_compte: 'charge',  sens_normal: 'D', compte_parent: null,  niveau: 3 },
  { compte: '606',  libelle: 'Achats non stockés (fournitures)',        type_compte: 'charge',  sens_normal: 'D', compte_parent: null,  niveau: 3 },
  { compte: '607',  libelle: 'Achats (services et prestations)',        type_compte: 'charge',  sens_normal: 'D', compte_parent: null,  niveau: 3 },
  { compte: '6131', libelle: 'Loyers',                                  type_compte: 'charge',  sens_normal: 'D', compte_parent: '613', niveau: 4 },
  { compte: '6160', libelle: 'Assurances',                              type_compte: 'charge',  sens_normal: 'D', compte_parent: '616', niveau: 4 },
  { compte: '6221', libelle: 'Honoraires comptables',                   type_compte: 'charge',  sens_normal: 'D', compte_parent: '622', niveau: 4 },
  { compte: '6261', libelle: 'Téléphone et internet',                   type_compte: 'charge',  sens_normal: 'D', compte_parent: '626', niveau: 4 },
  { compte: '6271', libelle: 'Frais bancaires',                         type_compte: 'charge',  sens_normal: 'D', compte_parent: '627', niveau: 4 },
  { compte: '6411', libelle: 'Salaires et appointements bruts',         type_compte: 'charge',  sens_normal: 'D', compte_parent: '641', niveau: 4 },
  { compte: '6451', libelle: 'CSG patronale',                           type_compte: 'charge',  sens_normal: 'D', compte_parent: '645', niveau: 4 },
  { compte: '661',  libelle: 'Intérêts bancaires',                      type_compte: 'charge',  sens_normal: 'D', compte_parent: null,  niveau: 3 },
  { compte: '666',  libelle: 'Pertes de change',                        type_compte: 'charge',  sens_normal: 'D', compte_parent: null,  niveau: 3 },

  // ── Classe 7 : Produits ────────────────────────────────────────────────
  { compte: '701',  libelle: 'Ventes de marchandises',                  type_compte: 'produit', sens_normal: 'C', compte_parent: null,  niveau: 3 },
  { compte: '706',  libelle: 'Prestations de services',                 type_compte: 'produit', sens_normal: 'C', compte_parent: null,  niveau: 3 },
  { compte: '708',  libelle: 'Produits accessoires',                    type_compte: 'produit', sens_normal: 'C', compte_parent: null,  niveau: 3 },
  { compte: '766',  libelle: 'Gains de change',                         type_compte: 'produit', sens_normal: 'C', compte_parent: null,  niveau: 3 },
]

/**
 * Retourne la liste des comptes essentiels à seeder pour la société donnée.
 * À utiliser avec un UPSERT sur ON CONFLICT (compte) DO NOTHING — la migration
 * 202 a déjà inséré le canonique global (UNIQUE(compte)).
 */
export function getSeedPlanComptable(): SeedAccount[] {
  return PCM_ESSENTIEL
}
