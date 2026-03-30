-- Per-user module permissions
-- When NULL, use default permissions based on role
-- When set, overrides role-based permissions
-- Example: {"documents": true, "rh": true, "comptabilite": false, "facturation": false, "employe_portal": true, "fiscal": true, "etats_financiers": true}
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS modules_utilisateur JSONB DEFAULT NULL;

COMMENT ON COLUMN public.profiles.modules_utilisateur IS 'Per-user module permissions. NULL = use role defaults. JSONB with boolean flags per module.';
