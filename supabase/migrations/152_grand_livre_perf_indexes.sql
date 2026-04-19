-- ============================================================================
-- Migration 152: Performance Grand Livre & Balance
-- ============================================================================
-- - Index composite (societe_id, numero_compte, date_ecriture)
-- - Index partiel "non-lettrées" pour audit lettrage
-- - Vue matérialisée mv_soldes_comptes_exercice (rafraîchissement manuel ou cron)
-- - Fonction fn_solde_compte_at_date pour soldes ponctuels
-- ============================================================================

-- 1) INDEX COMPOSITE PRINCIPAL (Grand Livre et Balance)
-- ============================================================================
-- Couvre la plupart des requêtes : WHERE societe_id=? AND numero_compte=?
-- ORDER BY date_ecriture
-- INCLUDE évite les visites table pour les agrégats simples

CREATE INDEX IF NOT EXISTS idx_ecritures_v2_composite
  ON ecritures_comptables_v2 (societe_id, numero_compte, date_ecriture DESC)
  INCLUDE (debit_mur, credit_mur, lettre);

-- 2) INDEX PARTIEL NON-LETTRÉES
-- ============================================================================
-- Pour les écrans "afficher uniquement non-lettrées" et balance âgée

CREATE INDEX IF NOT EXISTS idx_ecritures_v2_non_lettrees
  ON ecritures_comptables_v2 (societe_id, numero_compte, date_ecriture DESC)
  WHERE lettre IS NULL;

-- 3) INDEX SUR LETTRE (pour requêtes par code lettre)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ecritures_v2_lettre_code
  ON ecritures_comptables_v2 (societe_id, lettre, numero_compte)
  INCLUDE (debit_mur, credit_mur)
  WHERE lettre IS NOT NULL;

-- NOTE : les index ci-dessus sont créés sans CONCURRENTLY pour rester
-- compatibles avec une migration transactionnelle. Pour de très grosses tables
-- en production, le DBA peut rejouer manuellement chaque CREATE INDEX en
-- version CONCURRENTLY (hors transaction) afin d'éviter les verrous longs.

-- 4) VUE MATÉRIALISÉE SOLDES PAR COMPTE ET EXERCICE
-- ============================================================================
-- Pré-calcule les soldes agrégés pour la Balance instantanée.
-- À rafraîchir après clôture d'exercice ou via cron mensuel.

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_soldes_comptes_exercice AS
SELECT
  societe_id,
  numero_compte,
  EXTRACT(YEAR FROM date_ecriture)::INT AS exercice,
  COUNT(*) AS nb_ecritures,
  COALESCE(SUM(debit_mur), 0) AS total_debit,
  COALESCE(SUM(credit_mur), 0) AS total_credit,
  COALESCE(SUM(debit_mur - credit_mur), 0) AS solde,
  COUNT(*) FILTER (WHERE lettre IS NULL) AS nb_non_lettrees,
  MAX(date_ecriture) AS derniere_date
FROM ecritures_comptables_v2
WHERE societe_id IS NOT NULL AND numero_compte IS NOT NULL
GROUP BY societe_id, numero_compte, EXTRACT(YEAR FROM date_ecriture);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_soldes_key
  ON mv_soldes_comptes_exercice (societe_id, numero_compte, exercice);

CREATE INDEX IF NOT EXISTS idx_mv_soldes_societe
  ON mv_soldes_comptes_exercice (societe_id, exercice);

COMMENT ON MATERIALIZED VIEW mv_soldes_comptes_exercice IS
  'Soldes agrégés par compte/exercice pour Balance instantanée. Rafraîchir après clôture : REFRESH MATERIALIZED VIEW CONCURRENTLY mv_soldes_comptes_exercice;';

-- 5) FONCTION HELPER : SOLDE D'UN COMPTE À UNE DATE DONNÉE
-- ============================================================================
-- Calcule le solde cumulatif d'un compte jusqu'à une date (inclusive).
-- Utilisé pour reports à nouveau, balance ponctuelle.

CREATE OR REPLACE FUNCTION fn_solde_compte_at_date(
  p_societe_id UUID,
  p_numero_compte TEXT,
  p_date DATE
) RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(debit_mur - credit_mur), 0)
  FROM ecritures_comptables_v2
  WHERE societe_id = p_societe_id
    AND numero_compte = p_numero_compte
    AND date_ecriture <= p_date;
$$;

COMMENT ON FUNCTION fn_solde_compte_at_date IS
  'Retourne le solde cumulatif (débit - crédit) d''un compte à une date donnée.';

-- 6) FONCTION : SOLDES GROUPÉS PAR CLASSE (1-7) POUR BILAN/P&L
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_soldes_par_classe(
  p_societe_id UUID,
  p_date_debut DATE,
  p_date_fin DATE
) RETURNS TABLE (
  classe TEXT,
  total_debit NUMERIC,
  total_credit NUMERIC,
  solde NUMERIC,
  nb_ecritures BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    LEFT(numero_compte, 1) AS classe,
    COALESCE(SUM(debit_mur), 0) AS total_debit,
    COALESCE(SUM(credit_mur), 0) AS total_credit,
    COALESCE(SUM(debit_mur - credit_mur), 0) AS solde,
    COUNT(*) AS nb_ecritures
  FROM ecritures_comptables_v2
  WHERE societe_id = p_societe_id
    AND date_ecriture BETWEEN p_date_debut AND p_date_fin
    AND numero_compte IS NOT NULL
  GROUP BY LEFT(numero_compte, 1)
  ORDER BY classe;
$$;

COMMENT ON FUNCTION fn_soldes_par_classe IS
  'Soldes agrégés par classe comptable (1-7) pour construction Bilan / Compte de résultat.';
