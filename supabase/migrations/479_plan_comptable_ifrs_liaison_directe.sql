-- =============================================================================
-- Migration 479 — Liaison directe plan_comptable (PCG) <-> classification IFRS
--
-- Contexte : la migration 478 a livré comptes_ifrs + plan_comptable_migration_map
-- en PARALLÈLE, sans toucher à plan_comptable ni ecritures_comptables_v2. Cette
-- migration va un cran plus loin, mais reste strictement ADDITIVE et réversible :
--
--   1. Ajoute des colonnes NULL-ables de classification IFRS DIRECTEMENT sur la
--      table plan_comptable existante (clé "compte", déjà UNIQUE) — c'est la
--      couche de lecture consommée par les futurs écrans/API "états financiers
--      IFRS", pour éviter à chaque endpoint de refaire la jointure vers
--      comptes_ifrs/plan_comptable_migration_map.
--   2. Backfill UNIQUEMENT sur plan_comptable (référentiel, ~80 lignes), à
--      partir des mappings non-ambigus de la 478. AUCUN UPDATE sur
--      ecritures_comptables_v2 : le numero_compte des écritures existantes et
--      futures reste INCHANGÉ (401, 411, 4210, 4456...). Le rapprochement, la
--      génération de factures, les prompts IA, la TVA continuent de fonctionner
--      à l'identique, sans aucune régression.
--   3. Expose une vue v_ecritures_classees_ifrs (LEFT JOIN écritures <-> plan
--      comptable) : source unique pour les nouveaux rapports IFRS (SOFP/SOCI).
--      categorie_ifrs = NULL signale un compte non encore classé — à combler
--      avant bascule d'un rapport donné, jamais à deviner automatiquement.
--
-- Pré-requis : migration 478 (comptes_ifrs, plan_comptable_migration_map)
-- appliquée avant celle-ci. Idempotente, rejouable sans effet de bord.
-- Rollback : ALTER TABLE plan_comptable DROP COLUMN IF EXISTS <colonne> (x6) +
-- DROP VIEW IF EXISTS v_ecritures_classees_ifrs.
-- =============================================================================

-- ============================================================
-- 1. Colonnes de classification IFRS sur plan_comptable
-- ============================================================
ALTER TABLE public.plan_comptable
  ADD COLUMN IF NOT EXISTS categorie_ifrs VARCHAR(30)
    CHECK (categorie_ifrs IS NULL OR categorie_ifrs IN (
      'actif_courant', 'actif_non_courant',
      'passif_courant', 'passif_non_courant',
      'capitaux_propres', 'produits', 'charges'
    )),
  ADD COLUMN IF NOT EXISTS sous_categorie_ifrs VARCHAR(50),
  ADD COLUMN IF NOT EXISTS poste_etat_financier_ifrs VARCHAR(80),
  ADD COLUMN IF NOT EXISTS est_contra_ifrs BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS type_mra_ifrs VARCHAR(20)
    CHECK (type_mra_ifrs IS NULL OR type_mra_ifrs IN
      ('PAYE', 'NSF', 'CSG', 'PRGF', 'TRAINING_LEVY', 'TVA')),
  ADD COLUMN IF NOT EXISTS code_interne_ifrs VARCHAR(40)
    REFERENCES public.comptes_ifrs(code_interne) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_plan_comptable_categorie_ifrs
  ON public.plan_comptable(categorie_ifrs);
CREATE INDEX IF NOT EXISTS idx_plan_comptable_code_interne_ifrs
  ON public.plan_comptable(code_interne_ifrs);

-- ============================================================
-- 2. Backfill — uniquement les mappings sans ambiguïté, uniquement
--    plan_comptable (référentiel), jamais ecritures_comptables_v2.
--    Ne réécrase pas une classification déjà renseignée manuellement
--    (idempotent : ne touche que categorie_ifrs IS NULL).
-- ============================================================
UPDATE public.plan_comptable pc
SET categorie_ifrs            = ci.categorie_ifrs,
    sous_categorie_ifrs       = ci.sous_categorie,
    poste_etat_financier_ifrs = ci.poste_etat_financier,
    est_contra_ifrs           = ci.est_contra,
    type_mra_ifrs              = ci.type_mra,
    code_interne_ifrs          = ci.code_interne
FROM public.plan_comptable_migration_map m
JOIN public.comptes_ifrs ci ON ci.code_interne = m.code_interne_ifrs
WHERE m.mapping_sans_ambiguite = TRUE
  AND pc.compte = m.ancien_code_pcg
  AND pc.categorie_ifrs IS NULL;

-- ============================================================
-- 3. Vue de lecture — écritures classées IFRS (source unique pour
--    les futurs rapports SOFP/SOCI). Ne modifie aucune donnée.
-- ============================================================
-- security_invoker = true : la vue s'exécute avec les droits de l'appelant, donc
-- les policies RLS tenant de ecritures_comptables_v2 s'appliquent. Sans cette
-- option, la vue (propriété du rôle postgres) contournerait la RLS et exposerait
-- les écritures de tous les tenants à tout utilisateur authentifié.
CREATE OR REPLACE VIEW public.v_ecritures_classees_ifrs
WITH (security_invoker = true) AS
SELECT
  e.*,
  pc.categorie_ifrs,
  pc.sous_categorie_ifrs,
  pc.poste_etat_financier_ifrs,
  pc.est_contra_ifrs,
  pc.type_mra_ifrs,
  pc.code_interne_ifrs
FROM public.ecritures_comptables_v2 e
LEFT JOIN public.plan_comptable pc ON pc.compte = e.numero_compte;

COMMENT ON VIEW public.v_ecritures_classees_ifrs IS
  'Écritures comptables enrichies de leur classification IFRS (via plan_comptable.categorie_ifrs). categorie_ifrs NULL = compte non encore classé, à qualifier avant toute bascule de rapport vers ce compte (voir v_ecritures_sans_mapping_ifrs, migration 478).';

GRANT SELECT ON public.v_ecritures_classees_ifrs TO authenticated, service_role;

DO $$
DECLARE
  v_classes INT;
  v_total INT;
BEGIN
  SELECT COUNT(*) INTO v_classes FROM public.plan_comptable WHERE categorie_ifrs IS NOT NULL;
  SELECT COUNT(*) INTO v_total FROM public.plan_comptable;
  RAISE NOTICE 'Migration 479 — plan_comptable classé IFRS : %/% comptes', v_classes, v_total;
END $$;
