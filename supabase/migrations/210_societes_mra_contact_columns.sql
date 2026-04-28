-- 210_societes_mra_contact_columns.sql
-- Ajoute les 4 colonnes de contact MRA (déclarant) sur societes pour le
-- format PACO (en-tête déclarant Joint PACO Dec 2024).
--
-- Champs MRA officiels :
--   - Telephone Number   : 7 chiffres (optionnel si Mobile rempli)
--   - Mobile Number      : 8 chiffres commençant par 5 (optionnel si Telephone rempli)
--   - Name of Declarant  : 80 caractères max
--   - Email Address      : email valide
--
-- Ces colonnes sont distinctes des colonnes contact existantes (contact_name,
-- telephone, email — mig 046) car le déclarant MRA peut être différent du
-- contact général de la société. Si NULL, le générateur PACO retombera sur
-- les colonnes legacy avec parsing approprié (extraction 8 chiffres mobile
-- depuis "+230 5249 1043" → "52491043").
--
-- Pas de seed : les valeurs seront renseignées via UI (/rh/societe) ou
-- via Supabase MCP côté admin.

ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS mra_telephone      TEXT,
  ADD COLUMN IF NOT EXISTS mra_mobile         TEXT,
  ADD COLUMN IF NOT EXISTS mra_declarant_name TEXT,
  ADD COLUMN IF NOT EXISTS mra_email          TEXT;

COMMENT ON COLUMN public.societes.mra_telephone      IS 'PACO MRA — Telephone Number (7 chiffres). Optionnel si mra_mobile rempli.';
COMMENT ON COLUMN public.societes.mra_mobile         IS 'PACO MRA — Mobile Number (8 chiffres, commence par 5). Optionnel si mra_telephone rempli.';
COMMENT ON COLUMN public.societes.mra_declarant_name IS 'PACO MRA — Name of Declarant (80 chars max). Personne déclarante au MRA.';
COMMENT ON COLUMN public.societes.mra_email          IS 'PACO MRA — Email Address du déclarant. Doit être valide.';
