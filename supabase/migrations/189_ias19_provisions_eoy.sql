-- ═══════════════════════════════════════════════════════════════
-- Migration 189 — G8 Phase 2 : Provisions EOY Bonus IAS 19 (mensualisées)
--
-- Étale la charge du 13e mois sur jan-nov. Chaque fin de mois N :
--   provision_cumulée_N = earnings_jan_à_N / 12 × N
--   provision_du_mois_N = provision_cumulée_N - provision_cumulée_N-1
-- Décembre : paiement réel via G11 (hors scope ici).
--
-- Comptes dédiés IAS 19 :
--   64176 (charge, sous-compte de 6417)
--   4288  (passif,  sous-compte de 428)
--
-- Ne touche pas :
--   - bulletins_paie / generer_ecritures_paie
--   - compte 6416 "13e mois — EOY Bonus" existant (paiement réel G11)
--   - G8 Phase 1 (64175 / 4287 pour congés)
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Comptes dédiés ─────────────────────────────────────────────
INSERT INTO public.plan_comptable
  (compte, libelle, type_compte, sens_normal, compte_parent, niveau, actif)
VALUES
  ('64176', 'Provisions EOY Bonus (charge) — IAS 19',             'charge', 'D', '6417', 5, TRUE),
  ('4288',  'Provisions EOY Bonus (passif court terme) — IAS 19', 'passif', 'C', '428',  4, TRUE)
ON CONFLICT (compte) DO UPDATE SET
  libelle       = EXCLUDED.libelle,
  type_compte   = EXCLUDED.type_compte,
  sens_normal   = EXCLUDED.sens_normal,
  compte_parent = EXCLUDED.compte_parent,
  niveau        = EXCLUDED.niveau,
  actif         = EXCLUDED.actif;

-- ─── 2. Table snapshot mensuel ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ias19_provisions_eoy_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  date_snapshot DATE NOT NULL,
  annee INTEGER NOT NULL,
  mois INTEGER NOT NULL CHECK (mois BETWEEN 1 AND 12),

  -- [{ employe_id, employe_nom, salaire_base, nb_mois_travailles,
  --    earnings_cumulees, provision_cumulee, provision_du_mois,
  --    eligible, motif_non_eligible }]
  details_par_employe JSONB NOT NULL DEFAULT '[]'::jsonb,

  provision_cumulee_total NUMERIC NOT NULL DEFAULT 0,
  provision_du_mois_total NUMERIC NOT NULL DEFAULT 0,
  nb_employes_eligibles INTEGER DEFAULT 0,

  -- Écritures (UUID non-FK : ecritures_comptables_v2 est la table physique)
  ecriture_debit_id UUID,
  ecriture_credit_id UUID,
  ecriture_extourne_debit_id UUID,
  ecriture_extourne_credit_id UUID,

  statut TEXT NOT NULL DEFAULT 'calcule',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (societe_id, annee, mois)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ias19_eoy_statut_check') THEN
    ALTER TABLE public.ias19_provisions_eoy_snapshots
      ADD CONSTRAINT ias19_eoy_statut_check
      CHECK (statut IN ('calcule', 'comptabilise', 'extourne', 'annule'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ias19_eoy_societe_periode
  ON public.ias19_provisions_eoy_snapshots(societe_id, annee DESC, mois DESC);
CREATE INDEX IF NOT EXISTS idx_ias19_eoy_statut
  ON public.ias19_provisions_eoy_snapshots(statut);

COMMENT ON TABLE public.ias19_provisions_eoy_snapshots IS
  'G8 Phase 2 — Snapshot mensuel provision IAS 19 EOY Bonus (mois 1-11).';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_ias19_eoy_snapshots_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ias19_eoy_updated_at
  ON public.ias19_provisions_eoy_snapshots;
CREATE TRIGGER trg_ias19_eoy_updated_at
  BEFORE UPDATE ON public.ias19_provisions_eoy_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_ias19_eoy_snapshots_updated_at();

-- ─── 3. RLS admin + rh ─────────────────────────────────────────────
ALTER TABLE public.ias19_provisions_eoy_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ias19 eoy admin rh all" ON public.ias19_provisions_eoy_snapshots;
CREATE POLICY "ias19 eoy admin rh all"
  ON public.ias19_provisions_eoy_snapshots
  FOR ALL
  USING (public.get_my_role() IN ('admin', 'rh'))
  WITH CHECK (public.get_my_role() IN ('admin', 'rh'));

-- ─── 4. RPC : calcul provision EOY jan-nov ─────────────────────────
-- Renvoie earnings_cumulees + provision_cumulee (pas de delta : calculé en TS
-- à partir du snapshot du mois précédent).
CREATE OR REPLACE FUNCTION public.calculer_provision_eoy_ias19(
  p_societe_id UUID,
  p_annee INTEGER,
  p_mois INTEGER
) RETURNS TABLE (
  employe_id UUID,
  employe_nom TEXT,
  salaire_base NUMERIC,
  nb_mois_travailles NUMERIC,
  earnings_cumulees NUMERIC,
  provision_cumulee NUMERIC,
  eligible BOOLEAN,
  motif_non_eligible TEXT
) LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  v_seuil NUMERIC;
  v_inclut_hors_seuil BOOLEAN;
  v_date_debut DATE;
  v_date_fin   DATE;
BEGIN
  IF p_mois < 1 OR p_mois > 11 THEN
    RAISE EXCEPTION 'Provision EOY calculée uniquement pour les mois 1-11 (décembre = paiement réel)';
  END IF;

  SELECT COALESCE(eoy_bonus_seuil_max, 100000),
         COALESCE(eoy_bonus_inclut_hors_seuil, FALSE)
    INTO v_seuil, v_inclut_hors_seuil
  FROM public.societes WHERE id = p_societe_id;

  v_date_debut := MAKE_DATE(p_annee, 1, 1);
  v_date_fin   := (MAKE_DATE(p_annee, p_mois, 1) + INTERVAL '1 month - 1 day')::DATE;

  RETURN QUERY
  WITH base AS (
    SELECT
      e.id AS emp_id,
      TRIM(COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, ''))::TEXT AS emp_nom,
      COALESCE(e.salaire_base, 0) AS salaire_base_v,
      e.date_arrivee,
      e.date_depart,
      COALESCE(SUM(
        COALESCE(b.salaire_brut, 0)
        + COALESCE(b.heures_sup_montant, 0)
        + COALESCE(b.disturbance_allowance, 0)
      ), 0) AS earnings_cumul,
      -- Mois travaillés jan → fin du mois courant (borné par date_arrivee / date_depart)
      GREATEST(
        ROUND(
          (EXTRACT(EPOCH FROM (
            LEAST(COALESCE(e.date_depart, v_date_fin), v_date_fin)::timestamp
            - GREATEST(e.date_arrivee, v_date_debut)::timestamp
          )) / (30.4375 * 86400))::NUMERIC
        , 2),
        0
      ) AS nb_mois_travailles_v
    FROM public.employes e
    LEFT JOIN public.bulletins_paie b
      ON b.employe_id = e.id
     AND b.periode >= v_date_debut
     AND b.periode <= v_date_fin
     AND COALESCE(b.source, '') IN ('calcul', 'import_excel')
     AND COALESCE(b.statut, '') <> 'brouillon'
    WHERE e.societe_id = p_societe_id
      AND e.date_arrivee IS NOT NULL
      AND e.date_arrivee <= v_date_fin
      AND (e.date_depart IS NULL OR e.date_depart >= v_date_debut)
    GROUP BY e.id, e.prenom, e.nom, e.salaire_base, e.date_arrivee, e.date_depart
  )
  SELECT
    emp_id,
    emp_nom,
    salaire_base_v,
    nb_mois_travailles_v,
    earnings_cumul,
    ROUND((earnings_cumul / 12.0 * p_mois)::NUMERIC, 2) AS provision_cumulee_v,
    (CASE
      WHEN salaire_base_v > v_seuil AND NOT v_inclut_hors_seuil THEN FALSE
      WHEN date_depart IS NOT NULL AND nb_mois_travailles_v < 8 THEN FALSE
      WHEN nb_mois_travailles_v <= 0 THEN FALSE
      ELSE TRUE
    END) AS eligible_v,
    (CASE
      WHEN salaire_base_v > v_seuil AND NOT v_inclut_hors_seuil THEN 'salaire_au_dessus_seuil'
      WHEN date_depart IS NOT NULL AND nb_mois_travailles_v < 8 THEN 'demission_avant_8_mois'
      WHEN nb_mois_travailles_v <= 0 THEN 'pas_employe_sur_periode'
      ELSE NULL
    END) AS motif_v
  FROM base
  ORDER BY emp_nom;
END $fn$;

COMMENT ON FUNCTION public.calculer_provision_eoy_ias19 IS
  'G8 Phase 2 — Provision IAS 19 EOY Bonus mensualisée (mois 1-11).
   Formule : (earnings_jan_à_mois / 12) × mois = provision cumulée à date.
   Le delta mensuel est calculé côté TS à partir du snapshot précédent.';
