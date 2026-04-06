-- Migration 114: Add manager_id to groupes_employes
-- Allows RH/Direction to assign a manager to each group
ALTER TABLE public.groupes_employes ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES public.employes(id);
ALTER TABLE public.groupes_employes ADD COLUMN IF NOT EXISTS manager_user_id UUID;
