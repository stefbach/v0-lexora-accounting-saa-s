-- =====================================================================
-- Migration 433 — Fix trigger bulletin immutability pour rôles RH élargis
-- =====================================================================
-- BUG : la migration 427 utilise _cloture_is_admin_override() qui ne
-- reconnaît que les rôles 'admin' et 'super_admin'. Mais l'endpoint
-- /api/rh/paie/[id]/decomptabiliser a été élargi (PR #264) aux rôles
-- 'rh', 'rh_manager', 'direction', 'client_admin'.
--
-- Résultat en prod : un utilisateur RH qui clique "Décomptabiliser" via
-- l'UI déclenche bien l'API qui passe is_comptabilise TRUE → FALSE, mais
-- le trigger BEFORE UPDATE le rejette avec :
--   "Bulletin déjà comptabilisé (id=..., ecriture_id=...) — modification interdite"
--
-- FIX : helper dédié _bulletin_is_authorized_decomptabilisation_role()
-- qui retourne TRUE pour la whitelist élargie. Le trigger
-- check_bulletin_comptabilise_immutable accepte désormais une transition
-- explicite TRUE → FALSE de is_comptabilise pour ces rôles.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._bulletin_is_authorized_decomptabilisation_role()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = auth.uid()
       AND role IN ('admin', 'super_admin', 'rh', 'rh_manager', 'direction', 'client_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.check_bulletin_comptabilise_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_is_decompta_role BOOLEAN;
  v_is_decompta_transition BOOLEAN;
BEGIN
  -- Si bulletin n'était pas comptabilisé → on laisse passer
  IF COALESCE(OLD.is_comptabilise, FALSE) = FALSE THEN
    RETURN NEW;
  END IF;

  -- Rôles
  v_is_admin := EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  );
  v_is_decompta_role := public._bulletin_is_authorized_decomptabilisation_role();

  -- Détection : transition de décomptabilisation explicite (TRUE → FALSE)
  v_is_decompta_transition := (
    OLD.is_comptabilise = TRUE
    AND NEW.is_comptabilise = FALSE
  );

  -- CAS 1 : Décomptabilisation légitime (TRUE → FALSE) par rôle autorisé
  IF v_is_decompta_transition AND v_is_decompta_role THEN
    -- Audit léger
    BEGIN
      INSERT INTO public.bulletin_decomptabilisation_log (
        bulletin_id, ecriture_id_avant, action, user_id, raison, created_at
      ) VALUES (
        OLD.id, OLD.ecriture_id,
        CASE WHEN v_is_admin THEN 'admin_decomptabilisation' ELSE 'rh_decomptabilisation_trigger' END,
        auth.uid(),
        'Décomptabilisation via trigger (transition explicite is_comptabilise TRUE→FALSE)',
        NOW()
      );
    EXCEPTION WHEN OTHERS THEN
      -- best-effort, ne bloque pas la décomptabilisation si le log fail
      NULL;
    END;
    RETURN NEW;
  END IF;

  -- CAS 2 : Modification cosmétique (champs financiers inchangés)
  IF (
    NEW.is_comptabilise = OLD.is_comptabilise
    AND NEW.ecriture_id IS NOT DISTINCT FROM OLD.ecriture_id
    AND COALESCE(NEW.salaire_brut, 0) = COALESCE(OLD.salaire_brut, 0)
    AND COALESCE(NEW.salaire_net, 0) = COALESCE(OLD.salaire_net, 0)
  ) THEN
    RETURN NEW;
  END IF;

  -- CAS 3 : Override admin Lexora — autorisé avec audit
  IF v_is_admin THEN
    BEGIN
      INSERT INTO public.bulletin_decomptabilisation_log (
        bulletin_id, ecriture_id_avant, action, user_id, raison, created_at
      ) VALUES (
        OLD.id, OLD.ecriture_id, 'admin_override_modify', auth.uid(),
        'Modification admin override sur bulletin comptabilisé', NOW()
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN NEW;
  END IF;

  -- CAS 4 : Rejet
  RAISE EXCEPTION
    'Bulletin déjà comptabilisé (id=%, ecriture_id=%) — modification interdite. '
    'Pour décomptabiliser, utiliser POST /api/rh/paie/%/decomptabiliser ou '
    'demander à un admin Lexora.',
    OLD.id, OLD.ecriture_id, OLD.id
    USING ERRCODE = 'check_violation',
          HINT    = 'Cette opération nécessite un rôle admin/rh/direction/client_admin.';
END;
$$;

DO $$ BEGIN
  RAISE NOTICE '[433] Trigger immutabilité bulletin : décomptabilisation autorisée pour rh/rh_manager/direction/client_admin/admin/super_admin';
END $$;
