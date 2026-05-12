-- ═══════════════════════════════════════════════════════════════════════
-- Migration 245: Enrichissement factures_contacts (BRN/KBIS + champs OCR)
--
-- Demande utilisateur : "le fichier client doit comprendre toutes les
-- adresses et toutes les informations des clients disponible, en cas
-- BRN ou KBIS ou autre et numéro de TVA du client si on le récupère".
--
-- Avant : factures_contacts (mig 042) avait vat_number mais pas brn.
-- Conséquence : quand l'OCR extrayait un BRN ou un KBIS d'une facture,
-- l'info était stockée dans tiers_annuaire mais perdait au moment de
-- l'import dans le carnet contacts.
--
-- Cette migration ajoute :
--   • brn (Business Registration Number — Maurice)
--   • kbis (KBIS / SIREN / autre identifiant légal pour clients étrangers)
--   • site_web (souvent visible sur l'en-tête de facture)
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.factures_contacts
  ADD COLUMN IF NOT EXISTS brn       TEXT,
  ADD COLUMN IF NOT EXISTS kbis      TEXT,
  ADD COLUMN IF NOT EXISTS site_web  TEXT;

COMMENT ON COLUMN public.factures_contacts.brn      IS 'Business Registration Number (Maurice). Format C12345678. Extrait par OCR si visible.';
COMMENT ON COLUMN public.factures_contacts.kbis     IS 'Identifiant légal pour clients étrangers (KBIS France, SIREN, Companies House, etc.).';
COMMENT ON COLUMN public.factures_contacts.site_web IS 'URL site web du client, affichée optionnellement sur les factures.';

-- Index recherche par BRN (utile pour dédupliquer entre tiers_annuaire et
-- factures_contacts lors de l'import).
CREATE INDEX IF NOT EXISTS idx_factures_contacts_brn
  ON public.factures_contacts(societe_id, brn)
  WHERE brn IS NOT NULL;

NOTIFY pgrst, 'reload schema';
