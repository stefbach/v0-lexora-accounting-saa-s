-- ============================================================
-- Migration 154 — F6 Sprint "Années par anniversaire" — ÉTAPE A.1
--
-- Fonctions SQL pour calculer les périodes de 12 mois d'un employé
-- selon sa date d'arrivée (cf. WRA 2019 ss.45 et 47 : "during each
-- subsequent period of 12 months" à partir de la 12e mois d'emploi).
--
-- Ces fonctions sont IMMUTABLE et seront utilisées par :
--   - le helper TS recomputeSoldeCongesAll (étape A.3)
--   - la migration de recompute globale (étape A.4)
--   - les vues futures de reporting côté UI (étape B)
--
-- IDEMPOTENTE : CREATE OR REPLACE FUNCTION.
-- ============================================================

-- ─── get_conges_period_start ─────────────────────────────────────────
-- Retourne le 1er jour de la période de 12 mois courante d'un employé.
-- Ex: employé arrivé le 2024-07-01, date de référence = 2026-02-05
--     → période courante = 2025-07-01 → 2026-06-30
--     → return '2025-07-01'
CREATE OR REPLACE FUNCTION public.get_conges_period_start(
  date_arrivee DATE,
  date_reference DATE
) RETURNS DATE AS $$
DECLARE
  months_elapsed INT;
  period_number INT;
BEGIN
  -- Nombre de mois calendaires écoulés entre arrivée et date de référence
  months_elapsed := (EXTRACT(YEAR FROM date_reference) - EXTRACT(YEAR FROM date_arrivee))::int * 12
                    + (EXTRACT(MONTH FROM date_reference) - EXTRACT(MONTH FROM date_arrivee))::int;
  -- Ajustement : si le jour du mois de référence < jour du mois d'arrivée,
  -- alors on n'a pas encore "bouclé" ce mois → retrancher 1.
  IF EXTRACT(DAY FROM date_reference) < EXTRACT(DAY FROM date_arrivee) THEN
    months_elapsed := months_elapsed - 1;
  END IF;

  -- Numéro de la période (0 = première année d'acquisition, 1 = 2e année, …)
  -- FLOOR garde-fou pour les dates antérieures à date_arrivee
  period_number := GREATEST(0, FLOOR(months_elapsed::numeric / 12)::int);

  -- Début de la période = date_arrivee + N × 12 mois
  RETURN date_arrivee + (period_number * INTERVAL '12 months');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─── get_conges_period_end ───────────────────────────────────────────
-- Retourne le dernier jour de la période (début + 12 mois - 1 jour).
CREATE OR REPLACE FUNCTION public.get_conges_period_end(
  date_arrivee DATE,
  date_reference DATE
) RETURNS DATE AS $$
BEGIN
  RETURN public.get_conges_period_start(date_arrivee, date_reference)
    + INTERVAL '12 months' - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─── is_eligible_conges ──────────────────────────────────────────────
-- TRUE si l'employé a atteint ≥12 mois d'emploi à la date de référence
-- (c.-à-d. a terminé sa période d'acquisition, WRA 2019 s.45(1)).
CREATE OR REPLACE FUNCTION public.is_eligible_conges(
  date_arrivee DATE,
  date_reference DATE
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN date_reference >= (date_arrivee + INTERVAL '12 months');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.get_conges_period_start(DATE, DATE) IS
  'WRA 2019 — retourne le début de la période de 12 mois courante à date_reference pour un employé arrivé à date_arrivee.';
COMMENT ON FUNCTION public.get_conges_period_end(DATE, DATE) IS
  'WRA 2019 — retourne la fin (inclusive) de la période de 12 mois courante.';
COMMENT ON FUNCTION public.is_eligible_conges(DATE, DATE) IS
  'WRA 2019 s.45(1) — TRUE si l''employé a ≥12 mois d''emploi continu à date_reference.';
