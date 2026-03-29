-- Migration 036: Add column aliases for backward compatibility (nic, tan)
-- Some API routes reference employes.nic and employes.tan but the actual columns are nic_number and tan_number.

ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS nic TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS tan TEXT;

-- Copy existing data
UPDATE public.employes SET nic = nic_number WHERE nic IS NULL AND nic_number IS NOT NULL;
UPDATE public.employes SET tan = tan_number WHERE tan IS NULL AND tan_number IS NOT NULL;
