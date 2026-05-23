-- Migration 408 — Fix fn_log_audit_trail: TG_OP='INSERT' → action='CREATE'
--
-- Bug : le trigger automatique fn_log_audit_trail (créé en mig 403) insère
--       dans audit_trail avec action = TG_OP, donc 'INSERT' pour les nouvelles
--       lignes. MAIS la CHECK constraint audit_trail_action_check n'accepte que
--       ('CREATE','UPDATE','DELETE','READ','EXPORT','LOGIN','LOGOUT','APPROVE','REJECT').
--       'INSERT' n'est PAS dans la liste autorisée → tout INSERT sur les tables
--       auditées (bulletins_paie, ecritures_comptables_v2, employes, factures, …)
--       devrait échouer en 23514.
--
-- Observé en prod le 2026-05-23 lors d'une restauration manuelle d'écritures
-- comptables (cf incident PR #237) : INSERT direct rejeté par le trigger.
--
-- Fix : mapper TG_OP='INSERT' vers action='CREATE' dans le INSERT du trigger.
--       Aligne avec la sémantique intentée par la mig 403 (le constraint avait
--       choisi 'CREATE' comme nom, alors que TG_OP retourne 'INSERT' natif).
--
-- Pas de changement de schéma, pas de risque sur les UPDATE/DELETE existants.
-- Le trigger reste SECURITY DEFINER, AFTER INSERT/UPDATE/DELETE comme avant.

CREATE OR REPLACE FUNCTION public.fn_log_audit_trail()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_old_values JSONB := NULL;
  v_new_values JSONB := NULL;
  v_user_id UUID;
  v_user_email TEXT;
  v_user_role TEXT;
  v_action TEXT;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NOT NULL THEN
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
    SELECT role INTO v_user_role FROM public.profiles WHERE id = v_user_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_old_values := to_jsonb(OLD);
    v_new_values := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_values := to_jsonb(OLD);
    v_new_values := to_jsonb(NEW);
  ELSIF TG_OP = 'INSERT' THEN
    v_old_values := NULL;
    v_new_values := to_jsonb(NEW);
  END IF;

  -- Map TG_OP natif PostgreSQL → vocabulaire du constraint check :
  --   INSERT → CREATE  (nouveauté de mig 408, fix le bug 23514)
  --   UPDATE → UPDATE
  --   DELETE → DELETE
  v_action := CASE TG_OP WHEN 'INSERT' THEN 'CREATE' ELSE TG_OP END;

  INSERT INTO public.audit_trail (
    user_id, user_email, user_role, action, table_name, row_id,
    old_values, new_values, description, created_at
  ) VALUES (
    v_user_id, v_user_email, v_user_role,
    v_action, TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    v_old_values, v_new_values,
    'Automatic audit log for ' || TG_TABLE_NAME || ' ' || TG_OP,
    NOW()
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

-- Pas besoin de DROP/RECREATE des triggers individuels : CREATE OR REPLACE
-- met à jour la fonction in-place, tous les triggers qui pointent vers
-- fn_log_audit_trail (trg_audit_bulletins_paie, trg_audit_ecritures_comptables_v2,
-- trg_audit_employes, trg_audit_factures, …) utilisent automatiquement
-- la nouvelle version dès le COMMIT de cette migration.

COMMENT ON FUNCTION public.fn_log_audit_trail() IS
  'Trigger d''audit automatique. Mappe TG_OP=INSERT vers action=CREATE pour '
  'respecter la CHECK constraint audit_trail_action_check (mig 408).';
