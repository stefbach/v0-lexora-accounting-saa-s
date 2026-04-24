-- ═══════════════════════════════════════════════════════════════
-- Migration 187 — G8 Phase 1 : Provisions congés payés IAS 19
--
-- Périmètre strict :
--   - Ajout d'un coefficient charges patronales sur societes
--   - Création compte 4287 "Provisions congés payés (passif)" (global)
--   - Le compte 6417 "Indemnités compensatrices et de départ" existe
--     déjà (global) → concept compatible, pas de duplication
--   - Table ias19_provisions_conges_snapshots (historisation mensuelle)
--   - RPC calculer_provision_conges_ias19(societe_id, date)
--   - RLS admin + rh
--
-- Ne touche PAS :
--   - bulletins_paie, generer_ecritures_paie
--   - autres provisions (EOY Bonus, severance)
--   - écritures comptables existantes
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Compte passif 4287 (global) ────────────────────────────────
INSERT INTO public.plan_comptable (compte, libelle, type_compte, sens_normal, compte_parent, niveau, actif)
SELECT '4287', 'Provisions congés payés (passif court terme) — IAS 19', 'passif', 'C', '428', 2, TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.plan_comptable WHERE compte = '4287');

-- Le compte 6417 "Indemnités compensatrices et de départ" existe déjà
-- globalement et sert de charge pour la provision IAS 19.

-- ─── 2. Paramètre société : coefficient charges patronales ─────────
ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS ias19_charges_patronales_pct NUMERIC DEFAULT 0.13;

COMMENT ON COLUMN public.societes.ias19_charges_patronales_pct IS
  'G8 — Coefficient charges patronales pour provision congés IAS 19. Défaut 13% (CSG 3-6 + NSF 2.5 + HRDC 1 + PRGF 4.5).';

-- ─── 3. Table snapshot historique ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ias19_provisions_conges_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  date_snapshot DATE NOT NULL,

  -- Détail par employé (JSONB pour flexibilité)
  -- [{ employe_id, nom, al_acquis, al_pris, al_non_pris,
  --    salaire_base, cout_journalier_charge, provision_mur }, ...]
  details_par_employe JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Totaux
  provision_total_mur NUMERIC NOT NULL DEFAULT 0,
  charges_patronales_pct NUMERIC NOT NULL DEFAULT 0.13,

  -- Écritures comptables liées (dans ecritures_comptables_v2)
  ecriture_debit_id UUID,
  ecriture_credit_id UUID,
  ecriture_extourne_debit_id UUID,
  ecriture_extourne_credit_id UUID,

  -- Statut
  statut TEXT NOT NULL DEFAULT 'calcule',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (societe_id, date_snapshot)
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ias19_snapshots_statut_check'
  ) THEN
    ALTER TABLE public.ias19_provisions_conges_snapshots
      ADD CONSTRAINT ias19_snapshots_statut_check
      CHECK (statut IN ('calcule', 'comptabilise', 'extourne', 'annule'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ias19_societe_date
  ON public.ias19_provisions_conges_snapshots(societe_id, date_snapshot DESC);
CREATE INDEX IF NOT EXISTS idx_ias19_statut
  ON public.ias19_provisions_conges_snapshots(statut);

COMMENT ON TABLE public.ias19_provisions_conges_snapshots IS
  'G8 Phase 1 — Snapshot mensuel provision congés payés IAS 19 par société.';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_ias19_snapshots_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ias19_snapshots_updated_at
  ON public.ias19_provisions_conges_snapshots;
CREATE TRIGGER trg_ias19_snapshots_updated_at
  BEFORE UPDATE ON public.ias19_provisions_conges_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_ias19_snapshots_updated_at();

-- ─── 4. RLS ────────────────────────────────────────────────────────
ALTER TABLE public.ias19_provisions_conges_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ias19 admin rh all"
  ON public.ias19_provisions_conges_snapshots;
CREATE POLICY "ias19 admin rh all"
  ON public.ias19_provisions_conges_snapshots
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'rh'))
  WITH CHECK (public.get_my_role() IN ('admin', 'rh'));

-- ─── 5. RPC calculer_provision_conges_ias19 ────────────────────────
-- Retourne ligne par employé actif à la date snapshot :
--   al_non_pris × salaire_base × (1 + charges_pct) / 22
-- soldes_conges n'a pas de societe_id → jointure via employes.
CREATE OR REPLACE FUNCTION public.calculer_provision_conges_ias19(
  p_societe_id UUID,
  p_date_snapshot DATE DEFAULT (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE
) RETURNS TABLE (
  employe_id UUID,
  employe_nom TEXT,
  al_acquis NUMERIC,
  al_pris NUMERIC,
  al_non_pris NUMERIC,
  salaire_base NUMERIC,
  cout_journalier_charge NUMERIC,
  provision_mur NUMERIC
) LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  v_charges_pct NUMERIC;
BEGIN
  SELECT COALESCE(ias19_charges_patronales_pct, 0.13) INTO v_charges_pct
  FROM public.societes WHERE id = p_societe_id;

  IF v_charges_pct IS NULL THEN
    v_charges_pct := 0.13;
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    TRIM(COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, ''))::TEXT,
    COALESCE(sc.al_acquis, 0)::NUMERIC,
    COALESCE(sc.al_pris, 0)::NUMERIC,
    GREATEST(COALESCE(sc.al_acquis, 0) - COALESCE(sc.al_pris, 0), 0)::NUMERIC,
    COALESCE(e.salaire_base, 0)::NUMERIC,
    ROUND((COALESCE(e.salaire_base, 0) * (1 + v_charges_pct) / 22)::NUMERIC, 2),
    ROUND((
      GREATEST(COALESCE(sc.al_acquis, 0) - COALESCE(sc.al_pris, 0), 0)
      * COALESCE(e.salaire_base, 0) * (1 + v_charges_pct) / 22
    )::NUMERIC, 2)
  FROM public.employes e
  LEFT JOIN public.soldes_conges sc
    ON sc.employe_id = e.id
    AND sc.periode_debut <= p_date_snapshot
    AND sc.periode_fin   >= p_date_snapshot
  WHERE e.societe_id = p_societe_id
    AND (e.date_depart IS NULL OR e.date_depart > p_date_snapshot)
  ORDER BY e.nom NULLS LAST, e.prenom NULLS LAST;
END $fn$;

COMMENT ON FUNCTION public.calculer_provision_conges_ias19 IS
  'G8 Phase 1 — Calcul provision IAS 19 congés payés par employé d''une société. Formule : al_non_pris × (salaire_base × (1+charges_pct) / 22).';
