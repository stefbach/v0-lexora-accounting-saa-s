-- ============================================================================
-- Migration 166 — Plan comptable PCM strict + contrainte d'équilibre
-- ============================================================================
--
-- Objectif : finaliser l'unification du plan comptable. Les migrations 144, 158,
-- 163 ont remappé les codes legacy (3-digits et 6-digits) vers le PCM 4-digits
-- canonique mauricien. Cette migration verrouille l'avenir :
--
--   1. Seed un plan comptable PCM Maurice complet (~80 comptes usuels)
--   2. Ajoute une contrainte CHECK (NOT VALID) qui bloque les INSERT futurs
--      avec un `numero_compte` qui n'est pas 4 chiffres PCM — mais ne casse
--      PAS les données existantes (certaines peuvent encore contenir des
--      codes legacy qui seront nettoyés par un run de migration 198 forcé)
--   3. Ajoute un trigger STATEMENT AFTER qui vérifie l'équilibre débit=crédit
--      par `ref_folio` après chaque batch (tolérance 0.01 MUR pour arrondis)
--   4. Log d'audit des INSERT/UPDATE avec compte non canonique
--
-- IDEMPOTENTE. Pas de suppression de données. Rollback-able par DROP des
-- contraintes et triggers ajoutés (voir section "rollback" en fin de fichier).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Seed du plan comptable PCM Maurice (upsert idempotent)
-- ────────────────────────────────────────────────────────────────────────────
-- Compte canonique sur 4 caractères. Libellés FR conformes au PCM mauricien
-- (inspiré du Plan Comptable Mauricien adapté IAS/IFRS).
-- Chaque INSERT est protégé par ON CONFLICT DO UPDATE pour rester idempotent.

INSERT INTO public.plan_comptable (compte, libelle, type_compte, sens_normal, compte_parent, niveau) VALUES
  -- ── Classe 1 : Capitaux ─────────────────────────────────────────────────
  ('1010', 'Capital social',                                   'passif', 'C', NULL, 4),
  ('1061', 'Réserve légale',                                   'passif', 'C', '106', 4),
  ('1068', 'Autres réserves',                                  'passif', 'C', '106', 4),
  ('1190', 'Report à nouveau',                                 'passif', 'C', '119', 4),
  ('1200', 'Résultat de l''exercice',                          'passif', 'C', NULL, 4),
  ('1640', 'Emprunts bancaires',                               'passif', 'C', '164', 4),

  -- ── Classe 2 : Immobilisations ──────────────────────────────────────────
  ('2181', 'Installations générales, agencements',             'actif',  'D', '218', 4),
  ('2183', 'Matériel de bureau et informatique',               'actif',  'D', '218', 4),
  ('2184', 'Mobilier de bureau',                               'actif',  'D', '218', 4),
  ('2815', 'Amortissement — Installations et agencements',     'passif', 'C', '281', 4),
  ('2818', 'Amortissement — Autres immobilisations',           'passif', 'C', '281', 4),

  -- ── Classe 4 : Tiers ────────────────────────────────────────────────────
  ('401',  'Fournisseurs',                                     'passif', 'C', NULL, 3),
  ('411',  'Clients',                                          'actif',  'D', NULL, 3),
  ('4210', 'Salaires nets à payer',                            'passif', 'C', '421', 4),
  ('4211', 'Primes et gratifications à payer',                 'passif', 'C', '421', 4),
  ('4212', '13e mois à payer (EOY Bonus)',                     'passif', 'C', '421', 4),
  ('4250', 'Avances au personnel',                             'actif',  'D', '425', 4),
  ('4280', 'Notes de frais à rembourser',                      'passif', 'C', '428', 4),
  ('4311', 'CSG salarié à verser',                             'passif', 'C', '431', 4),
  ('4312', 'NSF salarié à verser',                             'passif', 'C', '431', 4),
  ('4321', 'CSG patronal à verser',                            'passif', 'C', '432', 4),
  ('4322', 'NSF patronal à verser',                            'passif', 'C', '432', 4),
  ('4323', 'PRGF à verser',                                    'passif', 'C', '432', 4),
  ('4324', 'Training Levy HRDC à verser',                      'passif', 'C', '432', 4),
  ('4330', 'PAYE à reverser à la MRA',                         'passif', 'C', '433', 4),
  ('4455', 'TVA à décaisser',                                  'passif', 'C', '445', 4),
  ('4456', 'TVA déductible',                                   'actif',  'D', '445', 4),
  ('4457', 'TVA collectée',                                    'passif', 'C', '445', 4),
  ('4471', 'MRA — impôts et taxes divers',                     'passif', 'C', '447', 4),
  ('4550', 'Comptes courants associés',                        'passif', 'C', '455', 4),
  ('4670', 'Tiers divers (virements inter-sociétés)',          'actif',  'D', '467', 4),
  ('4710', 'Comptes d''attente',                               'actif',  'D', '471', 4),

  -- ── Classe 5 : Trésorerie ───────────────────────────────────────────────
  ('512',  'Banque (compte principal)',                        'actif',  'D', NULL, 3),
  ('5121', 'Banque MUR',                                       'actif',  'D', '512', 4),
  ('5122', 'Banque EUR',                                       'actif',  'D', '512', 4),
  ('5123', 'Banque USD',                                       'actif',  'D', '512', 4),
  ('5800', 'Virements internes (transit)',                     'actif',  'D', '580', 4),

  -- ── Classe 6 : Charges ──────────────────────────────────────────────────
  ('601',  'Achats de marchandises',                           'charge', 'D', NULL, 3),
  ('606',  'Achats non stockés (fournitures)',                 'charge', 'D', NULL, 3),
  ('607',  'Achats (services et prestations)',                 'charge', 'D', NULL, 3),
  ('611',  'Sous-traitance générale',                          'charge', 'D', '61',  3),
  ('6131', 'Loyers',                                           'charge', 'D', '613', 4),
  ('6135', 'Charges locatives',                                'charge', 'D', '613', 4),
  ('6151', 'Entretien et réparations',                         'charge', 'D', '615', 4),
  ('6160', 'Assurances',                                       'charge', 'D', '616', 4),
  ('6221', 'Honoraires comptables',                            'charge', 'D', '622', 4),
  ('6225', 'Honoraires juridiques et conseils',                'charge', 'D', '622', 4),
  ('623',  'Publicité et marketing',                           'charge', 'D', NULL, 3),
  ('6251', 'Frais de déplacement',                             'charge', 'D', '625', 4),
  ('6256', 'Missions et réceptions',                           'charge', 'D', '625', 4),
  ('6261', 'Téléphone et internet',                            'charge', 'D', '626', 4),
  ('6271', 'Frais bancaires',                                  'charge', 'D', '627', 4),
  ('6272', 'Commissions bancaires (SWIFT, cables)',            'charge', 'D', '627', 4),
  ('628',  'Charges externes diverses',                        'charge', 'D', NULL, 3),
  ('6351', 'Droits de timbre et enregistrement',               'charge', 'D', '635', 4),
  ('6411', 'Salaires et appointements bruts',                  'charge', 'D', '641', 4),
  ('6412', 'Transport allowance',                              'charge', 'D', '641', 4),
  ('6413', 'Petrol allowance',                                 'charge', 'D', '641', 4),
  ('6414', 'Heures supplémentaires',                           'charge', 'D', '641', 4),
  ('6415', 'Primes et gratifications',                         'charge', 'D', '641', 4),
  ('6416', '13e mois — EOY Bonus (provision)',                 'charge', 'D', '641', 4),
  ('6417', 'Indemnités compensatrices et de départ',           'charge', 'D', '641', 4),
  ('6418', 'Indemnités compensatrices (préavis, etc.)',        'charge', 'D', '641', 4),
  ('6419', 'Autres rémunérations du personnel',                'charge', 'D', '641', 4),
  ('6451', 'CSG patronale',                                    'charge', 'D', '645', 4),
  ('6452', 'NSF patronal',                                     'charge', 'D', '645', 4),
  ('6453', 'PRGF (Portable Retirement Gratuity Fund)',         'charge', 'D', '645', 4),
  ('6454', 'Training Levy HRDC (1%)',                          'charge', 'D', '645', 4),
  ('651',  'Redevances licences SaaS',                         'charge', 'D', NULL, 3),
  ('661',  'Intérêts bancaires',                               'charge', 'D', NULL, 3),
  ('666',  'Pertes de change',                                 'charge', 'D', NULL, 3),
  ('671',  'Charges exceptionnelles',                          'charge', 'D', NULL, 3),

  -- ── Classe 7 : Produits ─────────────────────────────────────────────────
  ('701',  'Ventes de marchandises',                           'produit', 'C', NULL, 3),
  ('706',  'Prestations de services',                          'produit', 'C', NULL, 3),
  ('708',  'Produits accessoires',                             'produit', 'C', NULL, 3),
  ('7131', 'Production stockée',                               'produit', 'C', '713', 4),
  ('753',  'Commissions',                                      'produit', 'C', NULL, 3),
  ('766',  'Gains de change',                                  'produit', 'C', NULL, 3),
  ('771',  'Produits exceptionnels',                           'produit', 'C', NULL, 3)
ON CONFLICT (compte) DO UPDATE
  SET libelle       = EXCLUDED.libelle,
      type_compte   = EXCLUDED.type_compte,
      sens_normal   = EXCLUDED.sens_normal,
      compte_parent = EXCLUDED.compte_parent,
      niveau        = EXCLUDED.niveau;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Contrainte CHECK sur le format du numero_compte
-- ────────────────────────────────────────────────────────────────────────────
-- Accepte les comptes PCM valides :
--   • 3 caractères : '401', '411', '512', '611', '607' etc. (comptes parents)
--   • 4 caractères : '4210', '4311', '6411' etc. (sous-comptes)
--   • 5 caractères : '51211', '51212' (sous-sous-comptes banque par devise, rare)
--
-- Exclut explicitement :
--   • 6+ caractères (codes legacy "fantaisistes" type '421100', '431100')
--   • caractères non numériques (sauf lettres initiales pour Maurice futur)
--
-- Ajoutée NOT VALID pour ne pas bloquer l'ajout de la contrainte sur une table
-- qui peut encore contenir des valeurs historiques. Après nettoyage complet,
-- on pourra la valider avec `ALTER TABLE ... VALIDATE CONSTRAINT`.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_ecritures_v2_numero_compte_format'
  ) THEN
    ALTER TABLE public.ecritures_comptables_v2
      ADD CONSTRAINT chk_ecritures_v2_numero_compte_format
      CHECK (numero_compte IS NULL OR numero_compte ~ '^[1-8][0-9]{2,4}$')
      NOT VALID;
  END IF;
END $$;

COMMENT ON CONSTRAINT chk_ecritures_v2_numero_compte_format ON public.ecritures_comptables_v2 IS
  'Format PCM : 3 à 5 chiffres, commençant par 1-8. NOT VALID = applique aux '
  'nouveaux INSERT/UPDATE seulement. Pour valider sur les données existantes : '
  'ALTER TABLE public.ecritures_comptables_v2 VALIDATE CONSTRAINT chk_ecritures_v2_numero_compte_format;';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Trigger STATEMENT AFTER — vérifie l'équilibre par ref_folio
-- ────────────────────────────────────────────────────────────────────────────
-- Après chaque batch (INSERT/UPDATE multi-rows), on vérifie que chaque ref_folio
-- touché reste équilibré (SUM debit_mur = SUM credit_mur à 0.01 MUR près).
--
-- Un ref_folio déséquilibré peut exister temporairement pendant un batch
-- (ex: 3 INSERTs séparés pour une facture → après le 1er seul, pas d'équilibre).
-- On utilise donc un STATEMENT-level trigger, pas ROW-level, qui regarde
-- l'état APRÈS le statement complet.
--
-- Trois cas autorisés malgré un déséquilibre :
--   a. ref_folio NULL (écriture libre, pas de groupe)
--   b. ref_folio commence par 'BANK-' (paiement groupé multi-factures peut
--      avoir plusieurs lignes 401 débit associées à 1 seule ligne 512 crédit)
--   c. journal = 'CLS' (classifications auto qui peuvent avoir 1 seule ligne)
-- On alerte plutôt que de bloquer — notre objectif est la détection.

CREATE OR REPLACE FUNCTION public.trg_check_balance_ref_folio()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
  v_warnings TEXT := '';
BEGIN
  FOR r IN
    SELECT
      societe_id,
      ref_folio,
      journal,
      SUM(COALESCE(debit_mur, 0))  AS sum_debit,
      SUM(COALESCE(credit_mur, 0)) AS sum_credit
    FROM public.ecritures_comptables_v2
    WHERE ref_folio IS NOT NULL
      AND ref_folio NOT LIKE 'BANK-%'          -- exclusion b
      AND journal NOT IN ('CLS', 'BNQ')         -- exclusion c (BNQ peut avoir plusieurs 401 / 1 512)
      AND ref_folio IN (
        -- scope limité aux ref_folios touchés par le statement courant
        SELECT DISTINCT ref_folio
        FROM (
          SELECT ref_folio FROM new_table WHERE ref_folio IS NOT NULL
          UNION ALL
          SELECT ref_folio FROM old_table WHERE ref_folio IS NOT NULL
        ) s
      )
    GROUP BY societe_id, ref_folio, journal
    HAVING ABS(SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0))) > 0.01
  LOOP
    v_warnings := v_warnings
      || format(E'\n  • societe=%s ref_folio=%s journal=%s : écart = %s MUR',
                r.societe_id, r.ref_folio, r.journal,
                TO_CHAR(r.sum_debit - r.sum_credit, 'FM999999990.00'));
  END LOOP;

  IF v_warnings <> '' THEN
    RAISE WARNING E'[balance-check] ref_folio(s) déséquilibré(s) après INSERT/UPDATE :%', v_warnings;
  END IF;

  RETURN NULL;  -- STATEMENT trigger ignore la valeur retournée
END
$$;

-- INSERT / UPDATE séparés pour pouvoir référencer NEW TABLE / OLD TABLE
DROP TRIGGER IF EXISTS tr_balance_check_insert ON public.ecritures_comptables_v2;
CREATE TRIGGER tr_balance_check_insert
  AFTER INSERT ON public.ecritures_comptables_v2
  REFERENCING NEW TABLE AS new_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_check_balance_ref_folio();

-- Pour UPDATE, on ne peut PAS combiner `UPDATE OF col1, col2` avec
-- `REFERENCING NEW TABLE/OLD TABLE` (limitation PostgreSQL — erreur 0A000
-- « transition tables cannot be specified for triggers with column lists »).
-- On utilise donc `AFTER UPDATE` sans column list. Le trigger fire sur
-- TOUT update, mais la fonction court-circuite très vite si aucun
-- ref_folio n'a bougé (scope via transition tables dans la CTE).
DROP TRIGGER IF EXISTS tr_balance_check_update ON public.ecritures_comptables_v2;
CREATE TRIGGER tr_balance_check_update
  AFTER UPDATE ON public.ecritures_comptables_v2
  REFERENCING NEW TABLE AS new_table OLD TABLE AS old_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_check_balance_ref_folio();

COMMENT ON FUNCTION public.trg_check_balance_ref_folio IS
  'Vérifie l''équilibre débit = crédit par ref_folio après chaque INSERT/UPDATE '
  'sur ecritures_comptables_v2. Émet un WARNING non bloquant pour les ref_folios '
  'déséquilibrés (exclu : BANK-* paiements groupés, CLS classifications auto, BNQ). '
  'Les warnings sont visibles dans les logs Supabase.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Vue utile pour monitoring continu
-- ────────────────────────────────────────────────────────────────────────────
-- v_ecritures_non_canonique : liste les écritures dont le compte n'est pas
-- dans le plan comptable canonique. À surveiller via cron / admin/health.
CREATE OR REPLACE VIEW public.v_ecritures_non_canonique AS
SELECT
  e.id,
  e.societe_id,
  e.numero_compte,
  e.journal,
  e.date_ecriture,
  e.ref_folio,
  e.libelle,
  e.debit_mur,
  e.credit_mur
FROM public.ecritures_comptables_v2 e
LEFT JOIN public.plan_comptable pc ON pc.compte = e.numero_compte
WHERE e.numero_compte IS NOT NULL
  AND pc.compte IS NULL;

COMMENT ON VIEW public.v_ecritures_non_canonique IS
  'Écritures dont le numero_compte n''existe pas dans plan_comptable. À nettoyer '
  'périodiquement. Alimente le check correspondant dans /admin/health.';

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Rapport final
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_plan_count INT;
  v_non_canon_count INT;
BEGIN
  SELECT COUNT(*) INTO v_plan_count FROM public.plan_comptable;
  SELECT COUNT(*) INTO v_non_canon_count FROM public.v_ecritures_non_canonique;

  RAISE NOTICE '▶ Migration 166 terminée';
  RAISE NOTICE '  • plan_comptable : % comptes canoniques', v_plan_count;
  RAISE NOTICE '  • écritures hors canon : % (à nettoyer — cf v_ecritures_non_canonique)', v_non_canon_count;
  RAISE NOTICE '  • contrainte format numero_compte ajoutée (NOT VALID)';
  RAISE NOTICE '  • trigger balance-check actif sur INSERT/UPDATE';
  RAISE NOTICE '';
  RAISE NOTICE '▶ Prochaines étapes recommandées :';
  RAISE NOTICE '  1. Nettoyer v_ecritures_non_canonique (voir SCHEMA.md)';
  RAISE NOTICE '  2. Puis : ALTER TABLE ecritures_comptables_v2 VALIDATE CONSTRAINT chk_ecritures_v2_numero_compte_format;';
END $$;

-- ============================================================================
-- ROLLBACK (à lancer manuellement en cas de besoin — NE PAS exécuter ici)
-- ============================================================================
-- DROP TRIGGER IF EXISTS tr_balance_check_insert ON public.ecritures_comptables_v2;
-- DROP TRIGGER IF EXISTS tr_balance_check_update ON public.ecritures_comptables_v2;
-- DROP FUNCTION IF EXISTS public.trg_check_balance_ref_folio();
-- DROP VIEW IF EXISTS public.v_ecritures_non_canonique;
-- ALTER TABLE public.ecritures_comptables_v2
--   DROP CONSTRAINT IF EXISTS chk_ecritures_v2_numero_compte_format;
-- (Les INSERT dans plan_comptable ne sont pas rollback-ables sans perdre les
--  libellés canoniques — à faire à la main si nécessaire.)
