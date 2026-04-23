-- ============================================================
-- Migration 171 — Sprint PO1
--
-- Pointage flexible : passage de "1 ligne/jour rigide" vers un modèle
-- de SESSIONS MULTIPLES permettant :
--   - Interventions tardives (employé pointe Sortie 17h, revient à 19h)
--   - Pauses multiples (ex: 3 × 20min au lieu d'1h de déjeuner)
--   - Sortie anticipée puis retour (RDV médical entre midi et 14h)
--
-- STRATÉGIE
--   - Nouvelle table pointages_sessions (sessions travail + pause)
--   - Fonction reconcile_pointages_sessions_to_pointage(employe_id, date) :
--     reconstitue les champs de la table legacy `pointages` (MIN/MAX/SUM)
--   - Trigger AFTER INSERT/UPDATE/DELETE sur pointages_sessions qui
--     appelle la réconciliation automatiquement
--   - Le moteur paie, les bulletins, exports MRA etc. continuent de lire
--     la table `pointages` : AUCUNE modification du code paie.
--
-- IDEMPOTENTE : IF NOT EXISTS, CREATE OR REPLACE, DO block pour
-- l'ajout conditionnel de la contrainte UNIQUE.
-- ============================================================

-- ─── 1. Table des sessions de pointage ────────────────────────────
CREATE TABLE IF NOT EXISTS public.pointages_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  date_pointage DATE NOT NULL,

  -- Type de session : seulement travail ou pause. Les absences restent
  -- gérées via pointages.statut_jour (pas de session "absence").
  type_session TEXT NOT NULL CHECK (type_session IN ('travail', 'pause')),

  -- Horodatage
  heure_debut TIME NOT NULL,
  heure_fin TIME,                 -- NULL = session actuellement en cours
  duree_minutes INTEGER,          -- calculé à la fermeture via trigger BEFORE

  -- Contexte optionnel
  notes TEXT,
  latitude NUMERIC,
  longitude NUMERIC,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  correction BOOLEAN DEFAULT FALSE,
  corrected_by UUID REFERENCES auth.users(id),
  correction_motif TEXT
);

CREATE INDEX IF NOT EXISTS idx_pointages_sessions_employe_date
  ON public.pointages_sessions(employe_id, date_pointage);

-- Index partiel : accès rapide à la session ouverte d'un employé.
CREATE INDEX IF NOT EXISTS idx_pointages_sessions_en_cours
  ON public.pointages_sessions(employe_id)
  WHERE heure_fin IS NULL;

COMMENT ON TABLE public.pointages_sessions IS
  'PO1 - Sessions de pointage multiples par jour. Remplace progressivement
   l''approche 1 ligne/jour de la table pointages. Permet interventions
   tardives, pauses multiples, sorties anticipées avec retour.';

-- ─── 2. Trigger BEFORE pour calculer duree_minutes automatiquement ───
CREATE OR REPLACE FUNCTION public.trg_sessions_calc_duree()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.heure_fin IS NOT NULL THEN
    NEW.duree_minutes := GREATEST(
      0,
      EXTRACT(EPOCH FROM (NEW.heure_fin - NEW.heure_debut))::INTEGER / 60
    );
  ELSE
    NEW.duree_minutes := NULL;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_sessions_calc_duree ON public.pointages_sessions;
CREATE TRIGGER trg_sessions_calc_duree
BEFORE INSERT OR UPDATE ON public.pointages_sessions
FOR EACH ROW EXECUTE FUNCTION public.trg_sessions_calc_duree();

-- ─── 3. Contrainte UNIQUE sur pointages (employe_id, date_pointage) ──
-- Nécessaire pour que la réconciliation puisse faire un UPSERT (ON CONFLICT).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pointages_employe_date_unique'
      AND conrelid = 'public.pointages'::regclass
  ) THEN
    -- Déduplication préalable : si des doublons existent (employe + date),
    -- garder la row la plus récente (par created_at ou id) et supprimer le reste.
    DELETE FROM public.pointages p
    WHERE EXISTS (
      SELECT 1 FROM public.pointages p2
      WHERE p2.employe_id = p.employe_id
        AND p2.date_pointage = p.date_pointage
        AND p2.id > p.id
    );
    ALTER TABLE public.pointages
      ADD CONSTRAINT pointages_employe_date_unique
      UNIQUE (employe_id, date_pointage);
  END IF;
END $$;

-- ─── 4. Fonction de réconciliation sessions -> pointages ─────────────
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
  v_total_pause_minutes INTEGER;
  v_any_session BOOLEAN;
BEGIN
  -- Détecte si au moins une session existe encore pour ce jour.
  SELECT EXISTS (
    SELECT 1 FROM public.pointages_sessions
    WHERE employe_id = p_employe_id AND date_pointage = p_date
  ) INTO v_any_session;

  -- Heure d'entrée = MIN des débuts des sessions travail.
  SELECT MIN(heure_debut) INTO v_heure_entree
  FROM public.pointages_sessions
  WHERE employe_id = p_employe_id
    AND date_pointage = p_date
    AND type_session = 'travail';

  -- Heure de sortie = MAX des heure_fin des sessions travail fermées.
  -- Si la dernière session travail est encore en cours, on laisse NULL :
  -- le moteur paie verra "pas encore sorti" comme avant.
  SELECT MAX(heure_fin) INTO v_heure_sortie
  FROM public.pointages_sessions
  WHERE employe_id = p_employe_id
    AND date_pointage = p_date
    AND type_session = 'travail'
    AND heure_fin IS NOT NULL;

  -- Première pause (pour compat affichage legacy : un seul slot pause).
  SELECT heure_debut, heure_fin
    INTO v_premiere_pause_debut, v_premiere_pause_fin
  FROM public.pointages_sessions
  WHERE employe_id = p_employe_id
    AND date_pointage = p_date
    AND type_session = 'pause'
  ORDER BY heure_debut
  LIMIT 1;

  -- Totaux en minutes.
  SELECT COALESCE(SUM(duree_minutes), 0) INTO v_total_travail_minutes
  FROM public.pointages_sessions
  WHERE employe_id = p_employe_id
    AND date_pointage = p_date
    AND type_session = 'travail'
    AND duree_minutes IS NOT NULL;

  SELECT COALESCE(SUM(duree_minutes), 0) INTO v_total_pause_minutes
  FROM public.pointages_sessions
  WHERE employe_id = p_employe_id
    AND date_pointage = p_date
    AND type_session = 'pause'
    AND duree_minutes IS NOT NULL;

  -- Si plus aucune session ET le pointage a été créé par 'sessions_auto',
  -- on le supprime pour éviter une ligne fantôme. Sinon on laisse tel quel.
  IF NOT v_any_session THEN
    DELETE FROM public.pointages
    WHERE employe_id = p_employe_id
      AND date_pointage = p_date
      AND type_pointage = 'sessions_auto';
    RETURN;
  END IF;

  -- UPSERT dans pointages.
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
  ON CONFLICT (employe_id, date_pointage) DO UPDATE
  SET
    heure_entree       = EXCLUDED.heure_entree,
    heure_sortie       = EXCLUDED.heure_sortie,
    heure_pause_debut  = EXCLUDED.heure_pause_debut,
    heure_pause_fin    = EXCLUDED.heure_pause_fin,
    duree_minutes      = EXCLUDED.duree_minutes,
    statut_jour        = EXCLUDED.statut_jour,
    type_pointage      = 'sessions_auto';
END $fn$;

COMMENT ON FUNCTION public.reconcile_pointages_sessions_to_pointage(UUID, DATE) IS
  'PO1 - Met à jour la table pointages à partir des sessions du jour.
   Appelée automatiquement via trigger AFTER sur pointages_sessions.
   Garantit la rétrocompat : le moteur paie continue de lire `pointages`.';

-- ─── 5. Trigger AFTER pour réconcilier à chaque modif de session ─────
CREATE OR REPLACE FUNCTION public.trg_sessions_reconcile()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.reconcile_pointages_sessions_to_pointage(
      OLD.employe_id, OLD.date_pointage
    );
    RETURN OLD;
  ELSE
    PERFORM public.reconcile_pointages_sessions_to_pointage(
      NEW.employe_id, NEW.date_pointage
    );
    RETURN NEW;
  END IF;
END $fn$;

DROP TRIGGER IF EXISTS trg_sessions_reconcile ON public.pointages_sessions;
CREATE TRIGGER trg_sessions_reconcile
AFTER INSERT OR UPDATE OR DELETE ON public.pointages_sessions
FOR EACH ROW EXECUTE FUNCTION public.trg_sessions_reconcile();
