-- =============================================================================
-- 442_crm_permissions.sql
-- Permissions fines par action pour le module CRM Prospection
-- =============================================================================
-- Le module CRM est déjà réservé aux rôles admin / super_admin / commercial
-- (migration 441 + layout). Cette migration ajoute un contrôle FIN par action
-- pour les utilisateurs 'commercial' :
--
--   - can_view    : consulter les prospects / lancer une recherche
--   - can_import  : importer / garder des sociétés en base
--   - can_enrich  : lancer un enrichissement IA (CONSOMME des crédits)
--   - can_delete  : supprimer des prospects / contacts
--
-- Les rôles admin / super_admin ont TOUJOURS toutes les permissions
-- (résolu applicativement dans lib/crm/permissions.ts — pas besoin de ligne).
--
-- Sans ligne pour un 'commercial', le défaut applicatif est :
--   view = true, import = true, enrich = false, delete = false
-- (conservateur sur les actions coûteuses / destructives).
-- =============================================================================

CREATE TABLE IF NOT EXISTS crm_permissions (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  can_view    BOOLEAN NOT NULL DEFAULT TRUE,
  can_import  BOOLEAN NOT NULL DEFAULT TRUE,
  can_enrich  BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete  BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE crm_permissions IS
  'CRM — permissions fines par action pour les utilisateurs commerciaux.';

-- -----------------------------------------------------------------------------
-- Helper : user_is_lexora_admin()
-- TRUE si l'utilisateur courant est admin / super_admin (gestion des perms).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION user_is_lexora_admin() RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
  );
$$;

REVOKE EXECUTE ON FUNCTION user_is_lexora_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION user_is_lexora_admin() TO authenticated;

-- -----------------------------------------------------------------------------
-- updated_at auto (réutilise crm_touch_updated_at de la migration 441)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_crm_permissions_updated ON crm_permissions;
CREATE TRIGGER trg_crm_permissions_updated
  BEFORE UPDATE ON crm_permissions
  FOR EACH ROW EXECUTE FUNCTION crm_touch_updated_at();

-- -----------------------------------------------------------------------------
-- RLS : un utilisateur lit sa propre ligne ; seuls les admins gèrent toutes.
-- -----------------------------------------------------------------------------
ALTER TABLE crm_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_permissions_self_read ON crm_permissions;
CREATE POLICY crm_permissions_self_read ON crm_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_is_lexora_admin());

DROP POLICY IF EXISTS crm_permissions_admin_write ON crm_permissions;
CREATE POLICY crm_permissions_admin_write ON crm_permissions
  FOR ALL TO authenticated
  USING (user_is_lexora_admin())
  WITH CHECK (user_is_lexora_admin());

-- =============================================================================
-- FIN 442
-- =============================================================================
