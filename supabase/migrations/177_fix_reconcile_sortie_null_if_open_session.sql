-- ============================================================
-- Migration 177 — Hotfix PO1
--
-- Déjà appliquée en DB manuellement par Mégane avant ce commit ;
-- ce fichier est conservé pour la traçabilité git et la repro
-- dans les autres environnements (staging, CI).
--
-- CONTEXTE
--   Le trigger reconcile (PO1 mig 171) renseignait heure_sortie avec
--   MAX(heure_fin) sur les sessions FERMÉES. Conséquence :
--   - Session matin fermée 12:00 + session après-midi ouverte
--     -> pointages.heure_sortie = 12:00  (faux : journée non finie)
--   - Côté UI, ça donnait l'illusion que la journée était déjà
--     terminée avec seulement le travail du matin décompté.
--
-- FIX
--   Ajout d'un check v_has_open_work_session : tant qu'il existe une
--   session travail en cours (heure_fin IS NULL), on force
--   heure_sortie := NULL dans la table pointages. L'UI peut alors
--   distinguer journée terminée vs en cours et afficher '--'
--   tant que la sortie réelle n'est pas enregistrée.
--
--   Le total duree_minutes reste la SUM des sessions travail FERMÉES
--   (comportement PO1 original) — pas le temps écoulé en cours.
--
-- IDEMPOTENT : CREATE OR REPLACE uniquement, pas d'ALTER.
-- NUMÉROTATION : migration 176 déjà prise par G6 (v_registre_*).
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
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.pointages_sessions
    WHERE employe_id = p_employe_id AND date_pointage = p_date
  ) INTO v_any_session;

  -- NEW : détecte une session travail encore ouverte (heure_fin NULL).
  SELECT EXISTS (
    SELECT 1 FROM public.pointages_sessions
    WHERE employe_id = p_employe_id
      AND date_pointage = p_date
      AND type_session = 'travail'
      AND heure_fin IS NULL
  ) INTO v_has_open_work_session;

  SELECT MIN(heure_debut) INTO v_heure_entree
  FROM public.pointages_sessions
  WHERE employe_id = p_employe_id
    AND date_pointage = p_date
    AND type_session = 'travail';

  -- heure_sortie = NULL si au moins une session travail est encore en cours.
  -- Sinon, MAX(heure_fin) sur les sessions travail fermées.
  IF v_has_open_work_session THEN
    v_heure_sortie := NULL;
  ELSE
    SELECT MAX(heure_fin) INTO v_heure_sortie
    FROM public.pointages_sessions
    WHERE employe_id = p_employe_id
      AND date_pointage = p_date
      AND type_session = 'travail'
      AND heure_fin IS NOT NULL;
  END IF;

  -- Première pause (compat legacy : un seul slot pause sur pointages).
  SELECT heure_debut, heure_fin
    INTO v_premiere_pause_debut, v_premiere_pause_fin
  FROM public.pointages_sessions
  WHERE employe_id = p_employe_id
    AND date_pointage = p_date
    AND type_session = 'pause'
  ORDER BY heure_debut
  LIMIT 1;

  -- duree_minutes = SUM des sessions travail FERMÉES uniquement.
  -- Le temps écoulé sur une session ouverte n'est PAS comptabilisé
  -- (pas de clôture automatique mid-journée).
  SELECT COALESCE(SUM(duree_minutes), 0) INTO v_total_travail_minutes
  FROM public.pointages_sessions
  WHERE employe_id = p_employe_id
    AND date_pointage = p_date
    AND type_session = 'travail'
    AND duree_minutes IS NOT NULL;

  -- Aucune session : purge la ligne pointages auto (si créée par ce trigger).
  IF NOT v_any_session THEN
    DELETE FROM public.pointages
    WHERE employe_id = p_employe_id
      AND date_pointage = p_date
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
    CASE WHEN v_heure_entree IS NOT NULL THEN 'travaille' ELSE 'absent' END,
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
  'PO1 hotfix - heure_sortie=NULL tant qu''une session travail est ouverte.
   duree_minutes reste SUM des sessions fermées (pas le temps en cours).';
