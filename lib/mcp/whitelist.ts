/**
 * Whitelist des tables Lexora exposées au serveur MCP via /api/mcp/query.
 *
 * Pour ajouter une table :
 *   1. Vérifier qu'elle a bien un scope `societe_id` (ou la flagger sans scope)
 *   2. Définir les colonnes par défaut (éviter d'exposer des champs sensibles)
 *   3. Définir un ordre par défaut (souvent created_at desc ou date desc)
 *
 * Toute table NON whitelistée renvoie 403 sur /api/mcp/query.
 */

export interface MCPTableConfig {
  domain: 'compta' | 'paie' | 'banque' | 'tiers' | 'docs' | 'system' | 'fiscal' | 'gbc'
  description: string
  /** Si true (défaut), societe_id est obligatoire ET vérifié via assertSocieteAccess */
  scoped_by_societe?: boolean
  /** Colonnes retournées si client n'en demande pas. Défaut '*' */
  default_columns?: string
  /** Colonne pour order_by par défaut (ordre DESC) */
  default_order_by?: string
}

/** Tables NON scopées par societe_id (référentiels globaux). */
const TABLES_GLOBALES = new Set<string>([
  'plan_comptable_pcm',
  'taux_change',
  'jours_feries_mu',
  'devises_iso',
])

export const MCP_TABLE_WHITELIST: Record<string, MCPTableConfig> = {
  // ─── Compta — Écritures & Journal ──────────────────────────────────
  ecritures_comptables_v2: {
    domain: 'compta',
    description: 'Journal général V2 — toutes les écritures comptables (AC, VTE, BNQ, OD, SAL, OD-PAIE, OD-TIERS...). Filtrer par journal, numero_compte, date_ecriture, ref_folio, lettre.',
    default_columns: 'id, date_ecriture, journal, ref_folio, numero_piece, numero_compte, nom_compte, libelle, debit_mur, credit_mur, lettre, date_lettrage, facture_id, exercice',
    default_order_by: 'date_ecriture',
  },
  comptes_courants_associes: {
    domain: 'compta',
    description: 'Comptes courants d\'associés (CCA) : nom, solde, dernier mouvement.',
    default_order_by: 'updated_at',
  },
  comptes_paiement_tiers: {
    domain: 'compta',
    description: 'Whitelist des comptes de paiement tiers (associés, sociétés liées, exploitant) pour les règlements hors banque.',
    default_order_by: 'created_at',
  },
  dossiers: {
    domain: 'compta',
    description: 'Dossiers comptables par société (1 dossier par société, lie les écritures à un exercice).',
    default_order_by: 'created_at',
  },
  exercices: {
    domain: 'compta',
    description: 'Exercices fiscaux mauriciens (Jul-Jun). Statut clôturé / ouvert, dates début/fin.',
    default_order_by: 'date_debut',
  },
  rapprochements_bancaires: {
    domain: 'compta',
    description: 'Sessions de rapprochement bancaire validées par période.',
    default_order_by: 'periode_debut',
  },
  rapprochement_audit_log: {
    domain: 'compta',
    description: 'Audit trail des actions de rapprochement (lettrer_manuel, classer, regler_hors_banque, déletrer).',
    default_order_by: 'created_at',
  },
  cloture_snapshots: {
    domain: 'compta',
    description: 'Snapshots figés des comptes à la clôture annuelle (utilisés pour N-1).',
    default_order_by: 'created_at',
  },

  // ─── Factures & Paiements ──────────────────────────────────────────
  factures: {
    domain: 'compta',
    description: 'Factures clients et fournisseurs. Filtrer par type_facture, statut, dates, tiers.',
    default_columns: 'id, numero_facture, type_facture, tiers, statut, date_facture, date_echeance, montant_ht, montant_tva, montant_ttc, montant_mur, devise, solde_non_paye, description, rapproche_date',
    default_order_by: 'date_facture',
  },
  factures_paiements: {
    domain: 'compta',
    description: 'Paiements partiels ou complets enregistrés sur les factures.',
    default_order_by: 'date_paiement',
  },
  factures_contacts: {
    domain: 'tiers',
    description: 'Annuaire des tiers (clients/fournisseurs) avec NIF, RC, adresse, etc.',
    default_order_by: 'nom',
  },
  tiers_annuaire: {
    domain: 'tiers',
    description: 'Annuaire centralisé des tiers (registre partagé inter-sociétés).',
    default_order_by: 'nom',
  },

  // ─── Banque ────────────────────────────────────────────────────────
  comptes_bancaires: {
    domain: 'banque',
    description: 'Comptes bancaires d\'une société (banque, IBAN, devise, solde, compte_comptable).',
    default_order_by: 'created_at',
  },
  releves_bancaires: {
    domain: 'banque',
    description: 'Relevés bancaires importés (avec transactions_json contenant toutes les transactions).',
    default_columns: 'id, compte_bancaire_id, periode, date_debut, date_fin, solde_ouverture, solde_cloture, nb_transactions, superseded_by_id, created_at',
    default_order_by: 'date_fin',
  },
  transactions_bancaires: {
    domain: 'banque',
    description: 'Table normalisée des transactions bancaires extraites des relevés.',
    default_order_by: 'date_transaction',
  },
  ai_bank_extraction_logs: {
    domain: 'banque',
    description: 'Logs d\'extraction AI sur les PDF de relevés bancaires.',
    default_order_by: 'created_at',
  },

  // ─── RH — Employés & Paie ─────────────────────────────────────────
  employes: {
    domain: 'paie',
    description: 'Employés actifs et inactifs d\'une société.',
    default_columns: 'id, code, nom, prenom, statut, role, date_entree, date_depart, salaire_base, departement_id, bureau_id, email, telephone',
    default_order_by: 'nom',
  },
  bulletins_paie: {
    domain: 'paie',
    description: 'Bulletins de paie (mensuels + solde tout compte). Filtrer par periode, employe_id, statut, is_archived.',
    default_columns: 'id, employe_id, periode, type_bulletin, statut, source, verrouille, comptabilise, salaire_base, salaire_brut, salaire_net, heures_sup_montant, special_allowance_1, special_allowance_2, special_allowance_3, departure_notice, csg_salarie, csg_patronal, nsf_salarie, nsf_patronal, paye, prgf, training_levy, montant_ul, montant_absence, is_archived',
    default_order_by: 'periode',
  },
  contrats: {
    domain: 'paie',
    description: 'Contrats employés actifs (CDI, CDD, freelance...).',
    default_order_by: 'date_debut',
  },
  conges: {
    domain: 'paie',
    description: 'Demandes et soldes de congés. Filtrer par employe_id, statut, type.',
    default_order_by: 'date_debut',
  },
  types_conges: {
    domain: 'paie',
    description: 'Référentiel des types de congés (annuel, maladie, maternité, paternité, sans solde...).',
    default_order_by: 'code',
  },
  pointages: {
    domain: 'paie',
    description: 'Pointages quotidiens (heures d\'entrée/sortie, retards, absences).',
    default_order_by: 'date_pointage',
  },
  heures_sup: {
    domain: 'paie',
    description: 'Saisies d\'heures supplémentaires par employé et période.',
    default_order_by: 'date',
  },
  primes: {
    domain: 'paie',
    description: 'Primes ponctuelles attribuées aux employés.',
    default_order_by: 'date',
  },
  trajets_km: {
    domain: 'paie',
    description: 'Trajets kilométriques déclarés par les employés.',
    default_order_by: 'date',
  },
  frais_km: {
    domain: 'paie',
    description: 'Frais kilométriques remboursés (consolidés mensuels).',
    default_order_by: 'periode',
  },
  plannings: {
    domain: 'paie',
    description: 'Plannings d\'équipe publiés par période.',
    default_order_by: 'periode',
  },
  shifts: {
    domain: 'paie',
    description: 'Shifts attribués aux employés (planning détaillé).',
    default_order_by: 'date',
  },
  departements: {
    domain: 'paie',
    description: 'Départements (cuisine, salle, etc.) — sous-structure de la société.',
    default_order_by: 'nom',
  },
  bureaux: {
    domain: 'paie',
    description: 'Bureaux/sites physiques de travail.',
    default_order_by: 'nom',
  },
  groupes: {
    domain: 'paie',
    description: 'Groupes d\'employés pour gestion managériale.',
    default_order_by: 'nom',
  },
  paie_periodes_lock: {
    domain: 'paie',
    description: 'Verrouillage des périodes de paie (mois clôturés).',
    default_order_by: 'periode',
  },
  paie_audit_log: {
    domain: 'paie',
    description: 'Audit trail des actions de paie (verrouillage, comptabilisation, modifs).',
    default_order_by: 'created_at',
  },
  declarations_mra: {
    domain: 'fiscal',
    description: 'Déclarations MRA mensuelles (PAYE, NSF, CSG, Training Levy, PRGF, TDS).',
    default_order_by: 'periode',
  },
  eoy_bonus: {
    domain: 'paie',
    description: 'Bonus de fin d\'année 13e mois (End of Year Bonus mauricien).',
    default_order_by: 'annee',
  },
  severance: {
    domain: 'paie',
    description: 'Indemnités de licenciement / fin de contrat calculées.',
    default_order_by: 'date_calcul',
  },
  provisions_ias19: {
    domain: 'paie',
    description: 'Provisions IAS 19 — indemnités de départ à la retraite, provisions congés.',
    default_order_by: 'exercice',
  },

  // ─── Documents & Communication ─────────────────────────────────────
  documents: {
    domain: 'docs',
    description: 'Documents importés (PDF factures, relevés, contrats...).',
    default_columns: 'id, nom, type, statut, taille_octets, mime_type, source, created_at, processed_at',
    default_order_by: 'created_at',
  },
  annonces: {
    domain: 'system',
    description: 'Annonces internes publiées aux employés.',
    default_order_by: 'created_at',
  },
  alertes: {
    domain: 'system',
    description: 'Alertes financières et conformité actives.',
    default_order_by: 'created_at',
  },
  compliance_alerts: {
    domain: 'system',
    description: 'Alertes de conformité réglementaire (MRA, FSC...).',
    default_order_by: 'created_at',
  },
  echeances: {
    domain: 'fiscal',
    description: 'Échéances fiscales et déclaratives à venir.',
    default_order_by: 'date_echeance',
  },

  // ─── Sociétés & Tiers ──────────────────────────────────────────────
  societes: {
    domain: 'system',
    description: 'Sociétés (toutes accessibles par le user via user_societes). Pas de filtre societe_id (la table EST societe).',
    scoped_by_societe: false,
    default_columns: 'id, nom, raison_sociale, brn, vat_number, type_societe, regime_fiscal, devise, date_creation',
    default_order_by: 'nom',
  },

  // ─── GBC (Global Business Companies) ──────────────────────────────
  gbc_substance_indicators: {
    domain: 'gbc',
    description: 'Indicateurs de substance CIGA pour Global Business Companies.',
    default_order_by: 'periode',
  },
  gbc_beneficial_owners: {
    domain: 'gbc',
    description: 'Beneficial Owners déclarés pour les structures GBC.',
    default_order_by: 'updated_at',
  },
  gbc_crs_fatca: {
    domain: 'gbc',
    description: 'Reporting CRS / FATCA pour structures GBC.',
    default_order_by: 'periode',
  },
  gbc_pillar_two: {
    domain: 'gbc',
    description: 'Calculs Pillar Two GloBE pour GBC.',
    default_order_by: 'exercice',
  },

  // ─── Système ───────────────────────────────────────────────────────
  user_societes: {
    domain: 'system',
    description: 'Associations user ↔ société (qui voit quoi).',
    scoped_by_societe: false,
    default_order_by: 'created_at',
  },

  // ─── Référentiels globaux ──────────────────────────────────────────
  plan_comptable_pcm: {
    domain: 'compta',
    description: 'Plan Comptable Mauricien (PCM) — référentiel global des comptes.',
    scoped_by_societe: false,
    default_order_by: 'numero_compte',
  },
  taux_change: {
    domain: 'compta',
    description: 'Taux de change historiques (BoM officiel + fallback).',
    scoped_by_societe: false,
    default_order_by: 'date',
  },
  jours_feries_mu: {
    domain: 'system',
    description: 'Jours fériés mauriciens par année.',
    scoped_by_societe: false,
    default_order_by: 'date',
  },
}

export function isTableScopedBySociete(table: string): boolean {
  const cfg = MCP_TABLE_WHITELIST[table]
  if (!cfg) return false
  return cfg.scoped_by_societe !== false // défaut true sauf si explicitement false
}
