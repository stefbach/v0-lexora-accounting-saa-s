-- Migration 111: Add UNIQUE constraint on plannings(societe_id, periode)
-- Required for upsert to work when saving/publishing plannings
ALTER TABLE public.plannings ADD CONSTRAINT plannings_societe_periode_unique UNIQUE (societe_id, periode);
