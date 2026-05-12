-- ═══════════════════════════════════════════════════════════════════════
-- Migration 240: Renforce factures_contacts (UI contacts clients)
--
-- Aligne le schéma sur factures_catalogue :
--   • actif (BOOLEAN) → archivage logique sans casser les factures
--     historiques qui référencent le contact via factures.contact_id
--   • updated_at + trigger → suivre les modifications
--
-- La RLS a déjà été corrigée par la migration 239 (scopée par société).
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.factures_contacts
  ADD COLUMN IF NOT EXISTS actif      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION public.tg_factures_contacts_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_factures_contacts_updated_at ON public.factures_contacts;
CREATE TRIGGER trg_factures_contacts_updated_at
  BEFORE UPDATE ON public.factures_contacts
  FOR EACH ROW EXECUTE FUNCTION public.tg_factures_contacts_touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_factures_contacts_societe_actif
  ON public.factures_contacts(societe_id, actif)
  WHERE actif = TRUE;

-- Index sur (societe_id, lower(nom)) pour l'autocomplete sans cassage de casse
CREATE INDEX IF NOT EXISTS idx_factures_contacts_nom_lower
  ON public.factures_contacts(societe_id, lower(nom));

COMMENT ON COLUMN public.factures_contacts.actif IS 'Permet d''archiver un contact sans le supprimer (préserve factures.contact_id historiques).';
