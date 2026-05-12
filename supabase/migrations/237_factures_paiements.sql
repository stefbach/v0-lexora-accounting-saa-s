-- ═══════════════════════════════════════════════════════════════════════
-- Migration 237: Historique des paiements partiels de factures
--
-- Permet de tracer chaque versement reçu/émis pour une facture donnée
-- (versement manuel saisi par le comptable OU paiement détecté par le
-- rapprochement bancaire). Sans cette table, on ne pouvait afficher
-- qu'un solde courant (factures.solde_non_paye) sans historique.
--
-- Le trigger recalcule automatiquement factures.solde_non_paye et
-- bascule le statut entre 'en_attente' / 'partiel' / 'paye'.
--
-- Backfill : pour chaque facture déjà rapprochée (rapproche_releve_id IS
-- NOT NULL et solde_non_paye = 0), on crée un paiement historique
-- au montant TTC pour ne pas perdre l'information.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.factures_paiements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id    UUID NOT NULL REFERENCES public.factures(id) ON DELETE CASCADE,
  societe_id    UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  -- Montants
  montant       NUMERIC(15,2) NOT NULL CHECK (montant > 0),
  montant_mur   NUMERIC(15,2) NOT NULL CHECK (montant_mur > 0),
  devise        TEXT NOT NULL DEFAULT 'MUR',
  taux_change   NUMERIC(12,6) NOT NULL DEFAULT 1 CHECK (taux_change > 0),
  -- Méta
  date_paiement DATE NOT NULL,
  mode_paiement TEXT NOT NULL DEFAULT 'virement'
                CHECK (mode_paiement IN ('virement','cheque','espece','carte','prelevement','autre')),
  reference     TEXT,
  notes         TEXT,
  -- Liens comptables
  ecriture_id   UUID,                          -- BNQ associée (lien souple, écriture peut disparaître)
  rapproche_releve_id UUID,                    -- si origine = rapprochement bancaire
  source        TEXT NOT NULL DEFAULT 'manuel' -- 'manuel' | 'rapprochement' | 'backfill'
                CHECK (source IN ('manuel','rapprochement','backfill')),
  -- Audit
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_factures_paiements_facture
  ON public.factures_paiements(facture_id);
CREATE INDEX IF NOT EXISTS idx_factures_paiements_societe_date
  ON public.factures_paiements(societe_id, date_paiement DESC);

-- ── RLS scoped par société ──────────────────────────────────────────────
ALTER TABLE public.factures_paiements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "factures_paiements_select" ON public.factures_paiements;
CREATE POLICY "factures_paiements_select" ON public.factures_paiements
  FOR SELECT USING (
    societe_id IN (
      SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
      UNION
      SELECT d.societe_id FROM public.dossiers d WHERE d.client_id = auth.uid()
      UNION
      SELECT s.id FROM public.societes s WHERE s.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "factures_paiements_modify" ON public.factures_paiements;
CREATE POLICY "factures_paiements_modify" ON public.factures_paiements
  FOR ALL USING (
    societe_id IN (
      SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
      UNION
      SELECT d.societe_id FROM public.dossiers d WHERE d.client_id = auth.uid()
      UNION
      SELECT s.id FROM public.societes s WHERE s.created_by = auth.uid()
    )
  );

-- ── Trigger : recalcule factures.solde_non_paye + statut ────────────────
-- Logique : pour chaque mouvement (INSERT/UPDATE/DELETE) sur
-- factures_paiements, on recalcule SUM(montant_mur) pour la facture,
-- puis on positionne :
--   solde_non_paye = max(0, montant_mur_facture - somme_payée)
--   statut         = 'paye'      si somme >= ttc - 1 MUR
--                  | 'partiel'   si somme > 1 MUR
--                  | 'en_attente' sinon (et statut courant ∈ partiel/paye)
-- On respecte les statuts terminaux 'annule' (jamais touché) et 'retard'
-- (recalculé seulement si pas de paiement et date_echeance < today).
CREATE OR REPLACE FUNCTION public.recompute_facture_paiement_state()
RETURNS TRIGGER AS $$
DECLARE
  v_facture_id   UUID;
  v_societe_id   UUID;
  v_total_mur    NUMERIC(15,2);
  v_paye_mur     NUMERIC(15,2);
  v_solde        NUMERIC(15,2);
  v_statut_actuel TEXT;
  v_statut_cible  TEXT;
  v_echeance     DATE;
BEGIN
  v_facture_id := COALESCE(NEW.facture_id, OLD.facture_id);
  IF v_facture_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    COALESCE(f.montant_mur, f.montant_ttc, 0),
    f.statut,
    f.date_echeance,
    f.societe_id
  INTO v_total_mur, v_statut_actuel, v_echeance, v_societe_id
  FROM public.factures f
  WHERE f.id = v_facture_id;

  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Statut terminal 'annule' : on ne touche à rien
  IF v_statut_actuel = 'annule' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(montant_mur), 0)
  INTO v_paye_mur
  FROM public.factures_paiements
  WHERE facture_id = v_facture_id;

  v_solde := GREATEST(v_total_mur - v_paye_mur, 0);

  IF v_paye_mur >= (v_total_mur - 1) THEN
    v_statut_cible := 'paye';
  ELSIF v_paye_mur > 1 THEN
    v_statut_cible := 'partiel';
  ELSIF v_echeance IS NOT NULL AND v_echeance < CURRENT_DATE THEN
    v_statut_cible := 'retard';
  ELSE
    v_statut_cible := 'en_attente';
  END IF;

  UPDATE public.factures
  SET solde_non_paye = v_solde,
      statut         = v_statut_cible,
      updated_at     = NOW()
  WHERE id = v_facture_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_factures_paiements_recompute ON public.factures_paiements;
CREATE TRIGGER trg_factures_paiements_recompute
  AFTER INSERT OR UPDATE OR DELETE ON public.factures_paiements
  FOR EACH ROW EXECUTE FUNCTION public.recompute_facture_paiement_state();

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_factures_paiements_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_factures_paiements_updated_at ON public.factures_paiements;
CREATE TRIGGER trg_factures_paiements_updated_at
  BEFORE UPDATE ON public.factures_paiements
  FOR EACH ROW EXECUTE FUNCTION public.tg_factures_paiements_touch_updated_at();

-- ── Backfill : reconstitue l'historique pour les factures déjà payées ──
-- Cas 1 : rapproche_releve_id IS NOT NULL → 1 paiement au montant TTC
-- Cas 2 : statut='paye' sans rapprochement → 1 paiement marqué 'backfill'
-- On insère uniquement si aucun paiement n'existe déjà pour la facture
-- (idempotent en cas de re-run de la migration).
INSERT INTO public.factures_paiements (
  facture_id, societe_id, montant, montant_mur, devise, taux_change,
  date_paiement, mode_paiement, source, notes
)
SELECT
  f.id,
  f.societe_id,
  COALESCE(f.montant_ttc, 0),
  COALESCE(f.montant_mur, f.montant_ttc, 0),
  COALESCE(f.devise, 'MUR'),
  COALESCE(f.taux_change, 1),
  COALESCE(f.rapproche_date, f.date_facture, CURRENT_DATE),
  'virement',
  CASE WHEN f.rapproche_releve_id IS NOT NULL THEN 'rapprochement' ELSE 'backfill' END,
  'Paiement reconstitué automatiquement par migration 237'
FROM public.factures f
WHERE f.statut = 'paye'
  AND COALESCE(f.montant_ttc, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.factures_paiements fp WHERE fp.facture_id = f.id
  );

COMMENT ON TABLE  public.factures_paiements IS 'Historique des paiements (versements) reçus ou émis pour chaque facture. Le trigger recompute_facture_paiement_state synchronise factures.solde_non_paye et le statut.';
COMMENT ON COLUMN public.factures_paiements.source IS 'manuel = saisi via UI ; rapprochement = créé par /api/comptable/rapprochement ; backfill = reconstitué par migration 237.';
COMMENT ON COLUMN public.factures_paiements.ecriture_id IS 'Écriture BNQ générée par createEcrituresForPayment (lien souple, pas de FK pour permettre la suppression d''écriture sans casser l''historique de paiement).';
