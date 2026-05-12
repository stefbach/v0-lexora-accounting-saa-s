-- ═══════════════════════════════════════════════════════════════════════
-- Migration 246: Adresse structurée + numéros multiples sur contacts
--
-- Demande utilisateur : "dans le contact client il faut pouvoir
-- récupérer dans les bons champs les adresses, code postal, et au cas
-- où autre numéro".
--
-- Avant : adresse était un TEXT libre dans factures_contacts. Quand
-- l'OCR extrayait "12 Royal Road, Port Louis, 11328, Mauritius",
-- tout était collé dans un seul champ → impossible de filtrer par
-- ville/pays, de pré-remplir un formulaire postal, etc.
--
-- Cette migration ajoute :
--   • code_postal — ZIP / postcode (5-10 caractères)
--   • ville       — nom de la ville
--   • pays        — nom du pays ou code ISO
--   • mobile      — numéro mobile (le champ telephone existant reste
--                   pour le fixe / pro)
--   • fax         — encore utilisé par certaines admin / banques
--
-- Le champ `adresse` reste pour la ligne d'adresse (rue + numéro).
-- L'OCR (mig 244 + prompts) est mis à jour en parallèle pour extraire
-- ces champs séparément.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.factures_contacts
  ADD COLUMN IF NOT EXISTS code_postal TEXT,
  ADD COLUMN IF NOT EXISTS ville       TEXT,
  ADD COLUMN IF NOT EXISTS pays        TEXT,
  ADD COLUMN IF NOT EXISTS mobile      TEXT,
  ADD COLUMN IF NOT EXISTS fax         TEXT;

COMMENT ON COLUMN public.factures_contacts.code_postal IS 'Code postal / ZIP. Format libre (5-10 caractères). Maurice : 5 chiffres (ex. 11328).';
COMMENT ON COLUMN public.factures_contacts.ville       IS 'Ville du contact (Port Louis, Curepipe, Paris, etc.).';
COMMENT ON COLUMN public.factures_contacts.pays        IS 'Pays du contact. Nom complet en français ou code ISO 3166-1 alpha-2 (MU, FR, etc.).';
COMMENT ON COLUMN public.factures_contacts.mobile      IS 'Numéro de mobile, distinct du champ `telephone` (fixe / standard).';
COMMENT ON COLUMN public.factures_contacts.fax         IS 'Numéro de fax — toujours requis pour certaines admin / clients institutionnels.';

-- Index ville pour le filtrage / regroupement
CREATE INDEX IF NOT EXISTS idx_factures_contacts_ville
  ON public.factures_contacts(societe_id, lower(ville))
  WHERE ville IS NOT NULL;

-- Idem pour `tiers_annuaire` (alimenté par OCR) — symétrie avec mig 244
ALTER TABLE public.tiers_annuaire
  ADD COLUMN IF NOT EXISTS code_postal TEXT,
  ADD COLUMN IF NOT EXISTS ville       TEXT,
  ADD COLUMN IF NOT EXISTS mobile      TEXT,
  ADD COLUMN IF NOT EXISTS fax         TEXT;
-- pays existe déjà sur tiers_annuaire (mig 128)

NOTIFY pgrst, 'reload schema';
