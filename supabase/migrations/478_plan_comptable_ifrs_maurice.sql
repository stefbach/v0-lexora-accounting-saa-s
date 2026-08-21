-- =============================================================================
-- Migration 478 — Plan comptable cible IFRS Maurice (classification par poste
-- des états financiers) + table de correspondance ancien PCG -> nouveau compte
--
-- Contexte : le plan_comptable actuel (mig 018/144/166/202) est un plan numéroté
-- façon PCG français (classes 1-7, codes 4 chiffres). Cette migration N'ALTÈRE
-- PAS plan_comptable ni ecritures_comptables_v2 — elle ajoute une couche de
-- classification IFRS (SOFP/SOCI) en parallèle, avec une table de correspondance
-- explicite pour ne perdre aucune écriture historique lors d'une future bascule.
--
-- Portée : proposition de structure + seed. L'exécution effective d'un
-- UPDATE de masse sur ecritures_comptables_v2.numero_compte n'est PAS incluse
-- ici et devra faire l'objet d'une migration dédiée, revue séparément (règle
-- CLAUDE.md : pas de DDL/DML de masse sans confirmation explicite).
--
-- Référence : supabase/docs/schema/03-plan-comptable.md,
--             .claude/skills/lexora-gbc-ifrs-complete/SKILL.md
-- =============================================================================

-- ============================================================
-- 1. Table comptes_ifrs — plan comptable cible par poste IFRS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.comptes_ifrs (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- societe_id NULL = compte du template global partagé entre sociétés.
  -- Une société peut surcharger/étendre avec ses propres lignes (societe_id renseigné).
  societe_id             UUID REFERENCES public.societes(id) ON DELETE CASCADE,
  code_interne           VARCHAR(40) NOT NULL,
  libelle                TEXT NOT NULL,
  categorie_ifrs         VARCHAR(30) NOT NULL CHECK (categorie_ifrs IN (
                             'actif_courant', 'actif_non_courant',
                             'passif_courant', 'passif_non_courant',
                             'capitaux_propres', 'produits', 'charges'
                           )),
  sous_categorie         VARCHAR(50) NOT NULL,
  -- Poste de rattachement dans l'état financier (IAS 1 §54 pour le SOFP,
  -- §82 pour le SOCI). Convention : "SOFP.<Section>.<Poste>" / "SOCI.<Section>.<Poste>".
  poste_etat_financier   VARCHAR(80) NOT NULL,
  sens_normal            CHAR(1) NOT NULL CHECK (sens_normal IN ('D', 'C')),
  -- TRUE = compte contra (ex: amortissements cumulés, crédit d'impôt appliqué) :
  -- se nette contre les comptes bruts de la même categorie_ifrs pour le calcul
  -- de la valeur nette au SOFP/SOCI plutôt que de s'additionner.
  est_contra             BOOLEAN NOT NULL DEFAULT FALSE,
  -- Identifiabilité MRA (PAYE/NSF/CSG/PRGF/Training Levy/TVA) — exigence explicite
  -- du besoin métier : ces comptes doivent rester repérables individuellement
  -- pour les déclarations MRA même après reclassification IFRS.
  est_mra_compte         BOOLEAN NOT NULL DEFAULT FALSE,
  type_mra               VARCHAR(20) CHECK (
                             type_mra IS NULL OR
                             type_mra IN ('PAYE', 'NSF', 'CSG', 'PRGF', 'TRAINING_LEVY', 'TVA')
                           ),
  -- Traçabilité : code PCG d'origine (supabase/docs/schema/03-plan-comptable.md),
  -- NULL si le compte est une création IFRS pure (ex: IFRS 16, CTA, PER GBC)
  -- sans équivalent PCG historique.
  ancien_code_pcg        VARCHAR(10),
  devise                 VARCHAR(3) NOT NULL DEFAULT 'MUR',
  actif                  BOOLEAN NOT NULL DEFAULT TRUE,
  est_analytique         BOOLEAN NOT NULL DEFAULT FALSE,
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (societe_id, code_interne),
  UNIQUE (code_interne)
);

CREATE INDEX IF NOT EXISTS idx_comptes_ifrs_categorie ON public.comptes_ifrs(categorie_ifrs);
CREATE INDEX IF NOT EXISTS idx_comptes_ifrs_sous_categorie ON public.comptes_ifrs(sous_categorie);
CREATE INDEX IF NOT EXISTS idx_comptes_ifrs_mra ON public.comptes_ifrs(est_mra_compte) WHERE est_mra_compte;
CREATE INDEX IF NOT EXISTS idx_comptes_ifrs_ancien_code ON public.comptes_ifrs(ancien_code_pcg);
CREATE INDEX IF NOT EXISTS idx_comptes_ifrs_societe ON public.comptes_ifrs(societe_id);

ALTER TABLE public.comptes_ifrs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comptes_ifrs_auth" ON public.comptes_ifrs
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- 2. Table plan_comptable_migration_map — correspondance PCG -> IFRS
--    Lecture seule ici : sert de référence pour une future migration
--    d'écritures (UPDATE ecritures_comptables_v2 SET numero_compte = ...),
--    non exécutée dans cette migration.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.plan_comptable_migration_map (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ancien_code_pcg     VARCHAR(10) NOT NULL,
  code_interne_ifrs   VARCHAR(40) NOT NULL REFERENCES public.comptes_ifrs(code_interne),
  -- FALSE = mapping ambigu (compte parent PCG à 3 chiffres couvrant plusieurs
  -- enfants 4 chiffres, ex: 421, 431, 432) : à qualifier manuellement au cas
  -- par cas avant toute réécriture de masse, ne jamais auto-appliquer.
  mapping_sans_ambiguite BOOLEAN NOT NULL DEFAULT TRUE,
  commentaire         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ancien_code_pcg)
);

ALTER TABLE public.plan_comptable_migration_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan_comptable_migration_map_auth" ON public.plan_comptable_migration_map
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- 3. Seed — comptes_ifrs (template global, societe_id NULL)
-- ============================================================
INSERT INTO public.comptes_ifrs
  (code_interne, libelle, categorie_ifrs, sous_categorie, poste_etat_financier, sens_normal, est_contra, est_mra_compte, type_mra, ancien_code_pcg, devise)
VALUES
  -- ───────── ACTIFS COURANTS ─────────
  ('TRE-BANQUE-MUR',          'Banque — compte courant MUR',                    'actif_courant',     'tresorerie_equivalents',        'SOFP.ActifsCourants.TresorerieEtEquivalents', 'D', FALSE, FALSE, NULL,   '5121', 'MUR'),
  ('TRE-BANQUE-EUR',          'Banque — compte courant EUR',                    'actif_courant',     'tresorerie_equivalents',        'SOFP.ActifsCourants.TresorerieEtEquivalents', 'D', FALSE, FALSE, NULL,   '5122', 'EUR'),
  ('TRE-BANQUE-USD',          'Banque — compte courant USD',                    'actif_courant',     'tresorerie_equivalents',        'SOFP.ActifsCourants.TresorerieEtEquivalents', 'D', FALSE, FALSE, NULL,   '5123', 'USD'),
  ('TRE-VIREMENTS-TRANSIT',   'Virements internes en transit',                  'actif_courant',     'tresorerie_equivalents',        'SOFP.ActifsCourants.TresorerieEtEquivalents', 'D', FALSE, FALSE, NULL,   '580',  'MUR'),
  ('CLI-COMMERCIAUX',         'Clients — comptes commerciaux',                  'actif_courant',     'clients_et_autres_creances',    'SOFP.ActifsCourants.ClientsEtAutresCreances', 'D', FALSE, FALSE, NULL,   '411',  'MUR'),
  ('PERS-AVANCES',            'Avances et acomptes au personnel',               'actif_courant',     'clients_et_autres_creances',    'SOFP.ActifsCourants.ClientsEtAutresCreances', 'D', FALSE, FALSE, NULL,   '4250', 'MUR'),
  ('TVA-DEDUCTIBLE',          'TVA déductible sur achats',                      'actif_courant',     'autres_actifs_courants',        'SOFP.ActifsCourants.AutresActifsCourants',    'D', FALSE, TRUE,  'TVA',  '4456', 'MUR'),
  ('INTERCO-TIERS-DIVERS',    'Tiers divers — inter-sociétés',                  'actif_courant',     'autres_actifs_courants',        'SOFP.ActifsCourants.AutresActifsCourants',    'D', FALSE, FALSE, NULL,   '4670', 'MUR'),
  ('ATTENTE-A-RECLASSER',     'Comptes d''attente à reclasser',                 'actif_courant',     'autres_actifs_courants',        'SOFP.ActifsCourants.AutresActifsCourants',    'D', FALSE, FALSE, NULL,   '4710', 'MUR'),

  -- ───────── ACTIFS NON COURANTS ─────────
  ('IMMO-INSTALLATIONS',      'Installations générales, agencements',           'actif_non_courant', 'immobilisations_corporelles',   'SOFP.ActifsNonCourants.ImmobilisationsCorporelles', 'D', FALSE, FALSE, NULL, '2181', 'MUR'),
  ('IMMO-MATERIEL-INFORMATIQUE','Matériel de bureau et informatique',           'actif_non_courant', 'immobilisations_corporelles',   'SOFP.ActifsNonCourants.ImmobilisationsCorporelles', 'D', FALSE, FALSE, NULL, '2183', 'MUR'),
  ('IMMO-MOBILIER-BUREAU',    'Mobilier de bureau',                             'actif_non_courant', 'immobilisations_corporelles',   'SOFP.ActifsNonCourants.ImmobilisationsCorporelles', 'D', FALSE, FALSE, NULL, '2184', 'MUR'),
  ('AMORT-INSTALLATIONS',     'Amortissement cumulé — installations',           'actif_non_courant', 'immobilisations_corporelles',   'SOFP.ActifsNonCourants.ImmobilisationsCorporelles', 'C', TRUE,  FALSE, NULL, '2815', 'MUR'),
  ('AMORT-AUTRES-IMMO',       'Amortissement cumulé — autres immobilisations',  'actif_non_courant', 'immobilisations_corporelles',   'SOFP.ActifsNonCourants.ImmobilisationsCorporelles', 'C', TRUE,  FALSE, NULL, '2818', 'MUR'),
  ('ROU-ASSET',               'Droit d''utilisation — actifs loués (IFRS 16)',  'actif_non_courant', 'droit_utilisation_actifs',      'SOFP.ActifsNonCourants.DroitsUtilisationActifs',    'D', FALSE, FALSE, NULL, NULL,   'MUR'),
  ('AMORT-ROU',               'Amortissement cumulé — droit d''utilisation',    'actif_non_courant', 'droit_utilisation_actifs',      'SOFP.ActifsNonCourants.DroitsUtilisationActifs',    'C', TRUE,  FALSE, NULL, NULL,   'MUR'),

  -- ───────── PASSIFS COURANTS ─────────
  ('FRS-COMMERCIAUX',         'Fournisseurs — comptes commerciaux',             'passif_courant',    'fournisseurs_et_charges_a_payer','SOFP.PassifsCourants.FournisseursEtAutresDettes',   'C', FALSE, FALSE, NULL,   '401',  'MUR'),
  ('PERS-SALAIRES-NETS',      'Salaires nets à payer',                          'passif_courant',    'fournisseurs_et_charges_a_payer','SOFP.PassifsCourants.FournisseursEtAutresDettes',   'C', FALSE, FALSE, NULL,   '4210', 'MUR'),
  ('PERS-PRIMES-A-PAYER',     'Primes et gratifications à payer',               'passif_courant',    'fournisseurs_et_charges_a_payer','SOFP.PassifsCourants.FournisseursEtAutresDettes',   'C', FALSE, FALSE, NULL,   '4211', 'MUR'),
  ('PERS-13EME-MOIS-A-PAYER', '13e mois à payer (EOY Bonus)',                   'passif_courant',    'fournisseurs_et_charges_a_payer','SOFP.PassifsCourants.FournisseursEtAutresDettes',   'C', FALSE, FALSE, NULL,   '4212', 'MUR'),
  ('PERS-NOTES-FRAIS',        'Notes de frais à rembourser',                    'passif_courant',    'fournisseurs_et_charges_a_payer','SOFP.PassifsCourants.FournisseursEtAutresDettes',   'C', FALSE, FALSE, NULL,   '4280', 'MUR'),
  ('MRA-CSG-SALARIE',         'CSG salarié à verser — MRA',                     'passif_courant',    'dettes_fiscales_et_sociales',   'SOFP.PassifsCourants.DettesFiscalesEtSociales',    'C', FALSE, TRUE,  'CSG',  '4311', 'MUR'),
  ('MRA-NSF-SALARIE',         'NSF salarié à verser — MRA',                     'passif_courant',    'dettes_fiscales_et_sociales',   'SOFP.PassifsCourants.DettesFiscalesEtSociales',    'C', FALSE, TRUE,  'NSF',  '4312', 'MUR'),
  ('MRA-CSG-PATRONAL',        'CSG patronal à verser — MRA',                    'passif_courant',    'dettes_fiscales_et_sociales',   'SOFP.PassifsCourants.DettesFiscalesEtSociales',    'C', FALSE, TRUE,  'CSG',  '4321', 'MUR'),
  ('MRA-NSF-PATRONAL',        'NSF patronal à verser — MRA',                    'passif_courant',    'dettes_fiscales_et_sociales',   'SOFP.PassifsCourants.DettesFiscalesEtSociales',    'C', FALSE, TRUE,  'NSF',  '4322', 'MUR'),
  ('MRA-PRGF',                'PRGF à verser — MRA',                            'passif_courant',    'dettes_fiscales_et_sociales',   'SOFP.PassifsCourants.DettesFiscalesEtSociales',    'C', FALSE, TRUE,  'PRGF', '4323', 'MUR'),
  ('MRA-TRAINING-LEVY',       'Training Levy HRDC à verser — MRA',              'passif_courant',    'dettes_fiscales_et_sociales',   'SOFP.PassifsCourants.DettesFiscalesEtSociales',    'C', FALSE, TRUE,  'TRAINING_LEVY', '4324', 'MUR'),
  ('MRA-PAYE',                'PAYE à reverser — MRA',                          'passif_courant',    'dettes_fiscales_et_sociales',   'SOFP.PassifsCourants.DettesFiscalesEtSociales',    'C', FALSE, TRUE,  'PAYE', '4330', 'MUR'),
  ('TVA-A-DECAISSER',         'TVA à décaisser',                                'passif_courant',    'dettes_fiscales_et_sociales',   'SOFP.PassifsCourants.DettesFiscalesEtSociales',    'C', FALSE, TRUE,  'TVA',  '4455', 'MUR'),
  ('TVA-COLLECTEE',           'TVA collectée sur ventes',                       'passif_courant',    'dettes_fiscales_et_sociales',   'SOFP.PassifsCourants.DettesFiscalesEtSociales',    'C', FALSE, TRUE,  'TVA',  '4457', 'MUR'),
  ('MRA-ATTENTE-DIVERS',      'MRA — impôts et taxes divers (attente)',         'passif_courant',    'dettes_fiscales_et_sociales',   'SOFP.PassifsCourants.DettesFiscalesEtSociales',    'C', FALSE, TRUE,  NULL,   '4471', 'MUR'),
  ('CCA-ASSOCIES',            'Comptes courants associés',                      'passif_courant',    'fournisseurs_et_charges_a_payer','SOFP.PassifsCourants.FournisseursEtAutresDettes',   'C', FALSE, FALSE, NULL,   '4550', 'MUR'),
  ('LEASE-LIABILITY-CT',      'Dette locative — part courante (IFRS 16)',       'passif_courant',    'dettes_locatives',              'SOFP.PassifsCourants.PartCouranteDettesLocatives', 'C', FALSE, FALSE, NULL,   NULL,   'MUR'),

  -- ───────── PASSIFS NON COURANTS ─────────
  ('LEASE-LIABILITY-LT',      'Dette locative — part non courante (IFRS 16)',   'passif_non_courant','dettes_locatives',              'SOFP.PassifsNonCourants.DettesLocativesNonCourantes','C', FALSE, FALSE, NULL, NULL,   'MUR'),
  ('EMPRUNTS-BANCAIRES',      'Emprunts bancaires',                             'passif_non_courant','emprunts_et_dettes_financieres','SOFP.PassifsNonCourants.EmpruntsEtDettesFinancieres', 'C', FALSE, FALSE, NULL, '1640', 'MUR'),

  -- ───────── CAPITAUX PROPRES ─────────
  ('CAP-SOCIAL',              'Capital social',                                 'capitaux_propres',  'capital_social',                'SOFP.CapitauxPropres.CapitalEmis',                 'C', FALSE, FALSE, NULL,   '1010', 'MUR'),
  ('RES-LEGALE',              'Réserve légale',                                 'capitaux_propres',  'reserves',                       'SOFP.CapitauxPropres.Reserves',                    'C', FALSE, FALSE, NULL,   '1061', 'MUR'),
  ('RES-AUTRES',              'Autres réserves',                                'capitaux_propres',  'reserves',                       'SOFP.CapitauxPropres.Reserves',                    'C', FALSE, FALSE, NULL,   '1068', 'MUR'),
  ('RAN-REPORT-A-NOUVEAU',    'Report à nouveau',                               'capitaux_propres',  'resultat_non_distribue',        'SOFP.CapitauxPropres.ResultatsNonDistribues',      'C', FALSE, FALSE, NULL,   '1190', 'MUR'),
  ('RESULTAT-EXERCICE',       'Résultat de l''exercice',                        'capitaux_propres',  'resultat_non_distribue',        'SOFP.CapitauxPropres.ResultatsNonDistribues',      'C', FALSE, FALSE, NULL,   '1200', 'MUR'),
  ('CTA-ECART-CONVERSION',    'Écart de conversion cumulé (IAS 21 OCI)',        'capitaux_propres',  'autres_elements_resultat_global','SOFP.CapitauxPropres.AutresElementsResultatGlobalCumules', 'C', FALSE, FALSE, NULL, NULL, 'MUR'),

  -- ───────── PRODUITS ─────────
  ('PROD-VENTES-MARCHANDISES','Ventes de marchandises',                         'produits',           'chiffre_affaires',              'SOCI.Produits.ChiffreAffaires',                    'C', FALSE, FALSE, NULL,   '701',  'MUR'),
  ('PROD-PRESTATIONS-SERVICES','Prestations de services',                       'produits',           'chiffre_affaires',              'SOCI.Produits.ChiffreAffaires',                    'C', FALSE, FALSE, NULL,   '706',  'MUR'),
  ('PROD-ACCESSOIRES',        'Produits accessoires',                           'produits',           'autres_produits_operationnels', 'SOCI.Produits.AutresProduitsOperationnels',        'C', FALSE, FALSE, NULL,   '708',  'MUR'),
  ('PROD-PRODUCTION-STOCKEE', 'Production stockée',                             'produits',           'autres_produits_operationnels', 'SOCI.Produits.AutresProduitsOperationnels',        'C', FALSE, FALSE, NULL,   '7131', 'MUR'),
  ('PROD-COMMISSIONS-RECUES', 'Commissions reçues',                             'produits',           'autres_produits_operationnels', 'SOCI.Produits.AutresProduitsOperationnels',        'C', FALSE, FALSE, NULL,   '753',  'MUR'),
  ('PROD-GAINS-CHANGE',       'Gains de change',                                'produits',           'produits_financiers',           'SOCI.Produits.ProduitsFinanciers',                 'C', FALSE, FALSE, NULL,   '766',  'MUR'),
  ('PROD-EXCEPTIONNELS',      'Produits exceptionnels',                         'produits',           'autres_produits_operationnels', 'SOCI.Produits.AutresChargesEtProduitsNonRecurrents','C', FALSE, FALSE, NULL,   '771',  'MUR'),

  -- ───────── CHARGES ─────────
  ('CHG-ACHATS-MARCHANDISES', 'Achats de marchandises',                         'charges',            'achats_et_charges_externes',    'SOCI.Charges.AchatsEtChargesExternes',             'D', FALSE, FALSE, NULL,   '601',  'MUR'),
  ('CHG-FOURNITURES-NON-STOCKEES','Fournitures non stockées',                   'charges',            'achats_et_charges_externes',    'SOCI.Charges.AchatsEtChargesExternes',             'D', FALSE, FALSE, NULL,   '606',  'MUR'),
  ('CHG-ACHATS-SERVICES',     'Achats de services et prestations',              'charges',            'achats_et_charges_externes',    'SOCI.Charges.AchatsEtChargesExternes',             'D', FALSE, FALSE, NULL,   '607',  'MUR'),
  ('CHG-SOUS-TRAITANCE',      'Sous-traitance',                                 'charges',            'achats_et_charges_externes',    'SOCI.Charges.AchatsEtChargesExternes',             'D', FALSE, FALSE, NULL,   '611',  'MUR'),
  ('CHG-LOYERS',              'Loyers (baux courts termes / faible valeur — hors IFRS 16)', 'charges', 'achats_et_charges_externes',    'SOCI.Charges.AchatsEtChargesExternes',             'D', FALSE, FALSE, NULL,   '6131', 'MUR'),
  ('CHG-CHARGES-LOCATIVES',   'Charges locatives',                              'charges',            'achats_et_charges_externes',    'SOCI.Charges.AchatsEtChargesExternes',             'D', FALSE, FALSE, NULL,   '6135', 'MUR'),
  ('CHG-ENTRETIEN-REPARATIONS','Entretien et réparations',                      'charges',            'achats_et_charges_externes',    'SOCI.Charges.AchatsEtChargesExternes',             'D', FALSE, FALSE, NULL,   '6151', 'MUR'),
  ('CHG-ASSURANCES',          'Assurances',                                     'charges',            'achats_et_charges_externes',    'SOCI.Charges.AchatsEtChargesExternes',             'D', FALSE, FALSE, NULL,   '6160', 'MUR'),
  ('CHG-HONORAIRES-COMPTABLES','Honoraires comptables',                         'charges',            'achats_et_charges_externes',    'SOCI.Charges.AchatsEtChargesExternes',             'D', FALSE, FALSE, NULL,   '6221', 'MUR'),
  ('CHG-HONORAIRES-JURIDIQUES','Honoraires juridiques',                         'charges',            'achats_et_charges_externes',    'SOCI.Charges.AchatsEtChargesExternes',             'D', FALSE, FALSE, NULL,   '6225', 'MUR'),
  ('CHG-PUBLICITE-MARKETING', 'Publicité et marketing',                         'charges',            'achats_et_charges_externes',    'SOCI.Charges.AchatsEtChargesExternes',             'D', FALSE, FALSE, NULL,   '623',  'MUR'),
  ('CHG-FRAIS-DEPLACEMENT',   'Frais de déplacement',                           'charges',            'achats_et_charges_externes',    'SOCI.Charges.AchatsEtChargesExternes',             'D', FALSE, FALSE, NULL,   '6251', 'MUR'),
  ('CHG-MISSIONS-RECEPTIONS', 'Missions et réceptions',                         'charges',            'achats_et_charges_externes',    'SOCI.Charges.AchatsEtChargesExternes',             'D', FALSE, FALSE, NULL,   '6256', 'MUR'),
  ('CHG-TELEPHONE-INTERNET',  'Téléphone et internet',                          'charges',            'achats_et_charges_externes',    'SOCI.Charges.AchatsEtChargesExternes',             'D', FALSE, FALSE, NULL,   '6261', 'MUR'),
  ('CHG-FRAIS-BANCAIRES',     'Frais bancaires',                                'charges',            'charges_financieres',           'SOCI.Charges.ChargesFinancieres',                  'D', FALSE, FALSE, NULL,   '6271', 'MUR'),
  ('CHG-COMMISSIONS-SWIFT',   'Commissions bancaires (SWIFT)',                  'charges',            'charges_financieres',           'SOCI.Charges.ChargesFinancieres',                  'D', FALSE, FALSE, NULL,   '6272', 'MUR'),
  ('CHG-CHARGES-EXTERNES-DIVERSES','Charges externes diverses',                 'charges',            'achats_et_charges_externes',    'SOCI.Charges.AchatsEtChargesExternes',             'D', FALSE, FALSE, NULL,   '628',  'MUR'),
  ('CHG-DROITS-TIMBRE',       'Droits de timbre',                               'charges',            'achats_et_charges_externes',    'SOCI.Charges.AchatsEtChargesExternes',             'D', FALSE, FALSE, NULL,   '6351', 'MUR'),
  ('CHG-SALAIRES-BRUTS',      'Salaires et appointements bruts',                'charges',            'charges_de_personnel',          'SOCI.Charges.ChargesDePersonnel',                  'D', FALSE, FALSE, NULL,   '6411', 'MUR'),
  ('CHG-TRANSPORT-ALLOWANCE', 'Transport allowance',                            'charges',            'charges_de_personnel',          'SOCI.Charges.ChargesDePersonnel',                  'D', FALSE, FALSE, NULL,   '6412', 'MUR'),
  ('CHG-PETROL-ALLOWANCE',    'Petrol allowance',                               'charges',            'charges_de_personnel',          'SOCI.Charges.ChargesDePersonnel',                  'D', FALSE, FALSE, NULL,   '6413', 'MUR'),
  ('CHG-HEURES-SUPPLEMENTAIRES','Heures supplémentaires',                       'charges',            'charges_de_personnel',          'SOCI.Charges.ChargesDePersonnel',                  'D', FALSE, FALSE, NULL,   '6414', 'MUR'),
  ('CHG-PRIMES-GRATIFICATIONS','Primes et gratifications',                      'charges',            'charges_de_personnel',          'SOCI.Charges.ChargesDePersonnel',                  'D', FALSE, FALSE, NULL,   '6415', 'MUR'),
  ('CHG-13EME-MOIS-PROVISION','13e mois — EOY (provision)',                     'charges',            'charges_de_personnel',          'SOCI.Charges.ChargesDePersonnel',                  'D', FALSE, FALSE, NULL,   '6416', 'MUR'),
  ('CHG-INDEMNITES-DEPART',   'Indemnités compensatrices et départ',            'charges',            'charges_de_personnel',          'SOCI.Charges.ChargesDePersonnel',                  'D', FALSE, FALSE, NULL,   '6417', 'MUR'),
  ('CHG-INDEMNITES-PREAVIS',  'Indemnités compensatrices (préavis)',            'charges',            'charges_de_personnel',          'SOCI.Charges.ChargesDePersonnel',                  'D', FALSE, FALSE, NULL,   '6418', 'MUR'),
  ('CHG-AUTRES-REMUNERATIONS','Autres rémunérations',                           'charges',            'charges_de_personnel',          'SOCI.Charges.ChargesDePersonnel',                  'D', FALSE, FALSE, NULL,   '6419', 'MUR'),
  ('CHG-CSG-PATRONALE',       'CSG patronale',                                  'charges',            'charges_de_personnel',          'SOCI.Charges.ChargesDePersonnel',                  'D', FALSE, TRUE,  'CSG',  '6451', 'MUR'),
  ('CHG-NSF-PATRONAL',        'NSF patronal',                                   'charges',            'charges_de_personnel',          'SOCI.Charges.ChargesDePersonnel',                  'D', FALSE, TRUE,  'NSF',  '6452', 'MUR'),
  ('CHG-PRGF',                'PRGF (charge)',                                  'charges',            'charges_de_personnel',          'SOCI.Charges.ChargesDePersonnel',                  'D', FALSE, TRUE,  'PRGF', '6453', 'MUR'),
  ('CHG-TRAINING-LEVY',       'Training Levy HRDC (1%)',                        'charges',            'charges_de_personnel',          'SOCI.Charges.ChargesDePersonnel',                  'D', FALSE, TRUE,  'TRAINING_LEVY', '6454', 'MUR'),
  ('CHG-REDEVANCES-SAAS',     'Redevances licences SaaS',                       'charges',            'achats_et_charges_externes',    'SOCI.Charges.AchatsEtChargesExternes',             'D', FALSE, FALSE, NULL,   '651',  'MUR'),
  ('CHG-INTERETS-BANCAIRES',  'Intérêts bancaires',                             'charges',            'charges_financieres',           'SOCI.Charges.ChargesFinancieres',                  'D', FALSE, FALSE, NULL,   '661',  'MUR'),
  ('CHG-INTERETS-LEASE',      'Charge d''intérêt — dette locative (IFRS 16)',   'charges',            'charges_financieres',           'SOCI.Charges.ChargesFinancieres',                  'D', FALSE, FALSE, NULL,   NULL,   'MUR'),
  ('CHG-PERTES-CHANGE',       'Pertes de change',                               'charges',            'charges_financieres',           'SOCI.Charges.ChargesFinancieres',                  'D', FALSE, FALSE, NULL,   '666',  'MUR'),
  ('CHG-EXCEPTIONNELLES',     'Charges exceptionnelles',                        'charges',            'achats_et_charges_externes',    'SOCI.Charges.AutresChargesEtProduitsNonRecurrents','D', FALSE, FALSE, NULL,   '671',  'MUR'),
  ('CHG-AMORTISSEMENT-ROU',   'Amortissement — droit d''utilisation (IFRS 16)', 'charges',            'dotations_amortissements',      'SOCI.Charges.DotationsAuxAmortissements',          'D', FALSE, FALSE, NULL,   NULL,   'MUR'),
  ('CHG-IMPOT-PER-3PCT',      'Impôt sur les bénéfices — régime PER 3% (GBC)',  'charges',            'impot_sur_le_resultat',         'SOCI.Charges.ImpotSurLeResultat',                  'D', FALSE, FALSE, NULL,   NULL,   'MUR'),
  ('CHG-CREDIT-IMPOT-ETRANGER','Crédit d''impôt étranger appliqué (FTC)',       'charges',            'impot_sur_le_resultat',         'SOCI.Charges.ImpotSurLeResultat',                  'C', TRUE,  FALSE, NULL,   NULL,   'MUR')
ON CONFLICT (code_interne) DO NOTHING;

-- ============================================================
-- 4. Seed — plan_comptable_migration_map
--    Mappings sans ambiguïté (1 code PCG -> 1 code IFRS)
-- ============================================================
INSERT INTO public.plan_comptable_migration_map (ancien_code_pcg, code_interne_ifrs, mapping_sans_ambiguite, commentaire)
SELECT ancien_code_pcg, code_interne, TRUE, 'Mapping direct 1:1 depuis PCM Maurice (03-plan-comptable.md)'
FROM public.comptes_ifrs
WHERE ancien_code_pcg IS NOT NULL
ON CONFLICT (ancien_code_pcg) DO NOTHING;

-- Fallback compte bare '512' (parent PCM, rarement peuplé directement grâce
-- au remap trigger tr_ecritures_remap_pcm) -> compte devise par défaut MUR.
-- '433' est le seul parent 3-digit sans ambiguïté (un seul enfant 4330).
INSERT INTO public.plan_comptable_migration_map (ancien_code_pcg, code_interne_ifrs, mapping_sans_ambiguite, commentaire)
VALUES
  ('512', 'TRE-BANQUE-MUR', TRUE,  'Compte bare 512 (parent) : fallback MUR par défaut, la quasi-totalité des écritures utilisent déjà 5121/5122/5123'),
  ('433', 'MRA-PAYE',       TRUE,  'Parent 3-digit 433 n''a qu''un seul enfant 4330 : mapping sans ambiguïté'),
  ('421', 'PERS-SALAIRES-NETS', FALSE, 'AMBIGU : parent 421 couvre 4210/4211/4212 — qualifier chaque écriture historique avant réécriture, ne pas auto-appliquer'),
  ('431', 'MRA-CSG-SALARIE',    FALSE, 'AMBIGU : parent 431 couvre 4311 (CSG) et 4312 (NSF) — qualifier chaque écriture historique avant réécriture'),
  ('432', 'MRA-CSG-PATRONAL',   FALSE, 'AMBIGU : parent 432 couvre 4321/4322/4323/4324 — qualifier chaque écriture historique avant réécriture')
ON CONFLICT (ancien_code_pcg) DO NOTHING;

-- ============================================================
-- 5. Vue de contrôle — écritures dont le compte PCG n'a pas encore
--    de mapping IFRS enregistré (à combler avant toute bascule)
-- ============================================================
CREATE OR REPLACE VIEW public.v_ecritures_sans_mapping_ifrs AS
SELECT DISTINCT e.numero_compte
FROM public.ecritures_comptables_v2 e
LEFT JOIN public.plan_comptable_migration_map m ON m.ancien_code_pcg = e.numero_compte
WHERE m.ancien_code_pcg IS NULL
ORDER BY 1;

COMMENT ON VIEW public.v_ecritures_sans_mapping_ifrs IS
  'Comptes PCG utilisés dans ecritures_comptables_v2 sans correspondance dans plan_comptable_migration_map. À combler avant toute migration de masse vers comptes_ifrs.';

DO $$
DECLARE
  v_comptes_count INT;
  v_map_count INT;
BEGIN
  SELECT COUNT(*) INTO v_comptes_count FROM public.comptes_ifrs;
  SELECT COUNT(*) INTO v_map_count FROM public.plan_comptable_migration_map;
  RAISE NOTICE 'Migration 478 — comptes_ifrs : % comptes cibles, plan_comptable_migration_map : % correspondances', v_comptes_count, v_map_count;
END $$;
