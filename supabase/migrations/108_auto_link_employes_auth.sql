-- ============================================================
-- Migration 108: Auto-link employes.auth_user_id from auth.users
-- ============================================================
-- Problème: les employés ne sont pas liés à leur compte Auth Supabase,
-- ce qui cause des inversions de profil dans le portail salarié.
--
-- Solution:
-- 1. UPDATE direct: lier par email exact match (auth.users.email = employes.email)
-- 2. Trigger automatique: à chaque INSERT/UPDATE sur employes, tenter le lien
-- 3. Trigger au login: à chaque connexion, mettre à jour le lien
-- ============================================================

-- ── ÉTAPE 1: Lier tous les employés existants par email ─────────────────────

UPDATE public.employes e
SET auth_user_id = au.id
FROM auth.users au
WHERE LOWER(TRIM(e.email)) = LOWER(TRIM(au.email))
  AND e.auth_user_id IS NULL
  AND e.email IS NOT NULL
  AND e.email != ''
  AND e.date_depart IS NULL;

-- ── ÉTAPE 2: Lier via profiles.employe_id (si renseigné) ────────────────────

UPDATE public.employes e
SET auth_user_id = p.id
FROM public.profiles p
WHERE p.employe_id = e.id
  AND e.auth_user_id IS NULL
  AND e.date_depart IS NULL;

-- ── ÉTAPE 3: Mettre à jour profiles.employe_id depuis auth_user_id ──────────

UPDATE public.profiles p
SET employe_id = e.id
FROM public.employes e
WHERE e.auth_user_id = p.id
  AND p.employe_id IS NULL
  AND e.date_depart IS NULL;

-- ── ÉTAPE 4: Trigger pour auto-link à chaque modification d'employé ─────────

CREATE OR REPLACE FUNCTION public.fn_auto_link_employe_auth()
RETURNS TRIGGER AS $$
BEGIN
  -- Si auth_user_id n'est pas encore set et email est renseigné
  IF NEW.auth_user_id IS NULL AND NEW.email IS NOT NULL AND NEW.email != '' THEN
    SELECT id INTO NEW.auth_user_id
    FROM auth.users
    WHERE LOWER(TRIM(email)) = LOWER(TRIM(NEW.email))
    LIMIT 1;
  END IF;

  -- Si auth_user_id est set, mettre à jour profiles.employe_id
  IF NEW.auth_user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET employe_id = NEW.id
    WHERE id = NEW.auth_user_id
      AND (employe_id IS NULL OR employe_id != NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Supprimer le trigger s'il existe déjà
DROP TRIGGER IF EXISTS trg_auto_link_employe_auth ON public.employes;

-- Créer le trigger sur INSERT et UPDATE
CREATE TRIGGER trg_auto_link_employe_auth
  BEFORE INSERT OR UPDATE ON public.employes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_link_employe_auth();

-- ── ÉTAPE 5: Index pour performance ─────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_employes_email_lower ON public.employes(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_employes_auth_user_id ON public.employes(auth_user_id);

-- ── ÉTAPE 6: Log du résultat ────────────────────────────────────────────────

DO $$
DECLARE
  linked_count INTEGER;
  unlinked_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO linked_count FROM public.employes WHERE auth_user_id IS NOT NULL AND date_depart IS NULL;
  SELECT COUNT(*) INTO unlinked_count FROM public.employes WHERE auth_user_id IS NULL AND date_depart IS NULL AND email IS NOT NULL;
  RAISE NOTICE 'Auto-link result: % employés liés, % employés non liés (email sans compte auth)', linked_count, unlinked_count;
END $$;
