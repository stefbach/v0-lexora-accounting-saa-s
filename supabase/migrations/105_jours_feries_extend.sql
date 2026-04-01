-- ============================================================
-- Migration 105: Extend jours_feries table
-- Add societe_id, type_jour columns for multi-company + fixed/variable distinction
-- ============================================================

-- Drop the unique constraint on date (we need per-societe uniqueness)
ALTER TABLE public.jours_feries DROP CONSTRAINT IF EXISTS jours_feries_date_key;

-- Add new columns
ALTER TABLE public.jours_feries ADD COLUMN IF NOT EXISTS societe_id UUID REFERENCES public.societes(id);
ALTER TABLE public.jours_feries ADD COLUMN IF NOT EXISTS type_jour VARCHAR(20) DEFAULT 'fixe' CHECK (type_jour IN ('fixe', 'variable'));
ALTER TABLE public.jours_feries ADD COLUMN IF NOT EXISTS annee INT;

-- Backfill annee from date
UPDATE public.jours_feries SET annee = EXTRACT(YEAR FROM date)::INT WHERE annee IS NULL;

-- Add unique constraint per societe + date
ALTER TABLE public.jours_feries ADD CONSTRAINT jours_feries_societe_date_unique UNIQUE (societe_id, date);

-- Add write policy for admin roles (read policy already exists from migration 017)
DO $$ BEGIN
  CREATE POLICY "jours_feries_write" ON public.jours_feries
    FOR ALL USING (public.get_my_role() IN ('admin', 'super_admin', 'rh', 'rh_manager', 'client_admin'));
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
