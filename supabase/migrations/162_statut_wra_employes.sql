-- ============================================================
-- Migration 162 — Sprint WRA Compliance G3
--
-- Distinction worker / hors_wra au sens Section 2 du WRA 2019 :
--   "worker" = salaire de base ≤ 50 000 MUR/mois → bénéficie de
--              l'intégralité des droits WRA 2019 (AL 22j, SL 15j, VL 30j/5a, etc.)
--   "hors_wra" = salaire de base > 50 000 MUR/mois → droits via contrat
--              individuel. La Section 3(3)(a) autorise l'employeur à appliquer
--              des conditions PLUS FAVORABLES que la loi (policy société).
--
-- IDEMPOTENT : ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
-- ============================================================

-- ─── 1. Computed column statut_wra sur employes ──────────────────────
ALTER TABLE public.employes
  ADD COLUMN IF NOT EXISTS statut_wra TEXT GENERATED ALWAYS AS (
    CASE
      WHEN salaire_base IS NULL THEN 'indetermine'
      WHEN salaire_base <= 50000 THEN 'worker'
      ELSE 'hors_wra'
    END
  ) STORED;

COMMENT ON COLUMN public.employes.statut_wra IS
  'Statut WRA 2019 S.2 : "worker" si basic <= 50 000 MUR/mois (protégé par WRA intégral), "hors_wra" si > 50 000 (droits via contrat individuel + policy société). Computed automatiquement depuis salaire_base.';

-- ─── 2. Index de filtrage rapide (employés actifs) ───────────────────
CREATE INDEX IF NOT EXISTS idx_employes_statut_wra
  ON public.employes(statut_wra) WHERE date_depart IS NULL;

-- ─── 3. Policy par société pour les hors_wra ─────────────────────────
ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS policy_conges_hors_wra TEXT DEFAULT 'applique_wra_etendu';

-- Contrainte CHECK ajoutée séparément pour rester idempotente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'societes_policy_conges_hors_wra_check'
  ) THEN
    ALTER TABLE public.societes
      ADD CONSTRAINT societes_policy_conges_hors_wra_check
      CHECK (policy_conges_hors_wra IN ('applique_wra_etendu', 'contrat_uniquement'));
  END IF;
END $$;

COMMENT ON COLUMN public.societes.policy_conges_hors_wra IS
  'Policy de gestion des congés pour les employés hors WRA (basic > 50k) : "applique_wra_etendu" (défaut, recommandation legal DDS) applique 22 AL / 15 SL / 30 VL ; "contrat_uniquement" limite au contrat individuel.';

-- ─── 4. Vérification des statuts après migration ─────────────────────
DO $$
DECLARE
  v_nb_workers INTEGER;
  v_nb_hors_wra INTEGER;
  v_nb_indet INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_nb_workers
    FROM public.employes WHERE statut_wra = 'worker' AND date_depart IS NULL;
  SELECT COUNT(*) INTO v_nb_hors_wra
    FROM public.employes WHERE statut_wra = 'hors_wra' AND date_depart IS NULL;
  SELECT COUNT(*) INTO v_nb_indet
    FROM public.employes WHERE statut_wra = 'indetermine' AND date_depart IS NULL;
  RAISE NOTICE 'Migration 162 — statut_wra : % workers, % hors_wra, % indetermines (actifs).',
    v_nb_workers, v_nb_hors_wra, v_nb_indet;
END $$;
