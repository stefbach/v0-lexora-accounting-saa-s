-- ═══════════════════════════════════════════════════════════════════════
-- Migration 239: Renforce factures_catalogue (UI catalogue produits/services)
--
-- 1. Ajoute la colonne `unite` (ex: 'Forfait', 'Heure', 'Jour') déjà utilisée
--    par les lignes de facture mais qui n'était pas persistée.
-- 2. Ajoute `actif` pour permettre l'archivage sans suppression (préserve
--    l'historique des factures qui référencent l'article).
-- 3. Ajoute `updated_at` + trigger pour suivre les modifications.
-- 4. Resserre la RLS : remplace `auth.uid() IS NOT NULL` (qui permettait à
--    tout utilisateur authentifié de voir TOUS les catalogues) par une
--    politique scopée par société (user_societes + dossiers + created_by).
--
-- Note : la même opération est appliquée à `factures_contacts` qui souffrait
-- du même problème de RLS trop permissive.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Colonnes manquantes ─────────────────────────────────────────────
ALTER TABLE public.factures_catalogue
  ADD COLUMN IF NOT EXISTS unite      TEXT NOT NULL DEFAULT 'Forfait',
  ADD COLUMN IF NOT EXISTS actif      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ── 2. Trigger updated_at ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_factures_catalogue_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_factures_catalogue_updated_at ON public.factures_catalogue;
CREATE TRIGGER trg_factures_catalogue_updated_at
  BEFORE UPDATE ON public.factures_catalogue
  FOR EACH ROW EXECUTE FUNCTION public.tg_factures_catalogue_touch_updated_at();

-- ── 3. Index pour le filtrage par société + actif ──────────────────────
CREATE INDEX IF NOT EXISTS idx_factures_catalogue_societe_actif
  ON public.factures_catalogue(societe_id, actif)
  WHERE actif = TRUE;

-- ── 4. RLS scopée par société (factures_catalogue) ─────────────────────
DROP POLICY IF EXISTS "fcat_auth" ON public.factures_catalogue;

DROP POLICY IF EXISTS "factures_catalogue_select" ON public.factures_catalogue;
CREATE POLICY "factures_catalogue_select" ON public.factures_catalogue
  FOR SELECT USING (
    societe_id IN (
      SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
      UNION
      SELECT d.societe_id FROM public.dossiers d WHERE d.client_id = auth.uid()
      UNION
      SELECT s.id FROM public.societes s WHERE s.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "factures_catalogue_modify" ON public.factures_catalogue;
CREATE POLICY "factures_catalogue_modify" ON public.factures_catalogue
  FOR ALL USING (
    societe_id IN (
      SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
      UNION
      SELECT d.societe_id FROM public.dossiers d WHERE d.client_id = auth.uid()
      UNION
      SELECT s.id FROM public.societes s WHERE s.created_by = auth.uid()
    )
  );

-- ── 5. RLS scopée par société (factures_contacts) — même fix ───────────
DROP POLICY IF EXISTS "fc_auth" ON public.factures_contacts;

DROP POLICY IF EXISTS "factures_contacts_select" ON public.factures_contacts;
CREATE POLICY "factures_contacts_select" ON public.factures_contacts
  FOR SELECT USING (
    societe_id IN (
      SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
      UNION
      SELECT d.societe_id FROM public.dossiers d WHERE d.client_id = auth.uid()
      UNION
      SELECT s.id FROM public.societes s WHERE s.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "factures_contacts_modify" ON public.factures_contacts;
CREATE POLICY "factures_contacts_modify" ON public.factures_contacts
  FOR ALL USING (
    societe_id IN (
      SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
      UNION
      SELECT d.societe_id FROM public.dossiers d WHERE d.client_id = auth.uid()
      UNION
      SELECT s.id FROM public.societes s WHERE s.created_by = auth.uid()
    )
  );

COMMENT ON COLUMN public.factures_catalogue.unite IS 'Unité par défaut affichée sur la ligne de facture (Forfait, Heure, Jour, etc.). Modifiable côté facture.';
COMMENT ON COLUMN public.factures_catalogue.actif IS 'Permet d''archiver un service sans le supprimer (préserve les références des factures historiques).';
