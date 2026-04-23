-- ═══════════════════════════════════════════════════════════════
-- Migration 190 — HOTFIX pointage RH : statut "En pause" respecté
--
-- BUG
--   reconcile_pointages_sessions_to_pointage (migration 185) remplit
--   pointages.heure_sortie avec MAX(heure_fin) des sessions travail dès
--   qu'aucune session travail n'est ouverte. Conséquence : quand un
--   employé clique "Pause", toutes les sessions travail sont fermées,
--   la fonction remplit heure_sortie alors que la journée n'est PAS
--   terminée — l'UI RH affiche "Terminé" au lieu de "En pause".
--
--   Cas observés aujourd'hui :
--     Aditya : entrée 08:55, pause 13:28  -> UI "Terminé 4h32" (faux)
--     Mégane : entrée 08:26, pause 14:20  -> UI "Terminé 5h53" (faux)
--     Stephano : pause + reprise         -> heure_sortie contaminée
--
-- FIX
--   1. heure_sortie = NULL si session travail OU pause ouverte
--      (la journée n'est terminée que si AUCUNE session n'est ouverte).
--   2. heure_pause_debut / heure_pause_fin reflètent la DERNIÈRE pause
--      (ORDER BY heure_debut DESC LIMIT 1) — avec sessions multiples,
--      on veut montrer la pause en cours ou la plus récente.
--      L'UI détecte "En pause" via (heure_pause_debut && !heure_pause_fin).
--
-- BACKFILL
--   Retrigger reconcile sur tous les pointages 'sessions_auto' des 7
--   derniers jours pour nettoyer les heure_sortie contaminées.
--
-- IDEMPOTENT. CREATE OR REPLACE FUNCTION.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.reconcile_pointages_sessions_to_pointage(
  p_employe_id UUID,
  p_date DATE
) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  v_heure_entree TIME;
  v_heure_sortie TIME;
  v_derniere_pause_debut TIME;
  v_derniere_pause_fin TIME;
  v_total_travail_minutes INTEGER;
  v_any_session BOOLEAN;
  v_has_open_work_session BOOLEAN;
  v_has_open_pause_session BOOLEAN;
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

  -- G9bis.2 (hotfix pause) : détecter aussi les sessions 'pause' en cours
  SELECT EXISTS (
    SELECT 1 FROM public.pointages_sessions
    WHERE employe_id = p_employe_id AND date_pointage = p_date
      AND type_session = 'pause' AND heure_fin IS NULL
  ) INTO v_has_open_pause_session;

  SELECT MIN(heure_debut) INTO v_heure_entree
  FROM public.pointages_sessions
  WHERE employe_id = p_employe_id AND date_pointage = p_date AND type_session = 'travail';

  -- heure_sortie = NULL si travail OU pause encore ouvert.
  -- La journée n'est "terminée" que si aucune session n'est en cours.
  IF v_has_open_work_session OR v_has_open_pause_session THEN
    v_heure_sortie := NULL;
  ELSE
    SELECT MAX(heure_fin) INTO v_heure_sortie
    FROM public.pointages_sessions
    WHERE employe_id = p_employe_id AND date_pointage = p_date
      AND type_session = 'travail' AND heure_fin IS NOT NULL;
  END IF;

  -- Dernière pause (pas la première) : expose une pause en cours si existe.
  SELECT heure_debut, heure_fin INTO v_derniere_pause_debut, v_derniere_pause_fin
  FROM public.pointages_sessions
  WHERE employe_id = p_employe_id AND date_pointage = p_date AND type_session = 'pause'
  ORDER BY heure_debut DESC LIMIT 1;

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
    v_derniere_pause_debut, v_derniere_pause_fin,
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
  'PO1 + G9bis.1 + hotfix pause 190 : heure_sortie=NULL tant qu''une
   session travail OU pause est en cours ; expose la DERNIÈRE pause
   (pause en cours si elle existe) ; statut_jour=''ferie'' sur jours
   fériés non travaillables.';

-- ─── Backfill : retrigger reconcile pour les 7 derniers jours ───────
DO $$
DECLARE v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT DISTINCT employe_id, date_pointage
    FROM public.pointages
    WHERE date_pointage >= CURRENT_DATE - INTERVAL '7 days'
      AND type_pointage = 'sessions_auto'
  LOOP
    PERFORM public.reconcile_pointages_sessions_to_pointage(
      v_rec.employe_id, v_rec.date_pointage
    );
  END LOOP;
END $$;
