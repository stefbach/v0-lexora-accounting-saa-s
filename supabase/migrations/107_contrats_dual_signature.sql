-- ============================================================
-- 107 — Signature double : employé + dirigeant
-- ============================================================

ALTER TABLE public.contrats_employes
  -- Séparer les champs signature employé
  ADD COLUMN IF NOT EXISTS date_signature_employe   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ip_signature_employe     TEXT,
  ADD COLUMN IF NOT EXISTS token_signature_employe  TEXT,

  -- Signature dirigeant
  ADD COLUMN IF NOT EXISTS date_signature_dirigeant TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ip_signature_dirigeant   TEXT,
  ADD COLUMN IF NOT EXISTS signe_par_id             UUID REFERENCES auth.users(id);

-- Migrer les données existantes (anciens champs → nouveaux)
UPDATE public.contrats_employes
SET
  date_signature_employe  = date_signature,
  ip_signature_employe    = ip_signature,
  token_signature_employe = token_signature
WHERE date_signature IS NOT NULL;

-- Mettre à jour le CHECK statut pour inclure les nouveaux états
ALTER TABLE public.contrats_employes
  DROP CONSTRAINT IF EXISTS contrats_employes_statut_check;

ALTER TABLE public.contrats_employes
  ADD CONSTRAINT contrats_employes_statut_check
  CHECK (statut IN ('brouillon','signe_employe','signe','expire','resilie'));

-- Note : 'signe' = les deux parties ont signé (rétrocompatible)
-- 'signe_employe' = en attente contresignature dirigeant

COMMENT ON COLUMN public.contrats_employes.date_signature_employe   IS 'Date signature électronique employé';
COMMENT ON COLUMN public.contrats_employes.date_signature_dirigeant IS 'Date contresignature dirigeant';
COMMENT ON COLUMN public.contrats_employes.signe_par_id             IS 'UUID auth du dirigeant signataire';
