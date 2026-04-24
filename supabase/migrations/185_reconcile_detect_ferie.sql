-- ============================================================
-- Migration 185 — Sprint G9bis
--
-- Le trigger reconcile_pointages_sessions_to_pointage ne détectait pas
-- les jours fériés : statut_jour restait 'travaille' même le 1er mai.
-- Ce patch enrichit la fonction pour faire un check sur jours_feries
-- (global OU override société) et pose statut_jour='ferie' si la date
-- correspond à un férié non travaillable.
--
-- CHANGEMENTS
--   1. CREATE OR REPLACE reconcile_pointages_sessions_to_pointage :
--      - Sous-requête sur jours_feries pour détecter le férié.
--      - Calcul societe_id depuis employes pour matcher un override
--        éventuel (societe_id = NULL = règle globale).
--      - CASE WHEN heure_entree IS NOT NULL AND v_est_ferie
--             THEN 'ferie'
--             WHEN heure_entree IS NOT NULL THEN 'travaille'
--             ELSE 'absent' END.
--
--   2. Backfill : retrigger reconcile pour les pointages des 90 derniers
--      jours (type_pointage='sessions_auto' uniquement — on ne touche
--      pas les pointages saisis manuellement).
--
-- IDEMPOTENTE.
-- ============================================================

CREATE OR REPLACE FUNCTION public.reconcile_pointages_sessions_to_pointage(
  p_employe_id UUID,
  p_date DATE
) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  v_heure_entree TIME;
  v_heure_sortie TIME;
  v_premiere_pause_debut TIME;
  v_premiere_pause_fin TIME;
  v_total_travail_minutes INTEGER;
  v_any_session BOOLEAN;
  v_has_open_work_session BOOLEAN;
  v_societe_id UUID;
  v_est_ferie BOOLEAN := FALSE;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.pointages_sessions
    WHERE employe_id = p_employe_id AND date_pointage = p_date
  ) INTO v_any_session;

  SELECT EXISTS (
    SELECT 1 FROM public.pointages_sessions
    WHERE employe_id = p_employe_id AND date_pointage = p_date
      AND type_session = 'travail' AND heure_fin IS NULL
  ) INTO v_has_open_work_session;

  SELECT MIN(heure_debut) INTO v_heure_entree
  FROM public.pointages_sessions
  WHERE employe_id = p_employe_id AND date_pointage = p_date AND type_session = 'travail';

  IF v_has_open_work_session THEN
    v_heure_sortie := NULL;
  ELSE
    SELECT MAX(heure_fin) INTO v_heure_sortie
    FROM public.pointages_sessions
    WHERE employe_id = p_employe_id AND date_pointage = p_date
      AND type_session = 'travail' AND heure_fin IS NOT NULL;
  END IF;

  SELECT heure_debut, heure_fin INTO v_premiere_pause_debut, v_premiere_pause_fin
  FROM public.pointages_sessions
  WHERE employe_id = p_employe_id AND date_pointage = p_date AND type_session = 'pause'
  ORDER BY heure_debut LIMIT 1;

  SELECT COALESCE(SUM(duree_minutes), 0) INTO v_total_travail_minutes
  FROM public.pointages_sessions
  WHERE employe_id = p_employe_id AND date_pointage = p_date
    AND type_session = 'travail' AND duree_minutes IS NOT NULL;

  -- G9bis.1 — détection jour férié (global OU override société).
  SELECT e.societe_id INTO v_societe_id FROM public.employes e WHERE e.id = p_employe_id;
  SELECT EXISTS (
    SELECT 1 FROM public.jours_feries jf
    WHERE jf.date = p_date
      AND COALESCE(jf.travail_autorise, FALSE) = FALSE
      AND (jf.societe_id IS NULL OR jf.societe_id = v_societe_id)
  ) INTO v_est_ferie;

  IF NOT v_any_session THEN
    -- Pas de session : purge la ligne pointages auto si elle existe.
    DELETE FROM public.pointages
    WHERE employe_id = p_employe_id AND date_pointage = p_date
      AND type_pointage = 'sessions_auto';
    RETURN;
  END IF;

  INSERT INTO public.pointages (
    employe_id, date_pointage,
    heure_entree, heure_sortie,
    heure_pause_debut, heure_pause_fin,
    duree_minutes, statut_jour, type_pointage
  ) VALUES (
    p_employe_id, p_date,
    v_heure_entree, v_heure_sortie,
    v_premiere_pause_debut, v_premiere_pause_fin,
    v_total_travail_minutes,
    CASE
      WHEN v_heure_entree IS NOT NULL AND v_est_ferie THEN 'ferie'
      WHEN v_heure_entree IS NOT NULL THEN 'travaille'
      ELSE 'absent'
    END,
    'sessions_auto'
  )
  ON CONFLICT (employe_id, date_pointage) DO UPDATE SET
    heure_entree       = EXCLUDED.heure_entree,
    heure_sortie       = EXCLUDED.heure_sortie,
    heure_pause_debut  = EXCLUDED.heure_pause_debut,
    heure_pause_fin    = EXCLUDED.heure_pause_fin,
    duree_minutes      = EXCLUDED.duree_minutes,
    statut_jour        = EXCLUDED.statut_jour,
    type_pointage      = 'sessions_auto';
END $fn$;

COMMENT ON FUNCTION public.reconcile_pointages_sessions_to_pointage(UUID, DATE) IS
  'PO1 hotfix + G9bis.1 : heure_sortie=NULL tant qu''une session travail
   est ouverte ; statut_jour=''ferie'' si la date matche jours_feries
   (travail_autorise=FALSE) — global ou override société.';

-- ─── Backfill : retrigger pointages 'sessions_auto' des 90 derniers jours ──
DO $$
DECLARE v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT DISTINCT employe_id, date_pointage
    FROM public.pointages
    WHERE date_pointage >= CURRENT_DATE - INTERVAL '90 days'
      AND type_pointage = 'sessions_auto'
  LOOP
    PERFORM public.reconcile_pointages_sessions_to_pointage(
      v_rec.employe_id, v_rec.date_pointage
    );
  END LOOP;
END $$;
