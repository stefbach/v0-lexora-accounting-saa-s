-- ============================================================================
-- Migration 131 — Auto-stamp profiles.role='employe' when an auth user
-- is linked to an employee record.
-- ============================================================================
--
-- Context: migration 108 / 109 introduced auth_user_id on employes and
-- the profiles.employe_id back-link, but neither stamps profiles.role.
-- That means a fresh hire who logs in for the first time keeps her
-- profile row in its default state (role = NULL or 'client_user'),
-- which:
--   (a) makes app/redirect/page.tsx send her to /client/tableau-de-bord
--       instead of /salarie (unless the defensive fallback added in
--       Commit 2491eb1 catches it via employe_id);
--   (b) makes any future role-based SQL policy blind to the fact that
--       she IS an employee.
--
-- This migration:
--   1. Back-fills the existing data — every profile that has an
--      employe_id back-link but no role (or still the default
--      'client_user') is switched to 'employe'.
--   2. Installs a trigger on employes so that the next time any
--      employe row is inserted / updated with a non-null auth_user_id,
--      the matching profiles.role is stamped to 'employe' automatically
--      (idempotent — never overwrites an already-set role other than
--      'client_user', so admins / rh / managers who ALSO have an
--      employe link keep their privileged role).
--
-- Fully idempotent — safe to run multiple times.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Back-fill existing profiles
-- ----------------------------------------------------------------------------
UPDATE public.profiles AS p
SET role = 'employe'
WHERE p.employe_id IS NOT NULL
  AND (p.role IS NULL OR p.role = '' OR p.role = 'client_user');

-- Also cover the reverse direction: any employe with auth_user_id linked
-- whose profile hasn't had the role stamped yet.
UPDATE public.profiles AS p
SET role = 'employe'
FROM public.employes AS e
WHERE e.auth_user_id = p.id
  AND (p.role IS NULL OR p.role = '' OR p.role = 'client_user');

-- ----------------------------------------------------------------------------
-- 2. Trigger function — stamp profiles.role='employe' on auth_user_id link
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_employe_role_on_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when auth_user_id is present AND it changed (insert OR
  -- auth_user_id became non-null / changed value on update).
  IF NEW.auth_user_id IS NOT NULL AND (
       TG_OP = 'INSERT'
       OR OLD.auth_user_id IS DISTINCT FROM NEW.auth_user_id
     ) THEN
    -- Update the linked profile — but only if its role is still the
    -- default. We never downgrade an admin / rh / comptable / etc.
    UPDATE public.profiles
    SET role = 'employe'
    WHERE id = NEW.auth_user_id
      AND (role IS NULL OR role = '' OR role = 'client_user');

    -- Also keep the back-link in sync (convenience — matches what
    -- /api/rh/employes/me does at runtime).
    UPDATE public.profiles
    SET employe_id = NEW.id
    WHERE id = NEW.auth_user_id
      AND (employe_id IS NULL OR employe_id <> NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_employe_role_on_link() IS
  'Stamps profiles.role=employe + profiles.employe_id when an employes row is linked to an auth user. Idempotent; never overwrites privileged roles.';

-- ----------------------------------------------------------------------------
-- 3. Wire the trigger (drop-then-create so re-running is safe)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_employes_set_profile_role ON public.employes;

CREATE TRIGGER trg_employes_set_profile_role
AFTER INSERT OR UPDATE OF auth_user_id ON public.employes
FOR EACH ROW
EXECUTE FUNCTION public.set_employe_role_on_link();

COMMENT ON TRIGGER trg_employes_set_profile_role ON public.employes IS
  'On auth_user_id link, stamps the matching profile as role=employe (only if it was still unset / client_user).';
