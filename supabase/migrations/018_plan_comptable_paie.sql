-- =============================================================================
-- Migration 018 — Plan Comptable Mauricien (PCM) — Classes 6/4 charges de personnel
-- + Liaison bulletins_paie → ecritures_comptables (journal OD-PAIE)
-- Finance Act 2024 / WRA 2019 / MRA Guidelines
-- =============================================================================

-- ============================================================
-- 1. Table plan_comptable (si elle n'existe pas)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.plan_comptable (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id       UUID REFERENCES public.societes(id) ON DELETE CASCADE,
  compte           VARCHAR(10) NOT NULL,
  libelle          TEXT NOT NULL,
  classe           SMALLINT GENERATED ALWAYS AS (CAST(LEFT(compte, 1) AS SMALLINT)) STORED,
  type_compte      VARCHAR(20) NOT NULL DEFAULT 'actif',
  -- actif | passif | charge | produit | capitaux
  sens_normal      CHAR(1) NOT NULL DEFAULT 'D',
  -- D=débiteur normal, C=créditeur normal
  compte_parent    VARCHAR(10),
  niveau           SMALLINT NOT NULL DEFAULT 3,
  actif            BOOLEAN NOT NULL DEFAULT TRUE,
  est_analytique   BOOLEAN NOT NULL DEFAULT FALSE,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societe_id, compte),
  UNIQUE(compte) -- compte global partageable entre sociétés
);

ALTER TABLE public.plan_comptable ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan_comptable_auth" ON public.plan_comptable
  USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_plan_compte ON public.plan_comptable(compte);
CREATE INDEX IF NOT EXISTS idx_plan_classe ON public.plan_comptable(classe);
CREATE INDEX IF NOT EXISTS idx_plan_societe ON public.plan_comptable(societe_id);

-- ============================================================
-- 2. Seed — Plan Comptable Mauricien (PCM)
--    Classes 4 (tiers) et 6 (charges) — volet Paie & RH
--    Conforme MIPA (Mauritius Institute of Professional Accountants)
-- ============================================================

-- NB: ON CONFLICT DO NOTHING → safe à réexécuter
INSERT INTO public.plan_comptable (compte, libelle, type_compte, sens_normal, compte_parent, niveau)
VALUES
  -- ───────── CLASSE 4 : COMPTES DE TIERS ─────────
  ('40',    'FOURNISSEURS ET COMPTES RATTACHÉS',    'passif', 'C', NULL, 2),
  ('401',   'Fournisseurs',                          'passif', 'C', '40', 3),
  ('4010',  'Fournisseurs — achats de biens et services', 'passif', 'C', '401', 4),

  ('42',    'PERSONNEL ET COMPTES RATTACHÉS',        'passif', 'C', NULL, 2),
  ('421',   'Personnel — rémunérations dues',        'passif', 'C', '42', 3),
  ('4210',  'Salaires nets à payer',                 'passif', 'C', '421', 4),
  ('4211',  'Primes et gratifications à payer',      'passif', 'C', '421', 4),
  ('4212',  '13ème mois à payer (EOY Bonus)',        'passif', 'C', '421', 4),
  ('422',   'Comités d''entreprise',                 'passif', 'C', '42', 3),
  ('425',   'Personnel — avances et acomptes',       'actif',  'D', '42', 3),
  ('427',   'Personnel — oppositions et saisies',    'passif', 'C', '42', 3),
  ('428',   'Personnel — charges à payer et produits à recevoir', 'passif', 'C', '42', 3),

  ('43',    'SÉCURITÉ SOCIALE ET AUTRES ORGANISMES', 'passif', 'C', NULL, 2),
  ('431',   'CSG/NSF — cotisations salarié',         'passif', 'C', '43', 3),
  ('4311',  'CSG salarié à verser',                  'passif', 'C', '431', 4),
  ('4312',  'NSF salarié à verser',                  'passif', 'C', '431', 4),
  ('432',   'CSG/NSF — cotisations patronales',      'passif', 'C', '43', 3),
  ('4321',  'CSG patronal à verser',                 'passif', 'C', '432', 4),
  ('4322',  'NSF patronal à verser',                 'passif', 'C', '432', 4),
  ('4323',  'PRGF à verser',                         'passif', 'C', '432', 4),
  ('4324',  'Training Levy (HRDC) à verser',         'passif', 'C', '432', 4),
  ('433',   'PAYE à verser — MRA',                   'passif', 'C', '43', 3),
  ('4330',  'PAYE employés à reverser à MRA',        'passif', 'C', '433', 4),
  ('437',   'Autres organismes sociaux',             'passif', 'C', '43', 3),
  ('4371',  'Caisse de retraite supplémentaire',     'passif', 'C', '437', 4),

  ('44',    'ÉTAT ET COLLECTIVITÉS PUBLIQUES',       'passif', 'C', NULL, 2),
  ('441',   'État — subventions à recevoir',         'actif',  'D', '44', 3),
  ('445',   'État — taxes sur chiffre d''affaires',  'passif', 'C', '44', 3),
  ('4451',  'TVA collectée',                         'passif', 'C', '445', 4),
  ('4452',  'TVA déductible',                        'actif',  'D', '445', 4),
  ('4453',  'TVA à verser',                          'passif', 'C', '445', 4),

  -- ───────── CLASSE 6 : COMPTES DE CHARGES ─────────
  ('60',    'ACHATS ET VARIATIONS DE STOCKS',        'charge', 'D', NULL, 2),
  ('601',   'Achats de matières premières',          'charge', 'D', '60', 3),
  ('602',   'Achats de biens',                       'charge', 'D', '60', 3),
  ('604',   'Achats de services',                    'charge', 'D', '60', 3),
  ('606',   'Achats non stockés',                    'charge', 'D', '60', 3),
  ('607',   'Achats de marchandises',                'charge', 'D', '60', 3),

  ('61',    'SERVICES EXTÉRIEURS',                   'charge', 'D', NULL, 2),
  ('611',   'Sous-traitance',                        'charge', 'D', '61', 3),
  ('612',   'Redevances et crédit-bail',             'charge', 'D', '61', 3),
  ('613',   'Loyers et charges locatives',           'charge', 'D', '61', 3),
  ('614',   'Charges locatives (accessoires)',       'charge', 'D', '61', 3),
  ('615',   'Entretien et réparations',              'charge', 'D', '61', 3),
  ('616',   'Primes d''assurance',                   'charge', 'D', '61', 3),
  ('617',   'Études et recherches',                  'charge', 'D', '61', 3),
  ('618',   'Documentation et divers',               'charge', 'D', '61', 3),

  ('62',    'AUTRES SERVICES EXTÉRIEURS',            'charge', 'D', NULL, 2),
  ('621',   'Personnel extérieur (intérim)',         'charge', 'D', '62', 3),
  ('622',   'Honoraires et rémunérations',           'charge', 'D', '62', 3),
  ('6221',  'Honoraires comptables / juridiques',    'charge', 'D', '622', 4),
  ('6222',  'Commissions et courtages',              'charge', 'D', '622', 4),
  ('623',   'Publicité, publications',               'charge', 'D', '62', 3),
  ('625',   'Déplacements, missions, réceptions',    'charge', 'D', '62', 3),
  ('626',   'Frais postaux et de télécommunications','charge', 'D', '62', 3),
  ('627',   'Services bancaires et assimilés',       'charge', 'D', '62', 3),
  ('628',   'Divers',                               'charge', 'D', '62', 3),

  ('63',    'IMPÔTS, TAXES ET VERSEMENTS ASSIMILÉS', 'charge', 'D', NULL, 2),
  ('631',   'Impôts directs',                        'charge', 'D', '63', 3),
  ('632',   'Taxes sur chiffre d''affaires',         'charge', 'D', '63', 3),
  ('634',   'Autres impôts et taxes',                'charge', 'D', '63', 3),
  ('635',   'Autres impôts, taxes, versements assimilés', 'charge', 'D', '63', 3),

  ('64',    'CHARGES DE PERSONNEL',                  'charge', 'D', NULL, 2),
  ('641',   'Rémunérations du personnel',            'charge', 'D', '64', 3),
  ('6411',  'Salaires et appointements — bruts',     'charge', 'D', '641', 4),
  ('6412',  'Transport allowance',                   'charge', 'D', '641', 4),
  ('6413',  'Petrol allowance',                      'charge', 'D', '641', 4),
  ('6414',  'Heures supplémentaires',                'charge', 'D', '641', 4),
  ('6415',  'Primes et gratifications',              'charge', 'D', '641', 4),
  ('6416',  '13ème mois — EOY Bonus (75% déc)',      'charge', 'D', '641', 4),
  ('6417',  '13ème mois — EOY Bonus (25% déc)',      'charge', 'D', '641', 4),
  ('6418',  'Indemnités compensatrices (préavis, etc.)', 'charge', 'D', '641', 4),
  ('6419',  'Autres rémunérations du personnel',     'charge', 'D', '641', 4),

  ('645',   'Charges de sécurité sociale et prévoyance', 'charge', 'D', '64', 3),
  ('6451',  'CSG patronal',                          'charge', 'D', '645', 4),
  ('6452',  'NSF patronal',                          'charge', 'D', '645', 4),
  ('6453',  'PRGF (Portable Retirement Gratuity Fund)', 'charge', 'D', '645', 4),
  ('6454',  'Training Levy — HRDC (1%)',             'charge', 'D', '645', 4),
  ('6455',  'Contributions retraite supplémentaire', 'charge', 'D', '645', 4),

  ('648',   'Autres charges de personnel',           'charge', 'D', '64', 3),
  ('6481',  'Médecine du travail',                   'charge', 'D', '648', 4),
  ('6482',  'Formation professionnelle (hors HRDC)', 'charge', 'D', '648', 4),
  ('6483',  'Activités sociales et culturelles',     'charge', 'D', '648', 4),

  ('65',    'AUTRES CHARGES DE GESTION COURANTE',    'charge', 'D', NULL, 2),
  ('651',   'Redevances pour concessions de brevets','charge', 'D', '65', 3),
  ('652',   'Moins-values sur cessions',             'charge', 'D', '65', 3),
  ('658',   'Charges diverses de gestion courante',  'charge', 'D', '65', 3),

  ('66',    'CHARGES FINANCIÈRES',                   'charge', 'D', NULL, 2),
  ('661',   'Charges d''intérêts',                   'charge', 'D', '66', 3),
  ('665',   'Escomptes accordés',                    'charge', 'D', '66', 3),
  ('666',   'Pertes de change',                      'charge', 'D', '66', 3),
  ('668',   'Autres charges financières',            'charge', 'D', '66', 3),

  ('67',    'CHARGES EXCEPTIONNELLES',               'charge', 'D', NULL, 2),
  ('671',   'Charges exceptionnelles sur opérations', 'charge', 'D', '67', 3),
  ('672',   'Pénalités, amendes, majorations',       'charge', 'D', '67', 3),
  ('675',   'Valeurs comptables des éléments cédés', 'charge', 'D', '67', 3),

  ('68',    'DOTATIONS AUX AMORTISSEMENTS',          'charge', 'D', NULL, 2),
  ('681',   'Dotations aux amortissements — Immobilisations', 'charge', 'D', '68', 3),
  ('6811',  'Amortissements des immobilisations corporelles', 'charge', 'D', '681', 4),
  ('6812',  'Amortissements des immobilisations incorporelles', 'charge', 'D', '681', 4),

  -- ───────── CLASSE 7 : PRODUITS ─────────
  ('70',    'VENTES DE PRODUITS ET SERVICES',        'produit', 'C', NULL, 2),
  ('701',   'Ventes de produits finis',              'produit', 'C', '70', 3),
  ('706',   'Prestations de services',               'produit', 'C', '70', 3),
  ('707',   'Ventes de marchandises',                'produit', 'C', '70', 3),
  ('708',   'Produits des activités annexes',        'produit', 'C', '70', 3),

  ('75',    'AUTRES PRODUITS DE GESTION COURANTE',   'produit', 'C', NULL, 2),
  ('751',   'Redevances pour concessions',           'produit', 'C', '75', 3),
  ('758',   'Produits divers de gestion courante',   'produit', 'C', '75', 3),

  ('76',    'PRODUITS FINANCIERS',                   'produit', 'C', NULL, 2),
  ('761',   'Produits des participations',           'produit', 'C', '76', 3),
  ('765',   'Escomptes obtenus',                     'produit', 'C', '76', 3),
  ('766',   'Gains de change',                       'produit', 'C', '76', 3),
  ('768',   'Autres produits financiers',            'produit', 'C', '76', 3),

  -- ───────── CLASSE 5 : COMPTES FINANCIERS ─────────
  ('51',    'BANQUES, ÉTABLISSEMENTS FINANCIERS',    'actif', 'D', NULL, 2),
  ('511',   'Valeurs à l''encaissement',             'actif', 'D', '51', 3),
  ('512',   'Banques — comptes courants',            'actif', 'D', '51', 3),
  ('5121',  'MCB — Compte courant société',          'actif', 'D', '512', 4),
  ('5122',  'SBM — Compte courant société',          'actif', 'D', '512', 4),
  ('5123',  'AfrAsia — Compte courant',              'actif', 'D', '512', 4),
  ('5124',  'BNI — Compte courant',                  'actif', 'D', '512', 4),
  ('5125',  'HSBC — Compte courant',                 'actif', 'D', '512', 4),
  ('5126',  'Standard Bank — Compte courant',        'actif', 'D', '512', 4),
  ('530',   'Caisse',                                'actif', 'D', NULL, 2),
  ('5300',  'Caisse principale',                     'actif', 'D', '530', 3)

ON CONFLICT (compte) DO NOTHING;


-- ============================================================
-- 3. Fonction : générer les écritures de paie automatiquement
--    À appeler lors de la validation d'un bulletin
--    Écrit dans ecritures_comptables_v2 (journal SAL)
--    Colonnes : societe_id, date_ecriture, journal, ref_folio (numero_piece),
--               numero_compte, nom_compte, description (libelle), debit_mur, credit_mur
-- ============================================================
CREATE OR REPLACE FUNCTION public.generer_ecritures_paie(
  p_bulletin_id UUID
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_bulletin RECORD;
  v_nb_lignes INTEGER := 0;
  v_journal TEXT := 'SAL';
  v_piece TEXT;
  v_salaire_base NUMERIC;
BEGIN
  -- Récupérer le bulletin avec les données employé
  SELECT b.*, e.nom, e.prenom, e.code, e.societe_id AS emp_societe_id
  INTO v_bulletin
  FROM public.bulletins_paie b
  JOIN public.employes e ON e.id = b.employe_id
  WHERE b.id = p_bulletin_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bulletin % introuvable', p_bulletin_id;
  END IF;

  v_piece := 'BP-' || p_bulletin_id::TEXT;
  v_salaire_base := COALESCE(v_bulletin.salaire_base, 0);

  -- Supprimer les anciennes écritures v2 de ce bulletin (si recalcul)
  DELETE FROM public.ecritures_comptables_v2
  WHERE societe_id = v_bulletin.societe_id
    AND journal = v_journal
    AND ref_folio = v_piece;

  -- ── ÉCRITURES DÉBIT (Charges 6xx) — écriture dans ecritures_comptables_v2 ──

  -- 6411 : Salaire de base
  IF v_salaire_base > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_bulletin.periode::DATE, v_journal, v_piece,
      '6411', 'Rémunérations du personnel',
      'Salaire base — '||v_bulletin.prenom||' '||v_bulletin.nom, v_salaire_base, 0);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- 6412 : Transport allowance
  IF COALESCE(v_bulletin.transport_allowance, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_bulletin.periode::DATE, v_journal, v_piece,
      '6412', 'Transport allowance',
      'Transport — '||v_bulletin.prenom||' '||v_bulletin.nom, v_bulletin.transport_allowance, 0);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- 6413 : Petrol allowance
  IF COALESCE(v_bulletin.petrol_allowance, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_bulletin.periode::DATE, v_journal, v_piece,
      '6413', 'Petrol allowance',
      'Petrol — '||v_bulletin.prenom||' '||v_bulletin.nom, v_bulletin.petrol_allowance, 0);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- 6414 : Heures supplémentaires
  IF COALESCE(v_bulletin.heures_sup_montant, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_bulletin.periode::DATE, v_journal, v_piece,
      '6414', 'Heures supplémentaires',
      'Heures sup — '||v_bulletin.prenom||' '||v_bulletin.nom, v_bulletin.heures_sup_montant, 0);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- 6416 : EOY Bonus (13ème mois)
  IF COALESCE(v_bulletin.eoy_bonus, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_bulletin.periode::DATE, v_journal, v_piece,
      '6416', '13ème mois EOY Bonus',
      '13ème mois — '||v_bulletin.prenom||' '||v_bulletin.nom, v_bulletin.eoy_bonus, 0);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- 6451 : CSG patronal (débit charge)
  IF COALESCE(v_bulletin.csg_patronal, 0) + COALESCE(v_bulletin.csg_patronal_bonus, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_bulletin.periode::DATE, v_journal, v_piece,
      '6451', 'CSG patronal',
      'CSG patronal — '||v_bulletin.prenom||' '||v_bulletin.nom,
      COALESCE(v_bulletin.csg_patronal, 0) + COALESCE(v_bulletin.csg_patronal_bonus, 0), 0);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- 6452 : NSF patronal (débit charge)
  IF COALESCE(v_bulletin.nsf_patronal, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_bulletin.periode::DATE, v_journal, v_piece,
      '6452', 'NSF patronal',
      'NSF patronal — '||v_bulletin.prenom||' '||v_bulletin.nom, v_bulletin.nsf_patronal, 0);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- 6453 : PRGF (débit charge)
  IF COALESCE(v_bulletin.prgf, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_bulletin.periode::DATE, v_journal, v_piece,
      '6453', 'PRGF',
      'PRGF — '||v_bulletin.prenom||' '||v_bulletin.nom, v_bulletin.prgf, 0);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- 6454 : Training Levy (débit charge)
  IF COALESCE(v_bulletin.training_levy, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_bulletin.periode::DATE, v_journal, v_piece,
      '6454', 'Training Levy HRDC',
      'Training Levy — '||v_bulletin.prenom||' '||v_bulletin.nom, v_bulletin.training_levy, 0);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- ── ÉCRITURES CRÉDIT (Passifs 4xx) ──

  -- 421 : Personnel net à payer (crédit)
  IF COALESCE(v_bulletin.salaire_net, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_bulletin.periode::DATE, v_journal, v_piece,
      '421', 'Personnel net à payer',
      'Net à payer — '||v_bulletin.prenom||' '||v_bulletin.nom, 0, v_bulletin.salaire_net);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- 431 : CSG patronal à verser (crédit)
  IF COALESCE(v_bulletin.csg_patronal, 0) + COALESCE(v_bulletin.csg_patronal_bonus, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_bulletin.periode::DATE, v_journal, v_piece,
      '431', 'CSG patronal à verser MRA',
      'CSG patronal MRA — '||v_bulletin.prenom||' '||v_bulletin.nom,
      0, COALESCE(v_bulletin.csg_patronal, 0) + COALESCE(v_bulletin.csg_patronal_bonus, 0));
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- 431 : NSF patronal à verser (crédit)
  IF COALESCE(v_bulletin.nsf_patronal, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_bulletin.periode::DATE, v_journal, v_piece,
      '431', 'NSF patronal à verser MRA',
      'NSF patronal MRA — '||v_bulletin.prenom||' '||v_bulletin.nom, 0, v_bulletin.nsf_patronal);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- 432 : Training Levy à verser (crédit)
  IF COALESCE(v_bulletin.training_levy, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_bulletin.periode::DATE, v_journal, v_piece,
      '432', 'Training Levy HRDC à verser',
      'Training Levy — '||v_bulletin.prenom||' '||v_bulletin.nom, 0, v_bulletin.training_levy);
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- 431 : CSG salarié retenu (crédit)
  IF COALESCE(v_bulletin.csg_salarie, 0) + COALESCE(v_bulletin.csg_bonus, 0) > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte, description, debit_mur, credit_mur)
    VALUES (v_bulletin.societe_id, v_bulletin.periode::DATE, v_journal, v_piece,
      '431', 'CSG salarié retenu',
      'CSG salarié — '||v_bulletin.prenom||' '||v_bulletin.nom,
      0, COALESCE(v_bulletin.csg_salarie, 0) + COALESCE(v_bulletin.csg_bonus, 0));
    v_nb_lignes := v_nb_lignes + 1;
  END IF;

  -- Marquer le bulletin comme comptabilisé
  UPDATE public.bulletins_paie
  SET comptabilise = TRUE
  WHERE id = p_bulletin_id;

  RETURN v_nb_lignes;
END;
$$;

-- ============================================================
-- 4. Trigger : auto-comptabiliser à la validation du bulletin
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_ecritures_paie()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Seulement quand on passe en statut 'valide'
  IF NEW.statut = 'valide' AND (OLD.statut IS DISTINCT FROM 'valide') THEN
    PERFORM public.generer_ecritures_paie(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_ecritures_paie ON public.bulletins_paie;
CREATE TRIGGER trig_ecritures_paie
  AFTER UPDATE ON public.bulletins_paie
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_ecritures_paie();

-- ============================================================
-- 5. Ajouter colonne comptabilise sur bulletins_paie (si absente)
-- ============================================================
ALTER TABLE public.bulletins_paie
  ADD COLUMN IF NOT EXISTS comptabilise BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================
-- 6. Vue plan_comptable_usage : qui utilise quoi
-- ============================================================
CREATE OR REPLACE VIEW public.vue_plan_comptable_usage AS
SELECT
  pc.compte,
  pc.libelle,
  pc.type_compte,
  pc.sens_normal,
  COUNT(ec.id) AS nb_ecritures,
  SUM(ec.debit_mur)  AS total_debit,
  SUM(ec.credit_mur) AS total_credit,
  SUM(ec.debit_mur) - SUM(ec.credit_mur) AS solde
FROM public.plan_comptable pc
LEFT JOIN public.ecritures_comptables_v2 ec ON ec.numero_compte = pc.compte
GROUP BY pc.compte, pc.libelle, pc.type_compte, pc.sens_normal
ORDER BY pc.compte;

-- ============================================================
-- 7. API helper : liste du plan comptable par classe
-- ============================================================
COMMENT ON TABLE public.plan_comptable IS
  'Plan Comptable Mauricien (PCM) — conforme MIPA / IFRS / MRA. '
  'Seed classes 4 (tiers), 5 (financier), 6 (charges dont 641/645 paie), 7 (produits). '
  'Journal OD-PAIE : bulletins_paie → ecritures_comptables via trigger ou generer_ecritures_paie().';

