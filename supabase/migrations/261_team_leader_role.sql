-- ═══════════════════════════════════════════════════════════════════════
-- Migration 261 — Nouveau rôle "team_leader"
--
-- Demande utilisateur : "creer une fonction team leader qui a les mêmes
-- attributs que manager".
--
-- Le rôle team_leader hérite des permissions manager :
--   - accès lecture/modification au pointage des employés de son groupe
--   - accès lecture/modification au planning de son groupe
--   - utilise la colonne `groupe_gere_id` (mig 045) pour le scope
--
-- Cette migration met à jour les contraintes CHECK pour autoriser la
-- nouvelle valeur de rôle. Aucune modification de RLS — la logique de
-- scope est gérée au niveau applicatif via lib/rh/ownership.ts.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- profiles.role : ajouter team_leader à la liste autorisée
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'admin',
    'super_admin',
    'client',
    'client_user',
    'client_admin',
    'client_assistant',
    'comptable',
    'comptable_dedie',
    'rh',
    'rh_manager',
    'juridique',
    'employe',
    'salarie',
    'manager',
    'team_leader',
    'direction'
  ));

-- ─────────────────────────────────────────────────────────────────────
-- user_societes.role (multi-tenant) : autoriser team_leader aussi
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'user_societes'
      AND constraint_name = 'user_societes_role_check'
  ) THEN
    ALTER TABLE public.user_societes DROP CONSTRAINT user_societes_role_check;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_societes' AND column_name = 'role'
  ) THEN
    ALTER TABLE public.user_societes ADD CONSTRAINT user_societes_role_check
      CHECK (role IN (
        'admin','super_admin','client','client_user','client_admin','client_assistant',
        'comptable','comptable_dedie','rh','rh_manager','juridique',
        'employe','salarie','manager','team_leader','direction'
      ));
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
